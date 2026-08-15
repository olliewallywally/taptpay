import { chromium } from 'playwright';
import fs from 'fs';
import jwt from 'jsonwebtoken';
const EXEC = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const BASE = 'http://localhost:5000';
const TOKEN = fs.readFileSync('.rev-token.txt', 'utf8').trim();
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });

// ---------- A. What exactly is 403ing? (all URLs, not just /api/) ----------
console.log('===== A. ALL NON-2xx RESPONSES (any URL) =====');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript(t => localStorage.setItem('authToken', t), TOKEN);
  const agg = {};
  for (const route of ['/dashboard', '/settings', '/trades', '/login']) {
    const page = await ctx.newPage();
    page.on('response', r => {
      if (r.status() < 200 || r.status() >= 300) {
        const k = `${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`;
        agg[k] = (agg[k] || 0) + 1;
      }
    });
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.close();
  }
  Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log(`  ${v}x ${k}`));
  await ctx.close();
}

// ---------- B. Already-expired token at page load ----------
console.log('\n===== B. ALREADY-EXPIRED TOKEN AT LOAD =====');
{
  const expired = jwt.sign(
    { principal: 'user', userId: 4, email: 'x@y.z', merchantId: 22, role: 'owner', exp: Math.floor(Date.now()/1000) - 60 },
    process.env.JWT_SECRET);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript(t => localStorage.setItem('authToken', t), expired);
  const page = await ctx.newPage();
  await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log(JSON.stringify(await page.evaluate(() => ({
    url: location.pathname + location.search,
    token: localStorage.getItem('authToken') ? 'present' : 'cleared',
    head: (document.body.innerText||'').trim().slice(0,100).replace(/\s+/g,' '),
  }))));
  await ctx.close();
}

// ---------- C. Session expires WHILE the page is open (no reload) ----------
console.log('\n===== C. SESSION EXPIRES WHILE PAGE IS OPEN =====');
{
  const shortLived = jwt.sign(
    { principal: 'user', userId: 4, email: 'x@y.z', merchantId: 22, role: 'owner' },
    process.env.JWT_SECRET, { expiresIn: '6s' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript(t => localStorage.setItem('authToken', t), shortLived);
  const page = await ctx.newPage();
  const codes = [];
  page.on('response', r => { if (r.url().includes('/api/')) codes.push(r.status()); });
  await page.goto(BASE + '/stock', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('before expiry, api codes:', [...new Set(codes)].join(','));
  await page.waitForTimeout(6000);
  codes.length = 0;
  // Force a refetch by navigating within the SPA
  await page.evaluate(() => window.history.pushState({}, '', '/transactions'));
  await page.goto(BASE + '/transactions', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('after expiry, api codes:', [...new Set(codes)].join(','));
  console.log(JSON.stringify(await page.evaluate(() => ({
    url: location.pathname,
    token: localStorage.getItem('authToken') ? 'present' : 'cleared',
    head: (document.body.innerText||'').trim().slice(0,120).replace(/\s+/g,' '),
  }))));
  await ctx.close();
}

// ---------- D. Retail terminal: real interaction ----------
console.log('\n===== D. RETAIL TERMINAL (mobile) DOM =====');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript(t => localStorage.setItem('authToken', t), TOKEN);
  const page = await ctx.newPage();
  const errs = []; const calls = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0,200)));
  page.on('response', r => { if (r.url().includes('/api/') && r.request().method()!=='GET') calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE,'')}`); });
  await page.goto(BASE + '/terminal', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const clickable = [...document.querySelectorAll('button,[role=button],[data-testid]')]
      .map(e => (e.getAttribute('data-testid') || e.textContent || '').trim().replace(/\s+/g,' ').slice(0,24))
      .filter(Boolean);
    return { count: clickable.length, sample: clickable.slice(0, 40) };
  });
  console.log('interactive elements:', info.count);
  console.log('sample:', info.sample.join(' | '));
  // Tap digits by visible text nodes
  for (const d of ['2','5','0']) {
    const el = page.locator(`text="${d}"`).first();
    if (await el.count()) await el.click({ timeout: 2000 }).catch(()=>{});
  }
  await page.waitForTimeout(800);
  console.log('amount now:', await page.evaluate(()=> (document.body.innerText||'').match(/\$[\d,]+\.\d{2}/)?.[0] || 'none'));
  console.log('errors:', errs.length ? [...new Set(errs)].join(' | ') : 'none');
  await ctx.close();
}

await browser.close();
