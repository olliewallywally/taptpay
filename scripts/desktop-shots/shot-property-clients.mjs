/* Screenshot the desktop property clients directory (2b): list, search, scope
   filter and the add-tenant modal — desktop + tablet. */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const OUT = "/tmp/taptpay-desktop-2b";
const MERCHANT_ID = 999999;

const D = 24 * 3600_000;
const now = Date.now();
const at = (daysAgo, hh = 10) => {
  const d = new Date(now - daysAgo * D);
  d.setHours(hh, 0, 0, 0);
  return d.toISOString();
};
const ahead = (days) => new Date(now + days * D).toISOString();

const TENANTS = [
  { id: "t1", firstName: "Josh", lastName: "Smith", propertyAddress: "12 Kauri Road", status: "active", phone: "0221111111", email: "josh@example.com" },
  { id: "t2", firstName: "Mia", lastName: "Chen", propertyAddress: "5 Bellbird Rise", status: "active", phone: "0222222222", email: "mia@example.com" },
  { id: "t3", firstName: "Tane", lastName: "Walker", propertyAddress: "88 Harbour View", status: "active", phone: "0223333333", email: "tane@example.com" },
  { id: "t4", firstName: "Ruby", lastName: "Nolan", propertyAddress: "12 Kauri Road", status: "active", phone: "0224444444", email: "ruby@example.com" },
  { id: "t5", firstName: "Ari", lastName: "Archived", propertyAddress: "99 Archived Place", status: "archived", phone: "0225555555", email: "ari@example.com" },
];

const INVOICES = [
  /* collected this week */
  { id: "i1", tenantProfileId: "t1", amountCents: 65000, status: "paid", dueAt: at(6), paidAt: at(6), createdAt: at(8), kind: "rent" },
  { id: "i2", tenantProfileId: "t2", amountCents: 80000, status: "paid", dueAt: at(5), paidAt: at(5), createdAt: at(7), kind: "rent" },
  { id: "i3", tenantProfileId: "t3", amountCents: 52000, status: "paid_external", dueAt: at(3), paidAt: at(3), createdAt: at(5), kind: "rent" },
  { id: "i4", tenantProfileId: "t4", amountCents: 61000, status: "paid", dueAt: at(1), paidAt: at(1), createdAt: at(3), kind: "rent" },
  { id: "i5", tenantProfileId: "t1", amountCents: 65000, status: "paid", dueAt: at(13), paidAt: at(13), createdAt: at(15), kind: "rent" },
  /* attention needed */
  { id: "i6", tenantProfileId: "t2", amountCents: 80000, status: "overdue", dueAt: at(4), createdAt: at(11), kind: "rent" },
  { id: "i7", tenantProfileId: "t3", amountCents: 52000, status: "overdue", dueAt: at(9), createdAt: at(16), kind: "rent" },
  { id: "i8", tenantProfileId: "t4", amountCents: 24000, status: "failed", dueAt: at(2), createdAt: at(4), kind: "charge", description: "water bill" },
  /* due in the next week */
  { id: "i9", tenantProfileId: "t1", amountCents: 65000, status: "sent", dueAt: ahead(2), createdAt: at(1), kind: "rent" },
  { id: "i10", tenantProfileId: "t2", amountCents: 80000, status: "sent", dueAt: ahead(5), createdAt: at(1), kind: "rent" },
];

const SCHEDULES = [
  { id: "s1", tenantProfileId: "t1", amountCents: 65000, frequency: "weekly", status: "active", nextRunDate: ahead(2) },
  { id: "s2", tenantProfileId: "t2", amountCents: 80000, frequency: "weekly", status: "active", nextRunDate: ahead(5) },
];

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
  await page.route("**/api/property/tenants", (r) => json(r, TENANTS));
  await page.route("**/api/property/invoices", (r) => json(r, INVOICES));
  await page.route("**/api/property/schedules", (r) => json(r, SCHEDULES));
  await page.route(`**/api/merchants/${MERCHANT_ID}/**`, (r) => json(r, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (r) =>
    json(r, { id: MERCHANT_ID, businessName: "Wallace Property", status: "active" }));
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (r) =>
    json(r, { id: MERCHANT_ID, businessName: "Wallace Property", status: "active" }));
}

async function shoot(browser, label, ctxOpts) {
  const context = await browser.newContext({ ...ctxOpts, deviceScaleFactor: 1, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label} console: ${m.text()}`));
  await installMocks(page);

  await page.goto(`${BASE_URL}/property/tenants`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(800);

  const liveCount = page.getByRole("status");
  const assertLiveCount = async (expected) => {
    const actual = await liveCount.getAttribute("aria-label");
    if (actual !== expected) {
      throw new Error(`Expected live tenant count "${expected}", received "${actual}"`);
    }
  };

  await assertLiveCount("4 active tenants");
  if ((await liveCount.getAttribute("aria-live")) !== "polite") {
    throw new Error("Expected the tenant count to be an aria-live polite status");
  }
  if ((await liveCount.getAttribute("aria-atomic")) !== "true") {
    throw new Error("Expected the tenant count announcement to be atomic");
  }
  if ((await page.locator(".pc-row").count()) !== 4) {
    throw new Error("Expected only the four active tenants in the directory");
  }

  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  };

  await shot("1-directory");

  await page.getByLabel("search tenants").fill("kauri");
  await assertLiveCount("4 active tenants");
  if ((await page.locator(".pc-row").count()) !== 2) {
    throw new Error("Expected search to affect visible rows only");
  }
  await shot("2-search");
  await page.getByLabel("search tenants").fill("");

  await page.getByRole("button", { name: /all properties scope/i }).click();
  if (await page.getByRole("option", { name: "99 Archived Place", exact: true }).count()) {
    throw new Error("Archived-only property leaked into the active scope menu");
  }
  await page.getByRole("option", { name: "5 Bellbird Rise" }).click();
  await assertLiveCount("1 active tenant");
  if ((await page.locator(".pc-row").count()) !== 1) {
    throw new Error("Expected the property scope count and rows to agree");
  }
  await shot("3-scoped");
  await page.getByRole("button", { name: /scope/i }).click();
  await page.getByRole("option", { name: "all properties" }).click();

  /* add-tenant modal: empty (invalid), then filled (valid) */
  await page.getByRole("button", { name: "add tenant" }).click();
  await shot("4-add-empty");
  await page.getByLabel("first name").fill("Ana");
  await page.getByLabel("last name").fill("Reeves");
  await page.getByLabel("property address").fill("9 Totara Lane");
  await page.getByRole("button", { name: "sms", exact: true }).click();
  await shot("5-add-needs-phone");
  await page.getByLabel("phone").fill("021 555 0134");
  await shot("6-add-valid");

  await context.close();
  return errors;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const a = await shoot(browser, "desktop", { viewport: { width: 1440, height: 900 } });
  const b = await shoot(browser, "tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true });
  await browser.close();
  const errors = [...a, ...b];
  if (errors.length) {
    throw new Error(`PAGE ERRORS:\n${errors.join("\n")}`);
  }
  console.log("no page errors");
  console.log(`shots → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
