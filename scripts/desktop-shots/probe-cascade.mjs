/* Cascade coverage audit for the tablet/desktop app.
 *
 * `probe-transitions.mjs` proves the chrome survives a hop and nothing paints
 * over it. It says nothing about the thing that replaced the old page
 * transition: the per-screen entry cascade. This probe covers that gap.
 *
 * For every screen it lands on, it samples `document.getAnimations()` straight
 * after the hop and reports how many elements are actually running
 * `desktopBounceIn`, and how deep the stagger goes.
 *
 * Two failures gate the run:
 *   - NO CASCADE — a screen entered without a single running animation. Either
 *     its blocks were never wired, or they mounted too late to be part of the
 *     entry.
 *   - STUCK INVISIBLE — an element carrying `.dt-rise`/`.dt-cascade > *` that
 *     settled at opacity 0. This is the expensive one: the rule ships
 *     `opacity: 0` with an `animation-…: both` fill, so a block whose animation
 *     never runs is not merely un-animated, it is permanently invisible. That is
 *     a blank region of a screen, and nothing else in the suite would catch it.
 *
 * Usage: dev server on :5000, single instance.
 *   node scripts/desktop-shots/probe-cascade.mjs
 */

import { BASE_URL, newRetailPage, CHROMIUM_PATH } from "./retail-fixtures.mjs";
import { chromium } from "playwright";

/* 52ms per step x the 10 indexed steps + the 540ms keyframe, plus headroom.
   Sampling must happen inside this window or every animation is already done. */
const CASCADE_WINDOW_MS = 1100;
const PRELOAD_DRAIN_MS = 20_000;

/* Every screen of the 3 verticals x 5, plus the two shared surfaces. Nav-bar
   hops and pushState hops both matter: they mount the page slot by different
   paths, and only the nav hops go through the bubble. */
const NAV_HOPS = [
  { label: "stock", path: "/stock", page: "directory" },
  { label: "terminal", path: "/terminal", page: "terminal" },
  { label: "analytics", path: "/transactions", page: "analytics" },
  { label: "settings", path: "/settings", page: "settings" },
  { label: "home", path: "/dashboard", page: "home" },
];
const PUSH_ROUTES = [
  { route: "/property", vertical: "property", page: "home" },
  { route: "/property/tenants", vertical: "property", page: "directory" },
  { route: "/property/terminal", vertical: "property", page: "terminal" },
  { route: "/property/analytics", vertical: "property", page: "analytics" },
  { route: "/trades", vertical: "trades", page: "home" },
  { route: "/trades/clients", vertical: "trades", page: "directory" },
  { route: "/trades/terminal", vertical: "trades", page: "terminal" },
  { route: "/trades/analytics", vertical: "trades", page: "analytics" },
];

const DEVICE_CLASSES = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: false }],
];

/* Runs in the page via `page.evaluate` — serialised, so no closure. */
const SAMPLE = (since) => {
  const bounce = document
    .getAnimations()
    .filter((a) => {
      const startTime = a.startTime;
      return (
        a.animationName === "desktopBounceIn" &&
        a.playState === "running" &&
        typeof startTime === "number" &&
        startTime >= since - 80
      );
    });
  const delays = bounce.map((a) => {
    const el = a.effect?.target;
    const d = el ? parseFloat(getComputedStyle(el).animationDelay) || 0 : 0;
    return d;
  });
  return {
    count: bounce.length,
    /* Distinct delays = how many stagger steps the screen actually uses. A
       screen where every block shares one delay is wired but not sequenced. */
    steps: [...new Set(delays.map((d) => Math.round(d * 1000)))].sort((a, b) => a - b),
  };
};

/* Run after the cascade window has closed: anything still transparent is stuck. */
const FIND_STUCK = () => {
  const out = [];
  for (const el of document.querySelectorAll(".dt-rise, .dt-cascade > *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (parseFloat(cs.opacity) < 0.05) {
      out.push(
        `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 3).join(".")}`,
      );
    }
  }
  return out;
};

