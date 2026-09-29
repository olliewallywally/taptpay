import { chromium } from "playwright";
import { BASE_URL, CHROMIUM_PATH, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  const { context, page } = await newRetailPage(browser, `flow-${vp.width}`, { viewport: vp, hasTouch: true, isMobile: true });
  await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-viewport").waitFor({ state: "visible" });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "add item", exact: true }).click();
  await page.waitForTimeout(700);
  for (const d of ["1", "2", "3", "4"]) await page.getByRole("button", { name: d, exact: true }).click();
  await page.locator('.tp-layer:not(.leaving) button[aria-label="commit"]').click();
  await page.getByPlaceholder("item name").waitFor();
  await page.waitForTimeout(400);
  await page.getByPlaceholder("item name").fill("dock gate");
  await page.locator('.tp-layer:not(.leaving) button[aria-label="commit"]').click();
  await page.getByRole("button", { name: "send", exact: true }).waitFor();
  await page.waitForTimeout(800);
  console.log(JSON.stringify(await page.evaluate(() => {
    const dockH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dock-h")) || 0;
    const bandTop = window.innerHeight - dockH;
    const screen = document.querySelector(".tp-layer:not(.leaving) .tp-screen");
    const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    const desc = (el) => { const cs = getComputedStyle(el); return {
      cls: (el.className || el.tagName).toString().slice(0, 30), ...r(el),
      display: cs.display, flex: cs.flex, minH: cs.minHeight, height: cs.height,
      overflowY: cs.overflowY, padB: cs.paddingBottom, scrollH: el.scrollHeight, clientH: el.clientHeight };
    };
    return {
      vp: `${window.innerWidth}x${window.innerHeight}`, bandTop: Math.round(bandTop),
      screen: screen ? desc(screen) : null,
      children: screen ? [...screen.children].map(desc) : [],
      chrome: [...document.querySelectorAll(".tp-pfab.show, .tp-psubbar.show")].map((c) => {
        const b = c.getBoundingClientRect(); const cs = getComputedStyle(c);
        return { cls: (c.className||"").slice(0,26), top: Math.round(b.top), bottom: Math.round(b.bottom),
                 h: Math.round(b.height), position: cs.position, transform: cs.transform.slice(0,30) };
      }),
      hero: (() => { const h = document.querySelector(".tp-home-hero"); const b = h && h.getBoundingClientRect();
        return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom) } : null; })(),
      gridRows: screen && getComputedStyle(screen).gridTemplateRows,
      chromeGutter: screen && getComputedStyle(screen).getPropertyValue("--chrome-gutter"),
      stackMin: screen && getComputedStyle(screen).getPropertyValue("--stack-min"),
      heroPref: screen && getComputedStyle(screen).getPropertyValue("--hero-pref"),
      placement: screen ? [...screen.children].map((c) => ({
        cls: (c.className || c.tagName).toString().slice(0, 26),
        row: getComputedStyle(c).gridRowStart, pos: getComputedStyle(c).position,
        h: Math.round(c.getBoundingClientRect().height) })) : [],
      stack: (() => { const s = document.querySelector(".tp-home-stack"); return s ? desc(s) : null; })(),
      hdr: (() => { const h = document.querySelector(".tp-stack-hdr"); return h ? { ...desc(h), overlap: Math.round(h.getBoundingClientRect().bottom - bandTop) } : null; })(),
    };
  }), null, 1));
  await context.close();
}
await browser.close();
