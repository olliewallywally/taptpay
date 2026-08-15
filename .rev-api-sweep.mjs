import fs from 'fs';
const TOKEN = fs.readFileSync('.rev-token.txt', 'utf8').trim();
const BASE = 'http://localhost:5000';
const M = 22;

const GETS = [
  // auth / session
  ['/api/auth/me', 1],
  ['/api/tutorial/state', 1],
  // merchant
  [`/api/merchants/${M}`, 0],
  [`/api/merchants/${M}/profile`, 1],
  [`/api/merchants/${M}/qr`, 0],
  [`/api/merchants/${M}/transactions`, 1],
  [`/api/merchants/${M}/tapt-stones`, 1],
  [`/api/merchants/${M}/analytics`, 1],
  [`/api/merchants/${M}/revenue-over-time`, 1],
  [`/api/merchants/${M}/analytics/export`, 1],
  [`/api/merchants/${M}/export/csv`, 1],
  [`/api/merchants/${M}/export/pdf`, 1],
  [`/api/merchants/${M}/refunds`, 1],
  [`/api/merchants/${M}/stock-items`, 1],
  [`/api/merchants/${M}/email-status`, 0],
  [`/api/merchants/${M}/active-transaction`, 0],
  // subscription / billing / team
  ['/api/subscription', 1],
  ['/api/subscription/billing-history', 1],
  ['/api/billing/card', 1],
  ['/api/team', 1],
  // push
  ['/api/push/capabilities', 0],
  ['/api/push/vapid-key', 0],
  ['/api/push/status', 1],
  ['/api/push/preferences', 1],
  // property
  ['/api/property/tenants', 1],
  ['/api/property/schedules', 1],
  ['/api/property/invoices', 1],
  ['/api/property/reminder-settings', 1],
  // trades
  ['/api/trades/clients', 1],
  ['/api/trades/quotes', 1],
  ['/api/trades/invoices', 1],
  ['/api/trades/schedules', 1],
  ['/api/trades/reminder-settings', 1],
  ['/api/trades/gst-settings', 1],
  // misc / public
  ['/api/windcave/status', 0],
  ['/api/windcave/env', 0],
  ['/api/nfc/capabilities', 0],
  ['/api/payments/digital-wallet/config', 0],
  ['/robots.txt', 0],
  ['/sitemap.xml', 0],
  ['/api/internal/cron/status', 0],
];

// Tenancy probes: merchant 22's token against another merchant's resources.
const CROSS = [
  ['/api/merchants/31/profile', 'other merchant profile'],
  ['/api/merchants/31/transactions', 'other merchant transactions'],
  ['/api/merchants/31/stock-items', 'other merchant stock'],
  ['/api/merchants/31/refunds', 'other merchant refunds'],
  ['/api/merchants/31/export/csv', 'other merchant csv export'],
  ['/api/merchants/31/analytics', 'other merchant analytics'],
];

// Admin routes with a merchant token — must all be 403.
const ADMIN = [
  '/api/admin/auth/me',
  '/api/admin/merchants',
  '/api/admin/analytics',
  '/api/admin/subscription-revenue',
  '/api/admin/api-keys',
  '/api/admin/email-status',
  '/api/admin/revenue-over-time',
  '/api/admin/payment-method-breakdown',
];

async function hit(path, auth, method = 'GET') {
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${TOKEN}`;
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + path, { method, headers, signal: AbortSignal.timeout(20000) });
    const ct = r.headers.get('content-type') || '';
    let body = '';
    try { body = (await r.text()).slice(0, 200); } catch { body = '<unreadable>'; }
    return { status: r.status, ms: Date.now() - t0, ct: ct.split(';')[0], body };
  } catch (e) {
    return { status: 'ERR', ms: Date.now() - t0, ct: '', body: String(e.message) };
  }
}

const problems = [];
console.log('### AUTHENTICATED / PUBLIC READS');
for (const [path, auth] of GETS) {
  const r = await hit(path, auth);
  const flag = (r.status === 'ERR' || r.status >= 500) ? '  <<< FAIL' : '';
  if (flag) problems.push(`${path} -> ${r.status} ${r.body}`);
  console.log(`${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)}ms ${r.ct.padEnd(24)} ${path}${flag}`);
}

console.log('\n### CROSS-TENANT (merchant 22 token -> merchant 31) — expect 403/404, never 200');
for (const [path, label] of CROSS) {
  const r = await hit(path, 1);
  const leaked = r.status === 200;
  if (leaked) problems.push(`TENANCY LEAK: ${path} returned 200`);
  console.log(`${String(r.status).padEnd(4)} ${label}${leaked ? '  <<< LEAK' : ''}`);
}

console.log('\n### ADMIN ROUTES WITH MERCHANT TOKEN — expect 403');
for (const path of ADMIN) {
  const r = await hit(path, 1);
  const bad = r.status === 200;
  if (bad) problems.push(`PRIVILEGE ESCALATION: ${path} returned 200`);
  console.log(`${String(r.status).padEnd(4)} ${path}${bad ? '  <<< ESCALATION' : ''}`);
}

console.log('\n### UNAUTHENTICATED ACCESS TO PROTECTED ROUTES — expect 401');
for (const path of ['/api/auth/me', '/api/subscription', '/api/team', '/api/property/tenants', '/api/trades/clients', `/api/merchants/${M}/profile`]) {
  const r = await hit(path, 0);
  const bad = r.status === 200;
  if (bad) problems.push(`UNAUTH ACCESS: ${path} returned 200`);
  console.log(`${String(r.status).padEnd(4)} ${path}${bad ? '  <<< OPEN' : ''}`);
}

console.log('\n### MALFORMED INPUT — expect 4xx, never 5xx');
for (const path of [
  '/api/merchants/abc', '/api/merchants/-1', '/api/merchants/99999999',
  '/api/merchants/0/profile', '/api/transactions/abc', '/api/transactions/999999999',
  '/api/pay/t/not-a-real-token', '/api/checkout/resolve/zzzz',
  '/api/split-payments/abc', '/api/tapt-stones/abc',
  '/api/trades/quotes/token/nope', '/api/auth/validate-reset-token/nope',
]) {
  const r = await hit(path, 1);
  const bad = r.status === 'ERR' || r.status >= 500;
  if (bad) problems.push(`5xx on malformed input: ${path} -> ${r.status} ${r.body}`);
  console.log(`${String(r.status).padEnd(4)} ${path}${bad ? '  <<< 5xx' : ''}`);
}

console.log('\n\n===== PROBLEMS =====');
console.log(problems.length ? problems.join('\n') : 'none');
