// Mock API layer for the DOWNLOADABLE VISUAL BUILD only.
//
// This module is imported by main.tsx ONLY when the app is built with
// VITE_MOCK=1. It seeds a fake authenticated session and overrides window.fetch
// so every /api/... call resolves with canned demo data — no backend required.
// The result is a static bundle that *looks* like the live, logged-in app.
//
// It is a no-op in normal dev/prod builds. Delete client/src/mocks to remove.

const MERCHANT_ID = 1;

/* ---- base64url + fake JWT --------------------------------------------- */
// getCurrentMerchantId() in lib/auth.ts decodes authToken as a JWT and reads
// payload.merchantId, so the seed token must be a real base64url JWT.
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fakeJwt(): string {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    userId: 1,
    merchantId: MERCHANT_ID,
    role: 'merchant',
    email: 'demo@harboursidecafe.co.nz',
    onboardingCompleted: true,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  });
  return `${header}.${payload}.mocksignature`;
}

/* ---- demo data -------------------------------------------------------- */
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

const MERCHANT = {
  id: MERCHANT_ID,
  name: 'Ava Thompson',
  businessName: 'Harbourside Café',
  businessType: 'Hospitality',
  email: 'demo@harboursidecafe.co.nz',
  phone: '+64 21 555 0142',
  address: '18 Customs Street West, Auckland CBD, Auckland 1010',
  status: 'active',
  director: 'Ava Thompson',
  nzbn: '9429041902345',
  contactEmail: 'accounts@harboursidecafe.co.nz',
  contactPhone: '+64 9 555 0142',
  businessAddress: '18 Customs Street West, Auckland CBD, Auckland 1010',
  bankName: 'ANZ',
  bankAccountNumber: '01-0102-0123456-00',
  accountHolderName: 'Harbourside Café Ltd',
  gstNumber: '124-865-902',
  gstRegistered: true,
  themeId: 'classic',
  currentProviderRate: '0.0290',
  ourRate: '0.0020',
  emailVerified: true,
  onboardingCompleted: true,
  dailyGoal: '800.00',
  billingCardLast4: '4242',
  billingCardBrand: 'Visa',
  billingCardExpiry: '08/28',
  customLogoUrl: null,
  qrCodeUrl: null,
  paymentUrl: `/pay/${MERCHANT_ID}`,
  rentReminderEnabled: true,
  rentReminderDelayDays: 3,
  rentReminderIntervalDays: 3,
  rentReminderMaxCount: 3,
  createdAt: iso(now - 220 * DAY),
  updatedAt: iso(now - 2 * DAY),
};

const ITEMS = [
  'Flat White', 'Long Black', 'Cappuccino', 'Mocha', 'Chai Latte',
  'Eggs Benedict', 'Avocado Smash', 'Bacon & Egg Roll', 'Berry Smoothie',
  'Ham & Cheese Croissant', 'Blueberry Muffin', 'Caramel Slice', 'Lunch Special',
];
const METHODS = ['qr_code', 'nfc_tap', 'card_reader', 'manual'];

