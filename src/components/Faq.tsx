import React, { useId, useState } from 'react';
import { CONTACT_EMAIL } from '../config';
import { Link } from '../utils/router';

/** CONTENT_UPDATE.md §5 (eight questions) + §16 (ninth). Copy is confirmed — do not reword. */
const ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Is ColorSketch free?',
    a: 'The in-browser converter is 100% free, unlimited, and needs no sign-up — and it gives you the same A4 300 DPI file the paid version does. The optional AI HD conversion is a one-time paid download per image.',
  },
  {
    q: 'When do I pay?',
    a: "Only if you choose the AI HD version. You'll always see a low-resolution watermarked preview first — pay only when you like what you see.",
  },
  {
    q: 'What image formats can I upload?',
    a: 'JPG, PNG, WebP, and HEIC (iPhone), up to 10 MB.',
  },
  {
    q: 'What do I get when I purchase?',
    a: 'Both styles — Simple and Detailed — as high-resolution A4 files (300 DPI, no watermark), ready to print at home or at a print shop.',
  },
  {
    q: 'Can I use the coloring pages commercially?',
    a: "Pages made from your own images are yours to use. You're responsible for having rights to the image you upload.",
  },
  {
    q: 'What happens to my uploaded photos?',
    a: 'Free conversions run entirely in your browser — your photo never leaves your device. AI conversions are processed on our servers and automatically deleted within 7 days.',
  },
  {
    q: "I paid but didn't get my file. What do I do?",
    a: (
      <>
        Your download page stays available — just revisit the link with your order number. Still
        stuck? Email us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold text-ink underline decoration-2 underline-offset-[3px]">
          {CONTACT_EMAIL}
        </a>{' '}
        and we'll fix it fast.
      </>
    ),
  },
  {
    q: 'Do you offer refunds?',
    a: (
      <>
        Yes — see our{' '}
        <Link
          to="/refund-policy"
          className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
        >
          refund policy
        </Link>
        . We'll issue a full refund within 14 days if your file wasn't delivered, arrived corrupted,
        or you were charged twice.
      </>
    ),
  },
  {
    q: 'Why does my photo look worse than the examples?',
    a: 'Photos are made of soft gradients rather than lines, so the free in-browser converter has less to trace. Use AI retouch — it redraws your photo as bold, closed line art first, which is what makes a page you can actually color.',
  },
];

function FaqItem({ q, a, defaultOpen }: { q: string; a: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;

  return (
    <div className="mb-3 rounded-xl border-[2.5px] border-ink bg-white">
      <h3 className="m-0">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="relative w-full cursor-pointer bg-transparent px-5 py-[17px] pr-[46px] text-left font-display text-[16.5px] font-bold tracking-[-0.015em] text-ink"
        >
          {q}
          <span
            aria-hidden="true"
            className="absolute right-[18px] h-[13px] w-[13px] border-b-[2.5px] border-r-[2.5px] border-ink transition-transform duration-200"
            style={{
              top: open ? 26 : 22,
              transform: open ? 'rotate(-135deg)' : 'rotate(45deg)',
            }}
          />
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" aria-labelledby={buttonId}>
          <p className="mx-5 mb-[18px] mt-[-4px] max-w-[70ch] text-[15px] text-ink-soft">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 pb-[100px]">
      <h2 className="m-0 mb-3 font-display text-[clamp(28px,3.4vw,40px)] font-extrabold tracking-[-0.03em]">
        Frequently asked{' '}
        <span className="fill text-white" style={{ ['--c' as string]: 'var(--crayon-red)' }}>
          questions
        </span>
      </h2>
      <p className="m-0 mb-[34px] max-w-[56ch] text-ink-soft">
        Everything you need to know before you print.
      </p>
      {ITEMS.map((item, i) => (
        <FaqItem key={item.q} q={item.q} a={item.a} defaultOpen={i === 0} />
      ))}
    </section>
  );
}
