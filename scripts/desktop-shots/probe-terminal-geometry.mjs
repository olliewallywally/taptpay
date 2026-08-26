/* Retail terminal geometry probe for the tablet/desktop app — Phase 2 gate.
 *
 * docs/PLAN-2026-08-15-terminal-home-refinements.md §6.5 is the only place the
 * layout contract of §4.1 becomes numbers, and numbers are the one thing a
 * screenshot script cannot check: every shot-*.mjs here proves a page renders,
 * none of them proves it renders *on the spine*. §2.1 diagnosed the current
 * terminal as three independently positioned blocks that merely look aligned at
 * one viewport, so this probe measures instead of looking. Gating failures:
 *
 *   SELECTOR NOT FOUND   a zone/rail/stack element the contract names does not
 *                        exist in that mode — the restructure has not reached it.
 *   OFF CONTRACT         a measured canvas coordinate is outside tolerance. The
 *                        line prints measured vs expected for every axis, so the
 *                        failure says which edge drifted and by how much.
 *   ZONE B OVERFLOW      Zone B is taller than 460px, i.e. its content pushes at
 *                        Zone C instead of scrolling inside itself (§4.2).
 *   STACK MOVES ON …     the collapsed stack header/search/chips shifted between
 *                        filters. §2.2's jump: the stack was bottom-anchored, so
 *                        every change of row count moved the whole shell.
 *   NO EXPANSION CONTROL no native button[aria-expanded] in the stack (§6.3).
 *                        Reported, never invented — the probe does not fall back
 *                        to clicking a div.
 *   ESCAPE …             Escape did not collapse, or did not return focus to the
 *                        expansion button (§6.3).
 *   NESTED BUTTON        a div[role="button"] in the stack contains a <button>.
 *                        §6.3 forbids it: the outer handler swallows the inner
 *                        control for keyboard and AT users.
 *
 * Every getBoundingClientRect() here is divided by the live canvas scale before
 * it is compared to anything: the app draws into a 1180x880 logical canvas that
 * DesktopShell CSS-scales to fit, so raw client pixels are viewport-dependent
 * and canvas coordinates are not.
 *
 * Scope for Phase 2: send, split and the current-sale result (share). Stock and
 * historical detail land in Phase 3 with their real behaviour; the keypad is
 * explicitly exempt from the spine in §4.2 and is never measured here.
 *
 * Usage: dev server on :5000, single instance.
 *   node scripts/desktop-shots/probe-terminal-geometry.mjs
 */

import { BASE_URL, newRetailPage, CHROMIUM_PATH } from "./retail-fixtures.mjs";
import { chromium } from "playwright";

/* The three target sizes from §10. Without `hasTouch` the pointer is fine and
   you get the desktop code path, so the tablet classes are not actually
   tablets — they have to declare touch to exercise the tablet branch. */
const DEVICE_CLASSES = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: false }],
  ["tablet-1366", { viewport: { width: 1366, height: 1024 }, hasTouch: true, isMobile: false }],
];

/* §6.5 asks for "a small documented tolerance". ±1.5px of canvas space, which
   is the most a sub-pixel layout plus one division by the canvas scale can
   accumulate (at the smallest class the scale is ~0.85, so a half-device-pixel
   rounding reads as ~0.6 canvas px). It is deliberately below the 2px that would
   let a real off-by-one border or an odd padding through. */
const TOL = 1.5;

/* Neutral `.terminal-*` utilities from §4.1; `.rt-*` are the current Retail
   stack names called out in the task. If the restructure renames the stack
   parts, this block is the only place that needs editing. */
const SEL = {
  canvas: ".tapt-desktop-canvas",
  rail: ".terminal-rail",
  zoneA: ".terminal-zone-a",
  zoneB: ".terminal-zone-b",
  zoneC: ".terminal-zone-c",
  left: ".rt-left",
  stack: ".rt-stack",
  stackHead: ".rt-stack-head",
  stackSearch: ".rt-stack-search",
  chips: ".rt-chips",
  rows: ".rt-rows",
  row: ".rt-row",
};

const WATCHED = [
  SEL.rail, SEL.zoneA, SEL.zoneB, SEL.zoneC,
  SEL.stack, SEL.stackHead, SEL.stackSearch, SEL.chips, SEL.rows,
];

