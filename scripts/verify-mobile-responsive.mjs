#!/usr/bin/env node
/* The phone geometry gate — docs/PLAN-2026-08-17-mobile-responsive-ui.md §7.2.
 *
 * WHY THIS EXISTS. Every probe in scripts/desktop-shots/ runs at >=1194px, and
 * `verify-mobile-retail-regression.mjs` runs one viewport and asserts only the
 * outer box, so it passes against the broken UI (§3 RC-7). The primary root
 * cause is a `@media (max-width: 640px)` rule, which means the entire class of
 * defect this plan is about is invisible to every gate the repo had.
 *
 * WHAT IT DOES. Measures — never looks — across 3 verticals x 6 viewports, and
 * compares every number against a recorded baseline (§7.6: "no worse than
 * baseline", never a permanently red command). Metrics split two ways:
 *
 *   COUNTERS   things that should trend to zero: horizontal overflow, elements
 *              crossing the viewport edge, clipped text, controls the 44px rule
 *              has inflated, unscoped `.tp-*` rules, duplicated `tp-*`
 *              keyframes, indicator drift.
 *              The gate fails if any counter is HIGHER than baseline.
 *   RATCHETS   things that should trend up or hold: visibleStackRows. The gate
 *              fails if any ratchet is LOWER than baseline.
 *   RECORDED   component boxes and the §6.1/§3.1 token values. Reported as a
 *              diff so a phase can see what it moved; never fails on its own,
 *              because "different" is the point of every phase after this one.
 *
 * A run that is BETTER than baseline prints what improved and tells you to
 * re-record. That is the ratchet: each phase tightens the file it is measured
 * against.
 *
 * WHAT IT DELIBERATELY DOES NOT GATE ON. Page/console errors. The dev server
 * serves a Replit banner from a third-party origin that is ORB-blocked, so a
 * gate keyed on console output can never exit 0 here — see
 * `probe-transitions.mjs`, which has that bug. Errors are collected and printed
 * under `--verbose`, never scored.
 *
 * Usage: dev server on :5000, single instance (see the dev-server memory note).
 *   node scripts/verify-mobile-responsive.mjs             compare, exit 1 on regression
 *   node scripts/verify-mobile-responsive.mjs --update    re-record the baseline
 *   node scripts/verify-mobile-responsive.mjs --json      print the full measurement
 *   node scripts/verify-mobile-responsive.mjs --verbose   include page errors
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, VERTICALS, newMobilePage } from "./mobile-fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, "verify-mobile-responsive.baseline.json");

const argv = new Set(process.argv.slice(2));
const UPDATE = argv.has("--update");
const AS_JSON = argv.has("--json");
const VERBOSE = argv.has("--verbose");

/* §4.1's device matrix. 390x844 is the reference the design is calibrated to;
   320x568 is where the vertical budget gets thin (§4.3). */
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
];

/* The reference viewport also runs with simulated insets (§7.2 clause 8). */
const REFERENCE = "390x844";
const SAFE_AREA = { top: 59, bottom: 34, left: 0, right: 0 };

/* §3.1's token set. All null until phase 6 — recording them now is what makes
   the v1 defect (a token that silently computed to 0px) impossible to reland
   unnoticed: the value is in the baseline from the first phase that writes it. */
const TOKENS = [
  "--u", "--sp-1", "--sp-2", "--sp-3", "--sp-4", "--sp-6", "--sp-7",
  "--bar-h", "--btn-h", "--row-h", "--stack-hdr-h", "--kp-size", "--fab-size",
  "--amount-max", "--chrome-gutter", "--dock-h", "--kb-h",
];

/* Deliberately clipped by design — §7.2 clause 2 asks for an explicit
   allowlist rather than a blanket tolerance. */
const EDGE_ALLOWLIST = ["tp-send-slot", "tp-pulse", "tp-overlay", "tp-toast", "tp-top-banner"];

const round = (n) => Math.round(n * 10) / 10;

/* ─────────────────────────────────────────────────────────────────────────
   The in-page measurement. One evaluate() per cell: crossing the bridge is
   the expensive part, and a partial measurement is worse than none.
   ───────────────────────────────────────────────────────────────────────── */
