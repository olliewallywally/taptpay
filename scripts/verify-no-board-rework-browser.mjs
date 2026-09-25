// Real-Chromium check of the no-board rework on a production build (vite preview), with the
// API mocked by the shared retail fixtures. Exit 0 only if every check passes.
//   npx vite build --outDir "$PWD/<build>" && npx vite preview --outDir "$PWD/<build>" --host 127.0.0.1 --port 5199
//   BASE=http://127.0.0.1:5199 OUT=<dir> node scripts/verify-no-board-rework-browser.mjs
import { chromium } from "playwright";
import { CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";

const base = process.env.BASE;
const out = process.env.OUT;
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });

async function openPage(label, width) {
  const opened = await newRetailPage(browser, label, {
    viewport: { width, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce",
  });
  const local = new URL(base).origin;
  await opened.page.route((url) => url.origin !== local, (route) => route.abort("blockedbyclient"));
  await opened.page.addInitScript(() => Object.defineProperty(Navigator.prototype, "onLine", { get: () => true }));
  // The probe blocks every outside host (fonts, analytics, the Replit banner): those refusals
  // are its own doing. The board page's mocked event stream closes after one event, which
  // EventSource reports as an error before reconnecting. Neither is the app's fault.
  const probeArtifact = (message) =>
    message.includes("ERR_BLOCKED_BY_CLIENT") || message.includes("Customer SSE connection error");
  const appErrors = () => opened.errors.filter((message) => !probeArtifact(message));
  const requests = [];
  opened.page.on("request", (request) => requests.push({ url: request.url(), headers: request.headers() }));
  return { ...opened, requests, appErrors, rawErrors: opened.errors };
}

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// 1. A customer holding the old business-wide address: the notice, and nothing read.
for (const width of [320, 390]) {
  const { context, page, appErrors, requests } = await openPage(`customer-${width}`, width);
  await page.goto(`${base}/pay/${MERCHANT_ID}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  check(`customer ${width}: notice shown`, text.includes("Ask for your payment link") &&
    text.includes("Each sale now has its own payment link. Ask the business to show you the QR code for your sale."));
  check(`customer ${width}: no sale read, no feed`, !requests.some((r) => /active-transaction|\/events/.test(r.url)),
    requests.filter((r) => /active-transaction|\/events/.test(r.url)).map((r) => r.url).join(" "));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`customer ${width}: no sideways scroll`, overflow <= 0, `overflow ${overflow}px`);
  check(`customer ${width}: no page errors`, appErrors().length === 0, appErrors().join(" | "));
  await page.screenshot({ path: `${out}/customer-notice-${width}.png` });
  await context.close();
}

// 2. A board's customer page still waits on its board's sale.
{
  const { context, page, appErrors, requests } = await openPage("board-390", 390);
  await page.route(`**/api/merchants/${MERCHANT_ID}/active-transaction?stoneId=7`, (route) => json(route, null));
  await page.route(`**/api/merchants/${MERCHANT_ID}/events?stoneId=7`, (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body: 'data: {"type":"connected","audience":"board","stoneId":7}\n\n' }));
  await page.goto(`${base}/pay/${MERCHANT_ID}/stone/7`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const text = await page.locator("body").innerText();
  check("board page: waits for its sale", text.includes("Waiting for Payment"));
  check("board page: reads its board's sale", requests.some((r) => r.url.includes("active-transaction?stoneId=7")));
  check("board page: no page errors", appErrors().length === 0, appErrors().join(" | "));
  await context.close();
}

// 3. The phone terminal with no board: signed-in current-sale read; share screen honest.
for (const width of [320, 390]) {
  const { context, page, appErrors, requests } = await openPage(`terminal-${width}`, width);
  await page.route(`**/api/merchants/${MERCHANT_ID}/active-transaction`, (route) => json(route, null));
  await page.route(`**/api/merchants/${MERCHANT_ID}/tapt-stones`, (route) => json(route, []));
  await page.goto(`${base}/terminal`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const read = requests.find((r) => r.url.endsWith(`/api/merchants/${MERCHANT_ID}/active-transaction`));
  check(`terminal ${width}: current sale read signed in`, read && /^Bearer /.test(read.headers.authorization ?? ""),
    read ? `authorization: ${read.headers.authorization ?? "none"}` : "no read");
  await page.getByRole("button", { name: "share", exact: true }).click();
  await page.waitForTimeout(800);
  const text = await page.locator("body").innerText();
  check(`terminal ${width}: share screen says there is no link yet`, text.includes("no payment link to share yet"));
  check(`terminal ${width}: no copy button, no demo link`,
    (await page.getByRole("button", { name: "copy link", exact: true }).count()) === 0 &&
    !(await page.content()).includes("demo-abc123"));
  check(`terminal ${width}: never the business-wide address`, !(await page.content()).match(new RegExp(`/pay/${MERCHANT_ID}(?!/stone)`)));
  check(`terminal ${width}: no page errors`, appErrors().length === 0, appErrors().join(" | "));
  await page.screenshot({ path: `${out}/terminal-share-no-link-${width}.png` });
  await context.close();
}

await browser.close();
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? `  — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
