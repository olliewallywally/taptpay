/* Screenshot the desktop retail analytics screen (4d): overview, sheet states,
   reports flow and a generated report, at desktop and tablet sizes. */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const OUT = "/tmp/taptpay-desktop-4d";
const MERCHANT_ID = 999999;

const now = Date.now();
const H = 3600_000;
const mins = (m) => new Date(now - m * 60_000).toISOString();
const hoursAgo = (h) => new Date(now - h * H).toISOString();
const daysAgo = (d, hh = 10) => {
  const dt = new Date(now - d * 24 * H);
  dt.setHours(hh, 15, 0, 0);
  return dt.toISOString();
};

const ITEMS = [
  ["flat white", "5.50", "qr_code"],
  ["latte", "6.00", "nfc_tap"],
  ["big brunch", "24.00", "card_reader"],
  ["muffin", "6.00", "qr_code"],
  ["cold brew", "6.50", "tap_to_pay"],
  ["toastie", "9.00", "nfc_tap"],
];

/* A fortnight of sales so every report and every range has something to chew on. */
const TRANSACTIONS = [];
let id = 1000;
for (let d = 0; d < 14; d++) {
  const perDay = 3 + ((d * 7) % 5);
  for (let k = 0; k < perDay; k++) {
    const [name, price, method] = ITEMS[(d + k) % ITEMS.length];
    TRANSACTIONS.push({
      id: id++,
      merchantId: MERCHANT_ID,
      itemName: name,
      price,
      status: "completed",
      paymentMethod: method,
      totalRefunded: "0.00",
      refundableAmount: price,
      createdAt: daysAgo(d, 7 + ((k * 3) % 11)),
    });
  }
}
TRANSACTIONS.push(
  { id: 2001, merchantId: MERCHANT_ID, itemName: "latte & muffin", price: "11.50", status: "pending", paymentMethod: "qr_code", createdAt: mins(4) },
  { id: 2002, merchantId: MERCHANT_ID, itemName: "t shirt", price: "35.00", status: "failed", paymentMethod: "card_reader", createdAt: hoursAgo(3) },
  { id: 2003, merchantId: MERCHANT_ID, itemName: "keep cup", price: "18.00", status: "partially_refunded", paymentMethod: "nfc_tap", totalRefunded: "6.00", refundableAmount: "12.00", createdAt: hoursAgo(5) },
  { id: 2004, merchantId: MERCHANT_ID, itemName: "brunch table of 6", price: "118.00", status: "completed", paymentMethod: "qr_code", isSplit: true, totalSplits: 6, completedSplits: 6, splitAmount: "19.67", totalRefunded: "0.00", refundableAmount: "118.00", createdAt: hoursAgo(26) },
  { id: 2005, merchantId: MERCHANT_ID, itemName: "office coffee run", price: "44.50", status: "completed", paymentMethod: "nfc_tap", isSplit: true, totalSplits: 4, completedSplits: 2, splitAmount: "11.13", totalRefunded: "0.00", refundableAmount: "44.50", createdAt: hoursAgo(30) },
);

const STOCK = [
  { id: 1, name: "flat white", cost: "5.50", emoji: "☕" },
  { id: 2, name: "latte", cost: "6.00", emoji: "☕" },
  { id: 3, name: "big brunch", cost: "24.00", emoji: "🍔" },
  { id: 4, name: "muffin", cost: "6.00", emoji: "🧁" },
  { id: 5, name: "cold brew", cost: "6.50", emoji: "🥤" },
  { id: 6, name: "toastie", cost: "9.00", emoji: "🥪" },
  { id: 7, name: "keep cup", cost: "18.00", emoji: "🛍️" },
  { id: 8, name: "t shirt", cost: "35.00", emoji: "👕" },
];

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function installMocks(page) {
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
  await page.route(`**/api/merchants/${MERCHANT_ID}/transactions`, (r) => json(r, TRANSACTIONS));
  await page.route(`**/api/merchants/${MERCHANT_ID}/stock-items`, (r) => json(r, STOCK));
  await page.route(`**/api/merchants/${MERCHANT_ID}/tapt-stones`, (r) => json(r, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}/active-transaction`, (r) => json(r, null));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (r) =>
    json(r, {
      id: MERCHANT_ID,
      businessName: "Ollie's Coffee",
      status: "active",
      gstRegistered: true,
      gstNumber: "123-456-789",
      paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}`,
      qrCodeUrl: `${BASE_URL}/api/merchants/${MERCHANT_ID}/qr`,
    }));
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (r) =>
    json(r, {
      id: MERCHANT_ID,
      businessName: "Ollie's Coffee",
      status: "active",
      gstRegistered: true,
      gstNumber: "123-456-789",
      paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}`,
      qrCodeUrl: `${BASE_URL}/api/merchants/${MERCHANT_ID}/qr`,
    }));
}

async function shoot(browser, label, ctxOpts) {
  const context = await browser.newContext({ ...ctxOpts, deviceScaleFactor: 1, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label} console: ${m.text()}`));
  await installMocks(page);

  await page.goto(`${BASE_URL}/transactions`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(700);

  const shot = async (name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  };

  await shot("1-overview-week");

  await page.getByRole("tab", { name: "Day" }).click();
  await shot("2-overview-day");
  await page.getByRole("tab", { name: "Year" }).click();
  await shot("3-overview-year");
  await page.getByRole("tab", { name: "Week" }).click();

  /* drag the sheet open by its handle — pointer physics, scaled canvas */
  const grab = page.getByRole("button", { name: /payment history/i }).first();
  const box = await grab.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 320, { steps: 18 });
  await page.mouse.up();
  await shot("4-sheet-open");

  /* a transaction row detail (receipt + refund actions) */
  await page.getByRole("button", { name: /keep cup/i }).first().click();
  await shot("5-tx-detail");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await shot("6-refund-form");
  await page.getByRole("button", { name: /keep cup/i }).first().click();

  /* reports → tiles → filters → generated report */
  await page.getByRole("button", { name: "Reports" }).click();
  await shot("7-report-tiles");
  await page.getByRole("button", { name: /Best Sellers/ }).click();
  await shot("8-report-filters");
  await page.getByRole("button", { name: "Generate Report" }).click();
  await shot("9-report-sellers");

  /* a donut report too — after generating, the sheet parks in tiles mode */
  await page.getByRole("button", { name: /payment history/i }).first().click();
  await page.getByRole("button", { name: /Payment Methods/ }).click();
  await page.getByRole("button", { name: "This month" }).click();
  await page.getByRole("button", { name: "Generate Report" }).click();
  await shot("10-report-methods");

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
  console.log(`${TRANSACTIONS.length} mocked transactions · shots → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
