// R1-T5d browser check: Sign in with Apple in a real browser, with the real pages and the real
// routes, on in-memory storage and a STAND-IN for Apple (owner decision 2026-09-29: built and tested
// with stand-ins; live needs the owner's Apple setup and a real iPhone). No request reaches Apple.
//
// What it stands up, in this one process:
// - this tree's app (server/app.ts and the real routes) over https on a loopback port, with a
//   certificate made here for this run, a public origin of https://localhost:<port>, a synthetic
//   Services ID and team key, no database, no ambient credential, simulated email;
// - a stand-in for Apple's token endpoint and key set (the server's own outbound calls, replaced
//   in this process), which signs identity tokens with a key made here;
// - a stand-in for Apple's sign-in page: a second https server here, which Chromium is told is
//   appleid.apple.com (a resolver rule for this browser only). It answers /auth/authorize with a page
//   that posts the form back the way Apple does. To the browser that page IS appleid.apple.com, so
//   the post back is a real cross-site form post. (A route handler cannot play this part: the browser
//   reaches Apple by following this server's redirect, and redirected requests are not routed.)
//
// Chromium then, at phone, tablet and desktop sizes: looks at the login page's two buttons; signs in
// with Apple as someone new, and again; connects Apple from Settings as a signed-in owner, is
// refused with a wrong password, cancels at Apple, connects, and disconnects.
//
//   npx vite build --outDir "$PWD/<build dir>"
//   node --import tsx scripts/verify-r1-t5-apple-browser.ts <screenshot dir> "$PWD/<build dir>"
//
// Exits 1 when a check fails. It proves the pages and this server's cookies together in Chromium;
// Safari on an iPhone, and Apple itself, are the owner's check.
import crypto from "node:crypto";
import express from "express";
import https from "node:https";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { chromium, type BrowserContext, type Page } from "playwright";
import { CHROMIUM_PATH } from "./desktop-shots/retail-fixtures.mjs";

const OWNER_PASSWORD = "Probe-password-1";
const SERVICES_ID = "nz.taptpay.signin.probe";
const APPLE = "https://appleid.apple.com";
const OAUTH_COOKIE = "__Host-taptpay-apple-oauth";
const SESSION_COOKIE = "__Host-taptpay-session";

const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const builtClient = process.argv[3];
if (!builtClient || !existsSync(path.join(builtClient, "index.html"))) {
  throw new Error(`no built client in ${builtClient}: run npx vite build --outDir <that absolute folder> first`);
}

// Two free loopback ports (the app, the stand-in Apple page), and a certificate made for this run only.
const freePort = () => new Promise<number>((resolve) => {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const found = (probe.address() as AddressInfo).port;
    probe.close(() => resolve(found));
  });
});
const port = await freePort();
const applePort = await freePort();
const base = `https://localhost:${port}`;
const certDir = mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "taptpay-apple-probe-"));
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost,DNS:appleid.apple.com", "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem"),
], { stdio: "ignore" });
const tls = { key: readFileSync(path.join(certDir, "key.pem")), cert: readFileSync(path.join(certDir, "cert.pem")) };

