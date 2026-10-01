// R1-T4 phase E browser check: a real browser, the real pages and the real server, on in-memory
// storage (owner decisions 2026-09-29 and 2026-09-30, docs/PLAN-2026-09-29-r1-t4-phase-e-sessions.md §3:
// "No credential in an address, in localStorage, in a log line or in an analytics call … a runtime
// check in a real browser").
//
// Builds this tree's app (server/app.ts and the real routes) on a loopback port with a clean
// environment: no database, no ambient credential, simulated email. It serves the built client from
// the folder named (`npx vite build --outDir <absolute folder>`), as production does; without one,
// the client as `npm run dev` serves it, whose first visit to each page can reload it mid-step. One
// synthetic business and the platform admin. Chromium then signs in, uses the app, signs out every
// way the app offers, and tries to act from another site. Every request off this machine is aborted,
// and what it was is kept (the analytics calls among them).
//
//   npx vite build --outDir "$PWD/<build dir>"
//   node --import tsx scripts/verify-r1-t4-sessions-browser.ts <screenshot dir> "$PWD/<build dir>"
//
// Exits 1 when a check fails.
import bcrypt from "bcrypt";
import express from "express";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type BrowserContext, type Page, type Response as PwResponse } from "playwright";
import { CHROMIUM_PATH } from "./desktop-shots/retail-fixtures.mjs";

const OWNER_EMAIL = "owner@probe.test";
const OWNER_PASSWORD = "Probe-password-1";
const ADMIN_EMAIL = "admin@probe.test";
const ADMIN_PASSWORD = "Probe-admin-password-1";
const SIGN_OUT_PENDING_KEY = "taptpay:sign-out-pending";

// A clean environment before the app reads its configuration.
for (const key of Object.keys(process.env)) {
  if (!["PATH", "HOME", "TMPDIR", "PLAYWRIGHT_CHROMIUM_PATH"].includes(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "development",
  APP_ENV: "development",
  ENV_VALIDATION_MODE: "audit",
  PAYMENT_MODE: "disabled",
  EMAIL_PROVIDER: "simulation",
  JWT_SECRET: "sessions-probe-not-a-real-secret-0000001",
  ADMIN_EMAIL,
  ADMIN_PASSWORD_HASH: bcrypt.hashSync(ADMIN_PASSWORD, 4),
});

const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const builtClient = process.argv[3];
if (builtClient && !existsSync(path.join(builtClient, "index.html"))) {
  throw new Error(`no built client in ${builtClient}: run npx vite build --outDir <that absolute folder> first`);
}

const { createApp } = await import("../server/app");
const { registerRoutes } = await import("../server/routes");
const { createGlobalErrorHandler } = await import("../server/http-error-handler");
const { setupVite } = await import("../server/vite");
const { storage } = await import("../server/storage");
const { createUser } = await import("../server/auth");

const requestLog: string[] = [];
const app = createApp({ writeRequestLog: (line: string) => requestLog.push(line) });
const server = await registerRoutes(app);
app.use(createGlobalErrorHandler());
if (builtClient) {
  // As server/vite.ts serveStatic does in production: the built files, and the app's page for any other address.
  app.use(express.static(builtClient));
  app.use("*", (_req, res) => res.sendFile(path.join(builtClient, "index.html")));
} else {
  await setupVite(app, server);
}
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
/** The same server by another name: to the browser, another site. */
const otherSite = `http://localhost:${port}`;

const merchant = await storage.createMerchant({
  name: "Probe Cafe", businessName: "Probe Cafe Ltd", businessType: "retail",
  email: OWNER_EMAIL, phone: "021 555 0100", address: "1 Probe Street, Auckland",
} as any);
await storage.updateMerchantStatus(merchant.id, "active");
await storage.updateMerchant(merchant.id, { onboardingCompleted: true, tutorialAutoEnabled: false } as any);
await createUser(OWNER_EMAIL, OWNER_PASSWORD, merchant.id, "merchant");
const sale = await storage.createTransaction({
  merchantId: merchant.id, itemName: "Probe coffee", price: "4.50", status: "pending",
  paymentMethod: "qr_code", splitEnabled: false,
} as any);

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

interface Seen { method: string; url: string; headers: Record<string, string> }
const seen: Seen[] = [];
const offMachine: string[] = [];
const dialogs: string[] = [];
/** Secrets the browser was given, as they are learned: none may appear in an address, storage or a log. */
const secrets = new Set<string>();

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });

async function newContext(options: Parameters<typeof browser.newContext>[0]): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  // Sandboxed Chromium has only loopback and reports itself offline; the app would cover itself with
  // "Connection Lost". A string, not a function: tsx wraps nested functions in a helper the page lacks.
  await context.addInitScript('Object.defineProperty(Navigator.prototype, "onLine", { get: function () { return true; } });');
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(base) || url.startsWith(otherSite)) return route.continue();
    offMachine.push(url);
    return route.abort();
  });
  context.on("request", (request) => {
    void request.allHeaders().then((headers) => seen.push({ method: request.method(), url: request.url(), headers }))
      .catch(() => undefined);
  });
  context.on("response", (response) => {
    void learnSecrets(response);
  });
  // Every dialog is accepted and kept: the "sign out of all devices?" question, and the terminal's
  // "closing will stop payment processing" on leaving a page.
  context.on("page", (page) => {
    page.on("dialog", (dialog) => {
      dialogs.push(`${dialog.type()}: ${dialog.message().slice(0, 80)}`);
      void dialog.accept().catch(() => undefined);
    });
  });
  return context;
}

async function learnSecrets(response: PwResponse) {
  try {
    const headers = await response.allHeaders();
    for (const line of (headers["set-cookie"] ?? "").split("\n")) {
      const match = /^(?:__Host-)?taptpay-(?:admin-)?session=([^;]+)/.exec(line);
      if (match && match[1].includes(".")) secrets.add(decodeURIComponent(match[1]).split(".")[1]);
    }
    const url = new URL(response.url());
    if (["/api/auth/session", "/api/auth/login", "/api/admin/auth/login", "/api/admin/auth/me"].includes(url.pathname)) {
      const body = await response.json().catch(() => null);
      if (typeof body?.csrfToken === "string") secrets.add(body.csrfToken);
      if (typeof body?.token === "string") secrets.add(body.token);
    }
  } catch {
    // A response that was torn down with its page.
  }
}

const sessionCookieOf = async (context: BrowserContext, admin = false) =>
  (await context.cookies(base)).find((cookie) => cookie.name === (admin ? "taptpay-admin-session" : "taptpay-session"));
const storageOf = (page: Page) => page.evaluate(() => ({
  local: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
  session: Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])),
  cookie: document.cookie,
}));
const responseTo = (page: Page, method: string, path: string, timeout = 60_000) =>
  page.waitForResponse((r) => new URL(r.url()).pathname === path && r.request().method() === method, { timeout });
/** The page's visible text, once it has stopped saying it is loading and holds `expected`. */
async function shownText(page: Page, expected: string, timeout = 120_000): Promise<string> {
  await page.waitForFunction(
    (text) => document.body.innerText.includes(text) && !document.body.innerText.includes("Loading page"),
    expected, { timeout },
  ).catch(() => undefined);
  return page.evaluate(() => document.body.innerText);
}
const sessionAnswer = async (page: Page) =>
  page.evaluate(async () => (await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })).json());

async function openLogin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.getByTestId("input-email").waitFor({ timeout: 240_000 });
  return page;
}
async function signIn(page: Page): Promise<PwResponse> {
  await page.getByTestId("input-email").fill(OWNER_EMAIL);
  await page.getByTestId("input-password").fill(OWNER_PASSWORD);
  const answered = responseTo(page, "POST", "/api/auth/login");
  await page.getByTestId("button-login").click();
  const response = await answered;
  await page.waitForURL("**/dashboard", { timeout: 120_000 });
  return response;
}
const LEGACY_KEYS = ["authToken", "user", "merchantId", "adminAuthToken", "adminUser"];

