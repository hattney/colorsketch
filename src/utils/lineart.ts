// Pure pixel processing. No DOM APIs — safe to run inside a Web Worker.

export type LineArtMode = 'illustration' | 'photo';

export type Cleanup = 'off' | 'light' | 'medium' | 'strong' | 'heavy' | 'max';

export interface LineArtOptions {
  mode: LineArtMode;
  /** 0–100. Higher = more lines survive. */
  detail: number;
  /**
   * Printed line thickness in millimetres on A4.
   *
   * Not pixels. The dilation radius is derived from the canvas size, so the preview, the PNG
   * download and the print all put the same physical thickness on the page — before this the
   * radius was a fixed pixel count and a 1.4mm preview line printed at 0.34mm.
   */
  thicknessMm: number;
  cleanup: Cleanup;
}

/** A4 is 210mm on the short edge; a landscape page is 297mm across. */
const pixelsPerMm = (width: number, height: number) => width / (width > height ? 297 : 210);

/**
 * Six steps, weighted toward the end of the range that actually produces good pages.
 *
 * Two knobs sit behind this control and they pull in opposite directions. `blur` pre-smooths
 * the greyscale, which suppresses texture but — §27, §30 — is also what breaks strokes apart:
 * it erases the weak gradients Canny's hysteresis needs to link a contour. `speckMm2` drops
 * connected blobs under a physical area, removing noise without touching stroke continuity.
 *
 * The original three steps coupled them, so the only way to get speck removal was to accept
 * blur, and the default sat where drawings already came apart. Four of the six steps now hold
 * `blur` at zero and vary only speck removal, which is the range worth having resolution in;
 * the last two add blur for images where texture genuinely has to go, at a cost that is now
 * an explicit choice rather than the starting point.
 */
const CLEANUP: Record<Cleanup, { blur: number; speckMm2: number }> = {
  off: { blur: 0, speckMm2: 0 },
  light: { blur: 0, speckMm2: 1.0 },
  medium: { blur: 0, speckMm2: 2.2 },
  strong: { blur: 0, speckMm2: 3.6 },
  heavy: { blur: 2, speckMm2: 3.6 },
  max: { blur: 4, speckMm2: 4.5 },
};

export interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Converts an RGBA source (white-composited) into black-on-white line art. In-place on a new buffer. */
export function renderLineArt(src: RawImage, opts: LineArtOptions): RawImage {
  const { width, height } = src;
  const { mode, detail, thicknessMm, cleanup } = opts;

  const ppmm = pixelsPerMm(width, height);
  const { blur, speckMm2 } = CLEANUP[cleanup];
  // A speck floor in mm² rather than pixels, so "Strong" removes the same specks on a
  // thumbnail as on the 300dpi export.
  const speckPx = Math.round(speckMm2 * ppmm * ppmm);

  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = src.data[i * 4];
    const g = src.data[i * 4 + 1];
    const b = src.data[i * 4 + 2];
    gray[i] = r * 0.299 + g * 0.587 + b * 0.114;
  }

  // Blur radius also scales, so cleanup means the same thing at every canvas size.
  const blurRadius = Math.round(blur * (ppmm / (595 / 210)));
  if (blurRadius > 0) {
    fastBoxBlur(gray, width, height, blurRadius);
  }

  const out = new Uint8ClampedArray(width * height * 4);

  if (mode === 'photo') {
    cannyPass(gray, out, width, height, detail, speckPx);
  } else {
    adaptivePass(gray, out, width, height, detail, blurRadius);
  }

  // A 1px trace dilated by r becomes 1 + 2r px wide; solve that for the requested thickness.
  const radius = Math.round((thicknessMm * ppmm - 1) / 2);
  if (radius >= 1) {
    dilateBlackSeparable(out, width, height, radius);
  }

  whitenBorders(out, width, height);

  return { data: out, width, height };
}

