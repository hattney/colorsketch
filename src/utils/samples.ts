import { useEffect, useState } from 'react';

const base = import.meta.env.BASE_URL;

declare global {
  interface Window {
    /**
     * Filename -> data URI, injected by `scripts/build-single-file.mjs`.
     *
     * The single-file review build has no `/samples/` directory to fetch from, so every
     * sample has to travel inside the HTML. Resolving through one helper is what makes that
     * possible without a second code path: give this map a filename and it wins, otherwise
     * the normal public-directory URL is used.
     */
    __CS_ASSETS?: Record<string, string>;
  }
}

export const sampleUrl = (name: string): string =>
  (typeof window !== 'undefined' && window.__CS_ASSETS?.[name]) || `${base}samples/${name}`;

/**
 * Resolves once every URL has either loaded or failed.
 * Sample cards render only when all of their images exist (CONTENT_UPDATE.md §13),
 * so the page stays intact on a fresh checkout with an empty `public/samples/`.
 */
export function useImagesExist(urls: string[]): boolean | null {
  const key = urls.join('|');
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOk(null);

    Promise.all(
      urls.map(
        (url) =>
          new Promise<boolean>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
          }),
      ),
    ).then((results) => {
      if (!cancelled) setOk(results.every(Boolean));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return ok;
}
