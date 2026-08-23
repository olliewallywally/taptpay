/**
 * Gate for docs/PLAN-2026-08-17-terminal-panels-and-dock.md, clause numbering
 * from docs/SPEC-2026-08-20-dock-implementation.md §9.
 *
 * Phase A (shipped 2026-08-19):
 *   - §4.3 clause 8 — `--dock-h` lives on `document.documentElement` and reports
 *     the dock's real footprint (78 expanded, 64 collapsed, 0 absent).
 *   - §4.2 clause 2 — nothing interactive sits inside the dock's reserved band.
 *     This is the bug that survived on every device (§1.1, 50–78px).
 *
 * Phases B–F (gated 2026-08-23):
 *   - §9.B1 the token layer — resolved to numbers, not read as strings, and
 *     including the unit-uniformity clause that caught the panel's inline
 *     padding shrinking `--u` inside its own container.
 *   - §9.B2 the grid — container-type, contained overflow, no fixed
 *     descendants, `.tp-plain` ungridded, and the hero yielding first.
 *   - §9.C the keypad — the measured `--kp-size` table, plus the blocking
 *     clause that catches a token pinned to its cap.
 *   - §9.D the collapse channel, §9.E the swipe, §9.F the morph.
 *
 * §9.B0, the class contract, is not here: it is a static count and it lives in
 * `client/src/__tests__/terminal-screen-classes.test.ts`, the companion plan's
 * phase 2b guard. One assertion, one home.
 *
 * Coverage note, stated rather than implied: §4.2 asks for 27 feature screens ×
 * 6 viewports. This script drives, across all six portrait phones:
 *   - retail  — keypad, details, share (the flow reachable from the home screen)
 *   - property — the four subbar screens: tenants, send, bill, external
 *   - trades   — the four subbar screens: clients, quote, invoice, external
 * That is 11 of the 27. The remainder are sub-states reached only by committing
 * a flow (success screens, the split and automation panels); they inherit the
 * same panel padding as the screen they are entered from, so the reservation is
 * covered even where the assertion is not.
 *
 * Exits non-zero on failure. Several older scripts in this repo collect errors
 * and still exit 0; §4.1 forbids that here.
 */
import { chromium } from "playwright";
import {
  BASE_URL,
  CHROMIUM_PATH,
  newRetailPage,
} from "./desktop-shots/retail-fixtures.mjs";

/* retail-fixtures answers **\/api/property/** and **\/api/trades/** with [], which
   renders every list screen empty. Empty is not a fair test of clause 2: the
   screens that hide content under the dock are the ones with a populated list
   above a bottom-anchored action. These overrides are registered after the
   shared harness so they win. */
const PROPERTY_TENANTS = [
  { id: 1, firstName: "Josh", lastName: "Smith", propertyAddress: "12 Kauri Road", status: "active", email: "josh@example.invalid", phone: "+64211111111", preferredChannel: "email" },
  { id: 2, firstName: "Mia", lastName: "Chen", propertyAddress: "5 Bellbird Rise", status: "active", email: "mia@example.invalid", phone: "+64212222222", preferredChannel: "email" },
  { id: 3, firstName: "Tane", lastName: "Walker", propertyAddress: "88 Harbour View", status: "active", email: "tane@example.invalid", phone: "+64213333333", preferredChannel: "sms" },
];
const PROPERTY_INVOICES = [
  { id: 11, tenantProfileId: 1, amountCents: 65_000, owingCents: 65_000, status: "sent", kind: "rent", createdAt: new Date().toISOString() },
  { id: 12, tenantProfileId: 2, amountCents: 80_000, owingCents: 80_000, status: "overdue", kind: "rent", createdAt: new Date().toISOString() },
  { id: 13, tenantProfileId: 3, amountCents: 52_000, owingCents: 0, status: "paid", kind: "rent", createdAt: new Date().toISOString() },
];
const TRADES_CLIENTS = [
  { id: 1, firstName: "Ana", lastName: "Reti", businessName: "Reti Builders", status: "active", email: "ana@example.invalid", phone: "+64214444444", preferredChannel: "email" },
  { id: 2, firstName: "Sam", lastName: "Poe", businessName: "Poe Plumbing", status: "active", email: "sam@example.invalid", phone: "+64215555555", preferredChannel: "email" },
];
const TRADES_INVOICES = [
  { id: 21, clientProfileId: 1, amountCents: 120_000, owingCents: 120_000, status: "sent", createdAt: new Date().toISOString() },
  { id: 22, clientProfileId: 2, amountCents: 45_000, owingCents: 0, status: "paid", createdAt: new Date().toISOString() },
];

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function installVerticalMocks(page) {
  await page.route("**/api/property/tenants**", (route) => json(route, PROPERTY_TENANTS));
  await page.route("**/api/property/invoices**", (route) => json(route, PROPERTY_INVOICES));
  await page.route("**/api/property/schedules**", (route) => json(route, []));
  await page.route("**/api/property/reminder-settings**", (route) =>
    json(route, { enabled: false, remindAfterDays: 3, repeatEveryDays: 3, maxReminders: 3 }));
  await page.route("**/api/trades/clients**", (route) => json(route, TRADES_CLIENTS));
  await page.route("**/api/trades/invoices**", (route) => json(route, TRADES_INVOICES));
}

/* Companion plan §4.1's portrait matrix. */
const PHONES = [
  { w: 320, h: 568 },
  { w: 360, h: 640 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
  { w: 430, h: 932 },
];

/* §1.2: 58 + max(20, safe-area) expanded, 44 + 20 collapsed. Headless Chromium
   reports no safe-area inset, so the 20px floor is what applies here. */
const DOCK_EXPANDED = 78;
const DOCK_COLLAPSED = 64;
const COLLAPSE_AFTER_MS = 4_000;

/* §9.C's table, re-measured 2026-08-23 against the shipped grid with the dock
   collapsed. It supersedes SPEC §5.2, which was computed before the panel's
   inline padding was moved off the query container and which assumed a flat
   76px cap and a flat 12px gap rather than the unit-derived ones — it reads
   63.4 / 74.4 / 76 / 76 / 76 / 76. The design cap is reached on the three
   phones at and above the 390 reference and the key scales down below it,
   which is the shape A1 §3.1 asks for; the small-phone values are the unit's
   own 3.3px floor showing through. Four rows fit at every size. */
const KEYPAD_TABLE = {
  "320x568": 60.5,
  "360x640": 70.1,
  "375x667": 73.1,
  "390x844": 76.0,
  "412x915": 76.0,
  "430x932": 76.0,
};

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

/* `DOCK_GATE_ONLY=gesture,morph npm run verify:terminal-dock` runs one section.
   The full sweep is six phones × three verticals plus five browser sessions;
   iterating on one clause should not cost that. CI passes nothing and gets
   everything. */
const ONLY = (process.env.DOCK_GATE_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const runs = (section) => ONLY.length === 0 || ONLY.includes(section);

/* ── the dock contract (§4.3 clause 8) ───────────────────────────────────── */

/**
 * Reads `--dock-h` off the documentElement specifically. A terminal-scoped
 * write is the failure this asserts against: it resolves to the initial value
 * on exactly the screens that need it, so reading from anywhere else would
 * hide the defect.
 */
const readDockH = (page) =>
  page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--dock-h")
      .trim();
    return { raw, px: raw ? Number.parseFloat(raw) : null };
  });

const navRect = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('nav[data-demo-id="terminal-dock"]');
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  });

