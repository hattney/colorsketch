/**
 * Vercel Blob wrapper (PHASE2_GUIDE.md §1, §(A)).
 *
 * Three kinds of object live here, all watermark-free:
 *
 *   - cache original   `cache/{imageHash}/{module}/{otherKey}/{variant}` — the model's own
 *                       output, kept so the same photo + subject never pays for a second call.
 *   - order original   `orders/{orderId}/{variant}-original` — the cache original copied onto
 *                       an order at preview time. §(A): the paid flow issues from this and
 *                       never calls the model again.
 *   - order hi-res     `orders/{orderId}/{variant}-hires` — the original upscaled to A4 300 DPI
 *                       at delivery. Line art upscales almost losslessly, so this is a resize.
 *
 * Access model: Vercel Blob URLs are public but unguessable (`addRandomSuffix`). There is no
 * S3-style time-limited signature, so `/api/download` is the gate — it checks the order status
 * before handing back a URL, and `/order/{orderId}` can re-issue indefinitely. Every blob is
 * deleted at 7 days regardless (Terms §8), which bounds the exposure either way.
 *
 * Env: `BLOB_READ_WRITE_TOKEN` — read automatically by `@vercel/blob`, server-only.
 */
import { del, put } from '@vercel/blob';
import type { StyleVariant } from '../../src/utils/prompt.js';

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

/** The hi-res file is what the buyer downloads, so its name is the download filename. */
const DOWNLOAD_NAME: Record<StyleVariant, string> = {
  simple: 'ColorSketch-Simple-HD',
  detailed: 'ColorSketch-Detailed-HD',
};

export const orderImagePath = (
  orderId: string,
  variant: StyleVariant,
  kind: 'original' | 'hires',
  ext = 'png',
): string =>
  kind === 'hires'
    ? `orders/${orderId}/${DOWNLOAD_NAME[variant]}.${ext}`
    : `orders/${orderId}/${variant}-original.${ext}`;

export const cacheImagePath = (
  imageHash: string,
  module: string,
  otherKey: string,
  variant: StyleVariant,
  ext = 'png',
): string => `cache/${imageHash}/${module}/${otherKey}/${variant}.${ext}`;

interface PutOpts {
  contentType?: string;
  /** Cache blobs keep it (each write is a new key); order blobs drop it (the orderId already
   *  makes the path unguessable) so the download filename stays clean and a retry overwrites. */
  addRandomSuffix?: boolean;
}

/** Stores bytes at `pathname` and returns the public URL. */
export async function putBytes(
  pathname: string,
  bytes: Uint8Array | ArrayBuffer | Buffer,
  opts: PutOpts = {},
): Promise<string> {
  const body =
    bytes instanceof Uint8Array || Buffer.isBuffer(bytes) ? bytes : new Uint8Array(bytes);
  const { url } = await put(pathname, body, {
    access: 'public',
    contentType: opts.contentType ?? 'image/png',
    addRandomSuffix: opts.addRandomSuffix ?? true,
    allowOverwrite: true,
    cacheControlMaxAge: SEVEN_DAYS_SECONDS,
  });
  return url;
}

/** Best-effort delete. Used on refund and by the 7-day sweep; a miss is not worth failing a webhook over. */
export async function deleteImages(urls: Array<string | undefined>): Promise<void> {
  const present = urls.filter((u): u is string => Boolean(u));
  if (present.length === 0) return;
  try {
    await del(present);
  } catch {
    /* the blob TTL will collect it */
  }
}
