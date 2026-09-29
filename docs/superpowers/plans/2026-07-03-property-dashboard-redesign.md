# Property Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the property dashboard to the user's mockup (`attached_assets/image_1783029267424.png`) — navy hero with clickable animated bar chart, sliding Day/Week/Month/Year selector, property filter dropdown, stat cards and action shortcuts — all wired to live data, with deep links into the property terminal.

**Architecture:** Pure data helpers in a new `client/src/lib/property-dashboard-data.ts` (unit-tested), full rewrite of `client/src/pages/property/property-dashboard.tsx` (self-contained components + injected CSS, matching codebase style), and two small additions to `client/src/pages/property/property-terminal.tsx` (query-param deep links; status filter + inline remind buttons on the home stack).

**Tech Stack:** React + TypeScript, inline styles + injected `<style>` (codebase convention), inline SVG chart (no chart lib), wouter, @tanstack/react-query, jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-07-02-property-dashboard-redesign-design.md`

## Global Constraints

- Branch: `feat/property-dashboard-redesign` (already created off main; spec committed).
- Palette: navy `#040D6D`, sky `#58ABFF`, sheet `#F4F4F4`, white cards; font `'Outfit', system-ui, sans-serif`. All copy lowercase (codebase convention).
- No new API endpoints; reuse `/api/property/invoices` and `/api/property/tenants` via `propFetch` with existing query keys.
- Voided invoices excluded from every figure. "Paid" = status `paid` or `paid_external`.
- Existing `BottomNavigation` is rendered by App.tsx — the page needs `paddingBottom: 130` clearance, nothing else.
- Do NOT stage or commit anything under `.claude-home/` — commit only the explicit files named in each task.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Verify commands: `npx tsc --noEmit` (typecheck), `npx jest client/src/lib/__tests__/property-dashboard-data.test.ts` (helpers), `npx jest` (full suite).

---

### Task 1: Data helpers (`buildBuckets`, growth, collection rate, property filter, compact formatter)

**Files:**
- Create: `client/src/lib/property-dashboard-data.ts`
- Test: `client/src/lib/__tests__/property-dashboard-data.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions over the invoice/tenant shapes already used by the property pages: `{ status, amountCents, paidAt, createdAt, propertyAddress, tenantProfileId }`, `{ id, status, propertyAddress }`).
- Produces (used by Tasks 2–3):
  - `type Timeframe = 'day' | 'week' | 'month' | 'year'`
  - `interface Bucket { label: string; valueCents: number }`
  - `buildBuckets(invoices: any[], tf: Timeframe, now?: Date): Bucket[]`
  - `periodWindow(tf: Timeframe, now?: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date }`
  - `collectedCents(invoices: any[], start: Date, end: Date): number`
  - `growthPct(current: number, previous: number): number | null`
  - `collectionRate(invoices: any[], start: Date, end: Date): number | null`
  - `filterByProperty(invoices: any[], tenants: any[], addr: string | null): { invoices: any[]; tenants: any[] }`
  - `fmtCompact(cents: number): string`

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/__tests__/property-dashboard-data.test.ts`:

```ts
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
  it('day: 8 three-hour buckets; a payment an hour ago lands in the last bucket', () => {
    const h14 = new Date(2026, 6, 2, 14, 0);
    const b = buildBuckets([paid(h14, 25000)], 'day', NOW);
    expect(b).toHaveLength(8);
    expect(b[7].valueCents).toBe(25000);
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
    expect(r.invoices.map(i => i.amountCents)).toEqual([2, 3]);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest client/src/lib/__tests__/property-dashboard-data.test.ts`
Expected: FAIL — cannot find module `../property-dashboard-data`.

- [ ] **Step 3: Write the implementation**

Create `client/src/lib/property-dashboard-data.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest client/src/lib/__tests__/property-dashboard-data.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: no new errors.

```bash
git add client/src/lib/property-dashboard-data.ts client/src/lib/__tests__/property-dashboard-data.test.ts
git commit -m "feat(property): dashboard data helpers — calendar buckets, growth, collection rate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Dashboard rewrite — hero card, property dropdown, timeframe selector, navigation skeleton

