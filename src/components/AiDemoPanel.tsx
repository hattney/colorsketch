import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { formattedPrice } from '../config';
import { AI_EXAMPLES } from '../utils/aiFlow';
import {
  DISABLED_NOTICE,
  MOCK_NOTICE,
  checkoutLabel,
  isCheckoutOpen,
  isMockCheckout,
} from '../utils/checkout';
import { SUBJECT_CHIPS, buildPrompt, type StyleVariant, type SubjectModule } from '../utils/prompt';
import { isSubjectReady } from './SubjectPicker';
import Turnstile, { turnstileRequired } from './Turnstile';
import VariantCards from './VariantCards';

interface AiDemoPanelProps {
  module: SubjectModule | null;
  onModule: (m: SubjectModule) => void;
  otherWord: string;
  onOtherWord: (w: string) => void;
  previews: Record<StyleVariant, string> | null;
  isGenerating: boolean;
  onGenerate: (turnstileToken?: string) => void;
  onCheckout: () => void;
  isCheckingOut: boolean;
  checkoutError: string | null;
  aiError: { message: string; retryable: boolean } | null;
  /** Whether the cards below came from the model rather than the local tracer. */
  usedRealAi: boolean;
  onBack: () => void;
}

/**
 * Stage 2 — free AI previews, and the only place money is asked for.
 *
 * This pane does NOT reuse the editor's canvas + sidebar split (§28). The free page was
 * sitting in the big left column doing nothing but competing with the previews for
 * attention: it is not what is being decided here, and someone comparing "the page I
 * already have" against "a stand-in of the page I might buy" is being invited to say no.
 * The pane is one full-width column that runs top to bottom in the order of the decision:
 * ask what this is, show what AI does to a photo like it, show the two options, then price.
 */