async function checkDockContract(page, label) {
  /* Expanded: the dock renders expanded and only collapses after the idle
     timer, so this must be read before COLLAPSE_AFTER_MS elapses. */
  const expanded = await readDockH(page);
  const rect = await navRect(page);

  if (expanded.raw === "") {
    fail(`${label}: --dock-h is not set on document.documentElement (§4.3 clause 8)`);
  } else if (Math.abs(expanded.px - DOCK_EXPANDED) > 1) {
    fail(
      `${label}: --dock-h reported ${expanded.px}px expanded, expected ~${DOCK_EXPANDED}px (§4.3 clause 8)`,
    );
  }

  /* The token must track the real box, not a literal that happens to match. */
  if (expanded.px !== null && rect && Math.abs(expanded.px - rect.height) > 1) {
    fail(
      `${label}: --dock-h (${expanded.px}px) does not match the dock's measured height (${rect.height}px) — it is a guess, not a measurement`,
    );
  }

  /* Clause 8's second half: "updates within one frame of a state change".
     Sampling once at a guessed instant is worthless — the collapse runs on a
     back-out curve that covers most of its distance in the first few frames, so
     a single late sample reads the resting value and the assertion passes
     without testing anything. Instead: install a rAF sampler and let it watch
     the whole idle-timer window, then look at what it caught.

     A token written once on transitionend produces exactly two distinct values
     and fails the intermediate check below. */
  const trace = await page.evaluate(async (windowMs) => {
    const nav = document.querySelector('nav[data-demo-id="terminal-dock"]');
    if (!nav) return null;
    const samples = [];
    const started = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue("--dock-h")
          .trim();
        samples.push({
          token: raw ? Number.parseFloat(raw) : null,
          box: nav.getBoundingClientRect().height,
        });
        if (performance.now() - started > windowMs) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return samples;
  }, COLLAPSE_AFTER_MS + 1_500);

  let mid = { px: null, rect: null };
  if (!trace || trace.length === 0) {
    fail(`${label}: could not sample --dock-h across the collapse (§4.3 clause 8)`);
  } else {
    /* (a) the token never lags the box it is supposed to report.

       Clause 8 says "within one frame", and one frame is exactly what a
       ResizeObserver costs: the observer's callback runs after layout, so a
       rAF sampler reading in the same frame sees the box already moved and
       the token not yet written. Comparing only against this frame's box
       therefore fails whenever the height moves faster than the tolerance —
       which on an ease-out curve is the first three frames of the collapse,
       and it fails there however correct the write is. So a sample passes if
       it matches this frame's box OR the previous frame's: a token written
       at transitionend still lags by dozens of frames and dozens of px, and
       is still caught. */
    const lagging = trace.filter((s, i) => {
      if (s.token === null) return false;
      if (Math.abs(s.token - s.box) <= 1.5) return false;
      const previous = trace[i - 1];
      return !previous || Math.abs(s.token - previous.box) > 1.5;
    });
    if (lagging.length) {
      const worst = lagging.reduce((a, b) =>
        Math.abs(b.token - b.box) > Math.abs(a.token - a.box) ? b : a);
      fail(
        `${label}: --dock-h lagged the dock box in ${lagging.length}/${trace.length} frames — worst ${worst.token}px vs ${worst.box}px (§4.3 clause 8)`,
      );
    }

    /* (b) it moved through the transition rather than jumping at the end */
    const between = trace.filter(
      (s) => s.token !== null && s.token > DOCK_COLLAPSED + 1 && s.token < DOCK_EXPANDED - 1,
    );
    if (between.length === 0) {
      fail(
        `${label}: --dock-h only ever held ${DOCK_EXPANDED}px and ${DOCK_COLLAPSED}px across ${trace.length} frames — it is written at the end of the transition, not tracked through it (§4.3 clause 8)`,
      );
    } else {
      mid = { px: between[Math.floor(between.length / 2)].token, rect: between[Math.floor(between.length / 2)].box };
    }
  }

  /* The sampler above already spanned the idle window and the transition. */
  await page.waitForTimeout(300);
  const collapsed = await readDockH(page);
  const collapsedRect = await navRect(page);

  if (collapsed.raw === "") {
    fail(`${label}: --dock-h unset after collapse (§4.3 clause 8)`);
  } else if (Math.abs(collapsed.px - DOCK_COLLAPSED) > 1) {
    fail(
      `${label}: --dock-h reported ${collapsed.px}px collapsed, expected ~${DOCK_COLLAPSED}px (§4.3 clause 8)`,
    );
  }
  if (collapsed.px !== null && collapsedRect && Math.abs(collapsed.px - collapsedRect.height) > 1) {
    fail(
      `${label}: collapsed --dock-h (${collapsed.px}px) does not match the measured dock (${collapsedRect.height}px)`,
    );
  }

  return {
    expanded: expanded.raw || "(unset)",
    expandedRect: rect ? Math.round(rect.height) : null,
    tracked: mid.px === null ? "no intermediate frames seen" : `${Math.round(mid.px)}px mid-transition, box ${Math.round(mid.rect)}px`,
    collapsed: collapsed.raw || "(unset)",
    collapsedRect: collapsedRect ? Math.round(collapsedRect.height) : null,
  };
}

/**
 * §4.3 clause 8's third case: 0 when the dock is absent. `/login` renders no
 * BottomNavigation (bottom-navigation.tsx:38 returns null off the nav routes),
 * so the property must be cleared rather than left at its last value.
 */
async function checkDockAbsent(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const nav = await navRect(page);
  if (nav) {
    notes.push("/login unexpectedly rendered a dock; skipped the absent-dock clause");
    return null;
  }
  const { raw, px } = await readDockH(page);
  const zero = raw === "" || px === 0;
  if (!zero) {
    fail(
      `dock absent: --dock-h is "${raw}", expected 0px or unset — a stale value reserves space for a dock that is not there (§4.3 clause 8)`,
    );
  }
  return raw || "(unset)";
}

/* ── nothing under the dock (§4.2 clause 2) ──────────────────────────────── */

/**
 * The band is the dock's *reserved* footprint at the bottom of the viewport,
 * not the dock's current visual rect — that is what padding has to clear, and
 * it keeps the assertion independent of whether the idle timer has fired.
 *
 * DK1 legitimises a scrolling panel, and per docs/SPEC-2026-08-20-dock-
 * implementation.md's own reading of §4.2 clause 2, what the clause forbids
 * is content *amputated* by an ancestor's overflow:hidden — not content that
 * is merely below the fold of a genuinely scrollable region. An element whose
 * nearest scrollable ancestor has overflow-y auto/scroll and can actually
 * reach it (scrollHeight > clientHeight) is checked at that ancestor's fully-
 * scrolled position, not its resting one — because .tp-panel's own bottom
 * padding already carves the dock's footprint out of that ancestor's
 * clientHeight (terminal-tokens.css), so an element the ancestor can scroll
 * to is, by construction, clear of the band once you do. An element with no
 * such ancestor (or one that still can't clear the band at full scroll) is
 * still a hit — that is the actual amputation case clause 2 exists for.
 */
async function elementsUnderDock(page) {
  return page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--dock-h")
      .trim();
    const nav = document.querySelector('nav[data-demo-id="terminal-dock"]');
    const token = raw ? Number.parseFloat(raw) : Number.NaN;
    /* Pre-implementation there is no token; fall back to the real nav box so
       the baseline run still measures the actual bug. */
    const dockH = Number.isFinite(token)
      ? token
      : nav
        ? nav.getBoundingClientRect().height
        : 0;
    if (!dockH) return { dockH: 0, hits: [] };

    const bandTop = window.innerHeight - dockH;
    const selector = 'button, [role="button"], a[href], input, select, textarea';
    const hits = [];

    const scrollableAncestor = (el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const cs = getComputedStyle(node);
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
          return node;
        }
        if (node.classList?.contains("tp-panel")) break; // don't escape the panel — the page itself scrolls too
      }
      return null;
    };

    for (const el of document.querySelectorAll(selector)) {
      if (nav && nav.contains(el)) continue;
      /* Screens on their way out still have boxes; they are not the bug. */
      if (el.closest(".tp-layer.leaving")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (Number.parseFloat(style.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom <= bandTop) continue;
      if (r.top >= window.innerHeight) continue;

      const scroller = scrollableAncestor(el);
      let top = r.top;
      let bottom = r.bottom;
      if (scroller) {
        const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
        const delta = maxScrollTop - scroller.scrollTop; // how much further this ancestor can scroll
        top -= delta;
        bottom -= delta;
        if (bottom <= bandTop) continue; // reachable via scroll, and clear once you get there
      }

      hits.push({
        label:
          el.getAttribute("aria-label") ||
          el.getAttribute("placeholder") ||
          (el.textContent || "").trim().slice(0, 28) ||
          el.tagName.toLowerCase(),
        overlap: Math.round(Math.min(bottom, window.innerHeight) - Math.max(top, bandTop)),
        viaScroller: !!scroller,
      });
    }
    return { dockH: Math.round(dockH), bandTop: Math.round(bandTop), hits };
  });
}

