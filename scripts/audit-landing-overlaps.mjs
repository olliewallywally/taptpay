#!/usr/bin/env node
/**
 * Overlap and spacing audit for the landing page.
 *
 * Reports, per viewport and per act:
 *   • pairs of interactive elements whose hit areas genuinely collide
 *     (neither contains the other) — one of them is unclickable;
 *   • interactive elements pushed outside the viewport horizontally;
 *   • interactive elements that touch or sit closer than a comfortable gap.
 *
 * Read-only: it changes nothing, it just measures. Run before and after a
 * layout fix to prove the fix.
 *
 *   node scripts/audit-landing-overlaps.mjs
 *   node scripts/audit-landing-overlaps.mjs --json
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};

const BASE_URL = arg('url', process.env.LANDING_URL ?? 'http://127.0.0.1:5000');
const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const AS_JSON = process.argv.includes('--json');

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1180, height: 820 },
  { name: 'mobile', width: 390, height: 844 },
];

/** Below this, two controls read as one blob and are easy to mis-tap. */
const MIN_GAP = 8;

/**
 * Runs in the page. Returns every collision, near-miss and overflow it can see.
 *
 * Only judges controls currently inside the viewport band. Measuring the whole
 * document at once looks cheaper but lies: the cinematic phone is inside a
 * `position: sticky` viewport and the mobile Industries phone is `display: none`
 * until its reveal tab is tapped, so an off-screen rect is not the rect a reader
 * ever sees.
 */
function measure(minGap) {
  const sel = 'a[href], button, [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const vh = window.innerHeight;
  const nodes = Array.from(document.querySelectorAll(sel)).filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    if (cs.pointerEvents === 'none') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    return r.bottom > -40 && r.top < vh + 40;
  });

  const describe = (el) => {
    const r = el.getBoundingClientRect();
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34);
    const owner = el.closest('section[id], div[id^="tp-"]');
    return {
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean).slice(0, 2).join('.'),
      id: el.id || null,
      act: owner ? owner.id : null,
      label,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    };
  };

  const overlaps = [];
  const tight = [];
  const offscreen = [];
  const vw = window.innerWidth;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const ra = a.getBoundingClientRect();
    if (ra.left < -1 || ra.right > vw + 1) offscreen.push({ ...describe(a), vw });

    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      // A control inside another control is a nesting question, not an overlap.
      if (a.contains(b) || b.contains(a)) continue;
      const rb = b.getBoundingClientRect();

      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);

      if (ox > 1 && oy > 1) {
        overlaps.push({ a: describe(a), b: describe(b), overlapW: Math.round(ox), overlapH: Math.round(oy) });
      } else if (ox > 1 && oy <= 1 && oy > -minGap) {
        // Near-miss: they share one axis and are closer than a comfortable gap
        // on the other, so they read as one blob and are easy to mis-tap.
        tight.push({ a: describe(a), b: describe(b), gap: Math.round(-oy), axis: 'vertical' });
      } else if (oy > 1 && ox <= 1 && ox > -minGap) {
        tight.push({ a: describe(a), b: describe(b), gap: Math.round(-ox), axis: 'horizontal' });
      }
    }
  }
  return { overlaps, tight, offscreen, count: nodes.length };
}

const ACTS = ['tp-hero', 'tp-story-wrap', 'tp-industries', 'tp-pricing', 'tp-contact'];

