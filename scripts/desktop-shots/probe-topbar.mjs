/* Top-bar stability probe.
 *
 * Requirement: "the very top bar with the logo and the page selection on it
 * should never move except the page selector bubble."
 *
 * Walks the nav, and after each hop re-measures the wordmark and every nav
 * label. Any drift in those boxes is a failure. The bubble is expected to move —
 * it is measured separately and must track the active item.
 *
 * Usage: dev server on :5000, single instance.
 *   node scripts/desktop-shots/probe-topbar.mjs
 */
import { BASE_URL, newRetailPage, CHROMIUM_PATH } from "./retail-fixtures.mjs";
import { chromium } from "playwright";

const NAV_HOPS = ["stock", "terminal", "analytics", "settings", "home"];
const EPSILON = 0.5; // sub-pixel tolerance: the canvas is transform-scaled

const READ = () => {
  const round = (n) => Math.round(n * 100) / 100;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
  };
  const mark = document.querySelector(".tapt-desktop-wordmark");
  const bubble = document.querySelector(".tapt-desktop-nav-bubble");
  const items = [...document.querySelectorAll(".tapt-desktop-nav-item")];
  return {
    wordmark: mark ? box(mark) : null,
    bubble: bubble ? box(bubble) : null,
    active: items.find((i) => i.getAttribute("aria-current") === "page")?.dataset.navId ?? null,
    items: items.map((i) => ({ id: i.dataset.navId, ...box(i) })),
  };
};

const drift = (a, b) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));

async function run(browser, label, contextOptions) {
  const { context, page } = await newRetailPage(browser, label, contextOptions);
  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/property/**", (r) => json(r, []));
  await page.route("**/api/trades/**", (r) => json(r, []));

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(1200);

  const base = await page.evaluate(READ);
  const rows = [];
  let failures = 0;

  for (const nav of NAV_HOPS) {
    await page.getByRole("button", { name: nav, exact: true }).click();
    await page.waitForTimeout(900); // let the 420ms bubble slide settle
    const now = await page.evaluate(READ);

    const markDrift = base.wordmark && now.wordmark ? drift(base.wordmark, now.wordmark) : 0;
    let itemDrift = 0;
    for (const item of now.items) {
      const was = base.items.find((i) => i.id === item.id);
      if (was) itemDrift = Math.max(itemDrift, drift(was, item));
    }

    /* The bubble must sit on the active item, not merely somewhere. */
    const activeBox = now.items.find((i) => i.id === now.active);
    const bubbleOff =
      activeBox && now.bubble
        ? Math.max(Math.abs(activeBox.x - now.bubble.x), Math.abs(activeBox.w - now.bubble.w))
        : Infinity;

    const ok = markDrift <= EPSILON && itemDrift <= EPSILON && bubbleOff <= 2;
    if (!ok) failures += 1;
    rows.push({ nav, markDrift, itemDrift, bubbleOff, active: now.active, ok });
  }

  await context.close();

  console.log(`\n########## ${label} ##########`);
  for (const r of rows) {
    console.log(
      `  → ${r.nav.padEnd(10)} wordmark ${r.markDrift.toFixed(2)}px   labels ${r.itemDrift.toFixed(2)}px   bubble-on-active ${r.bubbleOff.toFixed(2)}px   active=${String(r.active).padEnd(9)} ${r.ok ? "OK" : "FAIL"}`,
    );
  }
  console.log(`  → ${rows.length - failures}/${rows.length} hops held the top bar still`);
  return failures;
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
let failures = 0;
try {
  failures += await run(browser, "desktop", { viewport: { width: 1440, height: 900 } });
  failures += await run(browser, "tablet", {
    viewport: { width: 1194, height: 834 },
    hasTouch: true,
    isMobile: false,
  });
} finally {
  await browser.close();
}
console.log(`\n===== ${failures === 0 ? "PASS" : `FAIL (${failures} hops)`} =====`);
process.exit(failures === 0 ? 0 : 1);
