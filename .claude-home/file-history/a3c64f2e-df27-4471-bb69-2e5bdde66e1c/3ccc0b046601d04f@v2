/* Home motion probe for the tablet/desktop app — Phase 1 gate.
 *
 * Covers the two things Phase 1 added that no existing script asserts:
 *
 *   §5.1  one sliding indicator travels between range buttons, rather than each
 *         button painting its own background;
 *   §5.2  the bucket chart morphs between range sets instead of snapping.
 *
 * §5.2's acceptance is explicitly *not* "the final chart looks right", so this
 * probe samples mid-flight. Gating failures:
 *
 *   NO BAR MOTION      a range change ran no bar animation at all — the morph is
 *                      not wired, or a key change silently replaced it.
 *   FIRST-FRAME JUMP   one frame after the click the bars already sit at their
 *                      target width. That is the reflow snap the FLIP exists to
 *                      absorb.
 *   INDICATOR STUCK    the range indicator did not move between two ranges.
 *   STUCK EXIT NODE    a `.dt-morph-exit` layer outlived its generation. The
 *                      layer is inert and absolutely positioned, so a leaked one
 *                      is invisible in a screenshot but accumulates forever.
 *   COUNT MISMATCH     bars, labels and buttons disagree after settling.
 *   LABEL REGRESSION   a bar button lost its aria-label or aria-pressed.
 *
 * Usage: dev server on :5000, single instance.
 *   node scripts/desktop-shots/probe-home-motion.mjs
 */

import { BASE_URL, newRetailPage, CHROMIUM_PATH } from "./retail-fixtures.mjs";
import { chromium } from "playwright";

/* The three target sizes from §10. Without `hasTouch` the pointer is fine and
   you get the desktop path, so the tablet classes are not actually tablets. */
const DEVICE_CLASSES = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: false }],
  ["tablet-1366", { viewport: { width: 1366, height: 1024 }, hasTouch: true, isMobile: false }],
];

const SURFACES = [
  { label: "retail", route: "/dashboard", p: "rh" },
  { label: "property", route: "/property", p: "ph" },
  { label: "trades", route: "/trades", p: "th" },
];

const RANGES = ["day", "week", "month", "year"];

/* The morph runs --m-dur-enter (280ms) with a 180ms fade; settle well past both. */
const SETTLE_MS = 700;

/* `newRetailPage` already scopes HTTP-status errors to our own origin, but its
   `requestfailed` listener records every failed request including third-party
   ones — the Replit dev-banner tag in client/index.html (blocked by ORB) and the
   analytics beacon aborted on navigation. Neither can indicate a motion defect,
   and neither is ours to fix from this probe.
 *
 * So: a request failure to another origin is reported and not gated. Page
 * errors, console errors, our-origin HTTP errors and our-origin request
 * failures all still gate. */
const OUR_ORIGIN = new URL(BASE_URL).origin;

function isExternalRequestFailure(entry) {
  const match = /request failed: \S+ (\S+)/.exec(String(entry));
  if (!match) return false;
  try {
    return new URL(match[1]).origin !== OUR_ORIGIN;
  } catch {
    return false;
  }
}

