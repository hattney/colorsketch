import React from 'react';
import { CONTACT_EMAIL } from '../config';
import { Link } from '../utils/router';

const linkClass = 'font-bold text-ink underline decoration-2 underline-offset-[3px]';

export default function Footer() {
  return (
    <footer className="border-t-[2.5px] border-ink bg-white py-10 text-sm text-ink-soft">
      <div className="mx-auto max-w-[1080px] px-6">
        <p className="m-0 mb-5 max-w-[70ch]">
          By uploading an image, you confirm you own it or have permission to use it. ColorSketch
          processes images at your direction and is not responsible for the content of uploaded
          images.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            Questions:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
              {CONTACT_EMAIL}
            </a>
          </div>
          <div className="flex items-center gap-[18px]">
            <Link to="/terms" className={linkClass}>
              Terms
            </Link>
            <Link to="/refund-policy" className={linkClass}>
              Refund Policy
            </Link>
            <span>© 2026 ColorSketch</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
