import { ArrowLeft, Download, Eraser, Printer, RefreshCw, Sparkles, Type, Undo2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { VARIANTS, VARIANT_SETTINGS, type Stage } from '../utils/aiFlow';
import { AiPreviewError, AiPreviewUnavailable, requestAiPreview } from '../utils/aiPreview';
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
import type { StyleVariant, SubjectModule } from '../utils/prompt';
import AiDemoPanel from './AiDemoPanel';
import AiHdPanel from './AiHdPanel';

interface EditorProps {
  image: HTMLImageElement;
  onReset: () => void;
  /** Owned by the page so the header bar can recolour with it — see `STAGE_BAR`. */
  stage: Stage;
  onStage: (s: Stage) => void;
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

export default function Editor({ image, onReset, stage, onStage }: EditorProps) {
  // A4 proportions
  const A4_RATIO = 297 / 210;
  const isLandscape = image.width > image.height;

  const PREVIEW_WIDTH = isLandscape ? Math.round(595 * A4_RATIO) : 595;
  const PREVIEW_HEIGHT = isLandscape ? 595 : Math.round(595 * A4_RATIO);
  const THUMB_WIDTH = isLandscape ? Math.round(220 * A4_RATIO) : 220;
  const THUMB_HEIGHT = isLandscape ? 220 : Math.round(220 * A4_RATIO);

  const EXPORT_WIDTH = isLandscape ? 3508 : 2480;
  const EXPORT_HEIGHT = isLandscape ? 2480 : 3508;

  // Every output is a scaled copy of this one trace, so preview and print never disagree.
  const TRACE = traceSize(isLandscape);

  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const [isDrawing, setIsDrawing] = useState(false);

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
  const [subject, setSubject] = useState<SubjectModule | null>(null);
  const [otherWord, setOtherWord] = useState('');
  const [demoPreviews, setDemoPreviews] = useState<Record<StyleVariant, string> | null>(null);
  const [hdPreviews, setHdPreviews] = useState<Record<StyleVariant, string> | null>(null);
  /**
   * Set by `/api/ai-preview` when the deployment has Blob + Redis: the server has stored the
   * watermark-free originals under this id and `/api/checkout` (Task 5) starts from it. Null
   * on a bare deployment, which is also when checkout is closed.
   */
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [isGeneratingHd, setIsGeneratingHd] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<{ message: string; retryable: boolean } | null>(null);
  /** True only when the cards on screen came back from the model, not the local tracer. */
  const [usedRealAi, setUsedRealAi] = useState(false);
  /** Per-image, like the price: a new upload is a new order. */
  const [paid, setPaid] = useState(false);
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
    setSubject(null);
    setOtherWord('');
    setDemoPreviews(null);
    setHdPreviews(null);
    setOrderId(null);
    setCheckoutError(null);
    setAiError(null);
    setUsedRealAi(false);
    setPaid(false);
    setNeedsAi(false);
    setAiImage(null);
    setAiVariant(null);
    qualityKey.current = null;

    const renderThumb = async (thumbMode: LineArtMode) => {
      const data = await renderLineArtAsync(
        image,
        THUMB_WIDTH,
        THUMB_HEIGHT,
        { mode: thumbMode, ...DEFAULTS },
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
  }, [image]);

  // --- Debounced main preview processing (in worker, stale results dropped) ---
  useEffect(() => {
    const timer = setTimeout(() => {
      const seq = ++previewSeq.current;
      setIsProcessing(true);
      renderLineArtAsync(
        activeImage,
        TRACE.width,
        TRACE.height,
        { mode: activeMode, detail, thicknessMm, cleanup },
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
  }, [activeImage, activeMode, isHdEditing, detail, thicknessMm, cleanup]);

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
    const ppmm = TRACE.width / (isLandscape ? 297 : 210);
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
        { mode: attempt.mode, ...base, thicknessMm: attempt.thicknessMm },
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
      );
      setDemoPreviews(previews);
      setOrderId(newOrderId ?? null);
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

  // --- Render preview canvas: the same compose path the download uses, just smaller ---
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
  }, [processedImageData, paths, currentPath, text]);

  // --- Drawing handlers ---
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEraserMode) return;
    e.preventDefault();
    const point = getCoordinates(e);
    if (!point) return;
    setIsDrawing(true);
    setCurrentPath({ points: [point], size: eraserSize });
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isEraserMode || !currentPath) return;
    e.preventDefault();
    const point = getCoordinates(e);
    if (!point) return;
    setCurrentPath((prev) => (prev ? { ...prev, points: [...prev.points, point] } : null));
  };

  const stopDrawing = () => {
    if (!isDrawing || !currentPath) return;
    setIsDrawing(false);
    setPaths((prev) => [...prev, currentPath]);
    setCurrentPath(null);
  };

  /**
   * Export: enlarge the trace already on screen to A4 300dpi. No second trace, so the file
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
      link.download = isHdEditing ? 'ColorSketch-A4-HD.png' : 'ColorSketch-A4.png';
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
      const canvas = buildExportCanvas(); // same 300dpi output as download
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
              @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; }
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
        Thickness is measured on the printed A4 page, so what you see here is exactly what comes
        out of the printer.
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
      {isEraserMode && slider('Brush size', eraserSize, String(eraserSize), 5, 50, 1, setEraserSize)}
      {paths.length > 0 && (
        <p className="m-0 text-[11.5px] text-ink-soft">
          {paths.length} erased {paths.length === 1 ? 'stroke' : 'strokes'}
        </p>
      )}
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
    <button type="button" onClick={() => onStage('free')} className="btn btn-inline btn-ghost btn-sm">
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
        onBack={() => onStage('free')}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">
      {/* Canvas Area */}
      {/*
        items-start matters: a flex child stretches to the row height by default, which
        overrode the sheet's A4 aspect-ratio and left the page tall and half empty. It also
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
            aspectRatio: isLandscape ? '1.414 / 1' : '1 / 1.414',
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
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
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
                    style={{ aspectRatio: isLandscape ? '1.414 / 1' : '1 / 1.414' }}
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

            <div className="flex flex-col gap-3">
              <button type="button" onClick={handleDownload} disabled={busy} className="btn">
                <Download className="h-5 w-5" aria-hidden="true" />
                Download A4 — free
              </button>
              <button type="button" onClick={handlePrint} disabled={busy} className="btn btn-ghost">
                <Printer className="h-5 w-5" aria-hidden="true" />
                Print directly
              </button>
            </div>

            {/*
              The upsell belongs here and nowhere else: right after someone has seen their own
              page and can decide whether it is good enough. Asking before that is guessing.
            */}
            <div className="magic-card mt-4 p-4">
              <div className="mb-1 font-display text-[14.5px] font-bold">
                {paid
                  ? 'Your HD pages are unlocked'
                  : recommendAi
                    ? 'This one is a hard photo to trace'
                    : 'Not happy with this page?'}
              </div>
              <p className="m-0 mb-3 text-[12.5px] leading-[1.45] text-ink-soft">
                {paid
                  ? 'Both AI styles are already paid for on this image. Open the HD editor to finish either one.'
                  : recommendAi
                    ? 'It is mostly soft gradient, so there is little for the free tracer to follow. Let AI redraw it as bold, closed outlines instead.'
                    : 'Let AI redraw your photo from scratch as bold, closed outlines — the kind of page that is a pleasure to color.'}
              </p>
              <button
                type="button"
                onClick={() => onStage(paid ? 'ai-hd' : 'ai-demo')}
                className="btn btn-magic btn-sm"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {paid ? 'Open the HD editor' : 'Try the AI converter'}
              </button>
              {!paid && (
                <p className="m-0 mt-2 text-[11px] leading-[1.4] text-ink-soft">
                  Two previews, free to look at. Your free A4 download stays free either way.
                </p>
              )}
            </div>

            {startOver}
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
              {backToFree}
            </div>

            <AiHdPanel
              module={subject}
              onModule={setSubject}
              otherWord={otherWord}
              onOtherWord={setOtherWord}
              previews={hdPreviews}
              isGenerating={isGeneratingHd}
              onRegenerate={() => {
                setAiImage(null);
                setAiVariant(null);
                setAiPaths([]);
                // Both, or the effect below would just hand the old pair straight back.
                setDemoPreviews(null);
                setHdPreviews(null);
              }}
              selected={aiVariant}
              onChoose={chooseVariant}
            />

            {isHdEditing && (
              <>
                <hr className="mb-5 border-0 border-t-2 border-ink/15" />
                {adjustBlock}
                <hr className="mb-5 border-0 border-t-2 border-ink/15" />
                {eraserBlock}
                {textBlock}

                <div className="flex flex-col gap-3">
                  <button type="button" onClick={handleDownload} disabled={busy} className="btn">
                    <Download className="h-5 w-5" aria-hidden="true" />
                    Download A4 HD
                  </button>
                  <button type="button" onClick={handlePrint} disabled={busy} className="btn btn-ghost">
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
  );
}