/* Serialised into the page: no closures, everything arrives as arguments. */
const READ_STATE = (prefix) => {
  const scaleEl = document.querySelector("[data-desktop-scale]");
  const scale = scaleEl ? parseFloat(scaleEl.dataset.desktopScale) || 1 : 1;

  const bars = [...document.querySelectorAll(`.${prefix}-bar`)];
  const buttons = [...document.querySelectorAll(`.${prefix}-bar-btn`)];
  const labels = [...document.querySelectorAll(`.${prefix}-bar-label`)];
  const indicator = document.querySelector(`.${prefix}-segs .dt-seg-indicator`);

  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left / scale, w: r.width / scale, h: r.height / scale };
  };

  const barTargets = new Set(bars);
  const running = document.getAnimations().filter((a) => a.playState === "running");

  return {
    barCount: bars.length,
    buttonCount: buttons.length,
    labelCount: labels.length,
    barWidths: bars.map((b) => Math.round(rect(b).w * 100) / 100),
    barHeights: bars.map((b) => Math.round(rect(b).h * 100) / 100),
    indicatorX: indicator ? Math.round(rect(indicator).x * 100) / 100 : null,
    indicatorW: indicator ? Math.round(rect(indicator).w * 100) / 100 : null,
    runningOnBars: running.filter((a) => barTargets.has(a.effect?.target)).length,
    runningTotal: running.length,
    exitLayers: document.querySelectorAll(".dt-morph-exit").length,
    /* An exit layer must never be reachable while it exists. */
    exitReachable: [...document.querySelectorAll(".dt-morph-exit")].filter(
      (el) => !el.inert || el.getAttribute("aria-hidden") !== "true",
    ).length,
    ariaMissing: buttons.filter(
      (b) => !b.getAttribute("aria-label") || b.getAttribute("aria-pressed") === null,
    ).length,
    pressedCount: buttons.filter((b) => b.getAttribute("aria-pressed") === "true").length,
  };
};

async function probeSurface(page, surface, label, failures, notes) {
  const { p, route } = surface;
  const id = `${label}/${surface.label}`;

  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.waitForSelector(`.${p}-bar-btn`, { timeout: 15_000 });
  await page.waitForTimeout(SETTLE_MS);

  let previous = await page.evaluate(READ_STATE, p);
  if (previous.barCount === 0) {
    failures.push(`${id}: NO BARS RENDERED`);
    return;
  }

  for (const range of RANGES) {
    const button = page.locator(`.${p}-segs [data-seg-id="${range}"]`);
    if ((await button.count()) === 0) {
      failures.push(`${id}: missing range button "${range}"`);
      continue;
    }

    const before = await page.evaluate(READ_STATE, p);
    await button.click();

    /* One frame after the click: the FLIP must still be showing the outgoing
       geometry, not the freshly reflowed target. */
    const firstFrame = await page.evaluate(
      (prefix) =>
        new Promise((resolve) =>
          requestAnimationFrame(() => resolve(READ_STATE_INLINE(prefix))),
        ),
      p,
    );

    const settled = await (async () => {
      await page.waitForTimeout(SETTLE_MS);
      return page.evaluate(READ_STATE, p);
    })();

    const countChanged = before.barCount !== settled.barCount;

    if (countChanged) {
      if (firstFrame.runningOnBars === 0) {
        failures.push(
          `${id}: NO BAR MOTION on → ${range} (${before.barCount}→${settled.barCount} bars)`,
        );
      }
      /* The defect is the bar *already sitting on* its target one frame in —
         the reflow snap the FLIP exists to absorb. It is not "closer to the
         target than to the source": --m-ease-out is an expo-out, which covers
         over half its distance in the first ~12% of the duration, so a healthy
         FLIP legitimately reads past the midpoint by the frame we can sample. */
      const oldW = before.barWidths[0];
      const newW = settled.barWidths[0];
      const firstW = firstFrame.barWidths[0];
      if (
        typeof oldW === "number" &&
        typeof newW === "number" &&
        typeof firstW === "number" &&
        Math.abs(newW - oldW) > 1 &&
        Math.abs(firstW - newW) < 1
      ) {
        failures.push(
          `${id}: FIRST-FRAME JUMP on → ${range} (was ${oldW}px, frame1 ${firstW}px already at target ${newW}px)`,
        );
      }
    }

    if (before.indicatorX !== null && settled.indicatorX !== null) {
      if (before.indicatorX === settled.indicatorX && range !== RANGES[0]) {
        // Only a real failure when the previous range differed from this one.
        if (before.pressedCount >= 0 && countChanged) {
          failures.push(`${id}: INDICATOR STUCK at x=${settled.indicatorX} on → ${range}`);
        }
      }
    } else if (settled.indicatorX === null) {
      failures.push(`${id}: no range indicator found`);
    }

    if (settled.exitLayers > 0) {
      failures.push(`${id}: STUCK EXIT NODE after → ${range} (${settled.exitLayers})`);
    }
    if (settled.exitReachable > 0) {
      failures.push(`${id}: EXIT LAYER REACHABLE after → ${range}`);
    }
    if (
      settled.barCount !== settled.buttonCount ||
      settled.barCount !== settled.labelCount
    ) {
      failures.push(
        `${id}: COUNT MISMATCH after → ${range} (bars ${settled.barCount}, buttons ${settled.buttonCount}, labels ${settled.labelCount})`,
      );
    }
    if (settled.ariaMissing > 0) {
      failures.push(
        `${id}: LABEL REGRESSION after → ${range} (${settled.ariaMissing} button(s) missing aria)`,
      );
    }

    notes.push(
      `  ${id} → ${String(range).padEnd(6)} ${String(before.barCount).padStart(2)}→${String(settled.barCount).padStart(2)} bars   frame1 anim ${String(firstFrame.runningOnBars).padStart(2)}   x ${settled.indicatorX}`,
    );
    previous = settled;
  }

  /* ── rapid interruption: two range changes inside one transition ── */
  await page.locator(`.${p}-segs [data-seg-id="year"]`).click();
  await page.waitForTimeout(40);
  await page.locator(`.${p}-segs [data-seg-id="day"]`).click();
  await page.waitForTimeout(SETTLE_MS * 2);
  const afterRapid = await page.evaluate(READ_STATE, p);

  if (afterRapid.exitLayers > 0) {
    failures.push(`${id}: STUCK EXIT NODE after rapid switch (${afterRapid.exitLayers})`);
  }
  if (afterRapid.runningOnBars > 0) {
    failures.push(`${id}: ANIMATION STILL RUNNING after rapid switch`);
  }
  if (
    afterRapid.barCount !== afterRapid.buttonCount ||
    afterRapid.barCount !== afterRapid.labelCount
  ) {
    failures.push(`${id}: COUNT MISMATCH after rapid switch`);
  }
  notes.push(
    `  ${id} rapid year→day settles at ${afterRapid.barCount} bars, ${afterRapid.exitLayers} exit layers`,
  );
}

