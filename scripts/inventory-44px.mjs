#!/usr/bin/env node
/* Phase 4 of docs/PLAN-2026-08-17-mobile-responsive-ui.md §5.2 — the app-wide
 * inventory of every control RC-1 inflates, plus the public-route smoke.
 *
 * WHY IT IS APP-WIDE. RC-1 is `index.css:362-368`:
 *
 *     @media (max-width: 640px) {
 *       button, [role="button"], input[type="submit"], input[type="button"] {
 *         min-height: 44px; min-width: 44px;
 *       }
 *     }
 *
 * There is nothing terminal-shaped about that selector. It fires on every route
 * below 640px — `/login`, `/signup`, onboarding, the landing page, and
 * `/pay/:merchantId`, the customer-facing payment page, which is the one route
 * here that a merchant's customers see and that v1 under-flagged. Phase 5
 * removes the rule, so what it is currently holding up has to be known first.
 *
 * HOW THE INTENDED SIZE IS OBTAINED. It is measured, not inferred. `min-height`
 * beats `height`, so a control's authored size is not readable from its
 * computed style while the rule is live — the computed longhand reports the
 * used 44px. This script instead finds the rule in the CSSOM, blanks its
 * `min-height`/`min-width` (leaving `font-size: 16px` on the input rule alone —
 * §5.3 trap 3: it is what prevents the iOS focus zoom), forces a reflow and
 * re-measures the same element references. The delta is what RC-1 is doing.
 *
 * IT ALSO PRE-ANSWERS §5.3's FIRST TWO TRAPS, because both are cheaper to find
 * now than after the rule is gone:
 *
 *   trap 1 overlap  — two adjacent small controls whose 44px hit areas collide
 *                     once `.tap-target` grows them. Reported per route as the
 *                     pairs that would overlap, so phase 5 knows where to look.
 *   trap 2 clipping — an ancestor with `overflow: hidden` clips the pseudo
 *                     element's hit area and silently defeats it. Reported as
 *                     the clipping ancestor, by selector.
 *
 * Usage: dev server on :5000, single instance (see the dev-server memory note).
 *   node scripts/inventory-44px.mjs            write the JSON + print the summary
 *   node scripts/inventory-44px.mjs --verbose  also print every control
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
import { VERTICALS, newMobilePage } from "./mobile-fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "inventory-44px.json");

const argv = new Set(process.argv.slice(2));
const VERBOSE = argv.has("--verbose");

/* §4.1's reference phone. The inventory is a census, not a geometry gate — one
   viewport is the right resolution for it, and 390 is where the design is
   calibrated. Anything narrower changes how many controls wrap, not which ones
   the rule pins. */
const VIEWPORT = { width: 390, height: 844 };

/* `mode` boots the right vertical shell; `settle` is for routes whose first
   paint precedes the data they lay out around. */
const AUTHED_ROUTES = [
  { name: "retail terminal", path: "/terminal", vertical: "retail" },
  { name: "property terminal", path: "/property/terminal", vertical: "property" },
  { name: "trades terminal", path: "/trades/terminal", vertical: "trades" },
  { name: "dashboard", path: "/dashboard", vertical: "retail" },
  { name: "transactions", path: "/transactions", vertical: "retail" },
  { name: "stock", path: "/stock", vertical: "retail" },
  { name: "settings", path: "/settings", vertical: "retail" },
  { name: "onboarding", path: "/onboarding", vertical: "retail" },
];

/* The routes with no merchant behind them. These are the smoke half of §5.2:
   recorded before anything is touched, so phase 5 has something to regress
   against on the pages a merchant never sees but their customers do. */
const PUBLIC_ROUTES = [
  { name: "landing", path: "/" },
  { name: "login", path: "/login" },
  { name: "signup", path: "/signup" },
  { name: "customer payment", path: `/pay/${MERCHANT_ID}` },
];

/* ─────────────────────────────────────────────────────────────────────────
   The in-page census. Measure, blank RC-1, measure again.
   ───────────────────────────────────────────────────────────────────────── */
