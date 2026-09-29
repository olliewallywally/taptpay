/* Before/after filmstrip for the motion toning pass (Step 0).
 *
 * Screenshotting an entrance animation in real time is a race — you get whatever
 * frame the compositor happened to be on. Instead this freezes every animation
 * as it appears and scrubs `currentTime` to fixed offsets, so each frame is
 * exact and the "old" and "new" strips are sampled at identical moments.
 *
 * "old" is produced by injecting the pre-2026-08-15 keyframes and curve as an
 * override, so both strips come from the same page, same data, same run — the
 * only variable is the motion itself.
 *
 * Note this compares Step 0 only: the *shape* of each entrance (amplitude,
 * overshoot, reversals) plus the desktop stagger step. The mobile per-element
 * `--pt-d` delays are still the old values in both strips; re-tiering those is
 * Step 1.
 *
 * Usage: dev server on :5000, single instance.
 *   node scripts/desktop-shots/probe-motion-filmstrip.mjs
 * Writes /tmp/taptpay-motion-filmstrip/filmstrip.html + frames.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, MERCHANT_ID } from "./retail-fixtures.mjs";

const OUT = "/tmp/taptpay-motion-filmstrip";

/* Sampled offsets in ms. Chosen to straddle both regimes: the new system is
   fully settled by ~500ms, the old one is still moving past 1100ms. */
const FRAMES = [0, 120, 250, 420, 650, 1100];

const VIEWPORTS = [
  ["mobile", { width: 390, height: 844 }, { hasTouch: true, isMobile: true }],
  ["tablet", { width: 1194, height: 834 }, { hasTouch: true, isMobile: false }],
  ["desktop", { width: 1440, height: 900 }, {}],
];

/* The pre-toning motion, restored verbatim as an override. `--dt-d` is scaled
   back up (112ms x 1.857 = 208ms) and the nth-child map re-extended to ten
   steps, so the old cascade is reproduced in full rather than approximated. */
const LEGACY_CSS = `
@keyframes __oldBounce {
  0%   { opacity: 0; transform: translateY(30px) scale(0.86); }
  55%  { opacity: 1; transform: translateY(-7px) scale(1.045); }
  74%  { transform: translateY(3px) scale(0.983); }
  88%  { transform: translateY(-1.5px) scale(1.007); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.pt-bounce { animation: __oldBounce 0.52s cubic-bezier(0.34,1.56,0.64,1) both !important; }
@keyframes __oldSlideTop {
  from { opacity: 0; transform: translateY(-18px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.pt-slide-top { animation: __oldSlideTop 0.30s cubic-bezier(0.22,1,0.36,1) both !important; }
@keyframes __oldDesktop {
  0%   { opacity: 0; transform: translateY(26px) scale(0.88); }
  55%  { opacity: 1; transform: translateY(-6px) scale(1.035); }
  74%  { transform: translateY(2.5px) scale(0.987); }
  88%  { transform: translateY(-1.2px) scale(1.005); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.dt-rise, .dt-cascade > * {
  animation: __oldDesktop 0.54s cubic-bezier(0.34,1.56,0.64,1) both !important;
  animation-delay: calc(var(--dt-i, 0) * 52ms + var(--dt-d, 0ms) * 1.857) !important;
}
.dt-cascade > *:nth-child(7)     { --dt-i: 6; }
.dt-cascade > *:nth-child(8)     { --dt-i: 7; }
.dt-cascade > *:nth-child(9)     { --dt-i: 8; }
.dt-cascade > *:nth-child(n + 10){ --dt-i: 9; }
`;

