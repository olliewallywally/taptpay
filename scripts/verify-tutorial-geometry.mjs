import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';
import { measureTutorial } from './tutorial-geometry.mjs';

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const fixture = `<style>body{margin:0}.target{position:absolute;left:20px;top:20px;width:120px;height:40px}.tutorial-highlight{position:fixed;left:11px;top:11px;width:138px;height:58px;pointer-events:none}.tutorial-card{position:fixed;left:20px;top:160px;width:300px;height:180px;background:white}.tutorial-card button{width:100px;height:44px}</style><div class="target">A target</div><div class="tutorial-highlight"></div><div class="tutorial-card"><h2>Tutorial</h2><p>Description</p><button>Next</button></div>`;
let checks = 0;
async function test(name, plant, expected, step = { target: '.target' }) {
  await page.setContent('<!doctype html>' + fixture);
  if (plant) await page.evaluate(plant);
  const result = await measureTutorial(page, step);
  expected(result);
  checks++;
  console.log(`PASS ${name}`);
}
const clean = (result) => assert.deepEqual(result.faults, []);
const caught = (message) => (result) => assert.ok(result.faults.includes(message), JSON.stringify(result));
try {
  await test('visible target and aligned spotlight', null, clean);
  await test('two selectors for one target are aliases, not an alternate fallback', null, (r) => { clean(r); assert.equal(r.alternateFallback, false); }, { target: '.target', fallbackTarget: '.target' });
  await test('separately rendered fallback can be probed independently', () => { const other = document.querySelector('.target').cloneNode(true); other.className = 'other'; other.style.cssText = 'position:absolute;left:210px;top:20px;width:100px;height:40px'; document.body.append(other); }, (r) => { clean(r); assert.equal(r.alternateFallback, true); }, { target: '.target', fallbackTarget: '.other' });
  await test('fallback inside the primary cannot survive hiding that primary', () => { const child = document.createElement('span'); child.className = 'inner'; child.textContent = 'Nested'; document.querySelector('.target').append(child); }, (r) => { clean(r); assert.equal(r.alternateFallback, false); }, { target: '.target', fallbackTarget: '.inner' });
  await test('fallback wrapper whose size depends on the primary is not independent', () => { const wrapper = document.createElement('div'); wrapper.className = 'wrapper'; wrapper.style.cssText = 'position:absolute;left:20px;top:20px'; const primary = document.querySelector('.target'); primary.style.cssText = 'position:static;display:block'; document.body.append(wrapper); wrapper.append(primary); }, (r) => { clean(r); assert.equal(r.alternateFallback, false); }, { target: '.target', fallbackTarget: '.wrapper' });
  await test('fixed overlay over an absolute app with a zero-height body', () => { document.body.style.overflow = 'hidden'; }, clean);
  await test('fallback can be the visible anchor', null, (r) => { clean(r); assert.equal(r.fallback, true); }, { target: '.absent', fallbackTarget: '.target' });
  await test('absent target and fallback', () => document.querySelector('.target').remove(), caught('no visible target or fallback'));
  await test('offscreen target', () => document.querySelector('.target').style.top = '1000px', caught('no visible target or fallback'));
  await test('hidden ancestor', () => { const n = document.createElement('div'); n.style.opacity = '0'; document.body.append(n); n.append(document.querySelector('.target')); }, caught('no visible target or fallback'));
  await test('inert target', () => document.querySelector('.target').inert = true, caught('no visible target or fallback'));
  await test('target beyond an ancestor clip', () => { const n = document.createElement('div'); n.style.cssText = 'position:absolute;width:10px;height:10px;overflow:hidden'; document.body.append(n); n.append(document.querySelector('.target')); }, caught('no visible target or fallback'));
  await test('stale spotlight after target moves', () => document.querySelector('.target').style.left = '70px', caught('spotlight does not follow the visible target'));
  await test('missing spotlight', () => document.querySelector('.tutorial-highlight').remove(), caught('no visible spotlight'));
  await test('missing card', () => document.querySelector('.tutorial-card').remove(), caught('no visible tutorial card'));
  await test('card crosses viewport', () => document.querySelector('.tutorial-card').style.left = '150px', caught('tutorial card crosses viewport'));
  await test('obstructed next button', () => { const n = document.createElement('div'); n.style.cssText = 'position:fixed;inset:0;background:red;z-index:999'; document.body.append(n); }, caught('tutorial control centre is obstructed'));
  await test('clipped tutorial text', () => document.querySelector('.tutorial-card p').style.cssText = 'width:10px;white-space:nowrap;overflow:hidden', caught('tutorial text is clipped'));
  console.log(`${checks} tutorial geometry checks passed`);
} finally { await browser.close(); }
