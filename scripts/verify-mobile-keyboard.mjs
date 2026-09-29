#!/usr/bin/env node
/* Phase K of docs/PLAN-2026-08-17-mobile-responsive-ui.md — the gate for
 * amendment A1 §4.1 (the keyboard), §4.3 (the font weights), §4.4 (the two
 * blanket overrides) and §4.5 (the viewport meta).
 *
 * §K5 (the fonts) is here rather than in verify-mobile-responsive.mjs because
 * it is a per-ROUTE question, not a per-viewport one, and this gate already
 * walks all twelve routes in a real engine. It is MD6's hard half, and phase 3
 * (the goldens) depends on it: a golden captured against a synthesised face is
 * not a baseline.
 *
 * WHY A SEPARATE GATE. verify-mobile-responsive.mjs measures the three
 * terminal HOME screens against a baseline. Every one of the 25 fields lives
 * two or three screens deeper than that, and the defect this phase fixes only
 * appears while a keyboard is up — a state no headless browser enters. So this
 * gate drives each vertical down to its deepest field screen and asserts the
 * layout against a keyboard it raises itself.
 *
 * THE SIMULATION, STATED PLAINLY. Headless Chromium has no software keyboard,
 * and Playwright cannot raise one. What the gate does instead is publish the
 * exact contract `use-keyboard-inset.ts` publishes on WebKit — `--kb-h` plus
 * `data-kb-open` on the document element — and then measure the layout that
 * results. That splits the fix in two and tests both halves where each can
 * actually be tested:
 *
 *   the measurement   keyboardInset()/opensSoftwareKeyboard(), unit-tested
 *                     against both engines' behaviour in
 *                     client/src/__tests__/keyboard-inset-contract.test.tsx;
 *   the layout        here, in a real engine, at real viewport sizes.
 *
 * A keyboard height per device rather than one number: the iPhone SE's
 * portrait keyboard is ~260px with its accessory bar, the iPhone 14's ~336px,
 * and the SE is where the vertical budget was already thin (plan §4.3).
 *
 * Usage: dev server on :5000, single instance (see the dev-server memory note).
 *   node scripts/verify-mobile-keyboard.mjs           run every section
 *   node scripts/verify-mobile-keyboard.mjs --verbose print every field
 *   KB_GATE_ONLY=K1 node scripts/verify-mobile-keyboard.mjs   one section
 */
import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
import { newMobilePage } from "./mobile-fixtures.mjs";

const argv = new Set(process.argv.slice(2));
const VERBOSE = argv.has("--verbose");
const ONLY = process.env.KB_GATE_ONLY ?? null;
const runs = (section) => !ONLY || ONLY === section;

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

/* iOS zooms a focused field whose computed size is under this and offers no
   way back. 16px is the threshold, not a preference. */
const FIELD_FLOOR_PX = 16;

/* Text entry only — a checkbox has no keyboard and a range has no type. */
const FIELD_SELECTOR =
  "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox])" +
  ":not([type=radio]):not([type=range]):not([type=file]):not([type=color]):not([type=hidden]), textarea, select";

const REFERENCE = { width: 390, height: 844 };

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

const PUBLIC_ROUTES = [
  { name: "landing", path: "/" },
  { name: "login", path: "/login" },
  { name: "signup", path: "/signup" },
  { name: "customer payment", path: `/pay/${MERCHANT_ID}` },
];

/* Portrait keyboard heights including the accessory bar, per device. */
const KEYBOARD = { "320x568": 260, "390x844": 336 };
const PHONES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
];

const round = (n) => Math.round(n * 10) / 10;

/* ─────────────────────────────────────────────────────────────────────────
   §K1/§K2 — the field floor and the overflow the universal selector claimed
   ───────────────────────────────────────────────────────────────────────── */
