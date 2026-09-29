// R1-T8 browser check. Synthetic and loopback-only, like verify-r0-device-containment.mjs:
// every /api request is answered here from fixtures, so nothing reaches an application
// server, a database or a provider. Serve a build first (`vite preview`).
//
//   R1T8_BASE_URL=http://127.0.0.1:5199 node scripts/verify-r1-t8-browser.mjs
//   R1T8_BEFORE_URL=http://127.0.0.1:5198 R1T8_BASE_URL=http://127.0.0.1:5199 \
//     node scripts/verify-r1-t8-browser.mjs
//
// 1. Each phone route whose page R1-T8 changed renders with no page error and no React
//    hook error. Given the build from before the fix (R1T8_BEFORE_URL), each must also
//    match it pixel for pixel: the fix moves code, it must not move a pixel.
// 2. The crash the review reproduced, in a real browser: "Sign out" on /settings. It
//    removes the token and navigates to /login, and the page transition re-renders the
//    outgoing page. Before R1-T8 React threw "Rendered fewer hooks than expected"
//    (minified: error #300); now it must land on /login cleanly. Given the earlier
//    build, this check first proves it still reproduces the crash there.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';

const after = process.env.R1T8_BASE_URL ?? 'http://127.0.0.1:5199';
const before = process.env.R1T8_BEFORE_URL;
for (const url of [after, before].filter(Boolean)) {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'local servers only');
}
const output = '/tmp/taptpay-r1-t8-browser';
const merchantId = 999999;
const merchant = { id: merchantId, businessName: 'Hook Order Fixture', status: 'active', dailyGoal: '500.00' };
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
// The phone routes served by the seven R1-T8 pages. exports, merchant-terminal and
// merchant-terminal-mobile are routed nowhere, so no browser can reach them.
const routes = ['/settings', '/stack', '/transactions', '/stock'];
const HOOK_ERROR = /Rendered (?:fewer|more) hooks|Minified React error #(?:300|310)\b/;

function fixture(pathname) {
  if (pathname === '/api/auth/me') {
    return { user: { id: 1, merchantId, role: 'owner', email: 'r1-t8@example.invalid', onboardingCompleted: true } };
  }
  if (pathname === '/api/tutorial/state') return { generation: 1, autoEnabled: false, pageCount: 20, progress: {} };
  if (pathname === `/api/merchants/${merchantId}` || pathname.endsWith('/profile')) return merchant;
  if (pathname === '/api/subscription') {
    return { subscription: { planId: 'solo', planName: 'Solo', status: 'active', priceCents: 799, seatLimit: 1, seatsInUse: 1 } };
  }
  if (pathname === '/api/billing/card') return { ready: false, card: null };
  if (pathname === '/api/push/capabilities') return { webPush: { available: false }, nativePush: { available: false } };
  if (pathname === '/api/push/preferences') return { preferences: {} };
  if (pathname.startsWith('/api/team')) return { members: [], seatLimit: 1, seatsInUse: 1 };
  if (pathname === '/api/nfc/capabilities') return { nfcSupported: false, available: false };
  if (pathname.endsWith('/active-transaction')) return null;
  return [];
}

async function open(browser, base, path) {
  const context = await browser.newContext({ ...phone, serviceWorkers: 'block' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && HOOK_ERROR.test(message.text())) problems.push(`console: ${message.text()}`);
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(url.pathname)) });
  });
  await page.addInitScript((id) => {
    const payload = btoa(JSON.stringify({ userId: 1, merchantId: id, role: 'owner', email: 'r1-t8@example.invalid' }));
    localStorage.setItem('authToken', `fixture.${payload}.invalid`);
    localStorage.setItem('merchantId', String(id));
    localStorage.setItem('taptMode', 'retail');
  }, merchantId);
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  return { context, page, problems };
}

function pixelDifference(a, b) {
  const left = PNG.sync.read(a);
  const right = PNG.sync.read(b);
  if (left.width !== right.width || left.height !== right.height) return Number.POSITIVE_INFINITY;
  let differing = 0;
  for (let i = 0; i < left.data.length; i += 4) {
    if (left.data.readUInt32BE(i) !== right.data.readUInt32BE(i)) differing += 1;
  }
  return differing;
}

async function signOutFromSettings(browser, base) {
  const { context, page, problems } = await open(browser, base, '/settings');
  await page.getByTestId('button-logout').click();
  await page.waitForTimeout(2000);
  const landed = new URL(page.url()).pathname;
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  await context.close();
  return { landed, token, problems };
}

await mkdir(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
try {
  for (const path of routes) {
    const current = await open(browser, after, path);
    const shot = await current.page.screenshot({ fullPage: true });
    await writeFile(`${output}/after${path.replaceAll('/', '_')}.png`, shot);
    await current.context.close();
    assert.deepEqual(current.problems, [], `${path}: page or hook errors`);
    const result = { check: 'renders', path, problems: 0 };
    if (before) {
      const earlier = await open(browser, before, path);
      const earlierShot = await earlier.page.screenshot({ fullPage: true });
      await writeFile(`${output}/before${path.replaceAll('/', '_')}.png`, earlierShot);
      await earlier.context.close();
      result.differingPixels = pixelDifference(earlierShot, shot);
      assert.equal(result.differingPixels, 0, `${path}: differs from the build before the fix`);
    }
    results.push(result);
    console.log(`passed: ${path}${before ? ' (pixel-identical to the earlier build)' : ''}`);
  }

  if (before) {
    const earlier = await signOutFromSettings(browser, before);
    assert.ok(earlier.problems.some((problem) => HOOK_ERROR.test(problem)),
      'the earlier build no longer reproduces the crash, so this check proves nothing');
    results.push({ check: 'sign-out on the earlier build', reproduced: true, landed: earlier.landed });
    console.log(`reproduced on the earlier build: ${earlier.problems[0].slice(0, 120)}`);
  }
  const signOut = await signOutFromSettings(browser, after);
  assert.deepEqual(signOut.problems, [], 'sign-out from /settings: page or hook errors');
  assert.equal(signOut.landed, '/login', 'sign-out lands on /login');
  assert.equal(signOut.token, null, 'sign-out removed the token');
  results.push({ check: 'sign-out', landed: signOut.landed, problems: 0 });
  console.log('passed: sign-out from /settings lands on /login with no error');
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
}
