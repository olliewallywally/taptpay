/* Desktop/tablet page-transition probe.
 *
 * Not a screenshot script — it instruments the DOM and reports, for every
 * navigation, whether the persistent app chrome (the 13" frame + header + nav)
 * survived, and whether anything painted over it.
 *
 * Every signal below decides the exit code:
 *   - chrome REMOUNTED — the frame was torn down and rebuilt.          GATES
 *   - route-loader     — `[data-testid='page-loader']`, the full-screen
 *                        loader, painted over the app.                 GATES
 *   - page slot suspended — allowed only while visible, bounded, and cleared.
 *   - route identity / browser errors — must match the requested screen and be
 *                        free of page, console, request, and HTTP failures.
 *
 * That split is the whole point: matching bare `.animate-spin` (as this once
 * did) counts a page's own QR or PDF spinner as a full-screen flash, which made
 * the probe fail on a healthy tree and unusable as a gate. Desktop app routes
 * cannot render the route loader at all. Its page fallback is deliberately
 * visible and bounded, so a spinner inside intact chrome is content.
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
const MAX_FALLBACK_MS = 1_500;
// In dev, an unrelated file save makes Vite issue a `full-reload`, which wipes
// the injected instrumentation and resets every React.lazy wrapper. Re-inject
// before each hop and read the events back per hop rather than keeping one
// global timeline, so a stray reload costs one row instead of the whole run.

/* Runs in the page via `page.evaluate`, so it is serialised and loses its
   closure: every selector below must stay an inline literal. Hoisting them to
   module constants would throw a ReferenceError inside the browser. */
const INSTRUMENT = () => {
  const w = window;
  if (w.__probe) return;
  w.__probe = { ev: [], t0: performance.now() };
  const log = (type, detail) =>
    w.__probe.ev.push({ t: +(performance.now() - w.__probe.t0).toFixed(1), type, detail });
  w.__probeMark = (label) => log("MARK", label);

  /* React swaps whole subtrees, so the element of interest is usually a
     descendant of the mutated node rather than the node itself. */
  const find = (n, selector) =>
    n instanceof HTMLElement
      ? n.matches?.(selector)
        ? n
        : (n.querySelector?.(selector) ?? null)
      : null;

  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.removedNodes) {
        if (find(n, "[data-testid='desktop-frame']")) log("chrome-unmounted", null);
        /* Paired with `page-fallback` to time how long the page area actually
           stayed blank — a one-frame suspension is invisible, a long one is the
           flash this whole exercise exists to prevent. */
        if (find(n, "[data-testid='desktop-page-fallback']")) log("page-fallback-gone", null);
      }
      for (const n of r.addedNodes) {
        if (find(n, "[data-testid='desktop-frame']")) log("chrome-mounted", null);

        /* The gating signal: the route-level loader painting over everything. */
        if (find(n, "[data-testid='page-loader']")) {
          log("route-loader", null);
        } else {
          /* Otherwise any spinner is page *content* — board-builder's QR
             preview, a PDF button. Reported so it stays visible, never gating:
             a page rendering its own loading state inside chrome that never
             moved is correct behaviour, not a transition flash. Skipped above
             so the route loader's own spinner child is not double-counted. */
          /* `getAttribute`, not `className`: lucide spinners are <svg>, whose
             `className` is an SVGAnimatedString and stringifies to junk. */
          const spinner = find(n, ".animate-spin");
          if (spinner) log("content-spinner", (spinner.getAttribute("class") ?? "").slice(0, 60));
        }

        /* Chrome held but the page slot suspended, so the page area went briefly
           blank. Inherent to code-splitting the first time a route is visited,
           hence reported rather than failed. */
        const fallback = find(n, "[data-testid='desktop-page-fallback']");
        if (fallback) {
          log("page-fallback", {
            blank: !fallback.textContent?.trim(),
            state: fallback.dataset.loadingState ?? null,
          });
        }
        if (find(n, "[data-testid='desktop-page-error']")) log("page-chunk-error", null);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
};

/* Nav-bar clicks within the retail vertical, run twice: lap 1 initialises each
   React.lazy wrapper, lap 2 is the steady state. */
const NAV_HOPS = [
  { label: "stock", path: "/stock", page: "directory" },
  { label: "terminal", path: "/terminal", page: "terminal" },
  { label: "analytics", path: "/transactions", page: "analytics" },
  { label: "settings", path: "/settings", page: "settings" },
  { label: "home", path: "/dashboard", page: "home" },
];

