#!/usr/bin/env node
/* Fixture protocol checks only: all document/API responses are intercepted.
   This does not test application authentication or connect to any server. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
import { newTradesPage } from "./desktop-shots/trades-fixtures.mjs";
import { installBusinessSessionFixture, assertBusinessSessionFixture } from "./browser-session-fixture.mjs";

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
let checks = 0;
try {
  for (const scheme of ["http", "https"]) {
    const baseUrl = `${scheme}://fixture.test`;
    const cookieName = scheme === "https" ? "__Host-taptpay-session" : "taptpay-session";
    const faults = [
      ["signed-out reply", { signedIn: false }],
      ["wrong merchant", { signedIn: true, csrfToken: "fixture", user: { id: 1, email: "fixture@example.invalid", merchantId: 2, role: "owner", onboardingCompleted: true } }],
      ["wrong user", { signedIn: true, csrfToken: "fixture", user: { id: 2, email: "fixture@example.invalid", merchantId: 999999, role: "owner", onboardingCompleted: true } }],
      ["wrong email", { signedIn: true, csrfToken: "fixture", user: { id: 1, email: "other@example.invalid", merchantId: 999999, role: "owner", onboardingCompleted: true } }],
      ["wrong role", { signedIn: true, csrfToken: "fixture", user: { id: 1, email: "fixture@example.invalid", merchantId: 999999, role: "member", onboardingCompleted: true } }],
      ["onboarding incomplete", { signedIn: true, csrfToken: "fixture", user: { id: 1, email: "fixture@example.invalid", merchantId: 999999, role: "owner", onboardingCompleted: false } }],
      ["empty csrf", { signedIn: true, csrfToken: "", user: { id: 1, email: "fixture@example.invalid", merchantId: 999999, role: "owner", onboardingCompleted: true } }],
      ["missing csrf", { signedIn: true, user: { id: 1, email: "fixture@example.invalid", merchantId: 999999, role: "owner", onboardingCompleted: true } }],
      ["missing user", { signedIn: true, csrfToken: "fixture" }],
      ["malformed reply", "not-json"],
    ];
    for (const [name, override] of [["positive", null], ...faults, ["removed cookie", null], ["public optout", null], ["missing startup", null], ["second navigation late fault", null]]) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on("request", (request) => requests.push(request));
      await page.route(`${baseUrl}/**`, (route) => route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Fixture check</title><body>fixture<script>${name === "missing startup" ? "" : "fetch('/api/auth/session').then(r=>r.text()).then(()=>window.sessionRead=true)"}</script>`,
      }));
      await installBusinessSessionFixture(page, {
        baseUrl, merchantId: 999999, email: "fixture@example.invalid", errors,
        signedIn: name !== "public optout",
      });
      const initialCookies = await context.cookies(baseUrl);
      if (name === "public optout") {
        assert.equal(initialCookies.length, 0);
      } else {
        assert.equal(initialCookies.length, 1);
        assert.equal(initialCookies[0].name, cookieName);
        assert.equal(initialCookies[0].httpOnly, true);
        assert.equal(initialCookies[0].secure, scheme === "https");
        assert.equal(initialCookies[0].sameSite, "Lax");
        assert.equal(initialCookies[0].path, "/");
      }
      if (name === "removed cookie") await context.clearCookies();
      if (override) await page.route(`${baseUrl}/api/auth/session`, (route) => route.fulfill({
        status: 200, contentType: "application/json",
        body: typeof override === "string" ? override : JSON.stringify(override),
      }));
      await page.goto(`${baseUrl}/terminal`);
      if (name === "second navigation late fault") {
        await assertBusinessSessionFixture(page);
        await page.route(`${baseUrl}/api/auth/session`, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signedIn: false }) });
        });
        await page.goto(`${baseUrl}/terminal?second=1`, { waitUntil: "domcontentloaded" });
      }
      const good = name === "positive" || name === "public optout";
      if (good) {
        await assertBusinessSessionFixture(page);
        assert.deepEqual(errors, []);
        const externalStatus = await page.evaluate(() => fetch("https://external.fixture.invalid/collect?synthetic=1").then((response) => response.status));
        assert.equal(externalStatus, 204, "external requests must be captured before they reach the network");
        await page.evaluate(() => new Promise((done, reject) => {
          const script = document.createElement("script");
          script.src = "https://external.fixture.invalid/banner.js";
          script.onload = done;
          script.onerror = reject;
          document.body.append(script);
        }));
      } else {
        await assert.rejects(assertBusinessSessionFixture(page, { timeoutMs: 200 }), /session fixture/);
        if (name !== "missing startup") assert.ok(errors.length > 0, "actual faulty reply must enter the consumer's errors array");
      }
      const visibleStorage = await page.evaluate(() => ({
        authToken: localStorage.getItem("authToken"), adminToken: localStorage.getItem("adminToken"), cookie: document.cookie,
      }));
      assert.deepEqual(visibleStorage, { authToken: null, adminToken: null, cookie: "" });
      for (const request of requests) assert.equal(await request.headerValue("authorization"), null);
      assert.equal(requests.some((request) => new URL(request.url()).pathname === "/api/auth/session"), name !== "missing startup");
      console.log(`${scheme}: ${name} — ${good ? "pass" : "rejected"}`);
      checks++;
      await context.close();
    }
  }
  for (const [name, factory, options] of [["retail", newRetailPage, {}], ["trades", newTradesPage, {}], ["retail public", newRetailPage, { signedIn: false }]]) {
    const { context, page, errors } = await factory(browser, name, { viewport: { width: 390, height: 844 } }, options);
    await page.route((url) => url.origin === new URL(BASE_URL).origin && !url.pathname.startsWith("/api/"), (route) => route.fulfill({
      contentType: "text/html", body: "<!doctype html><body>fixture<script>fetch('/api/auth/session').then(r=>r.text()).then(()=>window.sessionRead=true)</script>",
    }));
    await page.goto(`${BASE_URL}/terminal`);
    await assertBusinessSessionFixture(page);
    const state = await page.evaluate(() => fetch("/api/tutorial/state").then((response) => response.json()));
    assert.equal(state.autoEnabled, false, "exact tutorial state must outrank tutorial catch-all");
    assert.equal(await page.evaluate(() => localStorage.getItem("authToken")), null);
    assert.equal(await page.evaluate(() => document.cookie), "");
    assert.equal((await context.cookies(BASE_URL)).length, name === "retail public" ? 0 : 1);
    assert.deepEqual(errors, []);
    console.log(`${name}: factory startup and tutorial precedence — pass`);
    checks++;
    await context.close();
  }
  console.log(`${checks} browser session fixture checks pass`);
} finally {
  await browser.close();
}
