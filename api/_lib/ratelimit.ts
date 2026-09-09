/**
 * IP rate limiting (PHASE2_GUIDE.md §3-1 step 2, §3-4).
 *
 * Two rules from the guide shape this:
 *
 *   - "요청 1회 = 2장" — one request is one unit, not two. The caller increments once per
 *     request, never per variant.
 *   - "카운트는 성공 시에만 증가" — a failed generation must not burn a free preview. So the
 *     check is read-only; the caller consumes a slot only after a 200 is certain.
 *
 * `claimFreshInput` adds one thing the guide implies but does not spell out: re-requesting the
 * *same* photo + subject inside the window (a reload, a closed tab) returns the cached pair
 * without spending a slot. Only a genuinely new input costs one.
 *
 * Degrades to "no limit" when Redis is not configured, so `/api/ai-preview` keeps working on a
 * deployment that has the model key but not Upstash yet.
 */
import { RedisNotConfigured, redisCommand, redisIncrementWithWindow, redisTtlMs } from './redis.js';

export const PREVIEW_LIMIT = 3;
export const PREVIEW_WINDOW_SECONDS = 24 * 60 * 60;

export const DOWNLOAD_LIMIT = 20;
export const DOWNLOAD_WINDOW_SECONDS = 60 * 60;

/**
 * Status polls are counted separately from file handouts.
 *
 * `/thanks` polls `/api/download` without a variant while it waits for fulfilment. Charging
 * those to the same 20/h bucket as the files meant a buyer whose order took longer than a
 * minute burned the whole allowance waiting and could then not download at all — the one way
 * this design could take someone's money and leave them with nothing. Reading a status is
 * cheap and safe to repeat; handing out the file is the thing worth rationing.
 */
export const STATUS_LIMIT = 120;
export const STATUS_WINDOW_SECONDS = 60 * 60;

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the window resets, when blocked. */
  retryAfterMs: number | null;
}

/** The real client IP behind Vercel's proxy. Falls back to a constant so the limiter still groups. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

/** Read-only: does this IP have a slot left? Never mutates the counter. */
export async function checkRateLimit(
  namespace: string,
  ip: string,
  limit: number,
): Promise<RateLimitCheck> {
  const key = `ratelimit:${namespace}:${ip}`;
  try {
    const raw = await redisCommand<string | null>(['GET', key]);
    const count = raw ? Number(raw) : 0;
    if (count >= limit) {
      return { allowed: false, remaining: 0, retryAfterMs: await redisTtlMs(key) };
    }
    return { allowed: true, remaining: limit - count, retryAfterMs: null };
  } catch (e) {
    if (e instanceof RedisNotConfigured) return { allowed: true, remaining: limit, retryAfterMs: null };
    throw e;
  }
}

/** Consume one slot. Call only once a successful response is certain. Returns the new count. */
export async function consumeRateLimit(
  namespace: string,
  ip: string,
  windowSeconds: number,
): Promise<number> {
  try {
    return await redisIncrementWithWindow(`ratelimit:${namespace}:${ip}`, windowSeconds);
  } catch (e) {
    if (e instanceof RedisNotConfigured) return 0;
    throw e;
  }
}

/**
 * True when this (ip, image, subject) has not been served in the window — i.e. the caller
 * should count it against the limit. False for a repeat, which is answered from cache for free.
 * Sets the marker atomically, so two racing requests cannot both be counted.
 */
export async function claimFreshInput(
  ip: string,
  imageHash: string,
  subjectKey: string,
  windowSeconds: number,
): Promise<boolean> {
  const key = `served:${ip}:${imageHash}:${subjectKey}`;
  try {
    const res = await redisCommand<string | null>([
      'SET',
      key,
      '1',
      'EX',
      Math.floor(windowSeconds),
      'NX',
    ]);
    return res === 'OK';
  } catch (e) {
    if (e instanceof RedisNotConfigured) return false; // no store → never count → never block
    throw e;
  }
}
