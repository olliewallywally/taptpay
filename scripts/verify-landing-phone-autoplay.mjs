#!/usr/bin/env node
/**
 * Autoplay acceptance for the cinematic landing phone.
 *
 * The demo used to be scrubbed by scroll: the workflow only advanced while the
 * reader kept scrolling, so a stationary reader saw a frozen screen. It now
 * plays itself. This asserts the three promises that change makes, none of
 * which a unit test can reach because they are all about a real clock in a real
 * page:
 *
 *   1. parked at one scroll position, the workflow advances on its own;
 *   2. it loops rather than resting on the finished frame;
 *   3. the scene stays put while it does — the cinematic caption beside the
 *      phone is scroll-driven, so a drifting scene would contradict the words.
 *
 * Plus the two ways it is allowed to stop: scrolled off screen, and
 * prefers-reduced-motion.
 *
 * Requires the dev server up on :5000 (one instance only):
 *   node scripts/verify-landing-phone-autoplay.mjs
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

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/** Park the viewport at a fixed fraction through the story and stop moving. */
async function parkInStory(page, fraction) {
  await page.evaluate((f) => {
    const wrap = document.getElementById('tp-story-wrap');
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.round(top + (wrap.offsetHeight - window.innerHeight) * f));
  }, fraction);
  await page.waitForTimeout(700);
}

const frame = (page) => page.locator('#tp-story [data-demo-scene]').first();

/** Sample the phone for `ms` without touching the page. */
async function sample(page, ms, everyMs = 120) {
  const seen = [];
  const el = frame(page);
  for (let t = 0; t < ms; t += everyMs) {
    const [scene, step] = await el.evaluate((n) => [
      n.getAttribute('data-demo-scene'),
      n.getAttribute('data-demo-step'),
    ]);
    const last = seen[seen.length - 1];
    if (!last || last.scene !== scene || last.step !== step) seen.push({ scene, step });
    await page.waitForTimeout(everyMs);
  }
  return seen;
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });

  // ---- 1. it plays on its own, loops, and holds its scene ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await parkInStory(page, 0.45);
    await frame(page).waitFor({ state: 'attached' });
    await page.waitForFunction(
      () => document.querySelector('#tp-story [data-demo-scene]')?.getAttribute('data-demo-scene') !== 'shell',
      null,
      { timeout: 10_000 },
    );

    const scrollBefore = await page.evaluate(() => window.scrollY);
    const seen = await sample(page, 14_000);
    const scrollAfter = await page.evaluate(() => window.scrollY);

    check('scroll never moved during the sample', scrollBefore === scrollAfter, `${scrollBefore} → ${scrollAfter}`);

    const scenes = [...new Set(seen.map((s) => s.scene))];
    check('scene stays fixed while parked', scenes.length === 1, `saw ${scenes.join(', ') || 'nothing'}`);

    const steps = seen.map((s) => Number(s.step));
    check('workflow advances with no scrolling', steps.length > 2, `${steps.length} milestones: ${steps.join('→')}`);

    // A loop shows step 0 again after having reached a higher milestone.
    const peak = Math.max(...steps, -1);
    const wrapped = steps.some((s, i) => i > 0 && s < steps[i - 1]);
    check('loops instead of resting on the finished frame', wrapped, `peak step ${peak}, sequence ${steps.join('→')}`);

    // Every milestone from 0..peak should appear — no skipping.
    const missing = Array.from({ length: peak + 1 }, (_, i) => i).filter((i) => !steps.includes(i));
    check('no milestone skipped', missing.length === 0, missing.length ? `missing ${missing.join(',')}` : `0…${peak}`);

    await page.close();
  }

  // ---- 2. scrolling still chooses the scene ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const scenes = [];
    for (const f of [0.05, 0.3, 0.55, 0.8, 0.97]) {
      await parkInStory(page, f);
      scenes.push(await frame(page).getAttribute('data-demo-scene'));
    }
    const distinct = [...new Set(scenes)].filter((s) => s && s !== 'shell');
    check('scroll still selects the scene', distinct.length >= 4, scenes.join(' → '));
    await page.close();
  }

  // ---- 3. parks off screen ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await parkInStory(page, 0.45);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);
    const before = await frame(page).getAttribute('data-demo-step');
    await page.waitForTimeout(5000);
    const after = await frame(page).getAttribute('data-demo-step');
    check('clock parks while off screen', before === after, `step ${before} → ${after}`);
    await page.close();
  }

  // ---- 4. reduced motion gets a still frame, not a loop ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await parkInStory(page, 0.45);
    await page.waitForFunction(
      () => document.querySelector('#tp-story [data-demo-scene]')?.getAttribute('data-demo-scene') !== 'shell',
      null,
      { timeout: 10_000 },
    );
    const seen = await sample(page, 6000, 300);
    check('reduced motion does not autoplay', seen.length === 1, `${seen.length} distinct frames`);
    const [only] = seen;
    check('reduced motion shows the finished frame', Number(only?.step) > 0, `${only?.scene} step ${only?.step}`);
    await page.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
