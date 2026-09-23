// What a trades PDF export prints when browser storage is as a password sign-in leaves
// it: a session token, and no "merchantId" key (only Google sign-in wrote that key).
// Synthetic and loopback-only, like capture-r1-t9-failure-states.mjs: every /api
// request is answered by the fixtures, every other origin is blocked.
//
//   AFTER_URL=http://127.0.0.1:5199 [BEFORE_URL=http://127.0.0.1:5198] OUT=<dir> \
//     node scripts/verify-export-business-details.mjs
//
// The business details say "Wallace Electrical", GST exclusive. An export built
// without them prints "TaptPay" and works GST out inclusive, the default.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
import { installTradesData } from "./desktop-shots/trades-fixtures.mjs";

const out = process.env.OUT ?? "/tmp/taptpay-export-business-details";
const builds = [
  ["before", process.env.BEFORE_URL],
  ["after", process.env.AFTER_URL ?? "http://127.0.0.1:5199"],
].filter(([, url]) => url);
for (const [, url] of builds) assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "local servers only");

const PROFILE = {
  id: MERCHANT_ID,
  businessName: "Wallace Electrical",
  gstRegistered: true,
  gstNumber: "123-456-789",
  tradeGstMode: "exclusive",
};

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const results = {};
try {
  for (const [label, base] of builds) {
    const { context, page, errors } = await newRetailPage(browser, label, {
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const local = new URL(base).origin;
    await page.route((url) => url.origin !== local, (route) => route.abort("blockedbyclient"));
    await installTradesData(page);
    // Registered after the fixtures' own init script, so it runs after it.
    await page.addInitScript(() => localStorage.removeItem("merchantId"));
    await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PROFILE) }));

    await page.goto(`${base}/trades/analytics`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1500);
    const storage = await page.evaluate(() => ({
      sessionToken: Boolean(localStorage.getItem("authToken")),
      merchantIdKey: localStorage.getItem("merchantId"),
    }));

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("button", { name: /Invoice Summary/ }).first().click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByRole("button", { name: "Generate PDF" }).click(),
    ]);
    const file = `${out}/${label}-invoice-summary.pdf`;
    await download.saveAs(file);
    const text = execFileSync("pdftotext", ["-layout", file, "-"]).toString();
    await context.close();

    results[label] = {
      storage,
      businessName: text.includes("Wallace Electrical") ? "Wallace Electrical" : text.includes("TaptPay") ? "TaptPay" : "neither",
      gstSummary: text.match(/GST summary \([^)]*\)/)?.[0] ?? "none",
      pageErrors: errors.filter((error) => / page: /.test(error)),
    };
    console.log(label, JSON.stringify(results[label]));
  }
} finally {
  await browser.close();
}
for (const result of Object.values(results)) {
  assert.deepEqual(result.storage, { sessionToken: true, merchantIdKey: null }, "storage as a password sign-in leaves it");
  assert.deepEqual(result.pageErrors, [], "page errors");
}
if (results.after) {
  assert.equal(results.after.businessName, "Wallace Electrical", "after: the business name is printed");
  assert.equal(results.after.gstSummary, "GST summary (exclusive, 15%)", "after: GST in the business's mode");
}
