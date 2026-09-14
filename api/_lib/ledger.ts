/**
 * What the business actually made and spent, per day and in total.
 *
 * Two numbers decide whether this product works at $2.99: what Lemon Squeezy pays out, and
 * what the model cost to produce the pages. Both are recorded as *facts* rather than
 * estimates — `renderVariant` already reports whether a variant came from cache, so the call
 * count is counted, not guessed, and the sale amount comes from the webhook payload.
 *
 * The per-call price is deliberately a setting (`AI_COST_PER_IMAGE_USD`) instead of a constant.
 * Provider pricing changes, and a number baked into the source would go stale silently and
 * make every historical figure wrong at once. Counts are durable; prices are opinions.
 *
 * Every write here is best-effort. Accounting must never be the reason a buyer's request
 * fails, so a Redis outage loses a row rather than an order.
 */
import { RedisNotConfigured, redisCommand, redisGetJSON, redisSetJSON } from './redis.js';

/** Roughly 13 months, so a year-over-year look back still has data. */
const DAY_TTL_SECONDS = 400 * 24 * 60 * 60;

const TOTALS_KEY = 'ledger:totals';
const dayKey = (d: string) => `ledger:day:${d}`;
const RECENT_KEY = 'ledger:recent';
const RECENT_MAX = 50;

export interface LedgerCounters {
  /** Preview requests that reached the model step (cache hits included). */
  previewRequests: number;
  /** Images the model actually produced. This is what costs money. */
  modelCalls: number;
  /** Images served from cache. These are the calls we did not pay for. */
  cachedHits: number;
  /** Regeneration requests from buyers after payment. */
  regenRequests: number;
  /** Orders that reached `paid`. */
  paidOrders: number;
  /** Gross revenue in USD cents, as reported by the payment webhook. */
  grossCents: number;
  /** Refunded orders. */
  refundedOrders: number;
  /** Refunded amount in USD cents. */
  refundedCents: number;
}

const EMPTY: LedgerCounters = {
  previewRequests: 0,
  modelCalls: 0,
  cachedHits: 0,
  regenRequests: 0,
  paidOrders: 0,
  grossCents: 0,
  refundedOrders: 0,
  refundedCents: 0,
};

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function add(base: LedgerCounters | null, delta: Partial<LedgerCounters>): LedgerCounters {
  const out = { ...EMPTY, ...(base ?? {}) };
  for (const k of Object.keys(EMPTY) as (keyof LedgerCounters)[]) {
    out[k] = (out[k] ?? 0) + (delta[k] ?? 0);
  }
  return out;
}

/**
 * Adds to today's bucket and the running total.
 *
 * Read-modify-write rather than INCR: the shape is a handful of fields that are always read
 * together, and at this volume a lost concurrent increment costs a row in a report, not money.
 */
async function bump(delta: Partial<LedgerCounters>): Promise<void> {
  try {
    const day = todayUtc();
    const [totals, today] = await Promise.all([
      redisGetJSON<LedgerCounters>(TOTALS_KEY),
      redisGetJSON<LedgerCounters>(dayKey(day)),
    ]);
    await Promise.all([
      redisSetJSON(TOTALS_KEY, add(totals, delta)),
      redisSetJSON(dayKey(day), add(today, delta), DAY_TTL_SECONDS),
    ]);
  } catch (e) {
    if (!(e instanceof RedisNotConfigured)) console.error('ledger bump failed', e);
  }
}

export interface RecentEntry {
  at: string;
  kind: 'preview' | 'regen' | 'paid' | 'refunded';
  orderId?: string;
  modelCalls?: number;
  cachedHits?: number;
  cents?: number;
}

async function pushRecent(entry: RecentEntry): Promise<void> {
  try {
    await redisCommand(['LPUSH', RECENT_KEY, JSON.stringify(entry)]);
    await redisCommand(['LTRIM', RECENT_KEY, 0, RECENT_MAX - 1]);
  } catch (e) {
    if (!(e instanceof RedisNotConfigured)) console.error('ledger recent failed', e);
  }
}