/* Routes the nav bar cannot reach: the other two verticals, a quick action with
   a one-shot param, and the two legacy mobile-in-a-column screens. */
const PUSH_ROUTES = [
  { route: "/property", path: "/property", vertical: "property", page: "home" },
  { route: "/property/tenants", path: "/property/tenants", vertical: "property", page: "directory" },
  { route: "/property/terminal", path: "/property/terminal", vertical: "property", page: "terminal" },
  { route: "/property/analytics", path: "/property/analytics", vertical: "property", page: "analytics" },
  { route: "/trades", path: "/trades", vertical: "trades", page: "home" },
  { route: "/trades/clients", path: "/trades/clients", vertical: "trades", page: "directory" },
  { route: "/trades/terminal", path: "/trades/terminal", vertical: "trades", page: "terminal" },
  { route: "/trades/analytics", path: "/trades/analytics", vertical: "trades", page: "analytics" },
  { route: "/terminal?quick=1", path: "/terminal", vertical: "retail", page: "terminal" },
  { route: "/property/tenants/1", path: "/property/tenants/1", vertical: "property", page: "directory" },
  { route: "/board-builder", path: "/board-builder", vertical: "retail", page: "settings" },
];

const DEVICE_CLASSES = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: false }],
];

async function probe(browser, label, contextOptions) {
  /* The property/trades/settings endpoints these hops touch are mocked by
     `installRetailMocks` itself, so every script that walks past retail gets
     them; this probe no longer patches them in on the side. */
  const { context, page, errors } = await newRetailPage(browser, label, contextOptions);

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(PRELOAD_DRAIN_MS);

  const hops = [];
  const runHop = async (name, expected, act, shotName) => {
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
    const result = await page.evaluate(() => {
      const out = window.__probe?.ev ?? [];
      if (window.__probe) window.__probe.ev = [];
      const surface = document.querySelector("[data-desktop-page]");
      return {
        ev: out,
        actual: {
          path: location.pathname,
          page: surface?.dataset.desktopPage ?? null,
          vertical: surface?.dataset.desktopVertical ?? null,
          fallbackState:
            document.querySelector("[data-testid='desktop-page-fallback']")?.dataset.loadingState ?? null,
          pageError: !!document.querySelector("[data-testid='desktop-page-error']"),
        },
      };
    });
    hops.push({ name, expected, ...result, reloadedBefore: !alive });
  };

  for (const lap of [1, 2]) {
    for (const nav of NAV_HOPS) {
      await runHop(
        `lap${lap} nav → ${nav.label}`,
        { path: nav.path, vertical: "retail", page: nav.page },
        () => page.getByRole("button", { name: nav.label, exact: true }).click(),
        WANT_SHOTS && lap === 1 ? nav.label : null,
      );
    }
  }

  for (const spec of PUSH_ROUTES) {
    await runHop(`push → ${spec.route}`, spec, () =>
      page.evaluate((p) => {
        history.pushState({}, "", p);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, spec.route),
    );
  }

  await context.close();
  return { hops, errors };
}

function report(label, hops) {
  const rows = hops.map(({ name, expected, actual, ev, reloadedBefore }) => {
    const unmount = ev.find((e) => e.type === "chrome-unmounted");
    const mount = unmount ? ev.find((e) => e.type === "chrome-mounted" && e.t >= unmount.t) : null;
    const spinners = ev.filter((e) => e.type === "content-spinner");
    const fbIn = ev.find((e) => e.type === "page-fallback");
    const fbOut = fbIn ? ev.find((e) => e.type === "page-fallback-gone" && e.t >= fbIn.t) : null;
    return {
      hop: name,
      chrome: unmount ? "REMOUNTED" : "kept",
      gap: unmount && mount ? mount.t - unmount.t : 0,
      loader: ev.some((e) => e.type === "route-loader"),
      fallback: !!fbIn,
      blankFallback: !!fbIn?.detail?.blank,
      /* null = appeared but never observed leaving within the hop window. */
      fallbackMs: fbIn && fbOut ? fbOut.t - fbIn.t : null,
      chunkError: ev.some((e) => e.type === "page-chunk-error") || actual.pageError,
      wrongRoute:
        actual.path !== expected.path ||
        actual.page !== expected.page ||
        actual.vertical !== expected.vertical,
      expected,
      actual,
      spinners: spinners.length,
      spinnerClass: spinners[0]?.detail ?? null,
      reloadedBefore,
    };
  });

  console.log(`\n########## ${label} ##########`);
  for (const r of rows) {
    /* Notes are informational only — see the gate below. */
    const notes = [
      r.fallback
        ? `page fallback ${r.fallbackMs === null ? "— never cleared" : `${r.fallbackMs.toFixed(1)}ms`}`
        : null,
      r.spinners ? `content spinner ×${r.spinners}${r.spinnerClass ? ` (${r.spinnerClass})` : ""}` : null,
      r.blankFallback ? "fallback had no accessible message" : null,
      r.chunkError ? "chunk error" : null,
      r.wrongRoute
        ? `wrong surface ${r.actual.path} ${r.actual.vertical ?? "?"}/${r.actual.page ?? "?"}`
        : null,
      r.reloadedBefore ? "vite full-reload before this hop" : null,
    ].filter(Boolean);
    console.log(
      `  ${r.hop.padEnd(26)} chrome: ${r.chrome.padEnd(10)} blank ${String(r.gap.toFixed(1)).padStart(7)}ms   loader: ${r.loader ? "YES — full-screen flash" : "no"}${notes.length ? `   [${notes.join("; ")}]` : ""}`,
    );
  }
  const remounts = rows.filter((r) => r.chrome === "REMOUNTED").length;
  const loaders = rows.filter((r) => r.loader).length;
  const fallbacks = rows.filter((r) => r.fallback).length;
  const spinners = rows.filter((r) => r.spinners > 0).length;
  const blanks = rows.map((r) => r.fallbackMs).filter((ms) => ms !== null);
  const worstBlank = blanks.length ? Math.max(...blanks) : 0;
  const stuck = rows.filter((r) => r.fallback && r.fallbackMs === null).length;
  const slow = rows.filter((r) => r.fallbackMs !== null && r.fallbackMs > MAX_FALLBACK_MS).length;
  const blankFallbacks = rows.filter((r) => r.blankFallback).length;
  const chunkErrors = rows.filter((r) => r.chunkError).length;
  const wrongRoutes = rows.filter((r) => r.wrongRoute).length;
  console.log(`  → ${remounts}/${rows.length} hops remounted the chrome, ${loaders} showed the route loader`);
  console.log(
    `    ${fallbacks} used the page fallback (worst ${worstBlank.toFixed(1)}ms` +
      `${stuck ? `, ${stuck} never cleared` : ""}${slow ? `, ${slow} exceeded ${MAX_FALLBACK_MS}ms` : ""}` +
      `${blankFallbacks ? `, ${blankFallbacks} blank` : ""}), ${spinners} rendered a content spinner`,
  );
  return {
    remounts,
    loaders,
    fallbacks,
    spinners,
    worstBlank,
    stuck,
    slow,
    blankFallbacks,
    chunkErrors,
    wrongRoutes,
    total: rows.length,
  };
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const totals = [];
try {
  for (const [label, opts] of DEVICE_CLASSES) {
    const { hops, errors } = await probe(browser, label, opts);
    const total = report(label, hops);
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
    `${label}: ${t.remounts} chrome remounts, ${t.loaders} route-loader flashes (of ${t.total} hops)` +
      `  —  ${t.fallbacks} page fallbacks (worst ${t.worstBlank.toFixed(1)}ms` +
      `${t.stuck ? `, ${t.stuck} never cleared` : ""}${t.slow ? `, ${t.slow} slow` : ""}` +
      `${t.blankFallbacks ? `, ${t.blankFallbacks} blank` : ""}), ${t.wrongRoutes} wrong surfaces` +
      `, ${t.chunkErrors} chunk errors, ${t.errors} browser/HTTP errors, ${t.spinners} content spinners`,
  );
  bad +=
    t.remounts +
    t.loaders +
    t.stuck +
    t.slow +
    t.blankFallbacks +
    t.chunkErrors +
    t.wrongRoutes +
    t.errors;
}
if (WANT_SHOTS) console.log(`mid-transition screenshots → ${OUT}`);
process.exitCode = bad === 0 ? 0 : 1;