try {
  // ── 1. What the page kept before the switch is removed on the first load. ──────────────────────
  const desktop = await newContext({ viewport: { width: 1280, height: 800 } });
  let page = await openLogin(desktop);
  await page.evaluate((keys) => { for (const key of keys) localStorage.setItem(key, "left.from.before"); }, LEGACY_KEYS);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("input-email").waitFor({ timeout: 120_000 });
  await page.waitForFunction((keys) => keys.every((key) => localStorage.getItem(key) === null), LEGACY_KEYS, { timeout: 30_000 })
    .catch(() => undefined);
  let stored = await storageOf(page);
  check("the sign-in the page used to keep in storage is removed on load", LEGACY_KEYS.every((key) => !(key in stored.local)),
    `localStorage keys: ${JSON.stringify(Object.keys(stored.local))}`);

  // ── 2. Signing in. ─────────────────────────────────────────────────────────────────────────────
  const login = await signIn(page);
  check("the business signs in on its laptop", login.status() === 200, `HTTP ${login.status()}`);
  const cookie = await sessionCookieOf(desktop);
  check("the sign-in is a cookie the server set", Boolean(cookie));
  check("the cookie is HttpOnly, SameSite=Lax, for the whole site, and not a session-only cookie",
    cookie?.httpOnly === true && cookie?.sameSite === "Lax" && cookie?.path === "/" && (cookie?.expires ?? -1) > 0,
    JSON.stringify({ httpOnly: cookie?.httpOnly, sameSite: cookie?.sameSite, path: cookie?.path, expires: cookie?.expires }));
  const lifetimeDays = cookie ? (cookie.expires - Date.now() / 1000) / 86_400 : 0;
  check("it lasts 7 days at most", lifetimeDays > 6.9 && lifetimeDays <= 7.01, `${lifetimeDays.toFixed(2)} days`);
  stored = await storageOf(page);
  check("page scripts cannot read the cookie", !stored.cookie.includes("taptpay-session"), `document.cookie=${JSON.stringify(stored.cookie)}`);
  check("nothing of the sign-in is kept in localStorage or sessionStorage",
    LEGACY_KEYS.every((key) => !(key in stored.local)) &&
      [...secrets].every((secret) => !JSON.stringify(stored).includes(secret)),
    `localStorage keys: ${JSON.stringify(Object.keys(stored.local))}; sessionStorage keys: ${JSON.stringify(Object.keys(stored.session))}`);
  const answer = await sessionAnswer(page);
  check("the start-up check answers who is signed in, with the page's CSRF token",
    answer.signedIn === true && answer.user?.email === OWNER_EMAIL && /^[A-Za-z0-9_-]{43}$/.test(answer.csrfToken ?? ""));
  const csrfToken: string = answer.csrfToken;
  const dashboard = await shownText(page, "sales revenue");
  check("the dashboard is shown, loaded, with no connection warning",
    dashboard.includes("sales revenue") && !/Connection Lost|didn't load|Can't reach/i.test(dashboard),
    JSON.stringify(dashboard.replace(/\s+/g, " ").slice(0, 160)));
  if (out) await page.screenshot({ path: `${out}/signed-in-desktop.png` });

  // ── 3. A reload keeps the sign-in; a change needs the page's token. ────────────────────────────
  const checked = responseTo(page, "GET", "/api/auth/session");
  await page.reload({ waitUntil: "domcontentloaded" });
  await checked;
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  check("a reload keeps the business signed in, from the cookie alone", page.url().endsWith("/dashboard"), page.url());
  const withoutToken = await page.evaluate(async () => {
    const res = await fetch("/api/tutorial/restart", { method: "POST" });
    return { status: res.status, code: (await res.json().catch(() => ({}))).code };
  });
  check("a change sent with the cookie but without the page's token is refused",
    withoutToken.status === 403 && withoutToken.code === "CSRF_REJECTED", JSON.stringify(withoutToken));
  const withToken = await page.evaluate(async (token) => {
    const res = await fetch("/api/tutorial/restart", { method: "POST", headers: { "X-CSRF-Token": token } });
    return res.status;
  }, csrfToken);
  check("the same change with the page's token is done", withToken === 200, `HTTP ${withToken}`);

  // ── 4. The phone: a second session of the same login; its terminal reads and listens by cookie. ─
  const phone = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phonePage = await openLogin(phone);
  await signIn(phonePage);
  const read = responseTo(phonePage, "GET", `/api/merchants/${merchant.id}/active-transaction`, 120_000);
  const stream = responseTo(phonePage, "GET", `/api/merchants/${merchant.id}/events`, 120_000);
  await phonePage.goto(`${base}/terminal`, { waitUntil: "domcontentloaded" });
  const readAnswer = await read;
  const readBody = await readAnswer.json().catch(() => null);
  check("the phone terminal reads its current sale, signed in by the cookie",
    readAnswer.status() === 200 && readBody?.id === sale.id, `HTTP ${readAnswer.status()}, sale ${readBody?.id}`);
  const streamAnswer = await stream;
  check("its live updates open on the cookie",
    streamAnswer.status() === 200 && (await streamAnswer.allHeaders())["content-type"]?.includes("text/event-stream") === true,
    `HTTP ${streamAnswer.status()}`);
  const terminal = await shownText(phonePage, "Probe coffee");
  check("the phone terminal shows the open sale, with no connection warning",
    terminal.includes("Probe coffee") && !/Connection Lost|Real-time Updates Disconnected/i.test(terminal),
    JSON.stringify(terminal.replace(/\s+/g, " ").slice(0, 160)));
  if (out) await phonePage.screenshot({ path: `${out}/terminal-phone.png` });
  const phoneCookie = await sessionCookieOf(phone);
  check("the phone holds a session of its own", Boolean(phoneCookie) && phoneCookie?.value !== cookie?.value);

  // ── 5. Another website cannot act as the signed-in business. ───────────────────────────────────
  const hostile = await desktop.newPage();
  await hostile.goto(`${otherSite}/api/push/capabilities`);
  const crossFetch = await hostile.evaluate(async (target) => {
    try {
      const res = await fetch(`${target}/api/auth/sign-out-everywhere`, { method: "POST", credentials: "include" });
      return `answered ${res.status}`;
    } catch (error) {
      return `blocked: ${String(error)}`;
    }
  }, base);
  check("another site's fetch gets no answer it can read", crossFetch.startsWith("blocked"), crossFetch);
  const formPost = hostile.waitForResponse((r) => r.url() === `${base}/api/auth/sign-out-everywhere`, { timeout: 30_000 });
  await hostile.evaluate((target) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${target}/api/auth/sign-out-everywhere`;
    document.body.appendChild(form);
    form.submit();
  }, base);
  const formAnswer = await formPost;
  check("another site's form post is refused", formAnswer.status() === 403, `HTTP ${formAnswer.status()}`);
  await hostile.close();
  const stillSignedIn = await sessionAnswer(page);
  check("and the business is still signed in afterwards", stillSignedIn.signedIn === true);

  // ── 6. Sign out of all devices, from the laptop: the phone is signed out too. ──────────────────
  await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded" });
  const everywhere = responseTo(page, "POST", "/api/auth/sign-out-everywhere");
  await page.getByRole("button", { name: "Sign out of all devices" }).click({ timeout: 120_000 });
  const everywhereAnswer = await everywhere;
  const everywhereHeaders = await everywhereAnswer.request().allHeaders();
  check("'Sign out of all devices' is sent with the page's token, and done",
    everywhereAnswer.status() === 204 && everywhereHeaders["x-csrf-token"] === csrfToken, `HTTP ${everywhereAnswer.status()}`);
  await page.waitForURL("**/login", { timeout: 60_000 }).catch(() => undefined);
  check("the laptop is at the sign-in page, its cookie gone",
    page.url().includes("/login") && !(await sessionCookieOf(desktop)), page.url());
  const phoneAfter = await phonePage.evaluate(async () => (await fetch("/api/auth/me", { credentials: "same-origin" })).status);
  check("the phone's session has ended too", phoneAfter === 401, `HTTP ${phoneAfter}`);
  await phonePage.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded" });
  await phonePage.waitForURL("**/login**", { timeout: 60_000 }).catch(() => undefined);
  check("the phone is sent to sign in", phonePage.url().includes("/login"), phonePage.url());
  await phone.close();

  // ── 7. Log Out. ────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-email").waitFor({ timeout: 120_000 });
  await signIn(page);
  await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded" });
  const loggedOut = responseTo(page, "POST", "/api/auth/logout");
  await page.getByTestId("button-logout").click({ timeout: 120_000 });
  const loggedOutAnswer = await loggedOut;
  check("Log Out has the server end the session", loggedOutAnswer.status() === 204, `HTTP ${loggedOutAnswer.status()}`);
  await page.waitForURL("**/login", { timeout: 60_000 }).catch(() => undefined);
  check("the cookie is gone after Log Out", !(await sessionCookieOf(desktop)));
  await page.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login**", { timeout: 60_000 }).catch(() => undefined);
  check("the dashboard then asks for a sign-in", page.url().includes("/login"), page.url());

  // ── 8. Log Out while the server cannot be reached: finished by the next load. ──────────────────
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-email").waitFor({ timeout: 120_000 });
  await signIn(page);
  await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("button-logout").waitFor({ timeout: 120_000 });
  await desktop.route("**/api/**", (route) => route.abort("connectionfailed"));
  await page.getByTestId("button-logout").click();
  await page.waitForURL("**/login", { timeout: 60_000 }).catch(() => undefined);
  stored = await storageOf(page);
  check("with the server unreachable, the page still signs out at once", page.url().includes("/login"), page.url());
  check("the sign-out is marked as owed, with a mark that holds no credential",
    stored.local[SIGN_OUT_PENDING_KEY] === "1" && Object.keys(stored.local).filter((key) => key.startsWith("taptpay:sign-out")).length === 1,
    JSON.stringify(stored.local));
  check("the cookie is still there: only the server can end the session", Boolean(await sessionCookieOf(desktop)));
  await desktop.unroute("**/api/**");
  const finished = responseTo(page, "POST", "/api/auth/logout", 120_000);
  await page.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded" });
  const finishedAnswer = await finished.catch(() => null);
  check("the next load has the server end the session before anyone is signed in", finishedAnswer?.status() === 204,
    `HTTP ${finishedAnswer?.status()}`);
  await page.waitForURL("**/login**", { timeout: 60_000 }).catch(() => undefined);
  await page.waitForFunction((key) => localStorage.getItem(key) === null, SIGN_OUT_PENDING_KEY, { timeout: 30_000 }).catch(() => undefined);
  stored = await storageOf(page);
  check("that load shows the sign-in page, not the dashboard; the cookie and the mark are gone",
    page.url().includes("/login") && !(await sessionCookieOf(desktop)) && !(SIGN_OUT_PENDING_KEY in stored.local),
    `${page.url()} ${JSON.stringify(stored.local)}`);

  // ── 9. The admin area: its own cookie. ─────────────────────────────────────────────────────────
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-email").waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByTestId("input-email").fill(ADMIN_EMAIL);
  await page.getByTestId("input-password").fill(ADMIN_PASSWORD);
  const adminLogin = responseTo(page, "POST", "/api/admin/auth/login");
  const adminCheck = responseTo(page, "GET", "/api/admin/auth/me", 180_000);
  await page.getByTestId("button-login").click();
  check("the admin signs in", (await adminLogin).status() === 200);
  check("the admin area asks by its own cookie, and is let in", (await adminCheck).status() === 200);
  const adminCookie = await sessionCookieOf(desktop, true);
  check("the admin's cookie is its own, HttpOnly, and lasts 12 hours at most",
    adminCookie?.httpOnly === true && adminCookie.sameSite === "Lax" &&
      (adminCookie.expires - Date.now() / 1000) / 3600 <= 12.01 && (adminCookie.expires - Date.now() / 1000) / 3600 > 11.9,
    JSON.stringify({ httpOnly: adminCookie?.httpOnly, hours: adminCookie ? (adminCookie.expires - Date.now() / 1000) / 3600 : null }));
  stored = await storageOf(page);
  check("nothing of the admin's sign-in is kept in storage",
    LEGACY_KEYS.every((key) => !(key in stored.local)) && [...secrets].every((secret) => !JSON.stringify(stored).includes(secret)),
    JSON.stringify(Object.keys(stored.local)));
  const businessAsAdmin = await page.evaluate(async () => (await fetch("/api/auth/session", { credentials: "same-origin" })).json());
  check("the admin's cookie signs no business in", businessAsAdmin.signedIn === false);
  const adminHome = (await shownText(page, "Probe Cafe Ltd")).replace(/\s+/g, " ");
  check("the admin area shows the platform's businesses", adminHome.includes("Probe Cafe Ltd"),
    JSON.stringify(adminHome.slice(0, 200)));
  // Owner decision 2026-09-30: the home page's totals are the platform's real figures (one sale, still
  // waiting; one active business), not the $0 and 0 it showed whatever the platform held.
  check("the admin home page shows the real totals: one sale, still waiting, and the business as verified",
    /Total Revenue \$0\.00 All time Total Transactions 1 All time Active Merchants 1 Verified accounts Pending Transactions 1 Awaiting completion/.test(adminHome) &&
      adminHome.includes("Probe Cafe Ltd owner@probe.test ✓ Verified"),
    JSON.stringify(adminHome.slice(adminHome.indexOf("Total Revenue"), adminHome.indexOf("Total Revenue") + 170)));
  if (out) await page.screenshot({ path: `${out}/admin-area.png` });
  const adminOut = responseTo(page, "POST", "/api/admin/auth/logout");
  await page.getByTestId("button-admin-logout").click({ timeout: 120_000 });
  check("the admin's Log Out has the server end the admin session", (await adminOut).status() === 204);
  await page.waitForURL("**/login", { timeout: 60_000 }).catch(() => undefined);
  check("the admin's cookie is gone", !(await sessionCookieOf(desktop, true)));

  // ── 10. Across everything above. ───────────────────────────────────────────────────────────────
  await new Promise((resolve) => setTimeout(resolve, 500)); // let the request records settle
  const api = seen.filter((request) => new URL(request.url).pathname.startsWith("/api/"));
  const withAuthorization = seen.filter((request) => "authorization" in request.headers);
  check("no request carried an Authorization header", withAuthorization.length === 0,
    withAuthorization.slice(0, 3).map((request) => `${request.method} ${request.url}`).join(", "));
  const secretList = [...secrets];
  const inAddresses = [...seen.map((request) => request.url), ...offMachine]
    .filter((url) => secretList.some((secret) => url.includes(secret) || url.includes(encodeURIComponent(secret))) || /[?&#](token|csrf|session)=/i.test(url));
  check("no credential appeared in any address, the analytics calls included", inAddresses.length === 0,
    `${seen.length} requests on this machine, ${offMachine.length} off it; ${inAddresses.slice(0, 3).join(", ")}`);
  const loggedSecrets = requestLog.filter((line) => secretList.some((secret) => line.includes(secret)));
  check("no credential appeared in the server's request log", loggedSecrets.length === 0,
    `${requestLog.length} lines, ${secretList.length} secrets learned`);
  const PRE_SESSION = new Set(["/api/auth/login", "/api/admin/auth/login"]);
  const changes = api.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.url.startsWith(base) && !PRE_SESSION.has(new URL(request.url).pathname));
  const fromTheApp = changes.filter((request) => request.headers["x-csrf-token"] !== undefined);
  check("every change the app itself sent carried a CSRF token",
    // The probe's own two bare requests (one without a token, on purpose; the other site's) carry none.
    changes.length - fromTheApp.length <= 3 && fromTheApp.length >= 6,
    `${fromTheApp.length} of ${changes.length} changes carried one`);
  const analytics = offMachine.filter((url) => /google-analytics|googletagmanager|analytics/.test(url));
  console.log(`INFO dialogs accepted: ${JSON.stringify([...new Set(dialogs)])}`);
  console.log(`INFO ${seen.length} requests on this machine; ${offMachine.length} aborted off it (${analytics.length} to analytics); ${secretList.length} secrets tracked`);
} finally {
  await browser.close();
  server.closeAllConnections?.();
  server.close();
}
console.log(failed ? `SESSIONS BROWSER PROBE: ${failed} FAILED` : "SESSIONS BROWSER PROBE: all passed");
process.exit(failed ? 1 : 0);
