import { sanitizeSubjectWord, type StyleVariant, type SubjectModule } from '../src/utils/prompt.js';
import { orderImagePath, putBytes } from './_lib/blob.js';
import { upscaleToPaper } from './_lib/image.js';
import { recordRegen } from './_lib/ledger.js';
import { MAX_IMAGE_BYTES, generateVariant } from './_lib/model.js';
import { loadOrder, saveOrder, type VariantAsset } from './_lib/order.js';

/**
 * POST /api/regenerate — a second and third draw of a page the buyer already owns.
 *
 * This is the one place the "no model calls after payment" rule bends, and it bends without
 * breaking. That rule exists so a dead provider can never leave someone who paid with
 * nothing; here the files are already delivered and stay delivered. A regeneration can only
 * add. If the model refuses or times out, the buyer still has exactly what they bought, and
 * the previous pair is kept rather than overwritten so a worse redraw is never a loss —
 * which matters, because the model is sampled and "different" is not the same as "better".
 *
 * The cache is deliberately bypassed. `/api/ai-preview` keys on (photo, subject, variant) so
 * a repeat costs nothing, but a buyer asking for a different result must not be handed back
 * the identical one that made them ask.
 *
 * The photo is not stored server-side. It comes back up from the buyer's own browser for
 * this call and is dropped when the request ends, which is why regeneration is capped by the
 * order rather than gated behind another bot check: it takes a paid order id to reach here.
 */
export const maxDuration = 60;

const VARIANTS: StyleVariant[] = ['simple', 'detailed'];
const MODULES: SubjectModule[] = [
  'auto',
  'people-pets',
  'nature',
  'objects-places',
  'artwork',
  'other',
];

/** Two extra draws. Enough to escape one bad roll, not enough to be a free image service. */
export const MAX_REGENS = 2;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

interface RegenRequest {
  orderId?: unknown;
  imageBase64?: unknown;
  mimeType?: unknown;
  module?: unknown;
  otherWord?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'AI retouch is not configured on this deployment.' }, 503);

  let body: RegenRequest;
  try {
    body = (await req.json()) as RegenRequest;
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';

  if (!orderId) return json({ error: 'Missing order.' }, 400);
  if (!imageBase64) {
    return json(
      { error: 'We no longer have your photo on this device. Upload it again to redraw.' },
      400,
    );
  }
  if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
    return json({ error: 'That image is larger than 10 MB.' }, 413);
  }
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
    return json({ error: 'Unsupported image type.' }, 415);
  }

  const order = await loadOrder(orderId);
  if (!order) return json({ error: 'That order has expired.' }, 404);
  if (order.status === 'refunded') return json({ error: 'This order was refunded.' }, 410);
  if (order.status !== 'delivered' && order.status !== 'paid') {
    return json({ error: 'This order has not been paid for.' }, 403);
  }
  if (!order.fromModel) {
    return json({ error: 'There is no AI page on this order to redraw.' }, 409);
  }

  const used = order.regensUsed ?? 0;
  if (used >= MAX_REGENS) {
    return json({ error: 'You have used both redraws for this order.', regensLeft: 0 }, 409);
  }

  // The buyer may pick a different subject for the redraw — that is the point of offering it
  // when the first read of the photo was wrong. Re-sanitized here: the client copy is UX only.
  const module: SubjectModule = MODULES.includes(body.module as SubjectModule)
    ? (body.module as SubjectModule)
    : order.module;
  const otherWord =
    module === 'other'
      ? sanitizeSubjectWord(typeof body.otherWord === 'string' ? body.otherWord : '')
      : undefined;
  if (module === 'other' && !otherWord) {
    return json({ error: 'Tell us in a word or two what this is.' }, 400);
  }

  const generation = used + 1;
  const nonce = `${orderId}:${generation}`;

  const produced = await Promise.all(
    VARIANTS.map((v) => generateVariant(apiKey, imageBase64, mimeType, { module, otherWord }, v, nonce)),
  );

  // One failure fails the pair, exactly as the preview step does: a half-redrawn order would
  // leave the two styles made from different draws of the photo.
  for (const p of produced) {
    if (p.ok === false) return json({ error: p.error }, p.status);
  }

  const next: Partial<Record<StyleVariant, VariantAsset>> = {};
  try {
    for (let i = 0; i < VARIANTS.length; i++) {
      const variant = VARIANTS[i];
      const result = produced[i];
      if (result.ok === false) continue; // already returned above; keeps the narrowing happy
      const ext = result.contentType.includes('jpeg') ? 'jpg' : 'png';

      const originalUrl = await putBytes(
        orderImagePath(orderId, variant, 'original', ext, generation),
        result.bytes,
        { contentType: result.contentType, addRandomSuffix: false },
      );
      const hires = await upscaleToPaper(result.bytes, order.paper, order.landscape);
      const hiResUrl = await putBytes(
        orderImagePath(orderId, variant, 'hires', 'png', generation),
        hires,
        { contentType: 'image/png', addRandomSuffix: false },
      );
      next[variant] = { originalUrl, hiResUrl };
    }
  } catch (e) {
    // Nothing has been swapped in yet, so the order still points at the delivered files.
    console.error('regenerate storage failed', orderId, e);
    return json({ error: 'Could not save the new pages. Your existing files are unchanged.' }, 502);
  }

  const saved = await saveOrder({
    ...order,
    // Keep exactly one step back: the pair the buyer had before this redraw.
    previousVariants: order.variants,
    variants: next,
    module,
    otherWord,
    regensUsed: generation,
  });

  await recordRegen(VARIANTS.length, 0, orderId);

  return json(
    {
      status: 'ok',
      regensUsed: saved.regensUsed ?? generation,
      regensLeft: MAX_REGENS - generation,
      variants: {
        simple: next.simple?.hiResUrl,
        detailed: next.detailed?.hiResUrl,
      },
      previous: {
        simple: order.variants.simple?.hiResUrl,
        detailed: order.variants.detailed?.hiResUrl,
      },
    },
    200,
  );
}
