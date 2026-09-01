import React from 'react';
import { CONTACT_EMAIL } from '../config';
import { Link } from '../utils/router';

/** CONTENT_UPDATE.md §8 — confirmed copy, do not reword. */
export default function Terms() {
  return (
    <article className="mx-auto max-w-[70ch] py-14 pb-[100px]">
      <h1 className="m-0 mb-3 font-display text-[clamp(30px,4vw,44px)] font-extrabold tracking-[-0.03em]">
        Terms
      </h1>
      <p className="m-0 mb-9 text-ink-soft">Last updated 2026</p>

      <h2 className="m-0 mb-3 font-display text-2xl font-bold tracking-[-0.02em]">Your content.</h2>
      <p className="m-0 mb-6 text-ink-soft">
        You retain all rights to images you upload and to the coloring pages generated from them.
        You must only upload images that you own or are licensed to use. Do not upload images that
        infringe copyright, violate privacy or publicity rights, or contain unlawful content. You
        are solely responsible for your uploads and how you use the results. We may remove content
        and refuse service in cases of misuse. Uploaded images used for AI conversion are stored
        temporarily for processing and deleted within 7 days.
      </p>

      <p className="m-0 mb-9 text-ink-soft">
        Questions:{' '}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
        >
          {CONTACT_EMAIL}
        </a>
      </p>

      <Link
        to="/"
        className="font-bold text-ink underline decoration-2 underline-offset-[3px]"
      >
        ← Back to ColorSketch
      </Link>
    </article>
  );
}