// A clean environment before the app reads its configuration.
const teamKey = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
for (const key of Object.keys(process.env)) {
  if (!["PATH", "HOME", "TMPDIR", "PLAYWRIGHT_CHROMIUM_PATH"].includes(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "development",
  APP_ENV: "development",
  ENV_VALIDATION_MODE: "audit",
  PAYMENT_MODE: "disabled",
  EMAIL_PROVIDER: "simulation",
  JWT_SECRET: "apple-probe-not-a-real-secret-00000001",
  PUBLIC_ORIGIN: base,
  APPLE_SERVICES_ID: SERVICES_ID,
  APPLE_TEAM_ID: "TEAMPROBE1",
  APPLE_KEY_ID: "KEYPROBE01",
  APPLE_PRIVATE_KEY: teamKey.privateKey.export({ type: "pkcs8", format: "pem" }) as string,
});

// ── The stand-in for Apple's servers: the token endpoint and the key set. ────────────────────────
const appleKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
type Person = { sub: string; email?: string };
/** Codes the stand-in sign-in page has issued, each for one start's nonce and one person; spent on use. */
const codes = new Map<string, { nonce: string; person: Person }>();
const exchanges: Array<{ known: boolean; redirectUri: string | null; clientId: string | null }> = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : String(input?.url ?? input);
  if (url === `${APPLE}/auth/keys`) {
    return new Response(JSON.stringify({ keys: [{ ...appleKey.publicKey.export({ format: "jwk" }), kid: "probe-key-1", use: "sig", alg: "RS256" }] }), { status: 200 });
  }
  if (url === `${APPLE}/auth/token`) {
    const form = new URLSearchParams(String(init?.body ?? ""));
    const code = form.get("code") ?? "";
    const issued = codes.get(code);
    codes.delete(code);
    exchanges.push({ known: Boolean(issued), redirectUri: form.get("redirect_uri"), clientId: form.get("client_id") });
    if (!issued) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const idToken = jwt.sign({
      iss: APPLE, aud: SERVICES_ID, sub: issued.person.sub, nonce: issued.nonce, iat: now - 5, exp: now + 600,
      ...(issued.person.email ? { email: issued.person.email, email_verified: "true", is_private_email: "false" } : {}),
    }, appleKey.privateKey, { algorithm: "RS256", header: { alg: "RS256", kid: "probe-key-1" } as any });
    return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

const { createApp } = await import("../server/app");
const { registerRoutes } = await import("../server/routes");
const { createGlobalErrorHandler } = await import("../server/http-error-handler");
const { storage } = await import("../server/storage");
const { createUser } = await import("../server/auth");

const requestLog: string[] = [];
const app = createApp({ writeRequestLog: (line: string) => requestLog.push(line) });
/** What this server itself received on each of Apple's posts back that its cross-site guard let through. */
const postsBack: Array<{ origin?: string; site?: string; cookies: string[] }> = [];
app.use((req, _res, next) => {
  if (req.method === "POST" && req.path === "/api/auth/apple/callback") {
    postsBack.push({
      origin: req.headers.origin,
      site: typeof req.headers["sec-fetch-site"] === "string" ? req.headers["sec-fetch-site"] : undefined,
      cookies: String(req.headers.cookie ?? "").split(";").map((part) => part.trim().split("=")[0]).filter(Boolean),
    });
  }
  next();
});
await registerRoutes(app);
app.use(createGlobalErrorHandler());
// As server/vite.ts serveStatic does in production: the built files, and the app's page for any other address.
app.use(express.static(builtClient));
app.use("*", (_req, res) => res.sendFile(path.join(builtClient, "index.html")));
const server = https.createServer(tls, app);
await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

// ── The stand-in for Apple's sign-in page (to this browser: https://appleid.apple.com). ──────────
type AtApple = Person;
/** Who signs in at the stand-in Apple page next, and the authorize requests it has been shown. */
let atApple: AtApple = { sub: "unset" };
const authorizeVisits: URL[] = [];
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const standInApple = https.createServer(tls, (req, res) => {
  const url = new URL(req.url ?? "/", APPLE);
  if (req.method !== "GET" || url.pathname !== "/auth/authorize") {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not part of the stand-in");
    return;
  }
  // It issues a code for this start's nonce and the person signing in, and posts the form back to the
  // return address it was given, as Apple does (response_mode=form_post).
  authorizeVisits.push(url);
  const code = crypto.randomBytes(16).toString("hex");
  codes.set(code, { nonce: url.searchParams.get("nonce") ?? "", person: atApple });
  const action = escapeHtml(url.searchParams.get("redirect_uri") ?? "");
  const state = escapeHtml(url.searchParams.get("state") ?? "");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(
    `<!doctype html><title>Stand-in for Apple</title><h1>Stand-in for Apple's sign-in page</h1>
<form method="post" action="${action}"><input type="hidden" name="state" value="${state}"><input type="hidden" name="code" value="${code}"><button id="continue">Continue</button></form>
<form method="post" action="${action}"><input type="hidden" name="state" value="${state}"><input type="hidden" name="error" value="user_cancelled_authorize"><button id="cancel">Cancel</button></form>`);
});
await new Promise<void>((resolve) => standInApple.listen(applePort, "127.0.0.1", resolve));

/** A business in good standing and its owner's password login, as sign-up and onboarding leave them. */
async function seedOwner(name: string) {
  const email = `${name}@probe.test`;
  const merchant = await storage.createMerchant({
    name: `Probe ${name}`, businessName: `Probe ${name} Ltd`, businessType: "retail",
    email, phone: "021 555 0100", address: "1 Probe Street, Auckland",
  } as any);
  await storage.updateMerchantStatus(merchant.id, "active");
  await storage.updateMerchant(merchant.id, { onboardingCompleted: true, tutorialAutoEnabled: false } as any);
  const user = await createUser(email, OWNER_PASSWORD, merchant.id, "merchant");
  return { email, merchantId: merchant.id as number, userId: (user.userId ?? user.id) as number };
}

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

interface Seen { method: string; url: string; headers: Record<string, string> }
const seen: Seen[] = [];
const offMachine: string[] = [];
const pageErrors: string[] = [];
const addresses: string[] = [];

const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH, headless: true,
  // For this browser only: localhost is this machine, and appleid.apple.com is the stand-in above.
  args: [`--host-resolver-rules=MAP localhost 127.0.0.1, MAP appleid.apple.com 127.0.0.1:${applePort}`],
});

