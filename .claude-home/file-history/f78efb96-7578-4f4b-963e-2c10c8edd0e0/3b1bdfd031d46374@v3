/**
 * Gate for docs/PLAN-2026-08-17-terminal-panels-and-dock.md.
 *
 * Phase A only, so far:
 *   - §4.3 clause 8 — `--dock-h` lives on `document.documentElement` and reports
 *     the dock's real footprint (78 expanded, 64 collapsed, 0 absent).
 *   - §4.2 clause 2 — nothing interactive sits inside the dock's reserved band.
 *     This is the bug that survives on every device today (§1.1, 50–78px).
 *
 * Phases B/C/D/E/F add their own clauses here; §4.2's other clauses need the
 * companion plan's `.tp-feature` class contract, which has not landed.
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

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

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

  /* Collapsed: wait out the idle timer and re-read. */
  await page.waitForTimeout(COLLAPSE_AFTER_MS + 900);
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

      hits.push({
        label:
          el.getAttribute("aria-label") ||
          el.getAttribute("placeholder") ||
          (el.textContent || "").trim().slice(0, 28) ||
          el.tagName.toLowerCase(),
        overlap: Math.round(Math.min(r.bottom, window.innerHeight) - Math.max(r.top, bandTop)),
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

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });
  const report = {};

  try {
    for (const phone of PHONES) {
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
        report[key].dock = await checkDockContract(page, `dock @ ${key}`);
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
  console.log("\nTerminal dock gate passed (Phase A clauses).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
