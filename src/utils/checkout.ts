import { formattedPrice } from '../config';

export type CheckoutMode = 'mock' | 'disabled' | 'live';

/**
 * The one seam Phase 2 replaces (`PHASE2_GUIDE.md` §3-2 / §4).
 *
 *   mock     — walks the whole free -> preview -> paid funnel locally, taking no money and
 *              asking for no card. For local work and for a staging link someone is reviewing.
 *   disabled — the honest state for a public build while payment is not wired: the price is
 *              shown, the button explains that checkout is not open yet, and nothing unlocks.
 *   live     — POST /api/checkout, then a full-page redirect to the Lemon Squeezy hosted
 *              checkout. After payment LS returns the buyer to /thanks?order=…, which polls
 *              /api/download — the webhook, never this redirect, is what marks the order paid.
 *
 * The default is deliberately asymmetric. A dev server gets `mock` so the funnel is testable,
 * but a production build with nothing configured falls to `disabled`, because the failure that
 * actually matters is shipping a build that hands strangers a free "purchase" and calls it one.
 * Opting into mock on a deployed site takes an explicit VITE_CHECKOUT_MODE=mock.
 *
 * Overlay note: the guide mentions the lemon.js overlay. A plain redirect is used instead —
 * it cannot leave the button stuck when the shopper closes a popup, and /thanks is the return
 * target either way. The overlay can be layered back on later without touching the server.
 */
const configured = import.meta.env.VITE_CHECKOUT_MODE as CheckoutMode | undefined;

export const CHECKOUT_MODE: CheckoutMode =
  configured ?? (import.meta.env.DEV ? 'mock' : 'disabled');

export const isMockCheckout = CHECKOUT_MODE === 'mock';
export const isCheckoutOpen = CHECKOUT_MODE !== 'disabled';

export const MOCK_NOTICE =
  'Test mode — no payment is taken and no card is asked for. This button stands in for the real checkout.';

export const DISABLED_NOTICE =
  'AI retouch is not open yet. Nothing is for sale on this build, and the free A4 download is unaffected.';

export function checkoutLabel(): string {
  if (CHECKOUT_MODE === 'disabled') return 'Not available yet';
  const price = formattedPrice();
  const base = price ? `Unlock both HD pages — ${price}` : 'Unlock both HD pages';
  return isMockCheckout ? `${base} (test)` : base;
}

export type CheckoutOutcome =
  | { status: 'paid' } // mock only — the caller unlocks the HD stage in place
  | { status: 'redirecting' } // live — the page is already navigating away
  | { status: 'unavailable' } // disabled, or the endpoint is not configured
  | { status: 'error'; message: string };

/**
 * Starts checkout for `orderId` (the id `/api/ai-preview` returned). Resolves `paid` only in
 * mock mode; in live mode it kicks off a redirect and resolves `redirecting`, and the browser
 * leaves this page.
 */
export async function startCheckout(orderId: string | null): Promise<CheckoutOutcome> {
  if (CHECKOUT_MODE === 'disabled') return { status: 'unavailable' };

  if (CHECKOUT_MODE === 'mock') {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { status: 'paid' };
  }

  // live
  if (!orderId) {
    return { status: 'error', message: 'Generate your two previews again, then checkout.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
  } catch {
    return { status: 'error', message: 'Could not reach checkout. Please try again.' };
  }

  const body = (await res.json().catch(() => null)) as
    | { checkoutUrl?: string; error?: string; alreadyPaid?: boolean }
    | null;

  if (res.status === 503) return { status: 'unavailable' };
  if (res.status === 409 && body?.alreadyPaid) {
    window.location.assign(`/thanks?order=${encodeURIComponent(orderId)}`);
    return { status: 'redirecting' };
  }
  if (!res.ok || !body?.checkoutUrl) {
    return { status: 'error', message: body?.error || 'Checkout could not be opened. Please try again.' };
  }

  window.location.assign(body.checkoutUrl);
  return { status: 'redirecting' };
}