function buildTransactions() {
  const txns: any[] = [];
  let id = 1000;
  // ~9 transactions/day for the last 30 days, weighted to daytime.
  for (let d = 29; d >= 0; d--) {
    const count = 6 + Math.floor(seeded(d) * 8);
    for (let i = 0; i < count; i++) {
      const hour = 7 + Math.floor(seeded(d * 31 + i) * 11); // 7am–6pm
      const min = Math.floor(seeded(d * 7 + i * 3) * 60);
      const ts = now - d * DAY;
      const created = new Date(ts);
      created.setHours(hour, min, 0, 0);
      const base = seeded(id);
      const price = (4 + base * 42).toFixed(2); // $4–$46
      // ~92% completed, small tail of other states
      const roll = seeded(id * 3);
      const status = roll > 0.94 ? 'refunded' : roll > 0.90 ? 'failed' : roll > 0.87 ? 'pending' : 'completed';
      txns.push({
        id: id,
        merchantId: MERCHANT_ID,
        itemName: ITEMS[Math.floor(seeded(id * 5) * ITEMS.length)],
        price,
        status,
        paymentMethod: METHODS[Math.floor(seeded(id * 9) * METHODS.length)],
        windcaveFeeRate: '0.0290',
        platformFeeRate: '0.0020',
        merchantNet: (parseFloat(price) * 0.978).toFixed(2),
        totalRefunded: status === 'refunded' ? price : '0.00',
        isSplit: false,
        totalSplits: 1,
        completedSplits: status === 'completed' ? 1 : 0,
        createdAt: created.toISOString(),
      });
      id++;
    }
  }
  return txns.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

// Deterministic pseudo-random so the demo looks identical on every load.
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const TRANSACTIONS = buildTransactions();

function buildAnalytics() {
  const completed = TRANSACTIONS.filter(t => t.status === 'completed');
  const totalRevenue = completed.reduce((s, t) => s + parseFloat(t.price), 0);
  const weekAgo = now - 7 * DAY;
  const weekly = completed.filter(t => +new Date(t.createdAt) >= weekAgo);
  const weeklyRevenue = weekly.reduce((s, t) => s + parseFloat(t.price), 0);
  const currentProviderCost = totalRevenue * 0.029;
  const ourCost = totalRevenue * 0.002;
  return {
    totalTransactions: TRANSACTIONS.length,
    completedTransactions: completed.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    currentProviderCost: Math.round(currentProviderCost * 100) / 100,
    ourCost: Math.round(ourCost * 100) / 100,
    savings: Math.round((currentProviderCost - ourCost) * 100) / 100,
    currentProviderRate: 0.029,
    ourRate: 0.002,
    weeklyTransactions: weekly.length,
    weeklyRevenue: Math.round(weeklyRevenue * 100) / 100,
    averageTransaction: completed.length ? Math.round((totalRevenue / completed.length) * 100) / 100 : 0,
  };
}
const ANALYTICS = buildAnalytics();

/* ---- property vertical demo data -------------------------------------- */
const TENANT_SEED = [
  ['Liam', 'Walker', '12A Ponsonby Road, Ponsonby, Auckland 1011'],
  ['Sophie', 'Chen', '5/44 Oriental Parade, Oriental Bay, Wellington 6011'],
  ['Noah', 'Patel', '8 Riccarton Road, Riccarton, Christchurch 8041'],
  ['Mia', 'Nguyen', '203/17 Federal Street, Auckland CBD, Auckland 1010'],
  ['Kaia', 'Williams', '31 Tinakori Road, Thorndon, Wellington 6011'],
  ['Jack', 'Robinson', '76 Papanui Road, Merivale, Christchurch 8014'],
];
const TENANTS = TENANT_SEED.map(([firstName, lastName, propertyAddress], i) => ({
  id: i + 1,
  merchantId: MERCHANT_ID,
  firstName,
  lastName,
  email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.co.nz`,
  phone: `+64 21 ${100 + i}${200 + i}${300 + i}`,
  propertyAddress,
  preferredChannel: i % 3 === 0 ? 'sms' : 'email',
  status: 'active',
  archivedAt: null,
  createdAt: iso(now - (120 - i * 12) * DAY),
  updatedAt: iso(now - (i + 1) * DAY),
}));

function buildInvoices() {
  const invs: any[] = [];
  let id = 5000;
  // 4 months of monthly rent per tenant, most paid, recent ones outstanding.
  TENANTS.forEach((t, ti) => {
    const rent = 520 + ti * 45; // weekly rent-ish, dollars
    for (let m = 3; m >= 0; m--) {
      const created = now - m * 30 * DAY;
      const due = created + 5 * DAY;
      let status: string;
      let paidAt: string | null = null;
      if (m === 0) {
        // Current month: most paid recently (so this week's "rent collected"
        // reads non-zero), a couple still outstanding for realism.
        const roll = seeded(id);
        if (roll > 0.35) {
          status = 'paid';
          // Spread payments across the last 6 days (covers the default week view).
          paidAt = iso(now - Math.floor(seeded(id * 2) * 6) * DAY - Math.floor(seeded(id * 4) * 8) * 60 * 60 * 1000);
        } else {
          status = roll > 0.17 ? 'sent' : 'pending_dispatch';
        }
      } else {
        status = 'paid';
        paidAt = iso(due - 1 * DAY);
      }
      if (status === 'paid') paidAt = paidAt ?? iso(due);
      invs.push({
        id,
        merchantId: MERCHANT_ID,
        tenantProfileId: t.id,
        amountCents: rent * 100,
        token: `inv_${id}`,
        deliveryChannel: t.preferredChannel,
        kind: 'rent',
        chargeType: 'rent',
        description: `Rent — ${new Date(created).toLocaleString('en-NZ', { month: 'long', year: 'numeric' })}`,
        status,
        dueAt: iso(due),
        sentAt: iso(created),
        paidAt,
        voidedAt: null,
        reminderCount: status === 'sent' ? 1 : 0,
        splitEnabled: false,
        splitPaidCount: 0,
        createdAt: iso(created),
        updatedAt: iso(created),
      });
      id++;
    }
  });
  return invs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
const INVOICES = buildInvoices();

const SUBSCRIPTION = {
  plan: 'Growth',
  status: 'active',
  billingFrequency: 'monthly',
  priceMonthly: 0,
  transactionsUsed: TRANSACTIONS.length,
  transactionsLimit: 1000,
  currentPeriodEnd: iso(now + 18 * DAY),
  nextBillingDate: iso(now + 18 * DAY),
  cancelAtPeriodEnd: false,
};

/* ---- route table ------------------------------------------------------ */
// Ordered matchers. First match wins. `re` tested against the URL pathname.
type Handler = (m: RegExpMatchArray, url: URL, init?: RequestInit) => unknown;
const ROUTES: Array<{ re: RegExp; data: Handler }> = [
  { re: /\/api\/auth\/me$/, data: () => ({ user: { id: 1, merchantId: MERCHANT_ID, role: 'merchant', email: MERCHANT.email, onboardingCompleted: true } }) },
  { re: /\/api\/merchants\/\d+\/analytics$/, data: () => ANALYTICS },
  { re: /\/api\/merchants\/\d+\/transactions$/, data: () => TRANSACTIONS },
  { re: /\/api\/merchants\/\d+\/tapt-stones$/, data: () => [{ id: 1, merchantId: MERCHANT_ID, name: 'Front Counter', stoneNumber: 1, isActive: true }] },
  { re: /\/api\/merchants\/\d+\/stock-items$/, data: () => STOCK },
  { re: /\/api\/merchants\/\d+\/(details|business-details)$/, data: () => MERCHANT },
  { re: /\/api\/merchants\/\d+$/, data: () => MERCHANT },
  { re: /\/api\/merchants$/, data: () => [MERCHANT] },
  { re: /\/api\/property\/tenants(\?|$)/, data: () => TENANTS },
  { re: /\/api\/property\/invoices(\?|$)/, data: () => INVOICES },
  { re: /\/api\/property\/schedules(\?|$)/, data: () => [] },
  { re: /\/api\/property\/reminder-settings$/, data: () => ({ rentReminderEnabled: true, rentReminderDelayDays: 3, rentReminderIntervalDays: 3, rentReminderMaxCount: 3 }) },
  { re: /\/api\/subscription$/, data: () => SUBSCRIPTION },
  { re: /\/api\/billing\/card$/, data: () => ({ last4: '4242', brand: 'Visa', expiry: '08/28' }) },
  { re: /\/api\/push\/capabilities$/, data: () => ({ webPush: { available: false }, nativePush: { available: false } }) },
  { re: /\/api\/push\/status$/, data: () => ({ nativeSubscribed: false, subscribed: false }) },
];

const STOCK = [
  { id: 1, merchantId: MERCHANT_ID, name: 'Flat White', cost: '5.50', emoji: '☕', isActive: true },
  { id: 2, merchantId: MERCHANT_ID, name: 'Eggs Benedict', cost: '22.00', emoji: '🍳', isActive: true },
  { id: 3, merchantId: MERCHANT_ID, name: 'Avocado Smash', cost: '19.50', emoji: '🥑', isActive: true },
  { id: 4, merchantId: MERCHANT_ID, name: 'Berry Smoothie', cost: '11.00', emoji: '🥤', isActive: true },
  { id: 5, merchantId: MERCHANT_ID, name: 'Caramel Slice', cost: '6.50', emoji: '🍰', isActive: true },
];

/* ---- fetch override --------------------------------------------------- */
const COLLECTION_HINT = /(tenants|transactions|invoices|schedules|stones|items|payments|merchants|keys|events|leads)(\/?$|\?)/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function installMockApi() {
  // Seed an authenticated session.
  const token = fakeJwt();
  localStorage.setItem('authToken', token);
  localStorage.setItem('merchantId', String(MERCHANT_ID));
  localStorage.setItem('user', JSON.stringify({ id: 1, merchantId: MERCHANT_ID, role: 'merchant', email: MERCHANT.email }));

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    // Only intercept our own API. Everything else (chunks, images, sw.js) is real.
    if (!/\/api\//.test(rawUrl)) return realFetch(input as any, init);

    let url: URL;
    try { url = new URL(rawUrl, window.location.origin); } catch { return jsonResponse({}); }
    const path = url.pathname + url.search;

    // Binary / download endpoints we don't mock — let them fail quietly (no data).
    if (/(qr|receipt-pdf|export|logo|vapid-key|\.pdf|\.csv|\.png)/.test(path)) {
      return jsonResponse({}, 200);
    }

    // Mutations: acknowledge success so optimistic UI settles.
    if (method !== 'GET') return jsonResponse({ success: true, id: Date.now() });

    for (const r of ROUTES) {
      const m = path.match(r.re);
      if (m) return jsonResponse(r.data(m, url, init));
    }

    // Unknown GET: sensible default so nothing crashes.
    return jsonResponse(COLLECTION_HINT.test(path) ? [] : {});
  };

  // Boot straight into the app instead of the marketing landing page.
  if (window.location.pathname === '/' || window.location.pathname === '') {
    window.history.replaceState(null, '', '/dashboard');
  }

  // eslint-disable-next-line no-console
  console.info('[mock-api] Demo mode active — all /api calls are served with canned data.');
}
