// R1-T4 phase A browser check. Synthetic and loopback-only, like verify-r1-t8-browser.mjs:
// every /api request is answered here from fixtures, and every other non-local request is
// aborted, so gtag.js never loads and nothing reaches Google. The inline gtag() in
// index.html still queues each call in window.dataLayer, which is what gtag.js would send;
// an init script forwards each queued call here, across navigations. Serve a build first
// (`vite preview`).
//
//   R1T4_BASE_URL=http://127.0.0.1:5199 node scripts/verify-r1-t4-analytics-browser.mjs
//
// Before phase A, Google sign-in landed on /login?token=<account JWT> and GA4 read the page
// address, token included. Now no analytics call carries a token, a query or a fragment; the
// login page never stores a token from the address and redeems the one-time code by POST.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';

const base = process.env.R1T4_BASE_URL ?? 'http://127.0.0.1:5199';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'local servers only');
const { origin } = new URL(base);
const SECRET = `SECRETPROBE${Date.now()}`;
const ISSUED = `issued.${SECRET}.token`;

const cases = [
  { name: 'the old hand-back address, carrying a token', path: `/login?token=${SECRET}.jwt.sig&merchantId=1&newUser=true`,
    analyticsPath: '/login', address: '/login', stored: null, posts: [] },
  { name: 'the new hand-back, code redeemed', path: '/login?google=complete', session: 'ok',
    analyticsPath: '/login', stored: ISSUED, posts: ['/api/auth/google/session'], landsOn: '/dashboard' },
  { name: 'the new hand-back, code expired', path: '/login?google=complete', session: 'expired',
    analyticsPath: '/login', address: '/login', stored: null, posts: ['/api/auth/google/session'], toast: 'Sign in failed' },
  { name: 'an invoice link (token in the path)', path: `/r/${SECRET}?utm_source=probe`, analyticsPath: '/r/:token' },
  { name: 'a password reset link (token in the query)', path: `/reset-password?token=${SECRET}`, analyticsPath: '/reset-password' },
];

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const blockedHosts = new Set();
let failures = 0;
try {
  for (const c of cases) {
    const context = await browser.newContext();
    const calls = [];
    const posts = [];
    await context.exposeBinding('__r1t4AnalyticsCall', (_source, json) => { calls.push(JSON.parse(json)); });
    await context.addInitScript(() => {
      window.dataLayer = [];
      const push = Array.prototype.push;
      window.dataLayer.push = function (...items) {
        for (const item of items) {
          window.__r1t4AnalyticsCall(JSON.stringify(item && typeof item.length === 'number' ? Array.from(item) : item));
        }
        return push.apply(this, items);
      };
    });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { blockedHosts.add(url.hostname); return route.abort(); }
      if (url.pathname === '/dashboard') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' });
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (route.request().method() === 'POST') posts.push(url.pathname);
      if (url.pathname === '/api/auth/google/session') {
        return c.session === 'ok'
          ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: ISSUED, merchantId: 999999, newUser: false }) })
          : route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'GOOGLE_SIGN_IN_EXPIRED', message: 'Google sign in expired. Please try again.' }) });
      }
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) });
    });
    const page = await context.newPage();
    await page.goto(base + c.path, { waitUntil: 'load' });
    const deadline = Date.now() + 30_000;
    while (!calls.some((x) => Array.isArray(x) && x[0] === 'event' && x[1] === 'page_view') && Date.now() < deadline) {
      await page.waitForTimeout(100);
    }
    const landed = c.landsOn
      ? await page.waitForURL(`**${c.landsOn}`, { timeout: 15_000 }).then(() => true, () => false)
      : undefined;
    await page.waitForTimeout(1_500);
    const state = await page.evaluate(() => ({
      address: location.pathname + location.search,
      stored: localStorage.getItem('authToken'),
      text: document.body?.innerText ?? '',
    }));
    await context.close();

    const serialized = JSON.stringify(calls);
    const fields = calls.flatMap((x) => (Array.isArray(x) ? x : [x]))
      .filter((v) => v && typeof v === 'object')
      .flatMap((o) => ['page_location', 'page_referrer', 'page_path'].filter((k) => k in o).map((k) => `${k}=${o[k]}`));
    const config = calls.find((x) => Array.isArray(x) && x[0] === 'config');
    const pageView = calls.find((x) => Array.isArray(x) && x[0] === 'event' && x[1] === 'page_view');
    const checks = [
      ['no analytics call carries the token', !serialized.includes(SECRET)],
      ['no analytics address carries a query or a fragment', fields.every((f) => !/[?#]/.test(f))],
      ['config reports the bare origin, no referrer, no automatic page view',
        config?.[2]?.page_location === `${origin}/` && config?.[2]?.page_referrer === '' && config?.[2]?.send_page_view === false],
      [`the page view reports ${c.analyticsPath}`,
        pageView?.[2]?.page_path === c.analyticsPath && pageView?.[2]?.page_location === `${origin}${c.analyticsPath}`],
      ...(c.address ? [[`the address is left as ${c.address}`, state.address === c.address]] : []),
      ...('stored' in c ? [[c.stored ? 'the redeemed token is stored' : 'no token is stored', state.stored === c.stored]] : []),
      ...(c.posts ? [[`POSTs: ${c.posts.join(', ') || 'none'}`, JSON.stringify(posts) === JSON.stringify(c.posts)]] : []),
      ...(c.toast ? [[`"${c.toast}" is shown`, state.text.includes(c.toast)]] : []),
      ...(c.landsOn ? [[`goes on to ${c.landsOn}`, landed]] : []),
    ];
    console.log(`\n${c.name}: ${c.path.replaceAll(SECRET, '<token>')}`);
    for (const [label, ok] of checks) {
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
      if (!ok) failures += 1;
    }
    console.log(`  analytics fields: ${[...new Set(fields)].join(' | ').replaceAll(SECRET, '<token>')}`);
  }
} finally {
  await browser.close();
}
console.log(`\nblocked non-local hosts: ${[...blockedHosts].sort().join(', ') || 'none'}`);
assert.equal(failures, 0, `${failures} R1-T4 browser check(s) failed`);
console.log('R1-T4 analytics browser check passed');
