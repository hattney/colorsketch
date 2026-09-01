import React, { useCallback, useEffect, useState } from 'react';

/**
 * Minimal history-API router. The site is three routes deep (`/`, `/terms`,
 * `/refund-policy`), which does not justify a routing dependency.
 *
 * Deployment note: the host must fall back to index.html for unknown paths.
 * `vercel.json` carries that rewrite; Vite's dev server does it by default.
 */
export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return path;
}

export function navigate(to: string): void {
  if (window.location.pathname === to) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** Anchor that stays a real link (middle-click, ctrl-click, right-click all work). */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const handle = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
    [to, onClick],
  );

  return React.createElement('a', { href: to, onClick: handle, ...rest }, children);
}
