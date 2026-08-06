/* Screenshot the desktop settings screen (4e): each accordion section open,
   the card form, and the vertical switcher, at desktop and tablet sizes. */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const OUT = "/tmp/taptpay-desktop-4e";
const MERCHANT_ID = 999999;

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const MERCHANT = {
  id: MERCHANT_ID,
  businessName: "Ollies Fresh Coffee",
  status: "active",
  email: "hello@olliesfresh.co.nz",
  phone: "022 459 0153",
  address: "14 Vivian St, Wellington",
  gstNumber: "123-456-789",
  bankAccountNumber: "02-0123-0456789-00",
  dailyGoal: "500.00",
  gstRegistered: true,
  paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}`,
};

const SUBSCRIPTION = {
  subscription: {
    tier: "paid",
    status: "active",
    billingFrequency: "monthly",
    nextBillingDate: new Date(Date.now() + 4 * 24 * 3600_000).toISOString(),
    unbilledTransactionCount: 128,
    unbilledAmount: "12.80",
  },
};

async function installMocks(page, { withCard = true } = {}) {
  await page.addInitScript(({ merchantId }) => {
    const payload = window.btoa(JSON.stringify({ userId: 1, email: "shot@example.invalid", merchantId, role: "merchant" }));
    localStorage.setItem("authToken", `shot.${payload}.dummy`);
    localStorage.setItem("merchantId", String(merchantId));
    localStorage.setItem("taptMode", "retail");
  }, { merchantId: MERCHANT_ID });

  await page.route("**/api/auth/me", (r) =>
    json(r, { user: { id: 1, email: "shot@example.invalid", merchantId: MERCHANT_ID, role: "merchant", onboardingCompleted: true } }));
  await page.route("**/api/tutorial/state", (r) => json(r, { generation: 1, autoEnabled: false, pageCount: 20, progress: {} }));
  await page.route("**/api/tutorial/**", (r) => json(r, {}));
  await page.route("**/api/subscription", (r) => json(r, SUBSCRIPTION));
  await page.route("**/api/billing/card", (r) =>
    json(r, withCard ? { ready: true, card: { brand: "visa", last4: "4021", expiry: "08/29" } } : { ready: false, card: null }));
  await page.route("**/api/push/capabilities", (r) => json(r, { webPush: { available: true }, nativePush: { available: false } }));
  await page.route("**/api/push/status", (r) => json(r, { subscribed: false }));
  await page.route("**/api/push/preferences", (r) => json(r, {
    preferences: { paymentReceived: true, dailyPayoutSummary: true, failedPaymentAlerts: false },
  }));
  await page.route(`**/api/merchants/${MERCHANT_ID}/transactions`, (r) => json(r, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}/stock-items`, (r) => json(r, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}/tapt-stones`, (r) => json(r, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (r) => json(r, MERCHANT));
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (r) => json(r, MERCHANT));
}

async function shoot(browser, label, ctxOpts, opts = {}) {
  const context = await browser.newContext({ ...ctxOpts, deviceScaleFactor: 1, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label} console: ${m.text()}`));
  await installMocks(page, opts);

  await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(700);

  const shot = async (name) => {
    await page.waitForTimeout(420);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  };

  await shot("1-business");

  await page.getByRole("button", { name: "Dashboard Preferences" }).click();
  await shot("2-prefs");

  await page.getByRole("button", { name: "Subscription & Billing" }).click();
  await shot("3-billing");
  /* With a card on file the row shows it; without one it is already the form. */
  if (await page.getByRole("button", { name: "Replace" }).count()) {
    await page.getByRole("button", { name: "Replace" }).click();
  }
  await shot("4-card-form");

  await page.getByRole("button", { name: "Account" }).click();
  await shot("5-account");

  await page.getByRole("button", { name: "Transaction Notifications" }).click();
  await shot("6-notifications");

  await context.close();
  return errors;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const a = await shoot(browser, "desktop", { viewport: { width: 1440, height: 900 } });
  const b = await shoot(browser, "tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true }, { withCard: false });
  await browser.close();
  const errors = [...a, ...b];
  if (errors.length) throw new Error(`PAGE ERRORS:\n${errors.join("\n")}`);
  console.log("no page errors");
  console.log(`shots → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
