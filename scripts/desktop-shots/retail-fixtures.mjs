import { chromium } from "playwright";

export const BASE_URL = process.env.DESKTOP_SHOT_BASE_URL ?? "http://127.0.0.1:5000";
export const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
export const MERCHANT_ID = 999999;

const now = Date.now();
const minutesAgo = (minutes) => new Date(now - minutes * 60_000).toISOString();
const daysAgo = (days, hour = 10) => {
  const value = new Date(now - days * 86_400_000);
  value.setHours(hour, 15, 0, 0);
  return value.toISOString();
};

export const RETAIL_TRANSACTIONS = [
  { id: 1, itemName: "flat white", price: "5.50", status: "completed", paymentMethod: "qr_code", createdAt: minutesAgo(8) },
  { id: 2, itemName: "latte", price: "6.00", status: "completed", paymentMethod: "tap_to_pay", createdAt: minutesAgo(34) },
  { id: 3, itemName: "muffin", price: "6.00", status: "pending", paymentMethod: "qr_code", createdAt: minutesAgo(4) },
  { id: 4, itemName: "toastie", price: "9.00", status: "failed", paymentMethod: "card_reader", createdAt: minutesAgo(72) },
  { id: 5, itemName: "flat white", price: "5.50", status: "completed", paymentMethod: "qr_code", createdAt: daysAgo(1, 9) },
  { id: 6, itemName: "flat white", price: "5.50", status: "completed", paymentMethod: "qr_code", createdAt: daysAgo(2, 11) },
  { id: 7, itemName: "big brunch", price: "24.00", status: "completed", paymentMethod: "card_reader", createdAt: daysAgo(3, 12) },
];

export const RETAIL_STOCK = [
  { id: 1, name: "flat white", cost: "5.50", description: "double shot", emoji: "☕", variations: [] },
  { id: 2, name: "latte", cost: "6.00", description: "house blend", emoji: "☕", variations: [] },
  { id: 3, name: "big brunch", cost: "24.00", description: "all day", emoji: "🍳", variations: [] },
  { id: 4, name: "muffin", cost: "6.00", description: "baked today", emoji: "🧁", variations: [] },
  { id: 5, name: "toastie", cost: "9.00", description: "ham and cheese", emoji: "🥪", variations: [] },
];

const merchant = {
  id: MERCHANT_ID,
  businessName: "Ollie's Coffee",
  status: "active",
  dailyGoal: "500.00",
  paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}`,
};

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function installRetailMocks(page) {
  await page.addInitScript(({ merchantId }) => {
    const payload = window.btoa(JSON.stringify({
      userId: 1,
      email: "retail-shot@example.invalid",
      merchantId,
      role: "merchant",
    }));
    localStorage.setItem("authToken", `shot.${payload}.dummy`);
    localStorage.setItem("merchantId", String(merchantId));
    localStorage.setItem("taptMode", "retail");
  }, { merchantId: MERCHANT_ID });

  await page.route("**/api/auth/me", (route) => json(route, {
    user: {
      id: 1,
      email: "retail-shot@example.invalid",
      merchantId: MERCHANT_ID,
      role: "merchant",
      onboardingCompleted: true,
    },
  }));
  await page.route("**/api/tutorial/state", (route) => json(route, {
    generation: 1,
    autoEnabled: false,
    pageCount: 20,
    progress: {},
  }));
  await page.route("**/api/tutorial/**", (route) => json(route, {}));
  await page.route(`**/api/merchants/${MERCHANT_ID}/**`, (route) => json(route, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}/transactions`, (route) =>
    json(route, RETAIL_TRANSACTIONS));
  await page.route(`**/api/merchants/${MERCHANT_ID}/stock-items`, (route) =>
    json(route, RETAIL_STOCK));
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (route) => json(route, merchant));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (route) => json(route, merchant));

  /* The cross-vertical endpoints. These fixtures began as retail-only, but the
     transition probe walks /property and /trades too, and those pages query
     their own routes. Unmocked, they reach the real dev server with a dummy
     token and answer 403 — which is what put four "403 (Forbidden)" console
     errors in every probe run. The pages render their empty states from these,
     which is all a transition probe needs; a screenshot script wanting populated
     property/trades data should add its own richer overrides after this call.

     Matched by prefix, not by exact path: these pages call `/tenants/1`,
     `/tenants/1/events` and `/invoices?tenantId=1`, and a Playwright glob
     matches the full URL including its query string, so an exact pattern
     silently misses every parameterised call. */
  for (const prefix of ["/api/property/", "/api/trades/"]) {
    await page.route(`**${prefix}**`, (route) => json(route, []));
  }

  /* Shapes mirror the server DTOs: `pushNotificationPreferencesDto` and
     `subscriptionDto` in server/http-contracts.ts. Settings reads both. */
  await page.route("**/api/push/preferences", (route) => json(route, {
    preferences: { paymentReceived: true, dailyPayoutSummary: false, failedPaymentAlerts: false },
  }));
  await page.route("**/api/subscription", (route) => json(route, {
    subscription: {
      planId: "solo",
      planName: "Solo",
      status: "active",
      priceCents: 799,
      seatLimit: 1,
      seatsInUse: 1,
      pendingPlanId: null,
    },
  }));
}

export async function newRetailPage(browser, label, contextOptions) {
  const context = await browser.newContext({
    ...contextOptions,
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    timezoneId: "Pacific/Auckland",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`${label} page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
  await installRetailMocks(page);
  return { context, page, errors };
}

export async function runRetailShots(shoot) {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  try {
    const desktop = await shoot(browser, "desktop", {
      viewport: { width: 1440, height: 900 },
    });
    const tablet = await shoot(browser, "tablet", {
      viewport: { width: 1194, height: 834 },
      hasTouch: true,
      isMobile: false,
    });
    const errors = [...desktop, ...tablet];
    if (errors.length) throw new Error(`PAGE ERRORS:\n${errors.join("\n")}`);
    console.log("no page errors");
  } finally {
    await browser.close();
  }
}
