/**
 * Remembers the last order id in localStorage so a buyer who closes the tab can be brought
 * back to their pages (PHASE2_GUIDE.md §(B) 3). This is a convenience layer only — the
 * webhook, the delivery email and the /order page are the real safety nets, and every access
 * here is wrapped because private-mode browsers throw on localStorage.
 */
const KEY = 'colorsketch.order';

export function rememberOrder(orderId: string): void {
  try {
    localStorage.setItem(KEY, orderId);
  } catch {
    /* private mode / storage disabled */
  }
}

export function forgetOrder(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getRememberedOrder(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
