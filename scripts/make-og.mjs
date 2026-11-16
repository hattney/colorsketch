/**
 * Builds `public/og.png`, the 1200x630 card shown when the site is shared.
 *
 * It is made from the same sketch sample the free edition's hero uses, so the picture in a
 * link preview is a result the visitor can actually get. Run with `node scripts/make-og.mjs`
 * whenever the samples or the headline change; the output is committed.
 */
import sharp from 'sharp';

const W = 1200;
const H = 630;
const TILE = 300;

const tile = (file) =>
  sharp(`public/samples/${file}`)
    .flatten({ background: '#ffffff' })
    .resize(TILE, TILE, { fit: 'cover' })
    .png()
    .toBuffer();

const frame = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#fffdf9"/>
  <rect x="0" y="0" width="${W}" height="18" fill="#f5c242"/>

  <ellipse cx="88" cy="108" rx="20" ry="18" fill="#e8503a"/>
  <circle cx="100" cy="103" r="22" fill="none" stroke="#141414" stroke-width="7"/>
  <text x="140" y="118" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="800" fill="#141414">ColorSketch</text>

  <text font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="800" fill="#141414">
    <tspan x="64" y="250">Turn any photo</tspan>
    <tspan x="64" y="324">into a coloring</tspan>
    <tspan x="64" y="398">page.</tspan>
  </text>
  <text x="64" y="470" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#5e5a55">Free · no sign-up · runs in your browser</text>
  <text x="64" y="512" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#5e5a55">Prints on US Letter or A4</text>

  <!-- drop shadows, then the two sheets' borders -->
  <rect x="596" y="174" width="${TILE + 10}" height="${TILE + 10}" rx="10" fill="#141414"/>
  <rect x="866" y="204" width="${TILE + 10}" height="${TILE + 10}" rx="10" fill="#4fa36b"/>
  <rect x="586" y="164" width="${TILE + 10}" height="${TILE + 10}" rx="10" fill="#141414"/>
  <rect x="856" y="194" width="${TILE + 10}" height="${TILE + 10}" rx="10" fill="#141414"/>
</svg>`);

const labels = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="601" y="179" width="118" height="34" rx="17" fill="#141414"/>
  <text x="660" y="203" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#ffffff">ORIGINAL</text>
  <rect x="871" y="209" width="80" height="34" rx="17" fill="#4fa36b"/>
  <text x="911" y="233" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#ffffff">FREE</text>
</svg>`);

await sharp(frame)
  .composite([
    { input: await tile('baby-before.jpg'), left: 591, top: 169 },
    { input: await tile('baby-after.png'), left: 861, top: 199 },
    { input: labels, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile('public/og.png');

console.log('public/og.png written');
