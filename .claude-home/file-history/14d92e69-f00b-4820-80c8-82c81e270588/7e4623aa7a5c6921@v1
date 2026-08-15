#!/usr/bin/env node
/**
 * Browser acceptance for the landing phone demo (plan §10).
 *
 * This is the check that decides whether the feature is done. It drives a real
 * landing page in Chromium at three viewports and asserts both halves of the
 * plan: that the story visibly performs every advertised workflow, and that it
 * does so without making a single request it is not allowed to make.
 *
 * Requires the dev server (or a preview build) to be up:
 *   npm run dev              # one instance only, on :5000
 *   node scripts/verify-landing-phone-browser.mjs
 *   node scripts/verify-landing-phone-browser.mjs --url http://127.0.0.1:5000
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};

const BASE_URL = arg('url', process.env.LANDING_URL ?? 'http://127.0.0.1:5000');
const OUT = arg('out', '/tmp/taptpay-landing-phone-acceptance');
const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
  { name: 'mobile', width: 390, height: 844 },
];

/** Must match reducer.ts SCENE_ORDER. */
const SCENE_ORDER = [
  'overview', 'rent-weekly', 'property-bill', 'trades-invoice',
  'quote-deposit', 'retail-sale', 'retail-split', 'checkout-wallet',
];

/** §10: requests the demo must never make. */
const FORBIDDEN = [
  { re: /\/api\//, why: 'API call' },
  { re: /\/app\/assets\//, why: 'frozen embedded app asset' },
  { re: /app\/embed\.html/, why: 'the dead iframe' },
  { re: /\/events|\/sse|text\/event-stream/, why: 'SSE stream' },
  { re: /windcave|paymentexpress|sec\.windcave/i, why: 'payment provider' },
  { re: /google-analytics|googletagmanager|segment\.io|hotjar/i, why: 'analytics' },
  { re: /\/(login|auth|session|merchant)\b.*\.(json|js)$/, why: 'auth surface' },
  { re: /three(\.|-)|three\.module/i, why: 'Three.js — removed in P2' },
];

/** Production merchant chunks that must never be pulled into the landing page. */
const MERCHANT_CHUNKS = /(property-terminal|trades-terminal|retail-terminal|merchant-terminal|checkout|split-payment|payment-stack|dashboard|stock-management)-[A-Za-z0-9_-]{6,}\.js/;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

mkdirSync(OUT, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

/** Reads the demo's acceptance selectors (added in P0). */
const readState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-demo-scene]');
    return el
      ? { scene: el.getAttribute('data-demo-scene'), step: Number(el.getAttribute('data-demo-step') ?? -1) }
      : null;
  });

/** Walks the page top to bottom, recording every distinct state seen. */
async function walk(page, samples = 140, reverse = false) {
  const seen = [];
  const height = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
  for (let i = 0; i <= samples; i++) {
    const t = reverse ? 1 - i / samples : i / samples;
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(height * t));
    await page.waitForTimeout(16);
    const s = await readState(page);
    if (!s || s.scene === 'shell') continue;
    const last = seen[seen.length - 1];
    if (!last || last.scene !== s.scene || last.step !== s.step) seen.push(s);
  }
  return seen;
}