/**
 * Canny-style edge detection for photographs.
 *
 * A plain Sobel threshold cannot tell a subject's fur from a sofa's woven texture — both are
 * fine-grained gradient. Three stages fix that:
 *   1. Non-maximum suppression thins wide gradient ramps down to single-pixel lines.
 *   2. Hysteresis keeps weak edges only when they connect to a strong edge, so isolated
 *      texture speckle never survives while faint contours attached to real outlines do.
 *   3. Connected-component filtering drops any remaining specks below a size floor.
 */
function cannyPass(
  gray: Uint8Array,
  out: Uint8ClampedArray,
  width: number,
  height: number,
  detail: number,
  speckPx: number,
) {
  const size = width * height;
  const mag = new Float32Array(size);
  const dir = new Uint8Array(size); // 0:| 1:/ 2:- 3:\

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = gray[i - width - 1], t = gray[i - width], tr = gray[i - width + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + width - 1], b = gray[i + width], br = gray[i + width + 1];

      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      mag[i] = Math.sqrt(gx * gx + gy * gy);

      // Quantize gradient angle into 4 directions.
      let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (angle < 0) angle += 180;
      dir[i] = angle < 22.5 || angle >= 157.5 ? 2 : angle < 67.5 ? 3 : angle < 112.5 ? 0 : 1;
    }
  }

  // --- Non-maximum suppression ---
  const thin = new Float32Array(size);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = mag[i];
      let a: number, b: number;
      switch (dir[i]) {
        case 0: a = mag[i - width]; b = mag[i + width]; break;
        case 1: a = mag[i - width + 1]; b = mag[i + width - 1]; break;
        case 2: a = mag[i - 1]; b = mag[i + 1]; break;
        default: a = mag[i - width - 1]; b = mag[i + width + 1];
      }
      thin[i] = m >= a && m >= b ? m : 0;
    }
  }

  // --- Double threshold + hysteresis (strong seeds grow through weak pixels) ---
  //
  // The cut is a percentile of this image's own gradient magnitudes, not an absolute number.
  // Gradient magnitude scales with an image's contrast, so one fixed value cannot serve every
  // input: at the old default of 150 a bright, low-contrast photo came back at 0.9% ink — a
  // blank sheet — while a high-contrast painting came back at 16% and read as scribble.
  // Against a percentile the slider means the same thing everywhere: "keep the strongest N%".
  const high = gradientQuantile(thin, keepPercentile(detail));
  const low = high * 0.4;
  const edge = new Uint8Array(size);
  const stack: number[] = [];

  for (let i = 0; i < size; i++) {
    if (thin[i] >= high) {
      edge[i] = 1;
      stack.push(i);
    }
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
        const n = ny * width + nx;
        if (!edge[n] && thin[n] >= low) {
          edge[n] = 1;
          stack.push(n);
        }
      }
    }
  }

  if (speckPx > 0) {
    removeSpecks(edge, width, height, speckPx);
  }

  for (let i = 0; i < size; i++) {
    const v = edge[i] ? 0 : 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
}

/**
 * Detail (0–100, higher = more lines) -> the percentile of gradient magnitude used as the
 * strong-edge cut. The midpoint sits on the sweet spot measured across the sample set —
 * roughly 9–13% ink on every one of them.
 */
function keepPercentile(detail: number): number {
  const d = Math.min(100, Math.max(0, detail));
  return 0.99 - (d / 100) * 0.09; // 0 -> .99 (sparsest), 100 -> .90 (densest)
}

/**
 * Value standing at `p` through the non-zero magnitudes.
 * Histogram bucketing keeps this O(n) — sorting a full-resolution A4 buffer would not fit
 * the interactive budget.
 */
function gradientQuantile(values: Float32Array, p: number): number {
  const BINS = 1024;
  let max = 0;
  for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
  if (max <= 0) return 1;

  const hist = new Int32Array(BINS + 1);
  const scale = BINS / max;
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v <= 0) continue;
    hist[Math.min(BINS, (v * scale) | 0)]++;
    total++;
  }
  if (total === 0) return 1;

  const target = total * p;
  let cum = 0;
  for (let b = 0; b <= BINS; b++) {
    cum += hist[b];
    if (cum >= target) return ((b + 0.5) * max) / BINS;
  }
  return max;
}

