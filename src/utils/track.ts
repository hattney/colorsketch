import { FREE_ONLY } from '../config';

export type TrackedEvent = 'open' | 'hard' | 'download' | 'print';

/**
 * Tells `/api/event` (functions/api/event.ts) that something happened. Only the event's name
 * is sent — never the image, never anything about it beyond whether it was a hard photo.
 *
 * Free edition only: the full edition on Vercel has no such endpoint. Fire-and-forget, so a
 * blocked or failed request can never get in the way of a download.
 */
export function track(event: TrackedEvent): void {
  if (!FREE_ONLY) return;
  try {
    const body = new Blob([JSON.stringify({ event })], { type: 'application/json' });
    if (navigator.sendBeacon?.('/api/event', body)) return;
    void fetch('/api/event', { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {
    // Counting is never worth an error in front of someone.
  }
}
