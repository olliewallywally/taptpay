// C10 route review, batch 3c (2026-09-26): how large is the request the board builder's
// "Send to Print" makes to POST /api/board-builder/submit, beside the 100 KB limit of the
// server's JSON parser (express.json()'s default, server/app.ts)? The real page on a
// production build, in real Chromium, signed in as the shared retail fixture merchant. The
// submit is intercepted in the browser and answered here: nothing reaches a server and no
// email is sent. Every other origin (Google Fonts) is refused, as in the other probes.
//
//   npx vite build --outDir "$PWD/<build>" && \
//   (npx vite preview --outDir "$PWD/<build>" --host 127.0.0.1 --port 5199 &) && \
//   DESKTOP_SHOT_BASE_URL=http://127.0.0.1:5199 node scripts/measure-board-builder-submit-browser.mjs
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";

assert.ok(["127.0.0.1", "localhost"].includes(new URL(BASE_URL).hostname), "local servers only");

// express.json() takes "100kb" through the bytes package, where 1 kb is 1,024 bytes.
const JSON_BODY_LIMIT = 100 * 1024;
const BOARD = { id: 7, merchantId: MERCHANT_ID, name: "Counter", stoneNumber: 1, isActive: true };
const LAYOUTS = ["A5 Portrait", "A5 Landscape"];

// The board's QR image, made as GET /api/merchants/:id/stone/:stoneId/qr makes it.
const qrPng = await QRCode.toBuffer(`${BASE_URL}/pay/${MERCHANT_ID}/stone/${BOARD.id}`, {
  type: "png",
  width: 600,
  margin: 2,
  color: { dark: "#00E5CC", light: "#00000000" },
  errorCorrectionLevel: "L",
});

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const results = [];
try {
  for (const layout of LAYOUTS) {
    const { context, page, errors } = await newRetailPage(browser, `board-builder ${layout}`, {
      viewport: { width: 1440, height: 900 },
    });
    // Sandboxed Chromium has only loopback, so it believes it is offline.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "onLine", { get: () => true });
    });
    const origin = new URL(BASE_URL).origin;
    await page.route((url) => url.origin !== origin, (route) => route.abort());
    await page.route(`**/api/merchants/${MERCHANT_ID}/tapt-stones`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([BOARD]) }));
    await page.route(`**/api/merchants/${MERCHANT_ID}/stone/${BOARD.id}/qr**`, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: qrPng }));

    let sent = null;
    await page.route("**/api/board-builder/submit", async (route) => {
      const body = route.request().postDataBuffer() ?? Buffer.alloc(0);
      const parsed = JSON.parse(body.toString("utf8"));
      sent = {
        bodyBytes: body.length,
        pdfBase64Chars: parsed.pdf.length,
        pdfBytes: Buffer.from(parsed.pdf, "base64").length,
        pdfHeader: Buffer.from(parsed.pdf, "base64").subarray(0, 5).toString("latin1"),
        layout: parsed.layout,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Board submitted successfully" }),
      });
    });

    await page.goto(`${BASE_URL}/board-builder`);
    await page.getByText("✓ QR code loaded").waitFor({ timeout: 30_000 });
    // A measurement, not a check of the controls: the button sits under the sticky send panel
    // at this size, so the click is dispatched to it directly.
    if (layout === "A5 Landscape") await page.getByRole("button", { name: "Landscape", exact: true }).dispatchEvent("click");
    // The preview label is in the DOM (hidden at this width) once the layout is chosen; the
    // send button stays disabled until the template has loaded.
    await page.getByText(`Live Preview — ${layout}`).waitFor({ state: "attached", timeout: 30_000 });
    await page.getByPlaceholder("Your name").fill("Probe");
    await page.getByPlaceholder("Your email").fill("probe@example.invalid");
    await page.getByRole("button", { name: "Send to Print" }).click();
    for (let waited = 0; !sent && waited < 60_000; waited += 250) await page.waitForTimeout(250);
    assert.ok(sent, `${layout}: the page never sent the board`);

    // Refused Google Fonts are expected here; anything else is a real page error.
    const unexpected = errors.filter((line) => !/fonts\.(googleapis|gstatic)\.com|net::ERR_FAILED/.test(line));
    const result = { asked: layout, ...sent, unexpectedErrors: unexpected };
    results.push(result);
    report(result);
    await context.close();
  }
} finally {
  await browser.close();
}
assert.equal(results.length, LAYOUTS.length);

function report(result) {
  const verdict = result.bodyBytes > JSON_BODY_LIMIT ? "OVER" : "within";
  console.log(
    `${result.asked}: request body ${result.bodyBytes.toLocaleString()} bytes (${verdict} the ${JSON_BODY_LIMIT.toLocaleString()}-byte limit); ` +
      `PDF ${result.pdfBytes.toLocaleString()} bytes (${result.pdfHeader}), ${result.pdfBase64Chars.toLocaleString()} base64 characters; ` +
      `sent as "${result.layout}"; unexpected page errors: ${result.unexpectedErrors.length}`,
  );
  for (const line of result.unexpectedErrors) console.log(`  ${line}`);
}
