import { AlertCircle, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '../components/Editor';
import { CONTACT_EMAIL } from '../config';
import { isPaperId, type PaperId } from '../utils/paper';
import type { StyleVariant, SubjectModule } from '../utils/prompt';
import { Link } from '../utils/router';

/**
 * `/edit?order=…` — the HD editor, reached after payment.
 *
 * Live checkout leaves the site: the buyer is sent to Lemon Squeezy and comes back to
 * `/thanks` on a fresh page load, so the image they uploaded and everything traced from it
 * are gone. Mock checkout never left, which is why the paid editor looked reachable while it
 * was not — the funnel promised an HD editor that only existed in the mock path.
 *
 * The editor does not need the original photo to do its job. In the paid stage it works from
 * the purchased page itself, so this route fetches the delivered files and hands one to the
 * editor as its working image. That also means the editor is reachable later from the same
 * bookmarked link, not only in the minute after paying.
 *
 * Vercel Blob serves these with `Access-Control-Allow-Origin: *`, so the images load
 * cross-origin without tainting the canvas the editor exports through.
 */

type VariantUrls = Partial<Record<StyleVariant, string>>;

type State =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      image: HTMLImageElement;
      variants: Record<StyleVariant, string>;
      previous?: VariantUrls;
      regensLeft: number;
      module?: SubjectModule;
      otherWord?: string;
      paper?: PaperId;
      landscape?: boolean;
    }
  | { kind: 'not_ready'; status: string }
  | { kind: 'missing' }
  | { kind: 'error' };

function orderIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get('order') ?? '';
}

/** Loads a cross-origin image in a form the export canvas can still read back. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

export default function EditPurchased() {
  const [orderId] = useState(orderIdFromUrl);
  const [state, setState] = useState<State>(orderId ? { kind: 'loading' } : { kind: 'missing' });
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/download?order=${encodeURIComponent(orderId)}`, {
        headers: { accept: 'application/json' },
      });
      const body = (await res.json().catch(() => null)) as
        | {
            status?: string;
            variants?: VariantUrls;
            previous?: VariantUrls;
            regensLeft?: number;
            module?: SubjectModule;
            otherWord?: string;
            paper?: unknown;
            landscape?: unknown;
          }
        | null;

      if (body?.status !== 'delivered') {
        if (cancelled.current) return;
        setState(
          body?.status === 'not_found' || !body?.status
            ? { kind: 'missing' }
            : { kind: 'not_ready', status: body.status },
        );
        return;
      }

      const { simple, detailed } = body.variants ?? {};
      if (!simple || !detailed) {
        if (!cancelled.current) setState({ kind: 'not_ready', status: 'processing' });
        return;
      }

      // Open on Simple; the panel switches to Detailed without another fetch.
      const image = await loadImage(simple);
      if (!cancelled.current) {
        setState({
          kind: 'ready',
          image,
          variants: { simple, detailed },
          previous: body.previous,
          regensLeft: typeof body.regensLeft === 'number' ? body.regensLeft : 0,
          module: body.module,
          otherWord: body.otherWord,
          paper: isPaperId(body.paper) ? body.paper : undefined,
          landscape: typeof body.landscape === 'boolean' ? body.landscape : undefined,
        });
      }
    } catch {
      if (!cancelled.current) setState({ kind: 'error' });
    }
  }, [orderId]);

  useEffect(() => {
    cancelled.current = false;
    load();
    return () => {
      cancelled.current = true;
    };
  }, [load]);

  const card = (title: React.ReactNode, body: React.ReactNode) => (
    <div className="rounded-xl border-[2.5px] border-ink bg-white p-5">
      <p className="m-0 mb-2 font-bold">{title}</p>
      <div className="text-[13px] text-ink-soft">{body}</div>
    </div>
  );

  const backLink = (
    <p className="mt-10">
      <Link
        to={orderId ? `/thanks?order=${encodeURIComponent(orderId)}` : '/'}
        className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
      >
        ← Back to your downloads
      </Link>
    </p>
  );

  if (state.kind === 'ready') {
    return (
      <Editor
        image={state.image}
        stage="ai-hd"
        onStage={() => {
          /* There is no free stage for a purchased page — this editor is the whole session. */
        }}
        onReset={() => {
          window.location.assign(`/thanks?order=${encodeURIComponent(orderId)}`);
        }}
        purchased={{
          orderId,
          variants: state.variants,
          previous: state.previous,
          regensLeft: state.regensLeft,
          module: state.module,
          otherWord: state.otherWord,
          paper: state.paper,
          landscape: state.landscape,
        }}
      />
    );
  }

  return (
    <article className="mx-auto max-w-[70ch] py-14 pb-[100px]">
      <h1 className="m-0 mb-3 font-display text-[clamp(30px,4vw,44px)] font-extrabold tracking-[-0.03em]">
        Edit your HD pages
      </h1>

      {state.kind === 'loading' && (
        <div className="flex items-center gap-3 rounded-xl border-[2.5px] border-ink bg-white p-5">
          <RefreshCw className="h-6 w-6 shrink-0 animate-spin" aria-hidden="true" />
          <p className="m-0 font-bold">Opening your pages…</p>
        </div>
      )}

      {state.kind === 'not_ready' &&
        card(
          'Your pages are still being prepared.',
          <>
            This usually takes well under a minute.{' '}
            <button
              type="button"
              onClick={load}
              className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
            >
              Check again
            </button>
            .
          </>,
        )}

      {state.kind === 'missing' &&
        card(
          "We don't see a completed purchase for this link.",
          <>
            Open this page from your download link, or email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
            >
              {CONTACT_EMAIL}
            </a>{' '}
            with your order reference.
          </>,
        )}

      {state.kind === 'error' &&
        card(
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            We could not open your pages.
          </span>,
          <>
            Your files are safe — you can always download them from your order link.{' '}
            <button
              type="button"
              onClick={load}
              className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
            >
              Try again
            </button>
            .
          </>,
        )}

      {backLink}
    </article>
  );
}
