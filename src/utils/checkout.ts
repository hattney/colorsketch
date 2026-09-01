import { formattedPrice } from '../config';

export type CheckoutMode = 'mock' | 'disabled' | 'live';

/**
 * The one seam Phase 2 replaces (`PHASE2_GUIDE.md` §3-2 / §4).
 *
 *   mock     — walks the whole free -> preview -> paid funnel locally, taking no money and
 *              asking for no card. For local work and for a staging link someone is reviewing.
 *   disabled — the honest state for a public build while AI retouch and payment do not exist:
 *              the price is shown, the button explains that checkout is not open yet, and
 *              nothing is unlocked.
 *   live     — Phase 2. POST /api/checkout, open the Lemon Squeezy overlay, and let the
 *              webhook — never the redirect — decide that the order is paid.
 *
 * The default is deliberately asymmetric. A dev server gets `mock` so the funnel is testable,
 * but a production build with nothing configured falls to `disabled`, because the failure that
 * actually matters is shipping a build that hands strangers a free "purchase" and calls it one.
 * Opting into mock on a deployed site takes an explicit VITE_CHECKOUT_MODE=mock.
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

/** Resolves true when the order is paid. */
export function startCheckout(): Promise<boolean> {
  if (CHECKOUT_MODE === 'mock') {
    return new Promise((resolve) => window.setTimeout(() => resolve(true), 700));
  }
  return Promise.resolve(false);
}

