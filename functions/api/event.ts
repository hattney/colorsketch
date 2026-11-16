/**
 * `/api/event` — counts what visitors do with the converter, a Cloudflare Pages Function.
 *
 *   POST  { event }      → adds one to today's count for that event
 *   GET   ?token=…       → the counts by day, for whoever holds ADMIN_TOKEN
 *
 * Web Analytics says how many people arrived; this says how many of them used the thing.
 * The events are:
 *
 *   open      an image was loaded into the editor (a conversion happened)
 *   hard      that image was flagged as a hard photo, the case the AI retouch is meant for
 *   download  the page was downloaded
 *   print     the page was sent to the printer
 *
 * Only a day and a number are stored. No image, no IP address, nothing that tells one visitor
 * from another — the free edition promises the photo never leaves the device, and a counter
 * has no reason to know who clicked.
 *
 * Counts live in the same KV namespace as the waitlist, one key per day and event
 * (`n:2026-11-16:download`), with the number repeated in the key's metadata so the report can
 * be built from a single listing. KV's read-then-write is not atomic, so two clicks in the
 * same instant can count as one; at this site's traffic that is noise, not error.
 */
interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { metadata?: unknown }): Promise<void>;
  list(opts: { prefix?: string; cursor?: string }): Promise<{
    keys: { name: string; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

interface Env {
  WAITLIST?: KV;
  ADMIN_TOKEN?: string;
}

interface Ctx {
  request: Request;
  env: Env;
}

const EVENTS = ['open', 'hard', 'download', 'print'] as const;
type EventName = (typeof EVENTS)[number];
const MAX_BODY = 256;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Same comparison as the waitlist's: length-independent, so the token leaks nothing. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const isEvent = (v: unknown): v is EventName =>
  typeof v === 'string' && (EVENTS as readonly string[]).includes(v);

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  if (!env.WAITLIST) return json({ error: 'Not configured.' }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Too large.' }, 413);

  let event: unknown;
  try {
    event = JSON.parse(raw).event;
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }
  if (!isEvent(event)) return json({ error: 'Unknown event.' }, 400);

  // UTC days, so a day in the report means the same thing wherever it is read from.
  const day = new Date().toISOString().slice(0, 10);
  const key = `n:${day}:${event}`;
  const n = Number((await env.WAITLIST.get(key)) ?? '0') + 1;
  await env.WAITLIST.put(key, String(n), { metadata: { n } });

  return new Response(null, { status: 204 });
};

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  // Closed, not open, when no token has been set: an unset secret must never mean "anyone".
  if (!env.ADMIN_TOKEN || !env.WAITLIST) return json({ error: 'Not configured.' }, 503);

  const url = new URL(request.url);
  const given =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    url.searchParams.get('token') ??
    '';
  if (!(await sameSecret(given, env.ADMIN_TOKEN))) return json({ error: 'Unauthorized.' }, 401);

  const blank = (): Record<EventName, number> => ({ open: 0, hard: 0, download: 0, print: 0 });
  const byDay = new Map<string, Record<EventName, number>>();
  let cursor: string | undefined;
  do {
    const page = await env.WAITLIST.list({ prefix: 'n:', cursor });
    for (const k of page.keys) {
      const [, day, event] = k.name.split(':');
      if (!day || !isEvent(event)) continue;
      const n = Number((k.metadata as { n?: number } | undefined)?.n ?? 0);
      const row = byDay.get(day) ?? blank();
      row[event] += n;
      byDay.set(day, row);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, counts]) => ({ day, ...counts }));
  const totals = blank();
  for (const d of days) for (const e of EVENTS) totals[e] += d[e];

  return json({ totals, days }, 200);
};
