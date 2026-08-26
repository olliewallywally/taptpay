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
const NAV_HOPS = ["home", "stock", "terminal", "analytics", "settings"];
const PUSH_ROUTES = [
  "/property",
  "/property/tenants",
  "/property/terminal",
  "/property/analytics",
  "/trades",
  "/trades/clients",
  "/trades/terminal",
  "/trades/analytics",
];

const DEVICE_CLASSES = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: false }],
];

/* Runs in the page via `page.evaluate` — serialised, so no closure. */
const SAMPLE = () => {
  const running = document
    .getAnimations()
    .filter((a) => a.animationName === "desktopBounceIn" || a.constructor.name === "CSSAnimation");
  const bounce = running.filter((a) => {
    const name = a.animationName ?? "";
    return name === "desktopBounceIn";
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
  const visit = async (name, act) => {
    await act();
    /* Sample early and repeatedly: blocks are staggered, so one snapshot can
       miss the head or tail of the sequence. Keep the richest sample. */
    let best = { count: 0, steps: [] };
    const deadline = Date.now() + CASCADE_WINDOW_MS;
    while (Date.now() < deadline) {
      const s = await page.evaluate(SAMPLE);
      if (s.count > best.count) best = s;
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(400); // let every delayed animation finish
    const stuck = await page.evaluate(FIND_STUCK);
    screens.push({ name, ...best, stuck });
  };

  for (const nav of NAV_HOPS) {
    await visit(`nav → ${nav}`, () =>
      page.getByRole("button", { name: nav, exact: true }).click(),
    );
  }
  for (const route of PUSH_ROUTES) {
    await visit(`push → ${route}`, () =>
      page.evaluate((p) => {
        history.pushState({}, "", p);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, route),
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
    console.log(`  ${s.name.padEnd(26)} ${verdict.padEnd(12)} ${stagger.padEnd(28)}${stuck}`);
  }
  const dead = screens.filter((s) => s.count === 0);
  const stuck = screens.filter((s) => s.stuck.length);
  const flat = screens.filter((s) => s.count > 0 && s.steps.length === 1);
  console.log(
    `  → ${screens.length - dead.length}/${screens.length} screens cascade` +
      `, ${flat.length} land in a single step, ${stuck.length} left an element invisible`,
  );
  return { total: screens.length, dead: dead.length, stuck: stuck.length, flat: flat.length };
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const totals = [];
try {
  for (const [label, opts] of DEVICE_CLASSES) {
    const { screens, errors } = await probe(browser, label, opts);
    totals.push([label, report(label, screens)]);
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
      `  —  informational: ${t.flat} single-step screens`,
  );
  bad += t.dead + t.stuck;
}
/* Single-step screens are reported, never gated: a screen with one entry block
   is legitimately one step. Only a missing cascade or an invisible block fails. */
console.log(bad ? `\nFAIL — ${bad} screen-level cascade defects` : "\nPASS — every screen cascades, nothing left invisible");
process.exit(bad ? 1 : 0);