for (const vp of VIEWPORTS) {
  console.log(`\n── ${vp.name} ${vp.width}×${vp.height} ${'─'.repeat(30)}`);
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();

  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // ── the demo is present at all ────────────────────────────────────────────
  const mounted = await page.$('[data-demo-scene]');
  if (!mounted) {
    check(`${vp.name}: phone demo mounted`, false, 'no [data-demo-scene] — not wired into landing-page.tsx yet');
    await context.close();
    continue;
  }

  // ── §6 rule 1: nothing phone-specific before the story approaches ─────────
  const earlyPhoneChunk = requests.some((u) => /landing-?phone/i.test(u));
  check(`${vp.name}: no phone chunk before the story approaches`, !earlyPhoneChunk,
    earlyPhoneChunk ? 'phone chunk fetched on initial load' : '');

  const seen = await walk(page);

  // ── the story performs, in order ──────────────────────────────────────────
  const order = [];
  for (const s of seen) if (!order.includes(s.scene)) order.push(s.scene);
  check(`${vp.name}: visits every scene in story order`,
    JSON.stringify(order) === JSON.stringify(SCENE_ORDER),
    order.length ? `saw ${order.join(' → ')}` : 'saw nothing');

  // ── every workflow reaches its finished state ─────────────────────────────
  const maxStep = new Map();
  for (const s of seen) maxStep.set(s.scene, Math.max(maxStep.get(s.scene) ?? -1, s.step));
  for (const scene of SCENE_ORDER) {
    const reached = maxStep.has(scene) && maxStep.get(scene) > 0;
    check(`${vp.name}: ${scene} completes`, reached, reached ? `final step ${maxStep.get(scene)}` : 'never advanced');
  }

  // ── the screen is never blank ─────────────────────────────────────────────
  const painted = await page.evaluate(() => {
    const el = document.querySelector('[data-demo-scene]');
    if (!el) return { visible: false, children: 0 };
    const r = el.getBoundingClientRect();
    return { visible: r.width > 100 && r.height > 100, children: el.querySelectorAll('*').length };
  });
  check(`${vp.name}: phone body visible with a populated screen`,
    painted.visible && painted.children > 8, `${painted.children} nodes`);

  // ── §6: changing scene costs no network ───────────────────────────────────
  const beforeScrub = requests.length;
  await walk(page, 40, true);
  const added = requests.slice(beforeScrub).filter((u) => !u.startsWith('data:'));
  check(`${vp.name}: no new resource when changing scenes`, added.length === 0,
    added.length ? added.slice(0, 3).join(', ') : '');

  // ── reverse scrolling must not strand a stale scene ───────────────────────
  const backward = await walk(page, 140, true);
  const backOrder = [];
  for (const s of backward) if (!backOrder.includes(s.scene)) backOrder.push(s.scene);
  check(`${vp.name}: reverse scroll rewinds cleanly`,
    JSON.stringify(backOrder) === JSON.stringify([...SCENE_ORDER].reverse()),
    backOrder.length ? `saw ${backOrder.join(' → ')}` : 'saw nothing');

  // ── fast jump lands on the right frame ────────────────────────────────────
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(120);
  const atEnd = await readState(page);
  check(`${vp.name}: jump to the end lands on the last scene`,
    atEnd?.scene === SCENE_ORDER[SCENE_ORDER.length - 1], atEnd ? `${atEnd.scene}#${atEnd.step}` : 'none');

  // ── the request graph is clean ────────────────────────────────────────────
  for (const { re, why } of FORBIDDEN) {
    const hits = requests.filter((u) => re.test(u));
    check(`${vp.name}: no ${why} request`, hits.length === 0, hits.slice(0, 2).join(', '));
  }
  const merchantChunks = requests.filter((u) => MERCHANT_CHUNKS.test(u));
  check(`${vp.name}: no production merchant chunk loaded`, merchantChunks.length === 0,
    merchantChunks.slice(0, 2).join(', '));

  const firstParty = errors.filter((e) => !/favicon|third-party/i.test(e));
  check(`${vp.name}: no first-party console or page errors`, firstParty.length === 0,
    firstParty.slice(0, 3).join(' | '));

  await page.screenshot({ path: join(OUT, `${vp.name}-story-end.png`), fullPage: false });
  await context.close();
}

/* ── CSS fallback: the screen must survive without enhanced 3D ─────────────── */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addStyleTag({ content: '.lp-phone{transform:none !important;} .lp-face-back,.lp-rim{display:none !important;}' }).catch(() => {});
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.3));
  await page.waitForTimeout(200);
  const state = await readState(page);
  check('fallback: screen still renders with 3D effects disabled', Boolean(state) && state.scene !== 'shell',
    state ? `${state.scene}#${state.step}` : 'no state');
  await page.screenshot({ path: join(OUT, 'fallback.png') });
  await context.close();
}

/* ── reduced motion: finished frames, no build-up ──────────────────────────── */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.2));
  await page.waitForTimeout(200);
  const state = await readState(page);
  check('reduced motion: shows a completed frame', Boolean(state) && (state?.step ?? 0) > 0,
    state ? `${state.scene}#${state.step}` : 'no state');
  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${'═'.repeat(64)}`);
console.log(`${results.length - failed.length}/${results.length} checks passed · screenshots in ${OUT}`);
if (failed.length) {
  console.error('\nfailures:');
  for (const f of failed) console.error(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
