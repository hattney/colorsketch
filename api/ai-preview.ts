import { buildPrompt, sanitizeSubjectWord, type StyleVariant, type SubjectModule } from '../src/utils/prompt.js';
import { getCachedVariant, putCachedVariant } from './_lib/cache.js';
import { newOrderId, sha256HexOfBase64 } from './_lib/ids.js';
import { watermarkedPreview } from './_lib/image.js';
import { blobConfigured, orderImagePath, putBytes } from './_lib/blob.js';
import { createOrder, type VariantAsset } from './_lib/order.js';
import { RedisNotConfigured, redisConfigured } from './_lib/redis.js';
import { verifyTurnstile } from './_lib/turnstile.js';
import {
  PREVIEW_LIMIT,
  PREVIEW_WINDOW_SECONDS,
  checkRateLimit,
  claimFreshInput,
  clientIp,
  consumeRateLimit,
} from './_lib/ratelimit.js';

/**
 * POST /api/ai-preview — the real AI retouch (CONTENT_UPDATE.md §15, §32).
 *
 * Calls Gemini's image-editing model ("Nano Banana") directly rather than through an
 * aggregator. The reason is §15 itself: that prompt is written for an instruction-following
 * *editor* — "at most four whiskers per side", "never stipple the flower centre" — and is
 * tuned per model. A line-art style model would ignore most of it, and an aggregator's only
 * real advantage here (swapping models) is already provided by this endpoint being the one
 * place the client talks to.
 *
 * Layered on since §32 (PHASE2_GUIDE.md §3-1):
 *   1. Turnstile — a request without a valid token is rejected once the secret is set.
 *   2. a 3-per-24h IP rate limit, counted once per request and only on success, with a reload
 *      of the same photo costing nothing.
 *   3. a 7-day cache keyed by image hash + subject module + variant, so a repeat request pays
 *      for no model call.
 *   4. the response is the model output shrunk to 800px with a "PREVIEW ONLY" watermark
 *      composited into the pixels — never the clean file.
 *   5. the watermark-free originals are stored on an order record; the paid flow issues from
 *      those and never calls the model again (§(A)).
 *
 * Runs under the Node.js runtime (the default), not Edge: step 4 uses `sharp`. Vercel's Node
 * runtime only exposes the Web `Request → Response` signature through method-named exports
 * (`POST` here), not a default export — a default export is called `(req, res)` and crashes.
 */
export const maxDuration = 60;

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Verify against Google's current model list before launch — image model names move.
 * Kept in an env var so a swap is a dashboard change, not a deploy.
 */
const MODEL_ID = process.env.AI_MODEL_ID || 'gemini-2.5-flash-image';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface PreviewRequest {
  /** Bare base64, no data: prefix. */
  imageBase64?: unknown;
  mimeType?: unknown;
  module?: unknown;
  otherWord?: unknown;
  turnstileToken?: unknown;
}

type VariantResult =
  | { ok: true; bytes: Uint8Array; contentType: string; fromCache: boolean }
  | { ok: false; status: number; error: string };

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

const VARIANTS: StyleVariant[] = ['simple', 'detailed'];

const MODULES: SubjectModule[] = [
  'auto',
  'people-pets',
  'nature',
  'objects-places',
  'artwork',
  'other',
];

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Pulls the first inline image out of a generateContent response, whatever casing it used. */
function extractImage(payload: any): { data: string; mimeType: string } | null {
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
function refusalReason(payload: any): { status: number; error: string } {
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

/** Reads a cached original back out of Blob. Returns null if the blob is gone. */
async function loadCachedVariant(
  imageHash: string,
  selection: { module: SubjectModule; otherWord?: string },
  variant: StyleVariant,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const cached = await getCachedVariant(imageHash, selection.module, selection.otherWord, variant);
    if (!cached) return null;
    const res = await fetch(cached.originalUrl);
    if (!res.ok) return null;
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: cached.contentType };
  } catch (e) {
    if (e instanceof RedisNotConfigured) return null;
    console.error('cache read failed', e);
    return null;
  }
}

