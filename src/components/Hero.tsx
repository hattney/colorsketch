import React from 'react';
import { sampleUrl, useImagesExist } from '../utils/samples';
import BeforeAfter from './BeforeAfter';

const BEFORE = sampleUrl('leaf-before.jpg');
const AFTER = sampleUrl('leaf-ai.png');

export default function Hero() {
  const showcase = useImagesExist([BEFORE, AFTER]);

  return (
    <section className="grid items-center gap-9 py-11 md:grid-cols-[1fr_0.82fr] md:gap-[52px] md:py-16">
      <div>
        <h1 className="font-display text-[clamp(36px,5vw,58px)] font-extrabold leading-[1.02] tracking-[-0.035em] m-0 mb-5">
          Turn any photo into a{' '}
          <span className="fill slide" style={{ ['--c' as string]: 'var(--crayon-yellow)' }}>
            coloring page
          </span>{' '}
          in seconds.
        </h1>

        <p className="m-0 mb-[26px] max-w-[45ch] text-[17px] text-ink-soft">
          Upload a photo or drawing, and ColorSketch instantly converts it into a clean, printable
          A4 coloring page — right in your browser.{' '}
          <strong className="text-ink">No sign-up needed. Try the free converter first</strong> —
          then, only if a photo needs it, upgrade to an AI-enhanced version for smoother, richer
          lines worth framing.
        </p>

        <p
          className="m-0 inline-flex items-center gap-2.5 rounded-[30px] border-[2.5px] border-ink bg-white px-4 py-[11px] text-sm font-bold"
          style={{ boxShadow: '4px 4px 0 var(--crayon-green)' }}
        >
          🔒 Free conversions run entirely in your browser — your photo never leaves your device.
        </p>

        {/* The three objections people have before uploading anything, answered up front. */}
        <ul className="m-0 mt-4 flex list-none flex-wrap gap-2 p-0">
          {[
            { icon: '✓', text: 'Free converter, no limits' },
            { icon: '✓', text: 'No sign-up, no account' },
            { icon: '✓', text: 'One photo, one A4 page' },
          ].map((item) => (
            <li
              key={item.text}
              className="flex items-center gap-1.5 rounded-[20px] border-2 border-ink bg-white px-3 py-1.5 text-[12.5px] font-bold"
            >
              <span aria-hidden="true" style={{ color: 'var(--crayon-green)' }}>
                {item.icon}
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>

      {showcase && (
        <div className="mx-auto w-full max-w-[340px] md:max-w-none">
          <BeforeAfter
            before={BEFORE}
            after={AFTER}
            beforeLabel="Photo"
            afterLabel="AI"
            afterTagColor="var(--crayon-red)"
            label="Houseplant corner"
          />
          {/* Labelled AI, not "coloring page": this is the retouched result, not the free pass. */}
          <p className="m-0 mt-3 text-center text-[12.5px] text-ink-soft">
            Drag the handle to compare — this one used AI retouch
          </p>
        </div>
      )}
    </section>
  );
}