/** §4.2 clause 1 — nothing past the viewport. Kept alongside because DK1 makes
 *  it, not "everything fits", the assertion that carries the panel bug. */
async function panelPastViewport(page) {
  return page.evaluate(() => {
    const out = [];
    for (const screen of document.querySelectorAll(".tp-screen")) {
      if (screen.closest(".tp-layer.leaving")) continue;
      const r = screen.getBoundingClientRect();
      if (r.bottom > window.innerHeight + 1) {
        out.push({ cls: screen.className.slice(0, 40), past: Math.round(r.bottom - window.innerHeight) });
      }
    }
    return out;
  });
}

/* ── §9.B1 the token layer, §9.B2 the grid, §9.C the keypad ──────────────── */

/**
 * Resolve a token to a number of px.
 *
 * Two traps, both of which produced wrong numbers on the first pass of this
 * gate and both of which are invisible if you read the property directly:
 *
 * 1. `getComputedStyle(el).getPropertyValue('--u')` returns the *token stream*
 *    — the literal text `clamp(3.3px, 1.0256cqi, 4px)` — for an unregistered
 *    custom property. It has to be used by a real declaration to resolve. So
 *    the probe sets `width: var(--token)` and reads the width back.
 * 2. The probe must read `getComputedStyle(probe).width`, never
 *    `getBoundingClientRect()`. `.stagger > *` (retail-terminal-view.css:301)
 *    animates every direct child of the hero and the panel with `tp-popIn`,
 *    which starts at `scale(0.96)` — a rect-based probe silently reports 96%
 *    of every length it measures, and a different percentage depending on
 *    when in the animation it lands.
 *
 * Both `animation: none` and the computed read are belt and braces; keep them.
 */
const TOKEN_PROBE = `(host, token) => {
  if (!host) return null;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:0;left:0;height:0;visibility:hidden;animation:none!important;";
  probe.style.width = "var(" + token + ")";
  host.appendChild(probe);
  const value = Number.parseFloat(getComputedStyle(probe).width);
  probe.remove();
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}`;

/** Wait for the conveyor and the stagger pop-ins to finish before measuring. */
async function settle(page, cap = 2_500) {
  await page
    .waitForFunction(
      () => document.getAnimations().filter((a) => a.playState === "running").length === 0,
      null,
      { timeout: cap },
    )
    .catch(() => {});
  await page.waitForTimeout(120);
}

/**
 * §9.B1. Numbers, not presence: the companion's v1 defect was a token that
 * computed to `0px` with no error and SPEC §1.2's is one that computes to its
 * cap, and a gate that checks "is it set" passes both.
 */
async function checkTokenLayer(page, label, phone) {
  const measured = await page.evaluate(
    ({ probeSource }) => {
      const probeOne = eval(probeSource);
      const screen =
        document.querySelector(".tp-layer:not(.leaving) .tp-screen.tp-feature") ||
        document.querySelector(".tp-screen.tp-feature");
      const hosts = {
        viewport: document.querySelector(".tp-viewport"),
        hero: screen?.querySelector(".tp-hero") ?? null,
        panel: screen?.querySelector(".tp-panel") ?? null,
        body: screen?.querySelector(".tp-panel-body") ?? null,
      };
      const names = [
        "--u", "--sp-1", "--sp-2", "--sp-3", "--sp-4", "--sp-6", "--sp-7",
        "--kp-max", "--fab-size", "--hero-min", "--hero-pref", "--panel-min",
        "--panel-top", "--safe-bottom",
      ];
      const tokens = {};
      for (const name of names) tokens[name] = probeOne(hosts.viewport, name);
      const unit = {};
      for (const [where, host] of Object.entries(hosts)) unit[where] = probeOne(host, "--u");
      return { tokens, unit, missing: Object.entries(hosts).filter(([, h]) => !h).map(([k]) => k) };
    },
    { probeSource: TOKEN_PROBE },
  );

  const { tokens, unit } = measured;
  if (measured.missing.length) {
    fail(`${label}: no ${measured.missing.join("/")} to measure the token layer on (§9.B1)`);
    return measured;
  }

  /* One unit, one length — everywhere inside the viewport. This is amendment
     A1 §3.1's whole claim, and it is not free: --u is `1.0256cqi`, and cq
     units re-resolve at every use site against the nearest size container.
     A nested container whose content box is narrower than the viewport —
     .tp-panel with inline padding, as shipped — silently makes --u mean a
     different length inside it, and every derived token with it. That defect
     capped the keypad key at 65.1px against a 76px design size on a 390
     phone. terminal-tokens.css keeps the panel's content box full-width; this
     clause is what stops the padding coming back. */
  const spread = Math.max(...Object.values(unit)) - Math.min(...Object.values(unit));
  if (spread > 0.05) {
    fail(
      `${label}: --u resolves to different lengths inside the viewport — ${Object.entries(unit)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")} (§9.B1, A1 §3.1's one unit)`,
    );
  }

  /* Every derived token is its authored multiple of the unit. Thirteen
     assertions, one clamp — which is exactly A1 §3.1's claim, and twenty-one
     independent clamps could not pass it. */
  const MULTIPLES = {
    "--sp-1": 1, "--sp-2": 2, "--sp-3": 3, "--sp-4": 4, "--sp-6": 6, "--sp-7": 7,
    "--kp-max": 19, "--fab-size": 17.5, "--panel-top": 9.5,
  };
  for (const [name, n] of Object.entries(MULTIPLES)) {
    const expected = n * tokens["--u"];
    if (tokens[name] === null || Math.abs(tokens[name] - expected) > 0.05) {
      fail(
        `${label}: ${name} is ${tokens[name]}px, expected ${Math.round(expected * 1000) / 1000}px (${n} × --u) (§9.B1)`,
      );
    }
  }

  /* The reference: exactly 4.000px at 390. Chromium quantises container query
     lengths to 1/64px, so 3.984 is the closest representable value and the
     tolerance is that quantum, not a fudge. */
  if (phone.w === 390 && Math.abs(tokens["--u"] - 4) > 0.02) {
    fail(`${label}: --u is ${tokens["--u"]}px at the 390 reference, expected 4.000px (§9.B1)`);
  }

  /* Height-driven, and the two the grid is built on. */
  if (Math.abs(tokens["--hero-min"] - 184) > 0.5) {
    fail(`${label}: --hero-min is ${tokens["--hero-min"]}px, expected 184px (§9.B1)`);
  }
  const heroPref = Math.min(316, Math.max(184, 0.3365 * phone.h));
  if (Math.abs(tokens["--hero-pref"] - heroPref) > 0.5) {
    fail(
      `${label}: --hero-pref is ${tokens["--hero-pref"]}px, expected ${Math.round(heroPref * 10) / 10}px (clamp(184px, 33.65svh, 316px)) (§9.B1)`,
    );
  }
  const panelMin = 4 * 44 + 3 * tokens["--sp-3"] + 2 * tokens["--sp-6"];
  if (Math.abs(tokens["--panel-min"] - panelMin) > 0.1) {
    fail(`${label}: --panel-min is ${tokens["--panel-min"]}px, expected ${Math.round(panelMin * 10) / 10}px (§9.B1)`);
  }

  /* No token computes to 0px. --safe-bottom is legitimately 0 headless —
     it is the one exemption, and naming it is cheaper than a blanket skip. */
  for (const [name, value] of Object.entries(tokens)) {
    if (name === "--safe-bottom") continue;
    if (value === null || value === 0) {
      fail(`${label}: ${name} resolved to ${value === null ? "nothing" : "0px"} (§9.B1 — the v1 defect)`);
    }
  }

  return measured;
}

/**
 * §9.B2 clauses 2, 3, 5 and 6. Clause 1 (nothing past the viewport) is
 * `panelPastViewport` and runs on every screen; clause 4 (the hero yields
 * first) needs a height sweep and lives in `checkHeroYields`.
 */
