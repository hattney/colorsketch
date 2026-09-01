/**
 * Quality signals read off a finished free conversion, used to decide whether the AI
 * retouch callout is worth showing (CONTENT_UPDATE.md §14).
 *
 * Both numbers are normalized, so they mean the same thing whatever size the trace was
 * rendered at.
 */
export interface FreeQuality {
  /** Share of near-black pixels, 0–1. */
  ink: number;
  /**
   * Connected black components per 1000 ink pixels.
   *
   * Low means long continuous contours — a drawing. High means the page is built from many
   * short broken strokes, which is what fur, foliage and fabric turn into. This is the signal
   * that actually separates "colorable" from "not": ink alone stopped discriminating once the
   * Canny threshold became adaptive, because every input now lands near 10% ink.
   *
   * Normalized to REFERENCE_AREA. A page holds the same number of strokes however finely it
   * is rendered, but its ink pixel count grows with the square of the scale, so the raw ratio
   * would quietly shrink every time the trace resolution changed.
   */
  fragmentation: number;
}

/** The geometry the fragmentation cutoff below was calibrated against. */
const REFERENCE_AREA = 595 * 842;

export function measureFreeQuality(data: ImageData): FreeQuality {
  const { width, height } = data;
  const px = data.data;
  const n = width * height;

  const dark = new Uint8Array(n);
  let inkPx = 0;
  for (let i = 0; i < n; i++) {
    if (px[i * 4] < 128) {
      dark[i] = 1;
      inkPx++;
    }
  }
  if (inkPx === 0) return { ink: 0, fragmentation: 0 };

  const seen = new Uint8Array(n);
  const stack: number[] = [];
  let components = 0;

  for (let start = 0; start < n; start++) {
    if (!dark[start] || seen[start]) continue;
    components++;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (dark[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
  }

  const rawFragmentation = components / (inkPx / 1000);
  return { ink: inkPx / n, fragmentation: rawFragmentation * (n / REFERENCE_AREA) };
}

/** Below this the page is too empty to color at all. */
export const EMPTY_INK = 0.02;

/**
 * Above this the page is mostly short broken strokes rather than contours.
 *
 * Recalibrated in §31 when the default cleanup moved to `light`. The cutoff is bound to the
 * default: cleanup blur is what fragments strokes, so removing it from the default shifted
 * every reading down and the old 0.6 stopped firing at all — the AI callout would silently
 * have disappeared from exactly the photos it exists for.
 *
 * Measured at preview geometry on the six sample originals, detail 50 / 2.0mm / light:
 *   hard  — dog 0.45, foliage 0.37, kitten 0.21
 *   easy  — bouquet 0.14, product 0.13, drawing 0.10
 * 0.18 sits in the gap. Move this and the default together, never one alone.
 */
export const FRAGMENTED = 0.18;

export const needsAiRetouch = (q: FreeQuality): boolean =>
  q.ink < EMPTY_INK || q.fragmentation > FRAGMENTED;

/**
 * Share of black pixels that survive erosion by `radius`.
 *
 * Separates "lines" from "a filled shape", which ink coverage alone cannot: a busy but
 * perfectly colorable page (foliage, lace) and a subject that has flooded solid black can
 * carry the same ink percentage. Erode by roughly half a stroke width and a stroke vanishes
 * while a mass barely shrinks — measured on synthetic cases, real line art lands at 0.00-0.07
 * and a flooded fill at 0.92.
 */
export function measureSolidity(data: ImageData, radius: number): number {
  const { width: w, height: h } = data;
  const n = w * h;

  const black = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (data.data[i * 4] < 128) {
      black[i] = 1;
      total++;
    }
  }
  if (total === 0) return 0;

  // Separable erosion: horizontal pass, then vertical.
  const tmp = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = 1;
      for (let d = -radius; d <= radius; d++) {
        const nx = x + d;
        if (nx < 0 || nx >= w || !black[y * w + nx]) {
          keep = 0;
          break;
        }
      }
      tmp[y * w + x] = keep;
    }
  }

  let kept = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = 1;
      for (let d = -radius; d <= radius; d++) {
        const ny = y + d;
        if (ny < 0 || ny >= h || !tmp[ny * w + x]) {
          keep = 0;
          break;
        }
      }
      if (keep) kept++;
    }
  }
  return kept / total;
}

/**
 * Above this the page has flooded into shapes rather than outlines.
 *
 * Calibrated on real renders at the matching erosion radius (see SOLID_ERODE_DIVISOR):
 * good pages landed at 0.24 / 0.27 / 0.32, visibly blobbed ones at 0.49 / 0.55.
 * 0.40 sits in the gap. An earlier 0.25 — guessed from synthetic strokes thinner than the
 * real 2mm ones — rejected every good render.
 */
export const SOLID_MAX = 0.4;

/**
 * Erosion radius = strokeWidthPx / this. A stroke only disappears once eroded by about half
 * its width, so anything much larger than 2 leaves thick strokes looking like mass.
 */
export const SOLID_ERODE_DIVISOR = 1.5;

/**
 * Below this the sheet is effectively blank. Deliberately low: a spare line drawing is a
 * legitimate result at 1%% ink, so this only catches "nothing came out", not "sparse".
 */
export const MIN_INK = 0.004;
