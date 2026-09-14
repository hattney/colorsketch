/**
 * The one place that talks to the image model.
 *
 * Two callers need it and they need different things around it: `/api/ai-preview` wraps this
 * in the shared cache, and `/api/regenerate` deliberately does not — a buyer asking for a
 * different result must not be handed the same one back. Keeping the call itself in a single
 * module is what lets those two policies differ without the request, the refusal wording or
 * the response parsing drifting apart between them.
 */
import { buildPrompt, type StyleVariant, type SubjectModule } from '../../src/utils/prompt.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Verify against Google's current model list before launch — image model names move.
 * Kept in an env var so a swap is a dashboard change, not a deploy.
 */
export const MODEL_ID = process.env.AI_MODEL_ID || 'gemini-2.5-flash-image';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Pulls the first inline image out of a generateContent response, whatever casing it used. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractImage(payload: any): { data: string; mimeType: string } | null {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data;
    const data = inline?.data;
    if (typeof data === 'string' && data.length > 0) {
      return { data, mimeType: inline.mimeType ?? inline.mime_type ?? 'image/png' };
    }
  }
  return null;
}

/**
 * Why the model returned no image, in the user's words rather than the API's.
 *
 * Deliberately does NOT speculate about the cause. The API reports that a request was
 * blocked, not what about the photo triggered it, so naming a reason would be a guess —
 * and a wrong guess is worse than none: telling a parent that their child's photo raised
 * an impersonation concern is alarming, and telling someone the same about a bouquet makes
 * the product look broken. The one exception is RECITATION, where the API *has* said the
 * output resembled existing work, so a concrete hint is fair.
 *
 * Every refusal points at the free converter, because it still produces a page from the
 * same photo. A dead end here loses a user who had a working option all along.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function refusalReason(payload: any): { status: number; error: string } {
  const candidate = payload?.candidates?.[0];
  const finish = candidate?.finishReason ?? candidate?.finish_reason;

  // 422 means "this image, always" — the client turns off the retry button for it, so the
  // status and the wording have to agree. Only a genuine block earns it.
  if (finish === 'RECITATION') {
    return {
      status: 422,
      error:
        'AI retouch isn’t available for this image. Try a photo you took yourself — your free coloring page still works.',
    };
  }
  if (payload?.promptFeedback?.blockReason || finish === 'SAFETY') {
    return {
      status: 422,
      error:
        'AI retouch isn’t available for this photo. Try a different image — your free coloring page still works.',
    };
  }
  // No image, but nothing was blocked: a hiccup, and retrying is reasonable.
  return { status: 502, error: 'AI retouch didn’t return a page this time. Please try again.' };
}

export type ModelResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; status: number; error: string };

/**
 * One image from the model. No caching either way — the caller decides that.
 *
 * `nonce` is appended to the prompt when the caller wants a genuinely different draw of the
 * same input. The model is sampled, so an identical prompt already varies, but a caller that
 * is explicitly asking for "not that one again" should not depend on that.
 */
export async function generateVariant(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  selection: { module: SubjectModule; otherWord?: string },
  variant: StyleVariant,
  nonce?: string,
): Promise<ModelResult> {
  const prompt = nonce
    ? `${buildPrompt(selection, variant)}\nDraw this fresh — do not repeat an earlier attempt. (${nonce})`
    : buildPrompt(selection, variant);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${MODEL_ID}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] },
        ],
      }),
    });
  } catch {
    return { ok: false, status: 502, error: 'Could not reach the retouch service. Please try again.' };
  }

  if (!res.ok) {
    // 429 is the one worth passing through honestly: it is temporary and the user can wait.
    if (res.status === 429) {
      return { ok: false, status: 429, error: 'The retouch service is busy. Please try again in a minute.' };
    }
    return { ok: false, status: 502, error: 'The retouch service returned an error. Please try again.' };
  }

  const payload = await res.json().catch(() => null);
  const image = extractImage(payload);
  if (!image) return { ok: false, ...refusalReason(payload) };

  return { ok: true, bytes: base64ToBytes(image.data), contentType: image.mimeType };
}
