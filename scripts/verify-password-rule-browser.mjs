// Owner decisions 2026-09-23: a new password needs at least 8 characters, a capital
// letter, and a number or symbol; and the team-invite page's heading must be readable
// (it was white on the cream page). This drives the real sign-up and team-invite pages in
// Chromium against the real routes (scripts/r1-t4-throttle-probe-server.ts, started with
// a clean environment: in-memory storage, simulated email, no ambient credentials).
// Loopback only; every other request is aborted.
//
//   node scripts/verify-password-rule-browser.mjs <screenshot dir>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';

const RULE = 'Use at least 8 characters, including a capital letter and a number or symbol.';
const port = Number(process.env.R1T4_PROBE_PORT ?? 5055);
const base = `http://localhost:${port}`;
const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/verify-password-rule-browser.mjs <screenshot dir>');
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
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

try { await ready; } catch (error) { server.kill(); throw error; }
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
async function openPage(viewport, path) {
  const context = await browser.newContext({ viewport });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  const page = await context.newPage();
  const posts = [];
  page.on('request', (request) => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  return { page, posts };
}
const visible = (locator) => locator.waitFor({ timeout: 15_000 }).then(() => true, () => false);

/** WCAG contrast of an element's text against the first solid background behind it. */
const contrastOf = (page, selector) => page.evaluate((sel) => {
  const element = document.querySelector(sel);
  if (!element) return { ratio: 0, missing: true };
  const rgba = (color) => (color.match(/[\d.]+/g) || []).map(Number);
  const channel = (value) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  let background = [255, 255, 255];
  for (let node = element; node; node = node.parentElement) {
    const color = rgba(getComputedStyle(node).backgroundColor);
    if (color.length === 3 || (color.length === 4 && color[3] > 0)) { background = color.slice(0, 3); break; }
  }
  const text = rgba(getComputedStyle(element).color).slice(0, 3);
  const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);
  return { ratio: Math.round(((light + 0.05) / (dark + 0.05)) * 10) / 10, text, background };
}, selector);

async function signUpToPasswordStep(page, email) {
  await page.getByLabel('Full name').waitFor({ timeout: 180_000 });
  await page.getByLabel('Full name').fill('Jamie Smith');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Phone number').fill('0210000000');
  await page.getByTestId('signup-next').click();
  await page.getByLabel('Business name').fill('Kauri Studio');
  await page.getByLabel('Business type').selectOption('limited-company');
  await page.getByLabel('Business address').fill('1 Kauri Road, Auckland');
  await page.getByTestId('signup-next').click();
  await page.getByLabel('Director / owner').fill('Jamie Smith');
  await page.getByLabel('Estimated annual card turnover').selectOption('$150k–$500k');
  await page.getByLabel('Business description').fill('Independent design studio');
}
async function choosePassword(page, password) {
  // A field's error sits inside its label, so match the label by its start.
  await page.getByLabel(/^Create password/).fill(password);
  await page.getByLabel(/^Confirm password/).fill(password);
  await page.getByTestId('signup-next').click();
}

try {
  for (const [size, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
    const { page, posts } = await openPage(viewport, '/signup');
    await signUpToPasswordStep(page, `jamie.${size}@probe.test`);

    await choosePassword(page, 'password1');
    check(`${size} sign-up: a password with no capital shows the rule`, await visible(page.getByText(RULE)));
    check(`${size} sign-up: and stays on that step, sending nothing`,
      !(await page.getByTestId('signup-plan-team').isVisible()) && !posts.includes('/api/merchants/signup'));
    if (await page.getByText(RULE).isVisible()) await page.getByText(RULE).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/signup-rule-${size}.png` });

    await choosePassword(page, 'Password!');
    check(`${size} sign-up: a symbol in place of a number moves on to the plans`,
      await visible(page.getByTestId('signup-plan-team')));

    if (size === 'desktop') {
      await page.getByTestId('signup-next').click(); // plan → review
      const answered = page.waitForResponse((r) => r.url().endsWith('/api/merchants/signup'), { timeout: 30_000 });
      await page.getByTestId('signup-next').click(); // review → submit
      const response = await answered.catch(() => null);
      check('desktop sign-up: the server accepts it too', response?.status() === 200, `HTTP ${response?.status()}`);
      // The reply names no account (owner decision 2026-09-23): the confirmation page
      // is reached by address alone, and resends by address.
      await page.waitForURL('**/check-email?**', { timeout: 30_000 }).catch(() => undefined);
      const landed = new URL(page.url());
      check('desktop sign-up: the confirmation page is asked by address, with no account number',
        landed.pathname === '/check-email' && landed.searchParams.get('email') === 'jamie.desktop@probe.test'
          && !landed.searchParams.has('id'), landed.pathname + landed.search);
      const resent = page.waitForResponse((r) => r.url().endsWith('/api/auth/resend-confirmation'), { timeout: 30_000 });
      await page.getByRole('button', { name: 'Resend confirmation email' }).click();
      const resendReply = await resent.catch(() => null);
      const resendBody = await resendReply?.json().catch(() => null);
      check('desktop check-email: Resend is answered the same for every address',
        resendReply?.status() === 200 && resendBody?.message === "If that address is waiting to be confirmed, we've sent the link again.",
        `HTTP ${resendReply?.status()} ${JSON.stringify(resendBody)}`);
      check('desktop check-email: the page says it was sent', await visible(page.getByText('Email sent!')));
    }
    await page.context().close();
  }

  const { page, posts } = await openPage({ width: 390, height: 844 }, '/accept-invite?token=probe-invite-token');
  await page.locator('input[name="password"]').waitFor({ timeout: 180_000 });
  for (const [what, selector] of [['heading', '.signup-step-heading h1'], ['description', '.signup-step-heading .signup-description']]) {
    const contrast = await contrastOf(page, selector);
    check(`phone invite: the ${what} is readable (contrast at least 4.5)`, contrast.ratio >= 4.5, JSON.stringify(contrast));
  }
  await page.locator('input[name="password"]').fill('password1');
  await page.locator('input[name="confirmPassword"]').fill('password1');
  await page.getByTestId('accept-invite-submit').click();
  check('phone invite: a password with no capital shows the rule', await visible(page.getByText(RULE)));
  check('phone invite: and sends nothing', !posts.includes('/api/team/accept-invite'));
  await page.screenshot({ path: `${out}/invite-rule-phone.png` });
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `BROWSER PROBE: ${failed} FAILED` : 'BROWSER PROBE: all passed');
process.exit(failed ? 1 : 0);
