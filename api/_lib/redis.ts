/**
 * Upstash Redis over its REST API (PHASE2_GUIDE.md §1).
 *
 * A thin `fetch` wrapper rather than the `@upstash/redis` SDK: the surface we need is five
 * commands, the SDK pulls its own runtime shims, and keeping this dependency-free matches the
 * rest of `api/`. Everything above this file (`order.ts`, the rate limiter, the cache) is
 * written as pure functions that take plain values, so this is the only module that has to be
 * stubbed to test them.
 *
 * Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — both server-only, no `VITE_`.
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Thrown when the deployment has no Redis wired up. Callers decide whether that is fatal. */
export class RedisNotConfigured extends Error {
  constructor() {
    super('Upstash Redis is not configured on this deployment.');
    this.name = 'RedisNotConfigured';
  }
}

export function redisConfigured(): boolean {
  return Boolean(REST_URL && REST_TOKEN);
}

type Primitive = string | number;

/**
 * Runs one Redis command and returns its `result` field untouched.
 *
 * Upstash answers `{ result }` on success and `{ error }` on failure, both with HTTP 200 for
 * command-level errors, so the body has to be inspected either way.
 */
export async function redisCommand<T = unknown>(args: Primitive[]): Promise<T> {
  if (!REST_URL || !REST_TOKEN) throw new RedisNotConfigured();

  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${REST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    throw new Error(`Redis ${args[0]} failed with HTTP ${res.status}`);
  }
  const body = (await res.json()) as { result?: T; error?: string };
  if (body.error) throw new Error(`Redis ${args[0]} error: ${body.error}`);
  return body.result as T;
}

/** Runs several commands in one round trip. Order is preserved; each entry is `{ result }` or `{ error }`. */
export async function redisPipeline(commands: Primitive[][]): Promise<unknown[]> {
  if (!REST_URL || !REST_TOKEN) throw new RedisNotConfigured();

  const res = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${REST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis pipeline failed with HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  return rows.map((row, i) => {
    if (row.error) throw new Error(`Redis pipeline step ${i} (${commands[i][0]}): ${row.error}`);
    return row.result;
  });
}

export async function redisGetJSON<T>(key: string): Promise<T | null> {
  const raw = await redisCommand<string | null>(['GET', key]);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJSON(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const args: Primitive[] = ['SET', key, JSON.stringify(value)];
  if (ttlSeconds && ttlSeconds > 0) args.push('EX', Math.floor(ttlSeconds));
  await redisCommand(args);
}

export async function redisDel(key: string): Promise<void> {
  await redisCommand(['DEL', key]);
}

/**
 * `INCR` the key, and set its TTL on the first hit only, so a rolling window starts when the
 * first request in it lands and is not pushed forward by later ones. Returns the new count.
 */
export async function redisIncrementWithWindow(
  key: string,
  windowSeconds: number,
): Promise<number> {
  const [count] = (await redisPipeline([
    ['INCR', key],
    ['EXPIRE', key, Math.floor(windowSeconds), 'NX'],
  ])) as [number, unknown];
  return count;
}

/** Milliseconds until `key` expires, or `null` when it has no TTL / does not exist. */
export async function redisTtlMs(key: string): Promise<number | null> {
  const pttl = await redisCommand<number>(['PTTL', key]);
  return pttl >= 0 ? pttl : null;
}
