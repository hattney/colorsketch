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

/**
 * The free edition: the in-browser converter on its own, with no AI stage and no checkout.
 *
 * It exists to answer one question before any money is spent on hosting — does anyone want
 * this? — and the converter is the part that can answer it for nothing, because it never
 * touches a server. Built with `vite build --mode free` and served as static files. Where
 * the full edition offers the AI retouch, this one asks for an email instead, which measures
 * the same intent without a model call or a payment processor behind it.
 */
export const FREE_ONLY = import.meta.env.MODE === 'free';
