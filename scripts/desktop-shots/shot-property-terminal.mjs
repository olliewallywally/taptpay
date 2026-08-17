/* Screenshot the desktop property terminal (2c): every rail mode — request,
   tenant picker, keypad, bill and mark-as-paid. */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const OUT = "/tmp/taptpay-desktop-2c";
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
];

/* Statuses are the schema's own (`shared/schema.ts:1018`) — there is no "sent"
   or "failed" row in production. */
const RAW_INVOICES = [
  /* collected this week */
  { id: "i1", tenantProfileId: "t1", amountCents: 65000, status: "paid", dueAt: at(6), paidAt: at(6), createdAt: at(8), kind: "rent" },
  { id: "i2", tenantProfileId: "t2", amountCents: 80000, status: "paid", dueAt: at(5), paidAt: at(5), createdAt: at(7), kind: "rent" },
  { id: "i3", tenantProfileId: "t3", amountCents: 52000, status: "paid_external", dueAt: at(3), paidAt: at(3), createdAt: at(5), kind: "rent" },
  { id: "i4", tenantProfileId: "t4", amountCents: 61000, status: "paid", dueAt: at(1), paidAt: at(1), createdAt: at(3), kind: "rent" },
  { id: "i5", tenantProfileId: "t1", amountCents: 65000, status: "paid", dueAt: at(13), paidAt: at(13), createdAt: at(15), kind: "rent" },
  /* attention needed */
  { id: "i6", tenantProfileId: "t2", amountCents: 80000, status: "overdue", dueAt: at(4), createdAt: at(11), kind: "rent" },
  { id: "i7", tenantProfileId: "t3", amountCents: 52000, status: "overdue", dueAt: at(9), createdAt: at(16), kind: "rent" },
  { id: "i8", tenantProfileId: "t4", amountCents: 24000, status: "dispatch_failed", dueAt: at(2), createdAt: at(4), kind: "charge", chargeType: "utilities", description: "water bill" },
  /* due in the next week */
  { id: "i9", tenantProfileId: "t1", amountCents: 65000, status: "dispatched", dueAt: ahead(2), createdAt: at(1), kind: "rent" },
  { id: "i10", tenantProfileId: "t2", amountCents: 80000, status: "dispatched", dueAt: ahead(5), createdAt: at(1), kind: "rent" },
  /* a 4-way split with 3 shares paid: $150 of $600 is still owed */
  { id: "i11", tenantProfileId: "t3", amountCents: 60000, status: "dispatched", dueAt: ahead(4), createdAt: at(2), kind: "rent", splitEnabled: true, splitCount: 4, splitPaidCount: 3 },
  /* queued but not yet dispatched — reads "awaiting send", not "sent" */
  { id: "i12", tenantProfileId: "t4", amountCents: 61000, status: "pending_dispatch", dueAt: ahead(6), createdAt: at(0), kind: "rent" },
];

/* Mirrors the enrichment `GET /api/property/invoices` performs
   (`server/routes.ts:7433-7445`), so the fixtures exercise the same fields. */
const INVOICES = RAW_INVOICES.map((inv) => {
  const t = TENANTS.find((x) => x.id === inv.tenantProfileId);
  const isSplit = inv.splitEnabled && inv.splitCount > 1;
  const base = isSplit ? Math.floor(inv.amountCents / inv.splitCount) : 0;
  return {
    ...inv,
    tenantName: t ? `${t.firstName} ${t.lastName}` : "—",
    propertyAddress: t ? t.propertyAddress : "—",
    owingCents: isSplit ? inv.amountCents - (inv.splitPaidCount || 0) * base : inv.amountCents,
    sharesLeft: isSplit ? inv.splitCount - (inv.splitPaidCount || 0) : null,
  };
});

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
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const at = m.location()?.url;
    errors.push(`${label} console: ${m.text()}${at ? ` (${at})` : ""}`);
  });
  await installMocks(page);

  await page.goto(`${BASE_URL}/property/terminal`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(800);

  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  };

  await shot("1-request-empty");

  /* pick a tenant — seeds the amount from their next unpaid invoice */
  await page.getByRole("button", { name: "select tenant" }).click();
  await shot("2-tenant-picker");
  /* Scoped to the picker — the request list's rows carry the same name. */
  await page.locator(".pt-tenant-cards").getByRole("button", { name: /Mia Chen/ }).click();
  await shot("3-request-seeded");

  /* recurring frequency */
  await page.getByRole("button", { name: "weekly", exact: true }).click();
  await shot("4-request-weekly");

  /* keypad */
  await page.getByRole("button", { name: "keypad" }).click();
  /* An empty keypad cannot be confirmed — the tick dims rather than sending $0. */
  await shot("5-keypad-empty");
  for (const k of ["7", "5", "0"]) await page.getByRole("button", { name: k, exact: true }).click();
  await shot("5-keypad");
  await page.getByRole("button", { name: "confirm amount" }).click();

  /* bill mode */
  await page.getByRole("button", { name: "send bill" }).first().click();
  await shot("6-bill");
  await page.getByRole("button", { name: "late fee" }).click();
  await shot("7-bill-late-fee");

  /* mark as paid */
  await page.getByRole("button", { name: "mark as paid" }).click();
  await shot("8-mark-paid");

  /* row actions: the anchored popover and its in-surface cancel confirmation */
  await page.getByRole("button", { name: "actions for Mia Chen, overdue" }).click();
  await shot("9-row-menu");
  await page.getByRole("menuitem", { name: "cancel invoice" }).click();
  await shot("10-row-menu-cancel");
  await page.getByRole("menuitem", { name: "back" }).click();
  await page.getByRole("menuitem", { name: "close" }).click();

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
