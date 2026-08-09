/* Screenshot the desktop retail terminal (4c) in every rail mode, against mocked
   merchant data, at desktop (1440×900 → centred 13" frame) and tablet (1194×834). */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const OUT = "/tmp/taptpay-desktop-4c";
const MERCHANT_ID = 999999;

const now = Date.now();
const ago = (mins) => new Date(now - mins * 60_000).toISOString();
const yesterday = (mins) => new Date(now - 24 * 60 * 60_000 - mins * 60_000).toISOString();

const TRANSACTIONS = [
  { id: 501, merchantId: MERCHANT_ID, itemName: "latte & muffin", price: "11.50", status: "pending", taptStoneId: 1, createdAt: ago(3) },
  { id: 502, merchantId: MERCHANT_ID, itemName: "t shirt", price: "15.00", status: "pending", taptStoneId: null, createdAt: ago(11) },
  { id: 503, merchantId: MERCHANT_ID, itemName: "flat white x2", price: "11.00", status: "completed", taptStoneId: 1, createdAt: ago(26) },
  { id: 504, merchantId: MERCHANT_ID, itemName: "bacon & egg roll", price: "12.00", status: "completed", taptStoneId: null, createdAt: ago(48) },
  { id: 505, merchantId: MERCHANT_ID, itemName: "iced latte", price: "7.50", status: "failed", taptStoneId: null, createdAt: ago(70) },
  { id: 506, merchantId: MERCHANT_ID, itemName: "brunch board", price: "42.00", status: "completed", taptStoneId: 1, isSplit: true, totalSplits: 3, completedSplits: 2, splitAmount: "14.00", createdAt: ago(95) },
  { id: 507, merchantId: MERCHANT_ID, itemName: "cold brew", price: "6.50", status: "completed", taptStoneId: null, createdAt: yesterday(120) },
  { id: 508, merchantId: MERCHANT_ID, itemName: "toastie", price: "9.00", status: "completed", taptStoneId: null, createdAt: yesterday(300) },
];

const STOCK = [
  { id: 1, name: "flat white", cost: "5.50", emoji: "☕" },
  { id: 2, name: "latte", cost: "5.50", emoji: "☕" },
  { id: 3, name: "big brunch", cost: "24.00", emoji: "🍔" },
  { id: 4, name: "toastie", cost: "9.00", emoji: "🥪" },
  { id: 5, name: "muffin", cost: "6.00", emoji: "🧁" },
  { id: 6, name: "cold brew", cost: "6.50", emoji: "🥤" },
  { id: 7, name: "t shirt", cost: "35.00", emoji: "👕" },
  { id: 8, name: "tote bag", cost: "18.00", emoji: "🛍️" },
  { id: 9, name: "bean bag 1kg", cost: "26.00", emoji: "📦" },
];