async function checkGrid(page, label) {
  const grid = await page.evaluate(() => {
    const screen =
      document.querySelector(".tp-layer:not(.leaving) .tp-screen.tp-feature") ||
      document.querySelector(".tp-screen.tp-feature");
    if (!screen) return null;
    const panel = screen.querySelector(".tp-panel");
    const body = screen.querySelector(".tp-panel-body");
    if (!panel || !body) return { missing: true };

    /* Clause 2: where the body genuinely overflows, it must genuinely scroll.
       DK1 makes scrolling a first-class outcome; what stays forbidden is
       content amputated by an ancestor's overflow: hidden. */
    const overflows = body.scrollHeight > body.clientHeight + 1;
    const overflowY = getComputedStyle(body).overflowY;
    let reachedEnd = null;
    if (overflows) {
      const target = body.scrollHeight - body.clientHeight;
      body.scrollTop = target;
      reachedEnd = Math.abs(body.scrollTop - target) <= 1;
      body.scrollTop = 0;
    }

    /* Clause 6's runtime half: container-type: size makes .tp-panel a
       containing block for fixed descendants, so a `position: fixed` under
       features/terminal would silently start behaving like `absolute`. */
    const fixed = [];
    for (const el of screen.querySelectorAll("*")) {
      if (getComputedStyle(el).position === "fixed") {
        fixed.push(String(el.className || el.tagName).slice(0, 40));
      }
    }

    /* Clause 5: a synthetic .tp-plain, styled by the real stylesheet. The
       component that renders the only real one (DockPlaceholder) is reachable
       just from the landing demo's mount, and the risk this clause covers is a
       widened selector — `.tp-screen` instead of `.tp-screen.tp-feature` —
       which an injected node catches exactly as well as a rendered one. */
    const viewport = document.querySelector(".tp-viewport");
    const plain = document.createElement("div");
    plain.className = "tp-screen tp-plain";
    plain.style.cssText = "position:absolute;visibility:hidden;animation:none!important;";
    viewport.appendChild(plain);
    const plainStyle = getComputedStyle(plain);
    const plainOut = {
      display: plainStyle.display,
      paddingBottom: Number.parseFloat(plainStyle.paddingBottom),
    };
    plain.remove();

    const dockH = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--dock-h"),
    );

    return {
      containerType: getComputedStyle(panel).containerType,
      overflows, overflowY, reachedEnd, fixed, plain: plainOut, dockH,
    };
  });

  if (!grid) {
    notes.push(`${label}: no .tp-feature screen mounted, grid clauses skipped`);
    return null;
  }
  if (grid.missing) {
    fail(`${label}: .tp-feature screen has no .tp-panel/.tp-panel-body (§9.B2 — the class contract)`);
    return grid;
  }
  if (grid.containerType !== "size") {
    fail(
      `${label}: .tp-panel container-type is "${grid.containerType}", expected "size" — --kp-size's 100cqh resolves against the viewport without it, silently (§9.B2 clause 3)`,
    );
  }
  if (grid.overflows && grid.overflowY !== "auto") {
    fail(`${label}: .tp-panel-body overflows but overflow-y is "${grid.overflowY}" (§9.B2 clause 2)`);
  }
  if (grid.overflows && grid.reachedEnd === false) {
    fail(`${label}: .tp-panel-body cannot scroll to its own end — content is amputated (§9.B2 clause 2)`);
  }
  if (grid.fixed.length) {
    fail(
      `${label}: ${grid.fixed.length} position:fixed element(s) inside a .tp-feature screen — .tp-panel's containment makes them absolute (§9.B2 clause 6): ${grid.fixed.slice(0, 3).join(", ")}`,
    );
  }
  if (grid.plain.display === "grid") {
    fail(`${label}: .tp-plain took the feature grid — the selector has been widened past .tp-feature (§9.B2 clause 5)`);
  }
  if (Number.isFinite(grid.dockH) && grid.plain.paddingBottom < grid.dockH) {
    fail(
      `${label}: .tp-plain reserves ${grid.plain.paddingBottom}px against a ${grid.dockH}px dock (§9.B2 clause 5)`,
    );
  }
  return grid;
}

/**
 * §9.C. The table, not "non-zero" — and the blocking clause is the one that
 * catches SPEC §1.2's trap: a --kp-size that is the same at 320 and 390 means
 * the container query is not resolving and the token has pinned to its cap.
 */
async function checkKeypad(page, label) {
  return page.evaluate(
    ({ probeSource }) => {
      const probeOne = eval(probeSource);
      const body =
        document.querySelector(".tp-layer:not(.leaving) .tp-panel-body") ||
        document.querySelector(".tp-panel-body");
      const keys = [...document.querySelectorAll(".tp-layer:not(.leaving) .tp-kp")];
      if (!body || keys.length === 0) return null;
      const bodyBottom = body.getBoundingClientRect().bottom;
      return {
        kpSize: probeOne(body, "--kp-size"),
        kpMax: probeOne(body, "--kp-max"),
        keyWidth: Math.round(Number.parseFloat(getComputedStyle(keys[0]).width) * 10) / 10,
        keys: keys.length,
        rowsVisible: keys.every((k) => k.getBoundingClientRect().bottom <= bodyBottom + 0.5),
      };
    },
    { probeSource: TOKEN_PROBE },
  );
}

/**
 * §9.B2 clause 4 — the hero yields first. Sweeping the viewport down, the
 * panel must never fall below `--panel-min` and the hero must be the region
 * that gives up its height. The sweep runs past the matrix's shortest phone
 * (568) because that is where the crossover actually is: at 568 the hero is
 * still 7px above its own floor, so a sweep that stops there proves nothing.
 */
