#!/usr/bin/env node
/**
 * Visual preview harness for the landing phone demo.
 *
 * The plan's fidelity contract (§5) is a visual one — every scene's important
 * starting, action and final states have to be comparable against the real
 * 390 × 844 app. This renders scenes straight from the registry, with no
 * landing page, no merchant app and no server, and screenshots each milestone.
 *
 * It exists so a scene can be checked while it is being written, rather than
 * only after the demo is wired into landing-page.tsx.
 *
 * Usage:
 *   node scripts/preview-landing-phone.mjs                     # every scene
 *   node scripts/preview-landing-phone.mjs --scene rent-weekly # one scene
 *   node scripts/preview-landing-phone.mjs --scene rent-weekly --step 4
 *   node scripts/preview-landing-phone.mjs --out /path/to/dir
 *   node scripts/preview-landing-phone.mjs --no-shot           # build only
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve('.');
const PHONE_DIR = join(ROOT, 'client/src/pages/landing-phone');
const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
};
const onlyScene = arg('scene');
const onlyStep = arg('step');
const shot = !process.argv.includes('--no-shot');
const OUT = resolve(
  arg('out', process.env.PREVIEW_OUT ?? '/tmp/taptpay-landing-phone-preview'),
);

mkdirSync(OUT, { recursive: true });

/* ── 1. bundle the scenes ─────────────────────────────────────────────────── */

const entry = join(OUT, 'entry.tsx');
writeFileSync(
  entry,
  `import { createRoot } from 'react-dom/client';
import { SCENES } from '${join(PHONE_DIR, 'scenes/registry')}';
import { SCENE_ORDER } from '${join(PHONE_DIR, 'reducer')}';
import { LandingPhoneDemo } from '${join(PHONE_DIR, 'LandingPhoneDemo')}';

const params = new URLSearchParams(location.search);
const only = params.get('scene');
const onlyStep = params.get('step');

const frames = [];
for (const id of SCENE_ORDER) {
  if (only && id !== only) continue;
  const def = SCENES[id];
  for (let step = 0; step < def.steps; step++) {
    if (onlyStep !== null && String(step) !== onlyStep) continue;
    frames.push({ id, step });
  }
}

function Tile({ id, step }) {
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        data-frame={id + '#' + step}
        style={{ width: 390, height: 844, position: 'relative', overflow: 'hidden', borderRadius: 54, background: '#fff' }}
      >
        <LandingPhoneDemo state={{ scene: id, step }} />
      </div>
      <figcaption style={{ font: "500 12px/1.3 'Outfit', system-ui", color: '#F4F1E8', textAlign: 'center' }}>
        {id} · step {step}
      </figcaption>
    </figure>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, padding: 28, background: '#040D6D', minHeight: '100vh' }}>
    {frames.map((f) => <Tile key={f.id + f.step} {...f} />)}
  </div>,
);
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  target: 'es2020',
  outfile: join(OUT, 'preview.js'),
  // The generated entry sits outside the repo, so point resolution back at it.
  absWorkingDir: ROOT,
  nodePaths: [join(ROOT, 'node_modules')],
  alias: { '@': join(ROOT, 'client/src'), '@shared': join(ROOT, 'shared') },
  loader: { '.webp': 'file', '.png': 'file', '.otf': 'file' },
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"development"' },
});

writeFileSync(
  join(OUT, 'preview.html'),
  `<!doctype html><meta charset="utf-8"><title>landing phone preview</title>
<style>html,body{margin:0;background:#040D6D;}</style>
<!-- Served straight from client/src so the preview uses the same local Outfit
     and Larken @font-face declarations the landing page ships. -->
<link rel="stylesheet" href="/landing.css">
<link rel="stylesheet" href="/preview.css">
<div id="root"></div>
<script type="module" src="/preview.js"></script>`,
);

if (!shot) {
  console.log(`built preview → ${join(OUT, 'preview.html')}`);
  process.exit(0);
}

/* ── 2. serve it (assets come from client/public) ─────────────────────────── */

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.otf': 'font/otf', '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const candidates = [
    join(OUT, path),
    join(ROOT, 'client/public', path),
    join(ROOT, 'client/src/pages', path), // /landing.css
  ];
  const file = candidates.find((c) => existsSync(c) && extname(c));
  if (!file) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

/* ── 3. screenshot every frame ────────────────────────────────────────────── */

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));

const qs = new URLSearchParams();
if (onlyScene) qs.set('scene', onlyScene);
if (onlyStep !== null) qs.set('step', onlyStep);
await page.goto(`http://127.0.0.1:${port}/preview.html?${qs}`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-frame]');
await page.evaluate(() => document.fonts.ready);

const frames = await page.$$('[data-frame]');
for (const frame of frames) {
  const name = (await frame.getAttribute('data-frame')).replace('#', '-step');
  await frame.screenshot({ path: join(OUT, `${name}.png`) });
}

await browser.close();
server.close();

console.log(`captured ${frames.length} frame(s) → ${OUT}`);
if (errors.length) {
  console.error('\npage errors:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
