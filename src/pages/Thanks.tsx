import { Download, Printer, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CONTACT_EMAIL } from '../config';
import { Link } from '../utils/router';
import { forgetOrder, rememberOrder } from '../utils/orderRecovery';
import type { StyleVariant } from '../utils/prompt';

/**
 * /thanks?order=… — where a buyer lands after Lemon Squeezy, and the page the delivery email
 * links to (PHASE2_GUIDE.md §3-4, §4.3, §(B)).
 *
 * It polls /api/download, which is the gate and also the retry driver — a poll on a `paid`
 * order kicks fulfilment. The link never expires, so this doubles as the "get my files again"
 * page the FAQ points at.
 */

type VariantUrls = Partial<Record<StyleVariant, string>>;

type State =
  | { kind: 'loading' }
  | { kind: 'processing' }
  | { kind: 'delivered'; variants: VariantUrls }
  | { kind: 'failed' }
  | { kind: 'not_paid' }
  | { kind: 'refunded' }
  | { kind: 'missing' };

const POLL_MS = 3000;
const STYLE_LABEL: Record<StyleVariant, string> = { simple: 'Simple', detailed: 'Detailed' };
const VARIANTS: StyleVariant[] = ['simple', 'detailed'];

function orderIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get('order') ?? '';
}

function printImage(url: string) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Please allow pop-ups to print.');
    return;
  }
  w.document.write(
    `<html><head><title>Print — ColorSketch</title><style>` +
      `body{margin:0;padding:0}@page{size:A4 portrait;margin:0}` +
      `img{width:100%;height:100%;object-fit:contain}</style></head>` +
      `<body><img src="${url}" onload="window.print();window.close()"/></body></html>`,
  );
  w.document.close();
}

export default function Thanks() {
  const [orderId] = useState(orderIdFromUrl);
  const [state, setState] = useState<State>(orderId ? { kind: 'loading' } : { kind: 'missing' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/download?order=${encodeURIComponent(orderId)}`, {
        headers: { accept: 'application/json' },
      });
      const body = (await res.json().catch(() => null)) as { status?: string; variants?: VariantUrls } | null;
      const status = body?.status;

      if (status === 'delivered') {
        rememberOrder(orderId);
        setState({ kind: 'delivered', variants: body?.variants ?? {} });
        return;
      }
      if (status === 'failed') {
        setState({ kind: 'failed' });
        return;
      }
      if (status === 'refunded') {
        forgetOrder();
        setState({ kind: 'refunded' });
        return;
      }
      if (status === 'not_paid' || status === 'not_found') {
        setState({ kind: status === 'not_paid' ? 'not_paid' : 'missing' });
        return;
      }
      // processing / rate_limited / anything else — keep waiting.
      setState((s) => (s.kind === 'loading' ? { kind: 'processing' } : s));
      timer.current = setTimeout(poll, POLL_MS);
    } catch {
      timer.current = setTimeout(poll, POLL_MS);
    }
  }, [orderId]);

  useEffect(() => {
    poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  return (
    <article className="mx-auto max-w-[70ch] py-14 pb-[100px]">
      <h1 className="m-0 mb-3 font-display text-[clamp(30px,4vw,44px)] font-extrabold tracking-[-0.03em]">
        {state.kind === 'delivered' ? 'Your HD pages are ready' : 'Thank you'}
      </h1>

      {orderId && (
        <p className="m-0 mb-8 text-[13px] text-ink-soft">
          Order reference <code className="font-bold text-ink">{orderId}</code> — bookmark this page,
          you can come back to it any time to download the files again.
        </p>
      )}

      {(state.kind === 'loading' || state.kind === 'processing') && (
        <div className="flex items-center gap-3 rounded-xl border-[2.5px] border-ink bg-white p-5">
          <RefreshCw className="h-6 w-6 shrink-0 animate-spin" aria-hidden="true" />
          <div>
            <p className="m-0 font-bold">Preparing your two HD pages…</p>
            <p className="m-0 text-[13px] text-ink-soft">
              This usually takes well under a minute. The page updates on its own — no need to
              refresh.
            </p>
          </div>
        </div>
      )}

      {state.kind === 'delivered' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {VARIANTS.map((v) => {
            const url = state.variants[v];
            return (
              <div key={v} className="rounded-xl border-[2.5px] border-ink bg-white p-4">
                <h2 className="m-0 mb-1 font-display text-[17px] font-extrabold">{STYLE_LABEL[v]}</h2>
                <p className="m-0 mb-3 text-[12.5px] text-ink-soft">A4 · 300 DPI · no watermark</p>
                {url ? (
                  <div className="flex flex-col gap-2">
                    <a
                      href={`/api/download?order=${encodeURIComponent(orderId)}&variant=${v}`}
                      className="btn btn-sm"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => printImage(url)}
                      className="btn btn-ghost btn-sm"
                    >
                      <Printer className="h-4 w-4" aria-hidden="true" />
                      Print
                    </button>
                  </div>
                ) : (
                  <p className="m-0 text-[12.5px] font-bold text-ink-soft">Still preparing…</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {state.kind === 'failed' && (
        <div className="rounded-xl border-[2.5px] border-ink bg-white p-5">
          <p className="m-0 mb-2 font-bold">Something went wrong preparing your pages.</p>
          <p className="m-0 text-[13px] text-ink-soft">
            You have not been charged for a product you did not receive — a full refund is on its
            way and no action is needed. Questions? Email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
            >
              {CONTACT_EMAIL}
            </a>{' '}
            with your order reference.
          </p>
        </div>
      )}

      {state.kind === 'refunded' && (
        <div className="rounded-xl border-[2.5px] border-ink bg-white p-5">
          <p className="m-0 text-[13px] text-ink-soft">
            This order has been refunded and its files have been removed.
          </p>
        </div>
      )}

      {(state.kind === 'not_paid' || state.kind === 'missing') && (
        <div className="rounded-xl border-[2.5px] border-ink bg-white p-5">
          <p className="m-0 mb-2 font-bold">We don&apos;t see a completed purchase for this link.</p>
          <p className="m-0 text-[13px] text-ink-soft">
            If you just paid, give it a moment and refresh — the confirmation can take a few
            seconds. Otherwise, email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      )}

      <p className="mt-10">
        <Link to="/" className="font-bold text-ink underline decoration-2 underline-offset-[3px]">
          ← Back to ColorSketch
        </Link>
      </p>
    </article>
  );
}