async function checkHeroYields(page, label) {
  const trace = [];
  for (let height = 932; height >= 460; height -= 32) {
    await page.setViewportSize({ width: 390, height });
    await page.waitForTimeout(120);
    const sample = await page.evaluate(
      ({ probeSource }) => {
        const probeOne = eval(probeSource);
        const screen =
          document.querySelector(".tp-layer:not(.leaving) .tp-screen.tp-feature") ||
          document.querySelector(".tp-screen.tp-feature");
        if (!screen) return null;
        const hero = screen.querySelector(".tp-hero");
        const panel = screen.querySelector(".tp-panel");
        const r1 = (n) => Math.round(n * 10) / 10;
        return {
          hero: r1(Number.parseFloat(getComputedStyle(hero).height)),
          panel: r1(Number.parseFloat(getComputedStyle(panel).height)),
          heroMin: probeOne(document.querySelector(".tp-viewport"), "--hero-min"),
          panelMin: probeOne(document.querySelector(".tp-viewport"), "--panel-min"),
          past: r1(screen.getBoundingClientRect().bottom - window.innerHeight),
        };
      },
      { probeSource: TOKEN_PROBE },
    );
    if (sample) trace.push({ height, ...sample });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  if (trace.length < 4) {
    fail(`${label}: could not sweep the viewport height (§9.B2 clause 4)`);
    return trace;
  }
  for (const s of trace) {
    if (s.panel < s.panelMin - 0.5 && s.past <= 1) {
      fail(
        `${label}: at ${s.height}px tall the panel is ${s.panel}px, below --panel-min ${s.panelMin}px (§9.B2 clause 4)`,
      );
      break;
    }
    /* The panel may only be squeezed once the hero has nothing left to give. */
    if (s.panel <= s.panelMin + 0.5 && s.hero > s.heroMin + 0.5) {
      fail(
        `${label}: at ${s.height}px tall the panel is at its floor (${s.panel}px) while the hero still holds ${s.hero}px against a ${s.heroMin}px minimum — the panel yielded first (§9.B2 clause 4)`,
      );
      break;
    }
  }
  const shrank = trace.every((s, i) => i === 0 || s.hero <= trace[i - 1].hero + 0.5);
  if (!shrank) {
    fail(`${label}: the hero did not shrink monotonically as the viewport got shorter (§9.B2 clause 4)`);
  }
  const floor = trace.find((s) => s.hero <= s.heroMin + 0.5);
  return {
    samples: trace.length,
    heroFloorAt: floor ? `${floor.height}px tall` : "not reached by 460px",
    shortest: trace[trace.length - 1],
  };
}

async function measureScreen(page, label) {
  const under = await elementsUnderDock(page);
  const past = await panelPastViewport(page);

  if (under.hits.length) {
    const worst = under.hits.reduce((a, b) => (b.overlap > a.overlap ? b : a));
    fail(
      `${label}: ${under.hits.length} interactive element(s) inside the ${under.dockH}px dock band — worst "${worst.label}" by ${worst.overlap}px (§4.2 clause 2)`,
    );
  }
  for (const p of past) {
    fail(`${label}: .tp-screen extends ${p.past}px past the viewport bottom (§4.2 clause 1)`);
  }
  return { under: under.hits.length, past: past.length, dockH: under.dockH };
}

/* ── driving the retail feature screens ──────────────────────────────────── */

async function walkRetailFeatureScreens(page, phone) {
  const label = (screen) => `retail/${screen} @ ${phone.w}×${phone.h}`;
  const results = {};

  await page.getByRole("button", { name: "add item", exact: true }).click();
  await page.waitForTimeout(700);
  results.keypad = await measureScreen(page, label("keypad"));

  /* The keypad is the screen every Phase B/C clause is about: the deepest
     panel content in the app, and the one §1.1 measured as unusable at 320. */
  await settle(page);
  results.tokens = await checkTokenLayer(page, label("keypad"), phone);
  results.grid = await checkGrid(page, label("keypad"));
  results.keypadSizing = await checkKeypad(page, label("keypad"));
  if (results.keypadSizing) {
    const expected = KEYPAD_TABLE[`${phone.w}x${phone.h}`];
    const { kpSize, keyWidth, keys, rowsVisible } = results.keypadSizing;
    if (expected !== undefined && Math.abs(kpSize - expected) > 0.5) {
      fail(
        `${label("keypad")}: --kp-size is ${kpSize}px, expected ${expected}px (§9.C — the table, not "non-zero")`,
      );
    }
    if (Math.abs(keyWidth - kpSize) > 0.5) {
      fail(
        `${label("keypad")}: the key renders ${keyWidth}px against a --kp-size of ${kpSize}px — the token is declared but not consumed (§9.C)`,
      );
    }
    /* Reported, not blocking, under DK1: the panel may scroll. Four rows is
       still the target — a keypad you scroll is a bad keypad even when it is
       a legal one — so a miss is printed rather than swallowed. */
    if (!rowsVisible) {
      notes.push(
        `${label("keypad")}: not all ${keys} keys are inside the panel body — the keypad scrolls here (§9.C, reported under DK1)`,
      );
    }
  }

  for (const digit of ["1", "2", "3", "4"]) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.locator('.tp-layer:not(.leaving) button[aria-label="commit"]').click();
  await page.getByPlaceholder("item name").waitFor();
  await page.waitForTimeout(400);
  results.details = await measureScreen(page, label("details"));

  await page.getByPlaceholder("item name").fill("dock gate");
  await page.locator('.tp-layer:not(.leaving) button[aria-label="commit"]').click();
  await page.getByRole("button", { name: "send", exact: true }).waitFor();
  await page.waitForTimeout(400);
  results.share = await measureScreen(page, label("share"));

  return results;
}

/**
 * Property and trades both hang their feature screens off a four-slot subbar
 * (SUBBAR_ROUTE in each view), so each screen is one click from the home screen
 * rather than the end of a flow. The buttons carry stable demo ids.
 */
async function walkSubbarScreens(page, vertical, slots, phone) {
  const results = {};
  for (const slot of slots) {
    const button = page.locator(`[data-demo-id="${vertical}-mode-${slot}"]`);
    if ((await button.count()) === 0) {
      notes.push(`${vertical}/${slot} @ ${phone.w}×${phone.h}: subbar slot not found, skipped`);
      continue;
    }
    await button.click();
    await page.waitForTimeout(650);
    results[slot] = await measureScreen(page, `${vertical}/${slot} @ ${phone.w}×${phone.h}`);
  }
  return results;
}

async function verticalRun(browser, phone, { route, vertical, slots }) {
  const { context, page } = await newRetailPage(browser, `${vertical}-${phone.w}`, {
    viewport: { width: phone.w, height: phone.h },
    hasTouch: true,
    isMobile: true,
  });
  try {
    await installVerticalMocks(page);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-viewport").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1_100);
    return await walkSubbarScreens(page, vertical, slots, phone);
  } finally {
    await context.close();
  }
}

/* ── §9.D the collapse channel, §9.E the gesture, §9.F the morph ─────────── */

const dockState = (page) =>
  page.evaluate(() => {
    const handle = document.querySelector('[data-demo-id="dock-handle"]');
    const wrap = document.querySelector('nav[data-demo-id="terminal-dock"] > div');
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--dock-h").trim();
    return {
      expanded: handle?.getAttribute("aria-expanded") === "true",
      ariaExpanded: handle?.getAttribute("aria-expanded") ?? null,
      wrapH: wrap ? Math.round(wrap.getBoundingClientRect().height * 10) / 10 : null,
      dockH: raw ? Number.parseFloat(raw) : null,
    };
  });

const handleBox = (page) =>
  page.evaluate(() => {
    const handle = document.querySelector('[data-demo-id="dock-handle"]');
    const wrap = document.querySelector('nav[data-demo-id="terminal-dock"] > div');
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    };
    return { handle: handle ? r(handle) : null, wrap: wrap ? r(wrap) : null };
  });

/** A pointer drag with real elapsed time, so the velocity branch is exercised
 *  deliberately rather than by accident: Playwright's moves are instantaneous
 *  and every drag would otherwise read as a flick. */
async function drag(page, from, dy, { ms = 220, steps = 8 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x, from.y - (dy * i) / steps);
    await page.waitForTimeout(Math.round(ms / steps));
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
}

async function waitForCollapsed(page, timeout = 8_000) {
  await page
    .waitForFunction(
      () => document.querySelector('[data-demo-id="dock-handle"]')?.getAttribute("aria-expanded") === "false",
      null,
      { timeout },
    )
    .catch(() => {});
  await page.waitForTimeout(650); // let the height transition settle
}

/**
 * Put the dock back in its collapsed state between probes.
 *
 * The idle timer fires once, at mount; after Phase E an expand is a deliberate
 * act and nothing takes it back on its own. So the reset uses the product's
 * own affordance — the downward swipe on the body — rather than a reload,
 * which would also restart the 4s timer and race every subsequent probe.
 */
