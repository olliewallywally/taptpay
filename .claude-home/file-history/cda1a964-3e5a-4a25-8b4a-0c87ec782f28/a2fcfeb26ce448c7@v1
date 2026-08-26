/* Desktop/tablet page-transition probe.
 *
 * Not a screenshot script — it instruments the DOM and reports, for every
 * navigation, whether the persistent app chrome (the 13" frame + header + nav)
 * survived, and whether the full-screen Suspense loader flashed in its place.
 *
 * Expected state once the transition work lands:
 *   - "chrome" must be `kept` on every hop (no unmount/remount of the frame).
 *   - "loader" must be `no` on every hop, cold cache included.
 *
 * Usage: dev server on :5000, single instance.
 *   node scripts/desktop-shots/probe-transitions.mjs
 *   node scripts/desktop-shots/probe-transitions.mjs --shots   (mid-transition PNGs)
 */
import { mkdir } from "node:fs/promises";
import { BASE_URL, newRetailPage, CHROMIUM_PATH } from "./retail-fixtures.mjs";
import { chromium } from "playwright";

const OUT = "/tmp/taptpay-transitions";
const WANT_SHOTS = process.argv.includes("--shots");
// Long enough for the 16-route DESKTOP_PRELOAD_ROUTES idle chain to drain, so a
// "warm" hop really is warm.
const PRELOAD_DRAIN_MS = 20_000;
// In dev, an unrelated file save makes Vite issue a `full-reload`, which wipes
// the injected instrumentation and resets every React.lazy wrapper. Re-inject
// before each hop and read the events back per hop rather than keeping one
// global timeline, so a stray reload costs one row instead of the whole run.

const INSTRUMENT = () => {
  const w = window;
  if (w.__probe) return;
  w.__probe = { ev: [], t0: performance.now() };
  const log = (type, detail) =>
    w.__probe.ev.push({ t: +(performance.now() - w.__probe.t0).toFixed(1), type, detail });
  w.__probeMark = (label) => log("MARK", label);

  const hasFrame = (n) =>
    n instanceof HTMLElement &&
    (n.matches?.("[data-testid='desktop-frame']") ||
      !!n.querySelector?.("[data-testid='desktop-frame']"));

  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.removedNodes) if (hasFrame(n)) log("chrome-unmounted", null);
      for (const n of r.addedNodes) {
        if (hasFrame(n)) log("chrome-mounted", null);
        if (
          n instanceof HTMLElement &&
          (n.classList?.contains("animate-spin") || n.querySelector?.(".animate-spin"))
        )
          log("suspense-loader", null);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
};

/* Nav-bar clicks within the retail vertical, run twice: lap 1 initialises each
   React.lazy wrapper, lap 2 is the steady state. */
const NAV_HOPS = ["stock", "terminal", "analytics", "settings", "home"];

/* Routes the nav bar cannot reach: the other two verticals, a quick action with
   a one-shot param, and the two legacy mobile-in-a-column screens. */
const PUSH_ROUTES = [
  "/property",
  "/property/tenants",
  "/property/terminal",
  "/property/analytics",
  "/trades",
  "/trades/clients",
  "/trades/terminal",
  "/trades/analytics",
  "/terminal?quick=1",
  "/property/tenants/1",
  "/board-builder",
];

const DEVICE_CLASSES = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: false }],
];

async function probe(browser, label, contextOptions) {
  const { context, page, errors } = await newRetailPage(browser, label, contextOptions);
  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/property/**", (r) => json(r, []));
  await page.route("**/api/trades/**", (r) => json(r, []));

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(PRELOAD_DRAIN_MS);

  const hops = [];
  const runHop = async (name, act, shotName) => {
    const alive = await page.evaluate(() => !!window.__probe);
    await page.evaluate(INSTRUMENT);
    await act();
    if (shotName) {
      await page.waitForTimeout(240); // ~mid-gap for the current 220ms exit + lazy init
      await page.screenshot({ path: `${OUT}/${label}-mid-${shotName}.png` });
      await page.waitForTimeout(960);
    } else {
      await page.waitForTimeout(1200);
    }
    const ev = await page.evaluate(() => {
      const out = window.__probe?.ev ?? [];
      if (window.__probe) window.__probe.ev = [];
      return out;
    });
    hops.push({ name, ev, reloadedBefore: !alive });
  };

  for (const lap of [1, 2]) {
    for (const nav of NAV_HOPS) {
      await runHop(
        `lap${lap} nav → ${nav}`,
        () => page.getByRole("button", { name: nav, exact: true }).click(),
        WANT_SHOTS && lap === 1 ? nav : null,
      );
    }
  }

  for (const route of PUSH_ROUTES) {
    await runHop(`push → ${route}`, () =>
      page.evaluate((p) => {
        history.pushState({}, "", p);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, route),
    );
  }

  await context.close();
  return { hops, errors };
}

function report(label, hops) {
  const rows = hops.map(({ name, ev, reloadedBefore }) => {
    const unmount = ev.find((e) => e.type === "chrome-unmounted");
    const mount = unmount ? ev.find((e) => e.type === "chrome-mounted" && e.t >= unmount.t) : null;
    return {
      hop: name,
      chrome: unmount ? "REMOUNTED" : "kept",
      gap: unmount && mount ? mount.t - unmount.t : 0,
      loader: ev.some((e) => e.type === "suspense-loader"),
      reloadedBefore,
    };
  });

  console.log(`\n########## ${label} ##########`);
  for (const r of rows) {
    console.log(
      `  ${r.hop.padEnd(26)} chrome: ${r.chrome.padEnd(10)} blank ${String(r.gap.toFixed(1)).padStart(7)}ms   loader: ${r.loader ? "YES — full-screen flash" : "no"}${r.reloadedBefore ? "   [vite full-reload before this hop]" : ""}`,
    );
  }
  const remounts = rows.filter((r) => r.chrome === "REMOUNTED").length;
  const loaders = rows.filter((r) => r.loader).length;
  console.log(`  → ${remounts}/${rows.length} hops remounted the chrome, ${loaders} showed the full-screen loader`);
  return { remounts, loaders, total: rows.length };
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const totals = [];
try {
  for (const [label, opts] of DEVICE_CLASSES) {
    const { hops, errors } = await probe(browser, label, opts);
    totals.push([label, report(label, hops)]);
    if (errors.length) console.log(`  ${label} page errors (${errors.length}): ${errors[0]}`);
  }
} finally {
  await browser.close();
}

console.log("\n===== summary =====");
let bad = 0;
for (const [label, t] of totals) {
  console.log(`${label}: ${t.remounts} chrome remounts, ${t.loaders} loader flashes (of ${t.total} hops)`);
  bad += t.remounts + t.loaders;
}
if (WANT_SHOTS) console.log(`mid-transition screenshots → ${OUT}`);
process.exitCode = bad === 0 ? 0 : 1;
