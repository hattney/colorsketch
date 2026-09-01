import type { StyleVariant, SubjectModule } from './prompt';

/**
 * Client half of `/api/ai-preview` (§32).
 *
 * The endpoint is only present on a deployment that has `GEMINI_API_KEY` set. A plain `vite`
 * dev server has no `api/` routes at all, so this module has to treat "not available" as a
 * normal outcome rather than an error — the editor falls back to the local stand-in and keeps
 * saying so.
 */

export class AiPreviewUnavailable extends Error {}

/**
 * A real failure from a real endpoint.
 *
 * `retryable` is the part that matters on screen. A busy service or a network blip clears on
 * its own, so "try again" is the right thing to offer. A refusal does not: the model declined
 * this particular image and will decline it again, so offering a retry sends the user in a
 * loop. Provider policy is enforced server-side and is not ours to switch off — the honest
 * response is to say so once and point at the free converter, which still works on the photo.
 */
export class AiPreviewError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

export interface AiPreviewResult {
  previews: Record<StyleVariant, string>;
  /**
   * Present when the deployment has Blob + Redis: the server has saved the watermark-free
   * originals under this id, and `/api/checkout` takes it from here. Absent on a bare
   * deployment (model key only), which is also when checkout stays closed.
   */
  orderId?: string;
}

/** Strips the `data:...;base64,` prefix a canvas export carries. */
function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([^;,]+)(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Not a data URL');
  return { mimeType: match[1], base64: match[2] };
}

/**
 * Re-encodes the upload as a JPEG no larger than `maxEdge`.
 *
 * The original file can be a 12 MP phone photo, and the preview step does not need it: §3-1
 * asks the model for a low-resolution preview anyway, and a smaller upload is a faster,
 * cheaper call. Doing it here also normalises HEIC — by this point the image is already a
 * decoded `HTMLImageElement`.
 */
export function encodeForUpload(image: HTMLImageElement, maxEdge = 1280, quality = 0.9) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return splitDataUrl(canvas.toDataURL('image/jpeg', quality));
}

export async function requestAiPreview(
  image: HTMLImageElement,
  module: SubjectModule,
  otherWord: string,
  turnstileToken?: string,
): Promise<AiPreviewResult> {
  const { mimeType, base64 } = encodeForUpload(image);

  let res: Response;
  try {
    res = await fetch('/api/ai-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType, module, otherWord, turnstileToken }),
    });
  } catch {
    throw new AiPreviewUnavailable('offline');
  }

  // No api/ routes on this host: vite's dev server answers with the SPA shell, not JSON.
  if (res.status === 404 || res.status === 503) throw new AiPreviewUnavailable('not deployed');
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new AiPreviewUnavailable('no endpoint');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // 422 is the model declining this image; 415/413 are the file itself. None of those
    // change on a second attempt.
    const retryable = res.status !== 422 && res.status !== 415 && res.status !== 413;
    throw new AiPreviewError(body?.error || 'AI retouch failed.', retryable);
  }

  const previews = body?.previews;
  if (!previews?.simple || !previews?.detailed) {
    throw new AiPreviewError('AI retouch returned an incomplete result.', true);
  }
  return { previews, orderId: typeof body?.orderId === 'string' ? body.orderId : undefined };
}
