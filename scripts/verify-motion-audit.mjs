import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';
import { installMotionProbe, auditMotion, settledMotionEnvironment } from './motion-audit.mjs';
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(installMotionProbe);
  const page = await context.newPage();
  await page.setContent('<main><button>PRIVATE-MARKER</button></main>');
  await page.evaluate(installMotionProbe);
  await page.waitForTimeout(50);
  assert.deepEqual((await auditMotion(page)).faults, []);
  await page.evaluate(() => document.querySelector('button').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 0.01 }));
  assert.deepEqual(await settledMotionEnvironment(page), { reducedMotion: true, running: 0 });
  await page.evaluate(() => document.querySelector('button').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100px)' }], { duration: 600 }));
  await page.waitForTimeout(80);
  const bad = await auditMotion(page);
  assert.equal(bad.faults.length, 1);
  assert.ok(!JSON.stringify(bad).includes('PRIVATE-MARKER'));
  assert.ok(!JSON.stringify(bad).includes('100px'));
  await page.evaluate(() => document.querySelector('button').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100px)' }], { duration: 10000, iterations: Infinity }));
  assert.ok((await settledMotionEnvironment(page)).running > 0);
  assert.ok((await auditMotion(page)).faults.length >= 2);
  console.log('PASS reduced preference, clean control, observed moving entrance and privacy');
} finally { await browser.close(); }
