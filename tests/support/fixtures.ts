/* Deterministic page factory for the §7.1 golden suite.
 *
 * docs/PLAN-2026-08-17-mobile-responsive-ui.md §7.1 lists five determinism
 * hazards. Four of them are handled here (the fifth, `animations: "disabled"`,
 * is a `toHaveScreenshot` default set in playwright.config.ts):
 *
 *   fonts       — `fonts.googleapis.com` and `fonts.gstatic.com` are routed to
 *                 the pinned copy under `tests/golden/fonts/`. MD6 ("self-host
 *                 the fonts?") is still open and this deliberately does not
 *                 answer it: nothing in `client/**` changes, the interception
 *                 lives entirely in the test.
 *   clock       — `page.clock.setFixedTime()` for the browser, plus the
 *                 module-evaluation freeze below for the fixture data.
 *   timezone    — `Pacific/Auckland`, set by `newRetailPage`.
 *   scrollbars  — `tests/golden/screenshot.css`, applied per capture.
 *
 * The page itself comes from `scripts/mobile-fixtures.mjs` — the same factory
 * the §7.2 geometry gate and the phase-K keyboard gate use, so a golden and a
 * geometry assertion are always looking at the same app in the same state.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const FONT_DIR = path.join(REPO_ROOT, "tests", "golden", "fonts");

/* 2026-08-20 09:30 NZST — a Thursday morning, well inside business hours, so
   no fixture lands on a weekend-vs-weekday or am/pm branch. */
export const FIXED_TIME_ISO = "2026-08-20T09:30:00+12:00";
export const FIXED_MS = Date.parse(FIXED_TIME_ISO);

/* ── the fixture-data clock ───────────────────────────────────────────────
 *
 * `retail-fixtures.mjs:17` and `mobile-fixtures.mjs:23` both take
 * `const now = Date.now()` at module-evaluation time and bake ISO strings from
 * it. `daysAgo()` pins its hour so it is stable across a day, but `minutesAgo()`
 * and `ahead()` keep the live time-of-day — so "8 minutes ago" and "due in 5
 * days, 09:31:47" move on every run, and any relative label the app renders
 * moves with them. Freezing `Date.now` for the duration of the import pins the
 * whole fixture set without touching `scripts/**`.
 *
 * This has to be the first import of those modules in the worker: ESM caches by
 * specifier, so a module already evaluated would keep its live timestamps.
 * `playwright.config.ts` therefore deliberately does not import from `scripts/`
 * — see the note there — and the self-check below turns a regression into a
 * loud failure rather than a slow flake. */
const realNow = Date.now;
Date.now = () => FIXED_MS;
let retailFixtures: any;
let mobileFixtures: any;
try {
  retailFixtures = await import("../../scripts/desktop-shots/retail-fixtures.mjs");
  mobileFixtures = await import("../../scripts/mobile-fixtures.mjs");
} finally {
  Date.now = realNow;
}

{
  const expected = new Date(FIXED_MS - 8 * 60_000).toISOString();
  const actual = retailFixtures.RETAIL_TRANSACTIONS?.[0]?.createdAt;
  if (actual !== expected) {
    throw new Error(
      `golden fixtures: the clock freeze did not take — RETAIL_TRANSACTIONS[0].createdAt is ` +
      `${actual}, expected ${expected}. Something imported scripts/desktop-shots/retail-fixtures.mjs ` +
      `before tests/support/fixtures.ts did, so its timestamps are live and the goldens will flake.`,
    );
  }
}

export const BASE_URL: string = mobileFixtures.BASE_URL;
export const CHROMIUM_PATH: string | undefined = mobileFixtures.CHROMIUM_PATH;
export const MERCHANT_ID: number = mobileFixtures.MERCHANT_ID;
export const VERTICALS: Record<string, { route: string; mode: string }> = mobileFixtures.VERTICALS;
const newMobilePage = mobileFixtures.newMobilePage;

export type Vertical = "retail" | "property" | "trades";