async function newContext(options: Parameters<typeof browser.newContext>[0]): Promise<BrowserContext> {
  const context = await browser.newContext({ ...options, ignoreHTTPSErrors: true });
  // Sandboxed Chromium has only loopback and reports itself offline; the app would cover itself with
  // "Connection Lost". A string, not a function: tsx wraps nested functions in a helper the page lacks.
  await context.addInitScript('Object.defineProperty(Navigator.prototype, "onLine", { get: function () { return true; } });');
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // This app, and the stand-in Apple page (which the resolver rule keeps on this machine).
    if (url.origin === base || url.origin === APPLE) return route.continue();
    offMachine.push(url.href);
    return route.abort();
  });
  context.on("request", (request) => {
    void request.allHeaders().then((headers) => seen.push({ method: request.method(), url: request.url(), headers })).catch(() => undefined);
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 200)));
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) addresses.push(frame.url()); });
  });
  return context;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 400));
const sessionAnswer = (page: Page) =>
  page.evaluate(async () => (await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })).json());
const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);
async function shown(page: Page, expected: string, timeout = 30_000): Promise<boolean> {
  return page.waitForFunction((text) => document.body.innerText.includes(text), expected, { timeout }).then(() => true, () => false);
}

async function openLogin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.getByTestId("input-email").waitFor({ timeout: 240_000 });
  return page;
}

