#!/usr/bin/env node
/* Representative real screens with the repaired historical layout fixtures.
   Use run-fixture-browser-gate.mjs; this is not real server-auth/API evidence. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
import { newTradesPage } from "./desktop-shots/trades-fixtures.mjs";
import { installPropertyData } from "./desktop-shots/property-fixtures.mjs";
import { assertBusinessSessionFixture } from "./browser-session-fixture.mjs";

const out = process.argv[2] ?? "/tmp/taptpay-t10c3-fixture-surfaces";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
try {
  for (const [device, viewport, hasTouch] of [["desktop", { width: 1440, height: 900 }, false], ["tablet", { width: 1194, height: 834 }, true]]) {
    for (const [vertical, path, mark, factory] of [["retail", "/dashboard", ".rh-hero", newRetailPage], ["property", "/property", ".ph-hero", newRetailPage], ["trades", "/trades", ".th-hero", newTradesPage]]) {
      const { context, page, errors } = await factory(browser, `${device}/${vertical}`, { viewport, hasTouch });
      try {
        if (vertical === "property") await installPropertyData(page);
        await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
        await assertBusinessSessionFixture(page);
        await page.locator(mark).waitFor({ state: "visible" });
        assert.equal(await page.getByTestId("desktop-frame").getAttribute("data-device-class"), device);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${out}/${device}-${vertical}.png` });
        assert.deepEqual(errors, []);
        console.log(`${device}/${vertical}: actual screen, session startup and no browser errors — pass`);
      } finally {
        await context.close();
      }
    }
  }
  for (const path of ["/login", "/terminal"]) {
    const { context, page, errors } = await newRetailPage(browser, `public${path}`, {
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    }, { signedIn: false });
    try {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
      await assertBusinessSessionFixture(page);
      await page.getByTestId("button-login").waitFor({ state: "visible" });
      assert.equal(new URL(page.url()).pathname, "/login");
      assert.equal(await page.locator(".tp-viewport").count(), 0);
      assert.equal((await context.cookies(BASE_URL)).length, 0);
      assert.deepEqual(errors, []);
      console.log(`public${path}: Login and no merchant frame/cookie — pass`);
    } finally {
      await context.close();
    }
  }
  console.log(`8 fixture surface checks pass; screenshots: ${out}`);
} finally {
  await browser.close();
}
