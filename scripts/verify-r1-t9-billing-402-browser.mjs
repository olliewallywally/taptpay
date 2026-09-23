// R1-T9 — billing 402s in a real browser: on each payment screen, a 402 shows one billing
// banner (visible, on top, in view) and nothing else, and what was typed stays. The
// customer's quote page shows the customer wording and no billing banner.
//
// Synthetic and loopback-only, like scripts/capture-r1-t9-failure-states.mjs: every /api
// request is answered by the desktop-shots fixtures, the billing-gated POSTs by the
// server's own 402 body, and every other origin is blocked.
//
//   R1T9_402_URL=http://127.0.0.1:5199 [R1T9_402_BEFORE_URL=http://127.0.0.1:5198] \
//   R1T9_402_OUT=<dir> node scripts/verify-r1-t9-billing-402-browser.mjs
//
// A build from before the change (R1T9_402_BEFORE_URL) is captured too, without the
// checks: what each screen showed then, for the evidence.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { CHROMIUM_PATH, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
import { installPropertyData } from "./desktop-shots/property-fixtures.mjs";
import { installTradesData } from "./desktop-shots/trades-fixtures.mjs";

const out = process.env.R1T9_402_OUT ?? "/tmp/taptpay-r1-t9-402";
const builds = [
  ["before", process.env.R1T9_402_BEFORE_URL],
  ["after", process.env.R1T9_402_URL ?? "http://127.0.0.1:5199"],
].filter(([, url]) => url);
for (const [, url] of builds) assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "local servers only");

const BILLING_402 = {
  code: "BILLING_CARD_REQUIRED",
  message: "Your subscription needs attention before you can send payments. Open Billing in Settings.",
};
const BANNER_TITLE = "Subscription needs attention";
const SERVER_WORDS = /before you can send payments/;
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const QUOTE_TOKEN = "q".repeat(43);
/* Every message an action used to add on a 402, besides the banner. */
const ACTION_MESSAGES = [
  SERVER_WORDS, /Credit or debit card required/, /Payment Declined/, /Failed to (send|create)/,
  /Could not (resend|create|send)/, /Invoice not sent/, /Quote not created/, /Action failed/,
  /Resent \d/, /Payment error/,
];

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const live = (page) => page.locator(".tp-layer:not(.leaving)");

/**
 * Each flow: where it starts, the billing-gated request, how to get to the action
 * (`prepare`) and press it (`press`), and what was typed (read before the press and again
 * after it: it must not change).
 */
