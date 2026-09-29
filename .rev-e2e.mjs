import { chromium } from 'playwright';
import fs from 'fs';
const EXEC = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const BASE = 'http://localhost:5000';
const TOKEN = fs.readFileSync('.rev-token.txt', 'utf8').trim();
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await ctx.addInitScript(t => localStorage.setItem('authToken', t), TOKEN);

const page = await ctx.newPage();
const calls = []; const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
page.on('response', async r => {
  if (r.url().includes('/api/') && r.request().method() !== 'GET') {
    let b = ''; try { b = (await r.text()).slice(0, 250); } catch {}
    calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')} :: ${b}`);
  }
});

const tap = async (id, label) => {
  const el = page.locator(`[data-demo-id="${id}"]`);
  const n = await el.count();
  console.log(`  tap ${label || id}: ${n ? 'found' : 'NOT FOUND'}`);
  if (n) { await el.first().click({ timeout: 4000 }).catch(e => console.log('    click err', e.message)); await page.waitForTimeout(450); }
  return n > 0;
};
const shot = async (n) => { await page.screenshot({ path: `/tmp/rev-${n}.png` }); };

console.log('=== RETAIL SALE E2E (mobile) ===');
await page.goto(BASE + '/terminal', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await shot('01-terminal');

await tap('retail-add-sale', 'FAB (new sale)');
await shot('02-keypad');
for (const d of ['2', '5', '0']) await tap(`retail-key-${d}`, `digit ${d}`);
console.log('  amount shown:', await page.evaluate(() => (document.body.innerText||'').match(/\$[\d,]+\.\d{2}/)?.[0] || 'none'));
await shot('03-amount');
await tap('retail-keypad-confirm', 'commit amount');
await shot('04-details');
// Details step: name the item, then confirm
const nameField = page.locator('[data-demo-id="retail-item-name"]');
if (await nameField.count()) { await nameField.first().fill('review-test-sale').catch(e=>console.log('   fill err', e.message)); }
await tap('retail-details-confirm', 'confirm details');
await page.waitForTimeout(3500);
await shot('05-after-details');
console.log('  after details:', await page.evaluate(() => (document.body.innerText||'').trim().slice(0, 200).replace(/\s+/g, ' ')));
// Some flows require the explicit send button to create the sale
await tap('retail-create-sale', 'send (create sale)');
await page.waitForTimeout(3500);
await shot('06-after-send');

console.log('\n  non-GET API calls:');
console.log(calls.length ? calls.map(c => '   ' + c).join('\n') : '   none');
console.log('  page errors:', errs.length ? [...new Set(errs)].join(' | ') : 'none');
console.log('  page text:', await page.evaluate(() => (document.body.innerText||'').trim().slice(0, 260).replace(/\s+/g, ' ')));

// ---- Follow the created payment link into the customer checkout ----
const created = calls.find(c => c.startsWith('20') && c.includes('POST /api/transactions'));
let token = null, txnId = null;
if (created) {
  const m = created.match(/"paymentToken":"([^"]+)"/) || created.match(/"token":"([^"]+)"/);
  if (m) token = m[1];
  const mi = created.match(/"id":(\d+)/);
  if (mi) txnId = mi[1];
}
console.log('\n=== CUSTOMER CHECKOUT ===');
console.log('  extracted token:', token, ' txnId:', txnId);

const target = token ? `/checkout/t/${token}` : (txnId ? `/checkout/${txnId}` : null);
if (target) {
  const cust = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const cp = await cust.newPage();
  const cerr = []; const c5 = [];
  cp.on('pageerror', e => cerr.push(String(e.message).slice(0, 200)));
  cp.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) c5.push(`${r.status()} ${r.url().replace(BASE,'')}`); });
  await cp.goto(BASE + target, { waitUntil: 'domcontentloaded' });
  await cp.waitForTimeout(3500);
  await cp.screenshot({ path: '/tmp/rev-05-checkout.png' });
  console.log('  checkout url:', target);
  console.log('  checkout text:', await cp.evaluate(() => (document.body.innerText||'').trim().slice(0, 300).replace(/\s+/g, ' ')));
  console.log('  checkout errors:', cerr.length ? [...new Set(cerr)].join(' | ') : 'none');
  console.log('  checkout 4xx/5xx:', c5.length ? [...new Set(c5)].join(' | ') : 'none');
  await cust.close();
} else {
  console.log('  no transaction was created — cannot test checkout');
}

await ctx.close(); await browser.close();
