/**
 * Cloudflare Turnstile's explicit-render API (PHASE2_GUIDE.md §3-1, §4).
 * Only the handful of options `Turnstile.tsx` uses.
 */
interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  /** Receives Cloudflare's error code; a falsy return also logs it to the console. */
  'error-callback'?: (code?: string) => boolean | void;
  'timeout-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'flexible' | 'compact';
  action?: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
}

interface TurnstileApi {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
  getResponse: (widgetId?: string) => string | undefined;
}

interface Window {
  turnstile?: TurnstileApi;
  onloadTurnstileCallback?: () => void;
}
