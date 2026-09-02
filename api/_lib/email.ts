/**
 * Transactional email via Resend (PHASE2_GUIDE.md §3-3, §(B)).
 *
 * Every function here is best-effort: it returns void, swallows its own errors, and does
 * nothing at all when `RESEND_API_KEY` is unset. Email is a safety net, not the delivery
 * mechanism — the order record, the /thanks page and /order/{orderId} are the real ones.
 *
 * `RESEND_FROM` must be an address on a domain verified in Resend. Without a verified domain
 * Resend only delivers to the account owner's own address, which is enough for the admin
 * alert during testing but not for buyer mail.
 */
import { CONTACT_EMAIL } from '../../src/config';
import type { OrderRecord } from './order';

const API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const FROM = process.env.RESEND_FROM || 'ColorSketch <noreply@resend.dev>';

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!API_KEY || !to) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error('Resend send failed', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.error('Resend send threw', e);
  }
}

/** Sent the moment an order reaches `delivered`. The 1st safety net for the no-account model. */
export async function sendBuyerDeliveryEmail(order: OrderRecord, origin: string): Promise<void> {
  if (!order.email) return;
  const link = `${origin}/thanks?order=${encodeURIComponent(order.orderId)}`;
  await send(
    order.email,
    'Your ColorSketch HD coloring pages are ready',
    [
      '<p>Thanks for your purchase! Both HD styles are ready to download and print:</p>',
      `<p><a href="${link}">${link}</a></p>`,
      `<p>This link does not expire — open it any time to download the pages again. Order reference: <code>${order.orderId}</code>.</p>`,
      `<p>Questions? Reply to this email or write to ${CONTACT_EMAIL}.</p>`,
    ].join(''),
  );
}

/** Sent to the operator when an order exhausts its delivery attempts. */
export async function sendAdminFailureAlert(order: OrderRecord, reason: string): Promise<void> {
  if (!ADMIN_EMAIL) return;
  await send(
    ADMIN_EMAIL,
    `ColorSketch: order ${order.orderId} failed to deliver`,
    [
      `<p>Order <code>${order.orderId}</code> is <strong>paid</strong> but delivery failed after ${order.attempts} attempts.</p>`,
      `<p>Buyer: ${order.email ?? '(no email on record)'} · Lemon Squeezy order: ${order.lsOrderId ?? '(none)'}</p>`,
      `<p>Last error: <code>${reason}</code></p>`,
      '<p>Refund from the Lemon Squeezy dashboard if it cannot be recovered.</p>',
    ].join(''),
  );
}

/** Sent to the buyer when delivery has failed for good — apologise, promise a refund. */
export async function sendBuyerFailureApology(order: OrderRecord): Promise<void> {
  if (!order.email) return;
  await send(
    order.email,
    'A problem with your ColorSketch order',
    [
      '<p>Something went wrong preparing your HD pages, and we were not able to finish them.</p>',
      '<p>You have not been charged for a product you did not receive: a full refund is on its way, and no action is needed from you. It usually appears within a few business days.</p>',
      `<p>We are sorry for the trouble. If you have any questions, write to ${CONTACT_EMAIL} with reference <code>${order.orderId}</code>.</p>`,
    ].join(''),
  );
}
