import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';
import { auditAccessibility, accessibilityEvaluation, structuralTarget } from './accessibility-audit.mjs';

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const clean = '<!doctype html><html lang="en"><head><title>Accessibility fixture</title></head><body><main><h1>Controls</h1><label for="field">Name</label><input id="field"><button>Continue</button></main></body></html>';
let checks = 0;
try {
  assert.deepEqual(structuralTarget(['button[aria-label="Synthetic customer"]', ['a[href="/pay?token=synthetic]secret"]', 'input[value="synthetic\\\"value"]']]),
    ['button[aria-label]', ['a[href]', 'input[value]']]);
  console.log('PASS nested CSS attribute selectors omit values, including escaped quotes and brackets'); checks++;
  await page.setContent(clean);
  await assert.rejects(page.evaluate(`(${accessibilityEvaluation.toString()})()`), /engine did not load/);
  console.log('PASS missing accessibility engine is rejected'); checks++;
  const plants = [
    ['clean controls', null, null],
    ['a numeric paragraph does not become a heading by font size alone', () => { const p = document.createElement('p'); p.textContent = '1240'; p.style.cssText = 'font-size:30px;font-weight:bold'; document.querySelector('main').append(p); }, null],
    ['unnamed button', () => { document.querySelector('button').textContent = ''; }, 'button-name'],
    ['unlabelled input', () => document.querySelector('label').remove(), 'label'],
    ['unnamed dialog', () => { const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.textContent = 'Contents'; document.body.append(dialog); }, 'aria-dialog-name'],
    ['invalid ARIA state', () => document.querySelector('button').setAttribute('aria-expanded', 'perhaps'), 'aria-valid-attr-value'],
    ['insufficient contrast', () => { const p = document.createElement('p'); p.textContent = 'Synthetic low contrast'; p.style.cssText = 'color:#aaa;background:#fff;font:12px Arial'; document.querySelector('main').append(p); }, 'color-contrast'],
    ['small crowded targets', () => { document.querySelector('main').insertAdjacentHTML('beforeend', '<div><button style="width:10px;height:10px;padding:0;font-size:4px">A</button><button style="width:10px;height:10px;padding:0;font-size:4px">B</button></div>'); }, 'target-size'],
    ['unreachable scroll region', () => { document.querySelector('main').insertAdjacentHTML('beforeend', '<div style="height:50px;overflow:auto"><p style="height:200px">Read-only content</p></div>'); }, 'scrollable-region-focusable'],
    ['named keyboard-accessible scroll region', () => { document.querySelector('main').insertAdjacentHTML('beforeend', '<div tabindex="0" role="region" aria-label="Requests" style="height:50px;overflow:auto"><p style="height:200px">Read-only content</p></div>'); }, null],
  ];
  for (const [name, plant, rule] of plants) {
    await page.setContent(clean);
    if (plant) await page.evaluate(plant);
    const result = await auditAccessibility(page);
    assert.equal(result.engineVersion, '4.10.3');
    assert.ok(result.passedRuleIds.length);
    assert.ok(!result.selectedRuleIds.includes('p-as-heading'), 'experimental heuristics must not be silently enabled as standard WCAG checks');
    if (rule) assert.ok(result.violations.some(x => x.id === rule), JSON.stringify(result));
    else assert.deepEqual(result.violations, []);
    assert.ok(!JSON.stringify(result).includes('Synthetic low contrast'), 'node text must not enter reports');
    assert.ok(result.violations.every(x => x.nodes.every(n => Object.keys(n).every(k => ['target', 'checkIds'].includes(k)))));
    console.log(`PASS ${name}`); checks++;
  }
  console.log(`${checks} accessibility evaluator checks pass`);
} finally { await browser.close(); }
