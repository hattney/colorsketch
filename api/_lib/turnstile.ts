/**
 * Cloudflare Turnstile server verification (PHASE2_GUIDE.md §3-1 step 1).
 *
 * Skips cleanly when `TURNSTILE_SECRET_KEY` is unset, so `/api/ai-preview` still works on a
 * deployment that has the model key but no bot check yet. Once the secret is set, a request
 * with a missing or invalid token is rejected.
 */
const SECRET = process.env.TURNSTILE_SECRET_KEY;
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileEnabled(): boolean {
  return Boolean(SECRET);
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  if (!SECRET) return true; // not configured — nothing to check
  if (!token) return false;

  const form = new URLSearchParams();
  form.set('secret', SECRET);
  form.set('response', token);
  if (ip && ip !== '0.0.0.0') form.set('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
