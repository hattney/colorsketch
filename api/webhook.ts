import crypto from 'node:crypto';
import { deleteImages } from './_lib/blob';
import { deliverOrder } from './_lib/deliver';
import {
  applyTransition,
  isWebhookProcessed,
  loadOrder,
  markWebhookProcessed,
  saveOrder,
} from './_lib/order';

/**
 * POST /api/webhook — Lemon Squeezy events (PHASE2_GUIDE.md §3-3, §(B)).
 *
 * This is the ONLY thing that marks an order paid. The redirect back to /thanks is a status
 * display; it can be lost, but the webhook is retried by Lemon Squeezy on any non-2xx.
 *
 *   - signature: HMAC-SHA256 of the RAW body with LEMONSQUEEZY_WEBHOOK_SECRET. Never verify a
 *     re-serialized JSON — the bytes must be the ones LS signed.
 *   - idempotent: `${event}:${lsOrderId}` is recorded on the order; a repeat skips the state
 *     change. Delivery itself is separately idempotent (see `deliverOrder`), so a retry after
 *     a mid-fulfilment timeout still completes the order.
 */
export const maxDuration = 60;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function verifySignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface LsWebhook {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: { id?: string | number; attributes?: Record<string, unknown> };
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Webhook not configured.' }, 503);

  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-signature'), secret)) {
    return json({ error: 'Bad signature' }, 401);
  }

  let payload: LsWebhook;
  try {
    payload = JSON.parse(raw) as LsWebhook;
  } catch {
    return json({ error: 'Malformed body' }, 400);
  }

  const eventName = payload.meta?.event_name ?? '';
  const lsOrderId = String(payload.data?.id ?? '');
  const orderId = String(payload.meta?.custom_data?.order_id ?? '');
  const email =
    typeof payload.data?.attributes?.user_email === 'string'
      ? (payload.data.attributes.user_email as string)
      : undefined;
  const origin = `https://${req.headers.get('host') ?? ''}`;

  // A purchase made outside our checkout flow carries no order_id — nothing to fulfil. Ack it.
  if (!orderId) {
    console.warn('webhook with no order_id', eventName, lsOrderId);
    return json({ received: true }, 200);
  }

  const order = await loadOrder(orderId);
  if (!order) {
    // The order expired or never existed. Retrying will not help; ack so LS stops.
    console.warn('webhook for unknown order', orderId, eventName);
    return json({ received: true }, 200);
  }

  const eventId = `${eventName}:${lsOrderId}`;

  if (eventName === 'order_created') {
    if (!isWebhookProcessed(order, eventId)) {
      let next = markWebhookProcessed(order, eventId);
      next = { ...next, email: email ?? next.email, lsOrderId: lsOrderId || next.lsOrderId };
      if (next.status !== 'paid' && next.status !== 'delivered') {
        next = applyTransition(next, 'paid');
      }
      await saveOrder(next);
    }
    // Fulfil synchronously. `deliverOrder` skips finished variants, so a retry after a
    // timeout resumes rather than restarts.
    await deliverOrder(orderId, origin);
    return json({ received: true }, 200);
  }

  if (eventName === 'order_refunded') {
    if (!isWebhookProcessed(order, eventId)) {
      const marked = markWebhookProcessed(order, eventId);
      await saveOrder(applyTransition(marked, 'refunded'));
      const urls: Array<string | undefined> = [];
      for (const v of Object.values(marked.variants)) {
        urls.push(v?.originalUrl, v?.hiResUrl);
      }
      await deleteImages(urls);
    }
    return json({ received: true }, 200);
  }

  // Any other event — acknowledge and ignore.
  return json({ received: true }, 200);
}
