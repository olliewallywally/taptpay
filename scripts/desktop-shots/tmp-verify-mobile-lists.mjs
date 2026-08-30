/* Ad-hoc: confirm the property lists animate on the MOBILE device class. */
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const MERCHANT_ID = 999999;
const OUT = "/tmp/taptpay-mobile-lists";

const D = 24 * 3600_000;
const now = Date.now();
const ahead = (days) => new Date(now + days * D).toISOString();

const TENANTS = Array.from({ length: 20 }, (_, i) => ({
  id: `t${i}`,
  firstName: `First${i}`,
  lastName: `Last${i}`,
  propertyAddress: `${i} Test Road`,
  status: "active",
  preferredChannel: "email",
  phone: "0221111111",
  email: `t${i}@example.com`,
}));
const INVOICES = TENANTS.map((t, i) => ({
  id: `i${i}`,
  tenantProfileId: t.id,
  tenantName: `First${i} Last${i}`,
  amountCents: 50000,
  status: "sent",
  dueAt: ahead(2),
  createdAt: new Date(now - i * 1000).toISOString(),
  kind: "rent",
}));

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function installMocks(page) {
  await page.addInitScript(({ merchantId }) => {
    const payload = window.btoa(JSON.stringify({ userId: 1, email: "shot@example.invalid", merchantId, role: "owner" }));
    localStorage.setItem("authToken", `shot.${payload}.dummy`);
    localStorage.setItem("merchantId", String(merchantId));
    localStorage.setItem("taptMode", "property");
  }, { merchantId: MERCHANT_ID });

  await page.route("**/api/auth/me", (r) =>
    json(r, { user: { id: 1, email: "shot@example.invalid", merchantId: MERCHANT_ID, role: "owner", onboardingCompleted: true } }));
  await page.route("**/api/tutorial/state", (r) => json(r, { generation: 1, autoEnabled: false, pageCount: 20, progress: {} }));
  await page.route("**/api/tutorial/**", (r) => json(r, {}));
  await page.route("**/api/property/tenants**", (r) => json(r, TENANTS));
  await page.route("**/api/property/invoices**", (r) => json(r, INVOICES));
  await page.route("**/api/property/schedules**", (r) => json(r, []));
  await page.route("**/api/push/**", (r) => json(r, {}));
  await page.route("**/api/subscription**", (r) => json(r, { status: "active" }));
  await page.route(`**/api/merchants/${MERCHANT_ID}/**`, (r) => json(r, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (r) =>
    json(r, { id: MERCHANT_ID, businessName: "Wallace Property", status: "active" }));
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (r) =>
    json(r, { id: MERCHANT_ID, businessName: "Wallace Property", status: "active" }));
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
// iPhone-ish: min(width,height) < 700 => classifyDevice returns "mobile"
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
  serviceWorkers: "block",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await installMocks(page);

/* ── 1. mobile tenant directory (page-level scroll) ── */
await page.goto(`${BASE_URL}/property/tenants`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const deviceClass = await page.evaluate(() => {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const w = window.innerWidth, h = window.innerHeight;
  if (Math.min(w, h) < 700 || (coarse && w < 768)) return "mobile";
  if (coarse) return "tablet";
  return w >= 1024 ? "desktop" : "tablet";
});
console.log("device class:", deviceClass);

const rows = page.locator(".tdir-row");
console.log("tdir rows:", await rows.count());

// A row far down the page should be out of view => scaled down + transparent.
const lastRow = rows.last();
console.log("last tdir row (offscreen) opacity:", await lastRow.evaluate((el) => getComputedStyle(el).opacity));
console.log("last tdir row (offscreen) transform:", await lastRow.evaluate((el) => getComputedStyle(el).transform));

const firstRow = rows.first();
console.log("first tdir row (in view) opacity:", await firstRow.evaluate((el) => getComputedStyle(el).opacity));
console.log("first tdir row (in view) transform:", await firstRow.evaluate((el) => getComputedStyle(el).transform));

await page.screenshot({ path: `${OUT}/1-tenant-directory.png`, fullPage: false });

// Scroll the page down; the previously-offscreen row should settle to scale 1.
await lastRow.scrollIntoViewIfNeeded();
await page.waitForTimeout(700);
console.log("last tdir row AFTER scrolling into view opacity:", await lastRow.evaluate((el) => getComputedStyle(el).opacity));
console.log("last tdir row AFTER scrolling into view transform:", await lastRow.evaluate((el) => getComputedStyle(el).transform));
await page.screenshot({ path: `${OUT}/2-tenant-directory-scrolled.png` });

/* ── 2. mobile terminal: active stack ── */
await page.goto(`${BASE_URL}/property/terminal`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);

const stackScroll = page.locator(".tp-stack-scroll");
console.log("\nactive stack container present:", await stackScroll.count());
const stackRows = page.locator(".tp-stack-row");
console.log("active stack rows:", await stackRows.count());
if (await stackRows.count()) {
  const r0 = stackRows.first();
  console.log("stack row 0 opacity:", await r0.evaluate((el) => getComputedStyle(el).opacity));
  console.log("stack row 0 transform:", await r0.evaluate((el) => getComputedStyle(el).transform));
  console.log("stack row 0 animationName (want 'none'):", await r0.evaluate((el) => getComputedStyle(el).animationName));
  const rl = stackRows.last();
  console.log("stack row LAST (likely clipped) opacity:", await rl.evaluate((el) => getComputedStyle(el).opacity));
}
const wrapCount = await page.locator(".dt-scroll-wrap").count();
console.log("dt-scroll-wrap count on terminal:", wrapCount);
const grad = page.locator(".dt-scroll-gradient-bottom").first();
if (await grad.count()) {
  console.log("bottom gradient opacity:", await grad.evaluate((el) => getComputedStyle(el).opacity));
  console.log("bottom gradient background:", await grad.evaluate((el) => getComputedStyle(el).backgroundImage));
}
await page.screenshot({ path: `${OUT}/3-terminal-active-stack.png` });

console.log("\nerrors:", errors.slice(0, 10));
await browser.close();
