/* Pure data helpers for the property dashboard — bucketing, growth, collection
   rate, and the per-property filter. All figures exclude voided invoices. */

export type Timeframe = 'day' | 'week' | 'month' | 'year';
export interface Bucket { label: string; valueCents: number }

const isPaid = (i: any) => i.status === 'paid' || i.status === 'paid_external';
const notVoided = (invs: any[]) => invs.filter((i: any) => i.status !== 'voided');
const paidAt = (i: any) => new Date(i.paidAt ?? i.createdAt);
const sumCents = (invs: any[]) => invs.reduce((s: number, i: any) => s + (i.amountCents ?? 0), 0);
const inWin = (d: Date, s: Date, e: Date) => d >= s && d < e;

/* Current + previous window for a timeframe. Week is Monday-start; month/year
   are calendar periods; day is a rolling 24h. */
export function periodWindow(tf: Timeframe, now = new Date()) {
  if (tf === 'day') {
    const start = new Date(now.getTime() - 24 * 3600000);
    return { start, end: now, prevStart: new Date(now.getTime() - 48 * 3600000), prevEnd: start };
  }
  if (tf === 'week') {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    const start = new Date(d); start.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    const prevStart = new Date(start); prevStart.setDate(start.getDate() - 7);
    return { start, end: now, prevStart, prevEnd: start };
  }
  if (tf === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now, prevStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), prevEnd: start };
  }
  const start = new Date(now.getFullYear(), 0, 1);
  return { start, end: now, prevStart: new Date(now.getFullYear() - 1, 0, 1), prevEnd: start };
}

/* Rent collected (paid invoices, by paid date) inside [start, end). */
export function collectedCents(invoices: any[], start: Date, end: Date): number {
  return sumCents(notVoided(invoices).filter(isPaid).filter((i: any) => inWin(paidAt(i), start, end)));
}

/* % change vs previous period; null when there's no previous baseline. */
export function growthPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/* paid ÷ non-voided invoices SENT (createdAt) in the window, as a rounded %. */
export function collectionRate(invoices: any[], start: Date, end: Date): number | null {
  const sent = notVoided(invoices).filter((i: any) => inWin(new Date(i.createdAt), start, end));
  if (sent.length === 0) return null;
  return Math.round((sent.filter(isPaid).length / sent.length) * 100);
}

/* Calendar buckets of collected rent for the bar chart.
   day = 8×3h blocks · week = M-start 7 days · month = W1..W4/5 · year = J..D */
export function buildBuckets(invoices: any[], tf: Timeframe, now = new Date()): Bucket[] {
  const paid = notVoided(invoices).filter(isPaid);
  const bucket = (s: Date, e: Date, label: string): Bucket =>
    ({ label, valueCents: sumCents(paid.filter((i: any) => inWin(paidAt(i), s, e))) });

  if (tf === 'day') {
    // End of the current 3-hour block, then 8 blocks backwards.
    const end = new Date(now); end.setMinutes(0, 0, 0);
    end.setHours(end.getHours() - (end.getHours() % 3) + 3);
    return Array.from({ length: 8 }, (_, k) => {
      const s = new Date(end.getTime() - (8 - k) * 3 * 3600000);
      const e = new Date(end.getTime() - (7 - k) * 3 * 3600000);
      const h = s.getHours();
      const label = h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
      return bucket(s, e, label);
    });
  }
  if (tf === 'week') {
    const { start } = periodWindow('week', now);
    return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, d) => {
      const s = new Date(start); s.setDate(start.getDate() + d);
      const e = new Date(start); e.setDate(start.getDate() + d + 1);
      return bucket(s, e, label);
    });
  }
  if (tf === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil(days / 7) }, (_, w) => {
      const s = new Date(first); s.setDate(1 + w * 7);
      const e = new Date(first); e.setDate(1 + (w + 1) * 7);
      return bucket(s, e, `W${w + 1}`);
    });
  }
  return ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((label, m) =>
    bucket(new Date(now.getFullYear(), m, 1), new Date(now.getFullYear(), m + 1, 1), label));
}

/* Portfolio filter. addr=null → everything. Invoices missing propertyAddress
   fall back to their tenant's address via tenantProfileId. */
export function filterByProperty(invoices: any[], tenants: any[], addr: string | null) {
  if (!addr) return { invoices, tenants };
  const byId = new Map(tenants.map((t: any) => [t.id, t]));
  return {
    invoices: invoices.filter((i: any) =>
      (i.propertyAddress ?? byId.get(i.tenantProfileId)?.propertyAddress) === addr),
    tenants: tenants.filter((t: any) => t.propertyAddress === addr),
  };
}

/* Mockup-style compact money: $980 under 1k, 2.5k / 12k above. */
export function fmtCompact(cents: number): string {
  const d = cents / 100;
  if (d >= 1000) {
    const k = d / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return `$${Math.round(d)}`;
}
