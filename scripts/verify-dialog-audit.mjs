import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CHROMIUM_PATH } from './desktop-shots/retail-fixtures.mjs';
import { auditDialog } from './dialog-audit.mjs';
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
const page = await browser.newPage();
function fixture({ named = true, trap = true, escape = true, restore = true } = {}) {
  return `<html lang="en"><head><title>Dialog control</title></head><body><main><button id="open">Open</button></main>
  <div id="dialog" hidden role="dialog" aria-modal="true" ${named ? 'aria-label="PRIVATE-NAME"' : ''} tabindex="-1"><button>PRIVATE-TEXT</button><button>Close</button></div>
  <script>(() => {
  const main=document.querySelector('main'), dialog=document.querySelector('#dialog'), trigger=document.querySelector('#open'), controls=dialog.querySelectorAll('button');
  trigger.onclick=()=>{dialog.hidden=false;main.inert=${trap};controls[0].focus()};
  document.addEventListener('keydown',e=>{
    if(dialog.hidden)return;
    if(e.key==='Escape'&&${escape}){e.preventDefault();dialog.hidden=true;main.inert=false;if(${restore})trigger.focus();else document.body.focus();}
    if(e.key==='Tab'&&${trap}&&((e.shiftKey&&document.activeElement===controls[0])||(!e.shiftKey&&document.activeElement===controls[1]))){e.preventDefault();controls[e.shiftKey?1:0].focus();}
  });
  })();</script></body></html>`;
}
try {
  const spec = { trigger: '#open', layer: '#dialog' };
  await page.setContent(fixture());
  const good = await auditDialog(page, spec);
  assert.deepEqual(good.faults, []); assert.deepEqual(good.audit.violations, []);
  assert.ok(!JSON.stringify(good).includes('PRIVATE-'));
  for (const [flag, fault] of [['named', 'named'], ['trap', 'focusInside'], ['escape', 'Escape did not close'], ['restore', 'focus did not return']]) {
    await page.setContent(fixture({ [flag]: false }));
    assert.ok((await auditDialog(page, spec)).faults.includes(fault), flag);
  }
  console.log('PASS dialog naming, real Tab confinement, Escape, return and privacy controls');
} finally { await browser.close(); }
