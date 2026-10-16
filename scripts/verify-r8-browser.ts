import assert from 'node:assert/strict';
import {readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {BrowserContext, Page, Request} from 'playwright';
import {assertBrowserClean} from './verify-browser-clean.mjs';
type Size = {name: string; deviceClass: string};
type Watch = {pageErrors: string[]; consoleErrors: {text: string; from: string}[]; failed: string[]; pending: Set<Request>};
type Dependencies = {
  base: string; out: string; sizes: Size[]; builtClient: string; mode: 'chunks' | 'terminal';
  openContext: (size: any) => Promise<BrowserContext>;
  openPage: (context: BrowserContext, mode: any) => Promise<{page: Page; watch: Watch}>;
  signIn: (context: BrowserContext) => Promise<void>;
};
export async function runR8BrowserChecks(d: Dependencies) {
  const cells: {size: string; scenario: string; status: string}[] = [];
  for (const size of d.sizes) {
    for (const scenario of d.mode === 'chunks' ? ['abort', 'hang'] : ['exact-cents-single-flight']) {
      const context = await d.openContext(size);
      try {
        await d.signIn(context);
        const {page, watch} = await d.openPage(context, 'retail');
        if (d.mode === 'chunks') {
          const prefix = size.deviceClass === 'mobile' ? 'dashboard-' : 'retail-home-';
          const candidates = (await readdir(path.join(d.builtClient, 'assets'))).filter(n => n.startsWith(prefix) && n.endsWith('.js'));
          assert.equal(candidates.length, 1, 'EXACT_LAZY_CHUNK_REQUIRED');
          const asset = '/assets/' + candidates[0];
          const matchesAsset = (url: URL) => url.origin === d.base && url.pathname === asset;
          let intercepted = 0;
          await page.route(matchesAsset, async route => {
            intercepted++;
            if (scenario === 'abort') await route.abort('failed');
            // For a hang leave only this owned request unresolved until page.close.
          });
          await page.goto(d.base + '/dashboard', {waitUntil: 'domcontentloaded'});
          const recovery = page.locator('[data-chunk-recovery]').first();
          await recovery.waitFor({state: 'visible', timeout: scenario === 'abort' ? 20_000 : 25_000});
          assert.ok(intercepted > 0, 'FAULT_NOT_INJECTED');
          assert.ok((await recovery.innerText()).trim().length > 20, 'EMPTY_RECOVERY');
          assert.ok(await recovery.getByTestId('chunk-reload').isEnabled(), 'RECOVERY_NOT_ACTIONABLE');
          // Only errors tied to the exact injected asset are expected. Everything
          // else keeps the normal observer's strict failure behavior.
          assert.deepEqual(watch.pageErrors.filter(e => !e.includes(asset)), []);
          const expectedTimeout = (text: string) => scenario === 'hang' && intercepted > 0
            && /^(?:Route failed |Desktop page failed |Desktop chrome failed )?ChunkLoadTimeoutError: Chunk did not load within 8000ms\n/.test(text);
          assert.deepEqual(watch.consoleErrors.filter(e => !(e.text.includes(asset)
            || (e.from.includes(asset) && /Failed to load resource/.test(e.text)) || expectedTimeout(e.text))), []);
          assert.deepEqual(watch.failed.filter(e => !e.endsWith('GET ' + asset)), []);
          await page.unroute(matchesAsset);
          watch.pageErrors.length = 0; watch.consoleErrors.length = 0; watch.failed.length = 0;
          // Restore transport and prove the real recovery control navigates to a
          // usable page, rather than just asserting a button exists.
          await recovery.getByTestId('chunk-reload').click();
          await page.locator(size.deviceClass === 'mobile' ? '[aria-label="new sale"]' : '[data-tutorial-id="retail-home-new-sale"]').first()
            .waitFor({state: 'visible', timeout: 25_000});
          assert.equal(new URL(page.url()).pathname, '/dashboard');
          await page.waitForTimeout(500);
          await assertBrowserClean(watch);
        } else {
          await page.goto(d.base + '/terminal', {waitUntil: 'domcontentloaded'});
          const mobile = size.deviceClass === 'mobile';
          if (mobile) {
            await page.locator('[data-demo-id="retail-add-sale"]').click();
            for (const digit of '1001') await page.locator(`[data-demo-id="retail-key-${digit}"]`).click();
            await page.locator('[data-demo-id="retail-keypad-confirm"]').click();
            await page.getByPlaceholder('item name', {exact: true}).fill('R8 synthetic exact cents');
            await page.locator('[data-demo-id="retail-details-confirm"]').click();
          } else {
            await page.getByRole('button', {name: 'keypad', exact: true}).click();
            for (const digit of ['1','0','decimal point','0','1']) await page.locator(`.rt-kp-key[aria-label="${digit}"]`).click();
            await page.getByRole('button', {name: 'confirm amount', exact: true}).click();
            await page.getByRole('textbox', {name: 'item name', exact: true}).fill('R8 synthetic exact cents');
          }
          const creates: Request[] = [];
          page.on('request', request => {
            if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/transactions') creates.push(request);
          });
          const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/transactions');
          const send = page.locator(mobile ? '[data-demo-id="retail-create-sale"]' : '[data-tutorial-id="retail-terminal-send"]');
          await send.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
          const created = await response;
          assert.ok(created.ok(), 'SALE_CREATE_REFUSED');
          await page.waitForTimeout(500);
          assert.equal(creates.length, 1, 'DUPLICATE_SALE_SUBMISSION');
          assert.equal(creates[0].postDataJSON().price, '10.01', 'INCORRECT_AMOUNT');
          assert.equal(String((await created.json()).price), '10.01', 'INCORRECT_STORED_AMOUNT');
          await assertBrowserClean(watch);
        }
        cells.push({size: size.name, scenario, status: 'pass'});
        console.log(`PASS ${d.mode} ${size.name} ${scenario}`);
      } finally { await context.close(); }
    }
  }
  assert.equal(cells.length, d.sizes.length * (d.mode === 'chunks' ? 2 : 1));
  await writeFile(path.join(d.out, 'r8-results.json'), JSON.stringify({mode: d.mode, cells}, null, 2) + '\n');
}