async function auditRoute(page, label) {
  const result = await page.evaluate((selector) => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const visible = (el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const fields = [...document.querySelectorAll(selector)].filter(visible).map((el) => ({
      tag: el.tagName.toLowerCase() + (el.getAttribute("type") ? `[type=${el.getAttribute("type")}]` : ""),
      id: el.getAttribute("data-demo-id") ?? el.getAttribute("name") ?? el.getAttribute("placeholder") ?? "",
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      readOnly: el.readOnly === true || el.disabled === true,
    }));
    const doc = document.documentElement;
    return {
      fields,
      overflow: r1(doc.scrollWidth - doc.clientWidth),
      bodyOverflow: r1(document.body.scrollWidth - doc.clientWidth),
      meta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
    };
  }, FIELD_SELECTOR);

  for (const field of result.fields) {
    /* A read-only field never raises a keyboard, so it cannot trigger the
       focus zoom — its type size is a design question, not this gate's. */
    if (field.readOnly) continue;
    if (field.fontSize < FIELD_FLOOR_PX - 0.01) {
      fail(
        `${label}: ${field.tag} ${field.id ? `"${field.id}" ` : ""}renders at ${field.fontSize}px — ` +
        `under the ${FIELD_FLOOR_PX}px iOS focus-zoom floor (§K1). Author it as ` +
        `max(<its size>, var(--field-floor, 0px)), or text-base md:text-sm.`,
      );
    }
  }
  /* 1px of slack: a sub-pixel layout legitimately lands a border a fraction
     over, and scoring that makes the counter noise rather than signal. */
  if (result.overflow > 1) {
    fail(
      `${label}: the document scrolls ${result.overflow}px horizontally (§K2). ` +
      `\`* { max-width: 100vw }\` used to hide this; \`body { overflow-x: clip }\` no longer does.`,
    );
  }
  return result;
}

/* ─────────────────────────────────────────────────────────────────────────
   §K5 — every weight the page draws has a real face behind it (A1 §4.3)
   ─────────────────────────────────────────────────────────────────────────

   `document.fonts.check("900 16px Outfit")` is the obvious instrument and it
   is the WRONG one: CSS font matching answers a request for 900 with the
   closest face it has, so with 100–700 loaded that call returns true and the
   text is faux-bolded anyway. That is exactly how the defect stayed invisible.
   So this walks the face set itself and asks whether any face COVERS the
   weight — a variable face reports its range as `100 900`, a static one
   reports a single number. */
async function auditFonts(page, label) {
  const result = await page.evaluate(async () => {
    await document.fonts.ready;

    const faces = [...document.fonts].map((face) => ({
      family: face.family.replace(/["']/g, "").trim(),
      weight: face.weight,
    }));
    const families = new Set(faces.map((f) => f.family));

    const covers = (family, weight) =>
      faces.some((face) => {
        if (face.family !== family) return false;
        const bounds = face.weight.trim().split(/\s+/).map(Number);
        if (bounds.some(Number.isNaN)) return false;
        const [lo, hi = lo] = bounds;
        return weight >= lo && weight <= hi;
      });

    /* The family the element actually renders in: the first entry of its stack
       that we ship a face for. Anything past that is a system fallback, whose
       weights are the OS's problem, not ours. */
    const webFamily = (stack) => {
      for (const raw of stack.split(",")) {
        const name = raw.replace(/["']/g, "").trim();
        if (families.has(name)) return name;
      }
      return null;
    };

    const gaps = new Map();
    let drawn = 0;
    for (const el of document.querySelectorAll("body *")) {
      /* Only elements that draw their own text: an ancestor inherits the
         weight but the glyphs are rendered by the leaf. */
      const draws = [...el.childNodes].some(
        (node) => node.nodeType === 3 && node.textContent.trim() !== "",
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
          .toString().trim().slice(0, 48);
      }
      gaps.set(key, entry);
    }
    return { gaps: [...gaps.values()], drawn, faces: faces.length, families: [...families] };
  });

  for (const gap of result.gaps) {
    fail(
      `${label}: ${gap.count} element(s) draw ${gap.family} at weight ${gap.weight}, ` +
      `which no loaded face covers — the browser synthesises it (§K5). ` +
      `First: "${gap.sample}". Request the variable range \`wght@100..900\`.`,
    );
  }
  return result;
}

async function sectionFields(browser) {
  const rows = [];
  for (const route of AUTHED_ROUTES) {
    const { context, page } = await newMobilePage(browser, route.vertical, REFERENCE);
    try {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1400);
      const audit = await auditRoute(page, route.name);
      if (runs("K5")) audit.fonts = await auditFonts(page, route.name);
      rows.push([route.name, audit]);
    } finally {
      await context.close();
    }
  }

  for (const route of PUBLIC_ROUTES) {
    /* Public means public: newRetailPage installs an auth token, so reusing it
       would measure the wrong page (inventory-44px.mjs §5.2 learned this). */
    const context = await browser.newContext({
      viewport: REFERENCE, hasTouch: true, isMobile: true,
      deviceScaleFactor: 1, serviceWorkers: "block", timezoneId: "Pacific/Auckland",
    });
    const page = await context.newPage();
    const fulfil = (r, body) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    await page.route(`**/api/merchants/${MERCHANT_ID}**`, (r) =>
      fulfil(r, {
        id: MERCHANT_ID, businessName: "Shot Retail Co", tradingName: "Shot Retail Co",
        currency: "NZD", isActive: true, acceptsCard: true,
      }));
    await page.route(`**/api/merchants/${MERCHANT_ID}/active-transaction**`, (r) => fulfil(r, null));
    try {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1400);
      const audit = await auditRoute(page, route.name);
      if (runs("K5")) audit.fonts = await auditFonts(page, route.name);
      rows.push([route.name, audit]);
    } finally {
      await context.close();
    }
  }
  return rows;
}

/* ─────────────────────────────────────────────────────────────────────────
   §K3 — a field screen with the keyboard up
   ───────────────────────────────────────────────────────────────────────── */

/* Shrinks the VISUAL viewport and leaves the layout viewport alone, which is
   what WebKit does when a keyboard opens — and then lets the shipping hook
   read it and publish --kb-h itself. Writing the token directly was the first
   attempt and it measured nothing: focusing a field fires `focusin`, the hook
   re-publishes from the real viewport, and the simulated inset is gone by the
   time anything is measured. Driving the input instead of the output means
   this gate exercises use-keyboard-inset.ts in a real engine rather than
   restating its contract. */
async function installKeyboardSimulator(page) {
  await page.addInitScript(() => {
    const real = window.visualViewport;
    const bus = new EventTarget();
    let covered = 0;
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        get height() { return (real ? real.height : window.innerHeight) - covered; },
        get offsetTop() { return real ? real.offsetTop : 0; },
        get width() { return real ? real.width : window.innerWidth; },
        addEventListener: (type, listener) => bus.addEventListener(type, listener),
        removeEventListener: (type, listener) => bus.removeEventListener(type, listener),
      },
    });
    Object.defineProperty(window, "__raiseKeyboard", {
      value: (px) => { covered = px; bus.dispatchEvent(new Event("resize")); },
    });
  });
}