/* Rail buttons are addressed by accessible name, not by class: the classes are
   being rewritten in the same change this probe gates. */
const MODES = [
  { id: "send", rail: "compose sale" },
  { id: "split", rail: "split bill" },
  { id: "share", rail: "share payment link" },
];

/* §6.5, in absolute canvas coordinates. The terminal body starts at canvas y67
   (66px header + 1px divider); these are *not* body-relative. */
const LAYOUT_SPEC = [
  { label: "rail", selector: SEL.rail, expect: { x: 550, y: 268, w: 80, h: 460 } },
  { label: "amount (zone A)", selector: SEL.zoneA, expect: { x: 713, y: 155 } },
  { label: "zone B", selector: SEL.zoneB, expect: { x: 713, y: 268, w: 340, maxH: 460 } },
  { label: "CTA (zone C)", selector: SEL.zoneC, expect: { x: 783, y: 748, w: 200, h: 46 } },
];

/* §6.2 collapsed shell and §6.3 expanded shell. `bottom` is the row viewport's
   lower edge — "rows end at y856" — not the height of the scrolled content. */
const STACK_COLLAPSED = [
  { label: "stack header", selector: SEL.stackHead, expect: { y: 488 } },
  { label: "stack search", selector: SEL.stackSearch, expect: { y: 532 } },
  { label: "filter chips", selector: SEL.chips, expect: { y: 566 } },
  { label: "rows end", selector: SEL.rows, expect: { bottom: 856 } },
];

const STACK_EXPANDED = [
  { label: "stack header", selector: SEL.stackHead, expect: { y: 93 } },
  { label: "stack search", selector: SEL.stackSearch, expect: { y: 137 } },
  { label: "filter chips", selector: SEL.chips, expect: { y: 171 } },
  { label: "rows end", selector: SEL.rows, expect: { bottom: 856 } },
];

/* Marker attribute used to hand the expansion button found in-page back to a
   Playwright locator without hardcoding a class for it. Re-applied before every
   interaction, because a React re-render can drop it. */
const EXPANDER_TAG = "data-probe-expander";

/* `newRetailPage` already scopes HTTP-status errors to our own origin, but its
   `requestfailed` listener records every failed request including third-party
   ones — the Replit dev-banner tag in client/index.html (blocked by ORB) and the
   analytics beacon aborted on navigation. Neither can indicate a layout defect,
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

/* ── in-page readers (serialised: no closures, everything is an argument) ── */

/* Canvas origin. `[data-desktop-scale]` is ScaledCanvas's transformed content
   box; `.tapt-desktop-canvas` is the 1180x880 page that lives inside it at 0,0,
   so the two rects coincide and either would work. This reads the origin from
   `.tapt-desktop-canvas` because that element *is* the coordinate system the
   plan's numbers describe, and falls back to the scale box if the shell ever
   stops rendering it. `originDelta` reports the disagreement between the two so
   a future divergence shows up in the output instead of silently biasing every
   measurement — it is 0.00/0.00 today. */
const READ_GEOMETRY = ({ selectors, canvasSelector }) => {
  const scaleEl = document.querySelector("[data-desktop-scale]");
  const scale = scaleEl ? parseFloat(scaleEl.dataset.desktopScale) || 1 : 1;
  const canvasEl = document.querySelector(canvasSelector);
  const originEl = canvasEl || scaleEl;
  const origin = originEl
    ? originEl.getBoundingClientRect()
    : { left: 0, top: 0 };
  const scaleRect = scaleEl ? scaleEl.getBoundingClientRect() : null;

  const out = {
    __scale: scale,
    __origin: canvasEl ? canvasSelector : scaleEl ? "[data-desktop-scale]" : "viewport",
    __originDelta:
      canvasEl && scaleRect
        ? { x: origin.left - scaleRect.left, y: origin.top - scaleRect.top }
        : null,
    __elements: {},
  };

  for (const selector of selectors) {
    const all = document.querySelectorAll(selector);
    const el = all[0];
    if (!el) {
      out.__elements[selector] = null;
      continue;
    }
    const r = el.getBoundingClientRect();
    out.__elements[selector] = {
      count: all.length,
      /* Canvas coordinates: client px measured against the canvas origin, then
         divided by the live scale. */
      x: (r.left - origin.left) / scale,
      y: (r.top - origin.top) / scale,
      w: r.width / scale,
      h: r.height / scale,
      right: (r.right - origin.left) / scale,
      bottom: (r.bottom - origin.top) / scale,
      hidden: r.width === 0 && r.height === 0,
    };
  }
  return out;
};

