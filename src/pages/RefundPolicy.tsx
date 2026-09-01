import React from 'react';
import { CONTACT_EMAIL } from '../config';
import { Link } from '../utils/router';

/** CONTENT_UPDATE.md §9 — confirmed copy, do not reword. */
export default function RefundPolicy() {
  return (
    <article className="mx-auto max-w-[70ch] py-14 pb-[100px]">
      <h1 className="m-0 mb-3 font-display text-[clamp(30px,4vw,44px)] font-extrabold tracking-[-0.03em]">
        Refund Policy
      </h1>
      <p className="m-0 mb-9 text-ink-soft">Last updated 2026</p>

      <p className="m-0 mb-5 text-ink-soft">
        Because you can always review a free preview and a watermarked AI sample before paying, all
        sales of HD files are generally final once the file has been downloaded. However, we&apos;ll
        gladly issue a full refund within 14 days if:
      </p>

      <ol className="m-0 mb-6 list-decimal pl-6 text-ink-soft">
        <li className="mb-1">your file was never delivered,</li>
        <li className="mb-1">
          the file is corrupted or materially different from the preview you approved, or
        </li>
        <li>you were charged more than once.</li>
      </ol>

      <p className="m-0 mb-9 text-ink-soft">
        Email{' '}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
        >
          {CONTACT_EMAIL}
        </a>{' '}
        with your order number — we respond within 48 hours.
      </p>

      <Link to="/" className="font-bold text-ink underline decoration-2 underline-offset-[3px]">
        ← Back to ColorSketch
      </Link>
    </article>
  );
}
