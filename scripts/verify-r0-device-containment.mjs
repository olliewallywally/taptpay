// Synthetic browser-only containment gate. Never sends API traffic to the app.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';

const base = process.env.R0_BROWSER_BASE_URL ?? 'http://127.0.0.1:5000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'local server only');
const output = '/tmp/taptpay-r0-device-containment';
const merchantId = 999999;
const merchant = { id: merchantId, businessName: 'Containment Fixture', status: 'active', dailyGoal: '500.00' };
const devices = [
  ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ['tablet', { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true }],
  ['desktop', { viewport: { width: 1440, height: 900 }, hasTouch: false }],
];
const routes = ['/terminal', '/property/terminal', '/trades/terminal', '/settings', '/nfc'];
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
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== new URL(base).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!['GET', 'HEAD'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
        let body = [];
        if (url.pathname === '/api/auth/me') body = { user: { id: 1, merchantId, role: 'owner', email: 'containment@example.invalid', onboardingCompleted: true } };
        else if (url.pathname === '/api/tutorial/state') body = { generation: 1, autoEnabled: false, pageCount: 20, progress: {} };
        else if (url.pathname === `/api/merchants/${merchantId}` || url.pathname.endsWith('/profile')) body = merchant;
        else if (url.pathname === '/api/subscription') body = { subscription: { planId: 'solo', planName: 'Solo', status: 'active', priceCents: 799, seatLimit: 1, seatsInUse: 1 } };
        else if (url.pathname === '/api/billing/card') body = { ready: false, card: null };
        else if (url.pathname === '/api/push/capabilities') body = { webPush: { available: false }, nativePush: { available: false } };
        else if (url.pathname === '/api/push/preferences') body = { preferences: {} };
        else if (url.pathname.startsWith('/api/team')) body = { members: [], seatLimit: 1, seatsInUse: 1 };
        else if (url.pathname === '/api/nfc/capabilities') body = { nfcSupported: false, available: false };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.addInitScript(({ merchantId, mode }) => {
        const payload = btoa(JSON.stringify({ userId: 1, merchantId, role: 'owner', email: 'containment@example.invalid' }));
        localStorage.setItem('authToken', `fixture.${payload}.invalid`);
        localStorage.setItem('merchantId', String(merchantId));
        localStorage.setItem('taptMode', mode);
      }, { merchantId, mode: path.startsWith('/property') ? 'property' : path.startsWith('/trades') ? 'trades' : 'retail' });
      try {
        await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(1000);
        const facts = await page.evaluate(() => {
          const visible = element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
          const frame = document.querySelector('[data-testid="desktop-frame"]');
          const canvas = document.querySelector('[data-testid="desktop-scaled-canvas"]');
          return {
            text: document.body.innerText,
            controls: [...document.querySelectorAll('button,a,input')].filter(visible).map(element => ({ label: `${element.textContent ?? ''} ${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('placeholder') ?? ''} ${element.getAttribute('name') ?? ''}`, disabled: element.disabled === true })),
            frame: frame ? { ...frame.getBoundingClientRect().toJSON(), radius: getComputedStyle(frame).borderRadius } : null,
            canvas: canvas ? { width: canvas.style.width, height: canvas.style.height, scale: canvas.getAttribute('data-desktop-scale') } : null,
          };
        });
        await page.screenshot({ path: `${output}/${device}-${path.replaceAll('/', '_')}.png` });
        assert.deepEqual(errors, [], 'page errors');
        assert.ok(facts.text.trim().length > 30 && !/Something went wrong|taking longer than expected/.test(facts.text), 'real page must render');
        const forbidden = facts.controls.filter(control => !control.disabled && /paywave|tap to pay|simulate.*tap|start.*nfc|apple pay|google pay|windcave.*(?:key|credential)/i.test(control.label));
        assert.deepEqual(forbidden, [], 'removed payment/credential control remains enabled');
        if (path === '/nfc') assert.match(facts.text, /unavailable|not available|retired|not found/i, 'NFC simulator must be retired');
        if (device === 'phone') assert.equal(facts.frame, null, 'phone cannot use desktop shell');
        else {
          assert.ok(facts.frame, 'desktop/tablet shell absent');
          assert.equal(facts.canvas.width, '1180px');
          assert.equal(facts.canvas.height, '880px');
          if (device === 'tablet') {
            assert.ok(Math.abs(facts.frame.width - options.viewport.width) < 2);
            assert.equal(parseFloat(facts.frame.radius), 0);
          } else {
            assert.ok(facts.frame.width < options.viewport.width && facts.frame.x > 0);
            assert.ok(parseFloat(facts.frame.radius) >= 20);
          }
        }
        assert.deepEqual(mutations.filter(value => !value.includes('/tutorial/')), [], 'unexpected API write');
        results.push({ device, path, status: 'passed', frame: facts.frame, canvas: facts.canvas });
      } catch (error) {
        results.push({ device, path, status: 'failed', error: error.message });
      } finally { await context.close(); }
      console.log(`${results.at(-1).status}: ${device} ${path}`);
    }
  }
} finally { await browser.close(); }
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
const failures = results.filter(result => result.status === 'failed');
console.log(JSON.stringify(failures, null, 2));
assert.equal(failures.length, 0, `${failures.length}/${results.length} device containment scenarios failed; ${output}/results.json`);
