import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {contrastRatio,reviewAccessibilityCandidates} from './accessibility-candidate-review.mjs';
import {auditAccessibility} from './accessibility-audit.mjs';
import {CHROMIUM_PATH} from './desktop-shots/retail-fixtures.mjs';
assert.equal(contrastRatio([0,0,0,1],[255,255,255]),21);
assert.equal(contrastRatio([255,255,255,1],[255,255,255]),1);
const browser=await chromium.launch({executablePath:CHROMIUM_PATH});
try {
 const page=await browser.newPage();
 for(const [fill,shouldPass] of [['#000',true],['#eee',false]]) {
  await page.setContent(`<html lang="en"><title>Fixture</title><main style="background:white"><svg width="200" height="60"><text style="fill:${fill};font-size:16px" x="10" y="30">PRIVATE-CONTENT</text></svg></main></html>`);
  const before=await page.locator('text').getAttribute('style');await auditAccessibility(page);
  const report=await reviewAccessibilityCandidates(page);
  assert.ok(report.contrastCandidates.length,'SVG incomplete must be observed');
  assert.equal(report.contrastCandidates.every(c=>c.status==='bounded-contrast-pass'),shouldPass);
  assert.equal(await page.locator('text').getAttribute('style'),before,'inline paint restored');
  assert.ok(!JSON.stringify(report).includes('PRIVATE-CONTENT'));
 }
 for (const [viewBox,shouldPass] of [['0 0 200 60',true],['0 0 400 120',false]]) {
  await page.setContent(`<html lang="en"><title>Scaled fixture</title><main style="background:white"><svg width="200" height="60" viewBox="${viewBox}"><text style="fill:#888;font-size:30px" x="10" y="40">Scaled text</text></svg></main></html>`);
  await auditAccessibility(page);
  const report=await reviewAccessibilityCandidates(page);
  assert.ok(report.contrastCandidates.length,'scaled SVG incomplete must be observed');
  assert.equal(report.contrastCandidates.every(c=>c.status==='bounded-contrast-pass'),shouldPass,'3:1 only applies to text rendered at a large size');
 }
 await page.setContent('<html lang="en"><title>Transition fixture</title><main><svg width="200" height="60" style="background:#58abff"><text style="fill:#040d6d;font-size:16px;transition:all 2s linear" x="10" y="30">PRIVATE-TRANSITION</text></svg></main></html>');
 await auditAccessibility(page);
 const transitionStyle=await page.locator('text').getAttribute('style');
 const transitionReview=await reviewAccessibilityCandidates(page);
 assert.ok(transitionReview.contrastCandidates.length,'transition fixture must retain its SVG incomplete');
 assert.ok(transitionReview.contrastCandidates.every(c=>c.status==='needs-review'),'paint transitions must remain manual candidates');
 assert.equal(await page.locator('text').getAttribute('style'),transitionStyle);
 assert.equal(await page.locator('text').evaluate(el=>getComputedStyle(el).fill),'rgb(4, 13, 109)','review must leave original paint immediately intact, including with authored transitions');
 assert.ok(!JSON.stringify(transitionReview).includes('PRIVATE-TRANSITION'));
 await page.setContent('<html lang="en"><title>Fixture</title><main><button aria-label="Delete">Save</button></main></html>');
 await auditAccessibility(page);const experimental=await reviewAccessibilityCandidates(page);
 assert.ok(experimental.experimental.violations.some(r=>r.id==='label-content-name-mismatch'));
 console.log('Candidate review: black/white positive, low-contrast and scaled-small-text negatives, mismatched-name negative, exact restoration and privacy checks pass.');
}finally{await browser.close();}