/** One preview request: `modelCalls` images paid for, `cachedHits` served free. */
export async function recordPreview(
  modelCalls: number,
  cachedHits: number,
  orderId?: string,
): Promise<void> {
  await bump({ previewRequests: 1, modelCalls, cachedHits });
  await pushRecent({ at: new Date().toISOString(), kind: 'preview', orderId, modelCalls, cachedHits });
}

/** One post-purchase regeneration. Always costs model calls — the cache is bypassed by design. */
export async function recordRegen(
  modelCalls: number,
  cachedHits: number,
  orderId: string,
): Promise<void> {
  await bump({ regenRequests: 1, modelCalls, cachedHits });
  await pushRecent({ at: new Date().toISOString(), kind: 'regen', orderId, modelCalls, cachedHits });
}

export async function recordSale(orderId: string, cents: number): Promise<void> {
  await bump({ paidOrders: 1, grossCents: cents });
  await pushRecent({ at: new Date().toISOString(), kind: 'paid', orderId, cents });
}

export async function recordRefund(orderId: string, cents: number): Promise<void> {
  await bump({ refundedOrders: 1, refundedCents: cents });
  await pushRecent({ at: new Date().toISOString(), kind: 'refunded', orderId, cents });
}

export async function readTotals(): Promise<LedgerCounters> {
  return (await redisGetJSON<LedgerCounters>(TOTALS_KEY)) ?? EMPTY;
}

export async function readDay(day: string): Promise<LedgerCounters> {
  return (await redisGetJSON<LedgerCounters>(dayKey(day))) ?? EMPTY;
}

export async function readRecent(): Promise<RecentEntry[]> {
  try {
    const rows = await redisCommand<string[]>(['LRANGE', RECENT_KEY, 0, RECENT_MAX - 1]);
    return (rows ?? [])
      .map((r) => {
        try {
          return JSON.parse(r) as RecentEntry;
        } catch {
          return null;
        }
      })
      .filter((r): r is RecentEntry => r !== null);
  } catch (e) {
    if (!(e instanceof RedisNotConfigured)) console.error('ledger recent read failed', e);
    return [];
  }
}

const num = (raw: string | undefined, fallback: number) => {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Money derived from the counts.
 *
 * Defaults are the published figures at the time of writing; override them with env vars
 * rather than editing this file, so a price change does not need a deploy to be *correct*,
 * only to be applied.
 */
export function priceBook() {
  return {
    /** Per image the model produced. `gemini-2.5-flash-image` list price. */
    aiCostPerImageUsd: num(process.env.AI_COST_PER_IMAGE_USD, 0.039),
    /** Lemon Squeezy takes a percentage plus a fixed fee on each sale. */
    payoutPercent: num(process.env.PAYOUT_PERCENT, 5),
    payoutFixedUsd: num(process.env.PAYOUT_FIXED_USD, 0.5),
  };
}

export interface Money {
  grossUsd: number;
  refundedUsd: number;
  payoutFeesUsd: number;
  aiCostUsd: number;
  netUsd: number;
}

export function money(c: LedgerCounters): Money {
  const p = priceBook();
  const grossUsd = c.grossCents / 100;
  const refundedUsd = c.refundedCents / 100;
  // Fees are charged per sale; refunded sales still paid one.
  const payoutFeesUsd = c.paidOrders * ((grossUsd / Math.max(1, c.paidOrders)) * (p.payoutPercent / 100) + p.payoutFixedUsd);
  const aiCostUsd = c.modelCalls * p.aiCostPerImageUsd;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    grossUsd: round(grossUsd),
    refundedUsd: round(refundedUsd),
    payoutFeesUsd: round(payoutFeesUsd),
    aiCostUsd: round(aiCostUsd),
    netUsd: round(grossUsd - refundedUsd - payoutFeesUsd - aiCostUsd),
  };
}
