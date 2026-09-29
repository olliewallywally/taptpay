// Synthetic checkout smoke test. Real upload/download routes and checkout UI;
// no database, cron, mail, provider calls, production target, or frontend edits.
import "../server/__tests__/support/test-env";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createOwnerPrincipal, createTestApp, storage } from "../server/__tests__/support/http-harness";
import { CHROMIUM_PATH } from "./desktop-shots/retail-fixtures.mjs";

const { app, httpServer } = await createTestApp();
const owner = await createOwnerPrincipal();
const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XQAAAAASUVORK5CYII=", "base64");
const vite = await createServer({
  configFile: false, root: path.resolve("client"), plugins: [react()],
  resolve: { alias: { "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets") } },
  // Share the loopback test server; do not open Vite's default HMR port (24678).
  server: { middlewareMode: true, hmr: { server: httpServer } }, appType: "custom",
});
app.use(vite.middlewares);
app.get("*", async (req, res, next) => {
  try { res.type("html").send(await vite.transformIndexHtml(req.url, await readFile("client/index.html", "utf8"))); }
  catch (error) { next(error); }
});
await new Promise<void>(resolve => httpServer.listen(0,"127.0.0.1",resolve));
const address = httpServer.address() as { port: number };
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  const form = new FormData();
  form.append("document", new Blob([imageBytes], { type: "image/png" }), "bill.");
  const upload = await fetch(`${origin}/api/property/invoices/document`, {
    method: "POST", headers: { Authorization: `Bearer ${owner.token}` }, body: form,
  });
  assert.equal(upload.status,200);
  const { documentUrl } = await upload.json() as { documentUrl: string };
  const invoice = { id: "synthetic-invoice", merchantId: owner.merchantId,
    tenantProfileId: "synthetic-tenant", token: "synthetic-browser-token", kind: "charge",
    chargeType: "utilities", description: "Synthetic bill", amountCents: 5000,
    status: "dispatched", dueAt: new Date().toISOString(), documentUrl, documentName: "bill.",
    splitEnabled: false, splitPaidCount: 0 };
  storage.getInvoiceRentRequestByToken = async (token) => token === invoice.token ? invoice as any : undefined;
  storage.getTenantProfile = async () => ({ id: invoice.tenantProfileId, merchantId: owner.merchantId,
    firstName: "Synthetic", lastName: "Payer", propertyAddress: "Test", email: "payer@example.test" } as any);
  browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  for (const viewport of [{width:390,height:844},{width:820,height:1180},{width:1440,height:1000}]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1000 });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/r/${invoice.token}`);
    const link = page.getByRole("button", { name: "View invoice" });
    await link.waitFor({ state: "visible", timeout: 60_000 });
    const documentResponse = context.waitForEvent("response", response =>
      response.url() === `${origin}/api/checkout/document/${invoice.token}`);
    await link.click();
    const response = await documentResponse;
    assert.equal(response.status(),200);
    assert.equal(response.headers()["cache-control"],"private, no-store");
    assert.equal(response.headers()["x-content-type-options"],"nosniff");
    assert.deepEqual(await response.body(),imageBytes);
    assert.deepEqual(errors,[]);
    await page.screenshot({ path: path.join(os.tmpdir(), `gap13-checkout-${viewport.width}.png`) });
    await context.close();
    console.log(`PASS checkout View invoice ${viewport.width}px: actual token route and private image bytes`);
  }
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>(resolve => httpServer.close(() => resolve()));
}
