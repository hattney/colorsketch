/**
 * Bundles the built app into ONE self-contained .html for external review.
 *
 * The normal `dist/` needs a server: it fetches sibling JS chunks, a worker file, and the
 * `/samples` images, and it relies on `vercel.json`'s SPA rewrite. A review link has none of
 * that, so everything moves inside the file:
 *
 *   - CSS and the entry JS are inlined
 *   - the line-art worker becomes a blob: URL built from its inlined source
 *   - every `public/samples` image becomes a data: URI, handed to the app through
 *     `window.__CS_ASSETS` (see `utils/samples.ts`)
 *   - heic2any's dynamic import is already folded in by `inlineDynamicImports`
 *
 * Output: dist-single/colorsketch-review.html
 */
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'dist-single');

// Run the build here rather than in the npm script: `SINGLE_FILE=1 vite build` is a POSIX
// shell idiom, and npm hands scripts to cmd.exe on Windows, where it is a syntax error.
const build = spawnSync('npx', ['vite', 'build'], {
  cwd: root,
  env: { ...process.env, SINGLE_FILE: '1' },
  stdio: 'inherit',
  shell: true,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const assetsDir = path.join(dist, 'assets');
const files = fs.readdirSync(assetsDir);

const pick = (re) => {
  const name = files.find((f) => re.test(f));
  if (!name) throw new Error(`No built asset matching ${re}`);
  return { name, body: fs.readFileSync(path.join(assetsDir, name), 'utf8') };
};

const css = pick(/^index-.*\.css$/);
const entry = pick(/^index-.*\.js$/);
const worker = pick(/^lineart\.worker-.*\.js$/);

// --- sample images -> data URIs -------------------------------------------------
const samplesDir = path.join(root, 'public', 'samples');
const assetMap = {};
if (fs.existsSync(samplesDir)) {
  for (const file of fs.readdirSync(samplesDir)) {
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) continue;
    const b64 = fs.readFileSync(path.join(samplesDir, file)).toString('base64');
    assetMap[file] = `data:${mime};base64,${b64}`;
  }
}

// --- worker -> blob URL ---------------------------------------------------------
// The built entry contains: new Worker(new URL("/assets/lineart.worker-HASH.js",import.meta.url)
// Swap that URL expression for a blob built from the worker's own source.
const workerUrlPattern = new RegExp(
  `new URL\\(\\s*(["'])[^"']*${worker.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\s*,\\s*import\\.meta\\.url\\s*\\)`,
  'g',
);

if (!workerUrlPattern.test(entry.body)) {
  throw new Error('Could not find the worker URL in the entry bundle — build layout changed.');
}
workerUrlPattern.lastIndex = 0;

const inlinedEntry = entry.body.replace(workerUrlPattern, '__CS_WORKER_URL');

// --- assemble -------------------------------------------------------------------
// A classic script runs before the deferred module, so the asset map and worker URL are in
// place by the time any module code evaluates.
const bootstrap = `
window.__CS_ASSETS = ${JSON.stringify(assetMap)};
window.__CS_WORKER_URL = (function () {
  try {
    return URL.createObjectURL(
      new Blob([${JSON.stringify(worker.body)}], { type: 'text/javascript' })
    );
  } catch (e) {
    // Blocked by CSP: workerClient falls back to the main thread.
    return 'data:text/javascript,';
  }
})();
`.trim();

// Google Fonts is the one external host the artifact CSP allows; everything else is inlined.
const html = `<title>ColorSketch</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
${css.body}
</style>
<div id="root"></div>
<script>
${bootstrap}
</script>
<script type="module">
${inlinedEntry}
</script>
`;

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'colorsketch-review.html');
fs.writeFileSync(outFile, html);

const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log('wrote', outFile);
console.log('  size          ', mb(Buffer.byteLength(html)));
console.log('  samples inlined', Object.keys(assetMap).length);
console.log('  worker inlined ', worker.name);
