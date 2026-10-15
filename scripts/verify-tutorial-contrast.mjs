import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';
import { auditAccessibility } from './accessibility-audit.mjs';
import { measureTutorialContrast, measureSettledTutorialContrast, TUTORIAL_CONTRAST_PROBE_SHA256 } from './tutorial-contrast.mjs';

const [output] = process.argv.slice(2);
if (!output || process.argv.length !== 3) throw new Error('usage: node scripts/verify-tutorial-contrast.mjs <output.json>');
const css = readFileSync(new URL('../client/src/features/tutorial/tutorial.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const results = [];
try {
  for (const [name, width, height] of [['phone', 390, 844], ['tablet', 1194, 834], ['desktop', 1440, 900], ['desktop-short', 1440, 650]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent('<!doctype html><html lang="en"><head><title>Tutorial CSS fixture</title></head><body><main><h1>Keyboard fixture</h1><div class="tutorial-card" role="dialog" aria-labelledby="tutorial-title" style="top:100px;left:20px;width:340px"><div class="tutorial-eyebrow">Tutorial</div><h2 id="tutorial-title">Synthetic step</h2><p>Read-only controls.</p><button class="tutorial-close" aria-label="Close tutorial">×</button><div class="tutorial-footer"><span aria-live="polite">1 / 2</span><button class="tutorial-next" aria-label="Next tutorial step">→</button></div></div></main></body></html>');
    await page.addStyleTag({ content: css });
    await page.keyboard.press('Tab');
    const close = await measureTutorialContrast(page, '.tutorial-close');
    await page.keyboard.press('Tab');
    const next = await measureTutorialContrast(page, '.tutorial-next');
    assert.deepEqual(await measureSettledTutorialContrast(page, '.tutorial-next'), next);
    const audit = await auditAccessibility(page);
    const faults = [...close.checks, ...next.checks].filter(c => !c.pass).map(c => `${c.selector} ${c.kind} contrast ${c.ratio.toFixed(3)} < ${c.minimum}`);
    if (audit.violations.length) faults.push(...audit.violations.map(v => `axe ${v.id}`));
    results.push({ name, close, next, audit, faults });
    console.log(`${faults.length ? 'FAIL' : 'PASS'} ${name}: ${faults.join('; ') || 'actual tutorial CSS text and both keyboard outlines'}`);

    // Verify the real probe detects alpha-composited small text, weak focus and
    // unsupported rendering instead of passing after the application is repaired.
    await page.addStyleTag({ content: '.tutorial-eyebrow { color:rgba(0,0,0,.48) } .tutorial-next:focus-visible { outline-color:#00e5cc }' });
    const planted = await measureTutorialContrast(page, '.tutorial-next');
    assert.equal(planted.checks[0].pass, false);
    assert.ok(Math.abs(planted.checks[0].ratio - 3.709) < 0.001, 'alpha compositing must match the known WCAG ratio');
    assert.equal(planted.checks[2].pass, false);
    await page.addStyleTag({ content: '.tutorial-card { opacity:.5 }' });
    await assert.rejects(measureTutorialContrast(page, '.tutorial-next'), /opacity\/filter/);
    results.at(-1).negativeControls = { alphaCompositing: true, weakFocusRejected: true, unsupportedOpacityRejected: true };
    if (name === 'phone') {
      await assert.rejects(measureSettledTutorialContrast(page, '.tutorial-next'), /Timeout/);
      results.at(-1).negativeControls.unsettledCardTimesOut = true;
    }
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync(output, JSON.stringify({ cssSHA256: createHash('sha256').update(css).digest('hex'), probeSHA256: TUTORIAL_CONTRAST_PROBE_SHA256, results }, null, 2));
}
process.exitCode = results.length !== 4 || results.some(r => r.faults.length) ? 1 : 0;