const FLOWS = [
  {
    name: "phone-retail-sale", path: "/terminal", device: PHONE, gated: "/api/transactions",
    async prepare(page) {
      await page.getByRole("button", { name: "add item", exact: true }).click();
      await page.waitForTimeout(700);
      for (const digit of ["1", "2", "3", "4"]) await page.getByRole("button", { name: digit, exact: true }).click();
      await live(page).locator('button[aria-label="commit"]').click();
      await page.getByPlaceholder("item name").fill("phone billing sale");
      await live(page).locator('button[aria-label="commit"]').click();
    },
    press: (page) => page.getByRole("button", { name: "send", exact: true }).click(),
    typed: (page) => live(page).getByText("$12.34", { exact: true }).first().textContent(),
  },
  {
    name: "desktop-retail-sale", path: "/terminal", device: DESKTOP, gated: "/api/transactions",
    async prepare(page) {
      await page.getByRole("button", { name: "keypad" }).click();
      await page.getByRole("button", { name: /^\$5$/ }).click();
      await page.getByRole("button", { name: "confirm amount" }).click();
      await page.getByRole("textbox", { name: "item name" }).fill("Flat white");
    },
    press: (page) => page.getByRole("button", { name: "send payment" }).click(),
    typed: (page) => page.getByRole("textbox", { name: "item name" }).inputValue(),
  },
  {
    name: "phone-property-rent", path: "/property/terminal", device: PHONE, install: installPropertyData,
    gated: "/api/property/invoices",
    async prepare(page) {
      await page.getByRole("button", { name: "send", exact: true }).first().click();
      await page.waitForTimeout(900);
      await page.getByRole("button", { name: /choose tenant/ }).click();
      await page.waitForTimeout(900);
      await live(page).getByRole("button", { name: /Mia Chen/ }).first().click();
      await page.waitForTimeout(900);
    },
    press: (page) => page.getByRole("button", { name: "send rent request" }).click(),
    typed: (page) => live(page).locator(".tp-amount").first().textContent(),
  },
  {
    name: "desktop-property-rent", path: "/property/terminal", device: DESKTOP, install: installPropertyData,
    gated: "/api/property/invoices",
    async prepare(page) {
      await page.getByRole("button", { name: "select tenant" }).click();
      await page.locator(".pt-tenant-cards").getByRole("button", { name: /Mia Chen/ }).click();
    },
    press: (page) => page.getByRole("button", { name: "send rent request" }).click(),
    typed: (page) => page.locator(".pt-amt").first().textContent(),
  },
  {
    name: "phone-trades-invoice", path: "/trades/terminal", device: PHONE, install: installTradesData,
    gated: "/api/trades/invoices",
    async prepare(page) {
      await page.getByRole("button", { name: "invoice", exact: true }).first().click();
      await page.waitForTimeout(900);
      await live(page).getByRole("button", { name: /Sarah Chen/ }).first().click();
      await page.waitForTimeout(900);
      for (const digit of ["1", "2", "0"]) await live(page).getByRole("button", { name: digit, exact: true }).click();
      await live(page).getByRole("button", { name: "confirm" }).click();
      await page.waitForTimeout(900);
    },
    press: (page) => page.getByRole("button", { name: "send invoice" }).click(),
    typed: (page) => live(page).locator(".tp-amount").first().textContent(),
  },
  {
    name: "desktop-trades-invoice", path: "/trades/terminal", device: DESKTOP, install: installTradesData,
    gated: "/api/trades/invoices",
    async prepare(page) {
      await page.getByRole("button", { name: "choose client" }).click();
      await page.getByRole("button", { name: "choose Sarah Chen" }).click();
      await page.getByRole("button", { name: /^edit/ }).click();
      for (const digit of ["1", "2", "0"]) await page.getByRole("button", { name: digit, exact: true }).click();
      await page.getByRole("button", { name: "confirm amount" }).click();
    },
    press: (page) => page.getByRole("button", { name: "send invoice" }).click(),
    typed: (page) => page.locator(".tt-inv-amt").first().textContent(),
  },
  {
    name: "phone-trades-quote", path: "/trades/quote", device: PHONE, install: installTradesData,
    gated: "/api/trades/quotes",
    async prepare(page) {
      await page.getByRole("button", { name: "Build quote" }).click();
      await page.waitForTimeout(700);
      await page.getByRole("textbox", { name: "name" }).fill("Sam Tui");
      await page.getByRole("button", { name: "Next" }).click();
      await page.waitForTimeout(700);
      await page.getByRole("textbox", { name: "Item 1 description" }).fill("Rewire kitchen");
      await page.getByRole("textbox", { name: "Item 1 unit price" }).fill("1000");
      await page.getByRole("button", { name: "Next" }).click();
      await page.waitForTimeout(700);
    },
    press: (page) => page.getByRole("button", { name: "create quote" }).click(),
    typed: (page) => page.locator(".mq-heading .tp-amount").textContent(),
  },
  {
    name: "phone-trades-recurring", path: "/trades/recurring", device: PHONE, install: installTradesData,
    gated: "/api/trades/schedules",
    async prepare(page) {
      await page.getByRole("combobox").first().selectOption({ label: "Sarah Chen - 8 Kauri Grove, Auckland" });
      await page.getByRole("textbox", { name: "Amount" }).fill("200");
    },
    press: (page) => page.getByRole("button", { name: "Create recurring Invoice" }).click(),
    typed: async (page) =>
      `${await page.getByRole("combobox").first().inputValue()} ${await page.getByRole("textbox", { name: "Amount" }).inputValue()}`,
  },
  {
    name: "customer-quote-accept", path: `/trades/quote/${QUOTE_TOKEN}`, device: PHONE, customer: true,
    gated: `/api/trades/quotes/token/${QUOTE_TOKEN}/respond`,
    async install(page) {
      await page.route(`**/api/trades/quotes/token/${QUOTE_TOKEN}`, (route) => json(route, {
        quote: {
          id: "quote-1", status: "sent", totalCents: 115_000, depositEnabled: false, businessName: "Wallace Electrical",
          lineItems: [{ description: "Rewire kitchen", qty: 1, unitPriceCents: 100_000, lineTotalCents: 100_000 }],
        },
        invoice: null,
      }));
    },
    async prepare(page) {
      await page.getByRole("button", { name: "view quote" }).click();
    },
    press: (page) => page.getByRole("button", { name: "confirm" }).click(),
    typed: () => "",
  },
];

