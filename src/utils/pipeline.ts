import type { LineArtOptions, RawImage } from './lineart';
import { processInWorker } from './workerClient';

export type Point = { x: number; y: number };
export type ErasePath = { points: Point[]; size: number };

export interface ComposeOptions {
  paths: ErasePath[];
  text: string;
  /** Preview width the eraser sizes were authored against. */
  previewWidth: number;
}

/**
 * Long edge of the single canonical trace.
 *
 * Line art is traced exactly once, at this size, and everything else is a scaled copy of it:
 * the on-screen preview scales it down, the A4 300dpi export scales it up. Re-running edge
 * detection at export size instead produced a visibly different page — the same settings gave
 * 13% ink on screen and 2.7% in the downloaded file, because upscaling the source first
 * smears the gradients the detector is looking for. One trace, one result, everywhere.
 *
 * 1754px is A4 at 150dpi: enough detail to hold up when doubled to 300dpi, and roughly a
 * quarter of the work of tracing at full export size.
 */
export const TRACE_LONG_EDGE = 1754;

export function traceSize(isLandscape: boolean) {
  const short = Math.round(TRACE_LONG_EDGE / 1.4142);
  return isLandscape
    ? { width: TRACE_LONG_EDGE, height: short }
    : { width: short, height: TRACE_LONG_EDGE };
}

/** Draws the source image onto a white canvas at target size (contain fit), with stepwise upscaling for low-res inputs. */
export function rasterizeSource(
  image: HTMLImageElement,
  width: number,
  height: number,
  enhanceResolution: boolean,
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2d context');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let source: HTMLCanvasElement | HTMLImageElement = image;
  if (enhanceResolution && (image.width < width / 2 || image.height < height / 2)) {
    let curWidth = image.width;
    let curHeight = image.height;
    let curCanvas = document.createElement('canvas');
    curCanvas.width = curWidth;
    curCanvas.height = curHeight;
    curCanvas.getContext('2d')!.drawImage(image, 0, 0);

    while (curWidth < width / 2 && curHeight < height / 2) {
      const nextCanvas = document.createElement('canvas');
      nextCanvas.width = curWidth * 2;
      nextCanvas.height = curHeight * 2;
      const nextCtx = nextCanvas.getContext('2d')!;
      nextCtx.imageSmoothingEnabled = true;
      nextCtx.imageSmoothingQuality = 'high';
      nextCtx.drawImage(curCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
      curCanvas = nextCanvas;
      curWidth = nextCanvas.width;
      curHeight = nextCanvas.height;
    }
    source = curCanvas;
  }

  const imgRatio = source.width / source.height;
  const canvasRatio = width / height;
  let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;
  if (imgRatio > canvasRatio) {
    drawWidth = width;
    drawHeight = width / imgRatio;
    offsetX = 0;
    offsetY = (height - drawHeight) / 2;
  } else {
    drawHeight = height;
    drawWidth = height * imgRatio;
    offsetX = (width - drawWidth) / 2;
    offsetY = 0;
  }
  ctx.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);

  return ctx.getImageData(0, 0, width, height);
}

/** Rasterize + line-art in the worker. */
export async function renderLineArtAsync(
  image: HTMLImageElement,
  width: number,
  height: number,
  options: LineArtOptions,
  enhanceResolution: boolean,
): Promise<ImageData> {
  const source = rasterizeSource(image, width, height, enhanceResolution);
  return processInWorker(source, options);
}

/** Downscaled RawImage sample of the input for classification (never full resolution). */
export function sampleForAnalysis(image: HTMLImageElement, maxDim = 256): RawImage {
  const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { data: data.data, width: w, height: h };
}

/** Wraps an ImageData in a canvas so it can be drawn scaled. */
export function toCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return canvas;
}

/**
 * Scales the canonical trace to a target size and snaps the result back to pure black and white.
 *
 * Smooth scaling leaves grey along every edge; a coloring page must be two-tone, and a printer
 * would otherwise dither those greys into muddy stipple. The 0.62 cut sits high enough that
 * lines keep their weight after enlargement rather than eroding.
 */
export function scaleLineArt(trace: ImageData, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(toCanvas(trace), 0, 0, width, height);

  const img = ctx.getImageData(0, 0, width, height);
  const px = img.data;
  const cut = 255 * 0.62;
  for (let i = 0; i < width * height; i++) {
    const v = px[i * 4] < cut ? 0 : 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Composes the trace + eraser paths + caption text at the requested output size.
 * Preview, PNG download and print all come through here, so all three agree.
 */
export function composeOutput(
  trace: ImageData,
  width: number,
  height: number,
  opts: ComposeOptions,
): HTMLCanvasElement {
  const canvas = scaleLineArt(trace, width, height);
  const ctx = canvas.getContext('2d')!;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'white';
  const scaleRatio = width / opts.previewWidth;

  for (const path of opts.paths) {
    if (path.points.length === 0) continue;
    ctx.lineWidth = path.size * scaleRatio;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x * width, path.points[0].y * height);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x * width, path.points[i].y * height);
    }
    ctx.stroke();
  }

  if (opts.text) {
    ctx.fillStyle = 'black';
    const fontPx = Math.round(width * 0.04);
    ctx.font = `bold ${fontPx}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(opts.text, width / 2, height - fontPx * 1.6);
  }

  return canvas;
}
