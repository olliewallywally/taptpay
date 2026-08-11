#!/usr/bin/env node
/**
 * Captures one full play-through of a landing-phone scene as a filmstrip.
 *
 * The autoplay contract is unit tested, but "does this look like somebody using
 * the app" is not a thing a test can answer. This parks the story on one scene
 * and shoots the phone every `--every` ms for a whole cycle, so the presses,
 * screen changes and the loop point can be looked at directly.
 *
 *   node scripts/filmstrip-landing-phone.mjs --scene retail-sale
 *   node scripts/filmstrip-landing-phone.mjs --scene retail-sale --out /tmp/strip
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};

const BASE_URL = arg('url', 'http://127.0.0.1:5000');
const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const SCENE = arg('scene', 'retail-sale');
const OUT = arg('out', '/tmp/taptpay-filmstrip');
const EVERY = Number(arg('every', '150'));
const SPAN = Number(arg('span', '13000'));

/** Must match reducer.ts SCENE_ORDER. */
const SCENE_ORDER = [
  'overview', 'rent-weekly', 'property-bill', 'trades-invoice',
  'quote-deposit', 'retail-sale', 'retail-split', 'checkout-wallet',
];

async function run() {
  const idx = SCENE_ORDER.indexOf(SCENE);
  if (idx < 0) throw new Error(`unknown scene "${SCENE}" — one of ${SCENE_ORDER.join(', ')}`);
  // Centre of the scene's zone, so scroll cannot drift into a neighbour.
  const fraction = (idx + 0.5) / SCENE_ORDER.length;

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await page.evaluate((f) => {
    const wrap = document.getElementById('tp-story-wrap');
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.round(top + (wrap.offsetHeight - window.innerHeight) * f));
  }, fraction);

  await page.waitForFunction(
    (want) => document.querySelector('#tp-story [data-demo-scene]')?.getAttribute('data-demo-scene') === want,
    SCENE,
    { timeout: 15_000 },
  );

  const phone = page.locator('#tp-story [data-demo-scene]').first();
  const frames = [];
  let shot = 0;

  for (let t = 0; t < SPAN; t += EVERY) {
    const step = await phone.getAttribute('data-demo-step');
    // One shot per step, at the step's own start — that is the frame a viewer
    // registers, and it keeps the strip as long as the script rather than as
    // long as the sampling.
    if (frames.length === 0 || frames[frames.length - 1].step !== step) {
      const file = join(OUT, `${SCENE}-${String(shot).padStart(2, '0')}-step${step}.png`);
      // A clipped page shot, not an element shot: the cinematic rig animates
      // continuously, so `element.screenshot()` waits forever for it to be
      // "stable" and times out. Re-measure each time, since the rig drifts.
      const box = await phone.boundingBox();
      if (box) {
        await page.screenshot({
          path: file,
          clip: {
            x: Math.max(0, box.x), y: Math.max(0, box.y),
            width: Math.min(box.width, 1440 - Math.max(0, box.x)),
            height: Math.min(box.height, 900 - Math.max(0, box.y)),
          },
          animations: 'allow',
        });
        frames.push({ step, file, at: t });
        shot++;
      }
    }
    await page.waitForTimeout(EVERY);
  }

  await browser.close();

  console.log(`${SCENE}: ${frames.length} frames over ${SPAN}ms → ${OUT}`);
  for (const f of frames) console.log(`  step ${String(f.step).padStart(2)}  @${String(f.at).padStart(5)}ms  ${f.file}`);
  const steps = frames.map((f) => Number(f.step));
  const wrapped = steps.some((s, i) => i > 0 && s < steps[i - 1]);
  console.log(`\nsequence: ${steps.join('→')}`);
  console.log(wrapped ? 'looped within the span' : 'did NOT loop within the span');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
