/* One-off: replicate the gate's clause 1b loop and report the first divergence. */
import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const { context, page } = await newRetailPage(browser, "gesture-probe", {
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
});
const dockState = () => page.evaluate(() => ({
  expanded: document.querySelector('[data-demo-id="dock-handle"]')?.getAttribute("aria-expanded") === "true",
  bodyPE: getComputedStyle(document.querySelector('[data-demo-id="dock-terminal"]')).pointerEvents,
  navH: Math.round(document.querySelector('nav[data-demo-id="terminal-dock"] > div').getBoundingClientRect().height),
}));
async function drag(from, dy, { ms = 220, steps = 8 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x, from.y - (dy * i) / steps);
    await page.waitForTimeout(Math.round(ms / steps));
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
}
async function ensureCollapsed() {
  if (!(await dockState()).expanded) return true;
  const body = await page.evaluate(() => {
    const r = document.querySelector('[data-demo-id="dock-terminal"]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await drag(body, -44, { ms: 200 });
  return !(await dockState()).expanded;
}
await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
await page.locator(".tp-viewport").waitFor({ state: "visible" });
await page.waitForTimeout(5500);

const boxes = await page.evaluate(() => {
  const h = document.querySelector('[data-demo-id="dock-handle"]').getBoundingClientRect();
  const w = document.querySelector('nav[data-demo-id="terminal-dock"] > div').getBoundingClientRect();
  return { handle: { x: h.x, y: h.y, w: h.width, h: h.height }, wrap: { x: w.x, y: w.y, w: w.width, h: w.height } };
});
const points = [];
for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++)
  points.push({ x: boxes.wrap.x + (boxes.wrap.w * (col + 0.5)) / 6, y: boxes.wrap.y + (boxes.wrap.h * (row + 0.5)) / 5 });

for (let i = 0; i < points.length; i++) {
  const p = points[i];
  const inside = p.x >= boxes.handle.x && p.x <= boxes.handle.x + boxes.handle.w &&
                 p.y >= boxes.handle.y && p.y <= boxes.handle.y + boxes.handle.h;
  const before = await dockState();
  const ok = await ensureCollapsed();
  if (!ok) {
    console.log(`FAILED ensureCollapsed at i=${i} inside=${inside}`, JSON.stringify({ before, after: await dockState(), p }));
    /* instrumented retry: does the body handler run at all? */
    await page.evaluate(() => {
      window.__t = [];
      const b = document.querySelector('[data-demo-id="dock-terminal"]');
      for (const ev of ["pointerdown", "pointerup", "pointercancel"])
        b.addEventListener(ev, (e) => window.__t.push(`body:${ev}@${Math.round(e.clientY)}`), true);
      for (const ev of ["dragstart", "selectstart", "mousedown", "mousemove", "lostpointercapture"])
        window.addEventListener(ev, (e) => { if (ev !== "mousemove" || window.__t.length < 14) window.__t.push(`win:${ev}`); }, true);
      window.__samples = [];
    });
    const body = await page.evaluate(() => {
      const r = document.querySelector('[data-demo-id="dock-terminal"]').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    console.log("retry from", JSON.stringify(body), "elFromPoint:", await page.evaluate(({x,y}) => {
      const el = document.elementFromPoint(x, y);
      return el ? `${el.tagName}[${el.getAttribute("data-demo-id")}] pe=${getComputedStyle(el).pointerEvents}` : "none";
    }, body));
    await page.mouse.move(body.x, body.y);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) {
      await page.mouse.move(body.x, body.y + (44 * k) / 8);
      await page.waitForTimeout(25);
      await page.evaluate(() => window.__samples.push(
        Math.round(document.querySelector('[data-demo-id="dock-handle"] span').getBoundingClientRect().width)));
    }
    await page.mouse.up();
    await page.waitForTimeout(700);
    console.log("trace:", JSON.stringify(await page.evaluate(() => window.__t)));
    console.log("handle-span widths during drag (0=expanded,56=collapsed):", JSON.stringify(await page.evaluate(() => window.__samples)));
    console.log("after retry:", JSON.stringify(await dockState()));
    break;
  }
  await drag(p, 56);
  const st = await dockState();
  if (inside !== st.expanded) console.log(`i=${i} inside=${inside} -> expanded=${st.expanded} (mismatch)`, JSON.stringify(st));
}
console.log("loop done, final:", JSON.stringify(await dockState()));
await context.close(); await browser.close();
