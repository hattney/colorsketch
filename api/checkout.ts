import { applyTransition, loadOrder, saveOrder } from './_lib/order.js';
import { redisConfigured } from './_lib/redis.js';

/**
 * POST /api/checkout — open a Lemon Squeezy checkout for an existing order (PHASE2_GUIDE.md §3-2).
 *
 * Body: `{ orderId }`. The order must already be `previewed` — i.e. `/api/ai-preview` ran,
 * the model produced both pages, and the watermark-free originals are on Blob. The order id
 * travels in `checkout_data.custom.order_id`; the webhook reads it back to decide what to
 * deliver, so the browser never has to survive the round trip (§(B)).
 *
 * This endpoint does NOT mark anything paid. Only the webhook does that.
 */
export const maxDuration = 30;

const LS_CHECKOUT_API = 'https://api.lemonsqueezy.com/v1/checkouts';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;
  if (!apiKey || !storeId || !variantId || !redisConfigured()) {
    return json({ error: 'Checkout is not open on this deployment yet.' }, 503);
  }

  let body: { orderId?: unknown };
  try {
    body = (await req.json()) as { orderId?: unknown };
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  if (!orderId) return json({ error: 'Missing order.' }, 400);

  const order = await loadOrder(orderId);
  if (!order) {
    return json(
      { error: 'That preview has expired. Generate your two previews again to buy them.' },
      404,
    );
  }
  if (!order.fromModel) {
    return json(
      { error: 'These previews were traced in your browser, not by AI — there is no HD page to buy.' },
      409,
    );
  }
  if (order.status === 'paid' || order.status === 'delivered') {
    return json({ error: 'This order is already paid.', alreadyPaid: true }, 409);
  }
  if (order.status !== 'previewed' && order.status !== 'checkout_pending') {
    return json({ error: 'This order can no longer be checked out.' }, 409);
  }

  const origin = req.headers.get('origin') || `https://${req.headers.get('host') ?? ''}`;

  let lsRes: Response;
  try {
    lsRes = await fetch(LS_CHECKOUT_API, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/vnd.api+json',
        'content-type': 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            // LS requires custom values to be strings; orderId already is one.
            checkout_data: { custom: { order_id: orderId } },
            checkout_options: { embed: false },
            product_options: {
              redirect_url: `${origin}/thanks?order=${orderId}`,
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: String(storeId) } },
            variant: { data: { type: 'variants', id: String(variantId) } },
          },
        },
      }),
    });
  } catch {
    return json({ error: 'Could not reach checkout. Please try again.' }, 502);
  }

  if (!lsRes.ok) {
    console.error('LS checkout create failed', lsRes.status, await lsRes.text().catch(() => ''));
    return json({ error: 'Checkout could not be opened. Please try again.' }, 502);
  }

  const payload = (await lsRes.json().catch(() => null)) as
    | { data?: { attributes?: { url?: string } } }
    | null;
  const checkoutUrl = payload?.data?.attributes?.url;
  if (!checkoutUrl) {
    return json({ error: 'Checkout could not be opened. Please try again.' }, 502);
  }

  if (order.status === 'previewed') {
    await saveOrder(applyTransition(order, 'checkout_pending'));
  }

  return json({ checkoutUrl }, 200);
}