async function renderVariant(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  imageHash: string,
  selection: { module: SubjectModule; otherWord?: string },
  variant: StyleVariant,
): Promise<VariantResult> {
  const hit = await loadCachedVariant(imageHash, selection, variant);
  if (hit) return { ok: true, bytes: hit.bytes, contentType: hit.contentType, fromCache: true };

  const prompt = buildPrompt(selection, variant);

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
  if (!image) {
    const { status, error } = refusalReason(payload);
    return { ok: false, status, error };
  }

  const bytes = base64ToBytes(image.data);

  // Best-effort: a cache write that fails (no Redis/Blob yet) must not fail the request.
  try {
    await putCachedVariant(
      imageHash,
      selection.module,
      selection.otherWord,
      variant,
      bytes,
      image.mimeType,
    );
  } catch (e) {
    if (!(e instanceof RedisNotConfigured)) console.error('cache write failed', e);
  }

  return { ok: true, bytes, contentType: image.mimeType, fromCache: false };
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'AI retouch is not configured on this deployment.' }, 503);

  let body: PreviewRequest;
  try {
    body = (await req.json()) as PreviewRequest;
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  if (!imageBase64) return json({ error: 'No image supplied.' }, 400);

  // base64 is ~4/3 of the bytes it encodes.
  if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
    return json({ error: 'That image is larger than 10 MB.' }, 413);
  }
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
    return json({ error: 'Unsupported image type.' }, 415);
  }

  const ip = clientIp(req);
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined;
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return json(
      { error: 'Could not confirm you are a person. Refresh the page and try again.' },
      403,
    );
  }

  const module: SubjectModule = MODULES.includes(body.module as SubjectModule)
    ? (body.module as SubjectModule)
    : 'auto';
  // Same validation the client ran; never trust the client's copy (§15).
  const otherWord =
    module === 'other' && typeof body.otherWord === 'string'
      ? (sanitizeSubjectWord(body.otherWord) ?? undefined)
      : undefined;

  const imageHash = await sha256HexOfBase64(imageBase64);

  // Read-only gate. The 4th distinct request in 24h is turned away here; the counter is only
  // moved after a 200 is certain (below), so a refusal never costs a free preview.
  const gate = await checkRateLimit('preview', ip, PREVIEW_LIMIT);
  if (!gate.allowed) {
    return json(
      {
        error:
          'You’ve used your 3 free AI previews for today. They reset in 24 hours — or unlock both HD pages now.',
        retryAfterMs: gate.retryAfterMs,
      },
      429,
    );
  }

  const results: VariantResult[] = await Promise.all(
    VARIANTS.map((v) => renderVariant(apiKey, imageBase64, mimeType, imageHash, { module, otherWord }, v)),
  );

  // One variant failing fails the pair: showing a lone card would misrepresent what the
  // purchase includes, and the user can simply retry.
  const originals: { variant: StyleVariant; bytes: Uint8Array; contentType: string }[] = [];
  let allCached = true;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.ok === false) return json({ error: r.error }, r.status);
    originals.push({ variant: VARIANTS[i], bytes: r.bytes, contentType: r.contentType });
    allCached &&= r.fromCache;
  }

  // Watermark + 800px downscale. This is all the free preview step ever hands back.
  const previews: Partial<Record<StyleVariant, string>> = {};
  for (const o of originals) {
    const wm = await watermarkedPreview(o.bytes);
    previews[o.variant] = `data:image/png;base64,${bytesToBase64(wm)}`;
  }

  // Order record — the paid flow issues the HD file from these stored originals and never
  // calls the model again (§(A)). Best-effort: without Blob/Redis the previews still return
  // and `orderId` is simply absent, which keeps checkout closed on the client.
  let orderId: string | undefined;
  if (blobConfigured() && redisConfigured()) {
    try {
      const oid = newOrderId();
      const variants: Partial<Record<StyleVariant, VariantAsset>> = {};
      for (const o of originals) {
        const ext = o.contentType.includes('jpeg') ? 'jpg' : 'png';
        const url = await putBytes(orderImagePath(oid, o.variant, 'original', ext), o.bytes, {
          contentType: o.contentType,
          addRandomSuffix: false,
        });
        variants[o.variant] = { originalUrl: url };
      }
      await createOrder({
        orderId: oid,
        status: 'previewed',
        imageHash,
        module,
        otherWord,
        fromModel: true,
        variants,
      });
      orderId = oid;
    } catch (e) {
      console.error('order creation failed', e);
    }
  }

  // Count it — unless this exact photo + subject was already served to this IP in the window
  // (a reload, a re-opened tab). Only a genuinely new input spends a slot.
  const subjectKey = `${module}:${otherWord ?? '-'}`;
  if (await claimFreshInput(ip, imageHash, subjectKey, PREVIEW_WINDOW_SECONDS)) {
    await consumeRateLimit('preview', ip, PREVIEW_WINDOW_SECONDS);
  }

  return new Response(JSON.stringify({ previews, orderId }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Lets the §7 test check "second request is a cache hit" without reading model logs.
      'x-colorsketch-cache': allCached ? 'hit' : 'miss',
    },
  });
}
