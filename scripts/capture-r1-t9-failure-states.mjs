// R1-T9 — capture desktop screens as they render when their data loads and when an
// essential request fails. Synthetic and loopback-only: every /api request is answered
// by scripts/desktop-shots/retail-fixtures.mjs or the property or trades fixtures (or
// failed here with a 500), and every other origin — the page's analytics, the Replit
// dev banner — is blocked.
//
//   R1T9_AFTER_URL=http://127.0.0.1:5199 [R1T9_BEFORE_URL=http://127.0.0.1:5198] \
//   [R1T9_SCREENS=retail-stock,retail-terminal] R1T9_OUT=<dir> node scripts/capture-r1-t9-failure-states.mjs
//
// With a build from before the change (R1T9_BEFORE_URL), both are captured in the same
// run from the same fixtures, and each screen's loaded view must match: R1-T9 changes
// what a failure looks like, never what loaded data looks like.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import playwrightCore from "playwright-core/lib/coreBundle";
import { PNG } from "pngjs";
import { CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
import { installPropertyData } from "./desktop-shots/property-fixtures.mjs";
import { installTradesData } from "./desktop-shots/trades-fixtures.mjs";

const out = process.env.R1T9_OUT ?? "/tmp/taptpay-r1-t9";
// Every capture sees the same "now" (the fixtures' dates are relative to it). A chart
// drawn against the live clock shifts a few pixels between captures seconds apart.
const RUN_AT = Date.now();
const builds = [
  ["before", process.env.R1T9_BEFORE_URL],
  ["after", process.env.R1T9_AFTER_URL ?? "http://127.0.0.1:5199"],
].filter(([, url]) => url);
for (const [, url] of builds) assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "local servers only");

/**
 * Each screen, the request whose failure it must not disguise, any data beyond the
 * retail fixtures (`install`), and any step to reach it (`prepare`).
 */
const SCREENS = [
  { name: "retail-analytics", path: "/transactions", essential: `/api/merchants/${MERCHANT_ID}/transactions` },
  {
    name: "retail-analytics-boards-reports", path: "/transactions", essential: `/api/merchants/${MERCHANT_ID}/tapt-stones`,
    prepare: (page) => page.getByRole("button", { name: "Reports", exact: true }).click(),
  },
  { name: "retail-analytics-business-details", path: "/transactions", essential: `/api/merchants/${MERCHANT_ID}/profile` },
  { name: "retail-stock", path: "/stock", essential: `/api/merchants/${MERCHANT_ID}/stock-items` },
  { name: "retail-terminal", path: "/terminal", essential: `/api/merchants/${MERCHANT_ID}/transactions` },
  {
    name: "retail-terminal-stock-tiles", path: "/terminal", essential: `/api/merchants/${MERCHANT_ID}/stock-items`,
    prepare: (page) => page.getByRole("button", { name: "stock tiles" }).click(),
  },
  { name: "property-analytics", path: "/property/analytics", essential: "/api/property/invoices", install: installPropertyData },
  { name: "property-analytics-tenants", path: "/property/analytics", essential: "/api/property/tenants", install: installPropertyData },
  { name: "property-terminal", path: "/property/terminal", essential: "/api/property/invoices", install: installPropertyData },
  {
    name: "property-terminal-tenants", path: "/property/terminal", essential: "/api/property/tenants", install: installPropertyData,
    prepare: (page) => page.getByRole("button", { name: "select tenant" }).click(),
  },
  {
    name: "property-terminal-automation", path: "/property/terminal", essential: "/api/property/reminder-settings", install: installPropertyData,
    prepare: (page) => page.getByRole("button", { name: "automation" }).click(),
  },
  { name: "trades-analytics", path: "/trades/analytics", essential: "/api/trades/invoices", install: installTradesData },
  { name: "trades-analytics-clients", path: "/trades/analytics", essential: "/api/trades/clients", install: installTradesData },
  { name: "trades-analytics-quotes", path: "/trades/analytics", essential: "/api/trades/quotes", install: installTradesData },
];

async function capture(browser, base, screen, mode, file) {
  // Reduced motion: the app then draws every entrance in its settled state, so two
  // builds whose chunks load in a different order are captured in the same state.
  const { context, page, errors } = await newRetailPage(browser, `${screen.name}/${mode}`, {
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const local = new URL(base).origin;
  await page.clock.setFixedTime(RUN_AT);
  await page.route((url) => url.origin !== local, (route) => route.abort("blockedbyclient"));
  if (screen.install) await screen.install(page);
  if (mode === "failed") {
    // Registered last, so it wins over the fixture for the same path.
    await page.route(`**${screen.essential}`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "synthetic outage" }) }));
  }
  await page.goto(`${base}${screen.path}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500); // the page's entry cascade
  if (screen.prepare) {
    await screen.prepare(page);
    await page.waitForTimeout(1500);
  }
  // Finish any entrance animation first: a list still settling differs by a few
  // thousand pixels between two captures of one build.
  await page.screenshot({ path: file, animations: "disabled" });
  await context.close();
  const pageErrors = errors.filter((error) => / page: /.test(error));
  assert.deepEqual(pageErrors, [], `${file}: page errors`);
  return file;
}

/**
 * Playwright's own screenshot comparison, the one `toHaveScreenshot` uses: pixelmatch,
 * ignoring anti-aliased pixels. One build captured twice still differs by a shade on a
 * few edges (the sliding tab highlight, a pill's outline), which a raw pixel count
 * would report as a change. The raw count is printed as well.
 */
const compareScreenshots = playwrightCore.utils.getComparator("image/png");
async function compareLoaded(left, right) {
  const [leftPng, rightPng] = [await readFile(left), await readFile(right)];
  const verdict = compareScreenshots(rightPng, leftPng, {});
  const a = PNG.sync.read(leftPng);
  const b = PNG.sync.read(rightPng);
  let raw = 0;
  if (a.width !== b.width || a.height !== b.height) raw = Number.POSITIVE_INFINITY;
  else for (let i = 0; i < a.data.length; i += 4) if (a.data.readUInt32BE(i) !== b.data.readUInt32BE(i)) raw += 1;
  return { verdict: verdict ? verdict.errorMessage.split("\n")[0] : null, raw };
}

const only = process.env.R1T9_SCREENS?.split(",").filter(Boolean);
if (only) for (const name of only) assert.ok(SCREENS.some((screen) => screen.name === name), `unknown screen ${name}`);

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
try {
  for (const screen of SCREENS.filter((candidate) => !only || only.includes(candidate.name))) {
    const files = {};
    for (const [label, base] of builds) {
      for (const mode of ["loaded", "failed"]) {
        files[`${label}-${mode}`] = await capture(browser, base, screen, mode, `${out}/${label}-${screen.name}-${mode}.png`);
        console.log(files[`${label}-${mode}`]);
      }
    }
    if (files["before-loaded"]) {
      const { verdict, raw } = await compareLoaded(files["before-loaded"], files["after-loaded"]);
      console.log(`${screen.name}: loaded view, before vs after: ${verdict ?? "match"} (${raw} pixels differ at all)`);
      assert.equal(verdict, null, `${screen.name}: the loaded view changed`);
    }
  }
} finally {
  await browser.close();
}