async function census(page) {
  return page.evaluate(() => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const classesOf = (el) =>
      String(el.className?.baseVal ?? el.className ?? "")
        .trim().split(/\s+/).filter(Boolean);

    const visible = (el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    /* Enough to find the control again by eye in the source, and stable across
       runs: tag, its own classes, its label, and a little of its text. */
    const identify = (el) => {
      const cls = classesOf(el).filter((c) => !/^(css-|sc-)/.test(c)).slice(0, 3);
      const label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 28);
      const type = el.getAttribute("type");
      return {
        tag: el.tagName.toLowerCase() + (type ? `[type=${type}]` : ""),
        classes: cls,
        label,
        text: label ? "" : text,
      };
    };

    /* The nearest ancestor that would clip a 44px hit area (§5.3 trap 2).
       `hidden`/`clip` is the trap: the hit area is cut off with no way to reach
       it. A scrollable ancestor (`auto`/`scroll`) also cuts the box, but the
       content can be scrolled into view, so it is a weaker finding and is
       reported separately rather than counted as a defeat. */
    const clipper = (el, hit) => {
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        const o = s.overflow + s.overflowX + s.overflowY;
        if (!/hidden|clip|auto|scroll/.test(o)) continue;
        const b = n.getBoundingClientRect();
        const clipped =
          hit.left < b.left - 0.5 || hit.top < b.top - 0.5 ||
          hit.right > b.right + 0.5 || hit.bottom > b.bottom + 0.5;
        if (!clipped) return null; // the first clipping ancestor contains it
        return {
          by: n.tagName.toLowerCase() + classesOf(n).slice(0, 2).map((c) => "." + c).join(""),
          overflow: s.overflow,
          scrollable: /auto|scroll/.test(o) && !/hidden|clip/.test(o),
        };
      }
      return null;
    };

    const SELECTOR =
      'button, [role="button"], input[type="submit"], input[type="button"], ' +
      'input[type="text"], input[type="email"], input[type="password"], input[type="number"], ' +
      "textarea, select";

    const els = [...document.querySelectorAll(SELECTOR)].filter(visible);

    /* ── pass 1: as shipped ─────────────────────────────────────────────── */
    const before = els.map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        w: r1(r.width), h: r1(r.height), x: r1(r.x), y: r1(r.y),
        minH: s.minHeight, minW: s.minWidth, fontSize: s.fontSize,
      };
    });

    /* ── blank RC-1 in the CSSOM ────────────────────────────────────────── */
    const touched = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; } /* cross-origin */
      for (const rule of rules) {
        if (rule.type !== CSSRule.MEDIA_RULE) continue;
        const condition = rule.conditionText ?? rule.media?.mediaText ?? "";
        if (!/max-width:\s*640px/.test(condition)) continue;
        for (const inner of rule.cssRules ?? []) {
          if (!inner.style) continue;
          if (inner.style.minHeight !== "44px" && inner.style.minWidth !== "44px") continue;
          touched.push({
            selector: inner.selectorText,
            minHeight: inner.style.minHeight,
            minWidth: inner.style.minWidth,
            /* §5.3 trap 3: this is the declaration that must survive phase 5. */
            keepsFontSize: inner.style.fontSize || null,
          });
          inner.style.removeProperty("min-height");
          inner.style.removeProperty("min-width");
        }
      }
    }
    void document.documentElement.offsetHeight; /* force reflow */

    /* ── pass 2: authored ───────────────────────────────────────────────── */
    const controls = els.map((el, i) => {
      const r = el.getBoundingClientRect();
      const b = before[i];
      const authored = { w: r1(r.width), h: r1(r.height) };
      /* The gate's `tapInflated` fingerprint — the box sits exactly at the
         rule's minimum — kept so the two numbers can be reconciled. It
         UNDER-counts: a control the rule widened to 44 can still be 50 tall
         because its own content pushed it there, and then neither dimension
         reads 44. What the inventory needs is the measured delta below. */
      const pinnedAt44 =
        (Math.abs(b.h - 44) < 0.51 && b.minH === "44px") ||
        (Math.abs(b.w - 44) < 0.51 && b.minW === "44px");
      const inflated = b.w - authored.w > 0.5 || b.h - authored.h > 0.5;

      /* The hit area `.tap-target` would give it: centred, at least 44. */
      const hw = Math.max(authored.w, 44);
      const hh = Math.max(authored.h, 44);
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = { left: cx - hw / 2, top: cy - hh / 2, right: cx + hw / 2, bottom: cy + hh / 2 };

      return {
        ...identify(el),
        shipped: { w: b.w, h: b.h },
        authored,
        inflatedBy: { w: r1(b.w - authored.w), h: r1(b.h - authored.h) },
        inflated,
        pinnedAt44,
        /* The only controls phase 5 has to give a hit area back to. */
        needsTapTarget: authored.w < 44 || authored.h < 44,
        hit,
        clippedBy: clipper(el, hit),
      };
    });

    /* ── §5.3 trap 1: whose hit areas would collide ─────────────────────── */
    const overlaps = [];
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i].hit;
        const b = controls[j].hit;
        const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ow <= 0.5 || oh <= 0.5) continue;
        /* Only a pair that does NOT already overlap as designed is new damage. */
        overlaps.push({
          a: controls[i].label || controls[i].text || controls[i].tag,
          b: controls[j].label || controls[j].text || controls[j].tag,
          area: Math.round(ow * oh),
        });
      }
    }

    for (const c of controls) delete c.hit;

    return {
      rc1Rules: touched,
      controls,
      overlaps: overlaps.sort((p, q) => q.area - p.area).slice(0, 12),
      counts: {
        total: controls.length,
        inflated: controls.filter((c) => c.inflated).length,
        pinnedAt44: controls.filter((c) => c.pinnedAt44).length,
        needsTapTarget: controls.filter((c) => c.needsTapTarget).length,
        clipped: controls.filter((c) => c.clippedBy && !c.clippedBy.scrollable).length,
        clippedScrollable: controls.filter((c) => c.clippedBy?.scrollable).length,
      },
    };
  });
}

