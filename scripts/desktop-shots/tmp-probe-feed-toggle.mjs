import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const MERCHANT_ID = 999999;

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
  const D = 24 * 3600_000;
  const now = Date.now();
  const ahead = (days) => new Date(now + days * D).toISOString();
  const TENANTS = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i}`, firstName: `First${i}`, lastName: `Last${i}`,
    propertyAddress: `${i} Test Road`, status: "active", preferredChannel: "email",
    phone: "0221111111", email: `t${i}@example.com`,
  }));
  const INVOICES = TENANTS.map((t, i) => ({
    id: `i${i}`, tenantProfileId: t.id, tenantName: `First${i} Last${i}`,
    amountCents: 50000, status: "sent", dueAt: ahead(2),
    createdAt: new Date(now - i * 1000).toISOString(), kind: "rent",
  }));
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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
  serviceWorkers: "block",
});
const page = await context.newPage();
await installMocks(page);
await page.goto(`${BASE_URL}/property/terminal`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const sample = async () => {
  return page.evaluate(() => {
    const hero = document.querySelector(".tp-home-hero");
    const stack = document.querySelector(".tp-home-stack");
    const heroInner = document.querySelector(".tp-feed-hero-inner");
    const heroRect = hero?.getBoundingClientRect();
    const stackRect = stack?.getBoundingClientRect();
    return {
      heroTop: heroRect?.top,
      heroH: heroRect?.height,
      heroPadding: hero ? getComputedStyle(hero).padding : null,
      heroInnerOpacity: heroInner ? getComputedStyle(heroInner).opacity : null,
      stackTop: stackRect?.top,
      stackH: stackRect?.height,
      stackPosition: stack ? getComputedStyle(stack).position : null,
      stackZ: stack ? getComputedStyle(stack).zIndex : null,
      stackInlineStyle: stack?.getAttribute("style"),
      stackTopCss: stack ? getComputedStyle(stack).top : null,
      stackTransform: stack ? getComputedStyle(stack).transform : null,
      stackCount: document.querySelectorAll(".tp-home-stack").length,
      offsetParentTag: stack?.offsetParent?.className,
      offsetParentRectTop: stack?.offsetParent?.getBoundingClientRect().top,
      parentTag: stack?.parentElement?.className,
    };
  });
};

console.log("BEFORE toggle:", await sample());

await page.click('button[aria-expanded]');

const samples = [];
const start = Date.now();
let shot300 = false, shot550 = false;
while (Date.now() - start < 700) {
  const elapsed = Date.now() - start;
  if (elapsed > 250 && !shot300) { shot300 = true; await page.screenshot({ path: "/tmp/taptpay-mobile-lists/feed-mid-open.png" }); }
  if (elapsed > 500 && !shot550) { shot550 = true; await page.screenshot({ path: "/tmp/taptpay-mobile-lists/feed-late-open.png" }); }
  samples.push({ t: elapsed, ...(await sample()) });
  await page.waitForTimeout(40);
}
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/taptpay-mobile-lists/feed-settled-open.png" });
console.log("DURING toggle (open):");
samples.forEach((s) => console.log(JSON.stringify(s)));

await page.waitForTimeout(400);
console.log("SETTLED (open):", await sample());

// now close it
await page.click('button[aria-expanded]');
const samples2 = [];
const start2 = Date.now();
while (Date.now() - start2 < 700) {
  samples2.push({ t: Date.now() - start2, ...(await sample()) });
  await page.waitForTimeout(40);
}
console.log("DURING toggle (close):");
samples2.forEach((s) => console.log(JSON.stringify(s)));

await browser.close();
