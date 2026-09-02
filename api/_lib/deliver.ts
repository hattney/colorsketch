/**
 * Paid-order fulfilment (PHASE2_GUIDE.md §3-3, §(A)).
 *
 * "결제 이후에는 외부 AI API를 절대 호출하지 않는다." This does no model calls — it takes the
 * watermark-free originals saved at preview time and upscales them to A4 300 DPI. A dead model
 * provider cannot strand a paid order.
 *
 * Idempotent and resumable: a variant that already has a `hiResUrl` is skipped, and progress
 * is saved after every variant. Both a Lemon Squeezy webhook retry and a `/api/download` poll
 * can safely re-enter this, and a timeout mid-run picks up where it left off.
 */
import { StyleVariant } from '../../src/utils/prompt.js';
import { orderImagePath, putBytes } from './blob.js';
import { sendAdminFailureAlert, sendBuyerDeliveryEmail, sendBuyerFailureApology } from './email.js';
import { applyTransition, loadOrder, saveOrder, type OrderRecord } from './order.js';
import { upscaleToA4 } from './image.js';

const VARIANTS: StyleVariant[] = ['simple', 'detailed'];
const MAX_DELIVERY_ATTEMPTS = 3;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function markFailed(order: OrderRecord, reason: string): Promise<void> {
  console.error('order delivery failed for good', order.orderId, reason);
  if (order.status === 'failed') return;
  const failed = await saveOrder(applyTransition(order, 'failed'));
  await sendAdminFailureAlert(failed, reason);
  await sendBuyerFailureApology(failed);
}

/**
 * Runs one fulfilment pass for `orderId`. Safe to call repeatedly.
 * `origin` is used only for the download link in the buyer email.
 */
export async function deliverOrder(orderId: string, origin: string): Promise<void> {
  let order = await loadOrder(orderId);
  if (!order) return;
  if (order.status === 'delivered' || order.status === 'refunded') return;
  if (order.status !== 'paid' && order.status !== 'failed') return;

  for (const variant of VARIANTS) {
    // Re-read each iteration so a concurrent refund stops us.
    order = (await loadOrder(orderId)) ?? order;
    if (order.status === 'refunded') return;

    const asset = order.variants[variant];
    if (!asset?.originalUrl) {
      await markFailed(order, `no stored original for ${variant}`);
      return;
    }
    if (asset.hiResUrl) continue;

    try {
      const src = await fetchBytes(asset.originalUrl);
      const hires = await upscaleToA4(src);
      const url = await putBytes(orderImagePath(orderId, variant, 'hires'), hires, {
        contentType: 'image/png',
        addRandomSuffix: false,
      });
      order = await saveOrder({
        ...order,
        variants: { ...order.variants, [variant]: { ...asset, hiResUrl: url } },
      });
    } catch (e) {
      const attempts = order.attempts + 1;
      console.error(`deliver ${orderId} ${variant} attempt ${attempts} failed`, e);
      if (attempts >= MAX_DELIVERY_ATTEMPTS) {
        await markFailed({ ...order, attempts }, e instanceof Error ? e.message : String(e));
      } else {
        await saveOrder({ ...order, attempts });
      }
      return; // a webhook retry or a /thanks poll re-enters and continues
    }
  }

  order = (await loadOrder(orderId)) ?? order;
  if (order.status === 'refunded' || order.status === 'delivered') return;

  const delivered = await saveOrder(applyTransition(order, 'delivered'));
  await sendBuyerDeliveryEmail(delivered, origin);
}
