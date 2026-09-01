import React from 'react';
import { Link, navigate } from '../utils/router';

export default function Header() {
  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.location.pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
    else navigate('/');
  };

  return (
    <header className="border-b-[2.5px] border-ink bg-paper sticky top-0 z-50">
      <div className="mx-auto flex h-[74px] max-w-[1080px] items-center justify-between px-6">
        <a
          href="/"
          onClick={goHome}
          className="font-display text-[23px] font-extrabold tracking-[-0.03em] flex items-center gap-2.5 no-underline text-ink"
        >
          <span className="relative inline-block h-[22px] w-[22px] rounded-full border-[2.5px] border-ink">
            <span
              className="absolute -left-[3px] top-[5px] h-[14px] w-[16px] rounded-full opacity-90"
              style={{ background: 'var(--crayon-red)' }}
              aria-hidden="true"
            />
          </span>
          ColorSketch
        </a>

        <nav className="flex gap-2 text-[14.5px] font-medium">
          <Link
            to="/#samples"
            onClick={(e) => {
              e.preventDefault();
              if (window.location.pathname !== '/') navigate('/');
              requestAnimationFrame(() =>
                document.getElementById('samples')?.scrollIntoView({ behavior: 'smooth' }),
              );
            }}
            className="rounded-[20px] border-2 border-transparent px-3 py-[7px] text-ink no-underline hover:border-ink"
          >
            Examples
          </Link>
          <Link
            to="/#faq"
            onClick={(e) => {
              e.preventDefault();
              if (window.location.pathname !== '/') navigate('/');
              requestAnimationFrame(() =>
                document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }),
              );
            }}
            className="rounded-[20px] border-2 border-transparent px-3 py-[7px] text-ink no-underline hover:border-ink"
          >
            FAQ
          </Link>
        </nav>
      </div>
    </header>
  );
}
