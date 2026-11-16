import { Sparkles } from 'lucide-react';
import React, { useState } from 'react';

interface WaitlistProps {
  /** Which invitation was answered — the editor's foot, or the examples section. */
  source: 'editor' | 'samples';
  /**
   * Whether the page in front of them came out badly enough to be flagged as a hard photo.
   * Someone who signs up while looking at a poor result is a different signal from someone
   * who is merely curious, and it is the one worth counting.
   */
  hard?: boolean;
}

type State = 'idle' | 'sending' | 'done' | 'error';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The free edition's stand-in for the AI offer: an email address instead of a purchase.
 *
 * It says the retouch will be a paid extra, in so many words. A waitlist that hides the price
 * collects people who want something free, and the point of this one is to find out how many
 * would want the thing that costs money.
 */
export default function Waitlist({ source, hard = false }: WaitlistProps) {
  const [email, setEmail] = useState('');
  // Bots fill every field they find; people never see this one.
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<State>('idle');

  const valid = EMAIL.test(email.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source, hard, website }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <p role="status" className="m-0 text-[13.5px] font-bold">
        ✓ You are on the list. We will email you once, when AI retouch opens.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          className="ink-input sm:w-[250px]"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error') setState('idle');
          }}
          aria-label="Email address for the AI retouch waitlist"
          autoComplete="email"
        />
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <button
          type="submit"
          className="btn btn-magic btn-inline"
          disabled={!valid || state === 'sending'}
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          {state === 'sending' ? 'Saving…' : 'Tell me when it opens'}
        </button>
      </div>
      {state === 'error' && (
        <p role="alert" className="m-0 mt-2 text-[12px] font-bold text-[color:var(--crayon-red)]">
          That did not save. Please try again in a moment.
        </p>
      )}
      <p className="m-0 mt-2 text-[11.5px] leading-[1.4] text-ink-soft">
        One email when it launches, nothing else. AI retouch will be an optional paid extra — the
        converter above stays free.
      </p>
    </form>
  );
}
