// Called by the existing device matrix's --tutorials mode. Same real routes,
// sessions, isolated in-memory data, browser/error observers and four contexts.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { tutorialStepsForDevice } from "../client/src/features/tutorial/tutorial-registry";
import { TUTORIAL_PAGE_KEYS, type TutorialPageKey } from "../shared/tutorial";
import { measureTutorial, TUTORIAL_GEOMETRY_SOURCE_SHA256 } from "./tutorial-geometry.mjs";

type Size = { name: string; width: number; height: number; touch: boolean; deviceClass: "mobile" | "tablet" | "desktop" };
type Surface = { path: string; mode: "retail" | "property" | "trades"; pageKey: TutorialPageKey };
type Watch = { pageErrors: string[]; consoleErrors: Array<{ text: string }>; failed: string[]; pending: Set<{ method(): string; url(): string }> };
type Harness = { base: string; out: string; sizes: Size[]; surfaces: Surface[]; openContext: (size: Size) => Promise<BrowserContext>; openPage: (context: BrowserContext, mode: Surface["mode"]) => Promise<{ page: Page; watch: Watch }>; signIn: (context: BrowserContext) => Promise<void> };

async function tutorialState(page: Page) {
  return page.evaluate(async () => {
    const reply = await fetch('/api/tutorial/state', { cache: 'no-store' });
    if (!reply.ok) throw new Error('tutorial state refused');
    return reply.json();
  });
}

async function waitFor(page: Page, check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(message);
}

async function settle(page: Page, step: { target: string; fallbackTarget?: string }) {
  // Framer's spring can run outside the Web Animations API. Require stable
  // measured boxes too; do not interpret an intermediate animation as drift.
  let last = ''; let unchanged = 0;
  await waitFor(page, async () => {
    const running = await page.evaluate(() => document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)));
    const geometry = await measureTutorial(page, step);
    const boxes = JSON.stringify([geometry.target, geometry.card, geometry.spotlight]);
    unchanged = boxes === last ? unchanged + 1 : 0; last = boxes;
    if (running || !geometry.card) unchanged = 0;
    return unchanged >= 5;
  }, 'tutorial animation did not settle');
}

async function dismiss(page: Page) {
  const close = page.locator('.tutorial-close');
  if (await close.count()) await close.last().click();
  await page.locator('.tutorial-card').waitFor({ state: 'hidden', timeout: 10000 });
}

async function noTutorialAfterNavigation(page: Page, watch: Watch) {
  let quiet = 0;
  await waitFor(page, async () => {
    const settled = await page.evaluate(() => !document.querySelector('.tutorial-card') && document.getAnimations().every(a => a.playState !== 'running' || !Number.isFinite(a.effect?.getComputedTiming().endTime)));
    quiet = settled && watch.pending.size === 0 ? quiet + 1 : 0;
    return quiet >= 6;
  }, 'tutorial reappeared or navigation did not settle');
}

async function restartThroughSettings(page: Page, base: string, keepTutorial: boolean) {
  await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
  // A previously unvisited Settings page may start its own tutorial.
  await page.locator('[data-tutorial-id="settings-tutorial-help"]').waitFor({ state: 'visible', timeout: 10000 });
  const arrival = await tutorialState(page);
  if (arrival.autoEnabled && !arrival.progress.settings) await page.locator('.tutorial-card').waitFor({ state: 'visible', timeout: 10000 });
  await dismiss(page);
  const before = await tutorialState(page);
  const help = page.locator('[data-tutorial-id="settings-tutorial-help"]');
  if (await page.locator('[data-testid="button-restart-tutorials"]').count() === 0) {
    const button = help.locator('button').first();
    if (await button.count()) await button.click(); else await help.click();
  }
  page.once('dialog', (dialog) => dialog.accept());
  const restarted = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/tutorial/restart' && r.request().method() === 'POST');
  await page.getByTestId('button-restart-tutorials').click();
  assert.equal((await restarted).status(), 200, 'UI restart must succeed');
  const after = await tutorialState(page);
  assert.equal(after.generation, before.generation + 1, 'restart must advance the server generation');
  assert.equal(after.autoEnabled, true);
  assert.deepEqual(Object.keys(after.progress).filter((key) => key !== 'settings'), [], 'restart must clear other pages');
  await page.locator('.tutorial-card').waitFor({ state: 'visible', timeout: 10000 });
  if (!keepTutorial) await dismiss(page);
  return after.generation;
}

async function restartForIsolation(page: Page) {
  await page.evaluate(async () => {
    const session = await (await fetch('/api/auth/session', { cache: 'no-store' })).json();
    const reply = await fetch('/api/tutorial/restart', { method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken } });
    if (!reply.ok) throw new Error('isolation restart refused');
  });
}