const STONES = [
  { id: 1, merchantId: MERCHANT_ID, name: "counter board", stoneNumber: 1, paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}/stone/1`, qrCodeUrl: `${BASE_URL}/api/merchants/${MERCHANT_ID}/stone/1/qr`, isActive: true },
  { id: 2, merchantId: MERCHANT_ID, name: "window board", stoneNumber: 2, paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}/stone/2`, qrCodeUrl: `${BASE_URL}/api/merchants/${MERCHANT_ID}/stone/2/qr`, isActive: true },
];

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function installMocks(page) {
  const liveStones = STONES.map((stone) => ({ ...stone }));
  const saleBodies = [];
  const boardBodies = [];
  let saleSequence = 0;

  await page.addInitScript(({ merchantId }) => {
    const payload = window.btoa(JSON.stringify({ userId: 1, email: "shot@example.invalid", merchantId, role: "owner" }));
    localStorage.setItem("authToken", `shot.${payload}.dummy`);
    localStorage.setItem("merchantId", String(merchantId));
    localStorage.setItem("taptMode", "retail");
  }, { merchantId: MERCHANT_ID });

  await page.route("**/api/auth/me", (r) =>
    json(r, { user: { id: 1, email: "shot@example.invalid", merchantId: MERCHANT_ID, role: "owner", onboardingCompleted: true } }));
  await page.route("**/api/tutorial/state", (r) => json(r, { generation: 1, autoEnabled: false, pageCount: 20, progress: {} }));
  await page.route("**/api/tutorial/**", (r) => json(r, {}));
  await page.route(`**/api/merchants/${MERCHANT_ID}/transactions`, (r) => json(r, TRANSACTIONS));
  await page.route(`**/api/merchants/${MERCHANT_ID}/stock-items`, (r) => json(r, STOCK));
  await page.route(`**/api/merchants/${MERCHANT_ID}/tapt-stones`, (r) => {
    if (r.request().method() === "POST") {
      boardBodies.push(r.request().postDataJSON() ?? {});
      const stoneNumber = liveStones.length + 1;
      const created = {
        id: 100 + stoneNumber,
        merchantId: MERCHANT_ID,
        name: `Stone ${stoneNumber}`,
        stoneNumber,
        paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}/stone/${100 + stoneNumber}`,
        qrCodeUrl: `${BASE_URL}/api/merchants/${MERCHANT_ID}/stone/${100 + stoneNumber}/qr`,
        isActive: true,
      };
      liveStones.push(created);
      return json(r, created);
    }
    return json(r, liveStones);
  });
  await page.route("**/api/transactions", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    const body = r.request().postDataJSON();
    saleBodies.push(body);
    saleSequence += 1;
    return json(r, {
      id: 9000 + saleSequence,
      ...body,
      status: "pending",
      paymentUrl: `${BASE_URL}/p/desktop-sale-${saleSequence}`,
      qrCodeUrl: `${BASE_URL}/api/p/desktop-sale-${saleSequence}/qr`,
      createdAt: new Date().toISOString(),
    });
  });
  await page.route(`**/api/merchants/${MERCHANT_ID}/active-transaction`, (r) => json(r, null));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (r) =>
    json(r, {
      id: MERCHANT_ID,
      businessName: "Ollie's Coffee",
      status: "active",
      paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}`,
      qrCodeUrl: `${BASE_URL}/api/merchants/${MERCHANT_ID}/qr`,
    }));
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (r) =>
    json(r, {
      id: MERCHANT_ID,
      businessName: "Ollie's Coffee",
      status: "active",
      paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}`,
      qrCodeUrl: `${BASE_URL}/api/merchants/${MERCHANT_ID}/qr`,
    }));

  return { saleBodies, boardBodies };
}

async function shoot(browser, label, ctxOpts) {
  const context = await browser.newContext({ ...ctxOpts, deviceScaleFactor: 1, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  const requests = await installMocks(page);

  await page.goto(`${BASE_URL}/terminal`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(600);

  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  };

  await shot("1-send");

  // typed sale via keypad
  await page.getByRole("button", { name: "keypad" }).click();
  for (const k of ["1", "5", ".", "5", "0"]) await page.getByRole("button", { name: k === "." ? "decimal point" : k, exact: true }).click();
  await shot("2-keypad");
  await page.getByRole("button", { name: "confirm amount" }).click();
  await page.getByLabel("item name").fill("latte & muffin");
  await shot("3-send-filled");

  // Default no-board destination mints and shows only the returned private link.
  await page.getByRole("button", { name: "send payment" }).click();
  await page.getByTitle(`${BASE_URL}/p/desktop-sale-1`).waitFor();
  await shot("4-share-no-board");
  const noBoardBody = requests.saleBodies[0];
  if (noBoardBody?.linkMode !== "per_payment" || "selectedStoneId" in noBoardBody) {
    throw new Error(`${label}: invalid no-board create body ${JSON.stringify(noBoardBody)}`);
  }

  // Starting another sale clears the first credential. Create a board in place;
  // the returned board is added and selected before the board-addressed sale.
  await page.getByRole("button", { name: "start new sale" }).click();
  if (await page.getByTitle(`${BASE_URL}/p/desktop-sale-1`).count()) {
    throw new Error(`${label}: stale first-sale credential remained visible`);
  }
  await page.getByRole("button", { name: "keypad" }).click();
  await page.getByRole("button", { name: "$10", exact: true }).click();
  await page.getByRole("button", { name: "confirm amount" }).click();
  await page.getByLabel("item name").fill("window order");
  await page.getByRole("button", { name: "create new board" }).click();
  const newBoard = page.getByRole("radio", { name: "Stone 3, board 3" });
  await newBoard.waitFor();
  if ((await newBoard.getAttribute("aria-checked")) !== "true") {
    throw new Error(`${label}: newly created board was not auto-selected`);
  }
  await shot("5-new-board-selected");
  await page.getByRole("button", { name: "send payment" }).click();
  await page.getByTitle(`${BASE_URL}/p/desktop-sale-2`).waitFor();
  await shot("6-share-board");
  const boardBody = requests.saleBodies[1];
  if (boardBody?.selectedStoneId !== 103 || boardBody?.linkMode !== "legacy") {
    throw new Error(`${label}: invalid board create body ${JSON.stringify(boardBody)}`);
  }
  if (requests.boardBodies.length !== 1) {
    throw new Error(`${label}: expected one authenticated board-create request`);
  }

  await page.getByRole("button", { name: "start new sale" }).click();

  await page.getByRole("button", { name: "stock tiles" }).click();
  await shot("7-stock");
  await page.getByRole("button", { name: /flat white/i }).click();

  await page.getByRole("button", { name: "split bill" }).first().click();
  await shot("8-split");

  await page.getByRole("button", { name: "share payment link" }).click();
  await page.getByText(/No current sale link/i).waitFor();
  await shot("9-share-empty");

  // active-stack row expansion (live rows only)
  await page.getByRole("button", { name: "compose sale" }).click();
  await page.getByText("latte & muffin", { exact: true }).first().click();
  await shot("10-stack-row");

  await context.close();
  return errors;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const desktopErrors = await shoot(browser, "desktop", { viewport: { width: 1440, height: 900 } });
  const tabletErrors = await shoot(browser, "tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: false });
  await browser.close();
  const errors = [...desktopErrors, ...tabletErrors];
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