**Files:**
- Modify: `client/src/pages/property/property-dashboard.tsx` (full rewrite)

**Interfaces:**
- Consumes: everything from Task 1 (`buildBuckets`, `periodWindow`, `collectedCents`, `growthPct`, `collectionRate`, `filterByProperty`, `Timeframe`).
- Produces: page-level state `tf: Timeframe`, `propFilter: string | null`, `selBar: number`, and a `<RentBarChart buckets selectedIdx onSelectBar animKey />` slot that Task 3 fills (Task 2 renders a plain placeholder in its place). `GlowBtn` styling arrives in Task 4 — this task uses plain buttons/divs with the final layout.

- [ ] **Step 1: Replace the file**

Overwrite `client/src/pages/property/property-dashboard.tsx` with:

```tsx
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { propFetch } from "@/lib/property-api";
import {
  type Timeframe, buildBuckets, periodWindow, collectedCents,
  growthPct, collectionRate, filterByProperty, fmtCompact,
} from "@/lib/property-dashboard-data";

/* ── Design tokens ── */
const NAVY = '#040D6D';
const SKY  = '#58ABFF';
const BAR  = 'rgba(88,171,255,0.72)';   // resting bar
const SEL  = '#58ABFF';                  // selected bar (full sky)
const SHEET = '#F4F4F4';

const TIMEFRAMES: Timeframe[] = ['day', 'week', 'month', 'year'];

const fmtWhole = (c: number) => '$' + Math.round(c / 100).toLocaleString('en-NZ');

/* ── Icons ── */
const IcoPlus  = () => <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;
const IcoBell  = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2"/><path d="M5 4 3 6M19 4l2 2"/></svg>;
const IcoBill  = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>;
const IcoPeeps = () => <svg width={20} height={20} viewBox="0 0 24 24" fill={NAVY}><circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="8.5" r="2.4"/><path d="M2.6 19c0-3.2 2.6-5.6 5.9-5.6s5.9 2.4 5.9 5.6z"/><path d="M15.4 13.6c2.6.2 4.9 2.3 4.9 5.1z"/></svg>;
const IcoWarn  = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={SKY} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><circle cx="12" cy="15.8" r=".9" fill={SKY} stroke="none"/></svg>;
const IcoChev  = () => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={SKY} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>;

/* ── Property filter dropdown — wireframe pill + menu ── */
function PropertyDropdown({ options, value, onPick }: {
  options: string[]; value: string | null; onPick: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', zIndex: 20 }}>
      <button type="button" className="pd-tap" onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, background: 'transparent', border: `1.5px solid ${SKY}`, color: SKY, fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, system-ui', WebkitTapHighlightColor: 'transparent' }}>
        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value ?? 'all properties'}</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex' }}><IcoChev /></span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 200, maxHeight: 260, overflowY: 'auto', background: NAVY, border: `1.5px solid rgba(88,171,255,0.4)`, borderRadius: 16, padding: 6, boxShadow: '0 16px 40px rgba(0,0,0,0.35)' }}>
          {[null, ...options].map(opt => (
            <button key={opt ?? '__all'} type="button"
              onClick={() => { onPick(opt); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'Outfit, system-ui', fontSize: 13, fontWeight: (value ?? null) === opt ? 700 : 400, background: (value ?? null) === opt ? 'rgba(88,171,255,0.16)' : 'transparent', color: SKY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {opt ?? 'all properties'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Timeframe selector — sliding indicator, terminal SubBar pattern ── */
function TimeframeBar({ tf, onPick }: { tf: Timeframe; onPick: (t: Timeframe) => void }) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mounted = useRef(false);
  const [ind, setInd] = useState({ x: 0, w: 0, on: false });
  const [animate, setAnim] = useState(false);
  const activeIdx = TIMEFRAMES.indexOf(tf);

  useEffect(() => {
    const tick = () => {
      const el = btnRefs.current[activeIdx];
      if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth, on: true });
    };
    if (!mounted.current) {
      requestAnimationFrame(() => requestAnimationFrame(() => { tick(); mounted.current = true; }));
    } else {
      setAnim(true);
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(tick)));
      const t = setTimeout(() => setAnim(false), 520);
      return () => clearTimeout(t);
    }
  }, [activeIdx]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: NAVY, borderRadius: 999, padding: 4, boxShadow: '0 6px 18px rgba(4,13,109,0.22)' }}>
        <div className={`pd-tf-ind${animate ? ' animate' : ''}`}
          style={{ position: 'absolute', top: 4, bottom: 4, left: ind.x, width: ind.w, borderRadius: 999, background: SKY, opacity: ind.on ? 1 : 0 }} />
        {TIMEFRAMES.map((t, i) => (
          <button key={t} type="button" ref={el => (btnRefs.current[i] = el)}
            onClick={() => onPick(t)}
            style={{ position: 'relative', zIndex: 1, padding: '8px 18px', borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Outfit, system-ui', fontWeight: 600, fontSize: 12.5, textTransform: 'capitalize', color: tf === t ? NAVY : 'rgba(88,171,255,0.75)', transition: 'color 0.25s ease', WebkitTapHighlightColor: 'transparent' }}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PropertyDashboard() {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<Timeframe>('week');
  const [propFilter, setPropFilter] = useState<string | null>(null);
  const [selBar, setSelBar] = useState(-1); // -1 → default to last bucket

  const { data: tenants = [] } = useQuery<any[]>({
    queryKey: ['/api/property/tenants'],
    queryFn: () => propFetch('/api/property/tenants').then(r => { if (!r.ok) throw new Error('load failed'); return r.json(); }),
    staleTime: 60000, retry: false,
  });

  const { data: invoices = [], isLoading: invLoading, isError: invError, refetch: refetchInv } = useQuery<any[]>({
    queryKey: ['/api/property/invoices'],
    queryFn: () => propFetch('/api/property/invoices').then(r => { if (!r.ok) throw new Error('load failed'); return r.json(); }),
    staleTime: 30000, retry: false,
  });

  /* Portfolio filter, then all figures derive from the filtered sets */
  const addresses = Array.from(new Set(tenants.map((t: any) => t.propertyAddress).filter(Boolean))) as string[];
  const { invoices: fInv, tenants: fTen } = filterByProperty(invoices, tenants, propFilter);

  const win = periodWindow(tf);
  const collected = collectedCents(fInv, win.start, win.end);
  const prevCollected = collectedCents(fInv, win.prevStart, win.prevEnd);
  const growth = growthPct(collected, prevCollected);
  const rate = collectionRate(fInv, win.start, win.end);

  const buckets = buildBuckets(fInv, tf);
  const selectedIdx = selBar >= 0 && selBar < buckets.length ? selBar : buckets.length - 1;

  const activeTenants = fTen.filter((t: any) => t.status !== 'archived').length;
  const overdueCount = fInv.filter((i: any) => i.status === 'overdue').length;

  const pickTf = (t: Timeframe) => { setTf(t); setSelBar(-1); };

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: SHEET, paddingBottom: 130, fontFamily: "'Outfit', system-ui, sans-serif" }}>
        <style>{PD_CSS}</style>

        {/* ── Navy hero ── */}
        <div style={{ position: 'relative', background: NAVY, borderRadius: '0 0 28px 28px', padding: '54px 22px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PropertyDropdown options={addresses} value={propFilter} onPick={p => { setPropFilter(p); setSelBar(-1); }} />
          </div>

          {/* Load error — retry instead of silently rendering zeros */}
          {invError && (
            <div style={{ margin: '14px 0 0', padding: '12px 16px', borderRadius: 14, background: 'rgba(255,59,78,0.14)', border: '1px solid rgba(255,59,78,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#FF8A94', fontSize: 13, fontWeight: 500 }}>{invLoading ? 'loading…' : "couldn't load your data"}</span>
              <button type="button" onClick={() => refetchInv()} style={{ background: SKY, color: NAVY, border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>retry</button>
            </div>
          )}

          {/* Hero figure + growth pill */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800, fontSize: 54, color: SKY, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {fmtWhole(collected)}
            </div>
            {growth !== null && (
              <div style={{ padding: '5px 12px', borderRadius: 999, border: `1.5px solid ${SKY}`, color: SKY, fontWeight: 600, fontSize: 12.5 }}>
                {growth > 0 ? `+${growth}%` : `${growth}%`}
              </div>
            )}
          </div>
          <div style={{ marginTop: 10, color: SKY, fontWeight: 500, fontSize: 15 }}>rent collected</div>
          {rate !== null && (
            <div style={{ marginTop: 4, color: 'rgba(88,171,255,0.6)', fontWeight: 400, fontSize: 13 }}>{rate}% collection rate</div>
          )}

          {/* Chart slot — Task 3 replaces this placeholder with <RentBarChart /> */}
          <div style={{ marginTop: 22, minHeight: 220 }} />

          {/* Notch pointing at the timeframe bar */}
          <svg width="26" height="12" viewBox="0 0 26 12" style={{ position: 'absolute', left: '50%', bottom: -11, transform: 'translateX(-50%)' }}>
            <path d="M0 0h26L13 12z" fill={NAVY} />
          </svg>
        </div>

        {/* ── Timeframe selector ── */}
        <div style={{ padding: '24px 22px 0' }}>
          <TimeframeBar tf={tf} onPick={pickTf} />
        </div>

        {/* ── Stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 14, padding: '26px 22px 0' }}>
          <button type="button" className="pd-card pd-tap" onClick={() => setLocation('/property/tenants')}
            style={{ background: '#FFFFFF', borderRadius: 22, padding: '18px 18px 16px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: NAVY, letterSpacing: '0.1em', textTransform: 'uppercase' }}>tenants</div>
              <IcoPeeps />
            </div>
            <div style={{ marginTop: 22, fontWeight: 800, fontSize: 40, color: NAVY, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeTenants}</div>
          </button>
          <button type="button" className="pd-card pd-tap" onClick={() => setLocation('/property/terminal?stack=overdue')}
            style={{ background: NAVY, borderRadius: 22, padding: '18px 18px 16px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: SKY, letterSpacing: '0.1em', textTransform: 'uppercase' }}>outstanding</div>
              <IcoWarn />
            </div>
            <div style={{ marginTop: 22, fontWeight: 800, fontSize: 40, color: SKY, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{overdueCount}</div>
          </button>
        </div>

        {/* ── Action shortcuts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 12, padding: '18px 22px 0' }}>
          {[
            { label: <>set up<br />rent payment</>, Ico: IcoPlus, to: '/property/terminal?screen=tenants', aria: 'set up rent payment' },
            { label: <>send<br />reminder</>, Ico: IcoBell, to: '/property/terminal?stack=overdue&remind=1', aria: 'send reminder' },
            { label: <>send<br />expense</>, Ico: IcoBill, to: '/property/terminal?screen=bill', aria: 'send expense' },
          ].map(({ label, Ico, to, aria }) => (
            <button key={aria} type="button" className="pd-card pd-tap" aria-label={aria}
              onClick={() => setLocation(to)}
              style={{ background: '#FFFFFF', borderRadius: 18, padding: '14px 14px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 88 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Ico /></div>
              <div style={{ fontWeight: 600, fontSize: 12, color: NAVY, lineHeight: 1.3 }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Injected CSS — indicator slide (Task 4 adds hover/press-glow here) ── */
const PD_CSS = `
.pd-tf-ind.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1), width 0.45s cubic-bezier(0.34,1.56,0.64,1); }
`;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing errors elsewhere, if any, are unchanged).

- [ ] **Step 3: Run the page-import smoke tests**

Run: `npx jest client/src/pages/__tests__`
Expected: PASS — the rewritten page still imports and renders.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/property/property-dashboard.tsx
git commit -m "feat(property): dashboard rewrite — hero, property dropdown, sliding timeframe bar, stat cards, shortcuts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: RentBarChart — clickable animated SVG bars with value pill

**Files:**
- Modify: `client/src/pages/property/property-dashboard.tsx`

**Interfaces:**
- Consumes: `Bucket`, `fmtCompact` from Task 1; `buckets`, `selectedIdx`, `setSelBar`, `tf` state from Task 2.
- Produces: `RentBarChart({ buckets, selectedIdx, onSelectBar, animKey })` rendered in the hero chart slot.

**Animation approach:** Always render `MAX_SLOTS = 12` `<rect>`s. Slots `< buckets.length` are positioned by the current bucket-count layout; slots `>=` count keep their last x but collapse height to 0 at the baseline. CSS transitions on `x`/`y`/`width`/`height` (SVG2 geometry properties — supported in the Chromium/WebKit webviews this app targets) make existing bars slide/re-space, entering bars grow from the baseline, and leaving bars sink back into it. First mount grows all bars from 0 via a `reveal` flag.

- [ ] **Step 1: Add the component**

In `client/src/pages/property/property-dashboard.tsx`, add above `export default`:

```tsx
/* ── Bar chart — clickable, animates between timeframes ── */
const MAX_SLOTS = 12;

