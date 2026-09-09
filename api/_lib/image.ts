/**
 * Server-side image processing (PHASE2_GUIDE.md §3-1 step 4, §(A)).
 *
 * Runs under the Node.js runtime, not Edge — `sharp` needs it. Two operations:
 *
 *   watermarkedPreview  the model output, shrunk to an 800px long edge with "PREVIEW ONLY"
 *                       tiled diagonally into the pixels. This is all the free preview step
 *                       ever hands back. Decided with the user (2026-09-01): diagonal tile,
 *                       ~14% black, brand name omitted so the tile stays uncluttered.
 *
 *   upscaleToPaper      the watermark-free original, enlarged onto a 300 DPI sheet at
 *                       delivery. Line art enlarges almost losslessly, so this is a resize,
 *                       never a second model call — §(A) turns on that distinction.
 *                       The sheet is whatever the buyer picked in the editor and it is
 *                       stored on the order, so the delivered file matches the preview
 *                       they bought rather than a hardcoded A4.
 */
import sharp from 'sharp';
import { exportSize, type PaperId } from '../../src/utils/paper.js';

const PREVIEW_LONG_EDGE = 800;

const WATERMARK_TEXT = 'PREVIEW ONLY — pay to unlock HD';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

/** A full-size SVG of the same phrase repeated on a rotated grid, for a single composite pass. */
function watermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(13, Math.round(width / 30));
  const stepX = Math.round(fontSize * WATERMARK_TEXT.length * 0.62);
  const stepY = fontSize * 7;
  const text = escapeXml(WATERMARK_TEXT);
  const marks: string[] = [];
  for (let y = -height; y < height * 2; y += stepY) {
    // Offset every other row so the columns do not line up into vertical gaps.
    const offset = ((y / stepY) % 2 === 0 ? 0 : stepX / 2) - width;
    for (let x = offset; x < width * 2; x += stepX) {
      marks.push(
        `<text x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#101010" fill-opacity="0.14" letter-spacing="1">${text}</text>`,
      );
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${marks.join('')}</svg>`,
  );
}

function toBuffer(bytes: Uint8Array | ArrayBuffer | Buffer): Buffer {
  if (Buffer.isBuffer(bytes)) return bytes;
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

export async function watermarkedPreview(
  original: Uint8Array | ArrayBuffer | Buffer,
): Promise<Buffer> {
  const resized = await sharp(toBuffer(original))
    .flatten({ background: '#ffffff' })
    .resize({
      width: PREVIEW_LONG_EDGE,
      height: PREVIEW_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const w = meta.width ?? PREVIEW_LONG_EDGE;
  const h = meta.height ?? PREVIEW_LONG_EDGE;

  return sharp(resized)
    .composite([{ input: watermarkSvg(w, h), top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function upscaleToPaper(
  original: Uint8Array | ArrayBuffer | Buffer,
  paper?: PaperId,
  orientLandscape?: boolean,
): Promise<Buffer> {
  const src = toBuffer(original);
  // Fall back to the image's own orientation for orders written before paper was recorded.
  let landscape = orientLandscape;
  if (landscape === undefined) {
    const meta = await sharp(src).metadata();
    landscape = (meta.width ?? 0) > (meta.height ?? 0);
  }
  const { width, height } = exportSize(paper, landscape);

  return sharp(src)
    .flatten({ background: '#ffffff' })
    // `contain` pads to the exact sheet so the delivered PNG prints with no cropping,
    // whatever aspect the model returned.
    .resize({ width, height, fit: 'contain', background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
