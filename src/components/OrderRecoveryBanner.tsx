import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { forgetOrder, getRememberedOrder } from '../utils/orderRecovery';
import { navigate } from '../utils/router';

/**
 * "You have pages from an earlier session" (PHASE2_GUIDE.md §(B) 3).
 *
 * Only shows once the remembered order is confirmed still real and paid — a stale id from an
 * abandoned preview is cleared silently. Dismissible for the tab session so it does not nag on
 * every navigation.
 */
const DISMISS_KEY = 'colorsketch.recovery.dismissed';

export default function OrderRecoveryBanner() {
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.pathname === '/thanks') return;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (dismissed) return;

    const id = getRememberedOrder();
    if (!id) return;

    let cancelled = false;
    fetch(`/api/download?order=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((body: { status?: string }) => {
        if (cancelled) return;
        if (body?.status === 'delivered' || body?.status === 'processing') {
          setOrderId(id);
        } else if (body?.status === 'not_found' || body?.status === 'refunded' || body?.status === 'not_paid') {
          forgetOrder();
        }
      })
      .catch(() => {
        /* offline / no endpoint — say nothing */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!orderId) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setOrderId(null);
  };

  return (
    <div
      className="mt-6 flex items-center justify-between gap-3 rounded-xl border-[2.5px] border-ink bg-white px-4 py-3"
      style={{ boxShadow: '4px 4px 0 var(--crayon-yellow)' }}
    >
      <p className="m-0 text-[13.5px] font-medium">
        You have HD coloring pages from an earlier session.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(`/thanks?order=${encodeURIComponent(orderId)}`)}
          className="btn btn-inline btn-sm"
        >
          Open them
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-md p-1 text-ink-soft hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
