import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget (PHASE2_GUIDE.md §3-1 step 1, §4).
 *
 * Renders nothing and reports no token when `VITE_TURNSTILE_SITE_KEY` is unset — a dev server
 * or a deployment without the bot check. `/api/ai-preview` mirrors that: no secret, no check.
 *
 * `resetKey` is bumped by the parent after each generate attempt. A Turnstile token is
 * single-use, so the widget has to re-run for the next request; remounting on a changed key
 * is the simplest way to get a fresh challenge.
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const turnstileRequired = Boolean(TURNSTILE_SITE_KEY);

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function ensureScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
  if (existing) {
    return new Promise((resolve) => {
      if (window.turnstile) return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = 'true';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(s);
  });
}

interface TurnstileProps {
  onToken: (token: string | null) => void;
  resetKey: number;
}

export default function Turnstile({ onToken, resetKey }: TurnstileProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !boxRef.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    const box = boxRef.current;

    ensureScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId = window.turnstile.render(box, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => onToken(null));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          /* already gone */
        }
      }
    };
    // resetKey in deps: a bump remounts the widget for a fresh, single-use token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, onToken]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={boxRef} className="mb-3" />;
}
