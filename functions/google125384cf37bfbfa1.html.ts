/**
 * Google Search Console's ownership file for https://colorsketch.pages.dev.
 *
 * It is served from a function rather than `public/` because Pages redirects any `*.html`
 * request to the extensionless path (308), and Google expects the file at this exact URL.
 */
export const onRequestGet = (): Response =>
  new Response('google-site-verification: google125384cf37bfbfa1.html', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
