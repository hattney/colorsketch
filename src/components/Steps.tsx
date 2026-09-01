import React from 'react';

/**
 * All three steps are free. The AI upsell is deliberately kept out of them and mentioned
 * once underneath as an optional extra — the funnel is "try free, upgrade only if the
 * photo needs it", so the steps must not read as a lead-in to a paywall.
 */
const STEPS = [
  { n: 1, title: 'Upload', body: 'Any photo — JPG, PNG, WebP, HEIC', shadow: 'var(--crayon-red)' },
  { n: 2, title: 'Convert', body: 'Free and instant, right in your browser', shadow: 'var(--crayon-yellow)' },
  { n: 3, title: 'Print', body: 'Your A4 page at 300 DPI, ready to color', shadow: 'var(--crayon-blue)' },
];

export default function Steps() {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="rounded-[10px] border-[2.5px] border-ink bg-white p-5"
            style={{ boxShadow: `5px 5px 0 ${step.shadow}` }}
          >
            <div className="mb-2.5 grid h-7 w-7 place-items-center rounded-full border-2 border-ink font-display text-sm font-extrabold">
              {step.n}
            </div>
            <h3 className="m-0 mb-[3px] font-display text-[19px] font-bold tracking-[-0.02em]">
              {step.title}
            </h3>
            <p className="m-0 text-[13.5px] leading-[1.5] text-ink-soft">{step.body}</p>
          </div>
        ))}
      </div>

      <p className="m-0 mt-4 text-center text-[13.5px] text-ink-soft">
        All three steps are free, every time. Close-up photos of pets and people are the hard
        case — that&apos;s the only place the optional AI retouch comes in.
      </p>
    </div>
  );
}
