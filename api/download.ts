import { CONTACT_EMAIL } from '../src/config';
import { deliverOrder } from './_lib/deliver';
import { loadOrder } from './_lib/order';
import { redisAcquireLock, redisReleaseLock } from './_lib/redis';
import type { StyleVariant } from '../src/utils/prompt';
import {
  DOWNLOAD_LIMIT,
  DOWNLOAD_WINDOW_SECONDS,
  checkRateLimit,
  clientIp,
  consumeRateLimit,
} from './_lib/ratelimit';

/**
 * GET /api/download?order={orderId}&variant={simple|detailed} — the gate on the paid files
 * (PHASE2_GUIDE.md §3-4).
 *
 * The orderId is the only credential (21-char nanoid, unguessable) plus a 20/hour IP limit.
 *
 *   delivered + variant   → 302 to the Blob URL with ?download=1 (Vercel Blob has no signed
 *                           URLs; this endpoint checking the status first is the gate)
 *   delivered, no variant → { status: 'delivered', variants: { simple, detailed } } so the
 *                           /thanks page can wire up its download and print buttons
 *   paid / failed         → run one fulfilment pass (under a lock), then report processing /
 *                           failed. This is the retry driver when Lemon Squeezy stops resending.
 *   checkout_pending      → processing (payment in flight, webhook not in yet)
 *   previewed / created   → not_paid ; refunded → 410 ; unknown → 404
 */
export const maxDuration = 60;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const VARIANTS: StyleVariant[] = ['simple', 'detailed'];

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const orderId = url.searchParams.get('order') ?? '';
  const variantParam = url.searchParams.get('variant');
  const variant: StyleVariant | null =
    variantParam === 'simple' || variantParam === 'detailed' ? variantParam : null;

  if (!orderId) return json({ status: 'not_found' }, 404);

  const ip = clientIp(req);
  const gate = await checkRateLimit('download', ip, DOWNLOAD_LIMIT);
  if (!gate.allowed) {
    return json({ status: 'rate_limited', retryAfterMs: gate.retryAfterMs }, 429);
  }
  await consumeRateLimit('download', ip, DOWNLOAD_WINDOW_SECONDS);

  let order = await loadOrder(orderId);
  if (!order) return json({ status: 'not_found' }, 404);
  if (order.status === 'refunded') return json({ status: 'refunded' }, 410);
  if (order.status === 'created' || order.status === 'previewed') {
    return json({ status: 'not_paid' }, 404);
  }
  if (order.status === 'checkout_pending') {
    return json({ status: 'processing' }, 200);
  }

  // paid or failed: drive fulfilment, then fall through on whatever state it lands in.
  if (order.status === 'paid' || order.status === 'failed') {
    const origin = `https://${req.headers.get('host') ?? ''}`;
    if (await redisAcquireLock(`deliver:${orderId}`, 45)) {
      try {
        await deliverOrder(orderId, origin);
      } finally {
        await redisReleaseLock(`deliver:${orderId}`);
      }
    }
    order = (await loadOrder(orderId)) ?? order;
    if (order.status === 'paid' || order.status === 'checkout_pending') {
      return json({ status: 'processing' }, 200);
    }
    if (order.status === 'failed') {
      return json({ status: 'failed', contact: CONTACT_EMAIL }, 200);
    }
  }

  if (order.status === 'delivered') {
    if (variant) {
      const target = order.variants[variant]?.hiResUrl;
      if (!target) return json({ status: 'processing' }, 200);
      return new Response(null, {
        status: 302,
        headers: { location: `${target}?download=1`, 'cache-control': 'no-store' },
      });
    }
    const variants: Partial<Record<StyleVariant, string>> = {};
    for (const v of VARIANTS) {
      const u = order.variants[v]?.hiResUrl;
      if (u) variants[v] = u;
    }
    return json({ status: 'delivered', orderId, variants }, 200);
  }

  return json({ status: 'not_found' }, 404);
}
