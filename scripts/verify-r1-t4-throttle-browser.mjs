// R1-T4 phase C browser check: the real login page in Chromium against the real
// sign-in routes (scripts/r1-t4-throttle-probe-server.ts, which this starts with a
// clean environment: in-memory storage, simulated email, no ambient credentials).
// Loopback only; every other request is aborted.
//
//   node scripts/verify-r1-t4-throttle-browser.mjs <screenshot dir>
//
// Before phase C, five wrong passwords locked the account for everyone — the merchant
// included — and the page showed the raw `429: {…}` text. Now a device that signed in
// before is slowed only by its own mistakes, and the page says how long to wait.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';

const port = Number(process.env.R1T4_PROBE_PORT ?? 5055);
const base = `http://localhost:${port}`;
const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/verify-r1-t4-throttle-browser.mjs <screenshot dir>');
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/r1-t4-throttle-probe-server.ts'], {
  env: {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    NODE_ENV: 'development', APP_ENV: 'development', DATABASE_TARGET: 'local', ENV_VALIDATION_MODE: 'audit',
    PAYMENT_MODE: 'disabled', EMAIL_PROVIDER: 'simulation', R1T4_PROBE_PORT: String(port),
    JWT_SECRET: 'probe-jwt-secret-not-a-real-credential-0001',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`probe server not ready:\n${serverLog.slice(-3000)}`)), 180_000);
  const seen = (chunk) => {
    serverLog += chunk;
    if (serverLog.includes('PROBE SERVER READY')) { clearTimeout(timer); resolve(); }
  };
  server.stdout.on('data', seen);
  server.stderr.on('data', seen);
  server.on('exit', (code) => { clearTimeout(timer); reject(new Error(`probe server exited (${code}):\n${serverLog.slice(-3000)}`)); });
});
const EMAIL = 'owner@probe.test';
const RIGHT = 'Probe-password-1';
const WRONG = 'Not-the-password-9';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

try { await ready; } catch (error) { server.kill(); throw error; }
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
async function browserContext(viewport) {
  const context = await browser.newContext({ viewport });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  return context;
}
async function openLogin(context) {
  const page = await context.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByTestId('input-email').waitFor({ timeout: 180_000 });
  return page;
}
async function submit(page, password) {
  await page.getByTestId('input-email').fill(EMAIL);
  await page.getByTestId('input-password').fill(password);
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
  await page.getByTestId('button-login').click();
  const response = await answered;
  return { status: response.status(), retryAfter: response.headers()['retry-after'] };
}
// Cookies the browser would send to a given address: the mark is scoped to /api/auth.
const markFor = async (context, url) => (await context.cookies(url)).find((c) => c.name === 'taptpay-signin-device');

try {
  // 1. The merchant signs in on their own laptop, which keeps the mark.
  const laptop = await browserContext({ width: 1280, height: 800 });
  let page = await openLogin(laptop);
  const first = await submit(page, RIGHT);
  check('the merchant signs in on their laptop', first.status === 200, `HTTP ${first.status}`);
  await page.waitForURL('**/dashboard', { timeout: 60_000 }).catch(() => undefined);
  const mark = await markFor(laptop, `${base}/api/auth/login`);
  check('the laptop now holds the known-device mark, sent with sign-in', Boolean(mark));
  check('the mark is not sent to the rest of the site', !(await markFor(laptop, `${base}/dashboard`)));
  check('the mark is HttpOnly, SameSite=Strict, sent only to /api/auth',
    mark?.httpOnly === true && mark?.sameSite === 'Strict' && mark?.path === '/api/auth',
    JSON.stringify({ httpOnly: mark?.httpOnly, sameSite: mark?.sameSite, path: mark?.path }));
  check('the mark holds no email', !decodeURIComponent(mark?.value ?? '').includes('probe'));
  const visible = await page.evaluate(() => document.cookie);
  check('page scripts cannot read the mark', !visible.includes('taptpay-signin-device'), `document.cookie=${JSON.stringify(visible)}`);
  await page.close();

  // 2. Someone else, on another browser, guesses the password six times.
  const attacker = await browserContext({ width: 1280, height: 800 });
  page = await openLogin(attacker);
  const statuses = [];
  let last;
  for (let i = 0; i < 6; i += 1) { last = await submit(page, WRONG); statuses.push(last.status); }
  check('five wrong guesses are answered, the sixth must wait', statuses.join(',') === '401,401,401,401,401,429',
    `statuses ${statuses.join(',')}, Retry-After ${last.retryAfter}`);
  const message = page.getByText('Too many attempts. Please try again in 30 seconds.');
  await message.waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('the page says how long to wait, in words', await message.isVisible());
  check('the page shows no raw status code', !(await page.getByText(/429|TOO_MANY_ATTEMPTS/).count()));
  await page.screenshot({ path: `${out}/login-slowed-desktop.png` });
  await page.close();

  // 3. While that wait runs, the merchant's laptop still signs straight in.
  page = await openLogin(laptop);
  const again = await submit(page, RIGHT);
  check("the merchant's laptop signs in during the attacker's wait", again.status === 200, `HTTP ${again.status}`);
  await page.close();

  // 4. A browser that has never signed in waits like the attacker — shown at phone size.
  const newPhone = await browserContext({ width: 390, height: 844 });
  page = await openLogin(newPhone);
  const unknown = await submit(page, RIGHT);
  check('a browser never signed in waits too, even with the right password', unknown.status === 429,
    `HTTP ${unknown.status}, Retry-After ${unknown.retryAfter}`);
  await page.getByText(/Too many attempts\. Please try again in \d+ seconds\./).waitFor({ timeout: 10_000 }).catch(() => undefined);
  check('the phone-size page shows the wait', await page.getByText(/Too many attempts\. Please try again in \d+ seconds\./).isVisible());
  await page.screenshot({ path: `${out}/login-slowed-phone.png` });
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `BROWSER PROBE: ${failed} FAILED` : 'BROWSER PROBE: all passed');
process.exit(failed ? 1 : 0);
