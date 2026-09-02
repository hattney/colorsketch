import { del, list } from '@vercel/blob';

/**
 * Daily sweep of Blob storage (Terms §8: "automatically deleted within 7 days").
 *
 * Vercel Blob has no object TTL, so without this the deletion promise in the Terms and the
 * privacy pitch on the landing page would not be true. Redis order keys already expire on
 * their own 7-day TTL; this is only for the image bytes.
 *
 * Scheduled from `vercel.json` (`crons`). Vercel sends `Authorization: Bearer $CRON_SECRET`
 * when that env var is set; set it so the endpoint cannot be triggered by anyone.
 */
export const config = { runtime: 'nodejs', maxDuration: 60 };

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response('Blob not configured', { status: 503 });
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  let cursor: string | undefined;
  let removed = 0;

  do {
    const page = await list({ cursor, limit: 1000 });
    const stale = page.blobs
      .filter((b) => new Date(b.uploadedAt).getTime() < cutoff)
      .map((b) => b.url);
    if (stale.length) {
      await del(stale);
      removed += stale.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return new Response(JSON.stringify({ removed }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
