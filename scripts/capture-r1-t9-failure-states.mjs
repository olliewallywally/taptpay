// R1-T9 — capture desktop screens as they render when their data loads and when an
// essential request fails. Synthetic and loopback-only: every /api request is answered
// by scripts/desktop-shots/retail-fixtures.mjs (or failed here with a 500), and every
// other origin — the page's analytics, the Replit dev banner — is blocked.
//
//   R1T9_AFTER_URL=http://127.0.0.1:5199 [R1T9_BEFORE_URL=http://127.0.0.1:5198] \
//   R1T9_OUT=<dir> node scripts/capture-r1-t9-failure-states.mjs
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
const builds = [
  ["before", process.env.R1T9_BEFORE_URL],
  ["after", process.env.R1T9_AFTER_URL ?? "http://127.0.0.1:5199"],
].filter(([, url]) => url);
for (const [, url] of builds) assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "local servers only");

/** Each screen, and the request whose failure it must not disguise. */
const SCREENS = [
  { name: "retail-analytics", path: "/transactions", essential: `/api/merchants/${MERCHANT_ID}/transactions` },
];

async function capture(browser, base, screen, mode, file) {
  const { context, page, errors } = await newRetailPage(browser, `${screen.name}/${mode}`, {
    viewport: { width: 1440, height: 900 },
  });
  const local = new URL(base).origin;
  await page.route((url) => url.origin !== local, (route) => route.abort("blockedbyclient"));
  if (mode === "failed") {
    // Registered last, so it wins over the fixture for the same path.
    await page.route(`**${screen.essential}`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "synthetic outage" }) }));
  }
  await page.goto(`${base}${screen.path}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500); // the page's entry cascade
  await page.screenshot({ path: file });
  await context.close();
  const pageErrors = errors.filter((error) => / page: /.test(error));
  assert.deepEqual(pageErrors, [], `${file}: page errors`);
  return file;
}

async function differingPixels(left, right) {
  const a = PNG.sync.read(await readFile(left));
  const b = PNG.sync.read(await readFile(right));
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) if (a.data.readUInt32BE(i) !== b.data.readUInt32BE(i)) differing += 1;
  return differing;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
try {
  for (const screen of SCREENS) {
    const files = {};
    for (const [label, base] of builds) {
      for (const mode of ["loaded", "failed"]) {
        files[`${label}-${mode}`] = await capture(browser, base, screen, mode, `${out}/${label}-${screen.name}-${mode}.png`);
        console.log(files[`${label}-${mode}`]);
      }
    }
    if (files["before-loaded"]) {
      const differing = await differingPixels(files["before-loaded"], files["after-loaded"]);
      console.log(`${screen.name}: loaded view, before vs after: ${differing} differing pixels`);
      assert.equal(differing, 0, `${screen.name}: the loaded view changed`);
    }
  }
} finally {
  await browser.close();
}