/* Waits until every watched rect stops changing for four consecutive frames, or
   ~2s. Mode switches run `tileIn` and the rail/panel run `dt-rise`, both of
   which translate the element: measuring mid-flight would read the animation,
   not the layout. Frame-polling rather than `getAnimations()` so an unrelated
   infinite animation elsewhere on the page cannot stall the probe. */
const AWAIT_STABLE = async (selectors) => {
  const snapshot = () =>
    selectors
      .map((s) => {
        const el = document.querySelector(s);
        if (!el) return "-";
        const r = el.getBoundingClientRect();
        return `${r.left.toFixed(2)},${r.top.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}`;
      })
      .join("|");

  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  let last = snapshot();
  let steady = 0;
  for (let i = 0; i < 130 && steady < 4; i += 1) {
    await frame();
    const now = snapshot();
    if (now === last) steady += 1;
    else {
      steady = 0;
      last = now;
    }
  }
  return steady >= 4;
};

/* Finds the stack's expansion control and tags it for the driver. §6.3 says it
   is a native <button> carrying aria-expanded, so that is exactly what is
   looked for — row-level expanders inside the row viewport are excluded, and
   nothing else is accepted as a substitute. */
const TAG_EXPANDER = ({ stackSelector, rowsSelector, leftSelector, tag }) => {
  document.querySelectorAll(`[${tag}]`).forEach((el) => el.removeAttribute(tag));

  const stack = document.querySelector(stackSelector);
  const rows = document.querySelector(rowsSelector);
  const inRows = (el) => !!rows && rows.contains(el);
  const name = (el) =>
    `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`.replace(/\s+/g, " ").trim();

  const scopes = [];
  if (stack) scopes.push([stackSelector, stack]);
  const left = document.querySelector(leftSelector);
  /* The control may end up wrapping the stack rather than sitting inside it,
     so the left column is a second, wider scope. */
  if (left) scopes.push([leftSelector, left]);

  for (const [where, root] of scopes) {
    const candidates = [...root.querySelectorAll("button[aria-expanded]")].filter(
      (b) => !inRows(b),
    );
    if (candidates.length === 0) continue;
    const el = candidates.find((b) => /stack/i.test(name(b))) || candidates[0];
    el.setAttribute(tag, "1");
    return {
      found: true,
      where,
      candidates: candidates.length,
      label: name(el).slice(0, 60),
      expanded: el.getAttribute("aria-expanded"),
    };
  }

  return {
    found: false,
    stackPresent: !!stack,
    /* Diagnostics for the "cannot find it" report: what *is* carrying
       aria-expanded today, if anything. */
    nonButtonExpanders: stack
      ? [...stack.querySelectorAll("[aria-expanded]")].filter(
          (el) => el.tagName.toLowerCase() !== "button",
        ).length
      : 0,
    rowExpanders: stack ? stack.querySelectorAll("[aria-expanded]").length : 0,
  };
};

const READ_EXPANDER = ({ tag }) => {
  const el = document.querySelector(`[${tag}]`);
  return el ? { present: true, expanded: el.getAttribute("aria-expanded") } : { present: false };
};

/* Focus identity after Escape. Accepts the tagged element, and independently
   re-derives "is a stack expansion button" so a re-render that dropped the tag
   cannot produce a false failure. */