/** Drops connected edge components smaller than minSize pixels (leftover texture speckle). */
function removeSpecks(edge: Uint8Array, width: number, height: number, minSize: number) {
  const size = width * height;
  const seen = new Uint8Array(size);
  const component: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < size; start++) {
    if (!edge[start] || seen[start]) continue;

    component.length = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const i = stack.pop()!;
      component.push(i);
      const x = i % width;
      const y = (i / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (edge[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }

    if (component.length < minSize) {
      for (const i of component) edge[i] = 0;
    }
  }
}

/**
 * For inputs that already carry their own strokes (scans, inked comics, AI line art):
 * keep what is locally darker than its surroundings instead of hunting for edges.
 */
function adaptivePass(
  gray: Uint8Array,
  out: Uint8ClampedArray,
  width: number,
  height: number,
  detail: number,
  cleanupBlur: number,
) {
  const local = new Uint8Array(gray);
  const window = Math.max(3, Math.round((width / 595) * 20) + cleanupBlur);
  fastBoxBlur(local, width, height, window);

  // More detail = catch fainter strokes.
  const sensitivity = Math.max(0, 20 - (detail / 100) * 20); // 20 (sparse) .. 0 (dense)
  const globalDark = 40 + (detail / 100) * 80; // 40 .. 120

  for (let i = 0; i < width * height; i++) {
    const g = gray[i];
    const isLine = g < globalDark || g < local[i] - sensitivity;
    const v = isLine ? 0 : 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
}

/**
 * Dilation of black pixels == sliding-window MIN filter on a binary image.
 * Separable (horizontal then vertical): O(width*height*radius) instead of O(width*height*radius^2).
 */
function dilateBlackSeparable(rgba: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius < 1) return;
  const size = width * height;
  const src = new Uint8Array(size);
  for (let i = 0; i < size; i++) src[i] = rgba[i * 4]; // 0 or 255

  const tmp = new Uint8Array(size);

  // Horizontal min
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let v = 255;
      const from = Math.max(0, x - radius);
      const to = Math.min(width - 1, x + radius);
      for (let k = from; k <= to; k++) {
        if (src[row + k] === 0) {
          v = 0;
          break;
        }
      }
      tmp[row + x] = v;
    }
  }

  // Vertical min
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = 255;
      const from = Math.max(0, y - radius);
      const to = Math.min(height - 1, y + radius);
      for (let k = from; k <= to; k++) {
        if (tmp[k * width + x] === 0) {
          v = 0;
          break;
        }
      }
      const idx = (y * width + x) * 4;
      rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = v;
      rgba[idx + 3] = 255;
    }
  }
}

function whitenBorders(rgba: Uint8ClampedArray, width: number, height: number) {
  for (let x = 0; x < width; x++) {
    setWhite(rgba, x);
    setWhite(rgba, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    setWhite(rgba, y * width);
    setWhite(rgba, y * width + width - 1);
  }
}

function setWhite(rgba: Uint8ClampedArray, pixelIndex: number) {
  const idx = pixelIndex * 4;
  rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = 255;
  rgba[idx + 3] = 255;
}

export function fastBoxBlur(data: Uint8Array, width: number, height: number, radius: number) {
  const temp = new Uint8Array(width * height);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x <= radius && x < width; x++) sum += data[y * width + x];
    let count = Math.min(radius + 1, width);

    for (let x = 0; x < width; x++) {
      temp[y * width + x] = sum / count;
      const left = x - radius;
      const right = x + radius + 1;
      if (left >= 0) {
        sum -= data[y * width + left];
        count--;
      }
      if (right < width) {
        sum += data[y * width + right];
        count++;
      }
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= radius && y < height; y++) sum += temp[y * width + x];
    let count = Math.min(radius + 1, height);

    for (let y = 0; y < height; y++) {
      data[y * width + x] = sum / count;
      const top = y - radius;
      const bottom = y + radius + 1;
      if (top >= 0) {
        sum -= temp[top * width + x];
        count--;
      }
      if (bottom < height) {
        sum += temp[bottom * width + x];
        count++;
      }
    }
  }
}
