import { chromium } from 'playwright';
import fs from 'fs';
const EXEC = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const BASE = 'http://localhost:5000';
const TOKEN = fs.readFileSync('.rev-token.txt', 'utf8').trim();

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });

// ---------- 1. Identify the 4xx responses ----------
console.log('===== 1. NON-2xx API RESPONSES PER ROUTE (authed, mobile) =====');
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await ctx.addInitScript(t => localStorage.setItem('authToken', t), TOKEN);
const seen = {};
for (const route of ['/dashboard', '/terminal', '/settings', '/property', '/trades', '/transactions', '/stock']) {
  const page = await ctx.newPage();
  const hits = [];
  page.on('response', r => {
    const u = r.url();
    if (u.startsWith(BASE) && u.includes('/api/') && (r.status() < 200 || r.status() >= 300)) {
      hits.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`);
    }
  });
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (const h of hits) seen[h] = (seen[h] || 0) + 1;
  console.log(`${route}: ${hits.length ? [...new Set(hits)].join(' | ') : 'clean'}`);
  await page.close();
}
console.log('\nAggregate:');
Object.entries(seen).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${v}x ${k}`));

// ---------- 2. The logout-from-settings hook crash ----------
console.log('\n===== 2. LOGOUT FROM /settings (hook-order crash repro) =====');
{
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Find the logout control
  const logoutCount = await page.locator('text=/log ?out|sign ?out/i').count();
  console.log('logout controls found:', logoutCount);
  if (logoutCount > 0) {
    await page.locator('text=/log ?out|sign ?out/i').first().click().catch(e => console.log('click failed', e.message));
    await page.waitForTimeout(2500);
  }
  const after = await page.evaluate(() => ({
    url: location.pathname,
    recovery: document.querySelector('[data-chunk-recovery]')?.getAttribute('data-chunk-recovery') || null,
    head: (document.body.innerText || '').trim().slice(0, 120).replace(/\s+/g, ' '),
    token: localStorage.getItem('authToken') ? 'present' : 'cleared',
  }));
  console.log('after logout:', JSON.stringify(after));
  console.log('errors:', errs.length ? [...new Set(errs)].join(' | ') : 'none');
  await page.close();
}

// ---------- 3. Token expiry mid-session ----------
console.log('\n===== 3. EXPIRED TOKEN WHILE ON /settings =====');
{
  const expired = (await import('jsonwebtoken')).default.sign(
    { principal: 'user', userId: 4, email: 'oliverharryleonard@gmail.com', merchantId: 22, role: 'owner' },
    process.env.JWT_SECRET, { expiresIn: '2s' });
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await c2.addInitScript(t => localStorage.setItem('authToken', t), expired);
  const page = await c2.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const st = await page.evaluate(() => ({
    url: location.pathname,
    head: (document.body.innerText || '').trim().slice(0, 140).replace(/\s+/g, ' '),
    token: localStorage.getItem('authToken') ? 'present' : 'cleared',
    recovery: document.querySelector('[data-chunk-recovery]')?.getAttribute('data-chunk-recovery') || null,
  }));
  console.log('state:', JSON.stringify(st));
  console.log('errors:', errs.length ? [...new Set(errs)].join(' | ') : 'none');
  await c2.close();
}

// ---------- 4. Interactive: terminal keypad -> create a charge ----------
console.log('\n===== 4. RETAIL TERMINAL INTERACTION (mobile) =====');
{
  const page = await ctx.newPage();
  const errs = []; const apiCalls = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  page.on('response', r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') apiCalls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE,'')}`); });
  await page.goto(BASE + '/terminal', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const digits = await page.locator('button', { hasText: /^[0-9]$/ }).count();
  console.log('keypad digit buttons:', digits);
  for (const d of ['5', '0', '0']) {
    const b = page.locator('button', { hasText: new RegExp(`^${d}$`) }).first();
    if (await b.count()) await b.click().catch(()=>{});
  }
  await page.waitForTimeout(500);
  const shown = await page.evaluate(() => (document.body.innerText||'').match(/\$?[\d,]+\.\d{2}/)?.[0] || null);
  console.log('amount displayed after tapping 5,0,0:', shown);
  const chargeBtn = page.locator('button', { hasText: /charge|pay|continue|next/i }).first();
  if (await chargeBtn.count()) {
    await chargeBtn.click().catch(()=>{});
    await page.waitForTimeout(3000);
  }
  console.log('non-GET api calls:', apiCalls.length ? [...new Set(apiCalls)].join(' | ') : 'none');
  console.log('page text now:', await page.evaluate(()=> (document.body.innerText||'').trim().slice(0,200).replace(/\s+/g,' ')));
  console.log('errors:', errs.length ? [...new Set(errs)].join(' | ') : 'none');
  await page.close();
}

await ctx.close();
await browser.close();
