// Real-Chromium check of the phone terminal's share page and cash sale (owner decision
// 2026-09-25: docs/decisions/2026-09-25-share-dropdown-and-fixes-owner-answers.md), on a
// production build with the API mocked by the shared retail fixtures. Exit 0 only if every check
// passes.
//   npx vite build --outDir "$PWD/<build>" && npx vite preview --outDir "$PWD/<build>" --host 127.0.0.1 --port 5199
//   BASE=http://127.0.0.1:5199 OUT=<dir> node scripts/verify-share-dropdown-browser.mjs
import QRCode from "qrcode";
import { chromium } from "playwright";
import { CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";

const base = process.env.BASE;
const out = process.env.OUT;
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });

async function openTerminal(label, viewport) {
  const opened = await newRetailPage(browser, label, { viewport, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const { page } = opened;
  const local = new URL(base).origin;
  await page.route((url) => url.origin !== local, (route) => route.abort("blockedbyclient"));
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "onLine", { get: () => true });
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__copied.push(text); } },
    });
  });

  // A tiny stateful server: what is created is listed.
  const sales = [];
  let nextId = 501;
  await page.route(`**/api/merchants/${MERCHANT_ID}/transactions`, (route) => json(route, sales));
  await page.route(`**/api/merchants/${MERCHANT_ID}/tapt-stones`, (route) => json(route, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}/active-transaction`, (route) => json(route, null));
  await page.route("**/api/transactions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    const id = nextId++;
    const sale = {
      id, itemName: body.itemName, price: body.price, status: "pending", taptStoneId: null,
      createdAt: new Date(Date.now() + id).toISOString(),
      paymentUrl: `${base}/pay/t/token-${id}`, qrCodeUrl: `${base}/api/pay/t/token-${id}/qr`,
    };
    sales.unshift(sale);
    return json(route, sale);
  });
  await page.route("**/api/transactions/cash-sale", async (route) => {
    const body = route.request().postDataJSON();
    const transaction = { id: 777, itemName: body.itemName, price: body.price, status: "completed", paymentMethod: "cash", taptStoneId: null };
    sales.unshift(transaction);
    return json(route, { transaction });
  });
  await page.route("**/api/pay/t/*/qr", async (route) => {
    const png = await QRCode.toBuffer(route.request().url(), { width: 300 });
    return route.fulfill({ status: 200, contentType: "image/png", body: png });
  });
  await page.goto(`${base}/terminal`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  return { ...opened, sales };
}

const arriving = (page) => page.locator(".tp-layer:not(.leaving)");

async function sendSale(page, digits, name) {
  await page.getByRole("button", { name: "add item" }).click();
  for (const digit of digits) await arriving(page).getByRole("button", { name: digit, exact: true }).click();
  await arriving(page).locator('button[aria-label="commit"]').click();
  await arriving(page).getByPlaceholder("item name").fill(name);
  await arriving(page).locator('button[aria-label="commit"]').click();
  await page.getByRole("button", { name: "send", exact: true }).click();
  await page.waitForTimeout(900);
}

for (const [label, viewport] of [["390x844", { width: 390, height: 844 }], ["320x568", { width: 320, height: 568 }]]) {
  const { context, page, errors } = await openTerminal(`share-${label}`, viewport);
  const appErrors = () => errors.filter((message) => !message.includes("ERR_BLOCKED_BY_CLIENT"));

  await sendSale(page, ["1", "2", "3", "4"], "phone sale");
  const picker = arriving(page).locator('select[aria-label="sale to share"]');
  check(`${label}: sending opens the share page with that sale chosen`,
    (await picker.count()) === 1 && (await picker.inputValue()) === "501", `picker ${await picker.count()}`);
  const heroText = await arriving(page).innerText();
  check(`${label}: the page shows that sale's amount and name`, heroText.includes("$12.34") && heroText.includes("phone sale"));
  const qr = arriving(page).locator(".tp-qr-card img");
  const qrLoaded = (await qr.count()) === 1 && (await qr.evaluate((img) => img.complete && img.naturalWidth > 0));
  check(`${label}: its real QR code shows on the page`, qrLoaded && (await qr.getAttribute("src"))?.endsWith("/api/pay/t/token-501/qr"));
  await page.waitForTimeout(700); // let the home screen finish sliding away
  await page.screenshot({ path: `${out}/share-after-send-${label}.png` });
  // The blue panel scrolls when a small screen cannot fit it (terminal-tokens.css, "scrolling is
  // a first-class outcome"): each share control must be reachable, and a tap at its centre must
  // land on it, not on anything covering it.
  const copy = arriving(page).getByRole("button", { name: "copy link", exact: true });
  const reachable = [];
  for (const name of ["sale to share", "copy link", "download QR", "share via SMS", "share via email"]) {
    const control = name === "sale to share"
      ? arriving(page).locator('select[aria-label="sale to share"]')
      : arriving(page).getByRole("button", { name, exact: true });
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    const hit = box && await page.evaluate(([x, y, wanted]) => {
      const element = document.elementFromPoint(x, y);
      const target = element?.closest("button, select");
      return !!target && (target.getAttribute("aria-label") === wanted || target.textContent?.trim() === wanted);
    }, [box.x + box.width / 2, box.y + box.height / 2, name]);
    if (!hit) reachable.push(name);
  }
  check(`${label}: every share control can be reached and tapped`, reachable.length === 0, `not reachable: ${reachable.join(", ")}`);
  await page.screenshot({ path: `${out}/share-scrolled-${label}.png` });

  await copy.click();
  check(`${label}: copy link copies that sale's own link`,
    (await page.evaluate(() => window.__copied.at(-1))) === `${base}/pay/t/token-501`);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    arriving(page).getByRole("button", { name: "download QR" }).click(),
  ]);
  const downloadPath = `${out}/downloaded-${label}.png`;
  await download.saveAs(downloadPath);
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(downloadPath);
  check(`${label}: download QR saves a real PNG`,
    download.suggestedFilename() === "payment-qr.png" && bytes.subarray(1, 4).toString() === "PNG" && bytes.length > 1000,
    `${download.suggestedFilename()} ${bytes.length} bytes`);

  // A second sale is chosen when sent; a hand choice then stays on coming back.
  await arriving(page).locator('button[aria-label="cancel"]').click();
  await page.waitForTimeout(700);
  await sendSale(page, ["5", "0", "0"], "second sale");
  check(`${label}: a newly sent sale becomes the chosen one`, (await arriving(page).locator('select[aria-label="sale to share"]').inputValue()) === "502");
  await arriving(page).locator('select[aria-label="sale to share"]').selectOption("501");
  await page.waitForTimeout(300);
  check(`${label}: choosing another sale shows it`, (await arriving(page).innerText()).includes("phone sale"));
  await arriving(page).locator('button[aria-label="cancel"]').click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "share", exact: true }).click();
  await page.waitForTimeout(700);
  check(`${label}: coming back keeps the chosen sale`, (await arriving(page).locator('select[aria-label="sale to share"]').inputValue()) === "501");
  await page.screenshot({ path: `${out}/share-chosen-${label}.png` });

  // A cash sale is recorded, and its success screen shares its own receipt.
  await arriving(page).locator('button[aria-label="cancel"]').click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "cash", exact: true }).click();
  await arriving(page).getByPlaceholder("item name").fill("muffin");
  await arriving(page).getByPlaceholder("amount").fill("4.50");
  const cashRequest = page.waitForRequest((request) => request.url().endsWith("/api/transactions/cash-sale"));
  await arriving(page).getByRole("button", { name: "confirm", exact: true }).click();
  const recorded = await cashRequest;
  await page.waitForTimeout(900);
  check(`${label}: the cash sale is recorded`, JSON.stringify(recorded.postDataJSON()) === JSON.stringify({ merchantId: MERCHANT_ID, itemName: "muffin", price: "4.50" }));
  const successText = await arriving(page).innerText();
  check(`${label}: its success screen shows what was recorded`, successText.includes("success") && successText.includes("$4.50"));
  await arriving(page).getByRole("button", { name: "copy receipt link", exact: true }).click();
  check(`${label}: copy receipt link copies its own receipt`, (await page.evaluate(() => window.__copied.at(-1))) === `${base}/receipt/777`);
  check(`${label}: never the demo address`, !(await page.content()).includes("demo-abc123"));
  check(`${label}: no page errors`, appErrors().length === 0, appErrors().join(" | "));
  await page.screenshot({ path: `${out}/cash-success-${label}.png` });
  await context.close();
}

await browser.close();
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? `  — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