/* ── fonts ────────────────────────────────────────────────────────────────
 *
 * `client/src/index.css:10` asks for Inter+Outfit and `client/index.html:219`
 * asks for Outfit alone; Google answers each with a different stylesheet, and
 * serves different binaries by UA. Both stylesheets are pinned, keyed by the
 * sorted family list so a request can never be answered with the wrong one —
 * fulfilling the Inter+Outfit sheet for the Outfit-only request would put two
 * extra families into `document.fonts` and change what the §K5 audit sees. */
const FONT_CSS: Record<string, string> = {
  "Inter+Outfit": path.join(FONT_DIR, "inter-outfit.css"),
  "Outfit": path.join(FONT_DIR, "outfit.css"),
};

/** `https://fonts.gstatic.com/s/inter/v20/UcC7….woff2` → `inter-v20-UcC7….woff2`. */
function gstaticFileName(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  if (parts.length < 4 || parts[0] !== "s") return null;
  return `${parts[1]}-${parts[2]}-${parts[parts.length - 1]}`;
}

async function installFontRoutes(page: Page, unpinned: string[]) {
  await page.route("https://fonts.googleapis.com/**", async (route) => {
    const url = new URL(route.request().url());
    const key = url.searchParams
      .getAll("family")
      .map((f) => f.split(":")[0])
      .sort()
      .join("+");
    const file = FONT_CSS[key];
    if (!file || !existsSync(file)) {
      unpinned.push(`stylesheet ${url.search} (key "${key}")`);
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    }
    return route.fulfill({
      status: 200,
      contentType: "text/css; charset=utf-8",
      body: readFileSync(file, "utf8"),
    });
  });

  await page.route("https://fonts.gstatic.com/**", async (route) => {
    const name = gstaticFileName(route.request().url());
    const file = name ? path.join(FONT_DIR, "woff2", name) : null;
    if (!file || !existsSync(file)) {
      unpinned.push(`binary ${route.request().url()}`);
      return route.abort();
    }
    return route.fulfill({
      status: 200,
      contentType: "font/woff2",
      headers: { "cache-control": "public, max-age=31536000" },
      body: readFileSync(file),
    });
  });

  /* `client/index.html:235` loads Replit's dev banner from replit.com. It is a
     third-party request the capture does not need and cannot depend on. */
  await page.route("https://replit.com/**", (route) => route.abort());
}

/* ── DPR ──────────────────────────────────────────────────────────────────
 *
 * `newRetailPage` hard-codes `deviceScaleFactor: 1` *after* spreading its
 * caller's options, so the tier-1 DPR-2 captures cannot ask for 2 through the
 * fixture. Rather than fork the factory (scripts/** is owned elsewhere), hand
 * it a browser whose `newContext` re-applies the scale factor last. */
