/**
 * TEMPORARY diagnostic — remove once the FUNCTION_INVOCATION_FAILED cause is found.
 *
 * Loads every `_lib` module (and the two `src/` imports) via dynamic import inside a
 * try/catch, so a module that throws on load reports its error instead of crashing the
 * function. `api/checkout.ts` etc. do these as static top-level imports, so their crash
 * happens before any handler code runs and is invisible without runtime logs.
 */
export async function GET(): Promise<Response> {
  const results: Record<string, string> = {};
  const tries: Array<[string, () => Promise<unknown>]> = [
    ['runtime-node-version', async () => process.version],
    ['_lib/redis', () => import('./_lib/redis.js')],
    ['_lib/ids', () => import('./_lib/ids.js')],
    ['_lib/order', () => import('./_lib/order.js')],
    ['_lib/blob', () => import('./_lib/blob.js')],
    ['_lib/cache', () => import('./_lib/cache.js')],
    ['_lib/ratelimit', () => import('./_lib/ratelimit.js')],
    ['_lib/turnstile', () => import('./_lib/turnstile.js')],
    ['_lib/image', () => import('./_lib/image.js')],
    ['_lib/deliver', () => import('./_lib/deliver.js')],
    ['_lib/email', () => import('./_lib/email.js')],
    ['src/utils/prompt', () => import('../src/utils/prompt.js')],
    ['src/config', () => import('../src/config.js')],
  ];
  for (const [name, fn] of tries) {
    try {
      const v = await fn();
      results[name] = typeof v === 'string' ? v : 'ok';
    } catch (e) {
      results[name] =
        e instanceof Error ? `${e.name}: ${e.message}` : `non-error: ${String(e)}`;
    }
  }
  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