async function visit(page, path, label) {
  const started = Date.now();
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  /* Not networkidle: the dev server holds an HMR socket open, so it never
     fires. The app paints, then measures itself — 1.4s is what the geometry
     gate settled on for the same reason. */
  await page.waitForTimeout(1400);
  const rendered = await page.evaluate(() => ({
    title: document.title,
    bodyText: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().length,
    hasRoot: !!document.querySelector("#root")?.firstElementChild,
  }));
  return { label, path, ms: Date.now() - started, ...rendered };
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const report = { viewport: VIEWPORT, capturedAt: new Date().toISOString(), routes: {}, smoke: [] };

try {
  for (const route of AUTHED_ROUTES) {
    process.stdout.write(`  measuring ${route.name}\n`);
    const { context, page, errors } = await newMobilePage(browser, route.vertical, VIEWPORT);
    try {
      const smoke = await visit(page, route.path, route.name);
      report.smoke.push({ ...smoke, authed: true, errors: errors.length });
      report.routes[route.name] = await census(page);
    } finally {
      await context.close();
    }
  }

  for (const route of PUBLIC_ROUTES) {
    process.stdout.write(`  measuring ${route.name} (public)\n`);
    /* Public means public: `newRetailPage` installs an auth token, so the
       smoke half of §5.2 would be measuring the wrong page. A bare context
       with the merchant endpoints mocked is what a customer actually gets. */
    const context = await browser.newContext({
      viewport: VIEWPORT, hasTouch: true, isMobile: true,
      deviceScaleFactor: 1, serviceWorkers: "block", timezoneId: "Pacific/Auckland",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`${route.name}: ${e.message}`));
    const fulfil = (r, body) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    await page.route(`**/api/merchants/${MERCHANT_ID}**`, (r) =>
      fulfil(r, {
        id: MERCHANT_ID, businessName: "Shot Retail Co", tradingName: "Shot Retail Co",
        currency: "NZD", isActive: true, acceptsCard: true,
      }));
    /* Registered second, so it wins over the pattern above — Playwright matches
       most-recently-registered first. `/pay/:merchantId` polls this every 3s and
       throws on a non-OK, which is what put the page in its "try again" error
       state on the first run of this script; the merchant object came back as
       the transaction and the render never reached the real screen.
       `null` is the state that matters here: a customer standing at the counter
       before the merchant has charged anything. A PENDING transaction cannot be
       inventoried — the page redirects to the checkout as soon as it sees one. */
    await page.route(`**/api/merchants/${MERCHANT_ID}/active-transaction**`, (r) => fulfil(r, null));
    try {
      const smoke = await visit(page, route.path, route.name);
      report.smoke.push({ ...smoke, authed: false, errors: errors.length });
      report.routes[route.name] = await census(page);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

/* ── summary ───────────────────────────────────────────────────────────── */
const rows = Object.entries(report.routes);
const sum = (key) => rows.reduce((n, [, r]) => n + r.counts[key], 0);

console.log(`\n${rows.length} routes at ${VIEWPORT.width}x${VIEWPORT.height}\n`);
console.log("  route                 controls  inflated  needs .tap-target  clipped  (scrollable)");
for (const [name, r] of rows) {
  console.log(
    `  ${name.padEnd(20)}  ${String(r.counts.total).padStart(8)}  ${String(r.counts.inflated).padStart(8)}` +
    `  ${String(r.counts.needsTapTarget).padStart(17)}  ${String(r.counts.clipped).padStart(7)}` +
    `  ${String(r.counts.clippedScrollable).padStart(12)}`,
  );
}
console.log(
  `\n  totals: ${sum("total")} controls, ${sum("inflated")} inflated by RC-1 ` +
  `(${sum("pinnedAt44")} of them sitting exactly at 44), ` +
  `${sum("needsTapTarget")} need a hit area back, ${sum("clipped")} would be clipped`,
);

const smokeFailures = report.smoke.filter((s) => !s.hasRoot || s.bodyText < 40);
console.log(`\n  public-route smoke:`);
for (const s of report.smoke.filter((x) => !x.authed)) {
  console.log(`    ${s.hasRoot && s.bodyText >= 40 ? "ok  " : "FAIL"} ${s.path.padEnd(12)} ${s.bodyText} chars, ${s.ms}ms`);
}

if (VERBOSE) {
  for (const [name, r] of rows) {
    console.log(`\n== ${name}`);
    for (const c of r.controls.filter((x) => x.inflated)) {
      console.log(
        `   ${String(c.shipped.w).padStart(6)}x${String(c.shipped.h).padEnd(5)} → ` +
        `${String(c.authored.w).padStart(6)}x${String(c.authored.h).padEnd(5)} ` +
        `${c.needsTapTarget ? "tap-target" : "          "} ${c.tag}${c.classes.map((x) => "." + x).join("")} ${c.label || c.text}`,
      );
    }
  }
}

console.log(`\n  written to ${OUT.slice(OUT.lastIndexOf("/scripts/") + 1)}`);
if (smokeFailures.length) {
  console.log(`\n  ${smokeFailures.length} route(s) did not render — see the JSON`);
  process.exit(1);
}
