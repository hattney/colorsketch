import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget (PHASE2_GUIDE.md §3-1 step 1, §4).
 *
 * Renders nothing and reports no token when `VITE_TURNSTILE_SITE_KEY` is unset — a dev server
 * or a deployment without the bot check. `/api/ai-preview` mirrors that: no secret, no check.
 *
 * `resetKey` is bumped by the parent after each generate attempt, and again when someone asks
 * to retry a failed check. A Turnstile token is single-use, so the widget has to re-run for
 * the next request; remounting on a changed key is the simplest way to get a fresh challenge.
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const turnstileRequired = Boolean(TURNSTILE_SITE_KEY);

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * Error families Cloudflare documents as ours to fix rather than the visitor's to retry:
 * a sitekey that is wrong, disabled, or not allowed on this hostname. Retrying those is
 * pointless — the check is down for everyone until the dashboard is corrected — so they are
 * worth saying out loud instead of hiding behind "try again".
 */
const CONFIG_ERRORS = ['110100', '110110', '110200', '400020', '400070'];

export function isTurnstileConfigError(code: string | null): boolean {
  return Boolean(code && CONFIG_ERRORS.some((c) => code.startsWith(c)));
}

function ensureScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile-script')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = 'true';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile-script'));
    document.head.appendChild(s);
  });
}

interface TurnstileProps {
  onToken: (token: string | null) => void;
  /**
   * The error code Cloudflare reported, or null once a challenge is running again. Without
   * this the page had no way to tell a failed check from one nobody had touched yet: the
   * widget showed its own "verification failed" box, the token stayed null, and the button it
   * gates stayed disabled with a hint that read as though the visitor simply had not tried.
   */
  onError?: (code: string | null) => void;
  resetKey: number;
}

export default function Turnstile({ onToken, onError, resetKey }: TurnstileProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  /*
   * The callbacks live in a ref so the effect depends on `resetKey` alone. Turnstile counts a
   * remount as a fresh challenge; an effect that also watched a prop identity would re-run
   * whenever a parent happened to pass a new function, tearing down a challenge mid-solve.
   */
  const handlers = useRef({ onToken, onError });
  handlers.current = { onToken, onError };

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !boxRef.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    const box = boxRef.current;

    handlers.current.onError?.(null);

    ensureScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId = window.turnstile.render(box, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: (token) => {
            handlers.current.onError?.(null);
            handlers.current.onToken(token);
          },
          'expired-callback': () => handlers.current.onToken(null),
          'error-callback': (code?: string) => {
            // The code is the only thing that separates "this visitor's network looks like a
            // bot" from "this hostname is not on the sitekey". Passing it up is what lets the
            // page offer a retry for one and an explanation for the other.
            handlers.current.onToken(null);
            handlers.current.onError?.(code ?? 'unknown');
            // Falsy return: Turnstile also logs the code to the console, which is where the
            // person maintaining the dashboard will look.
            return false;
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        handlers.current.onToken(null);
        handlers.current.onError?.('script');
      });

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
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={boxRef} className="mb-3" />;
}