async function raiseKeyboard(page, height) {
  await page.evaluate((h) => window.__raiseKeyboard(h), height);
  await page.waitForTimeout(320);
  const published = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--kb-h").trim());
  return published;
}

const walkers = {
  async retail(page) {
    await page.getByRole("button", { name: "add item", exact: true }).click();
    await page.waitForTimeout(650);
    for (const digit of ["1", "2", "3", "4"]) {
      await page.locator(`[data-demo-id="retail-key-${digit}"]`).click();
    }
    await page.locator('.tp-layer:not(.leaving) button[aria-label="commit"]').click();
    await page.getByPlaceholder("item name").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(450);
    return "details";
  },

  async property(page) {
    /* ?screen=bill lands on the tenant picker with `bill` pending, which is
       the only way to reach ChargeBill without replaying the subbar. */
    await page.locator('[data-demo-id^="property-tenant-"]').first().click();
    await page.waitForTimeout(650);
    for (const digit of ["6", "5", "0", "0", "0"]) {
      await page.locator(`[data-demo-id="property-key-${digit}"]`).first().click();
    }
    await page.locator('.tp-layer:not(.leaving) button[aria-label="confirm"]').click();
    await page.locator('[data-demo-id="property-bill-description"]').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(450);
    return "charge a bill";
  },

  async trades(page) {
    /* ?quick=1 opens the amount keypad in quick mode; committing it lands on
       QuickInvoice, the screen with four fields — the worst case in the app. */
    for (const digit of ["4", "8", "0", "0", "0"]) {
      await page.locator(`[data-demo-id="trades-key-${digit}"]`).first().click();
    }
    await page.locator('.tp-layer:not(.leaving) button[aria-label="confirm"]').click();
    await page.locator('[data-demo-id="trades-recipient-name"]').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(450);
    return "quick invoice";
  },
};

const ROUTES = {
  retail: "/terminal",
  property: "/property/terminal?screen=bill",
  trades: "/trades/terminal?quick=1",
};

