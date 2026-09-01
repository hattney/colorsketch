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
 *   upscaleToA4         the watermark-free original, enlarged onto an A4 300 DPI canvas at
 *                       delivery. Line art enlarges almost losslessly, so this is a resize,
 *                       never a second model call — §(A) turns on that distinction.
 */
import sharp from 'sharp';

const PREVIEW_LONG_EDGE = 800;

/** A4 at 300 DPI. */
const A4_LONG = 3508;
const A4_SHORT = 2480;

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

export async function upscaleToA4(
  original: Uint8Array | ArrayBuffer | Buffer,
): Promise<Buffer> {
  const src = toBuffer(original);
  const meta = await sharp(src).metadata();
  const landscape = (meta.width ?? 0) > (meta.height ?? 0);
  const width = landscape ? A4_LONG : A4_SHORT;
  const height = landscape ? A4_SHORT : A4_LONG;

  return sharp(src)
    .flatten({ background: '#ffffff' })
    // `contain` pads to an exact A4 canvas so the delivered PNG prints correctly with no
    // cropping, whatever aspect the model returned.
    .resize({ width, height, fit: 'contain', background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