const READ_FOCUS = ({ tag, stackSelector, rowsSelector }) => {
  const active = document.activeElement;
  if (!active || active === document.body) return { onExpander: false, tag: "body" };
  const stack = document.querySelector(stackSelector);
  const rows = document.querySelector(rowsSelector);
  const isButtonExpander =
    active.matches && active.matches("button[aria-expanded]") && (!rows || !rows.contains(active));
  return {
    onExpander: active.hasAttribute(tag) || !!(isButtonExpander && stack && stack.contains(active)),
    tag: active.tagName.toLowerCase(),
    label: `${active.getAttribute("aria-label") || ""} ${active.textContent || ""}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40),
  };
};

/* §6.3: "Do not use a div role=button containing nested buttons." */
const SCAN_NESTED_BUTTONS = ({ stackSelector }) => {
  const stack = document.querySelector(stackSelector);
  if (!stack) return null;
  const divButtons = [...stack.querySelectorAll('div[role="button"]')];
  const nested = divButtons.filter((d) => d.querySelector("button"));
  return {
    divButtons: divButtons.length,
    nested: nested.length,
    sample: nested.slice(0, 2).map((d) => String(d.className || "(no class)").slice(0, 60)),
  };
};

/* ── driver helpers ── */

const n1 = (value) => (typeof value === "number" ? value.toFixed(1) : String(value));

function checkSpec(id, spec, geometry, failures, lines) {
  const geo = geometry.__elements[spec.selector];
  if (!geo) {
    failures.push(`${id}: ${spec.label} — SELECTOR NOT FOUND (${spec.selector})`);
    lines.push(`  ✗ ${id.padEnd(22)} ${spec.label.padEnd(16)} ${spec.selector} NOT FOUND`);
    return;
  }
  if (geo.hidden) {
    failures.push(`${id}: ${spec.label} — NOT RENDERED (zero box at ${spec.selector})`);
    lines.push(`  ✗ ${id.padEnd(22)} ${spec.label.padEnd(16)} zero-size box`);
    return;
  }

  const parts = [];
  let ok = true;
  for (const [key, want] of Object.entries(spec.expect)) {
    const axis = key === "maxH" ? "h" : key;
    const got = geo[axis];
    const pass = key === "maxH" ? got <= want + TOL : Math.abs(got - want) <= TOL;
    if (!pass) {
      ok = false;
      const kind = key === "maxH" ? "ZONE B OVERFLOW" : "OFF CONTRACT";
      failures.push(
        `${id}: ${spec.label} ${kind} — ${axis} ${n1(got)} (want ${key === "maxH" ? "≤" : ""}${want}, off by ${n1(got - want)})`,
      );
    }
    parts.push(`${axis}${key === "maxH" ? "≤" : " "}${n1(got)}/${want}${pass ? "✓" : "✗"}`);
  }
  if (geo.count > 1) parts.push(`(${geo.count} matches)`);
  lines.push(`  ${ok ? "·" : "✗"} ${id.padEnd(22)} ${spec.label.padEnd(16)} ${parts.join("  ")}`);
}

async function settle(page) {
  await page.evaluate(AWAIT_STABLE, WATCHED);
}

async function measure(page) {
  return page.evaluate(READ_GEOMETRY, { selectors: WATCHED, canvasSelector: SEL.canvas });
}

async function clickRail(page, name, id, failures) {
  const button = page.getByRole("button", { name });
  const count = await button.count();
  if (count === 0) {
    failures.push(`${id}: rail button "${name}" not found — cannot reach this mode`);
    return false;
  }
  await button.first().click();
  await settle(page);
  return true;
}

/* ── per-device run ── */

async function run(browser, label, contextOptions) {
  const { context, page, errors } = await newRetailPage(browser, label, contextOptions);
  const failures = [];
  const lines = [];

  try {
    await page.goto(`${BASE_URL}/terminal`, { waitUntil: "networkidle" });
    /* The canvas starts at scale 0 and hidden until ScaledCanvas measures the
       stage; measuring before that divides by 1 and reads nonsense. */
    await page.waitForFunction(
      () => {
        const el = document.querySelector("[data-desktop-scale]");
        return !!el && parseFloat(el.dataset.desktopScale) > 0;
      },
      null,
      { timeout: 20_000 },
    );
    await page.waitForSelector(SEL.stack, { timeout: 20_000 }).catch(() => {
      failures.push(`${label}: ${SEL.stack} never rendered`);
    });
    await settle(page);

    const base = await measure(page);
    const delta = base.__originDelta;
    lines.push(
      `  scale ${base.__scale.toFixed(4)} · origin ${base.__origin}` +
        (delta ? ` · canvas−scalebox ${delta.x.toFixed(2)}/${delta.y.toFixed(2)}px` : ""),
    );

    /* ── §6.5 layout, per Phase 2 mode ── */
    lines.push("  --- layout: rail / zone A / zone B / zone C ---");
    for (const mode of MODES) {
      const id = `${label}/${mode.id}`;
      if (!(await clickRail(page, mode.rail, id, failures))) continue;
      const geometry = await measure(page);
      for (const spec of LAYOUT_SPEC) checkSpec(id, spec, geometry, failures, lines);
    }

    /* ── §6.2 collapsed stack, and its invariance across filters ── */
    lines.push("  --- active stack: collapsed ---");
    await clickRail(page, MODES[0].rail, `${label}/stack`, failures);
    const collapsed = await measure(page);
    for (const spec of STACK_COLLAPSED) {
      checkSpec(`${label}/collapsed`, spec, collapsed, failures, lines);
    }

    const chips = page.locator(`${SEL.chips} button`);
    const chipCount = await chips.count();
    if (chipCount === 0) {
      failures.push(`${label}: no filter chips found under ${SEL.chips}`);
      lines.push(`  ✗ ${label}/filters          no chips under ${SEL.chips}`);
    }
    for (let i = 0; i < chipCount; i += 1) {
      const chip = chips.nth(i);
      const name = ((await chip.textContent()) || `chip ${i}`).trim();
      await chip.click();
      await settle(page);
      const geometry = await measure(page);
      const id = `${label}/filter:${name}`;
      /* Two things at once: the absolute contract still holds under this
         filter, and nothing moved relative to the "all" baseline. The second is
         the §2.2 regression — a bottom-anchored stack passes at one row count
         and slides at the next. */
      for (const spec of STACK_COLLAPSED) checkSpec(id, spec, geometry, failures, lines);
      for (const spec of [STACK_COLLAPSED[0], STACK_COLLAPSED[1], STACK_COLLAPSED[2]]) {
        const was = collapsed.__elements[spec.selector];
        const now = geometry.__elements[spec.selector];
        if (!was || !now) continue;
        for (const axis of ["x", "y"]) {
          if (Math.abs(was[axis] - now[axis]) > TOL) {
            failures.push(
              `${label}: STACK MOVES ON FILTER "${name}" — ${spec.label} ${axis} ${n1(was[axis])} → ${n1(now[axis])}`,
            );
          }
        }
      }
    }
    if (chipCount > 0) {
      await chips.nth(0).click();
      await settle(page);
    }

    /* ── §6.3 expansion, Escape and focus restoration ── */
    lines.push("  --- active stack: expanded (§6.3) ---");
    const expander = await page.evaluate(TAG_EXPANDER, {
      stackSelector: SEL.stack,
      rowsSelector: SEL.rows,
      leftSelector: SEL.left,
      tag: EXPANDER_TAG,
    });

    if (!expander.found) {
      /* Reported, not invented: the probe will not click a div to fake this. */
      failures.push(
        `${label}: NO EXPANSION CONTROL — no native button[aria-expanded] in ${SEL.stack}` +
          ` (stack present: ${expander.stackPresent}, non-button [aria-expanded] in stack: ${expander.nonButtonExpanders})`,
      );
      lines.push(
        `  ✗ ${label}/expand           no button[aria-expanded] in the stack; ${expander.nonButtonExpanders} non-button expander(s) present`,
      );
    } else {
      lines.push(
        `  · ${label}/expand           found in ${expander.where}: "${expander.label}" (aria-expanded=${expander.expanded}, ${expander.candidates} candidate(s))`,
      );
      const control = page.locator(`[${EXPANDER_TAG}]`);
      /* Keyboard expansion, per §6.5's "keyboard expansion" gate: focus the
         control and press Enter rather than clicking. */
      await control.focus();
      await page.keyboard.press("Enter");
      await settle(page);

      let state = await page.evaluate(READ_EXPANDER, { tag: EXPANDER_TAG });
      if (state.present && state.expanded !== "true") {
        failures.push(
          `${label}: KEYBOARD EXPANSION — Enter left aria-expanded=${state.expanded}; falling back to click`,
        );
        await control.click();
        await settle(page);
        state = await page.evaluate(READ_EXPANDER, { tag: EXPANDER_TAG });
      }

      const expanded = await measure(page);
      for (const spec of STACK_EXPANDED) {
        checkSpec(`${label}/expanded`, spec, expanded, failures, lines);
      }
      /* §6.3 writes "shell/header y93". The header is what gates (above); the
         shell's own top is printed so a shell with padding is visible in the
         output rather than silently failing a header assertion. */
      const shell = expanded.__elements[SEL.stack];
      if (shell) {
        lines.push(
          `  · ${label}/expanded         shell (${SEL.stack}) y ${n1(shell.y)} — informational, header is the gate`,
        );
      }

      await page.keyboard.press("Escape");
      await settle(page);
      const afterEscape = await measure(page);
      const escapeState = await page.evaluate(READ_EXPANDER, { tag: EXPANDER_TAG });
      const focus = await page.evaluate(READ_FOCUS, {
        tag: EXPANDER_TAG,
        stackSelector: SEL.stack,
        rowsSelector: SEL.rows,
      });

      for (const spec of STACK_COLLAPSED) {
        checkSpec(`${label}/after-esc`, spec, afterEscape, failures, lines);
      }
      if (escapeState.present && escapeState.expanded !== "false") {
        failures.push(
          `${label}: ESCAPE DID NOT COLLAPSE — aria-expanded=${escapeState.expanded} after Escape`,
        );
      }
      if (!focus.onExpander) {
        failures.push(
          `${label}: ESCAPE LOST FOCUS — focus is on <${focus.tag}> "${focus.label ?? ""}", not the expansion button`,
        );
      }
      lines.push(
        `  ${focus.onExpander ? "·" : "✗"} ${label}/after-esc        aria-expanded=${escapeState.expanded} · focus <${focus.tag}> "${focus.label ?? ""}"`,
      );
    }

    /* ── §6.3 nested-control rule ── */
    lines.push("  --- active stack: control semantics (§6.3) ---");
    const scanStates = [["closed rows", null]];
    const rows = page.locator(SEL.row);
    if ((await rows.count()) > 0) scanStates.push(["after row click", rows.first()]);

    for (const [stateLabel, locator] of scanStates) {
      if (locator) {
        /* Row actions only exist once a row is open, so the rule has to be
           re-checked in that state. This runs last because a row click may
           legitimately navigate to a detail view. */
        await locator.click().catch(() => {});
        await settle(page);
      }
      const scan = await page.evaluate(SCAN_NESTED_BUTTONS, { stackSelector: SEL.stack });
      if (!scan) {
        lines.push(`  · ${label}/nested (${stateLabel}) stack gone — skipped`);
        continue;
      }
      if (scan.nested > 0) {
        failures.push(
          `${label}: NESTED BUTTON (${stateLabel}) — ${scan.nested} div[role="button"] containing a <button> [${scan.sample.join(" | ")}]`,
        );
      }
      lines.push(
        `  ${scan.nested > 0 ? "✗" : "·"} ${label}/nested           ${stateLabel}: ${scan.divButtons} div[role=button], ${scan.nested} with a nested <button>`,
      );
    }
  } catch (error) {
    failures.push(`${label}: PROBE ERROR — ${error.message}`);
  }

  await context.close();

  const realErrors = errors.filter((e) => !isExternalRequestFailure(e));
  return { failures, lines, realErrors, benign: errors.length - realErrors.length };
}

/* ── entry ── */

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
let failed = 0;

for (const [label, contextOptions] of DEVICE_CLASSES) {
  console.log(`\n########## ${label} ##########`);
  const { failures, lines, realErrors, benign } = await run(browser, label, contextOptions);
  lines.forEach((line) => console.log(line));

  if (failures.length === 0) {
    console.log(`  → ${label}: terminal geometry and stack shell on contract`);
  } else {
    console.log(`  --- failures ---`);
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    failed += failures.length;
  }
  if (realErrors.length) {
    console.log(`  ✗ ${label} page errors (${realErrors.length}): ${realErrors[0]}`);
    failed += realErrors.length;
  }
  if (benign) {
    console.log(
      `  · ${label}: ${benign} third-party request failure(s) (analytics / dev banner), not gated`,
    );
  }
}

await browser.close();

console.log(`\n===== summary =====`);
if (failed) {
  console.log(`FAIL — ${failed} terminal geometry defect(s) (tolerance ±${TOL}px of canvas space)`);
  process.exit(1);
}
console.log(`PASS — §6.5 geometry holds on every device class (tolerance ±${TOL}px)`);
