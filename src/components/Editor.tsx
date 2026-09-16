import { ArrowLeft, Download, Eraser, FileText, Printer, RefreshCw, Sparkles, Type, Undo2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { VARIANTS, VARIANT_SETTINGS, type Stage } from '../utils/aiFlow';
import { AiPreviewError, AiPreviewUnavailable, encodeForUpload, requestAiPreview } from '../utils/aiPreview';
import { analyzeImage, type ImageAnalysis } from '../utils/analyze';
import { startCheckout } from '../utils/checkout';
import {
  MIN_INK,
  SOLID_ERODE_DIVISOR,
  SOLID_MAX,
  measureFreeQuality,
  measureSolidity,
  needsAiRetouch,
} from '../utils/ink';
import type { Cleanup, LineArtMode } from '../utils/lineart';
import {
  composeOutput,
  renderLineArtAsync,
  sampleForAnalysis,
  traceSize,
  type ErasePath,
  type Point,
} from '../utils/pipeline';
import {
  DEFAULT_PAPER,
  PAPERS,
  PAPER_IDS,
  exportSize,
  pageMm,
  paperRatio,
  paperSpec,
  type Orientation,
  type PaperId,
} from '../utils/paper';
import type { StyleVariant, SubjectModule } from '../utils/prompt';
import { rememberOrder } from '../utils/orderRecovery';
import { stashPhoto } from '../utils/photoStash';
import { regeneratePages } from '../utils/regenerate';
import AiDemoPanel from './AiDemoPanel';
import AiHdPanel from './AiHdPanel';

interface EditorProps {
  image: HTMLImageElement;
  onReset: () => void;
  /** Owned by the page so the header bar can recolour with it — see `STAGE_BAR`. */
  stage: Stage;
  onStage: (s: Stage) => void;
  /**
   * An order that has already been paid for, when `/edit` opens the editor directly rather
   * than the funnel walking into it. Its presence is what makes the session a paid one: the
   * HD pair is not produced here, it *is* the delivered files. There is no free stage behind
   * this, so the way back out is the order link, not `onStage('free')`.
   */
  purchased?: {
    orderId: string;
    variants: Record<StyleVariant, string>;
    /** The pair from before the last redraw, kept so a worse redraw is not a loss. */
    previous?: Partial<Record<StyleVariant, string>>;
    regensLeft: number;
    /** What the order was read as, so a redraw starts from the buyer's own choice. */
    module?: SubjectModule;
    otherWord?: string;
    /** The sheet the delivered pages are already on. */
    paper?: PaperId;
    landscape?: boolean;
  } | null;
}

const MODE_LABELS: Record<LineArtMode, { emoji: string; label: string }> = {
  illustration: { emoji: '✏️', label: 'Line drawing' },
  photo: { emoji: '🖼️', label: 'Photo & art' },
};

/**
 * 2mm is what §15 asks the AI for and what a crayon needs to stay inside on A4, so the
 * free converter starts in the same place.
 */
const DEFAULTS = { detail: 50, thicknessMm: 2.0, cleanup: 'light' as Cleanup };

const CLEANUP_STEPS: Cleanup[] = ['off', 'light', 'medium', 'strong', 'heavy', 'max'];
const CLEANUP_LABELS: Record<Cleanup, string> = {
  off: 'Off',
  light: 'Light',
  medium: 'Medium',
  strong: 'Strong',
  heavy: 'Heavy',
  max: 'Max',
};

/** A generate button that returns instantly reads as "nothing happened", so give it a floor. */
const MIN_GENERATE_MS = 600;

function imageDataToUrl(data: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

export default function Editor({ image, onReset, stage, onStage, purchased }: EditorProps) {
  /**
   * The sheet is the user's choice, not the photo's.
   *
   * Orientation still *starts* from the photo, because a wide shot on a portrait sheet
   * wastes half the page. Before this that was the only rule and there was no way to
   * override it, so a landscape photo quietly produced a landscape sheet while the header
   * still promised a portrait one. Size was not a choice at all: A4 only, on a site whose
   * audience mostly has US Letter in the tray.
   */
  const [paper, setPaper] = useState<PaperId>(purchased?.paper ?? DEFAULT_PAPER);
  const [orientation, setOrientation] = useState<Orientation>(() => {
    // A purchased page was already laid out on a sheet at delivery; opening it on a
    // different one would re-frame the file the buyer actually owns.
    if (purchased?.landscape !== undefined) return purchased.landscape ? 'landscape' : 'portrait';
    return image.width > image.height ? 'landscape' : 'portrait';
  });
  const isLandscape = orientation === 'landscape';
  const SHEET_RATIO = paperRatio(paper);
  /**
   * The shape of every frame that holds a trace.
   *
   * This used to be the literal string '1 / 1.414' -- A4, left over from before the sheet was
   * a choice. On US Letter, the default, that is 9% too tall: `object-contain` letterboxed the
   * drawing inside its own frame with about 18px of dead space above and below, so the white
   * rectangle captioned "the sheet above is what prints" was not the sheet -- and the eraser,
   * which measured the pointer against the frame rather than against the drawing, landed up to
   * 18px away from the cursor, worst at the bottom of the page.
   */
  const SHEET_ASPECT = isLandscape ? `${SHEET_RATIO} / 1` : `1 / ${SHEET_RATIO}`;

  const PREVIEW_WIDTH = isLandscape ? Math.round(595 * SHEET_RATIO) : 595;
  const PREVIEW_HEIGHT = isLandscape ? 595 : Math.round(595 * SHEET_RATIO);
  const THUMB_WIDTH = isLandscape ? Math.round(220 * SHEET_RATIO) : 220;
  const THUMB_HEIGHT = isLandscape ? 220 : Math.round(220 * SHEET_RATIO);

  const { width: EXPORT_WIDTH, height: EXPORT_HEIGHT } = exportSize(paper, isLandscape);

  // Every output is a scaled copy of this one trace, so preview and print never disagree.
  const TRACE = traceSize(paper, isLandscape);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const brushRingRef = useRef<HTMLDivElement>(null);
  const thumbRefs = {
    illustration: useRef<HTMLCanvasElement>(null),
    photo: useRef<HTMLCanvasElement>(null),
  };

  const [detail, setDetail] = useState(DEFAULTS.detail);
  const [thicknessMm, setThicknessMm] = useState(DEFAULTS.thicknessMm);
  const [cleanup, setCleanup] = useState<Cleanup>(DEFAULTS.cleanup);
  const [mode, setMode] = useState<LineArtMode>('illustration');
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);

  // Eraser state
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);
  // Erasures belong to the page they were made on, so switching editors never wipes them.
  const [freePaths, setFreePaths] = useState<ErasePath[]>([]);
  const [aiPaths, setAiPaths] = useState<ErasePath[]>([]);
  const [currentPath, setCurrentPath] = useState<ErasePath | null>(null);
  /**
   * The stroke being drawn right now, held in a ref as well as in state.
   *
   * The handlers used to read it straight out of state, which is always a frame behind. A
   * dab — pointer down and up inside one frame, which is exactly what erasing looks like on
   * a phone — reached `stopDrawing` before the state had flushed, so it was dropped: nothing
   * was erased, and Undo never had a stroke to offer.
   */
  const livePath = useRef<ErasePath | null>(null);

  // Text state
  const [text, setText] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [processedImageData, setProcessedImageData] = useState<ImageData | null>(null);

  /**
   * The AI funnel, split into the three things it actually is (see `aiFlow.ts`): a free
   * tracer, free previews, and a purchased page. Each keeps its own artefacts, so stepping
   * back and forth never shows one stage's output under another stage's promise.
   */
  const [subject, setSubject] = useState<SubjectModule | null>(purchased?.module ?? null);
  const [otherWord, setOtherWord] = useState(purchased?.otherWord ?? '');
  const [demoPreviews, setDemoPreviews] = useState<Record<StyleVariant, string> | null>(null);
  // Seeded from the delivered files when this is a purchased session, which also stops the
  // "produce the HD pair" effect from running — there is nothing to produce.
  const [hdPreviews, setHdPreviews] = useState<Record<StyleVariant, string> | null>(
    purchased?.variants ?? null,
  );
  /**
   * Set by `/api/ai-preview` when the deployment has Blob + Redis: the server has stored the
   * watermark-free originals under this id and `/api/checkout` (Task 5) starts from it. Null
   * on a bare deployment, which is also when checkout is closed.
   */
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [isGeneratingHd, setIsGeneratingHd] = useState(false);
  const [regensLeft, setRegensLeft] = useState(purchased?.regensLeft ?? 0);
  const [previousPreviews, setPreviousPreviews] = useState<Partial<
    Record<StyleVariant, string>
  > | null>(purchased?.previous ?? null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<{ message: string; retryable: boolean } | null>(null);
  /** True only when the cards on screen came back from the model, not the local tracer. */
  const [usedRealAi, setUsedRealAi] = useState(false);
  /** Per-image, like the price: a new upload is a new order. */
  const [paid, setPaid] = useState(Boolean(purchased));
  const [aiImage, setAiImage] = useState<HTMLImageElement | null>(null);
  const [aiVariant, setAiVariant] = useState<StyleVariant | null>(null);

  // AI retouch callout (CONTENT_UPDATE.md §14)
  const [needsAi, setNeedsAi] = useState(false);

  /**
   * The demo pane deliberately keeps the FREE page on the canvas: the previews are the thing
   * being judged and they sit on the right, next to the price. Only a purchased, chosen
   * variant ever replaces what is being traced.
   */
  const isHdEditing = stage === 'ai-hd' && aiImage !== null;
  const activeImage = isHdEditing ? aiImage : image;
  const activeMode: LineArtMode = isHdEditing ? 'illustration' : mode;
  const paths = stage === 'ai-hd' ? aiPaths : freePaths;
  const setPaths = stage === 'ai-hd' ? setAiPaths : setFreePaths;

  const previewSeq = useRef(0);
  /**
   * Quality is judged once per image+mode, not on every slider move: the measurement is a
   * connected-component pass over the whole preview, and a callout that blinks in and out
   * while someone drags a slider would read as a glitch.
   */
  const qualityKey = useRef<string | null>(null);

  // --- Auto-detect input type + render dual thumbnails on image change ---
  useEffect(() => {
    let cancelled = false;

    const sample = sampleForAnalysis(image);
    const result = analyzeImage(sample);
    setAnalysis(result);
    setMode(result.recommendedMode);
    setFreePaths([]);
    setAiPaths([]);
    setText('');
    setSubject(purchased?.module ?? null);
    setOtherWord(purchased?.otherWord ?? '');
    setDemoPreviews(null);
    // A purchased session keeps its delivered files: this reset exists to clear one
    // image's work before the next, and the bought pages are not that work.
    setHdPreviews(purchased?.variants ?? null);
    setOrderId(null);
    setCheckoutError(null);
    setAiError(null);
    setUsedRealAi(false);
    setPaid(Boolean(purchased));
    setNeedsAi(false);
    setAiImage(null);
    setAiVariant(null);
    qualityKey.current = null;

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  /**
   * The two style thumbnails, drawn on their own schedule rather than as part of the
   * per-image reset above.
   *
   * A canvas is wiped whenever its width or height attribute changes, and both follow the
   * chosen sheet — so picking A4, or turning the page landscape, blanked both cards and left
   * them blank until the next upload, because the only effect that filled them was keyed on
   * the image. Stepping out to the AI screen and back did the same thing by a different
   * route: the cards unmount with the free sidebar and come back empty. Redrawing whenever
   * the canvases can have been reset covers both.
   */
  useEffect(() => {
    if (stage !== 'free') return;
    let cancelled = false;

    const renderThumb = async (thumbMode: LineArtMode) => {
      const data = await renderLineArtAsync(
        image,
        THUMB_WIDTH,
        THUMB_HEIGHT,
        { mode: thumbMode, ...DEFAULTS, paper },
        true,
      );
      if (cancelled) return;
      const canvas = thumbRefs[thumbMode].current;
      canvas?.getContext('2d')?.putImageData(data, 0, 0);
    };

    renderThumb('illustration').catch(console.error);
    renderThumb('photo').catch(console.error);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, stage, paper, THUMB_WIDTH, THUMB_HEIGHT]);

  // --- Debounced main preview processing (in worker, stale results dropped) ---
  useEffect(() => {
    const timer = setTimeout(() => {
      const seq = ++previewSeq.current;
      setIsProcessing(true);
      renderLineArtAsync(
        activeImage,
        TRACE.width,
        TRACE.height,
        { mode: activeMode, detail, thicknessMm, cleanup, paper },
        true,
      )
        .then((data) => {
          if (previewSeq.current !== seq) return; // stale
          setProcessedImageData(data);

          // Only the free page is judged; the AI page is line art by construction.
          if (!isHdEditing && qualityKey.current !== activeMode) {
            qualityKey.current = activeMode;
            setNeedsAi(needsAiRetouch(measureFreeQuality(data)));
          }
        })
        .catch(console.error)
        .finally(() => {
          if (previewSeq.current === seq) setIsProcessing(false);
        });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImage, activeMode, isHdEditing, detail, thicknessMm, cleanup, paper, isLandscape]);

  /**
   * Whether the AI editor is worth pointing at. The entry button is always available — anyone
   * may want a richer page — but it only takes the loud red treatment when the free result
   * came out near-empty or broken into short strokes.
   */
  const recommendAi = analysis?.recommendedMode === 'photo' && needsAi;

  /**
   * Builds the Simple / Detailed pair.
   *
   * Phase 2 replaces the body with one POST to `/api/ai-preview`; until then it is the free
   * pipeline at two line weights, and every surface that shows the result says so. The paid
   * pair is traced at full TRACE size so the page someone bought is genuinely print-sharp,
   * while the free previews stay thumbnail-sized — that difference is the product.
   */
  /**
   * Which tracer the variants run through.
   *
   * This used to be hardwired to `photo`, which meant the two cards ignored everything the
   * analyzer had already worked out and pushed *drawings* through Canny. On a cartoon with
   * flat dark fills that is the worst possible choice: edge detection lights up all over the
   * fill, dilation welds it together, and the subject arrives as a black mass — while the
   * free editor beside it, using the recommended mode, rendered the same image cleanly.
   * The cards now follow the same decision the free page does.
   */
  const variantMode: LineArtMode =
    subject === 'artwork' ? 'illustration' : (analysis?.recommendedMode ?? 'photo');

  /**
   * Renders one variant and rejects results that have flooded into solid shapes.
   *
   * A dark subject is the failure case: whichever tracer is wrong for it returns the subject
   * as a black mass rather than outlines, and nothing about the page says so — it just looks
   * broken. Thinning the lines does not fix it, because the mass is not made of lines; the
   * other tracer usually is the fix, so that is what gets tried first. Only after both modes
   * have flooded is the line weight stepped down.
   */
  const renderVariant = async (v: StyleVariant): Promise<string> => {
    const base = VARIANT_SETTINGS[v];
    const other: LineArtMode = variantMode === 'photo' ? 'illustration' : 'photo';

    // Erosion radius, in pixels at trace scale: a stroke has to actually vanish under it.
    const ppmm = TRACE.width / pageMm(paper, isLandscape).width;
    const erode = Math.max(2, Math.round((base.thicknessMm * ppmm) / SOLID_ERODE_DIVISOR));

    const attempts: { mode: LineArtMode; thicknessMm: number }[] = [
      { mode: variantMode, thicknessMm: base.thicknessMm },
      { mode: other, thicknessMm: base.thicknessMm },
      { mode: variantMode, thicknessMm: Math.max(0.6, base.thicknessMm * 0.6) },
    ];

    // Least-flooded among the usable ones, and the inkiest overall. The second matters when
    // every attempt came out near-empty: returning a blank sheet because nothing scored well
    // is worse than returning the sparse-but-real page.
    let leastSolid: { url: string; solidity: number } | null = null;
    let inkiest: { url: string; ink: number } | null = null;

    for (const attempt of attempts) {
      // Always the full trace, never a thumbnail-sized second pass. pipeline.ts's own rule:
      // re-running edge detection at a smaller size gives a visibly different, worse page.
      // The card just scales this down; the purchase keeps it at full resolution.
      const data = await renderLineArtAsync(
        image,
        TRACE.width,
        TRACE.height,
        { mode: attempt.mode, ...base, thicknessMm: attempt.thicknessMm, paper },
        true,
      );

      const { ink } = measureFreeQuality(data);
      const url = imageDataToUrl(data);
      if (!inkiest || ink > inkiest.ink) inkiest = { url, ink };
      if (ink < MIN_INK) continue; // nothing on the sheet — cannot judge it, cannot show it

      const solidity = measureSolidity(data, erode);
      if (solidity <= SOLID_MAX) return url;
      if (!leastSolid || solidity < leastSolid.solidity) leastSolid = { url, solidity };
    }

    return leastSolid?.url ?? inkiest!.url;
  };

  const renderVariantSet = async (): Promise<Record<StyleVariant, string>> => {
    const [simple, detailed] = await Promise.all(VARIANTS.map(renderVariant));
    return { simple, detailed };
  };

  /**
   * Real AI first, local stand-in second.
   *
   * `AiPreviewUnavailable` means this host has no `/api/ai-preview` — a plain dev server, or
   * a deployment without the key. That is an expected state, not a failure, so it falls
   * through to the tracer and `usedRealAi` stays false, which is what keeps the "these are
   * not AI output" banner honest. A real error from a real endpoint is different: it is
   * surfaced, because the user asked for something and it did not happen.
   */
  const generateDemo = async (turnstileToken?: string) => {
    setIsGeneratingDemo(true);
    setAiError(null);
    try {
      const { previews, orderId: newOrderId } = await requestAiPreview(
        image,
        subject ?? 'auto',
        otherWord,
        turnstileToken,
        paper,
        isLandscape,
      );
      setDemoPreviews(previews);
      setOrderId(newOrderId ?? null);
      // Leave a breadcrumb so a buyer who closes the tab after paying can be brought back.
      if (newOrderId) {
        rememberOrder(newOrderId);
        // Redrawing after payment needs this photo again, and checkout leaves the site. It
        // stays on this device only — see photoStash.ts for why the server keeps no copy.
        const upload = encodeForUpload(image);
        void stashPhoto(newOrderId, upload.base64, upload.mimeType);
      }
      setUsedRealAi(true);
    } catch (e) {
      if (!(e instanceof AiPreviewUnavailable)) {
        setAiError({
          message: e instanceof Error ? e.message : 'AI retouch failed.',
          retryable: e instanceof AiPreviewError ? e.retryable : true,
        });
        setIsGeneratingDemo(false);
        return;
      }
      try {
        const [result] = await Promise.all([
          renderVariantSet(),
          new Promise((r) => setTimeout(r, MIN_GENERATE_MS)),
        ]);
        setDemoPreviews(result);
        setOrderId(null);
        setUsedRealAi(false);
      } catch (err) {
        console.error('Preview generation failed', err);
        setDemoPreviews(null);
      }
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  // The HD pair is produced on entry to the paid stage, and again whenever it is cleared.
  useEffect(() => {
    if (stage !== 'ai-hd' || hdPreviews || isGeneratingHd) return;
    let cancelled = false;

    /*
     * Reuse rather than re-run. PHASE2_GUIDE.md's failure design turns on the paid step
     * *issuing* the file the preview step already produced — never generating a second time,
     * so a dead AI provider can't strand a paid order. The local stand-in honours the same
     * shape: what was previewed is what gets unlocked.
     */
    if (demoPreviews) {
      setHdPreviews(demoPreviews);
      return;
    }

    setIsGeneratingHd(true);
    Promise.all([renderVariantSet(), new Promise((r) => setTimeout(r, MIN_GENERATE_MS))])
      .then(([result]) => {
        if (!cancelled) setHdPreviews(result);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsGeneratingHd(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, hdPreviews, demoPreviews]);

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    setCheckoutError(null);
    try {
      const outcome = await startCheckout(orderId);
      if (outcome.status === 'paid') {
        // mock: unlock the HD stage in place (no server round trip to wait on).
        setPaid(true);
        setHdPreviews(null);
        setAiImage(null);
        setAiVariant(null);
        setAiPaths([]);
        onStage('ai-hd');
      } else if (outcome.status === 'unavailable') {
        setCheckoutError('Checkout is not open yet. Nothing was charged.');
      } else if (outcome.status === 'error') {
        setCheckoutError(outcome.message);
      }
      // 'redirecting' — the browser is already leaving for Lemon Squeezy / /thanks.
    } finally {
      setIsCheckingOut(false);
    }
  };

  /*
   * --- Render preview canvas: the same compose path the download uses, just smaller ---
   *
   * `stage` and the sheet size are dependencies because both can empty the canvas without
   * changing anything this draws: the AI screen replaces the whole split layout, so coming
   * back mounts a fresh blank canvas, and changing paper rewrites its width and height, which
   * wipes it. Either way the trace is still valid and simply has to be put back on.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedImageData) return;
    const composed = composeOutput(processedImageData, PREVIEW_WIDTH, PREVIEW_HEIGHT, {
      paths: currentPath ? [...paths, currentPath] : paths,
      text,
      previewWidth: PREVIEW_WIDTH,
    });
    canvas.getContext('2d')?.drawImage(composed, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedImageData, paths, currentPath, text, stage, PREVIEW_WIDTH, PREVIEW_HEIGHT]);

  // --- Drawing handlers ---

  const clientPoint = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0];
      return t ? { x: t.clientX, y: t.clientY } : null;
    }
    return { x: e.clientX, y: e.clientY };
  };

  /**
   * Where the drawing actually sits inside the canvas element, and how large it is drawn.
   *
   * `object-contain` fits the bitmap inside the element and centres it, so the element's own
   * box is the same rectangle as the drawing only when the two aspect ratios agree. Measuring
   * this rather than assuming it means the pointer lands where it is pointed even if some
   * later layout change opens a gap again.
   */
  const drawnBox = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const width = canvas.width * scale;
    const height = canvas.height * scale;
    return {
      scale,
      width,
      height,
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      rect,
    };
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const box = drawnBox();
    const at = clientPoint(e);
    if (!box || !at) return null;
    return {
      x: (at.x - box.left) / box.width,
      y: (at.y - box.top) / box.height,
    };
  };

  /**
   * Parks an outline of the brush under the pointer, at the size it will actually erase.
   *
   * The eraser is measured in trace pixels and the canvas is displayed at roughly half that,
   * so a brush set to 20 covers about 9px on screen -- small enough beside a crosshair that a
   * stroke which did land read as one that had not. Showing the footprint is what makes the
   * size slider mean something. Written straight to the node: this fires on every pointer
   * move and has no bearing on what is drawn.
   */
  const moveBrushRing = (e: React.MouseEvent | React.TouchEvent) => {
    const ring = brushRingRef.current;
    const box = drawnBox();
    const at = clientPoint(e);
    if (!ring || !box || !at) return;
    const d = eraserSize * box.scale;
    ring.style.width = `${d}px`;
    ring.style.height = `${d}px`;
    ring.style.left = `${at.x - box.rect.left}px`;
    ring.style.top = `${at.y - box.rect.top}px`;
    ring.style.opacity = '1';
  };

  const hideBrushRing = () => {
    const ring = brushRingRef.current;
    if (ring) ring.style.opacity = '0';
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEraserMode) return;
    moveBrushRing(e);
    e.preventDefault();
    const point = getCoordinates(e);
    if (!point) return;
    const path: ErasePath = { points: [point], size: eraserSize };
    livePath.current = path;
    setCurrentPath(path);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (isEraserMode) moveBrushRing(e);
    if (!isEraserMode || !livePath.current) return;
    e.preventDefault();
    const point = getCoordinates(e);
    if (!point) return;
    const path: ErasePath = {
      ...livePath.current,
      points: [...livePath.current.points, point],
    };
    livePath.current = path;
    setCurrentPath(path);
  };

  const stopDrawing = () => {
    const path = livePath.current;
    if (!path) return;
    livePath.current = null;
    setPaths((prev) => [...prev, path]);
    setCurrentPath(null);
  };

  /**
   * Export: enlarge the trace on screen onto the chosen sheet at 300dpi. No second trace, so the file
   * is the preview — same lines, same density, same millimetre thickness.
   */
  const buildExportCanvas = (): HTMLCanvasElement => {
    if (!processedImageData) throw new Error('Nothing to export yet');
    return composeOutput(processedImageData, EXPORT_WIDTH, EXPORT_HEIGHT, {
      paths,
      text,
      previewWidth: PREVIEW_WIDTH,
    });
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const canvas = buildExportCanvas();
      const link = document.createElement('a');
      const sheet = paperSpec(paper).id === 'a4' ? 'A4' : 'Letter';
      link.download = isHdEditing ? `ColorSketch-${sheet}-HD.png` : `ColorSketch-${sheet}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Export failed', e);
      alert('Failed to export image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async () => {
    setIsExporting(true);
    try {
      const canvas = buildExportCanvas(); // the same file the download button produces
      const dataUrl = canvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow pop-ups to print.');
        return;
      }
      printWindow.document.write(`
        <html>
          <head>
            <title>Print ColorSketch</title>
            <style>
              body { margin: 0; padding: 0; }
              @page { size: ${paperSpec(paper).cssSize} ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; }
              img { width: 100%; height: 100%; object-fit: contain; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (e) {
      console.error('Print failed', e);
      alert('Failed to prepare print. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetAdjustments = () => {
    setDetail(DEFAULTS.detail);
    setThicknessMm(DEFAULTS.thicknessMm);
    setCleanup(DEFAULTS.cleanup);
  };

  /**
   * Takes a purchased page on as the new working image. It arrives as finished line art, so
   * it goes down the `illustration` path and every handle keeps working — the AI result is
   * adjusted with the same controls as the free one, not on a separate screen.
   */
  const chooseVariant = (variant: StyleVariant, dataUrl: string) => {
    if (variant === aiVariant) return;
    const img = new Image();
    /*
     * The purchased pages are served from Blob, so loading one without this taints the
     * canvas: every `getImageData` under it throws, the tracer stops producing frames, and
     * the editor silently freezes on whatever it last drew — the handles appear dead and the
     * style never changes. Blob sends `Access-Control-Allow-Origin: *`, so asking for the
     * image this way costs nothing. Harmless on the local stand-in's data: URLs.
     */
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setAiVariant(variant);
      setAiImage(img);
      setAiPaths([]);
      resetAdjustments();
    };
    img.onerror = () => alert('Could not open that version. Please try again.');
    img.src = dataUrl;
  };

  /** Undo one eraser stroke on whichever page is open. */
  const undoErase = () => setPaths((prev) => prev.slice(0, -1));

  const busy = isProcessing || isExporting;

  const isEdited =
    detail !== DEFAULTS.detail ||
    thicknessMm !== DEFAULTS.thicknessMm ||
    cleanup !== DEFAULTS.cleanup;

  const slider = (
    label: string,
    value: number,
    display: string,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ) => (
    <div className="mb-4">
      <div className="mb-2 flex justify-between text-[13.5px] font-medium">
        <label htmlFor={`slider-${label}`}>{label}</label>
        <span className="text-ink-soft">{display}</span>
      </div>
      <input
        id={`slider-${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );

  // Both editors offer exactly the same handles, so they are built once and rendered twice.
  const adjustBlock = (
    <>
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="m-0 font-display text-sm font-bold">Adjust</h4>
        {isEdited && (
          <button
            type="button"
            onClick={resetAdjustments}
            className="text-xs font-bold text-ink-soft underline decoration-2 underline-offset-2 hover:text-ink"
          >
            Reset
          </button>
        )}
      </div>

      {slider(
        'Line thickness',
        thicknessMm,
        `${thicknessMm.toFixed(1)} mm`,
        0.5,
        3,
        0.1,
        setThicknessMm,
      )}
      {slider('Detail', detail, `${detail}`, 0, 100, 1, setDetail)}

      <div className="mb-4">
        <div className="mb-2 flex justify-between text-[13.5px] font-medium">
          <label htmlFor="slider-cleanup">Clean up</label>
          <span className="text-ink-soft">{CLEANUP_LABELS[cleanup]}</span>
        </div>
        <input
          id="slider-cleanup"
          type="range"
          min={0}
          max={CLEANUP_STEPS.length - 1}
          step={1}
          value={CLEANUP_STEPS.indexOf(cleanup)}
          onChange={(e) => setCleanup(CLEANUP_STEPS[Number(e.target.value)])}
          aria-valuetext={CLEANUP_LABELS[cleanup]}
        />
      </div>

      <p className="m-0 mb-5 text-[11.5px] leading-[1.4] text-ink-soft">
        Thickness is measured on the printed page, so what you see here is exactly what comes out of
        the printer.
      </p>
    </>
  );

  const eraserBlock = (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="m-0 flex items-center gap-2 font-display text-sm font-bold">
          <Eraser className="h-4 w-4" aria-hidden="true" />
          Eraser
        </h4>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="chip"
            onClick={undoErase}
            disabled={paths.length === 0}
            style={paths.length === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            title="Undo the last erased stroke"
          >
            <Undo2 className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Undo
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={isEraserMode}
            onClick={() => setIsEraserMode(!isEraserMode)}
          >
            {isEraserMode ? 'Active' : 'Enable'}
          </button>
        </div>
      </div>
      {isEraserMode &&
        slider('Brush size', eraserSize, String(eraserSize), 5, 50, 1, setEraserSize)}
      {paths.length > 0 && (
        <p className="m-0 text-[11.5px] text-ink-soft">
          {paths.length} erased {paths.length === 1 ? 'stroke' : 'strokes'}
        </p>
      )}
    </div>
  );

  /**
   * Paper sits with the download buttons rather than up with the tracing controls, because
   * it is an output decision. Changing either row reflows the preview immediately — what is
   * on screen is the sheet that prints, which is the whole point of the mm-based thickness.
   */
  const paperBlock = (
    <div className="mb-6">
      <h4 className="m-0 mb-2 flex items-center gap-2 font-display text-sm font-bold">
        <FileText className="h-4 w-4" aria-hidden="true" />
        Paper
      </h4>
      <div className="mb-2 grid grid-cols-2 gap-2" role="group" aria-label="Paper size">
        {PAPER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPaper(id)}
            aria-pressed={paper === id}
            className={`rounded-lg border-2 border-ink px-3 py-2 text-[13px] font-bold transition-colors ${
              paper === id ? 'bg-ink text-white' : 'bg-white text-ink'
            }`}
          >
            {PAPERS[id].label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Orientation">
        {(['portrait', 'landscape'] as Orientation[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOrientation(o)}
            aria-pressed={orientation === o}
            className={`rounded-lg border-2 border-ink px-3 py-2 text-[13px] font-bold capitalize transition-colors ${
              orientation === o ? 'bg-ink text-white' : 'bg-white text-ink'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
      <p className="m-0 mt-2 text-xs text-ink-soft">
        Fitted to {PAPERS[paper].label}, {orientation}. The sheet above is what prints.
      </p>
    </div>
  );

  const textBlock = (
    <div className="mb-6">
      <h4 className="m-0 mb-2 flex items-center gap-2 font-display text-sm font-bold">
        <Type className="h-4 w-4" aria-hidden="true" />
        Add text (optional)
      </h4>
      <input
        className="ink-input"
        type="text"
        placeholder="e.g. Happy Birthday Leo!"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Caption printed at the bottom of the page"
      />
    </div>
  );

  const backToFree = (
    <button
      type="button"
      onClick={() => onStage('free')}
      className="btn btn-inline btn-ghost btn-sm"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Free editor
    </button>
  );

  const startOver = (
    <div className="mt-5 text-center">
      <button
        type="button"
        onClick={onReset}
        className="text-xs font-bold text-ink-soft underline decoration-2 underline-offset-2 hover:text-ink"
      >
        Start over with a different image
      </button>
    </div>
  );

  /**
   * The upsell, across the foot of the whole panel rather than down the end of the sidebar.
   *
   * Its place in the flow was right — after someone has seen their own page and can judge
   * whether it is good enough — but its place on the screen was not. In a 340px column,
   * under the download buttons, it landed below the fold of a panel whose other half is an
   * empty dot grid: the loudest offer on the page was the least visible thing on it. The
   * same card spanning both columns is read without scrolling and has room to say what it
   * is on one line.
   */
  const aiCallout = (
    <div className="magic-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <div className="mb-1 font-display text-[16.5px] font-bold">
          {paid
            ? 'Your HD pages are unlocked'
            : recommendAi
              ? 'This one is a hard photo to trace'
              : 'Not happy with this page?'}
        </div>
        <p className="m-0 max-w-[62ch] text-[13px] leading-[1.5] text-ink-soft">
          {paid
            ? 'Both AI styles are already paid for on this image. Open the HD editor to finish either one.'
            : recommendAi
              ? 'It is mostly soft gradient, so there is little for the free tracer to follow. Let AI redraw it as bold, closed outlines instead.'
              : 'Let AI redraw your photo from scratch as bold, closed outlines — the kind of page that is a pleasure to color.'}
        </p>
      </div>
      <div className="shrink-0 sm:text-right">
        <button
          type="button"
          onClick={() => onStage(paid ? 'ai-hd' : 'ai-demo')}
          className="btn btn-magic btn-inline"
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          {paid ? 'Open the HD editor' : 'Try the AI converter'}
        </button>
        {!paid && (
          <p className="m-0 mt-2 text-[11.5px] leading-[1.4] text-ink-soft">
            Two previews, free to look at.
            <br className="hidden sm:inline" /> Your free download stays free either way.
          </p>
        )}
      </div>
    </div>
  );

  /*
   * The demo stage is its own screen, not the editor's canvas + sidebar split (§28).
   * Nothing on it is being edited, so the big canvas had nothing to show but the free page —
   * which competes with the previews instead of supporting them. Full width, one column.
   */
  if (stage === 'ai-demo') {
    return (
      <AiDemoPanel
        module={subject}
        onModule={setSubject}
        otherWord={otherWord}
        onOtherWord={setOtherWord}
        previews={demoPreviews}
        isGenerating={isGeneratingDemo}
        onGenerate={generateDemo}
        onCheckout={handleCheckout}
        isCheckingOut={isCheckingOut}
        checkoutError={checkoutError}
        aiError={aiError}
        usedRealAi={usedRealAi}
        sourceUrl={image.src}
        paper={paper}
        landscape={isLandscape}
        onBack={() => onStage('free')}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">
        {/* Canvas Area */}
        {/*
        items-start matters: a flex child stretches to the row height by default, which
        overrode the sheet's aspect-ratio and left the page tall and half empty. It also
        threw the eraser off, since pointer coordinates are normalized against the element
        while the drawing sits letterboxed inside it.
      */}
        <div className="dot-grid relative flex items-start justify-center p-6 sm:p-8">
          {busy && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin" aria-hidden="true" />
                <span className="text-sm font-bold">
                  {isExporting ? 'Preparing full-resolution file…' : 'Processing…'}
                </span>
              </div>
            </div>
          )}

          <div
            className="relative rounded-md border-[2.5px] border-ink bg-white"
            style={{
              width: '100%',
              maxWidth: isLandscape ? '620px' : '440px',
              aspectRatio: SHEET_ASPECT,
              boxShadow: '6px 6px 0 rgba(20,20,20,.14)',
            }}
          >
            <canvas
              ref={canvasRef}
              width={PREVIEW_WIDTH}
              height={PREVIEW_HEIGHT}
              className={`h-full w-full object-contain ${isEraserMode ? 'cursor-crosshair' : 'cursor-default'}`}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={() => {
                stopDrawing();
                hideBrushRing();
              }}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={() => {
                stopDrawing();
                hideBrushRing();
              }}
            />

            {/* The brush footprint. Pointer-transparent, so it never intercepts a stroke. */}
            {isEraserMode && (
              <div
                ref={brushRingRef}
                aria-hidden="true"
                className="pointer-events-none absolute rounded-full border-2 border-[color:var(--crayon-red)] opacity-0"
                style={{ transform: 'translate(-50%, -50%)', transition: 'opacity 120ms' }}
              />
            )}
          </div>
        </div>

        {/* Controls Area — exactly one of the three stages, never two stacked */}
        <div className="border-t-[2.5px] border-ink p-5 lg:border-l-[2.5px] lg:border-t-0">
          {stage === 'free' && (
            <>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h4 className="m-0 font-display text-sm font-bold">Free editor</h4>
                {/* Quiet doorway. The loud invitation lives beside the download, where someone
                  has actually seen their page and can judge it. */}
                <button
                  type="button"
                  onClick={() => onStage(paid ? 'ai-hd' : 'ai-demo')}
                  className="btn btn-inline btn-ghost btn-sm"
                  title={paid ? 'Back to your HD page' : 'Open the AI page editor'}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {paid ? 'HD page' : 'AI preview'}
                </button>
              </div>

              <h4 className="m-0 mb-3 font-display text-sm font-bold">Pick a style</h4>
              <div className="mb-5 grid grid-cols-2 gap-3">
                {(['illustration', 'photo'] as LineArtMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className="overflow-hidden rounded-lg border-[2.5px] border-ink bg-white text-left"
                    style={mode === m ? { boxShadow: '4px 4px 0 var(--crayon-green)' } : undefined}
                  >
                    <canvas
                      ref={thumbRefs[m]}
                      width={THUMB_WIDTH}
                      height={THUMB_HEIGHT}
                      className="w-full bg-white"
                      style={{ aspectRatio: SHEET_ASPECT }}
                    />
                    <span
                      className={`flex items-center justify-between border-t-[2.5px] border-ink px-2 py-1.5 text-[11.5px] font-bold ${
                        mode === m ? 'text-white' : 'text-ink'
                      }`}
                      style={mode === m ? { background: 'var(--crayon-green)' } : undefined}
                    >
                      <span>
                        {MODE_LABELS[m].emoji} {MODE_LABELS[m].label}
                      </span>
                      {analysis?.recommendedMode === m && (
                        <span className="text-[9px] uppercase tracking-wider opacity-80">Auto</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>

              {adjustBlock}
              <hr className="mb-5 border-0 border-t-2 border-ink/15" />
              {eraserBlock}
              {textBlock}
              {paperBlock}

              <div className="flex flex-col gap-3">
                <button type="button" onClick={handleDownload} disabled={busy} className="btn">
                  <Download className="h-5 w-5" aria-hidden="true" />
                  Download — free
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={busy}
                  className="btn btn-ghost"
                >
                  <Printer className="h-5 w-5" aria-hidden="true" />
                  Print directly
                </button>
              </div>
            </>
          )}

          {stage === 'ai-hd' && (
            <>
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h4 className="m-0 font-display text-sm font-bold">✦ AI HD editor</h4>
                  {aiVariant && (
                    <span className="text-xs text-ink-soft">
                      Style: {aiVariant === 'simple' ? 'Simple' : 'Detailed'}
                    </span>
                  )}
                </div>
                {!purchased && backToFree}
              </div>

              <AiHdPanel
                module={subject}
                onModule={setSubject}
                otherWord={otherWord}
                onOtherWord={setOtherWord}
                previews={hdPreviews}
                isGenerating={isGeneratingHd}
                regensLeft={purchased ? regensLeft : null}
                regenError={regenError}
                previous={previousPreviews}
                onRegenerate={async () => {
                  setRegenError(null);
                  setAiImage(null);
                  setAiVariant(null);
                  setAiPaths([]);

                  if (!purchased) {
                    // Mock/local session: clear both, or the effect below would just hand the
                    // old pair straight back.
                    setDemoPreviews(null);
                    setHdPreviews(null);
                    return;
                  }

                  setIsGeneratingHd(true);
                  try {
                    const outcome = await regeneratePages(
                      purchased.orderId,
                      subject ?? 'auto',
                      otherWord,
                    );
                    if (outcome.status === 'ok') {
                      setPreviousPreviews(outcome.previous);
                      setHdPreviews(outcome.variants as Record<StyleVariant, string>);
                      setRegensLeft(outcome.regensLeft);
                    } else if (outcome.status === 'no-photo') {
                      setRegenError(
                        'We only keep your photo on the device you bought from, for a day. Open this link there, or upload the photo again to redraw.',
                      );
                    } else {
                      setRegenError(outcome.message);
                    }
                  } finally {
                    setIsGeneratingHd(false);
                  }
                }}
                selected={aiVariant}
                onChoose={chooseVariant}
                paper={paper}
                landscape={isLandscape}
              />

              {isHdEditing && (
                <>
                  <hr className="mb-5 border-0 border-t-2 border-ink/15" />
                  {adjustBlock}
                  <hr className="mb-5 border-0 border-t-2 border-ink/15" />
                  {eraserBlock}
                  {textBlock}
                  {paperBlock}

                  <div className="flex flex-col gap-3">
                    <button type="button" onClick={handleDownload} disabled={busy} className="btn">
                      <Download className="h-5 w-5" aria-hidden="true" />
                      Download HD
                    </button>
                    <button
                      type="button"
                      onClick={handlePrint}
                      disabled={busy}
                      className="btn btn-ghost"
                    >
                      <Printer className="h-5 w-5" aria-hidden="true" />
                      Print directly
                    </button>
                  </div>
                </>
              )}

              {startOver}
            </>
          )}
        </div>
      </div>

      {/*
        The foot of the panel, across its whole width. Only the free stage shows it: once a
        page is bought the offer is behind them, and the paid sidebar carries its own way out.
      */}
      {stage === 'free' && (
        <div className="border-t-[2.5px] border-ink p-5 sm:p-6">
          {aiCallout}
          {startOver}
        </div>
      )}
    </>
  );
}