const DEVICES = [
  { name: "phone", context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  { name: "tablet", context: { viewport: { width: 1194, height: 834 }, hasTouch: true } },
  { name: "desktop", context: { viewport: { width: 1440, height: 900 } } },
] as const;

try {
  for (const device of DEVICES) {
    const at = (text: string) => `${device.name}: ${text}`;

    // ── 1. The login page's two buttons. ─────────────────────────────────────────────────────────
    const visitor = await newContext(device.context);
    let page = await openLogin(visitor);
    const appleButton = page.getByTestId("button-apple-login");
    await appleButton.waitFor({ timeout: 30_000 }).catch(() => undefined);
    const google = await page.getByTestId("button-google-login").boundingBox();
    const apple = await appleButton.boundingBox().catch(() => null);
    check(at("the login page shows Continue with Apple, because the server says it is offered"),
      Boolean(apple) && (await appleButton.innerText()).trim() === "Continue with Apple");
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
    check(at("it is the same width and height as Google's, directly under it"),
      Boolean(google && apple) && near(google!.width, apple!.width) && near(google!.height, apple!.height) && near(google!.x, apple!.x)
        && apple!.y >= google!.y + google!.height - 0.5 && apple!.y - (google!.y + google!.height) <= 24,
      JSON.stringify({ google, apple }));
    check(at("both are at least 44 px tall"), Boolean(google && apple) && google!.height >= 44 && apple!.height >= 44);
    const colours = await appleButton.evaluate((button) => {
      const style = getComputedStyle(button);
      const mark = button.querySelector("svg")!.getBoundingClientRect();
      return { background: style.backgroundColor, colour: style.color, mark: { width: mark.width, height: mark.height } };
    });
    check(at("it is Apple's black with a white mark and words"),
      colours.background === "rgb(0, 0, 0)" && colours.colour === "rgb(255, 255, 255)" && colours.mark.width > 10 && colours.mark.height > 10,
      JSON.stringify(colours));
    if (out) await page.screenshot({ path: `${out}/login-${device.name}.png` });

    // ── 2. Signing in with Apple as someone TaptPay has never seen. ──────────────────────────────
    const newcomer: Person = { sub: `001234.${crypto.randomBytes(16).toString("hex")}.0123`, email: `newcomer.${device.name}@probe.test` };
    atApple = newcomer;
    await appleButton.click();
    await page.waitForURL(`${APPLE}/auth/authorize**`, { timeout: 60_000 });
    const asked = authorizeVisits.at(-1)!;
    check(at("the button sends the browser to Apple's sign-in page with this site's return address, a state and a nonce"),
      asked.searchParams.get("client_id") === SERVICES_ID && asked.searchParams.get("redirect_uri") === `${base}/api/auth/apple/callback`
        && asked.searchParams.get("response_mode") === "form_post" && /^[A-Za-z0-9_-]{43}$/.test(asked.searchParams.get("state") ?? "")
        && /^[A-Za-z0-9_-]{43}$/.test(asked.searchParams.get("nonce") ?? ""),
      asked.search.slice(0, 160));
    await page.locator("#continue").click();
    await page.waitForURL((url) => url.origin === base && !url.pathname.startsWith("/api/") && url.pathname !== "/login", { timeout: 120_000 }).catch(() => undefined);
    await settled();
    let posted = postsBack.at(-1);
    check(at("Apple's post back reaches the server as a cross-site form post from Apple's own origin"),
      posted?.origin === APPLE && posted?.site === "cross-site", JSON.stringify({ origin: posted?.origin, site: posted?.site }));
    check(at("the starting cookie came back with it"), posted?.cookies.includes(OAUTH_COOKIE) === true, posted?.cookies.join(","));
    let answer = await sessionAnswer(page);
    check(at("the newcomer is signed in to a new business under the email Apple verified"),
      answer.signedIn === true && answer.user?.email === newcomer.email, JSON.stringify({ signedIn: answer.signedIn, email: answer.user?.email, at: page.url() }));
    const firstBusiness = answer.user?.merchantId;
    check(at("the page is no longer the login page, and its address carries nothing of the sign-in"),
      !new URL(page.url()).pathname.startsWith("/login") && new URL(page.url()).search === "", page.url());
    const stored = await page.evaluate(() => JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), document.cookie]));
    check(at("page scripts hold no session and no Apple cookie"), !/taptpay-session|apple-oauth|apple-handoff|authToken/.test(stored), stored.slice(0, 160));

    // ── 3. Signing in again: Apple sends no email the second time. ───────────────────────────────
    const again = await newContext(device.context);
    page = await openLogin(again);
    atApple = { sub: newcomer.sub };
    await page.getByTestId("button-apple-login").click();
    await page.waitForURL(`${APPLE}/auth/authorize**`, { timeout: 60_000 });
    await page.locator("#continue").click();
    await page.waitForURL((url) => url.origin === base && !url.pathname.startsWith("/api/") && url.pathname !== "/login", { timeout: 120_000 }).catch(() => undefined);
    await settled();
    answer = await sessionAnswer(page);
    check(at("a later sign-in with the same Apple identity, and no email, opens the same business"),
      answer.signedIn === true && answer.user?.merchantId === firstBusiness && answer.user?.email === newcomer.email,
      JSON.stringify({ signedIn: answer.signedIn, merchantId: answer.user?.merchantId, first: firstBusiness }));
    await again.close();
    await visitor.close();

    // ── 4. A signed-in owner connects Apple from Settings. ───────────────────────────────────────
    const owner = await seedOwner(`owner-${device.name}`);
    const signedIn = await newContext(device.context);
    page = await openLogin(signedIn);
    await page.getByTestId("input-email").fill(owner.email);
    await page.getByTestId("input-password").fill(OWNER_PASSWORD);
    await page.getByTestId("button-login").click();
    await page.waitForURL("**/dashboard", { timeout: 120_000 });
    await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const openAccount = async () => {
      if (await page.getByTestId("apple-connection").isVisible().catch(() => false)) return;
      if (device.name === "phone") await page.getByTestId("settings-row-account").click({ timeout: 60_000 });
      else await page.getByRole("button", { name: "Account", exact: true }).click({ timeout: 60_000 });
    };
    await openAccount();
    const row = page.getByTestId("apple-connection");
    await row.waitFor({ timeout: 60_000 }).catch(() => undefined);
    check(at("Settings shows the owner a Sign in with Apple row, not connected"),
      (await row.innerText().catch(() => "")).includes("Sign in with Apple") && (await row.innerText().catch(() => "")).includes("Not connected"),
      (await row.innerText().catch(() => "no row")).replace(/\s+/g, " ").slice(0, 120));
    const field = page.getByLabel("Current password for Apple");
    const button = page.getByTestId("button-apple-connection");
    // The phone's Account page slides in from the right: measure once it has come to rest.
    await new Promise((resolve) => setTimeout(resolve, 700));
    const rowBox = await row.boundingBox();
    const viewport = page.viewportSize()!;
    check(at("the row fits the screen: nothing runs off either side"),
      Boolean(rowBox) && rowBox!.x >= 0 && rowBox!.x + rowBox!.width <= viewport.width + 0.5, JSON.stringify(rowBox));
    if (device.name === "phone") {
      const boxes = [await field.boundingBox(), await button.boundingBox()];
      check(at("the field and the button are at least 44 px tall"), boxes.every((box) => Boolean(box) && box!.height >= 44), JSON.stringify(boxes.map((box) => box?.height)));
    }
    if (out) await page.screenshot({ path: `${out}/settings-apple-not-connected-${device.name}.png` });

    // A wrong password: said, and the page stays.
    await field.fill("Wrong-password-1");
    await button.click();
    check(at("a wrong password is refused in the server's words, and the page stays on Settings"),
      await shown(page, "Current password is incorrect") && new URL(page.url()).pathname === "/settings");
    const exchangesBefore = exchanges.length;

    // Cancelling at Apple.
    const person: Person = { sub: `001234.${crypto.randomBytes(16).toString("hex")}.0123`, email: `apple.${device.name}@probe.test` };
    atApple = person;
    await field.fill(OWNER_PASSWORD);
    await button.click();
    await page.waitForURL(`${APPLE}/auth/authorize**`, { timeout: 60_000 });
    await page.locator("#cancel").click();
    await page.waitForURL((url) => url.origin === base && url.pathname === "/settings", { timeout: 120_000 }).catch(() => undefined);
    check(at("cancelling at Apple comes back to Settings and says it was not connected"),
      await shown(page, "Apple was not connected") && await shown(page, "You cancelled at Apple."));
    check(at("the word is out of the address"), new URL(page.url()).search === "", page.url());
    check(at("a cancel asked Apple's servers nothing"), exchanges.length === exchangesBefore);

    // Connecting.
    await openAccount();
    await row.waitFor({ timeout: 60_000 });
    await field.fill(OWNER_PASSWORD);
    await button.click();
    await page.waitForURL(`${APPLE}/auth/authorize**`, { timeout: 60_000 });
    await page.locator("#continue").click();
    await page.waitForURL((url) => url.origin === base && url.pathname === "/settings", { timeout: 120_000 }).catch(() => undefined);
    await settled();
    posted = postsBack.at(-1);
    check(at("on a connect, Apple's post back carries the starting cookie and NOT the session cookie"),
      posted?.origin === APPLE && posted?.cookies.includes(OAUTH_COOKIE) === true && !posted.cookies.includes(SESSION_COOKIE),
      posted?.cookies.join(","));
    check(at("back on Settings it says Apple is connected"), await shown(page, "Apple connected"));
    await row.waitFor({ timeout: 60_000 }).catch(() => undefined);
    const connectedText = (await row.innerText().catch(() => "")).replace(/\s+/g, " ");
    check(at("the Account section is open on the row, which shows the address Apple gave"),
      connectedText.includes("Connected") && connectedText.includes(person.email!), connectedText.slice(0, 140));
    check(at("the owner is still signed in, as the same login"),
      (answer = await sessionAnswer(page)).signedIn === true && answer.user?.email === owner.email);
    check(at("the address carries nothing of the connect"), new URL(page.url()).search === "", page.url());
    const identity = await (storage as any).getAppleIdentityForLogin(owner.userId);
    check(at("the identity is that owner's login's"), identity?.subject === person.sub && identity?.userId === owner.userId);
    if (out) await page.screenshot({ path: `${out}/settings-apple-connected-${device.name}.png` });

    // Apple now signs that owner in.
    const viaApple = await newContext(device.context);
    const other = await openLogin(viaApple);
    atApple = { sub: person.sub };
    await other.getByTestId("button-apple-login").click();
    await other.waitForURL(`${APPLE}/auth/authorize**`, { timeout: 60_000 });
    await other.locator("#continue").click();
    await other.waitForURL("**/dashboard", { timeout: 120_000 }).catch(() => undefined);
    await settled();
    const viaAppleAnswer = await sessionAnswer(other);
    check(at("Sign in with Apple now opens that owner's business"),
      viaAppleAnswer.signedIn === true && viaAppleAnswer.user?.merchantId === owner.merchantId && viaAppleAnswer.user?.email === owner.email,
      JSON.stringify({ merchantId: viaAppleAnswer.user?.merchantId, expected: owner.merchantId }));
    await viaApple.close();

    // Disconnecting.
    await field.fill(OWNER_PASSWORD);
    await button.click();
    check(at("disconnecting says so, and the row goes back to not connected"),
      await shown(page, "Apple disconnected") && await page.waitForFunction(
        () => document.querySelector('[data-testid="apple-connection"]')?.textContent?.includes("Not connected") === true, undefined, { timeout: 30_000 },
      ).then(() => true, () => false));
    check(at("the identity is gone"), (await (storage as any).getAppleIdentityForLogin(owner.userId)) === undefined);
    await signedIn.close();
  }

  // ── Across everything above. ───────────────────────────────────────────────────────────────────
  await settled();
  const secretLooking = [...seen.map((request) => request.url), ...addresses, ...offMachine]
    .filter((url) => !url.startsWith(`${APPLE}/auth/authorize`))
    .filter((url) => /eyJ[A-Za-z0-9_-]{10,}\.|[?&#](code|id_token|token|state|nonce)=/i.test(url));
  check("no code, token, state or nonce appeared in any address but Apple's own sign-in page", secretLooking.length === 0, secretLooking.slice(0, 3).join(", "));
  const logged = requestLog.filter((line) => /eyJ[A-Za-z0-9_-]{10,}\./.test(line) || [...codes.keys()].some((code) => line.includes(code)));
  check("no token or code appeared in the server's request log", logged.length === 0, `${requestLog.length} lines`);
  check("every exchange named this site's return address and Services ID, and only issued codes were honoured",
    exchanges.length > 0 && exchanges.every((made) => made.known && made.redirectUri === `${base}/api/auth/apple/callback` && made.clientId === SERVICES_ID),
    `${exchanges.length} exchanges`);
  check("no page raised an error", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  console.log(`INFO ${seen.length} requests on this machine; ${offMachine.length} aborted off it; ${authorizeVisits.length} visits to the stand-in Apple page; ${exchanges.length} exchanges`);
} finally {
  await browser.close();
  server.closeAllConnections?.();
  server.close();
  standInApple.closeAllConnections?.();
  standInApple.close();
  rmSync(certDir, { recursive: true, force: true });
}
console.log(failed ? `APPLE BROWSER PROBE: ${failed} FAILED` : "APPLE BROWSER PROBE: all passed");
process.exit(failed ? 1 : 0);
