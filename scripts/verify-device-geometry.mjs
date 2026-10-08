#!/usr/bin/env node
/* No app server, database, credentials or baseline. Planted defects must fail
 * individually; clean fixtures prevent hidden/scroll/inline false alarms.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { CHROMIUM_PATH } from "./desktop-shots/retail-fixtures.mjs";
import { measureGeometry } from "./device-geometry.mjs";

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
let passed = 0;
async function fixture(name, body, check, rowSelector = null) {
  await page.setContent(`<!doctype html><style>html,body{margin:0;padding:0}*{box-sizing:border-box}body{font:16px Arial}button{width:80px;height:36px}</style>${body}`);
  const geometry = await measureGeometry(page, rowSelector);
  check(geometry);
  passed++;
  console.log(`PASS ${name}`);
}
const clean = (g) => {
  assert.equal(g.docOverflow, 0);
  assert.equal(g.edgeCrosserCount, 0);
  assert.equal(g.clippedTextCount, 0);
  assert.equal(g.tapCentreMiss, 0);
};

try {
  await fixture("plain inline text and nested button hit are clean",
    '<span>Inline text</span><button><span>Pay</span></button>', (g) => {
      clean(g); assert.equal(g.tapCentresChecked, 1); assert.equal(g.terminalRows, null);
    });
  await fixture("document overflow and exposed right edge are faults",
    '<div class="wide" style="width:400px;height:20px;background:red"></div>', (g) => {
      assert.equal(g.docOverflow, 80); assert.ok(g.edgeCrossers.some((x) => x.label === "div.wide"));
    });
  await fixture("exposed negative left edge is a fault",
    '<div class="left" style="position:absolute;left:-20px;width:60px;height:20px;background:red"></div>',
    (g) => assert.ok(g.edgeCrossers.some((x) => x.label === "div.left")));
  await fixture("block text overflow is a fault",
    '<div class="text" style="width:40px;white-space:nowrap;overflow:hidden">Long unbroken clipped text</div>',
    (g) => assert.ok(g.clippedText.some((x) => x.label === "div.text" && x.blockOverflow)));
  await fixture("inline range clipped by an ancestor is a fault",
    '<div style="width:45px;overflow:hidden;white-space:nowrap"><span class="inline">Long unbroken clipped text</span></div>',
    (g) => assert.ok(g.clippedText.some((x) => x.label === "span.inline" && x.clippedRange)));
  await fixture("axis-specific vertical ancestor clipping is a fault",
    '<div style="height:12px;width:150px;overflow-y:hidden;overflow-x:visible"><span class="vertical">Clipped line</span></div>',
    (g) => assert.ok(g.clippedText.some((x) => x.label === "span.vertical" && x.clippedRange)));
  await fixture("an obstructed enabled control is a fault",
    '<button class="covered">Pay</button><div style="position:absolute;left:0;top:0;width:80px;height:36px;background:red"></div>',
    (g) => { assert.equal(g.tapCentreMiss, 1); assert.equal(g.tapCentreMissSamples[0].control, "button.covered"); });
  await page.setContent('<!doctype html><button class="null-hit" style="width:80px;height:36px">Pay</button>');
  // Force a browser-level null hit independently of element geometry.
  await page.evaluate(() => { document.elementFromPoint = () => null; });
  assert.equal((await measureGeometry(page)).tapCentreMiss, 1);
  await page.evaluate(() => { delete document.elementFromPoint; });
  passed++;
  console.log("PASS a null hit is a fault");
  await fixture("hidden ancestors suppress descendant faults",
    '<div style="opacity:0;overflow:hidden"><div style="width:400px;overflow:hidden">Long text</div><button>Pay</button></div><div style="visibility:hidden"><button>Pay</button></div><div style="display:none"><button>Pay</button></div>',
    (g) => { clean(g); assert.equal(g.tapCentresChecked, 0); });
  await fixture("clipped decorative children do not cross viewport edges",
    '<div style="width:100px;height:40px;overflow:hidden"><div style="width:500px;height:20px;background:red"></div></div>', clean);
  await fixture("below-scroll text and controls are clean",
    '<div style="width:200px;height:50px;overflow:auto"><div style="height:100px"></div><span>Text below the scroll window</span><button>Pay</button></div>',
    (g) => { clean(g); assert.equal(g.tapCentresChecked, 0); });
  await fixture("a paragraph extending below the document viewport is readable by scrolling",
    '<p style="margin:0;width:180px;line-height:20px">' + 'A readable paragraph in a page scroll. '.repeat(35) + '</p>', clean);
  await fixture("a partial line in an auto scrollport is readable by scrolling",
    '<div style="width:200px;height:30px;overflow:auto"><p style="margin:0;line-height:20px">Some text wrapped into multiple lines of the scrollable region</p></div>', clean);
  await fixture("scrollable text remains reachable inside an outer hard clip",
    '<div style="width:200px;height:30px;overflow:hidden"><div style="height:30px;overflow:auto"><p style="margin:0;line-height:20px">Some text wrapped into multiple lines of the scrollable region</p></div></div>', clean);
  await fixture("horizontal auto scrolling does not truncate a text leaf",
    '<div style="width:100px;overflow:auto;white-space:nowrap">Long text readable by horizontal scrolling</div>', clean);
  await fixture("mixed direct button text and SVG still detect clipping",
    '<button class="mixed" style="width:60px;overflow:hidden;white-space:nowrap">Long clipped payment label <svg width="10" height="10"></svg></button>',
    (g) => assert.ok(g.clippedText.some((x) => x.label === "button.mixed")));
  await fixture("hard vertical line-clamp clipping is a fault",
    '<div class="clamped" style="width:120px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden">A long paragraph that wraps over several lines and is permanently clamped</div>',
    (g) => assert.ok(g.clippedText.some((x) => x.label === "div.clamped" && x.clippedRange)));
  await fixture("offscreen controls are clean",
    '<div style="position:absolute;top:400px"><button>Pay</button><span>Below viewport</span></div>',
    (g) => { clean(g); assert.equal(g.tapCentresChecked, 0); });
  await fixture("disabled and inert controls are clean despite obstruction",
    '<button disabled>Pay</button><button aria-disabled="true">Pay</button><fieldset disabled><button>Pay</button></fieldset><div inert><button>Pay</button></div><div style="position:absolute;inset:0;background:red"></div>',
    (g) => { clean(g); assert.equal(g.tapCentresChecked, 0); });
  await fixture("ancestor clip excludes control centres outside its region",
    '<div style="width:20px;height:36px;overflow:hidden"><button></button></div>',
    (g) => { clean(g); assert.equal(g.tapCentresChecked, 0); });
  await fixture("transformed ancestor clip preserves visible controls",
    '<div style="transform:scale(.5);transform-origin:0 0;width:200px;height:80px;overflow:hidden"><button><span>Pay</span></button></div>',
    (g) => { clean(g); assert.equal(g.tapCentresChecked, 1); });
  await fixture("actual rows count fully visible rows only",
    '<div style="height:60px;overflow:hidden"><div class="tp-stack-row" style="height:30px">First</div><div class="tp-stack-row" style="height:30px">Second</div><div class="tp-stack-row" style="height:30px">Third</div></div><div class="tp-stack-card">An empty state</div>',
    (g) => { clean(g); assert.deepEqual(g.terminalRows, { total: 3, visible: 2 }); }, ".tp-stack-row");
  await fixture("absent actual terminal rows remain zero",
    '<div class="tp-stack-card">Empty</div>',
    (g) => { clean(g); assert.deepEqual(g.terminalRows, { total: 0, visible: 0 }); }, ".tp-stack-row");
  await fixture("hidden actual terminal rows are not visible",
    '<div style="opacity:0"><div class="rt-row" style="height:30px">Hidden</div></div>',
    (g) => { clean(g); assert.deepEqual(g.terminalRows, { total: 1, visible: 0 }); }, ".rt-row");
  await fixture("covered terminal rows are not visible",
    '<div class="tp-stack-row" style="height:40px;width:200px">Payment row</div><div style="position:absolute;inset:0;background:red"></div>',
    (g) => { clean(g); assert.deepEqual(g.terminalRows, { total: 1, visible: 0 }); }, ".tp-stack-row");
  await assert.rejects(() => measureGeometry(page, ""), /nonempty selector/);
  console.log(`PASS ${passed} geometry fixtures; empty row selector rejected`);
} finally {
  await browser.close();
}