export async function runTutorialMatrix(harness: Harness) {
  const { base, out, sizes, surfaces, openContext, openPage, signIn } = harness;
  if (!sizes.length || !surfaces.length) throw new Error('empty tutorial matrix');
  const results: any[] = [];
  for (const size of sizes) {
    const context = await openContext(size);
    await signIn(context);
    for (const surface of surfaces) {
      const { page, watch } = await openPage(context, surface.mode);
      const result = { size: size.name, ...surface, rounds: [] as any[], faults: [] as string[], routeExit: false, browserBack: false };
      try {
        // A real CSRF-authenticated restart isolates the first visit. The second
        // restart below must be triggered with the actual Settings UI.
        await page.goto(`${base}${surface.path}`, { waitUntil: 'domcontentloaded' });
        const arrival = await tutorialState(page);
        if (arrival.autoEnabled && !arrival.progress[surface.pageKey]) {
          await page.locator('.tutorial-card').waitFor({ state: 'visible', timeout: 10000 });
          await dismiss(page);
          await waitFor(page, async () => (await tutorialState(page)).progress[surface.pageKey]?.status === 'dismissed', 'arrival dismissal was not persisted');
        }
        await restartForIsolation(page);
        for (let round = 0; round < 2; round++) {
          if (round === 1) await restartThroughSettings(page, base, surface.pageKey === 'settings');
          if (round === 0 || surface.pageKey !== 'settings') await page.goto(`${base}${surface.path}`, { waitUntil: 'domcontentloaded' });
          assert.equal(new URL(page.url()).pathname, surface.path);
          const steps = tutorialStepsForDevice(surface.pageKey, size.deviceClass);
          const measurements: any[] = [];
          const recorded = { generation: 0, completed: false, persisted: false, measurements };
          result.rounds.push(recorded);
          for (const [index, step] of steps.entries()) {
            assert.doesNotMatch(`${step.title} ${step.body}`, /tap your phone|enable (?:NFC|tap to pay)|accept contactless/i, 'disabled payment instructions');
            if (surface.pageKey === 'retail-nfc' && index === 0) {
              // This retained route explains that contactless is unavailable;
              // mentioning its absence must not be mistaken for enablement.
              assert.match(step.title, /not available/i);
              assert.match(step.body, /cannot take contactless/i);
            }
            await page.locator('.tutorial-card').last().getByRole('heading', { name: step.title, exact: true }).waitFor({ timeout: 10000 });
            await settle(page, step);
            const metrics = await measureTutorial(page, step);
            if (metrics.faults.length) {
              await page.screenshot({ path: path.join(out, `${size.name}-${surface.mode}-${surface.pageKey}-round${round}-step${index}.png`) });
              (metrics as any).diagnostics = await page.locator(`${step.target}, ${step.fallbackTarget ?? step.target}, .tutorial-card, .tutorial-highlight`).evaluateAll(nodes => nodes.map(el => {
                const r = el.getBoundingClientRect();
                const ancestors = [];
                for (let n: Element | null = el; n; n = n.parentElement) { const s = getComputedStyle(n); ancestors.push({tag:n.tagName, cls:n.className, opacity:s.opacity, visibility:s.visibility, overflow:s.overflow, transform:s.transform, scrollTop:n.scrollTop, scrollLeft:n.scrollLeft}); }
                return {cls:el.className, box:{x:r.x,y:r.y,width:r.width,height:r.height}, ancestors};
              }));
            }
            measurements.push({ step: index, ...metrics });
            for (const fault of metrics.faults) result.faults.push(`round ${round + 1} step ${index + 1}: ${fault}`);
            if (round === 0 && metrics.primary && step.fallbackTarget) {
              if (metrics.alternateFallback) {
                const style = await page.evaluateHandle(selector => {
                  const style = document.createElement('style');
                  style.textContent = `${selector} { display: none !important; }`;
                  document.head.append(style);
                  return style;
                }, step.target);
                try {
                  await settle(page, step);
                  const fallback = await measureTutorial(page, step);
                  measurements.push({ step: index, probe: 'primary-hidden', ...fallback });
                  assert.equal(fallback.fallback, true, 'hidden primary must use the available fallback');
                  for (const fault of fallback.faults) result.faults.push(`fallback step ${index + 1}: ${fault}`);
                } finally {
                  await style.evaluate(node => node.remove());
                  await style.dispose();
                }
                await settle(page, step);
                const restored = await measureTutorial(page, step);
                measurements.push({ step: index, probe: 'primary-restored', ...restored });
                assert.equal(restored.primary, true, 'restored primary must be reacquired');
                for (const fault of restored.faults) result.faults.push(`fallback recovery step ${index + 1}: ${fault}`);
              }
            }
            if (round === 0 && index === 0) {
              const resized = size.deviceClass === 'mobile'
                ? { width: 1194, height: 834, deviceClass: 'tablet' as const }
                : { width: 390, height: 844, deviceClass: 'mobile' as const };
              await page.setViewportSize(resized);
              await page.waitForFunction((device) => {
                const frame = document.querySelector('[data-testid="desktop-frame"]');
                return device === 'mobile' ? !frame : frame?.getAttribute('data-device-class') === device;
              }, resized.deviceClass);
              const resizedStep = tutorialStepsForDevice(surface.pageKey, resized.deviceClass)[0];
              await page.locator('.tutorial-card').last().getByRole('heading', { name: resizedStep.title, exact: true }).waitFor();
              await settle(page, resizedStep);
              const changed = await measureTutorial(page, resizedStep);
              for (const fault of changed.faults) result.faults.push(`resize: ${fault}`);
              measurements.push({ step: index, resizeTo: resized.deviceClass, ...changed });
              await page.setViewportSize({ width: size.width, height: size.height });
              await page.waitForFunction((device) => {
                const frame = document.querySelector('[data-testid="desktop-frame"]');
                return device === 'mobile' ? !frame : frame?.getAttribute('data-device-class') === device;
              }, size.deviceClass);
              await page.locator('.tutorial-card').last().getByRole('heading', { name: step.title, exact: true }).waitFor();
              await settle(page, step);
              const restored = await measureTutorial(page, step);
              measurements.push({ step: index, resizeTo: 'restored', ...restored });
              for (const fault of restored.faults) result.faults.push(`resize restored: ${fault}`);
            }
            await page.locator('.tutorial-card').last().getByRole('button', { name: index === steps.length - 1 ? 'Finish tutorial' : 'Next tutorial step', exact: true }).click();
          }
          await page.locator('.tutorial-card').waitFor({ state: 'hidden' });
          await waitFor(page, async () => (await tutorialState(page)).progress[surface.pageKey]?.status === 'completed', 'completion was not persisted');
          const completed = await tutorialState(page);
          assert.equal(completed.progress[surface.pageKey].lastStep, steps.length - 1);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await noTutorialAfterNavigation(page, watch);
          assert.equal(await page.locator('.tutorial-card').count(), 0, 'completed tutorial reappeared after reload');
          assert.equal((await tutorialState(page)).progress[surface.pageKey].status, 'completed');
          Object.assign(recorded, { generation: completed.generation, completed: true, persisted: true });
        }
        // A fresh run checks an actual SPA route departure and browser Back,
        // rather than treating a document reload as evidence of route cleanup.
        await restartForIsolation(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        const first = tutorialStepsForDevice(surface.pageKey, size.deviceClass)[0];
        await page.locator('.tutorial-card').last().getByRole('heading', { name: first.title, exact: true }).waitFor({ timeout: 10000 });
        await settle(page, first);
        const destination = surface.path === '/settings' ? (surface.mode === 'retail' ? '/dashboard' : `/${surface.mode}`) : '/settings';
        await page.evaluate(destination => history.pushState(null, '', destination), destination);
        await page.waitForURL(`${base}${destination}`);
        await page.locator('.tutorial-card').getByRole('heading', { name: first.title, exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
        await waitFor(page, async () => (await tutorialState(page)).progress[surface.pageKey]?.status === 'dismissed', 'route dismissal was not persisted');
        result.routeExit = true;
        await page.goBack();
        await page.waitForURL(`${base}${surface.path}`);
        await waitFor(page, async () => Boolean((await measureTutorial(page, first)).target), 'the original screen did not return after browser Back');
        await noTutorialAfterNavigation(page, watch);
        assert.equal(await page.locator('.tutorial-card').count(), 0, 'dismissed tutorial reappeared on browser Back');
        result.browserBack = true;
        await waitFor(page, async () => watch.pending.size === 0, 'required requests did not settle');
      } catch (error) {
        result.faults.push(String(error).split('\n')[0].slice(0, 240));
      } finally {
        // Early assertion failures may leave legitimate chunk/data requests in
        // flight. Give them the same bounded chance to settle before labelling
        // them hung; unresolved requests still become faults below.
        await waitFor(page, async () => watch.pending.size === 0, 'required requests did not settle').catch(() => {});
        result.faults.push(...watch.pageErrors.map((e) => `page error: ${e}`), ...watch.consoleErrors.map((e) => `console error: ${e.text}`), ...watch.failed.map((e) => `request: ${e}`));
        result.faults.push(...Array.from(watch.pending, r => `request did not settle: ${r.method()} ${new URL(r.url()).pathname}`));
        if (result.faults.length) await page.screenshot({ path: path.join(out, `${size.name}-${surface.mode}-${surface.pageKey}.png`) }).catch(() => {});
        await page.close();
      }
      results.push(result);
      writeFileSync(path.join(out, 'tutorial-results.json'), JSON.stringify({ expected: sizes.length * surfaces.length, geometrySourceSHA256: TUTORIAL_GEOMETRY_SOURCE_SHA256, cells: results }, null, 2));
      console.log(`${result.faults.length ? 'FAIL' : 'PASS'} tutorial ${size.name} ${surface.mode} ${surface.path}: ${result.faults.join('; ') || 'complete, restart, complete, reload'}`);
    }
    await context.close();
  }
  const failed = results.filter((r) => r.faults.length);
  console.log(`Tutorial matrix: ${results.length - failed.length}/${results.length} cells pass; ${new Set(surfaces.map((s) => s.pageKey)).size}/${TUTORIAL_PAGE_KEYS.length} pages selected`);
  return failed.length ? 1 : 0;
}
