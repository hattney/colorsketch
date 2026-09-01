import type { LineArtMode, RawImage } from './lineart';

export interface ImageAnalysis {
  /** Share of near-white pixels (0–1). */
  whiteRatio: number;
  /** Share of near-black pixels (0–1). */
  darkRatio: number;
  /** Mean HSV-style saturation, 0–255. */
  meanSaturation: number;
  recommendedMode: LineArtMode;
  /** 0–1. How far from the decision boundary the sample sits. */
  confidence: number;
}

/**
 * Picks a starting mode. Run on a small sample (~256px wide) — never on full resolution.
 *
 * The useful split is NOT "photo vs illustration" — painted illustrations and 3D renders both
 * have continuous tone and need edge detection just like photographs do. What actually matters
 * is whether the input is ALREADY line art (a scanned drawing, inked comic, or clip art):
 * those are near-bimodal (white paper + dark strokes) and desaturated, and they only need
 * thresholding to clean up. Everything else goes through Canny edge detection.
 */
export function analyzeImage(sample: RawImage): ImageAnalysis {
  const { data, width, height } = sample;
  const total = width * height;

  let white = 0;
  let dark = 0;
  let satSum = 0;

  for (let i = 0; i < total; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    if (luma > 236) white++;
    else if (luma < 64) dark++;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : ((max - min) / max) * 255;
  }

  const whiteRatio = white / total;
  const darkRatio = dark / total;
  const meanSaturation = satSum / total;

  // Already-line-art signature: dominated by paper white, strokes are dark, almost no color,
  // and very little mid-tone in between.
  const bimodal = whiteRatio + darkRatio;
  const isLineArt =
    whiteRatio > 0.55 && bimodal > 0.8 && meanSaturation < 40 && darkRatio > 0.005;

  const recommendedMode: LineArtMode = isLineArt ? 'illustration' : 'photo';

  // Distance from the decision boundary, normalized across the three governing signals.
  const margin = Math.min(
    Math.abs(whiteRatio - 0.55) / 0.55,
    Math.abs(bimodal - 0.8) / 0.8,
    Math.abs(meanSaturation - 40) / 40,
  );

  return {
    whiteRatio,
    darkRatio,
    meanSaturation,
    recommendedMode,
    confidence: Math.min(1, margin),
  };
}