async function ensureCollapsed(page) {
  if (!(await dockState(page)).expanded) return true;
  const body = await page.evaluate(() => {
    const el = document.querySelector('[data-demo-id="dock-terminal"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!body) return false;
  await drag(page, body, -44, { ms: 200 });
  return !(await dockState(page)).expanded;
}

/**
 * §9.D. The terminal and the dock are siblings under App.tsx's <Router />, and
 * which feature screen is showing is view state rather than a route — so this
 * asserts the store actually carries the request across that gap. 64 on a
 * feature screen, 78 on home, and back.
 */
async function checkCollapseChannel(browser) {
  const { context, page } = await newRetailPage(browser, "collapse-channel", {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-viewport").waitFor({ state: "visible" });
    await page.waitForTimeout(700);

    const home = await dockState(page);
    if (home.dockH === null || Math.abs(home.dockH - DOCK_EXPANDED) > 1) {
      fail(`dock channel: --dock-h is ${home.dockH}px on the terminal home, expected ${DOCK_EXPANDED}px (§9.D)`);
    }

    /* Entering a feature screen must collapse the dock on its own — well
       inside the 4s idle timer, which is the whole point of the channel. */
    const startedAt = Date.now();
    await page.getByRole("button", { name: "add item", exact: true }).click();
    await page
      .waitForFunction(
        (collapsed) => {
          const raw = getComputedStyle(document.documentElement).getPropertyValue("--dock-h");
          return raw !== "" && Math.abs(Number.parseFloat(raw) - collapsed) <= 1;
        },
        DOCK_COLLAPSED,
        { timeout: 3_000 },
      )
      .catch(() => {});
    const elapsed = Date.now() - startedAt;
    const feature = await dockState(page);

    if (feature.dockH === null || Math.abs(feature.dockH - DOCK_COLLAPSED) > 1) {
      fail(
        `dock channel: --dock-h is ${feature.dockH}px on a feature screen, expected ${DOCK_COLLAPSED}px — the store request never reached the dock (§9.D)`,
      );
    } else if (elapsed > COLLAPSE_AFTER_MS - 500) {
      fail(
        `dock channel: the dock only reached ${DOCK_COLLAPSED}px after ${elapsed}ms — that is the idle timer firing, not the feature screen requesting it (§9.D)`,
      );
    }

    /* And released on the way back: "collapsed" is a request, not a latch. */
    await page.locator('.tp-layer:not(.leaving) button[aria-label="cancel"]').click();
    await page.waitForTimeout(900);
    const back = await dockState(page);
    if (back.dockH === null || Math.abs(back.dockH - DOCK_EXPANDED) > 1) {
      fail(
        `dock channel: --dock-h is ${back.dockH}px back on the home screen, expected ${DOCK_EXPANDED}px — the collapse request was not released (§9.D)`,
      );
    }
    return { home: home.dockH, feature: feature.dockH, featureAfterMs: elapsed, back: back.dockH };
  } finally {
    await context.close();
  }
}

/**
 * §9.E, the nine clauses of plan §4.3.
 *
 * Clause 1 reads "0 of 30 points expand it, except points inside the ~120×36
 * handle, which all do". Taken as *taps* that contradicts §7.4, which requires
 * a pointer tap never to expand the dock — expansion is a deliberate swipe or
 * a keyboard activation, nothing else. So it is gated as the stronger pair:
 * no tap anywhere expands, and an upward drag expands from inside the handle
 * and from nowhere else. Both halves are what the reported bug was about.
 */
async function checkGesture(browser) {
  const { context, page } = await newRetailPage(browser, "gesture", {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const out = {};
  try {
    await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-viewport").waitFor({ state: "visible" });
    await waitForCollapsed(page);

    const boxes = await handleBox(page);
    if (!boxes.handle || !boxes.wrap) {
      fail("gesture: no collapsed dock handle to probe (§9.E)");
      return out;
    }
    out.handle = { w: Math.round(boxes.handle.w), h: Math.round(boxes.handle.h) };
    out.wrap = { w: Math.round(boxes.wrap.w), h: Math.round(boxes.wrap.h) };

    /* Clause 7 — touch-action: none on the handle and nowhere wider. On the
       full-width strip it eats any page scroll that starts near the bottom. */
    const touchAction = await page.evaluate(() => ({
      handle: getComputedStyle(document.querySelector('[data-demo-id="dock-handle"]')).touchAction,
      wrap: getComputedStyle(document.querySelector('nav[data-demo-id="terminal-dock"] > div')).touchAction,
      nav: getComputedStyle(document.querySelector('nav[data-demo-id="terminal-dock"]')).touchAction,
    }));
    if (touchAction.handle !== "none") {
      fail(`gesture: the handle's touch-action is "${touchAction.handle}", expected "none" (§9.E clause 7)`);
    }
    if (touchAction.wrap === "none" || touchAction.nav === "none") {
      fail(
        `gesture: touch-action: none on the wrapper/nav (wrap ${touchAction.wrap}, nav ${touchAction.nav}) — it swallows page scrolls that start near the bottom edge (§9.E clause 7)`,
      );
    }

    /* Clause 6, by audit rather than by synthetic flick. A dispatched touch
       sequence in headless Chromium does not reliably drive compositor
       scrolling, so it can pass while the real gesture is eaten; what
       actually decides that is which elements in the bottom band declare
       touch-action: none, and that is deterministic. */
    const band = await page.evaluate(() => {
      const offenders = [];
      const bandTop = window.innerHeight - 80;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.bottom < bandTop || r.top > window.innerHeight || r.width === 0) continue;
        if (getComputedStyle(el).touchAction !== "none") continue;
        if (el.getAttribute("data-demo-id") === "dock-handle") continue;
        offenders.push({
          id: el.getAttribute("data-demo-id") || String(el.className || el.tagName).slice(0, 30),
          w: Math.round(r.width), h: Math.round(r.height),
        });
      }
      return offenders;
    });
    if (band.length) {
      fail(
        `gesture: ${band.length} element(s) other than the handle declare touch-action: none in the bottom 80px — a scroll flick starting there is eaten (§9.E clause 6): ${band
          .slice(0, 3)
          .map((b) => `${b.id} ${b.w}×${b.h}`)
          .join(", ")}`,
      );
    }

    /* Clause 1a — 30 taps across the collapsed wrapper, none of which may
       expand it. This is §6.2's probe, which found 30 of 30 expanding. */
    const points = [];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        points.push({
          x: boxes.wrap.x + (boxes.wrap.w * (col + 0.5)) / 6,
          y: boxes.wrap.y + (boxes.wrap.h * (row + 0.5)) / 5,
        });
      }
    }
    let tapsExpanded = 0;
    for (const point of points) {
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(80);
      if ((await dockState(page)).expanded) {
        tapsExpanded += 1;
        await ensureCollapsed(page);
      }
    }
    out.tapsExpanded = `${tapsExpanded}/${points.length}`;
    if (tapsExpanded) {
      fail(`gesture: ${tapsExpanded}/30 taps across the collapsed dock expanded it — a tap is not the gesture (§9.E clause 1)`);
    }

    /* Clause 1b — the same 30 points, dragged 56px up. Only the handle's own
       region may respond. */
    let outsideExpanded = 0;
    let insideMissed = 0;
    for (const point of points) {
      const inside =
        point.x >= boxes.handle.x && point.x <= boxes.handle.x + boxes.handle.w &&
        point.y >= boxes.handle.y && point.y <= boxes.handle.y + boxes.handle.h;
      if (!(await ensureCollapsed(page))) {
        fail("gesture: could not return the dock to its collapsed state between probes (§9.E clause 4)");
        break;
      }
      await drag(page, point, 56);
      const expanded = (await dockState(page)).expanded;
      if (inside && !expanded) insideMissed += 1;
      if (!inside && expanded) outsideExpanded += 1;
    }
    out.dragOutsideExpanded = outsideExpanded;
    out.dragInsideMissed = insideMissed;
    if (outsideExpanded) {
      fail(`gesture: ${outsideExpanded} upward drag(s) from outside the handle expanded the dock (§9.E clause 1)`);
    }
    if (insideMissed) {
      fail(`gesture: ${insideMissed} upward drag(s) from inside the handle failed to expand it (§9.E clause 1)`);
    }

    /* Clause 2 — 56px expands, 20px settles closed. */
    await ensureCollapsed(page);
    await drag(page, { x: boxes.handle.cx, y: boxes.handle.cy }, 56);
    if (!(await dockState(page)).expanded) {
      fail("gesture: a 56px upward drag on the handle did not expand the dock (§9.E clause 2)");
    }
    await ensureCollapsed(page);
    await drag(page, { x: boxes.handle.cx, y: boxes.handle.cy }, 20, { ms: 320 });
    if ((await dockState(page)).expanded) {
      fail("gesture: a slow 20px drag expanded the dock — below the 0.45 threshold it must settle closed (§9.E clause 2)");
    }

    /* Clause 3 — a flick faster than 0.4px/ms expands regardless of distance. */
    await ensureCollapsed(page);
    await drag(page, { x: boxes.handle.cx, y: boxes.handle.cy }, 20, { ms: 16, steps: 2 });
    if (!(await dockState(page)).expanded) {
      fail("gesture: a 20px flick faster than 0.4px/ms did not expand the dock (§9.E clause 3)");
    }

    /* Clause 4 — a downward drag on the expanded body collapses it, and a tap
       on an icon still navigates. The `< 6px` abort is what separates them:
       this is the one place where shrinking the hit area could regress the
       expanded dock. */
    if (!(await dockState(page)).expanded) {
      await drag(page, { x: boxes.handle.cx, y: boxes.handle.cy }, 56);
    }
    const body = await page.evaluate(() => {
      const r = document.querySelector('[data-demo-id="dock-terminal"]').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await drag(page, body, -40, { ms: 200 });
    if ((await dockState(page)).expanded) {
      fail("gesture: a downward drag on the expanded dock did not collapse it (§9.E clause 4)");
    }

    await drag(page, { x: boxes.handle.cx, y: boxes.handle.cy }, 56);
    await page.waitForTimeout(400);
    if (!(await dockState(page)).expanded) {
      fail("gesture: the dock would not reopen for the icon-tap probe (§9.E clause 4)");
    }
    await page.locator('[data-demo-id="dock-analytics"]').click({ timeout: 5_000 }).catch(() => {
      fail("gesture: could not tap a dock icon on the expanded dock — the handle or the drag layer is intercepting it (§9.E clause 4)");
    });
    await page.waitForTimeout(900);
    const url = page.url();
    if (!url.endsWith("/transactions")) {
      fail(`gesture: a tap on a dock icon did not navigate (landed on ${url}) — the drag handler swallowed it (§9.E clause 4)`);
    }
    out.iconTapNavigated = url.endsWith("/transactions");

    /* Clause 5 — the keyboard path. A gesture-only affordance is unreachable
       by keyboard and by switch control, and `event.detail === 0` is exactly
       the kind of discrimination a later refactor deletes as redundant. */
    await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-viewport").waitFor({ state: "visible" });
    await waitForCollapsed(page);
    const named = await page.evaluate(() => {
      const handle = document.querySelector('[data-demo-id="dock-handle"]');
      return { label: handle?.getAttribute("aria-label"), tag: handle?.tagName, expanded: handle?.getAttribute("aria-expanded") };
    });
    if (named.tag !== "BUTTON" || !named.label) {
      fail(`gesture: the handle is a <${named.tag?.toLowerCase()}> named "${named.label}" — it must be a button with an accessible name (§9.E clause 5)`);
    }
    if (named.expanded !== "false") {
      fail(`gesture: aria-expanded is "${named.expanded}" on a collapsed dock (§9.E clause 5)`);
    }
    await page.locator('[data-demo-id="dock-handle"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    const afterEnter = await dockState(page);
    if (!afterEnter.expanded) {
      fail("gesture: Enter on the focused handle did not expand the dock (§9.E clause 5)");
    }
    await waitForCollapsed(page);
    await page.locator('[data-demo-id="dock-handle"]').focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(700);
    if (!(await dockState(page)).expanded) {
      fail("gesture: Space on the focused handle did not expand the dock (§9.E clause 5)");
    }
    out.keyboard = "Enter and Space expand; aria-expanded tracks";
    return out;
  } finally {
    await context.close();
  }
}

/**
 * §9.F. `filter: none` at rest is the load-bearing half: the prototype left
 * visible scalloping between slots when the filter stayed on, and a
 * permanently filtered dock is a permanent GPU cost on every screen.
 */
async function checkMorph(browser, { goo = true, reducedMotion = false } = {}) {
  const { context, page } = await newRetailPage(browser, `morph-${goo ? "goo" : "flag-off"}${reducedMotion ? "-rm" : ""}`, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const label = reducedMotion ? "morph (reduced motion)" : goo ? "morph" : "morph (goo flag off)";
  const out = {};
  try {
    if (!goo) await page.addInitScript(() => { window.__TAPT_DOCK_GOO__ = false; });
    await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-viewport").waitFor({ state: "visible" });
    await page.waitForTimeout(700);

    /* Clause 5 — an explicit filter region. The default −10%/+10% clips a
       stdDeviation: 8 blur and the blobs come out with square edges. The
       <filter> only exists while the layer is mounted, so it is sampled
       during the morph below; the attributes are checked there. */

    /* Sample the whole collapse: the filter has to be live in the middle and
       gone at both ends, and a frame budget falls out of the same trace.

       The collapse is driven by entering a feature screen (Phase D) rather
       than by waiting out the idle timer — same code path, and it puts the
       morph at a known instant instead of ±4s of guessing. The sampler is
       started first and awaited after the click, so it is running before the
       first frame of the transition. */
    const tracePromise = page.evaluate(async () => {
      const nav = document.querySelector('nav[data-demo-id="terminal-dock"]');
      const navBefore = nav.getBoundingClientRect();
      const navPosition = getComputedStyle(nav).position;
      const samples = [];
      const started = performance.now();
      let last = started;
      let filterAttrs = null;
      let iconInsideFilter = false;
      let iconFilters = new Set();
      await new Promise((resolve) => {
        const tick = () => {
          const now = performance.now();
          const goo = document.querySelector('[data-demo-id="dock-goo"]');
          const filter = goo ? getComputedStyle(goo).filter : null;
          if (goo && !filterAttrs) {
            const node = goo.parentElement?.querySelector("filter") || document.querySelector('nav[data-demo-id="terminal-dock"] filter');
            if (node) {
              filterAttrs = ["x", "y", "width", "height"].map((a) => node.getAttribute(a));
            }
            for (const icon of document.querySelectorAll('nav[data-demo-id="terminal-dock"] [data-demo-id^="dock-"]')) {
              if (icon.getAttribute("data-demo-id") === "dock-goo") continue;
              if (goo.contains(icon)) iconInsideFilter = true;
              iconFilters.add(getComputedStyle(icon).filter);
            }
          }
          const wrap = nav.querySelector(":scope > div");
          samples.push({
            t: Math.round(now - started),
            frame: Math.round(now - last),
            goo: !!goo,
            filter,
            wrapH: wrap ? Math.round(wrap.getBoundingClientRect().height * 100) / 100 : null,
          });
          last = now;
          if (now - started > 1_600) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const navAfter = nav.getBoundingClientRect();
      return {
        samples,
        filterAttrs,
        iconInsideFilter,
        iconFilters: [...iconFilters],
        navPosition,
        navMoved: Math.abs(navAfter.x - navBefore.x) > 0.5 || Math.abs(navAfter.width - navBefore.width) > 0.5,
      };
    });
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "add item", exact: true }).click();
    const trace = await tracePromise;

    const live = trace.samples.filter((s) => s.filter && s.filter !== "none");
    const withLayer = trace.samples.filter((s) => s.goo);
    out.framesWithLayer = withLayer.length;
    out.framesFiltered = live.length;

    /* How long the dock's own height was in motion. This is the duration
       clause 8 compares between the goo path and the fallback, and the one
       clause 4 holds to ~150ms under reduced motion. */
    const moving = trace.samples.filter(
      (s, i) => i > 0 && s.wrapH !== null && Math.abs(s.wrapH - trace.samples[i - 1].wrapH) > 0.05,
    );
    const heightSpanMs = moving.length ? moving[moving.length - 1].t - moving[0].t : null;
    out.heightSpanMs = heightSpanMs;

    if (reducedMotion) {
      /* Clause 4 — under reduced motion the goo is skipped entirely and the
         change completes in ~150ms rather than the 420/480ms choreography. */
      if (withLayer.length) {
        fail(`${label}: the blob layer mounted under prefers-reduced-motion (§9.F clause 4)`);
      }
      if (live.length) {
        fail(`${label}: a filter was applied under prefers-reduced-motion (§9.F clause 4)`);
      }
      if (heightSpanMs === null) {
        notes.push(`${label}: the dock height never changed across the sampled window; settle time not measured`);
      } else {
        out.reducedMotionSettleMs = heightSpanMs;
        if (heightSpanMs > 200) {
          fail(
            `${label}: the collapse took ${heightSpanMs}ms under prefers-reduced-motion, expected a ~150ms cross-fade (§9.F clause 4)`,
          );
        }
      }
    } else {
      if (!withLayer.length) {
        fail(`${label}: the blob layer never mounted across a full collapse — the morph is not running (§9.F clause 2)`);
      }
      if (goo && withLayer.length && !live.length) {
        fail(`${label}: the blob layer mounted but no filter was ever applied — "off at rest" cannot be satisfied by never turning it on (§9.F clause 2)`);
      }
      if (!goo && live.length) {
        fail(`${label}: a filter was applied with __TAPT_DOCK_GOO__ = false (§9.F clause 8)`);
      }
      if (goo && trace.filterAttrs && trace.filterAttrs.some((a) => !a)) {
        fail(
          `${label}: the <filter> has no explicit region (x/y/width/height = ${JSON.stringify(trace.filterAttrs)}) — the default −10%/+10% clips a stdDeviation: 8 blur (§9.F clause 5)`,
        );
      }
      if (trace.iconInsideFilter) {
        fail(`${label}: a dock icon is a descendant of the filtered layer — the prototype blurred every icon into a smudge (§9.F clause 3)`);
      }
      const smudged = trace.iconFilters.filter((f) => f && f !== "none");
      if (smudged.length) {
        fail(`${label}: an icon carries its own filter (${smudged.join(", ")}) (§9.F clause 3)`);
      }
      out.filterRegion = trace.filterAttrs;
    }

    /* Clause 1 — none at rest, in both states, sampled after the morph and
       again after a long idle. */
    await page.waitForTimeout(2_000);
    const atRest = await page.evaluate(() => {
      const nav = document.querySelector('nav[data-demo-id="terminal-dock"]');
      const filtered = [];
      for (const el of nav.querySelectorAll("*")) {
        const f = getComputedStyle(el).filter;
        if (f && f !== "none") filtered.push({ id: el.getAttribute("data-demo-id") || el.tagName, filter: f });
      }
      return { filtered, collapsed: document.querySelector('[data-demo-id="dock-handle"]')?.getAttribute("aria-expanded") === "false" };
    });
    if (atRest.filtered.length) {
      fail(
        `${label}: ${atRest.filtered.length} element(s) still carry a filter 2s after the collapse settled (§9.F clause 1): ${atRest.filtered
          .map((f) => f.id)
          .join(", ")}`,
      );
    }
    out.restingFilters = atRest.filtered.length;

    /* Clause 6 — the nav stays fixed, with an unchanged rect, while a filter
       is applied to its descendant. */
    if (trace.navPosition !== "fixed") {
      fail(`${label}: the <nav> is ${trace.navPosition}, not fixed, during the morph (§9.F clause 6)`);
    }
    if (trace.navMoved) {
      fail(`${label}: the <nav>'s rect moved while the filter was applied (§9.F clause 6)`);
    }

    /* Clause 7 — the frame budget, recorded as a baseline. Headless is not a
       phone GPU: this proves the budget is not blown, not that it is free. */
    const morphFrames = trace.samples.filter((s) => s.goo);
    const worst = morphFrames.reduce((a, b) => (b.frame > a ? b.frame : a), 0);
    out.worstFrameMs = worst;
    if (morphFrames.length && worst > 32) {
      fail(`${label}: worst frame across the morph was ${worst}ms, over the 32ms budget (§9.F clause 7)`);
    }

    /* Clause 8's second half — with the flag off the motion must still be
       correct, not merely present: same duration, same end geometry. */
    out.endGeometry = await page.evaluate(() => {
      const wrap = document.querySelector('nav[data-demo-id="terminal-dock"] > div');
      const nav = document.querySelector('nav[data-demo-id="terminal-dock"]');
      return {
        wrapH: Math.round(wrap.getBoundingClientRect().height * 10) / 10,
        navH: Math.round(nav.getBoundingClientRect().height * 10) / 10,
      };
    });
    out.morphSpanMs = withLayer.length ? withLayer[withLayer.length - 1].t - withLayer[0].t : 0;
    return out;
  } finally {
    await context.close();
  }
}

/* ── main ────────────────────────────────────────────────────────────────── */

/**
 * A phase's checks throwing must not cost the whole run. Playwright's
 * actionability timeouts are the common case — a probe that cannot reach the
 * state it wants is a finding about the dock, not a reason to lose the other
 * five phases' results.
 */
async function guard(name, run) {
  try {
    return await run();
  } catch (error) {
    fail(`${name}: the check threw — ${String(error?.message ?? error).split("\n")[0]}`);
    return { threw: String(error?.message ?? error).split("\n")[0] };
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });
  const report = {};

  try {
    for (const phone of runs("screens") ? PHONES : []) {
      const key = `${phone.w}x${phone.h}`;
      const { context, page } = await newRetailPage(browser, key, {
        viewport: { width: phone.w, height: phone.h },
        hasTouch: true,
        isMobile: true,
      });
      try {
        await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
        await page.locator(".tp-viewport").waitFor({ state: "visible" });
        await page.waitForTimeout(900);

        /* Feature screens first — the dock is still expanded here, which is the
           worst case for clause 2 and the state the reservation must clear. */
        report[key] = { retail: await walkRetailFeatureScreens(page, phone) };
      } finally {
        await context.close();
      }

      report[key].property = await verticalRun(browser, phone, {
        route: "/property/terminal",
        vertical: "property",
        slots: ["tenants", "send", "bill", "external"],
      });
      report[key].trades = await verticalRun(browser, phone, {
        route: "/trades/terminal",
        vertical: "trades",
        slots: ["clients", "quote", "invoice", "external"],
      });
    }

    /* The dock contract gets its own page. It has to observe the dock from its
       expanded resting state and then watch a full idle-timer window, and the
       idle timer starts at mount — sharing a page with the screen walk would
       race it, which is how the first version of this check ended up sampling
       after the transition had already finished.

       One viewport is enough: navWidth varies with the screen, the dock's
       height does not. */
    if (runs("dock")) {
    const contract = await newRetailPage(browser, "dock-contract", {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      await contract.page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
      await contract.page.locator(".tp-viewport").waitFor({ state: "visible" });
      report.dock = await checkDockContract(contract.page, "dock @ 390x844");
    } finally {
      await contract.context.close();
    }

    /* The absent-dock case needs only one viewport. */
    const { context, page } = await newRetailPage(browser, "absent", {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      report.dockAbsent = await checkDockAbsent(page);
    } finally {
      await context.close();
    }
    }

    /* §9.C's blocking clause. --kp-size reads 100cqh of the panel; if the
       container query is not resolving, the token pins to its cap and reads
       the same at every size — which is the failure SPEC §1.2 measured, and
       it is invisible to a "the token is set" assertion. */
    const keySizes = Object.entries(report)
      .filter(([, value]) => value?.retail?.keypadSizing)
      .map(([key, value]) => [key, value.retail.keypadSizing.kpSize]);
    const at320 = keySizes.find(([key]) => key.startsWith("320x"))?.[1];
    const at390 = keySizes.find(([key]) => key.startsWith("390x"))?.[1];
    if (at320 !== undefined && at390 !== undefined && Math.abs(at320 - at390) < 1) {
      fail(
        `keypad: --kp-size is ${at320}px at 320 and ${at390}px at 390 — the container query is not resolving and the token has pinned to its cap (§9.C, blocking)`,
      );
    }
    report.keypadSizes = Object.fromEntries(keySizes);

    /* §9.B2 clause 4 — the hero yields first, swept on one page. */
    if (runs("grid")) {
    const sweep = await newRetailPage(browser, "hero-yield", {
      viewport: { width: 390, height: 932 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      await sweep.page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
      await sweep.page.locator(".tp-viewport").waitFor({ state: "visible" });
      await sweep.page.waitForTimeout(900);
      await sweep.page.getByRole("button", { name: "add item", exact: true }).click();
      await settle(sweep.page);
      report.heroYields = await guard("hero sweep", () => checkHeroYields(sweep.page, "hero sweep @ 390"));
    } finally {
      await sweep.context.close();
    }
    }

    if (runs("channel")) {
      report.collapseChannel = await guard("dock channel", () => checkCollapseChannel(browser));
    }
    if (runs("gesture")) {
      report.gesture = await guard("gesture", () => checkGesture(browser));
    }
    if (runs("morph")) {
      report.morph = await guard("morph", () => checkMorph(browser, { goo: true }));
      report.morphFlagOff = await guard("morph (goo flag off)", () => checkMorph(browser, { goo: false }));
      report.morphReducedMotion = await guard("morph (reduced motion)", () => checkMorph(browser, { goo: true, reducedMotion: true }));
    }

    /* Clause 8's binding half (DK3): with the filter off the motion must be
       correct, not merely present — same duration, same end geometry. */
    const withGoo = report.morph;
    const without = report.morphFlagOff;
    if (withGoo?.heightSpanMs && without?.heightSpanMs) {
      if (Math.abs(withGoo.heightSpanMs - without.heightSpanMs) > 80) {
        fail(
          `morph: the collapse takes ${withGoo.heightSpanMs}ms with the goo and ${without.heightSpanMs}ms without it — DK3 requires the timing not to depend on the filter (§9.F clause 8)`,
        );
      }
      if (
        withGoo.endGeometry && without.endGeometry &&
        Math.abs(withGoo.endGeometry.wrapH - without.endGeometry.wrapH) > 1
      ) {
        fail(
          `morph: the collapse ends at ${withGoo.endGeometry.wrapH}px with the goo and ${without.endGeometry.wrapH}px without it (§9.F clause 8)`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  for (const note of notes) console.log(`note: ${note}`);

  if (failures.length) {
    console.error(`\nTerminal dock gate FAILED — ${failures.length} finding(s):\n`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`\nTerminal dock gate passed (${ONLY.length ? ONLY.join(", ") : "phases A–F"}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