/** Focuses each field in turn and reports where it ends up. */
async function measureFields(page, keyboardHeight) {
  return page.evaluate(
    async ({ selector, kb }) => {
      const r1 = (n) => Math.round(n * 10) / 10;
      const screen = document.querySelector(".tp-layer:not(.leaving) .tp-screen") ??
        document.querySelector(".tp-screen");
      const visible = (el) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const fields = [...(screen?.querySelectorAll(selector) ?? [])].filter(visible);
      const covered = window.innerHeight - kb;
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

      /* What the element is actually shown through. A field's own rect keeps
         its full height however hard an ancestor clips it, so "inside the
         viewport" is not the same as "visible" — an 18px scrollport reports a
         54px field sitting comfortably above the keyboard. */
      const clipRect = (el) => {
        let box = { top: -Infinity, bottom: Infinity };
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const s = getComputedStyle(n);
          if (!/hidden|clip|auto|scroll/.test(s.overflow + s.overflowY)) continue;
          const r = n.getBoundingClientRect();
          box = { top: Math.max(box.top, r.top), bottom: Math.min(box.bottom, r.bottom) };
        }
        return box;
      };

      const out = [];
      for (const field of fields) {
        field.focus({ preventScroll: false });
        field.scrollIntoView({ block: "nearest", inline: "nearest" });
        await frame();
        await frame();
        const r = field.getBoundingClientRect();
        const clip = clipRect(field);
        out.push({
          id: field.getAttribute("data-demo-id") ?? field.getAttribute("placeholder") ?? field.tagName.toLowerCase(),
          top: r1(r.top),
          bottom: r1(r.bottom),
          height: r1(r.height),
          clipTop: Number.isFinite(clip.top) ? r1(clip.top) : null,
          clipBottom: Number.isFinite(clip.bottom) ? r1(clip.bottom) : null,
          fontSize: r1(parseFloat(getComputedStyle(field).fontSize)),
        });
      }

      const panel = screen?.querySelector(".tp-panel-body");
      const panelRect = panel?.getBoundingClientRect();
      return {
        covered: r1(covered),
        innerHeight: window.innerHeight,
        fields: out,
        panelBody: panelRect ? { top: r1(panelRect.top), bottom: r1(panelRect.bottom), h: r1(panelRect.height) } : null,
        panelScrollable: panel ? panel.scrollHeight > panel.clientHeight + 1 : null,
        heroHeight: r1(screen?.querySelector(".tp-hero")?.getBoundingClientRect().height ?? 0),
        screenOverflow: screen ? r1(screen.scrollHeight - screen.clientHeight) : 0,
      };
    },
    { selector: FIELD_SELECTOR, kb: keyboardHeight },
  );
}