async function run() {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  const report = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const seenPairs = new Set();
    const vpReport = { viewport: vp.name, overlaps: [], tight: [], offscreen: [], stations: [] };

    const keyOf = (o) => `${o.a.tag}.${o.a.cls}#${o.a.label}|${o.b.tag}.${o.b.cls}#${o.b.label}`;

    const sampleHere = async (station) => {
      const res = await page.evaluate(measure, MIN_GAP);
      if (!res) return;
      vpReport.stations.push({ station, controls: res.count });
      for (const o of res.overlaps) {
        if (seenPairs.has(keyOf(o))) continue;
        seenPairs.add(keyOf(o));
        vpReport.overlaps.push({ ...o, station });
      }
      for (const t of res.tight) {
        if (seenPairs.has(`tight:${keyOf(t)}`)) continue;
        seenPairs.add(`tight:${keyOf(t)}`);
        vpReport.tight.push({ ...t, station });
      }
      for (const f of res.offscreen) {
        const k = `off:${f.tag}.${f.cls}#${f.label}`;
        if (seenPairs.has(k)) continue;
        seenPairs.add(k);
        vpReport.offscreen.push({ ...f, station });
      }
    };

    const scrollTo = async (id, block = 'center') => {
      const found = await page.$(`#${id}`);
      if (!found) return false;
      await page.evaluate(
        ([sel, b]) => document.getElementById(sel)?.scrollIntoView({ block: b, behavior: 'instant' }),
        [id, block],
      );
      await page.waitForTimeout(700);
      return true;
    };

    for (const act of ACTS) {
      if (act === 'tp-story-wrap') {
        // One sample per beat: the phone is sticky, so its neighbours change
        // as the story advances even though the phone itself does not move.
        for (const f of [0.05, 0.35, 0.65, 0.95]) {
          await page.evaluate((frac) => {
            const wrap = document.getElementById('tp-story-wrap');
            if (!wrap) return;
            const top = wrap.getBoundingClientRect().top + window.scrollY;
            window.scrollTo(0, Math.round(top + (wrap.offsetHeight - window.innerHeight) * frac));
          }, f);
          await page.waitForTimeout(600);
          await sampleHere(`story@${f}`);
        }
        continue;
      }

      if (!(await scrollTo(act))) continue;
      await sampleHere(act);

      if (act === 'tp-industries') {
        // Mobile hides the phone behind a "see it live" reveal tab, so the
        // controls that live on the phone are unreachable until it is tapped.
        const reveal = page.locator('#tp-industries button', { hasText: /^see it live$/ });
        if (await reveal.count()) {
          await reveal.first().click();
          await page.waitForTimeout(900);
          await sampleHere('tp-industries (revealed)');
        }
        // "try it live" swaps the button's own label and turns the screen into a
        // tap target, which is exactly when a collision would appear.
        const live = page.locator('.tp-phone-live');
        if (await live.count()) {
          await live.first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          await sampleHere('tp-industries (phone in view)');
          await live.first().click();
          await page.waitForTimeout(800);
          await sampleHere('tp-industries (live)');
        }
        // Each tab can size its copy differently, which moves everything below.
        for (const tab of ['tp-tab-trades', 'tp-tab-retail']) {
          const t = page.locator(`#${tab}`);
          if (await t.count()) {
            await t.first().click();
            await page.waitForTimeout(700);
            await sampleHere(`tp-industries (${tab})`);
          }
        }
      }
    }

    report.push(vpReport);
    await page.close();
  }

  await browser.close();

  const totalProblems = report.reduce(
    (sum, viewport) => sum + viewport.overlaps.length + viewport.tight.length + viewport.offscreen.length,
    0,
  );
  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
    return;
    if (totalProblems > 0) process.exitCode = 1;
  }

  const fmt = (d) => `${d.tag}${d.cls ? '.' + d.cls : ''}${d.id ? '#' + d.id : ''} "${d.label}" [${d.x},${d.y} ${d.w}×${d.h}]`;
  let problems = 0;

  for (const vp of report) {
    console.log(`\n${'='.repeat(70)}\n${vp.viewport}\n${'='.repeat(70)}`);

    if (vp.overlaps.length) {
      console.log(`\n  OVERLAPPING CONTROLS (${vp.overlaps.length}) — one of each pair is unclickable`);
      for (const o of vp.overlaps) {
        problems++;
        console.log(`    [${o.station}] ${o.overlapW}×${o.overlapH}px overlap`);
        console.log(`        A  ${fmt(o.a)}`);
        console.log(`        B  ${fmt(o.b)}`);
      }
    } else console.log('\n  no overlapping controls');

    if (vp.offscreen.length) {
      console.log(`\n  HORIZONTALLY OFF-VIEWPORT (${vp.offscreen.length})`);
      for (const f of vp.offscreen) {
        problems++;
        console.log(`    [${f.station}] ${fmt(f)} — viewport is ${f.vw}px wide`);
      }
    }

    if (vp.tight.length) {
      console.log(`\n  TIGHT SPACING (<${MIN_GAP}px) (${vp.tight.length})`);
      for (const t of vp.tight) {
        problems++;
        console.log(`    [${t.station}] ${t.gap}px ${t.axis} gap`);
        console.log(`        A  ${fmt(t.a)}`);
        console.log(`        B  ${fmt(t.b)}`);
      }
    }
  }

  console.log(`\n${problems} layout problem(s) found across ${report.length} viewports`);
  if (problems > 0) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