async function probe(browser, label, contextOptions) {
  const { context, page, errors } = await newRetailPage(browser, label, contextOptions);

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  /* Let route preloading settle, so a cold lazy chunk does not land mid-sample
     and read as "no cascade" when it is really just late. */
  await page.waitForTimeout(PRELOAD_DRAIN_MS);

  const screens = [];
  const visit = async (name, expected, act) => {
    const since = await page.evaluate(() => performance.now());
    await act();
    /* Sample early and repeatedly: blocks are staggered, so one snapshot can
       miss the head or tail of the sequence. Keep the richest sample. */
    let best = { count: 0, steps: [] };
    const deadline = Date.now() + CASCADE_WINDOW_MS;
    while (Date.now() < deadline) {
      const s = await page.evaluate(SAMPLE, since);
      if (s.count > best.count) best = s;
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(400); // let every delayed animation finish
    const [stuck, actual] = await Promise.all([
      page.evaluate(FIND_STUCK),
      page.evaluate(() => {
        const surface = document.querySelector("[data-desktop-page]");
        return {
          path: location.pathname,
          page: surface?.dataset.desktopPage ?? null,
          vertical: surface?.dataset.desktopVertical ?? null,
        };
      }),
    ]);
    const wrongRoute =
      actual.path !== expected.path ||
      actual.page !== expected.page ||
      actual.vertical !== expected.vertical;
    screens.push({ name, ...best, stuck, expected, actual, wrongRoute });
  };

  for (const nav of NAV_HOPS) {
    await visit(
      `nav → ${nav.label}`,
      { path: nav.path, vertical: "retail", page: nav.page },
      () => page.getByRole("button", { name: nav.label, exact: true }).click(),
    );
  }
  for (const spec of PUSH_ROUTES) {
    await visit(
      `push → ${spec.route}`,
      { path: spec.route, ...spec },
      () => page.evaluate((p) => {
        history.pushState({}, "", p);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, spec.route),
    );
  }

  await context.close();
  return { screens, errors };
}

function report(label, screens) {
  console.log(`\n########## ${label} ##########`);
  for (const s of screens) {
    const verdict = s.count === 0 ? "NO CASCADE" : `${String(s.count).padStart(3)} blocks`;
    const stagger = s.steps.length > 1 ? `${s.steps.length} steps (${s.steps.join("/")}ms)` : s.count ? "single step" : "—";
    const stuck = s.stuck.length ? `   STUCK INVISIBLE ×${s.stuck.length}: ${s.stuck.slice(0, 3).join(", ")}` : "";
    const wrong = s.wrongRoute ? `   WRONG SURFACE: ${s.actual.path} ${s.actual.vertical ?? "?"}/${s.actual.page ?? "?"}` : "";
    console.log(`  ${s.name.padEnd(26)} ${verdict.padEnd(12)} ${stagger.padEnd(28)}${stuck}${wrong}`);
  }
  const dead = screens.filter((s) => s.count === 0);
  const stuck = screens.filter((s) => s.stuck.length);
  const flat = screens.filter((s) => s.count > 0 && s.steps.length === 1);
  const wrong = screens.filter((s) => s.wrongRoute);
  console.log(
    `  → ${screens.length - dead.length}/${screens.length} screens cascade` +
      `, ${flat.length} land in a single step, ${stuck.length} left an element invisible, ${wrong.length} wrong surfaces`,
  );
  return { total: screens.length, dead: dead.length, stuck: stuck.length, flat: flat.length, wrong: wrong.length };
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const totals = [];
try {
  for (const [label, opts] of DEVICE_CLASSES) {
    const { screens, errors } = await probe(browser, label, opts);
    const total = report(label, screens);
    total.errors = errors.length;
    totals.push([label, total]);
    if (errors.length) console.log(`  ${label} page errors (${errors.length}): ${errors[0]}`);
  }
} finally {
  await browser.close();
}

console.log("\n===== summary =====");
let bad = 0;
for (const [label, t] of totals) {
  console.log(
    `${label}: ${t.total - t.dead}/${t.total} screens cascade, ${t.stuck} with a stuck-invisible element` +
      `, ${t.wrong} wrong surfaces, ${t.errors} browser/HTTP errors — informational: ${t.flat} single-step screens`,
  );
  bad += t.dead + t.stuck + t.wrong + t.errors;
}
/* Single-step screens are reported, never gated: a screen with one entry block
   is legitimately one step. Only a missing cascade or an invisible block fails. */
console.log(bad ? `\nFAIL — ${bad} screen-level cascade defects` : "\nPASS — every screen cascades, nothing left invisible");
process.exit(bad ? 1 : 0);