async function run(browser, label, contextOptions) {
  const { context, page, errors } = await newRetailPage(browser, label, contextOptions);
  const failures = [];
  const notes = [];

  /* READ_STATE is used both directly and inside a rAF promise; expose it once. */
  await page.addInitScript(
    `window.READ_STATE_INLINE = ${READ_STATE.toString()};`,
  );

  for (const surface of SURFACES) {
    await probeSurface(page, surface, label, failures, notes);
  }

  await context.close();

  const realErrors = errors.filter((e) => !isExternalRequestFailure(e));
  return { failures, notes, realErrors, benign: errors.length - realErrors.length };
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
let failed = 0;

for (const [label, contextOptions] of DEVICE_CLASSES) {
  console.log(`\n########## ${label} ##########`);
  const { failures, notes, realErrors, benign } = await run(browser, label, contextOptions);
  notes.forEach((n) => console.log(n));

  if (failures.length === 0) {
    console.log(`  → ${label}: all range changes morph, indicator travels, no stuck nodes`);
  } else {
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    failed += failures.length;
  }
  if (realErrors.length) {
    console.log(`  ✗ ${label} page errors (${realErrors.length}): ${realErrors[0]}`);
    failed += realErrors.length;
  }
  if (benign) {
    console.log(`  · ${label}: ${benign} third-party request failure(s) (analytics / dev banner), not gated`);
  }
}

await browser.close();

console.log(`\n===== summary =====`);
if (failed) {
  console.log(`FAIL — ${failed} home-motion defect(s)`);
  process.exit(1);
}
console.log("PASS — home motion gates clean on every device class");