async function sectionKeyboard(browser) {
  const rows = [];
  for (const vertical of ["retail", "property", "trades"]) {
    for (const phone of PHONES) {
      const key = `${phone.width}x${phone.height}`;
      const label = `${vertical} @ ${key}`;
      const { context, page } = await newMobilePage(browser, vertical, phone);
      try {
        await installKeyboardSimulator(page);
        await page.goto(`${BASE_URL}${ROUTES[vertical]}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForSelector(".tp-viewport", { timeout: 20_000 });
        await page.waitForTimeout(1200);
        let screenName;
        try {
          screenName = await walkers[vertical](page);
        } catch (error) {
          fail(`${label}: could not reach a field screen — ${String(error).split("\n")[0]}`);
          continue;
        }

        const kb = KEYBOARD[key];
        const published = await raiseKeyboard(page, kb);
        if (published !== `${kb}px`) {
          fail(
            `${label}: the hook published --kb-h: ${published || "(nothing)"} for a ${kb}px keyboard (§K3). ` +
            `Nothing below this can be trusted — the layout is being measured against the wrong inset.`,
          );
        }
        const open = await measureFields(page, kb);
        await raiseKeyboard(page, 0);
        const closed = await measureFields(page, 0);

        if (!open.fields.length) {
          fail(`${label}: reached ${screenName} but found no field to focus (§K3)`);
          continue;
        }

        for (const field of open.fields) {
          if (field.bottom > open.covered + 0.5) {
            fail(
              `${label} ${screenName}: "${field.id}" sits at ${field.bottom}px with the keyboard ` +
              `covering everything below ${open.covered}px — ${round(field.bottom - open.covered)}px behind it (§K3).`,
            );
          }
          if (field.top < -0.5) {
            fail(`${label} ${screenName}: "${field.id}" is pushed off the top at ${field.top}px (§K3)`);
          }
          /* Being above the keyboard is not the same as being visible: the
             field has to fit inside whatever scrollport it is shown through,
             after that scrollport has scrolled to it. */
          if (field.clipTop !== null && field.clipBottom !== null) {
            const shown = Math.min(field.bottom, field.clipBottom) - Math.max(field.top, field.clipTop);
            if (shown + 0.5 < field.height) {
              fail(
                `${label} ${screenName}: "${field.id}" is ${field.height}px tall but only ${round(Math.max(0, shown))}px ` +
                `of it is inside its scrollport (${field.clipTop}–${field.clipBottom}px) with the keyboard up (§K3).`,
              );
            }
          }
        }

        /* The fix must not cost anything while no keyboard is up. */
        if (closed.heroHeight + 0.5 < open.heroHeight) {
          fail(`${label} ${screenName}: the hero is TALLER with the keyboard up (${open.heroHeight} vs ${closed.heroHeight}) (§K3)`);
        }
        rows.push([label, screenName, open, closed]);
      } finally {
        await context.close();
      }
    }
  }
  return rows;
}

/* ─────────────────────────────────────────────────────────────────────────
   §K4 — the served viewport meta
   ───────────────────────────────────────────────────────────────────────── */
function checkMeta(meta, label) {
  if (/user-scalable\s*=\s*no/.test(meta) || /maximum-scale/.test(meta)) {
    fail(`${label}: the viewport meta still blocks pinch zoom — WCAG 1.4.4 (§K4): ${meta}`);
  }
  if (!/interactive-widget=resizes-content/.test(meta)) {
    fail(`${label}: the viewport meta does not hand Chromium the keyboard (§K4): ${meta}`);
  }
}

/* ───────────────────────────────────────────────────────────────────────── */
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
let fieldRows = [];
let keyboardRows = [];
try {
  if (runs("K1") || runs("K2") || runs("K4") || runs("K5")) {
    process.stderr.write("  §K1/K2/K5 field floor, horizontal overflow, loaded faces\n");
    fieldRows = await sectionFields(browser);
    if (runs("K4")) checkMeta(fieldRows[0]?.[1]?.meta ?? "", "served document");
  }
  if (runs("K3")) {
    process.stderr.write("  §K3 field screens with the keyboard up\n");
    keyboardRows = await sectionKeyboard(browser);
  }
} finally {
  await browser.close();
}

/* ── report ─────────────────────────────────────────────────────────────── */
if (fieldRows.length) {
  const total = fieldRows.reduce((n, [, r]) => n + r.fields.length, 0);
  const smallest = fieldRows
    .flatMap(([, r]) => r.fields.filter((f) => !f.readOnly))
    .reduce((min, f) => Math.min(min, f.fontSize), Infinity);
  console.log(`\n${fieldRows.length} routes at ${REFERENCE.width}x${REFERENCE.height}, ${total} fields`);
  console.log(`  smallest editable field: ${Number.isFinite(smallest) ? `${smallest}px` : "—"} (floor ${FIELD_FLOOR_PX}px)`);
  console.log(`  max horizontal overflow: ${Math.max(...fieldRows.map(([, r]) => r.overflow))}px`);
  const fontRows = fieldRows.filter(([, r]) => r.fonts);
  if (fontRows.length) {
    const drawn = fontRows.reduce((n, [, r]) => n + r.fonts.drawn, 0);
    const synthesised = fontRows.reduce((n, [, r]) => n + r.fonts.gaps.reduce((m, g) => m + g.count, 0), 0);
    const families = [...new Set(fontRows.flatMap(([, r]) => r.fonts.families))].sort();
    console.log(`  ${drawn} text elements in ${families.join(", ") || "no web family"} — ${synthesised} on a synthesised weight`);
  }
  if (VERBOSE) {
    for (const [name, r] of fieldRows) {
      console.log(`    ${name.padEnd(18)} ${String(r.fields.length).padStart(2)} fields  overflow ${r.overflow}px` +
        (r.fonts ? `  ${r.fonts.faces} faces` : ""));
      for (const f of r.fields) console.log(`      ${String(f.fontSize).padStart(5)}px ${f.readOnly ? "ro " : "   "}${f.tag} ${f.id}`);
    }
  }
}

if (keyboardRows.length) {
  console.log(`\nkeyboard raised on ${keyboardRows.length} field screens`);
  console.log("  screen                              hero   panel body   fields   lowest / limit");
  for (const [label, screenName, open] of keyboardRows) {
    const lowest = Math.max(...open.fields.map((f) => f.bottom));
    console.log(
      `  ${`${label} ${screenName}`.padEnd(34)} ${String(open.heroHeight).padStart(5)}  ` +
      `${String(open.panelBody?.h ?? "—").padStart(10)}  ${String(open.fields.length).padStart(6)}   ` +
      `${String(round(lowest)).padStart(6)} / ${open.covered}`,
    );
  }
}

for (const note of notes) console.log(`\n  note: ${note}`);

if (failures.length) {
  console.log(`\n${failures.length} FINDING${failures.length === 1 ? "" : "S"}:`);
  for (const f of failures) console.log(`  · ${f}`);
  console.log("\nFAIL");
  process.exit(1);
}
console.log("\nno findings");
