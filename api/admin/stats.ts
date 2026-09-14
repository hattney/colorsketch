/**
 * GET /api/admin/stats — what the shop earned and what it spent.
 *
 * Behind `ADMIN_TOKEN` because it exposes trading figures, not customer data. Unset token
 * means the endpoint is closed rather than open: the failure that matters here is publishing
 * revenue by accident, so a missing secret must not degrade into "no check".
 *
 * Read-only. It reports counters recorded elsewhere and the money derived from them, so the
 * numbers cannot drift from what actually happened — the counts are the source, the prices
 * are settings (see `_lib/ledger.ts`).
 */
import {
  money,
  priceBook,
  readDay,
  readRecent,
  readTotals,
  todayUtc,
  type LedgerCounters,
} from '../_lib/ledger.js';
import { RedisNotConfigured } from '../_lib/redis.js';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function authorized(req: Request, token: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const query = new URL(req.url).searchParams.get('token') ?? '';
  const given = bearer || query;
  // Length check first: timingSafeEqual throws on a mismatch, and the length is not a secret.
  return given.length === token.length && given === token;
}

/** The last `n` UTC dates, most recent first. */
function recentDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    out.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

function withMoney(label: string, c: LedgerCounters) {
  return { period: label, counts: c, money: money(c) };
}

export async function GET(req: Request): Promise<Response> {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return json({ error: 'Stats are not configured on this deployment.' }, 503);
  if (!authorized(req, token)) return json({ error: 'Unauthorized' }, 401);

  try {
    const days = recentDays(7);
    const [totals, recent, ...dayRows] = await Promise.all([
      readTotals(),
      readRecent(),
      ...days.map((d) => readDay(d)),
    ]);

    return json(
      {
        generatedAt: new Date().toISOString(),
        prices: priceBook(),
        allTime: withMoney('all time', totals),
        today: withMoney(todayUtc(), dayRows[0]),
        last7Days: days.map((d, i) => withMoney(d, dayRows[i])),
        recent,
        note:
          'modelCalls is the number of images the model produced and is what AI cost is derived from. cachedHits were served without a model call.',
      },
      200,
    );
  } catch (e) {
    if (e instanceof RedisNotConfigured) {
      return json({ error: 'No store configured, so nothing has been recorded.' }, 503);
    }
    console.error('stats failed', e);
    return json({ error: 'Could not read stats.' }, 500);
  }
}
