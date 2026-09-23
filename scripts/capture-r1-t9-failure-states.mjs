// R1-T9 — capture desktop screens as they render when their data loads and when an
// essential request fails. Synthetic and loopback-only: every /api request is answered
// by scripts/desktop-shots/retail-fixtures.mjs (or failed here with a 500), and every
// other origin — the page's analytics, the Replit dev banner — is blocked.
//
//   R1T9_AFTER_URL=http://127.0.0.1:5199 [R1T9_BEFORE_URL=http://127.0.0.1:5198] \
//   [R1T9_SCREENS=retail-stock,retail-terminal] R1T9_OUT=<dir> node scripts/capture-r1-t9-failure-states.mjs
//
// With a build from before the change (R1T9_BEFORE_URL), both are captured in the same
// run from the same fixtures, and each screen's loaded view must match pixel for pixel:
// R1-T9 changes what a failure looks like, never what loaded data looks like.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";

const out = process.env.R1T9_OUT ?? "/tmp/taptpay-r1-t9";
// Every capture sees the same "now" (the fixtures' dates are relative to it). A chart
// drawn against the live clock shifts a few pixels between captures seconds apart.
const RUN_AT = Date.now();
const builds = [
  ["before", process.env.R1T9_BEFORE_URL],
  ["after", process.env.R1T9_AFTER_URL ?? "http://127.0.0.1:5199"],
].filter(([, url]) => url);
for (const [, url] of builds) assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "local servers only");

/** Each screen, the request whose failure it must not disguise, and any step to reach it. */
const SCREENS = [
  { name: "retail-analytics", path: "/transactions", essential: `/api/merchants/${MERCHANT_ID}/transactions` },
  { name: "retail-stock", path: "/stock", essential: `/api/merchants/${MERCHANT_ID}/stock-items` },
  { name: "retail-terminal", path: "/terminal", essential: `/api/merchants/${MERCHANT_ID}/transactions` },
  {
    name: "retail-terminal-stock-tiles", path: "/terminal", essential: `/api/merchants/${MERCHANT_ID}/stock-items`,
    prepare: (page) => page.getByRole("button", { name: "stock tiles" }).click(),
  },
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
 * Pixels that differ at all, and pixels that differ visibly: by more than 2 in some
 * channel. The first can be non-zero for one build captured twice — a gradient's
 * rasterisation varies by a shade — so the check is on the second.
 */
async function differingPixels(left, right) {
  const a = PNG.sync.read(await readFile(left));
  const b = PNG.sync.read(await readFile(right));
  if (a.width !== b.width || a.height !== b.height) return { any: Number.POSITIVE_INFINITY, visible: Number.POSITIVE_INFINITY };
  let any = 0;
  let visible = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data.readUInt32BE(i) === b.data.readUInt32BE(i)) continue;
    any += 1;
    if ([0, 1, 2, 3].some((k) => Math.abs(a.data[i + k] - b.data[i + k]) > 2)) visible += 1;
  }
  return { any, visible };
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
      const { any, visible } = await differingPixels(files["before-loaded"], files["after-loaded"]);
      console.log(`${screen.name}: loaded view, before vs after: ${visible} visibly differing pixels (${any} differing at all)`);
      assert.equal(visible, 0, `${screen.name}: the loaded view changed`);
    }
  }
} finally {
  await browser.close();
}