async function measure(page, allowlist) {
  return page.evaluate((ALLOW) => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r1(r.width), h: r1(r.height), x: r1(r.x), y: r1(r.y) };
    };
    const one = (sel) => box(document.querySelector(sel));
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const visible = (el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const visiblyMounted = (el) => {
      if (!el || !visible(el)) return false;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
      }
      return true;
    };
    const classesOf = (el) => String(el.className?.baseVal ?? el.className ?? "").split(/\s+/);
    const allowed = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (classesOf(n).some((c) => ALLOW.includes(c))) return true;
      }
      return false;
    };

    /* ── clause 1 + 2: overflow and edge crossers ───────────────────────── */
    const docOverflow = r1(document.documentElement.scrollWidth - vw);
    const edgeCrossers = [];
    /* -0.5px of slack: a sub-pixel layout legitimately lands a border a
       fraction outside, and scoring that as an overflow makes the counter
       noise rather than signal. */
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el) || allowed(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > vw + 1 || r.left < -0.5 || r.right > vw + 0.5) {
        edgeCrossers.push({
          tag: el.tagName.toLowerCase(),
          cls: classesOf(el).filter(Boolean).slice(0, 3).join("."),
          left: r1(r.left), right: r1(r.right), w: r1(r.width),
        });
      }
    }

    /* ── clause 3: clipped text ─────────────────────────────────────────── */
    const clippedText = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length || !el.textContent?.trim() || !visible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 2) {
        clippedText.push({
          cls: classesOf(el).filter(Boolean).slice(0, 2).join("."),
          text: el.textContent.trim().slice(0, 24),
          scrollW: el.scrollWidth, clientW: el.clientWidth,
        });
      }
    }

    /* ── clause 4: component contracts ──────────────────────────────────── */
    const stackScroll = document.querySelector(".tp-stack-scroll");
    let visibleStackRows = 0;
    if (stackScroll) {
      const sr = stackScroll.getBoundingClientRect();
      const rows = stackScroll.querySelectorAll(".tp-stack-row, .tp-stack-card");
      for (const row of rows) {
        const rr = row.getBoundingClientRect();
        if (rr.top >= sr.top - 0.5 && rr.bottom <= sr.bottom + 0.5 && rr.height > 0) visibleStackRows++;
      }
    }

    const amountEl = document.querySelector(".tp-amount");
    const subbarEl = document.querySelector(".tp-subbar");
    const activeBtnEl = document.querySelector(".tp-subbar-btn.active");
    const indicatorEl = document.querySelector(".tp-subbar-ind.on");
    const activeLabelEl = activeBtnEl?.querySelector(".tp-subbar-label");
    const sendEl = document.querySelector(".tp-send");
    const splitSlotEl = document.querySelector(".tp-split-slot.show");
    const splitPillEl = splitSlotEl?.querySelector("button");
    const rowEl = document.querySelector(".tp-psubbar.show");
    const components = {
      viewport: one(".tp-viewport"),
      subbar: box(subbarEl),
      subbarBtn: one(".tp-subbar-btn"),
      activeSubbarBtn: box(activeBtnEl),
      subbarInd: box(indicatorEl ?? document.querySelector(".tp-subbar-ind")),
      activeLabel: box(activeLabelEl),
      send: box(sendEl),
      splitPill: box(splitPillEl),
      actionRow: box(rowEl),
      amount: one(".tp-amount"),
      amountParent: box(amountEl?.parentElement),
      stackScroll: one(".tp-stack-scroll"),
      fab: one(".tp-fab, .tp-pfab"),
      screens: document.querySelectorAll(".tp-screen").length,
      visibleStackRows,
    };
    /* The reported issue 5: the send button should be exactly the bar's height.
       Recorded as a signed delta so a phase can watch it go to zero. */
    components.sendVsBarDelta =
      components.send && components.subbar ? r1(components.send.h - components.subbar.h) : null;
    /* The action bar's label sits below its bubble because the indicator is a
       <div> and escapes the button rule. */
    components.indVsBtnDelta =
      components.subbarInd && components.activeSubbarBtn
        ? r1(components.subbarInd.h - components.activeSubbarBtn.h)
        : null;
    const within = (inner, outer, slack = 0.6) =>
      inner && outer && inner.x >= outer.x - slack && inner.x + inner.w <= outer.x + outer.w + slack &&
      inner.y >= outer.y - slack && inner.y + inner.h <= outer.y + outer.h + slack;
    const same = (a, b, slack = 0.6) => Math.abs(a - b) <= slack;

    /* Phase 7's six action-bar invariants. These are violation counters rather
       than raw deltas so they can be baseline-ratcheted like the other
       geometry failures. A state-specific contract is evaluated only while
       that state is actually mounted and visible in the fixture. */
    components.barScrollOverflow = subbarEl
      ? Math.max(0, r1(subbarEl.scrollWidth - subbarEl.clientWidth))
      : 0;
    components.barScrollFitViolation = components.barScrollOverflow > 0.5 ? 1 : 0;
    components.sendHeightViolation =
      visiblyMounted(sendEl) && components.subbar && !same(components.send.h, components.subbar.h) ? 1 : 0;
    components.splitHeightViolation =
      visiblyMounted(splitPillEl) && components.subbar && !same(components.splitPill.h, components.subbar.h) ? 1 : 0;
    components.indicatorHeightViolation =
      visiblyMounted(indicatorEl) && components.activeSubbarBtn &&
      !same(components.subbarInd.h, components.activeSubbarBtn.h) ? 1 : 0;
    components.indicatorWidthViolation =
      visiblyMounted(indicatorEl) && components.activeSubbarBtn &&
      !same(components.subbarInd.w, components.activeSubbarBtn.w) ? 1 : 0;
    components.indicatorLabelContainmentViolation =
      visiblyMounted(indicatorEl) && visiblyMounted(activeLabelEl) &&
      !within(components.activeLabel, components.subbarInd) ? 1 : 0;
    components.rowViewportFitViolation = (() => {
      if (!visiblyMounted(rowEl)) return 0;
      const r = rowEl.getBoundingClientRect();
      return r.left < -0.5 || r.right > vw + 0.5 || r.width > vw + 1 ? 1 : 0;
    })();
    /* Amount overflowing its own parent is §6.5's failure, and the fitter has
       to make this <= 0 at every size. */
    components.amountOverflow =
      components.amount && components.amountParent
        ? r1(components.amount.w - components.amountParent.w)
        : null;

    /* ── clause 5: token computed styles ────────────────────────────────── */
    const tokenHost = document.querySelector(".tp-viewport") ?? document.documentElement;
    const cs = getComputedStyle(tokenHost);
    const tokens = {};
    for (const name of window.__TOKENS__) {
      const raw = cs.getPropertyValue(name).trim();
      tokens[name] = raw === "" ? null : raw;
    }

    /* ── clause 7: tap areas ────────────────────────────────────────────── */
    const controls = document.querySelectorAll(
      'button, [role="button"], input[type="submit"], input[type="button"], a[href]',
    );
    let tapUnder44 = 0;
    let tapInflated = 0;
    let tapCentreMiss = 0;
    const inflatedSamples = [];
    for (const el of controls) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) tapUnder44++;
      /* RC-1's fingerprint: the element renders at exactly the rule's minimum
         while its own stylesheet asks for less. `min-height` is the winner, so
         the authored `height` is still readable from the computed style's
         longhand only when the author set it inline — instead compare the
         used box against the rule's 44 and check the rule is what pinned it. */
      const s = getComputedStyle(el);
      const pinnedH = Math.abs(r.height - 44) < 0.51 && s.minHeight === "44px";
      const pinnedW = Math.abs(r.width - 44) < 0.51 && s.minWidth === "44px";
      if (pinnedH || pinnedW) {
        tapInflated++;
        if (inflatedSamples.length < 6) {
          inflatedSamples.push(classesOf(el).filter(Boolean).slice(0, 2).join(".") || el.tagName.toLowerCase());
        }
      }
      /* The centre of a control must hit-test to itself or a descendant, or
         something invisible is sitting on top of it. */
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      /* The dock keeps its collapsed handle mounted while expanded, with
         pointer-events:none. It is visible geometry but intentionally cannot
         own its centre point, so it is not an actionable tap target. */
      if (s.pointerEvents !== "none" && cx >= 0 && cy >= 0 && cx <= vw && cy <= vh) {
        const hit = document.elementFromPoint(cx, cy);
        if (hit && hit !== el && !el.contains(hit)) tapCentreMiss++;
      }
    }

    /* ── RC-6: the collisions themselves, not a count of stylesheets ───────
       Phase 1 counted <style> tags whose text matched /\.tp-subbar\s*\{/. That
       was a proxy, and phase 2 proved it measures the wrong thing twice over:

         · `.retail-terminal-view .tp-subbar {` CONTAINS `.tp-subbar {`, so
           scoping a sheet — the fix — pushed the number up rather than down;
         · it reads <style> text, so it cannot see an imported stylesheet, and
           it cannot see a @keyframes collision at all. Two more unscoped
           <style> literals (the property and trades action sheets, each
           redefining tp-fade and tp-sheetup) survived the plan's whole RC-6
           inventory because they declare no `.tp-` selector.

       What actually collides is a rule any vertical's element can match — a
       bare `.tp-` selector — and a keyframe name defined twice, since keyframe
       names are global and the last definition parsed wins. Both are counted
       from the CSSOM, which sees every sheet however it arrived. */
    let tpUnscopedRules = 0;
    let tpDuplicateKeyframes = 0;
    const kfSeen = new Map();
    const sharedTokenSelectors = new Set([
      ".tp-viewport",
      ".tp-panel-body",
      ".tp-viewport .tp-screen.tp-feature",
      '.tp-viewport .tp-screen.tp-feature[data-hero="compact"]',
      ".tp-hero",
      ".tp-panel",
      ".tp-viewport .tp-screen.tp-plain",
      ".tp-viewport .tp-subbar-wrap",
      ".tp-viewport .tp-subbar.tp-bar",
      ".tp-viewport .tp-subbar.tp-bar .tp-bar-ind",
      ".tp-viewport .tp-subbar.tp-bar .tp-bar-ind.on",
      ".tp-viewport .tp-subbar.tp-bar .tp-bar-ind.animate",
      ".tp-viewport .tp-subbar.tp-bar .tp-bar-btn",
      ".tp-viewport .tp-subbar.tp-bar .tp-bar-btn:active",
      ".tp-viewport .tp-subbar.tp-bar .tp-bar-btn.active",
      ".tp-viewport .tp-psubbar",
      ".tp-viewport .tp-psubbar .tp-send-slot",
      ".tp-viewport .tp-psubbar .tp-split-slot",
      ".tp-viewport .tp-psubbar .tp-send",
      ".tp-viewport .tp-subbar.tp-bar.compact .tp-bar-btn",
      ".tp-bar-label-track",
      ".tp-bar-label-track.show",
      ".tp-bar-label-track > .tp-subbar-label",
    ]);
    for (const sheet of document.styleSheets) {
      /* terminal-tokens.css is deliberately shared across all three verticals.
         It owns the cross-vertical .tp-viewport/.tp-screen topology and is the
         same approved exception as terminal-keyframes.css. Vertical sheets
         remain required to scope every .tp-* selector to their root. */
      if (sheet.href?.includes("/features/terminal/terminal-tokens.css")) continue;
      let rules;
      try { rules = sheet.cssRules; } catch { continue; } /* cross-origin */
      for (const rule of rules) {
        if (rule.type === CSSRule.KEYFRAMES_RULE) {
          if (/^tp-/.test(rule.name)) kfSeen.set(rule.name, (kfSeen.get(rule.name) ?? 0) + 1);
          continue;
        }
        const sel = rule.selectorText;
        if (sel && sel.split(",").some((part) => {
          const selector = part.trim();
          return /^\.tp-/.test(selector) && !sharedTokenSelectors.has(selector);
        })) tpUnscopedRules++;
      }
    }
    for (const n of kfSeen.values()) if (n > 1) tpDuplicateKeyframes += n - 1;

    return {
      docOverflow,
      edgeCrossers: edgeCrossers.slice(0, 8),
      edgeCrosserCount: edgeCrossers.length,
      clippedText: clippedText.slice(0, 8),
      clippedTextCount: clippedText.length,
      components,
      tokens,
      tapUnder44,
      tapInflated,
      tapCentreMiss,
      inflatedSamples,
      tpUnscopedRules,
      tpDuplicateKeyframes,
    };
  }, allowlist);
}