function withDeviceScaleFactor(browser: Browser, dpr: number): Browser {
  if (dpr === 1) return browser;
  return new Proxy(browser, {
    get(target, prop, receiver) {
      if (prop === "newContext") {
        return (options: Record<string, unknown> = {}) =>
          target.newContext({ ...options, deviceScaleFactor: dpr });
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Browser;
}

export interface GoldenPage {
  context: BrowserContext;
  page: Page;
  /** page errors / console errors / 4xx collected by `newRetailPage`. */
  errors: string[];
  /** font requests that had no pinned copy — must stay empty. */
  unpinnedFonts: string[];
}

export interface GoldenPageOptions {
  width: number;
  height: number;
  dpr?: number;
  /** navigate to the vertical's terminal route and wait for first paint. */
  navigate?: boolean;
}

export async function openGoldenPage(
  browser: Browser,
  vertical: Vertical,
  { width, height, dpr = 1, navigate = true }: GoldenPageOptions,
): Promise<GoldenPage> {
  const unpinnedFonts: string[] = [];
  const { context, page, errors } = await newMobilePage(
    withDeviceScaleFactor(browser, dpr),
    vertical,
    { width, height },
  );

  /* Before the first navigation, so no script ever observes the real clock. */
  await page.clock.setFixedTime(new Date(FIXED_MS));
  await installFontRoutes(page, unpinnedFonts);

  if (navigate) {
    await page.goto(`${BASE_URL}${VERTICALS[vertical].route}`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-viewport").waitFor({ state: "visible", timeout: 45_000 });
    await settle(page);
  }
  return { context, page, errors, unpinnedFonts };
}

/* ── settling ─────────────────────────────────────────────────────────────
 *
 * `animations: "disabled"` fast-forwards CSS animations at capture time, but it
 * does nothing about the two things this app does in JS after paint:
 * `useFitTerminalAmounts` shrinks the amount until it fits, and
 * `useMeasuredChromeGutter` measures the action bar and writes a custom
 * property. Both settle within a frame or two, and both move geometry. The
 * conveyor is a third: a `.tp-layer.leaving` sits over the screen for ~650ms.
 *
 * So: wait the outgoing layer out, wait for the faces, then poll a geometry
 * digest until two consecutive samples agree. */
const GEOMETRY_DIGEST = () => {
  /* Elements under a live animation are skipped, along with their subtrees.
     `.tp-pulse` on the success check and the WireframeLiquidButton's gradient
     both run forever, so a digest that included them would never hold still —
     and it does not need to: `animations: "disabled"` pins every animation to a
     defined frame at capture time. What this poll is actually waiting for is
     the two JS passes that move real layout, `useFitTerminalAmounts` and
     `useMeasuredChromeGutter`. */
  const animated = new Set<Element>();
  for (const animation of document.getAnimations()) {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    if (target) animated.add(target);
  }
  const isAnimated = (el: Element) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (animated.has(node)) return true;
    }
    return false;
  };

  const parts: string[] = [];
  const root = document.querySelector(".tp-viewport") ?? document.body;
  for (const el of root.querySelectorAll("*")) {
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (isAnimated(el)) continue;
    /* quarter-pixel resolution: below the threshold anything visible would
       shift, above the float noise of a container-query length. */
    parts.push(
      `${Math.round(r.x * 4)},${Math.round(r.y * 4)},${Math.round(r.width * 4)},${Math.round(r.height * 4)}`,
    );
  }
  return parts.join("|");
};

/* ── the dock's idle collapse, pinned ─────────────────────────────────────
 *
 * `TerminalDockView` collapses itself 4s after mount (`collapseAfterMs = 4_000`,
 * TerminalDockView.tsx:108) and morphs for up to 520ms on the way down
 * (`:258`). GEOMETRY_DIGEST below cannot see any of that: it skips elements
 * under a live animation *and their subtrees*, so the dock drops out of the
 * digest for precisely the window in which it is moving, and the digest
 * cheerfully reports "held still" while the dock is mid-collapse.
 *
 * The observable cost was a 4,120-pixel diff — 3% of the frame, the entire dock
 * band — between two runs of identical code, because one run captured the dock
 * expanded and the next captured it collapsed. `page.clock.setFixedTime()` does
 * not help: it freezes `Date.now()`, not `setTimeout`, so the idle timer still
 * fires on wall-clock time. (`page.clock.install()` would control the timer, but
 * it would also stall every other `setTimeout` the app depends on to settle.)
 *
 * So goldens are taken in the dock's RESTING state: wait out the idle timer and
 * the morph, then require its geometry to hold still. Costs ~5s per capture and
 * buys a state that is the same on every run and on every machine. */
const DOCK_SELECTOR = 'nav[data-demo-id="terminal-dock"]';
const DOCK_IDLE_MS = 4_000;
const DOCK_MORPH_MS = 520;

async function settleDock(page: Page) {
  const present = await page.evaluate(
    (sel) => Boolean(document.querySelector(sel)),
    DOCK_SELECTOR,
  );
  if (!present) return; /* not every screen mounts one */

  await page.waitForTimeout(DOCK_IDLE_MS + DOCK_MORPH_MS + 300);

  const sample = (sel: string) => {
    const nav = document.querySelector(sel);
    if (!nav) return "gone";
    const rect = nav.getBoundingClientRect();
    const dockH = getComputedStyle(document.documentElement)
      .getPropertyValue("--dock-h")
      .trim();
    return `${rect.top.toFixed(2)}|${rect.height.toFixed(2)}|${dockH}`;
  };

  const deadline = Date.now() + 8_000;
  let previous: string | null = null;
  let stable = 0;
  while (Date.now() < deadline) {
    const current = await page.evaluate(sample, DOCK_SELECTOR);
    if (current === previous) {
      stable += 1;
      if (stable >= 2) return;
    } else {
      stable = 0;
    }
    previous = current;
    await page.waitForTimeout(150);
  }
  throw new Error(
    "settle: the dock never reached a resting state — its geometry kept moving " +
      "past the idle timer, so a golden taken here would not be reproducible",
  );
}

export async function settle(page: Page, { timeout = 12_000 } = {}) {
  await settleDock(page);
  await page
    .waitForFunction(() => !document.querySelector(".tp-layer.leaving"), null, { timeout: 4_000 })
    .catch(() => {
      /* not every screen change uses the conveyor; a timeout here is not a
         failure, the digest below is the real gate. */
    });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const deadline = Date.now() + timeout;
  let previous: string | null = null;
  let stable = 0;
  while (Date.now() < deadline) {
    const digest = await page.evaluate(GEOMETRY_DIGEST);
    if (digest === previous) {
      stable += 1;
      if (stable >= 2) return;
    } else {
      stable = 0;
    }
    previous = digest;
    await page.waitForTimeout(120);
  }
  throw new Error("settle: layout never held still for two consecutive samples");
}

/* ── §K5, applied to the capture ──────────────────────────────────────────
 *
 * A1 §4.3: `.tp-amount` is authored at 900 (retail) / 800 (elsewhere), and the
 * stylesheet requested `wght@100..700` until 2026-08-27 — every one of those was
 * a browser-synthesised face. A golden captured against a synthesised face is
 * not a baseline, so this re-runs the phase-K check against the *pinned* copy
 * rather than assuming the pin carried the range across.
 *
 * `document.fonts.check("900 16px Outfit")` is the wrong instrument: CSS font
 * matching answers 900 with the nearest face it has and returns true. This
 * walks the face set and asks whether any face *covers* the weight — a variable
 * face reports its range as `100 900`, a static one a single number. Lifted from
 * `scripts/verify-mobile-keyboard.mjs` §K5. */
export interface FontAudit {
  drawn: number;
  faces: number;
  families: string[];
  gaps: { family: string; weight: number; count: number; sample: string }[];
}

export async function auditFonts(page: Page): Promise<FontAudit> {
  return page.evaluate(async () => {
    await document.fonts.ready;

    const faces = [...document.fonts].map((face) => ({
      family: face.family.replace(/["']/g, "").trim(),
      weight: face.weight,
    }));
    const families = new Set(faces.map((f) => f.family));

    const covers = (family: string, weight: number) =>
      faces.some((face) => {
        if (face.family !== family) return false;
        const bounds = face.weight.trim().split(/\s+/).map(Number);
        if (bounds.some(Number.isNaN)) return false;
        const [lo, hi = lo] = bounds;
        return weight >= lo && weight <= hi;
      });

    const webFamily = (stack: string) => {
      for (const raw of stack.split(",")) {
        const name = raw.replace(/["']/g, "").trim();
        if (families.has(name)) return name;
      }
      return null;
    };

    const gaps = new Map<string, { family: string; weight: number; count: number; sample: string }>();
    let drawn = 0;
    for (const el of document.querySelectorAll("body *")) {
      const draws = [...el.childNodes].some(
        (node) => node.nodeType === 3 && (node.textContent ?? "").trim() !== "",
      );
      if (!draws) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      drawn++;

      const family = webFamily(style.fontFamily);
      if (!family) continue;
      const weight = Number.parseInt(style.fontWeight, 10);
      if (!Number.isFinite(weight) || covers(family, weight)) continue;

      const key = `${family} ${weight}`;
      const entry = gaps.get(key) ?? { family, weight, count: 0, sample: "" };
      entry.count++;
      if (!entry.sample) {
        entry.sample = (el.getAttribute("data-demo-id") ?? el.className ?? el.tagName)
          .toString()
          .trim()
          .slice(0, 48);
      }
      gaps.set(key, entry);
    }
    return { gaps: [...gaps.values()], drawn, faces: faces.length, families: [...families] };
  });
}