async function run(browser, base, flow, mode) {
  const { context, page, errors } = await newRetailPage(browser, `${flow.name}/${mode}`, {
    ...flow.device,
    reducedMotion: "reduce",
  });
  try {
    const local = new URL(base).origin;
    await page.route((url) => url.origin !== local, (route) => route.abort("blockedbyclient"));
    /* Chromium in this sandbox has only a loopback interface, so it reports itself offline,
       and the retail terminal then covers its top with "Connection Lost" and "Real-time
       Updates Disconnected". A real merchant's device is online. */
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "onLine", { get: () => true }));
    if (flow.install) await flow.install(page);
    let gatedCalls = 0;
    // Registered last, so it wins over the fixtures for the same path.
    await page.route(`**${flow.gated}`, (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      gatedCalls += 1;
      return json(route, BILLING_402, 402);
    });
    await page.goto(`${base}${flow.path}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(2000);
    try {
      await flow.prepare(page);
    } catch (error) {
      await page.screenshot({ path: `${out}/${flow.name}-${mode}-stuck.png` });
      throw error;
    }
    const typedBefore = String(await flow.typed(page)).trim();
    await flow.press(page);
    /* Read the page every 100 ms while the action settles: the phone screens' own toasts
       last 1.6 s, so one read at the end would miss them. */
    const seen = new Set();
    for (let elapsed = 0; elapsed < 3000; elapsed += 100) {
      const text = await page.locator("body").innerText();
      for (const pattern of ACTION_MESSAGES) if (pattern.test(text)) seen.add(String(pattern));
      await page.waitForTimeout(100);
    }
    const found = [...seen];

    const shot = `${out}/${flow.name}-${mode}.png`;
    await page.screenshot({ path: shot });
    const bannerCount = await page.getByText(BANNER_TITLE, { exact: true }).count();
    const text = await page.locator("body").innerText();
    const customerWords = /This quote can't be accepted online right now\. Please contact the business to go ahead\./.test(text);
    const record = { flow: flow.name, mode, gatedCalls, bannerCount, found, customerWords, shot };

    if (mode === "after") {
      assert.equal(gatedCalls, 1, `${flow.name}: the action was sent once`);
      assert.deepEqual(found, [], `${flow.name}: nothing but the banner speaks`);
      if (flow.customer) {
        assert.equal(bannerCount, 0, `${flow.name}: the customer sees no billing banner`);
        assert.ok(customerWords, `${flow.name}: the customer is told what to do`);
      } else {
        assert.equal(bannerCount, 1, `${flow.name}: one banner`);
        const banner = page.getByText(BANNER_TITLE, { exact: true });
        const box = await banner.boundingBox();
        const { height } = flow.device.viewport;
        assert.ok(box && box.y >= 0 && box.y + box.height <= height, `${flow.name}: banner in view`);
        const onTop = await banner.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return !!hit && (hit === element || element.contains(hit) || hit.contains(element));
        });
        assert.ok(onTop, `${flow.name}: banner not covered`);
        record.bannerTop = Math.round(box.y);
      }
    }
    record.typed = [typedBefore, String(await flow.typed(page)).trim()];
    if (mode === "after") assert.equal(record.typed[1], record.typed[0], `${flow.name}: what was typed stays`);
    const pageErrors = errors.filter((error) => / page: /.test(error));
    assert.deepEqual(pageErrors, [], `${flow.name}/${mode}: page errors`);
    return record;
  } finally {
    await context.close();
  }
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const records = [];
try {
  for (const flow of FLOWS) {
    for (const [mode, base] of builds) {
      const record = await run(browser, base, flow, mode);
      records.push(record);
      console.log(JSON.stringify(record));
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${out}/results.json`, `${JSON.stringify(records, null, 1)}\n`);
console.log(`${records.filter((r) => r.mode === "after").length} flows checked, all passed`);