/* §7.2 clause 6 — the RC-2 drift test. The action-bar indicator measures x and
   width with no ResizeObserver, so a size change leaves it behind. Round-trip
   the viewport and compare the indicator against where it started. */
async function measureDrift(page, vp) {
  const read = () => page.evaluate(() => {
    const el = document.querySelector(".tp-subbar-ind");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const active = document.querySelector(".tp-subbar-btn.active");
    const a = active?.getBoundingClientRect();
    return {
      x: r.x,
      w: r.width,
      active: a ? { x: a.x, w: a.width } : null,
    };
  });
  const alignment = (sample) => sample?.active ? {
    dx: round(Math.abs(sample.x - sample.active.x)),
    dw: round(Math.abs(sample.w - sample.active.w)),
  } : null;
  const before = await read();
  if (!before) return null;
  await page.setViewportSize({ width: vp.width - 40, height: vp.height });
  await page.waitForTimeout(220);
  const resized = await read();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(320);
  const after = await read();
  if (!after) return null;
  return {
    dx: round(Math.abs(after.x - before.x)),
    dw: round(Math.abs(after.w - before.w)),
    resizedAlignment: alignment(resized),
    restoredAlignment: alignment(after),
  };
}

async function runCell(browser, vertical, vp, safeArea) {
  const { context, page, errors } = await newMobilePage(browser, vertical, {
    width: vp.width, height: vp.height, safeArea,
  });
  try {
    await page.addInitScript((t) => { window.__TOKENS__ = t; }, TOKENS);
    await page.goto(`${BASE_URL}${VERTICALS[vertical].route}`, {
      waitUntil: "domcontentloaded", timeout: 30_000,
    });
    /* The terminal mounts its stylesheet and measures its indicator after
       paint; a networkidle wait is not enough on its own. */
    await page.waitForSelector(".tp-viewport", { timeout: 15_000 });
    await page.waitForTimeout(1400);
    const m = await measure(page, EDGE_ALLOWLIST);
    m.drift = await measureDrift(page, vp);
    m.pageErrors = errors.length;
    if (VERBOSE && errors.length) m.pageErrorSamples = errors.slice(0, 4);
    return m;
  } finally {
    await context.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Scoring
   ───────────────────────────────────────────────────────────────────────── */
const COUNTERS = [
  "docOverflow", "edgeCrosserCount", "clippedTextCount",
  "tapInflated", "tapCentreMiss", "tpUnscopedRules", "tpDuplicateKeyframes",
  "components.barScrollFitViolation", "components.sendHeightViolation",
  "components.splitHeightViolation", "components.indicatorHeightViolation",
  "components.indicatorWidthViolation", "components.indicatorLabelContainmentViolation",
  "components.rowViewportFitViolation",
];
const RATCHETS = ["components.visibleStackRows"];

const dig = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

function compare(current, baseline) {
  const regressions = [];
  const improvements = [];
  const missing = [];

  for (const [cell, now] of Object.entries(current)) {
    const was = baseline[cell];
    if (!was) { missing.push(cell); continue; }

    for (const key of COUNTERS) {
      const a = dig(now, key) ?? 0;
      const b = dig(was, key) ?? 0;
      if (a > b) regressions.push(`${cell}  ${key}: ${b} → ${a}`);
      else if (a < b) improvements.push(`${cell}  ${key}: ${b} → ${a}`);
    }
    for (const key of RATCHETS) {
      const a = dig(now, key) ?? 0;
      const b = dig(was, key) ?? 0;
      if (a < b) regressions.push(`${cell}  ${key}: ${b} → ${a}  (ratchet)`);
      else if (a > b) improvements.push(`${cell}  ${key}: ${b} → ${a}`);
    }
    /* Drift is a counter with two axes. */
    const dNow = now.drift, dWas = was.drift;
    if (dNow && dWas) {
      if (dNow.dx > dWas.dx + 0.6) regressions.push(`${cell}  drift.dx: ${dWas.dx} → ${dNow.dx}`);
      else if (dNow.dx < dWas.dx - 0.6) improvements.push(`${cell}  drift.dx: ${dWas.dx} → ${dNow.dx}`);
      if (dNow.dw > dWas.dw + 0.6) regressions.push(`${cell}  drift.dw: ${dWas.dw} → ${dNow.dw}`);
      else if (dNow.dw < dWas.dw - 0.6) improvements.push(`${cell}  drift.dw: ${dWas.dw} → ${dNow.dw}`);
      for (const state of ["resizedAlignment", "restoredAlignment"]) {
        const a = dNow[state], b = dWas[state];
        if (!a) continue;
        /* Old baselines do not contain alignment samples. Treat their absent
           value as the desired zero so phase 7 cannot pass merely because its
           fixtures pre-date the invariant. */
        const old = b ?? { dx: 0, dw: 0 };
        for (const axis of ["dx", "dw"]) {
          if (a[axis] > old[axis] + 0.6) regressions.push(`${cell}  drift.${state}.${axis}: ${old[axis]} → ${a[axis]}`);
          else if (a[axis] < old[axis] - 0.6) improvements.push(`${cell}  drift.${state}.${axis}: ${old[axis]} → ${a[axis]}`);
        }
      }
    }
    /* Tokens: appearing or changing is recorded, never scored — but a token
       that computes to 0px is the v1 defect and is always a failure. */
    for (const [name, value] of Object.entries(now.tokens ?? {})) {
      if (value != null && /^0(px)?$/.test(value)) {
        regressions.push(`${cell}  token ${name} computes to ${value} — the v1 defect`);
      }
    }
  }
  return { regressions, improvements, missing };
}

/* ───────────────────────────────────────────────────────────────────────── */
async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const current = {};
  try {
    for (const vertical of Object.keys(VERTICALS)) {
      for (const vp of VIEWPORTS) {
        const cell = `${vertical}@${vp.width}x${vp.height}`;
        process.stderr.write(`  measuring ${cell}\n`);
        current[cell] = await runCell(browser, vertical, vp, null);
      }
      const refVp = VIEWPORTS.find((v) => `${v.width}x${v.height}` === REFERENCE);
      const cell = `${vertical}@${REFERENCE}+safearea`;
      process.stderr.write(`  measuring ${cell}\n`);
      current[cell] = await runCell(browser, vertical, refVp, SAFE_AREA);
    }
  } finally {
    await browser.close();
  }

  if (AS_JSON) {
    console.log(JSON.stringify(current, null, 2));
    return 0;
  }

  if (UPDATE || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
    console.log(
      existsSync(BASELINE) && !UPDATE
        ? `\nbaseline created: ${BASELINE}`
        : `\nbaseline recorded: ${BASELINE}`,
    );
    summarise(current);
    return 0;
  }

  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  const { regressions, improvements, missing } = compare(current, baseline);

  summarise(current);

  if (missing.length) {
    console.log(`\nNEW CELLS (not in baseline, not scored): ${missing.length}`);
    for (const c of missing) console.log(`  ${c}`);
  }
  if (improvements.length) {
    console.log(`\nIMPROVED vs baseline (${improvements.length}):`);
    for (const line of improvements) console.log(`  ${line}`);
    console.log("\n  Re-record with --update to ratchet the gate to these values.");
  }
  if (regressions.length) {
    console.log(`\nREGRESSIONS vs baseline (${regressions.length}):`);
    for (const line of regressions) console.log(`  ${line}`);
    console.log("\nFAIL");
    return 1;
  }
  console.log("\nno regressions vs baseline");
  return 0;
}

function summarise(current) {
  const cells = Object.entries(current);
  const tot = (key) => cells.reduce((n, [, m]) => n + (dig(m, key) ?? 0), 0);
  console.log(`\n${cells.length} cells — 3 verticals x ${VIEWPORTS.length} viewports + safe-area runs`);
  console.log("  " + [
    `edge crossers ${tot("edgeCrosserCount")}`,
    `clipped text ${tot("clippedTextCount")}`,
    `44px-inflated controls ${tot("tapInflated")}`,
    `tap centre misses ${tot("tapCentreMiss")}`,
    `unscoped .tp-* rules ${cells.reduce((n, [, m]) => Math.max(n, m.tpUnscopedRules ?? 0), 0)} max`,
    `duplicate tp-* keyframes ${cells.reduce((n, [, m]) => Math.max(n, m.tpDuplicateKeyframes ?? 0), 0)} max`,
  ].join("\n  "));

  const ref = cells.filter(([c]) => c.includes(`@${REFERENCE}`) && !c.includes("safearea"));
  console.log("\n  at the 390x844 reference:");
  for (const [cell, m] of ref) {
    const c = m.components;
    console.log(
      `    ${cell.split("@")[0].padEnd(9)} bar ${String(c.subbar?.h ?? "—").padStart(5)}  ` +
      `btn ${String(c.subbarBtn?.h ?? "—").padStart(5)}  ind ${String(c.subbarInd?.h ?? "—").padStart(5)}  ` +
      `send ${String(c.send?.h ?? "—").padStart(4)} (Δbar ${c.sendVsBarDelta})  rows ${c.visibleStackRows}`,
    );
  }
  const rowsMin = Math.min(...cells.map(([, m]) => m.components?.visibleStackRows ?? 0));
  console.log(`\n  visibleStackRows floor across all cells: ${rowsMin}  (§6.4 contract: >= 3)`);
}

process.exit(await main());
