/**
 * `/api/waitlist` — the free edition's only server-side code, a Cloudflare Pages Function.
 *
 *   POST  { email, source, hard, website }   → stores one address
 *   GET   ?token=…                           → the list, for whoever holds ADMIN_TOKEN
 *
 * It stores an email address and three facts about the moment it was given: when, which
 * invitation was answered, and whether the page on screen had been flagged as a hard photo.
 * Nothing else. No IP address is kept — the one used for rate limiting is hashed and expires
 * within the hour — because the list exists to count intent, not to describe people.
 *
 * The types below are the handful of Workers shapes this file touches, declared here so the
 * repo does not need the Workers type package for one function.
 */
interface KV {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void>;
  list(opts: {
    prefix?: string;
    cursor?: string;
  }): Promise<{
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY = 2048;
/** Signups one address may make per hour — generous for a household, useless for a script. */
const PER_IP_PER_HOUR = 5;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Length-independent comparison, so the token cannot be recovered a character at a time. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  if (!env.WAITLIST) return json({ error: 'Waitlist is not configured.' }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Too large.' }, 413);

  let body: { email?: unknown; source?: unknown; hard?: unknown; website?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }

  // A filled honeypot is a bot. It is told it succeeded, so it has nothing to adapt to.
  if (typeof body.website === 'string' && body.website.trim() !== '') return json({ ok: true }, 200);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) return json({ error: 'Invalid email.' }, 400);

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rlKey = `rl:${(await sha256(ip)).slice(0, 32)}`;
  const used = Number((await env.WAITLIST.get(rlKey)) ?? '0');
  if (used >= PER_IP_PER_HOUR) return json({ error: 'Too many requests.' }, 429);

  const key = `e:${email}`;
  // Signing up twice is not an error and not a second signup: the first date is the true one.
  if ((await env.WAITLIST.get(key)) === null) {
    const entry = {
      at: new Date().toISOString(),
      source: body.source === 'samples' ? 'samples' : 'editor',
      hard: body.hard === true,
    };
    await env.WAITLIST.put(key, JSON.stringify(entry), { metadata: entry });
  }
  await env.WAITLIST.put(rlKey, String(used + 1), { expirationTtl: 3600 });

  return json({ ok: true }, 200);
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

  const entries: { email: string; at?: string; source?: string; hard?: boolean }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.WAITLIST.list({ prefix: 'e:', cursor });
    for (const k of page.keys) {
      const meta = (k.metadata ?? {}) as { at?: string; source?: string; hard?: boolean };
      entries.push({ email: k.name.slice(2), ...meta });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  entries.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  return json(
    {
      count: entries.length,
      fromHardPhotos: entries.filter((e) => e.hard).length,
      bySource: {
        editor: entries.filter((e) => e.source === 'editor').length,
        samples: entries.filter((e) => e.source === 'samples').length,
      },
      entries,
    },
    200,
  );
};