export default function AiDemoPanel({
  module,
  onModule,
  otherWord,
  onOtherWord,
  previews,
  isGenerating,
  onGenerate,
  onCheckout,
  isCheckingOut,
  checkoutError,
  aiError,
  usedRealAi,
  onBack,
}: AiDemoPanelProps) {
  const ready = isSubjectReady(module, otherWord);
  const price = formattedPrice();
  const example = AI_EXAMPLES[module ?? 'auto'];

  // Turnstile: a token is single-use, so it is cleared and the widget remounted (nonce bump)
  // after every attempt. When Turnstile is not configured, `turnstileRequired` is false and
  // the gate below is a no-op.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const blockedByTurnstile = turnstileRequired && !turnstileToken;

  const fireGenerate = () => {
    onGenerate(turnstileToken ?? undefined);
    setTurnstileToken(null);
    setTurnstileNonce((n) => n + 1);
  };

  const step = (n: string, title: string, hint?: string) => (
    <div className="mb-3">
      <h3 className="m-0 flex items-baseline gap-2 font-display text-[17px] font-extrabold tracking-[-0.02em]">
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[12px]"
          aria-hidden="true"
        >
          {n}
        </span>
        {title}
      </h3>
      {hint && <p className="m-0 mt-1 pl-8 text-[13px] leading-[1.45] text-ink-soft">{hint}</p>}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 py-7 sm:px-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <p className="m-0 max-w-[540px] text-[14px] leading-[1.55] text-ink-soft">
          Close-up photos are made of soft gradients rather than lines. AI retouch redraws yours
          from scratch as bold, closed outlines — the kind of page that is a pleasure to color.
        </p>
        <button type="button" onClick={onBack} className="btn btn-inline btn-ghost btn-sm shrink-0">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Free editor
        </button>
      </div>

      {/* 1 — the question, wide and first */}
      <section className="mb-8">
        {step('1', "What's in your photo?", 'This decides how AI reads the image.')}
        <div className="flex flex-wrap gap-2 pl-8" role="group" aria-label="Subject">
          {SUBJECT_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="chip chip-lg"
              aria-pressed={module === chip.id}
              onClick={() => onModule(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        {module === 'other' && (
          <input
            className="ink-input mt-3 ml-8 max-w-[320px]"
            type="text"
            maxLength={20}
            value={otherWord}
            onChange={(e) => onOtherWord(e.target.value)}
            placeholder="e.g. car, cake, tattoo"
            aria-label="Describe your subject in one word"
          />
        )}
      </section>

      {/* What the paid conversion actually produces. A real file, on a sample photo. */}
      <section className="mb-8">
        {step(
          '2',
          'What AI retouch does',
          `A real ColorSketch AI page, made from ${example.subject}. Not a filter over the photo — the subject is redrawn as closed outlines.`,
        )}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pl-8 sm:gap-5">
          <figure className="m-0">
            <div className="overflow-hidden rounded-lg border-[2.5px] border-ink bg-white">
              <img src={example.before} alt="Sample photo before AI retouch" className="block w-full" />
            </div>
            <figcaption className="mt-1.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
              Photo
            </figcaption>
          </figure>
          <ArrowRight className="h-6 w-6 shrink-0" aria-hidden="true" />
          <figure className="m-0">
            <div
              className="overflow-hidden rounded-lg border-[2.5px] border-ink bg-white"
              style={{ boxShadow: '5px 5px 0 var(--crayon-red)' }}
            >
              <img src={example.after} alt="The same photo after AI retouch" className="block w-full" />
            </div>
            <figcaption className="mt-1.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
              AI page
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 3 — their own two options */}
      <section className="mb-8">
        {step('3', 'Your two styles', 'Both are included; you pick which one to finish.')}
        <div className="pl-8">
          {!previews && !isGenerating && (
            <>
              {ready && <Turnstile onToken={setTurnstileToken} resetKey={turnstileNonce} />}
              <button
                type="button"
                className="btn btn-magic btn-inline"
                onClick={fireGenerate}
                disabled={!ready || blockedByTurnstile}
              >
                <Sparkles className="h-5 w-5" aria-hidden="true" />
                Generate my two previews — free
              </button>
              {!ready && (
                <p className="m-0 mt-2 text-[12.5px] font-bold text-ink-soft">
                  Pick what is in your photo first.
                </p>
              )}
              {ready && blockedByTurnstile && (
                <p className="m-0 mt-2 text-[12.5px] font-bold text-ink-soft">
                  One quick check above first.
                </p>
              )}
            </>
          )}

          {/*
            Advisory, not a gate (§32). Nothing here inspects or blocks the upload — it tells
            people what they are responsible for and lets them decide. It stays visible after
            generating too, because that is when there is a file worth thinking about. The
            model provider still applies its own rules server-side, which is why the error
            path below has to read as a normal outcome rather than a crash.
          */}
          <p className="m-0 mt-3 max-w-[520px] text-[11.5px] leading-[1.45] text-ink-soft">
            Use photos you took or have the right to use. Characters, logos and artwork you did
            not create may be someone else&apos;s copyright, and a coloring page made from them
            can be too — please keep those to personal use.
          </p>

          {aiError && !isGenerating && (
            <div
              role="alert"
              className="mt-3 max-w-[520px] rounded-lg border-[2.5px] border-ink bg-white p-3"
              style={{ boxShadow: '4px 4px 0 var(--crayon-red)' }}
            >
              <p className="m-0 text-[12.5px] font-bold">{aiError.message}</p>
              {/*
                Only offer a retry when one can actually help. A refusal is the model's
                decision about this image and repeats every time, so the way out is the free
                converter — which still produces a page from the same photo.
              */}
              {aiError.retryable ? (
                <div className="mt-2">
                  {ready && <Turnstile onToken={setTurnstileToken} resetKey={turnstileNonce} />}
                  <button
                    type="button"
                    onClick={fireGenerate}
                    disabled={blockedByTurnstile}
                    className="text-xs font-bold text-ink-soft underline decoration-2 underline-offset-2 hover:text-ink disabled:no-underline disabled:opacity-50"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <button type="button" onClick={onBack} className="btn btn-inline btn-ghost btn-sm mt-3">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to the free editor
                </button>
              )}
            </div>
          )}

          {isGenerating && (
            <p className="m-0 py-6 text-[14px] font-bold text-ink-soft">Retouching your photo…</p>
          )}

          {previews && !isGenerating && (
            <>
              {/* Above the cards, not below: the first person to see this build read the two
                  cards as AI output and concluded the AI was broken. */}
              {!usedRealAi && (
                <div
                  className="mb-3 max-w-[520px] rounded-lg border-[2.5px] border-ink bg-white p-3"
                  style={{ boxShadow: '4px 4px 0 var(--crayon-yellow)' }}
                >
                  <div className="mb-1 font-display text-[13.5px] font-extrabold">
                    ⚠ These two are not AI output
                  </div>
                  <p className="m-0 text-[12px] leading-[1.45] text-ink-soft">
                    AI retouch is not connected yet. These cards are the same in-browser
                    tracer as the free page, at two line weights — a placeholder for where the AI
                    result will sit. Judge the AI by the before/after in step 2.
                  </p>
                </div>
              )}
              <div className="max-w-[520px]">
                <VariantCards previews={previews} tag={usedRealAi ? 'Preview' : 'Not AI'} />
              </div>
              <div className="mt-3">
                {turnstileRequired && (
                  <Turnstile onToken={setTurnstileToken} resetKey={turnstileNonce} />
                )}
                <button
                  type="button"
                  className="text-xs font-bold text-ink-soft underline decoration-2 underline-offset-2 hover:text-ink disabled:no-underline disabled:opacity-50"
                  onClick={fireGenerate}
                  disabled={blockedByTurnstile}
                >
                  Generate again
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 4 — price, only after the two options exist */}
      {previews && !isGenerating && (
        <section className="magic-card p-5">
          <div className="mb-1 font-display text-[16px] font-extrabold">
            {isCheckoutOpen ? 'Run AI on your photo' : 'AI retouch is coming'}
          </div>
          <p className="m-0 mb-3 max-w-[560px] text-[13px] leading-[1.5] text-ink-soft">
            One payment for this image returns <strong className="text-ink">both</strong> styles,
            redrawn like the example above, with no watermark at A4 300 DPI — and opens the HD
            editor with the same thickness, detail and eraser handles you already used.
            {price ? ` ${price}, one time — no subscription, no account.` : ''}
          </p>
          <button
            type="button"
            className="btn btn-inline"
            onClick={onCheckout}
            disabled={isCheckingOut || !isCheckoutOpen}
          >
            {isCheckingOut ? 'Opening checkout…' : checkoutLabel()}
          </button>
          {checkoutError && (
            <p role="alert" className="m-0 mt-2 text-[12px] font-bold text-[color:var(--crayon-red)]">
              {checkoutError}
            </p>
          )}
          <p className="m-0 mt-2 text-[11.5px] leading-[1.4] text-ink-soft">
            Your free A4 download stays free either way.
            {isMockCheckout ? ` ${MOCK_NOTICE}` : ''}
            {!isCheckoutOpen ? ` ${DISABLED_NOTICE}` : ''}
          </p>
        </section>
      )}

      {import.meta.env.DEV && module && (
        <details className="mt-5">
          <summary className="cursor-pointer text-[11px] font-bold text-ink-soft">
            Prompt that would be sent (dev only)
          </summary>
          <pre className="mt-1.5 whitespace-pre-wrap break-words text-[10.5px] leading-[1.4] text-ink-soft">
            {buildPrompt({ module, otherWord }, 'simple')}
          </pre>
        </details>
      )}
    </div>
  );
}