function RentBarChart({ buckets, selectedIdx, onSelectBar, animKey }: {
  buckets: { label: string; valueCents: number }[];
  selectedIdx: number;
  onSelectBar: (i: number) => void;
  animKey: string;
}) {
  const W = 375, CH = 190, LABEL_H = 30, H = CH + LABEL_H, PADX = 10, BASE = CH;
  const n = buckets.length;
  const gap = n > 8 ? 8 : 14;
  const bw = (W - PADX * 2 - gap * (n - 1)) / n;
  const x = (i: number) => PADX + i * (bw + gap);

  const [reveal, setReveal] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReveal(true), 60); return () => clearTimeout(t); }, []);

  const maxVal = Math.max(...buckets.map(b => b.valueCents), 1);
  const hOf = (v: number) => v <= 0 ? 6 : 12 + (v / maxVal) * (CH - 40);

  const sel = buckets[selectedIdx];
  const selX = x(Math.min(selectedIdx, n - 1)) + bw / 2;
  const selTop = BASE - hOf(sel?.valueCents ?? 0);

  return (
    <div style={{ position: 'relative', margin: '22px -6px 0' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto', overflow: 'visible' }}>
        {Array.from({ length: MAX_SLOTS }, (_, i) => {
          const active = i < n;
          const bh = active && reveal ? hOf(buckets[i].valueCents) : 0;
          const bx = active ? x(i) : W - PADX - bw;
          return (
            <rect key={i} className="pd-bar"
              x={bx} width={Math.max(bw, 1)}
              y={BASE - bh} height={bh}
              rx={Math.min(7, bw / 2.4)}
              fill={i === selectedIdx ? SEL : BAR}
              style={{ cursor: active ? 'pointer' : 'default', pointerEvents: active ? 'auto' : 'none' }}
              onClick={() => active && onSelectBar(i)}
            />
          );
        })}
        {buckets.map((b, i) => (
          <text key={`${animKey}-${i}`} className="pd-bar-label"
            x={x(i) + bw / 2} y={CH + 22} textAnchor="middle"
            fontFamily="Outfit, system-ui" fontWeight="600" fontSize={n > 8 ? 11 : 13} fill={SKY}>
            {b.label}
          </text>
        ))}
      </svg>
      {/* Value pill above the selected bar */}
      {sel && (
        <div key={`${animKey}-${selectedIdx}`} className="pd-bar-pill"
          style={{ position: 'absolute', left: `${(selX / W) * 100}%`, top: `${(selTop / H) * 100}%`, transform: 'translate(-50%, calc(-100% - 8px))', background: SEL, color: NAVY, padding: '5px 14px', borderRadius: 999, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgba(88,171,255,0.35)', pointerEvents: 'none' }}>
          {fmtCompact(sel.valueCents)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the hero and extend the CSS**

Replace the placeholder line

```tsx
          {/* Chart slot — Task 3 replaces this placeholder with <RentBarChart /> */}
          <div style={{ marginTop: 22, minHeight: 220 }} />
```

with

```tsx
          <RentBarChart buckets={buckets} selectedIdx={selectedIdx} onSelectBar={setSelBar} animKey={`${tf}-${propFilter ?? 'all'}`} />
```

and extend `PD_CSS` with the bar/pill/label animation rules:

```ts
const PD_CSS = `
.pd-tf-ind.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1), width 0.45s cubic-bezier(0.34,1.56,0.64,1); }
.pd-bar { transition: x 0.5s cubic-bezier(0.22,1,0.36,1), width 0.5s cubic-bezier(0.22,1,0.36,1), y 0.55s cubic-bezier(0.22,1,0.36,1), height 0.55s cubic-bezier(0.22,1,0.36,1), fill 0.25s ease; }
.pd-bar-label { animation: pdFadeIn 0.5s ease 0.25s both; }
.pd-bar-pill { animation: pdPillIn 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.2s both; }
@keyframes pdFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes pdPillIn { from { opacity: 0; transform: translate(-50%, calc(-100% - 2px)) scale(0.85); } to { opacity: 1; transform: translate(-50%, calc(-100% - 8px)) scale(1); } }
`;
```

- [ ] **Step 3: Typecheck + smoke tests**

Run: `npx tsc --noEmit` — expected: no new errors.
Run: `npx jest client/src/pages/__tests__` — expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/property/property-dashboard.tsx
git commit -m "feat(property): dashboard bar chart — clickable bars, value pill, timeframe morph animation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Micro-interactions — hover lift, drop shadow, press stroke-glow ring

**Files:**
- Modify: `client/src/pages/property/property-dashboard.tsx`

**Interfaces:**
- Consumes: the `pd-card` / `pd-tap` class names already placed on buttons in Task 2.
- Produces: final CSS; no API changes.

- [ ] **Step 1: Extend `PD_CSS` with the interaction rules**

Append to the `PD_CSS` template string (after the Task 3 rules):

```css
.pd-card { box-shadow: 0 4px 14px rgba(4,13,109,0.08); transition: transform 0.18s ease, box-shadow 0.18s ease; -webkit-tap-highlight-color: transparent; }
.pd-card:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(4,13,109,0.14); }
.pd-card:active { transform: translateY(0) scale(0.985); }
.pd-tap { position: relative; }
.pd-tap::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: 0 0 0 0 rgba(88,171,255,0); }
.pd-tap.pd-pulse::after { animation: pdRing 0.45s ease-out; }
@keyframes pdRing { 0% { box-shadow: 0 0 0 0 rgba(88,171,255,0.55); } 100% { box-shadow: 0 0 0 9px rgba(88,171,255,0); } }
```

- [ ] **Step 2: Add the press-pulse trigger**

Add this helper above `PropertyDropdown` (re-triggers the ring on every press by restarting the animation):

```tsx
/* Press → one stroke-glow ring pulse. Remove+reflow+re-add restarts the CSS animation. */
function pulse(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.classList.remove('pd-pulse');
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add('pd-pulse');
}
```

Then add `onPointerDown={pulse}` to every element that has className `pd-tap` (the dropdown trigger, both stat cards, all three action buttons), and add `className="pd-tap" onPointerDown={pulse}` to each `TimeframeBar` button.

- [ ] **Step 3: Typecheck + smoke tests**

Run: `npx tsc --noEmit` — expected: no new errors.
Run: `npx jest client/src/pages/__tests__` — expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/property/property-dashboard.tsx
git commit -m "feat(property): dashboard micro-interactions — hover lift, press stroke-glow ring

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Terminal deep links — `?screen=` / `?stack=` / `?remind=` query params

**Files:**
- Modify: `client/src/pages/property/property-terminal.tsx` (inside `PropertyTerminal`, after the `go` definition around line ~1389)

**Interfaces:**
- Consumes: existing `go(next, dir)`, `setPendingDest`, `setScreen`, `setContentKey`, `triggerConveyor`.
- Produces: state `stackFilter: StackFilter` + `setStackFilter`, `remindMode: boolean` + `setRemindMode` — consumed by Task 6. Type: `type StackFilter = 'all' | 'overdue' | 'sent' | 'paid' | 'failed'`.

- [ ] **Step 1: Add the filter/remind state and the mount effect**

Near the other `useState` declarations in `PropertyTerminal` (around line 1142, after `rowAction`), add:

```tsx
  // Active-stack status filter + reminder mode (deep-linked from the dashboard).
  const [stackFilter, setStackFilter]     = useState<'all' | 'overdue' | 'sent' | 'paid' | 'failed'>('all');
  const [remindMode, setRemindMode]       = useState(false);
```

After the `go` function definition (immediately below its closing brace, ~line 1389), add:

```tsx
  /* Dashboard deep links: ?screen=tenants|bill → jump into that flow;
     ?stack=overdue → home stack pre-filtered; &remind=1 → inline remind buttons.
     Params are consumed once, then stripped so back/refresh doesn't re-trigger. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scr = params.get('screen');
    const stack = params.get('stack');
    if (!scr && !stack) return;
    if (scr === 'tenants') {
      go('tenants');
    } else if (scr === 'bill') {
      // Mirror handleSubbarPick's no-tenant bill path: pick a tenant first, then bill.
      setPendingDest('bill');
      triggerConveyor('home', 'up');
      setContentKey(k => k + 1);
      setScreen('tenants');
    }
    if (stack === 'overdue') setStackFilter('overdue');
    if (params.get('remind') === '1') setRemindMode(true);
    window.history.replaceState({}, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (`stackFilter`/`remindMode` are unused until Task 6 — if the linter flags unused vars during this task, that's expected and resolved by Task 6; `tsc` itself doesn't error on unused locals in this config).

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/property/property-terminal.tsx
git commit -m "feat(property): terminal deep links — ?screen=tenants|bill, ?stack=overdue, ?remind=1

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Active-stack status filter chips + inline remind buttons

**Files:**
- Modify: `client/src/pages/property/property-terminal.tsx` (`RequestsHome` at line ~205, its render site at line ~1572)

**Interfaces:**
- Consumes: `stackFilter`, `setStackFilter`, `remindMode` from Task 5; existing `resendOneMutation`, `invoiceStatusFor`, `fmt`.
- Produces: `RequestsHome` gains props `{ filter, onFilter, remindMode, onRemind, remindBusyId }`.

- [ ] **Step 1: Extend `RequestsHome`**

Change the signature (line ~205) to:

```tsx
function RequestsHome({ invoices, tenants, outstanding, go, onRowTap, filter = 'all', onFilter, remindMode = false, onRemind, remindBusyId }: any) {
```

Replace the `recent` computation with:

```tsx
  const sorted = [...invoices]
    .filter((i: any) => i.status !== 'voided')
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const recent = (filter === 'all' ? sorted : sorted.filter((i: any) => invoiceStatusFor(i) === filter)).slice(0, 12);
```

Below the title row (`<div className="tp-stack-title">rent requests</div>` block), add the chip row:

```tsx
        {/* Status filter chips — deep-linkable from the dashboard */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none' as any, WebkitOverflowScrolling: 'touch' }}>
          {(['all', 'overdue', 'sent', 'paid', 'failed'] as const).map(f => (
            <button key={f} type="button" onClick={() => onFilter?.(f)}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'Outfit, system-ui', fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', background: filter === f ? NAVY : 'rgba(4,13,109,0.08)', color: filter === f ? BLUE : 'rgba(4,13,109,0.45)', transition: 'all 0.2s ease', WebkitTapHighlightColor: 'transparent' }}>
              {f}
            </button>
          ))}
        </div>
```

Change the empty state to reflect the filter:

```tsx
            {recent.length === 0 ? (
              <div className="tp-stack-empty">{filter === 'all' ? 'tap + to send a rent request' : `no ${filter} requests`}</div>
            ) : recent.map((inv: any) => {
```

Inside the row, after the price block (`<div style={{ textAlign: 'right', flexShrink: 0 }}>…</div>`), add the remind button:

```tsx
                        {(remindMode || filter === 'overdue') && st === 'overdue' && (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); onRemind?.(inv.id); }}
                            disabled={remindBusyId === inv.id}
                            style={{ marginLeft: 10, flexShrink: 0, padding: '6px 13px', borderRadius: 999, border: 'none', background: BLUE, color: NAVY, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, system-ui', opacity: remindBusyId === inv.id ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                            {remindBusyId === inv.id ? '…' : 'remind'}
                          </button>
                        )}
```

(The row content is a fragment inside an IIFE — place the button as the last sibling, after the right-aligned price `<div>`.)

- [ ] **Step 2: Pass the new props at the render site**

Change line ~1572 from:

```tsx
    if (id === 'home')     return <RequestsHome invoices={invoices} tenants={tenants} outstanding={outstanding} go={go} onRowTap={handleRowTap} />;
```

to:

```tsx
    if (id === 'home')     return <RequestsHome invoices={invoices} tenants={tenants} outstanding={outstanding} go={go} onRowTap={handleRowTap}
      filter={stackFilter} onFilter={setStackFilter} remindMode={remindMode}
      onRemind={(id: string) => resendOneMutation.mutate(id)}
      remindBusyId={resendOneMutation.isPending ? (resendOneMutation.variables as string) : null} />;
```

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit` — expected: no new errors.
Run: `npx jest` — expected: PASS (all suites, including Task 1 helpers and page smoke tests).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/property/property-terminal.tsx
git commit -m "feat(property): active-stack status filter chips + inline overdue remind buttons

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full static + unit pass**

Run: `npx tsc --noEmit && npx jest`
Expected: typecheck clean (no new errors vs main), all tests pass.

- [ ] **Step 2: Drive the app**

Start: `npm run dev` (background), then verify in a browser/screenshot pass at 430px width:

1. `/property` — hero shows collected $ for the week, growth pill (or hidden when no previous data), collection rate line, 7 bars M–S, pill on the last bar.
2. Tap bars — pill moves with pop animation; tap `month`/`year`/`day` — indicator slides with spring; bars re-space, enter/leave from the baseline.
3. `all properties` dropdown — lists distinct addresses; picking one changes every figure; picking `all properties` restores.
4. Tap `tenants` card → lands on `/property/tenants`.
5. Tap `outstanding` card → terminal home with the `overdue` chip active.
6. Tap `send reminder` → terminal home, `overdue` chip active, `remind` buttons on overdue rows; tapping one fires the resend (banner "Link resent").
7. Tap `set up rent payment` → terminal tenant-picker screen.
8. Tap `send expense` → terminal tenant-picker with bill intent (picking a tenant lands on the amount keypad → bill configurator).
9. Press-glow ring visible on stat cards / action buttons / timeframe buttons on press; hover lift on desktop.
10. Refresh the terminal after a deep link — no filter/screen re-trigger (URL params stripped).

- [ ] **Step 3: Fix anything found, re-verify, commit fixes**

Any fix commits use the same message trailer convention.
