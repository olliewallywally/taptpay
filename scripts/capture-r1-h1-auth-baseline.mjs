// R1-H1 — records the pre-change auth/onboarding visual baseline at every device
// class. Synthetic browser only; never sends API traffic to the app. Companion to
// verify-r0-device-containment.mjs, which covers the merchant-frame routes.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';

const base = process.env.R1_BROWSER_BASE_URL ?? 'http://127.0.0.1:5000';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) {
  throw new Error('local server only');
}
const output = 'docs/evidence/remediation-v2-2/r1/baseline-2026-09-12';
const merchantId = 999999;
const devices = [
  ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ['tablet', { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true }],
  ['desktop', { viewport: { width: 1440, height: 900 }, hasTouch: false }],
  ['desktop-short', { viewport: { width: 1440, height: 650 }, hasTouch: false }],
];
// Auth and onboarding render outside the merchant frame (plan R1-T10), so this
// records what each route actually renders rather than asserting a frame exists.
// /reset-password carries a fixture token so the real form renders; without one the
// route correctly shows "Invalid Reset Link", which is a different screen.
const routes = ['/login', '/signup', '/forgot-password', '/reset-password?token=baseline-fixture-token', '/onboarding'];
const results = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
try {
  for (const [device, options] of devices) {
    for (const path of routes) {
      const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      const mutations = [];
      page.on('pageerror', error => errors.push(error.message));
      // /onboarding is the one authenticated screen here: it follows signup.
      const authenticated = path === '/onboarding';
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== new URL(base).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!['GET', 'HEAD'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
        if (url.pathname === '/api/auth/me' && !authenticated) {
          return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) });
        }
        let body = [];
        if (url.pathname === '/api/auth/me') body = { user: { id: 1, merchantId, role: 'owner', email: 'baseline@example.invalid', onboardingCompleted: false } };
        else if (url.pathname === '/api/tutorial/state') body = { generation: 1, autoEnabled: false, pageCount: 20, progress: {} };
        else if (url.pathname === `/api/merchants/${merchantId}` || url.pathname.endsWith('/profile')) body = { id: merchantId, businessName: 'Baseline Fixture', status: 'active', dailyGoal: '500.00' };
        else if (url.pathname === '/api/billing/card') body = { ready: false, card: null };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      if (authenticated) {
        await page.addInitScript(({ merchantId }) => {
          const payload = btoa(JSON.stringify({ userId: 1, merchantId, role: 'owner', email: 'baseline@example.invalid' }));
          localStorage.setItem('authToken', `fixture.${payload}.invalid`);
          localStorage.setItem('merchantId', String(merchantId));
        }, { merchantId });
      }
      try {
        await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
        // These routes lazy-load their chunk: networkidle alone lands on an empty
        // body, which would silently record a blank baseline. Wait for real content.
        await page.waitForFunction(
          () => document.querySelectorAll('button,a,input').length > 0 && document.body.innerText.trim().length > 0,
          { timeout: 20000 },
        );
        await page.waitForTimeout(500);
        const facts = await page.evaluate(() => {
          const viewport = document.querySelector('[data-testid="desktop-frame"]');
          const frame = viewport?.querySelector(':scope > .tapt-desktop-frame');
          return {
            title: document.title,
            deviceClass: viewport?.getAttribute('data-device-class') ?? null,
            insideMerchantFrame: Boolean(frame),
            frame: frame ? { ...frame.getBoundingClientRect().toJSON(), radius: getComputedStyle(frame).borderRadius } : null,
            controlCount: document.querySelectorAll('button,a,input').length,
            bodyScrollWidth: document.body.scrollWidth,
            headings: [...document.querySelectorAll('h1,h2')].map(h => h.textContent?.trim()).filter(Boolean).slice(0, 4),
          };
        });
        const file = `${device}${path.replace(/[/?=&]/g, '_')}.png`;
        await page.screenshot({ path: `${output}/${file}` });
        results.push({ device, path, status: 'captured', screenshot: file, pageErrors: errors, unexpectedWrites: mutations, ...facts });
        console.log(`captured: ${device} ${path}`);
      } catch (error) {
        results.push({ device, path, status: 'failed', error: error.message });
        console.log(`FAILED: ${device} ${path} — ${error.message}`);
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/auth-baseline-results.json`, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results.filter(r => r.status === 'failed' || r.pageErrors?.length || r.unexpectedWrites?.length), null, 2));
