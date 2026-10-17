/** Exercise the installed map SDK with inline synthetic geography, never a CDN. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { assertNode22 } from './verify-ci-safety.mjs';
assertNode22();
const args = process.argv.slice(2),
  sizes = {
    phone: { width: 390, height: 844 },
    tablet: { width: 834, height: 1194 },
    desktop: { width: 1440, height: 1000 },
    'desktop-short': { width: 1280, height: 720 },
  };
assert.ok(
  args.length === 0 || (args.length === 1 && /^--context=/.test(args[0])),
  'INVALID_MAP_ARGUMENT'
);
const context = args.length ? args[0].slice('--context='.length) : 'desktop';
assert.ok(sizes[context], 'INVALID_MAP_CONTEXT');
const dir = await mkdtemp(path.join(os.tmpdir(), 'taptpay-r8-map-'));
let server,
  browser,
  closing,
  aborted = false,
  passed = false,
  report;
const close = () =>
  (closing ??= (async () => {
    const force = setTimeout(() => {
      void server?.kill().catch(() => undefined);
    }, 1000);
    try {
      await browser?.close().catch(() => undefined);
      await server?.close();
    } catch (error) {
      await server?.kill().catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(force);
    }
  })());
const stop = () => {
  aborted = true;
  process.exitCode = 1;
  void close().catch(() => undefined);
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
const timer = setTimeout(stop, 30000);
try {
  const output = await build({
    entryPoints: ['scripts/fixtures/r8-map.jsx'],
    bundle: true,
    write: false,
    jsx: 'automatic',
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  await writeFile(path.join(dir, 'bundle.js'), output.outputFiles[0].contents);
  server = await chromium.launchServer({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  browser = await chromium.connect(server.wsEndpoint());
  const page = await browser.newPage({ viewport: sizes[context] });
  page.setDefaultTimeout(10000);
  const errors = [],
    requests = [];
  let mockedFontStylesheets = 0;
  page.on('pageerror', () => errors.push('page'));
  page.on('console', m => {
    if (['error', 'warning'].includes(m.type())) errors.push(m.type());
  });
  const fonts = new Set(
    (await readdir('dist/public/assets/fonts')).filter(name =>
      name.endsWith('.otf')
    )
  );
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === 'http://r8-map.test/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="root"></div>',
      });
    if (
      url.origin === 'http://r8-map.test' &&
      url.pathname.startsWith('/assets/fonts/') &&
      fonts.has(url.pathname.slice('/assets/fonts/'.length))
    )
      return route.fulfill({
        contentType: 'font/otf',
        body: await readFile(path.join('dist/public', url.pathname)),
      });
    if (
      url.href ===
      'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Outfit:wght@100..900&display=swap'
    ) {
      mockedFontStylesheets++;
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    requests.push('unexpected');
    return route.abort();
  });
  await page.goto('http://r8-map.test/');
  await page.addScriptTag({ path: path.join(dir, 'bundle.js') });
  // Use the actual production CSS for the application's hover/focus utilities.
  const cssFiles = (await readdir('dist/public/assets')).filter(name =>
    name.endsWith('.css')
  );
  assert.ok(cssFiles.length > 0, 'BUILT_APPLICATION_CSS_REQUIRED');
  for (const name of cssFiles)
    await page.addStyleTag({
      content: await readFile(path.join('dist/public/assets', name), 'utf8'),
    });
  const country = page.getByTestId('country');
  await country.waitFor({ state: 'visible' });
  assert.ok((await country.getAttribute('d'))?.length > 10, 'MAP_PATH_MISSING');
  assert.equal(
    await country.evaluate(e => getComputedStyle(e).fill),
    'rgb(0, 85, 255)'
  );
  await country.click();
  assert.equal(
    await page.getByTestId('selection').textContent(),
    'New Zealand'
  );
  const before = await page
    .locator('svg g[transform]')
    .evaluateAll(nodes =>
      JSON.stringify(nodes.map(n => n.getAttribute('transform')))
    );
  await page.getByRole('button', { name: 'Zoom to region' }).click();
  await page.waitForFunction(
    old =>
      JSON.stringify(
        [...document.querySelectorAll('svg g[transform]')].map(n =>
          n.getAttribute('transform')
        )
      ) !== old,
    before
  );
  const applicationMap = page.getByTestId('application-map');
  const applicationCountry = applicationMap.locator('.rsm-geography');
  await applicationCountry.waitFor({ state: 'visible' });
  assert.equal(
    await applicationCountry.evaluate(e => getComputedStyle(e).fill),
    'rgb(0, 157, 230)'
  );
  await applicationCountry.hover();
  assert.equal(
    await applicationCountry.evaluate(e => getComputedStyle(e).fill),
    'rgb(0, 229, 204)'
  );
  await applicationMap
    .getByText('New Zealand', { exact: true })
    .waitFor({ state: 'visible' });
  assert.equal(
    await applicationMap.getByText('1 users', { exact: true }).count(),
    1
  );
  await page.mouse.move(0, 0);
  await applicationMap
    .getByText('New Zealand', { exact: true })
    .waitFor({ state: 'hidden' });
  await applicationCountry.focus();
  assert.equal(
    await applicationCountry.evaluate(e => getComputedStyle(e).fill),
    'rgb(0, 229, 204)'
  );
  await applicationCountry.evaluate(e => e.blur());
  assert.equal(
    await applicationCountry.evaluate(e => getComputedStyle(e).fill),
    'rgb(0, 157, 230)'
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  assert.equal(aborted, false);
  report = {
    context,
    geographies: 2,
    selection: 'pass',
    zoom: 'pass',
    applicationColorsHoverFocusTooltip: 'pass',
    mockedFontStylesheets,
    externalRequests: 0,
    unexpectedErrors: 0,
  };
  passed = true;
} catch (error) {
  await writeFile(
    path.join(dir, 'failure.log'),
    String(error?.stack ?? error),
    { mode: 0o600 }
  );
  console.error('MAP_PACKAGE_VERIFICATION_FAILED');
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await close();
  if (passed) await rm(dir, { recursive: true, force: true });
}

if (passed && !aborted) console.log(JSON.stringify(report));
