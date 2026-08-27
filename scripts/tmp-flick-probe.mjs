import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const { context, page } = await newRetailPage(browser, "flick", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
await page.locator(".tp-viewport").waitFor({ state: "visible" });
await page.waitForTimeout(5500);
await page.evaluate(() => {
  window.__ev = [];
  for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"])
    window.addEventListener(t, (e) => window.__ev.push([t, Math.round(performance.now()), Math.round(e.clientY)]), true);
});
const hb = await page.evaluate(() => { const r = document.querySelector('[data-demo-id="dock-handle"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
// exactly the gate's clause-3 flick: 20px, ms:16, steps:2
await page.mouse.move(hb.x, hb.y); await page.mouse.down();
for (let i = 1; i <= 2; i++) { await page.mouse.move(hb.x, hb.y - (20 * i) / 2); }
await page.mouse.up(); await page.waitForTimeout(700);
const ev = await page.evaluate(() => window.__ev);
const down = ev.find((e) => e[0] === "pointerdown");
const up = ev.find((e) => e[0] === "pointerup");
console.log("events:", JSON.stringify(ev));
if (down && up) {
  const elapsed = up[1] - down[1], dy = down[2] - up[2];
  console.log(`dy=${dy}px elapsed=${elapsed}ms  velocity=${(dy / elapsed).toFixed(3)}px/ms  (threshold 0.4)`);
}
console.log("expanded:", await page.evaluate(() => document.querySelector('[data-demo-id="dock-handle"]').getAttribute("aria-expanded")));
await context.close(); await browser.close();
