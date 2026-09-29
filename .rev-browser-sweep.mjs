import { chromium } from 'playwright';
import fs from 'fs';

const EXEC = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const BASE = 'http://localhost:5000';
const TOKEN = fs.readFileSync('.rev-token.txt', 'utf8').trim();

const DEVICES = [
  { name: 'mobile',  viewport: { width: 390, height: 844 },  hasTouch: true },
  { name: 'tablet',  viewport: { width: 1194, height: 834 }, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, hasTouch: false },
];

// Every signed-in app route (landing page deliberately excluded).
const ROUTES = [
  '/dashboard', '/terminal', '/stack', '/transactions', '/stock', '/settings',
  '/nfc', '/board-builder', '/onboarding',
  '/property', '/property/tenants', '/property/analytics', '/property/terminal',
  '/trades', '/trades/clients', '/trades/analytics', '/trades/terminal',
  '/trades/quote', '/trades/recurring',
];
// Public / unauthenticated app routes
const PUBLIC_ROUTES = [
  '/login', '/signup', '/forgot-password', '/reset-password', '/check-email',
  '/confirm-email', '/business-details', '/info', '/terms', '/privacy',
  '/app-login', '/accept-invite', '/this-route-does-not-exist',
];

const results = [];

function attach(page, bucket) {
  page.on('console', m => {
    if (m.type() === 'error') bucket.console.push(m.text().slice(0, 300));
  });
  page.on('pageerror', e => bucket.pageErrors.push(String(e.message).slice(0, 300)));
  page.on('requestfailed', r => {
    const u = r.url();
    if (u.startsWith(BASE)) bucket.failedReq.push(`${r.failure()?.errorText} ${u.replace(BASE, '')}`);
  });
  page.on('response', r => {
    const u = r.url();
    if (u.startsWith(BASE) && r.status() >= 500) bucket.serverErrors.push(`${r.status()} ${u.replace(BASE, '')}`);
  });
}

async function visit(context, route, device, authed) {
  const page = await context.newPage();
  const bucket = { console: [], pageErrors: [], failedReq: [], serverErrors: [] };
  attach(page, bucket);
  let state = {};
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2200);
    state = await page.evaluate(() => {
      const body = document.body;
      const text = (body.innerText || '').trim();
      return {
        textLen: text.length,
        head: text.slice(0, 70).replace(/\s+/g, ' '),
        chunkRecovery: !!document.querySelector('[data-chunk-recovery]'),
        recoveryKind: document.querySelector('[data-chunk-recovery]')?.getAttribute('data-chunk-recovery') || null,
        pageLoader: !!document.querySelector('[data-testid="page-loader"]'),
        authUnavailable: !!document.querySelector('[data-testid="auth-unavailable"]'),
        url: location.pathname,
      };
    });
  } catch (e) {
    state = { error: String(e.message).slice(0, 160) };
  }
  await page.close();
  results.push({ route, device: device.name, authed, ...state, ...bucket });
}

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });

for (const device of DEVICES) {
  // --- authenticated ---
  const authCtx = await browser.newContext({ viewport: device.viewport, hasTouch: device.hasTouch });
  await authCtx.addInitScript(t => {
    localStorage.setItem('authToken', t);
  }, TOKEN);
  for (const route of ROUTES) await visit(authCtx, route, device, true);
  await authCtx.close();

  // --- unauthenticated public routes ---
  const pubCtx = await browser.newContext({ viewport: device.viewport, hasTouch: device.hasTouch });
  for (const route of PUBLIC_ROUTES) await visit(pubCtx, route, device, false);
  await pubCtx.close();
}

await browser.close();

// ---- report ----
let bad = 0;
console.log('DEV      ROUTE                          LEN  STATE');
for (const r of results) {
  const problems = [];
  if (r.error) problems.push('NAV_FAIL:' + r.error);
  if (r.pageErrors?.length) problems.push(`PAGE_ERR(${r.pageErrors.length})`);
  if (r.serverErrors?.length) problems.push(`5xx(${r.serverErrors.length})`);
  if (r.chunkRecovery) problems.push('RECOVERY_SCREEN:' + r.recoveryKind);
  if (r.pageLoader) problems.push('STUCK_LOADER');
  if (r.authUnavailable) problems.push('AUTH_UNAVAILABLE');
  if (!r.error && (r.textLen ?? 0) < 15) problems.push('BLANK');
  if (problems.length) bad++;
  console.log(
    `${r.device.padEnd(8)} ${r.route.padEnd(30)} ${String(r.textLen ?? '-').padStart(5)}  ${problems.join(' ') || 'ok'}`
  );
}

console.log('\n\n===== DETAIL FOR PROBLEM ROUTES =====');
for (const r of results) {
  const has = r.error || r.pageErrors?.length || r.serverErrors?.length || r.chunkRecovery || r.pageLoader || (!r.error && (r.textLen ?? 0) < 15);
  if (!has) continue;
  console.log(`\n--- ${r.device} ${r.route} (authed=${r.authed}) url=${r.url}`);
  if (r.error) console.log('  nav error:', r.error);
  console.log('  head:', r.head);
  if (r.pageErrors?.length) console.log('  pageErrors:', [...new Set(r.pageErrors)].join(' | '));
  if (r.serverErrors?.length) console.log('  5xx:', [...new Set(r.serverErrors)].join(' | '));
  if (r.failedReq?.length) console.log('  failedReq:', [...new Set(r.failedReq)].slice(0, 5).join(' | '));
  if (r.console?.length) console.log('  console:', [...new Set(r.console)].slice(0, 4).join(' | '));
}

console.log(`\n\nTOTAL: ${results.length} visits, ${bad} with problems`);

// Aggregate console errors across everything
const allConsole = {};
for (const r of results) for (const c of r.console || []) allConsole[c] = (allConsole[c] || 0) + 1;
console.log('\n===== CONSOLE ERRORS (deduped, by frequency) =====');
Object.entries(allConsole).sort((a, b) => b[1] - a[1]).slice(0, 25)
  .forEach(([k, v]) => console.log(`${String(v).padStart(3)}x  ${k}`));
