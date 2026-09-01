/** Contact address shown in the footer, FAQ and refund policy (CONTENT_UPDATE.md §6). */
export const CONTACT_EMAIL = 'gold.auri26@gmail.com';

/**
 * Price of one HD purchase, in USD. One payment buys BOTH style variants
 * (Simple + Detailed) at A4 300 DPI — see CONTENT_UPDATE.md §7.
 *
 * Set here and nowhere else, so a price test only ever touches this line.
 * Every string that shows money reads `formattedPrice()`.
 */
export const PRICE_USD: number | null = 2.99;

export const formattedPrice = (): string | null =>
  PRICE_USD === null ? null : `$${PRICE_USD.toFixed(2)}`;