/* ── fixtures ─────────────────────────────────────────────────────────────── */
const D = 24 * 3_600_000;
const at = (d) => new Date(Date.now() - d * D).toISOString();
const ahead = (d) => new Date(Date.now() + d * D).toISOString();
const TENANTS = ["Josh Smith", "Ruby Nolan", "Ana Patel", "Tom Reid", "Mia Chen", "Leo Ward"].map(
  (n, i) => {
    const [firstName, lastName] = n.split(" ");
    return {
      id: `t${i + 1}`,
      merchantId: MERCHANT_ID,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}@example.invalid`,
      phone: `022111111${i}`,
      propertyAddress: `${12 + i * 4} Kauri Road`,
      preferredChannel: i % 2 ? "email" : "sms",
      status: "active",
      createdAt: at(400 - i * 20),
      updatedAt: at(2),
    };
  },
);
const INVOICES = TENANTS.map((t, i) => ({
  id: `i${i + 1}`,
  tenantProfileId: t.id,
  amountCents: 65000 + i * 5000,
  status: i % 3 === 0 ? "paid" : "sent",
  dueAt: ahead(2 + i),
  createdAt: at(1),
  kind: "rent",
}));

const json = (r, body, status = 200) =>
  r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function installMocks(page) {
  await page.addInitScript(({ merchantId }) => {
    const payload = window.btoa(
      JSON.stringify({ userId: 1, email: "shot@example.invalid", merchantId, role: "owner" }),
    );
    localStorage.setItem("authToken", `shot.${payload}.dummy`);
    localStorage.setItem("merchantId", String(merchantId));
    localStorage.setItem("taptMode", "property");
  }, { merchantId: MERCHANT_ID });

  /* Freeze every animation the moment it appears, so scrubbing is deterministic
     and nothing has advanced before the first frame is taken. */
  await page.addInitScript(() => {
    window.__frozen = [];
    const poll = () => {
      for (const a of document.getAnimations()) {
        if (!window.__frozen.includes(a)) {
          window.__frozen.push(a);
          try { a.pause(); a.currentTime = 0; } catch { /* not seekable */ }
        }
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    window.__resetFrozen = () => { window.__frozen = []; };
    window.__scrub = (t) => {
      for (const a of window.__frozen) {
        try { a.currentTime = t; } catch { /* not seekable */ }
      }
    };
  });

  await page.route("**/api/auth/me", (r) =>
    json(r, { user: { id: 1, email: "shot@example.invalid", merchantId: MERCHANT_ID, role: "owner", onboardingCompleted: true } }));
  await page.route("**/api/tutorial/state", (r) =>
    json(r, { generation: 1, autoEnabled: false, pageCount: 20, progress: {} }));
  await page.route("**/api/tutorial/**", (r) => json(r, {}));
  await page.route("**/api/property/tenants", (r) => json(r, TENANTS));
  await page.route("**/api/property/invoices", (r) => json(r, INVOICES));
  await page.route("**/api/property/schedules", (r) => json(r, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}/**`, (r) => json(r, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (r) =>
    json(r, { id: MERCHANT_ID, businessName: "Wallace Property", status: "active" }));
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (r) =>
    json(r, { id: MERCHANT_ID, businessName: "Wallace Property", status: "active" }));
}

