import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { tutorialStepsForDevice } from '../client/src/features/tutorial/tutorial-registry';
import type { TutorialPageKey } from '../shared/tutorial';
import { auditAccessibility } from './accessibility-audit.mjs';
import { measureSettledTutorialContrast, TUTORIAL_CONTRAST_PROBE_SHA256 } from './tutorial-contrast.mjs';

const harnessSHA256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');

type Size = { name: string; width: number; height: number; touch: boolean; deviceClass: 'mobile' | 'tablet' | 'desktop' };
type Surface = { path: string; mode: 'retail' | 'property' | 'trades'; pageKey: TutorialPageKey };
type Watch = { pageErrors: string[]; consoleErrors: { text: string }[]; failed: string[]; pending: Set<any> };
type Harness = { base: string; out: string; sizes: Size[]; surfaces: Surface[]; openContext: (size: Size) => Promise<BrowserContext>; openPage: (context: BrowserContext, mode: Surface['mode']) => Promise<{ page: Page; watch: Watch }>; signIn: (context: BrowserContext) => Promise<void> };

export async function runTutorialAccessibilityMatrix(harness: Harness) {
  const { base, out, sizes, surfaces, openContext, openPage, signIn } = harness;
  if (!sizes.length || !surfaces.length) throw new Error('empty tutorial accessibility matrix');
  const cells: any[] = [];
  for (const size of sizes) {
    const context = await openContext(size);
    await signIn(context);
    for (const surface of surfaces) {
      const { page, watch } = await openPage(context, surface.mode);
      const cell = { size: size.name, ...surface, cases: [] as any[], faults: [] as string[] };
      try {
        await page.goto(`${base}${surface.path}`, { waitUntil: 'domcontentloaded' });
        for (const action of ['escape', 'complete'] as const) {
          const trial: any = { action, focusReturned: false, trap: false, visibleFocus: false, faults: [], contrast: [] };
          cell.cases.push(trial);
          const sampleContrast = async (step: number) => {
            const next = await measureSettledTutorialContrast(page, '.tutorial-next');
            await page.keyboard.press('Tab');
            const close = await measureSettledTutorialContrast(page, '.tutorial-close');
            await page.keyboard.press('Shift+Tab');
            assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('tutorial-next')), 'contrast sampling did not return keyboard focus');
            trial.contrast.push({ step, next, close });
          };
          await page.evaluate(async () => {
            const session = await (await fetch('/api/auth/session')).json();
            const r = await fetch('/api/tutorial/restart', { method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken } });
            if (!r.ok) throw new Error('isolation restart refused');
          });
          // Do not plant a fake control or replace the API response. Focus a
          // real existing control before sending the started request; the real
          // server reply is left untouched, using the browser's existing TLS/session.
          let originSet = false;
          await page.route('**/api/tutorial/pages/**', async route => {
            const body = route.request().postDataJSON();
            if (!originSet && body?.status === 'started' && body.lastStep === 0) {
              originSet = await page.evaluate(allowDocumentOrigin => {
                const controls = Array.from(document.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)'));
                const el = controls.find(el => {
                  const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
                  return !el.closest('.tutorial-overlay, [inert], [aria-hidden="true"]') && r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
                });
                if (!el) {
                  if (!allowDocumentOrigin || document.activeElement !== document.body) return false;
                  (window as any).__tutorialFocusOrigin = document.body;
                  return true;
                }
                el.focus({ preventScroll: true });
                (window as any).__tutorialFocusOrigin = el;
                return document.activeElement === el;
              }, surface.pageKey === 'retail-nfc' && size.deviceClass === 'mobile');
            }
            await route.continue();
          });
          await page.reload({ waitUntil: 'domcontentloaded' });
          assert.equal(new URL(page.url()).pathname, surface.path);
          const steps = tutorialStepsForDevice(surface.pageKey, size.deviceClass);
          const card = page.locator('.tutorial-card').last();
          await card.getByRole('heading', { name: steps[0].title, exact: true }).waitFor({ timeout: 10000 });
          assert.ok(originSet, 'real page focus origin was not established');
          trial.originKind = await page.evaluate(() => (window as any).__tutorialFocusOrigin === document.body ? 'document' : 'control');
          trial.environment = await page.evaluate(() => ({ devicePixelRatio, innerWidth, innerHeight, outerWidth, visualScale: visualViewport?.scale, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }));
          // Wait through the real entry animation before exercising key events.
          await page.waitForTimeout(350);
          await page.waitForFunction(() => document.activeElement?.classList.contains('tutorial-next'));
          trial.namedDialog = await card.getAttribute('aria-labelledby') === 'tutorial-title';
          assert.ok(trial.namedDialog);
          trial.visibleFocus = await page.evaluate(() => {
            const s = getComputedStyle(document.activeElement!);
            return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 && s.outlineColor !== 'rgba(0, 0, 0, 0)';
          });
          assert.ok(trial.visibleFocus, 'focused tutorial control has no visible outline');
          await page.keyboard.press('Tab');
          assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('tutorial-close')), 'Tab escaped the tutorial');
          await page.keyboard.press('Shift+Tab');
          assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('tutorial-next')), 'Shift-Tab escaped the tutorial');
          trial.trap = true;
          if (action === 'escape') {
            await sampleContrast(0);
            trial.audit = await auditAccessibility(page);
            await page.keyboard.press('Escape');
          } else {
            for (const [stepIndex, step] of steps.entries()) {
              await page.locator('.tutorial-card').last().getByRole('heading', { name: step.title, exact: true }).waitFor();
              await page.waitForTimeout(250);
              await page.waitForFunction(() => {
                const cards = document.querySelectorAll('.tutorial-card');
                return document.activeElement === cards[cards.length - 1]?.querySelector('.tutorial-next');
              }, undefined, { timeout: 10000 });
              await sampleContrast(stepIndex);
              await page.keyboard.press('Enter');
            }
          }
          await page.waitForFunction(() => !document.querySelector('.tutorial-card'));
          trial.focusReturned = await page.evaluate(() => {
            const el = (window as any).__tutorialFocusOrigin;
            return Boolean(el?.isConnected && document.activeElement === el);
          });
          if (!trial.focusReturned) trial.faults.push('tutorial did not return focus to its original connected page control');
          const status = await page.evaluate(async key => (await (await fetch('/api/tutorial/state')).json()).progress[key]?.status, surface.pageKey);
          if (trial.environment.reducedMotion) {
            trial.motion = await (await import('./motion-audit.mjs')).auditMotion(page);
            trial.faults.push(...trial.motion.faults);
          }
          assert.equal(status, action === 'escape' ? 'dismissed' : 'completed');
          await page.unroute('**/api/tutorial/pages/**');
        }
      } catch (error) { cell.faults.push(String(error).split('\n')[0].slice(0, 240)); }
      finally {
        // Ignore no console/request failures; permit closing requests to settle.
        const deadline = Date.now() + 10000;
        while (watch.pending.size && Date.now() < deadline) await page.waitForTimeout(100);
        cell.faults.push(...watch.pageErrors.map(e => `page error: ${e}`), ...watch.consoleErrors.map(e => `console error: ${e.text}`), ...watch.failed.map(e => `request: ${e}`));
        if (watch.pending.size) cell.faults.push('requests did not settle');
        await page.close();
      }
      cells.push(cell);
      writeFileSync(path.join(out, 'tutorial-accessibility-results.json'), JSON.stringify({ expected: sizes.length * surfaces.length, harnessSHA256, contrastProbeSHA256: TUTORIAL_CONTRAST_PROBE_SHA256, cells }, null, 2));
      const focus = cell.faults.length + cell.cases.reduce((n, x) => n + x.faults.length, 0);
      const rules = cell.cases.reduce((n, x) => n + (x.audit?.violations.length ?? 0), 0);
      const contrast = cell.cases.reduce((n, x) => n + x.contrast.reduce((m: number, step: any) => m + [...step.next.checks, ...step.close.checks].filter(c => !c.pass).length, 0), 0);
      console.log(`${focus || rules || contrast ? 'FAIL' : 'PASS'} tutorial accessibility ${size.name} ${surface.mode} ${surface.path}: ${focus} interaction/runtime faults; ${rules} accessibility rules; ${contrast} shared contrast faults`);
    }
    await context.close();
  }
  return cells.some(c => c.faults.length || c.cases.some((x: any) => x.faults.length || x.audit?.violations.length || x.contrast.some((s: any) => [...s.next.checks, ...s.close.checks].some(check => !check.pass)))) ? 1 : 0;
}
