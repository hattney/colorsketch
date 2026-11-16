import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/**
 * `SINGLE_FILE=1` builds for `scripts/build-single-file.mjs`: no code splitting, so the whole
 * app (heic2any's lazy chunk included) lands in one entry file that the script can inline.
 * The normal deploy build keeps the split, so an iPhone-free visitor never downloads the
 * 1.3 MB HEIC decoder.
 */
const singleFile = process.env.SINGLE_FILE === '1';

/**
 * What changes about the built site in the free edition (`--mode free`, see `FREE_ONLY`).
 *
 * The full edition ships `noindex` because it advertises a paid feature that is not open; the
 * free edition advertises nothing it cannot deliver, and being found is its entire purpose,
 * so the tag comes off and the files a crawler looks for are written. `SITE_URL` is the
 * public origin (no trailing slash). The tags that need an absolute address — canonical, the
 * share image, the sitemap — are only emitted when it is set, since a wrong absolute URL is
 * worse than a missing one.
 */
function freeEdition(mode: string): Plugin {
  const free = mode === 'free';
  const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');

  return {
    name: 'colorsketch-free-edition',
    transformIndexHtml(html) {
      if (!free) return html;
      let out = html.replace(/\s*<!--\s*LAUNCH CHECKLIST[\s\S]*?-->\s*<meta name="robots"[^>]*>/, '');
      if (site) {
        const tags = [
          `<link rel="canonical" href="${site}/" />`,
          `<meta property="og:url" content="${site}/" />`,
          `<meta property="og:image" content="${site}/og.png" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
          `<meta name="twitter:image" content="${site}/og.png" />`,
        ].join('\n    ');
        out = out.replace('</head>', `  ${tags}\n  </head>`);
      }
      return out;
    },
    generateBundle() {
      if (!free) return;
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`,
      });
      if (site) {
        const today = new Date().toISOString().slice(0, 10);
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source:
            `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
            `  <url><loc>${site}/</loc><lastmod>${today}</lastmod></url>\n` +
            `</urlset>\n`,
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), freeEdition(mode)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: singleFile
    ? {
        rollupOptions: { output: { inlineDynamicImports: true } },
        // Keep the worker a separate file: the script turns it into a blob: URL itself.
        assetsInlineLimit: 0,
      }
    : {},
}));