/* Remount the directory route so its entrance replays, then sample each offset. */
async function capture(page, label) {
  await page.evaluate(() => {
    history.pushState({}, "", "/property");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__resetFrozen());
  await page.evaluate(() => {
    history.pushState({}, "", "/property/tenants");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(700); // let the route mount; everything is frozen at 0

  const frames = [];
  for (const t of FRAMES) {
    await page.evaluate((ms) => window.__scrub(ms), t);
    const buf = await page.screenshot({ type: "jpeg", quality: 66 });
    frames.push(buf.toString("base64"));
    console.log(`    ${label} @ ${String(t).padStart(4)}ms  ${(buf.length / 1024).toFixed(0)}KB`);
  }
  return frames;
}

/* ── run ──────────────────────────────────────────────────────────────────── */
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const strips = [];

try {
  for (const [name, viewport, extra] of VIEWPORTS) {
    console.log(`\n── ${name} ${viewport.width}x${viewport.height} ──`);
    const context = await browser.newContext({
      viewport, ...extra, deviceScaleFactor: 1, serviceWorkers: "block", timezoneId: "Pacific/Auckland",
    });
    const page = await context.newPage();
    await installMocks(page);
    await page.goto(`${BASE_URL}/property/tenants`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500); // let lazy chunks land before the first replay

    const after = await capture(page, "new");
    await page.addStyleTag({ content: LEGACY_CSS });
    const before = await capture(page, "old");

    strips.push({ name, viewport, before, after });
    await context.close();
  }
} finally {
  await browser.close();
}

const cell = (b64, w) =>
  `<img src="data:image/jpeg;base64,${b64}" style="width:${w}px" alt="">`;

const html = `<title>Motion Toning — Before / After</title>
<style>
  :root { --bg:#f7f7f9; --fg:#101322; --mute:#5d6379; --line:#e2e4ec; --old:#c4462f; --new:#1b7f5a; }
  :root:not([data-theme="light"]) { color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#101322; --fg:#eef0f6; --mute:#9aa1b8; --line:#252a3d; --old:#ff8a6e; --new:#57d6a4; } }
  :root[data-theme="dark"] { --bg:#101322; --fg:#eef0f6; --mute:#9aa1b8; --line:#252a3d; --old:#ff8a6e; --new:#57d6a4; }
  body { background:var(--bg); color:var(--fg); font:15px/1.55 ui-sans-serif,system-ui,sans-serif; margin:0; padding:32px 24px 64px; }
  .wrap { max-width:1180px; margin:0 auto; }
  h1 { font-size:26px; letter-spacing:-.02em; margin:0 0 6px; }
  .sub { color:var(--mute); margin:0 0 34px; max-width:62ch; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.09em; color:var(--mute); margin:38px 0 4px; border-top:1px solid var(--line); padding-top:18px; }
  .row { overflow-x:auto; padding-bottom:6px; }
  .strip { display:flex; gap:10px; width:max-content; align-items:flex-start; }
  figure { margin:0; }
  figcaption { font:600 11px/1.4 ui-monospace,monospace; color:var(--mute); padding:5px 0 0; }
  img { display:block; border:1px solid var(--line); border-radius:7px; background:#fff; }
  .tag { display:inline-block; font:700 11px/1 ui-monospace,monospace; letter-spacing:.06em; padding:5px 9px; border-radius:5px; margin:14px 0 7px; }
  .tag.old { color:var(--old); border:1px solid currentColor; }
  .tag.new { color:var(--new); border:1px solid currentColor; }
  table { border-collapse:collapse; margin:10px 0 0; font-size:14px; }
  td,th { text-align:left; padding:6px 20px 6px 0; border-bottom:1px solid var(--line); }
  th { color:var(--mute); font-weight:600; }
</style>
<div class="wrap">
<h1>Motion toning — before / after</h1>
<p class="sub">Tenant Directory entrance, sampled at identical offsets by freezing every
animation and scrubbing <code>currentTime</code> — so both strips show the same moments,
not whichever frame the compositor happened to be on. Step 0 only: this changes the
<em>shape</em> of each entrance and the desktop stagger step. The mobile per-element
delays are still the old values in both strips; re-tiering those is Step 1.</p>

<table>
  <tr><th>Metric</th><th>Before</th><th>After</th></tr>
  <tr><td>Easing overshoot</td><td>9.8% (compounded per keyframe interval)</td><td>0% — accents only, at 2.5%</td></tr>
  <tr><td>Direction reversals per element</td><td>5</td><td>1</td></tr>
  <tr><td>Travel to move 0px</td><td>~41px</td><td>10px</td></tr>
  <tr><td>Scale range</td><td>0.86 → 1.063</td><td>none</td></tr>
  <tr><td>Desktop stagger step</td><td>52ms × 10</td><td>28ms × 6</td></tr>
  <tr><td>Longest measured tail</td><td>1216ms</td><td>504ms</td></tr>
</table>

${strips.map(({ name, viewport, before, after }) => {
  const w = Math.round(viewport.width * (viewport.width > 800 ? 0.30 : 0.62));
  return `<h2>${name} — ${viewport.width}×${viewport.height}</h2>
  <div class="tag old">BEFORE</div>
  <div class="row"><div class="strip">${before.map((b, i) => `<figure>${cell(b, w)}<figcaption>${FRAMES[i]}ms</figcaption></figure>`).join("")}</div></div>
  <div class="tag new">AFTER</div>
  <div class="row"><div class="strip">${after.map((b, i) => `<figure>${cell(b, w)}<figcaption>${FRAMES[i]}ms</figcaption></figure>`).join("")}</div></div>`;
}).join("\n")}
</div>`;

const out = join(OUT, "filmstrip.html");
await writeFile(out, html);
console.log(`\nwrote ${out}  (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
