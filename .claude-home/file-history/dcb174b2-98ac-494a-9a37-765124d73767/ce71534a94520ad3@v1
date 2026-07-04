import {
  buildBuckets, periodWindow, collectedCents, growthPct,
  collectionRate, filterByProperty, fmtCompact,
} from '../property-dashboard-data';

// Thursday 2 Jul 2026, 15:00 local. Monday of this week = 29 Jun.
const NOW = new Date(2026, 6, 2, 15, 0, 0);

const paid = (isoLocal: Date, cents: number, extra: any = {}) =>
  ({ status: 'paid', amountCents: cents, paidAt: isoLocal.toISOString(), createdAt: isoLocal.toISOString(), ...extra });

describe('periodWindow', () => {
  it('week starts Monday 00:00 and previous window is the prior week', () => {
    const w = periodWindow('week', NOW);
    expect(w.start.getDay()).toBe(1);            // Monday
    expect(w.start.getDate()).toBe(29);           // 29 Jun
    expect(w.prevEnd.getTime()).toBe(w.start.getTime());
    expect(w.prevStart.getDate()).toBe(22);       // 22 Jun
  });
  it('month starts on the 1st, previous is prior calendar month', () => {
    const w = periodWindow('month', NOW);
    expect(w.start.getDate()).toBe(1);
    expect(w.start.getMonth()).toBe(6);           // July
    expect(w.prevStart.getMonth()).toBe(5);       // June
  });
});

describe('buildBuckets', () => {
  it('week: 7 M-start buckets; Tuesday payment lands in index 1', () => {
    const tue = new Date(2026, 5, 30, 10, 0);     // Tue 30 Jun
    const b = buildBuckets([paid(tue, 50000)], 'week', NOW);
    expect(b).toHaveLength(7);
    expect(b.map(x => x.label)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(b[1].valueCents).toBe(50000);
    expect(b[0].valueCents).toBe(0);
  });
  it('week: voided and unpaid invoices contribute nothing', () => {
    const tue = new Date(2026, 5, 30, 10, 0);
    const b = buildBuckets([
      paid(tue, 50000, { status: 'voided' }),
      paid(tue, 40000, { status: 'overdue' }),
    ], 'week', NOW);
    expect(b[1].valueCents).toBe(0);
  });
  it('year: 12 buckets; March payment lands in index 2', () => {
    const mar = new Date(2026, 2, 10, 9, 0);
    const b = buildBuckets([paid(mar, 120000)], 'year', NOW);
    expect(b).toHaveLength(12);
    expect(b[2].valueCents).toBe(120000);
  });
  it('month: July 2026 (31 days) yields 5 weekly buckets, W1..W5', () => {
    const d2 = new Date(2026, 6, 2, 9, 0);        // 2 Jul → W1
    const b = buildBuckets([paid(d2, 30000)], 'month', NOW);
    expect(b).toHaveLength(5);
    expect(b[0].label).toBe('W1');
    expect(b[0].valueCents).toBe(30000);
  });
  it('day: 8 three-hour buckets; last bucket is the current block', () => {
    // NOW 15:00 → current block [15:00, 18:00). 15:30 → last bucket; 14:00 → previous one.
    const h1530 = new Date(2026, 6, 2, 15, 30);
    const h14 = new Date(2026, 6, 2, 14, 0);
    const b = buildBuckets([paid(h1530, 25000), paid(h14, 10000)], 'day', NOW);
    expect(b).toHaveLength(8);
    expect(b[7].valueCents).toBe(25000);
    expect(b[6].valueCents).toBe(10000);
  });
});

describe('collectedCents / growthPct / collectionRate', () => {
  it('collectedCents sums only paid invoices inside the window', () => {
    const w = periodWindow('week', NOW);
    const inWin = paid(new Date(2026, 6, 1), 60000);
    const outWin = paid(new Date(2026, 5, 20), 99900);
    const unpaid = paid(new Date(2026, 6, 1), 11100, { status: 'dispatched' });
    expect(collectedCents([inWin, outWin, unpaid], w.start, w.end)).toBe(60000);
  });
  it('growthPct rounds and signs; zero/negative previous → null', () => {
    expect(growthPct(1500, 1200)).toBe(25);
    expect(growthPct(900, 1200)).toBe(-25);
    expect(growthPct(500, 0)).toBeNull();
  });
  it('collectionRate = paid ÷ non-voided sent in window; none sent → null', () => {
    const w = periodWindow('week', NOW);
    const mk = (status: string) => paid(new Date(2026, 6, 1), 10000, { status });
    expect(collectionRate([mk('paid'), mk('paid_external'), mk('overdue')], w.start, w.end)).toBe(67);
    expect(collectionRate([mk('voided')], w.start, w.end)).toBeNull();
  });
});

describe('filterByProperty', () => {
  const tenants = [
    { id: 't1', propertyAddress: '1 kea st' },
    { id: 't2', propertyAddress: '2 tui rd' },
  ];
  const invoices = [
    { status: 'paid', amountCents: 1, propertyAddress: '1 kea st', tenantProfileId: 't1' },
    { status: 'paid', amountCents: 2, propertyAddress: null, tenantProfileId: 't2' }, // falls back to tenant
    { status: 'paid', amountCents: 3, propertyAddress: '2 tui rd', tenantProfileId: 't2' },
  ];
  it('null address passes everything through', () => {
    const r = filterByProperty(invoices, tenants, null);
    expect(r.invoices).toHaveLength(3);
    expect(r.tenants).toHaveLength(2);
  });
  it('filters invoices by address with tenant fallback', () => {
    const r = filterByProperty(invoices, tenants, '2 tui rd');
    expect(r.invoices.map((i: any) => i.amountCents)).toEqual([2, 3]);
    expect(r.tenants).toHaveLength(1);
  });
});

describe('fmtCompact', () => {
  it('formats like the mockup pill', () => {
    expect(fmtCompact(250000)).toBe('2.5k');   // $2,500
    expect(fmtCompact(98000)).toBe('$980');
    expect(fmtCompact(1200000)).toBe('12k');
    expect(fmtCompact(0)).toBe('$0');
  });
});
