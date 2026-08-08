/**
 * Scene: overview (story zone "intro") — §4.1
 *
 * Shows the current mobile home language and briefly introduces Property,
 * Trades and Retail. This is an overview, not a transaction. It must finish in
 * the Property context so the hand-off into weekly rent reads as one motion.
 *
 * Milestones:
 *   0  home surface at rest
 *   1  Property highlighted
 *   2  Trades highlighted
 *   3  Retail highlighted
 *   4  settled back on Property, ready to hand off to weekly rent
 *
 * §4.1's fourth beat is "Retail highlighted, settling back to Property" — two
 * pictures, so `steps` is 5 rather than the stub's 4. Without the extra frame
 * the intro ends on Retail and the hand-off into the rent scene doesn't read.
 *
 * The surface is the merchant home the bottom nav's home tab opens. All three
 * verticals ship the same page — property-dashboard.tsx, trades-dashboard.tsx
 * and dashboard.tsx are structurally identical and differ only in palette,
 * figures, captions and dock items — so switching vertical here is exactly what
 * the real app does when the merchant changes mode.
 */
import type { ReactNode } from 'react';
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, NAVY, OFFW, WHITE } from '../tokens';
import { Screen } from '../primitives';

/* ── colours the demo needs that aren't shared tokens ───────────────────────
   The retail home is the one merchant surface on its own palette
   (client/src/pages/dashboard.tsx), and the floating dock is a darker navy
   than the page navy (components/bottom-navigation.tsx). Both by value. */
const RETAIL_BASE = '#0055FF';
const RETAIL_ACCENT = '#00E5CC';
const DOCK = '#02093D';
const alpha = (hex: string, a: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/* ── dock icons (components/bottom-navigation.tsx, by path) ─────────────── */
const nav = (d: ReactNode, c: string): JSX.Element => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const NavIc = {
  home: (c: string) => nav(<><path d="M3 9.5L12 3l9 6.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20V9.5z" /><path d="M9 21.5V14h6v7.5" /></>, c),
  person: (c: string) => nav(<><circle cx="12" cy="7.5" r="4" /><path d="M3.5 21c0-4 3.8-7 8.5-7s8.5 3 8.5 7" /></>, c),
  box: (c: string) => nav(<><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>, c),
  terminal: (c: string) => (
    <svg width={22} height={22} viewBox="0 0 32 22" fill="none" aria-hidden>
      <path d="M4 4l6 7-6 7" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 18h13" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  ),
  analytics: (c: string) => nav(<><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 16.5V11" /><path d="M12 16.5V7.5" /><path d="M16 16.5v-3.5" /></>, c),
  settings: (c: string) => nav(<><circle cx="12" cy="12" r="2.6" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>, c),
};

/* Shortcut-card icons. */
const card = (d: ReactNode, c: string, sw = 1.9): JSX.Element => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const CardIc = {
  plus: (c: string) => card(<path d="M12 5v14M5 12h14" />, c, 2.2),
  bell: (c: string) => card(<><circle cx="12" cy="13" r="7" /><path d="M12 10v3l2 2" /><path d="M5 4 3 6M19 4l2 2" /></>, c),
  bill: (c: string) => card(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>, c),
  repeat: (c: string) => card(<><path d="M17 2l3 3-3 3" /><path d="M3 11V9a4 4 0 014-4h13" /><path d="M7 22l-3-3 3-3" /><path d="M21 13v2a4 4 0 01-4 4H4" /></>, c),
  box: (c: string) => card(<><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>, c),
  list: (c: string) => card(<><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 16.5V11" /><path d="M12 16.5V7.5" /><path d="M16 16.5v-3.5" /></>, c),
  people: (c: string) => card(<><circle cx="9" cy="7.5" r="3.2" /><circle cx="16.5" cy="8.5" r="2.4" /><path d="M3 19c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6" /><path d="M16 13.6c2.6.2 4.9 2.3 4.9 5.1" /></>, c),
  warn: (c: string) => card(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5" /><path d="M12 15.8h.01" /></>, c, 1.8),
};

/* ── the three verticals ────────────────────────────────────────────────────
   Figures are the demo's own; they belong beside the §4 fixtures rather than
   in a scene file, and are flagged for promotion into fixtures.ts. */
type Vertical = {
  id: string;
  base: string;
  accent: string;
  hero: string;
  heroLabel: string;
  heroSub: string;
  growth: string;
  bars: number[];
  peak: string;
  stats: [string, string, (c: string) => JSX.Element][];
  actions: [string, string, (c: string) => JSX.Element][];
  dock: ((c: string) => JSX.Element)[];
};

const DAYS = ['m', 't', 'w', 't', 'f', 's', 's'];
const CORE_DOCK = [NavIc.home, NavIc.person, NavIc.terminal, NavIc.analytics, NavIc.settings];

const VERTICALS: Vertical[] = [
  {
    id: 'property',
    base: NAVY,
    accent: BLUE,
    hero: '$4,860',
    heroLabel: 'rent collected',
    heroSub: '94% collection rate',
    growth: '+12%',
    bars: [0.42, 0.61, 0.35, 0.78, 1, 0.24, 0.5],
    peak: '$1.2k',
    stats: [['tenants', '12', CardIc.people], ['outstanding', '2', CardIc.warn]],
    actions: [['set up\nrent payment', 'set up rent payment', CardIc.plus], ['send\nreminder', 'send reminder', CardIc.bell], ['send\nexpense', 'send expense', CardIc.bill]],
    dock: CORE_DOCK,
  },
  {
    id: 'trades',
    base: NAVY,
    accent: BLUE,
    hero: '$9,240',
    heroLabel: 'revenue collected',
    heroSub: '88% collection rate',
    growth: '+21%',
    bars: [0.3, 0.86, 0.52, 0.44, 0.95, 0.68, 0.18],
    peak: '$2.4k',
    stats: [['clients', '24', CardIc.people], ['outstanding', '3', CardIc.warn]],
    actions: [['new\nquote', 'new quote', CardIc.plus], ['quick\ninvoice', 'quick invoice', CardIc.bill], ['recurring\njobs', 'recurring jobs', CardIc.repeat]],
    dock: CORE_DOCK,
  },
  {
    id: 'retail',
    base: RETAIL_BASE,
    accent: RETAIL_ACCENT,
    hero: '$3,180',
    heroLabel: 'sales revenue',
    heroSub: '42 completed sales',
    growth: '+8%',
    bars: [0.55, 0.4, 0.72, 0.31, 0.88, 1, 0.63],
    peak: '$780',
    stats: [['sales', '42', CardIc.list], ['active', '3', CardIc.warn]],
    actions: [['new\nsale', 'new sale', CardIc.plus], ['manage\nstock', 'manage stock', CardIc.box], ['view\nsales', 'view sales', CardIc.list]],
    dock: [NavIc.home, NavIc.box, NavIc.terminal, NavIc.analytics, NavIc.settings],
  },
];

/** Which vertical each milestone shows. Beat 4 settles back on Property. */
const AT_STEP = [0, 0, 1, 2, 0];

/* ── the home surface ───────────────────────────────────────────────────── */

/** The dashboards' bar chart: rounded bars on a fixed 375-wide viewBox with the
 *  weekday row beneath and a value pill over the tallest bar. */
function Bars({ v }: { v: Vertical }) {
  const W = 375, CH = 150, H = CH + 28, PADX = 16, GAP = 24;
  const n = v.bars.length;
  const bw = (W - PADX * 2 - GAP * (n - 1)) / n;
  const hOf = (f: number) => 20 + f * (CH - 34);
  const peak = v.bars.reduce((best, f, i) => (f > v.bars[best] ? i : best), 0);
  const peakX = ((PADX + peak * (bw + GAP) + bw / 2) / W) * 100;
  const peakY = ((CH - hOf(v.bars[peak])) / H) * 100;
  return (
    <div style={{ position: 'relative', margin: '14px -6px 0' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto', overflow: 'visible' }} aria-hidden>
        {v.bars.map((f, i) => {
          const bh = hOf(f);
          return <rect key={i} className="lp-t" x={PADX + i * (bw + GAP)} width={bw} y={CH - bh} height={bh} rx={bw / 2} fill={i === peak ? WHITE : v.accent} />;
        })}
        {DAYS.map((d, i) => (
          <text key={i} x={PADX + i * (bw + GAP) + bw / 2} y={CH + 21} textAnchor="middle" fontFamily="Outfit, system-ui" fontWeight="600" fontSize={13} fill={v.accent}>{d}</text>
        ))}
      </svg>
      {/* value pill over the selected bar — the dashboards' resting state picks
          the current bucket, so one bar is always highlighted and labelled */}
      <div className="lp-t" style={{ position: 'absolute', left: `${peakX}%`, top: `${peakY}%`, transform: 'translate(-50%, calc(-100% - 8px))', background: WHITE, color: v.base, padding: '4px 12px', borderRadius: 999, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', boxShadow: `0 6px 16px ${alpha(v.base, 0.35)}` }}>
        {v.peak}
      </div>
    </div>
  );
}

function Dashboard({ v, step }: { v: Vertical; step: number }) {
  const dim = alpha(v.accent, 0.6);
  const sheetInk = v.id === 'retail' ? RETAIL_BASE : NAVY;
  const dock = v.id === 'trades' ? { bg: NAVY, on: OFFW, off: 'rgba(244,244,244,0.5)' } : { bg: DOCK, on: BLUE, off: 'rgba(88,171,255,0.45)' };

  return (
    <Screen background={OFFW}>
      {/* hero */}
      <div className="lp-t" style={{ position: 'relative', background: v.base, borderRadius: '0 0 28px 28px', padding: '46px 22px 26px', flexShrink: 0 }}>
        {/* vertical switcher — at rest none is lit; the story lights one per beat */}
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            {VERTICALS.map((o) => {
              const on = o.id === v.id && step > 0;
              return (
                <div key={o.id} className="lp-pill lp-t" style={{ background: on ? v.accent : 'transparent', color: on ? v.base : v.accent, boxShadow: on ? 'none' : `inset 0 0 0 1.5px ${alpha(v.accent, 0.5)}`, fontWeight: on ? 600 : 400 }}>
                  {o.id}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="lp-t" style={{ fontWeight: 800, fontSize: 54, color: v.accent, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v.hero}</div>
          <div style={{ padding: '5px 12px', borderRadius: 999, border: `1.5px solid ${v.accent}`, color: v.accent, fontWeight: 600, fontSize: 12.5 }}>{v.growth}</div>
        </div>
        <div style={{ marginTop: 10, color: v.accent, fontWeight: 500, fontSize: 15 }}>{v.heroLabel}</div>
        <div style={{ marginTop: 4, color: dim, fontWeight: 400, fontSize: 13 }}>{v.heroSub}</div>

        <Bars v={v} />

        {/* notch — the rounded wave flowing out of the hero */}
        <svg width="84" height="14" viewBox="0 0 84 14" style={{ position: 'absolute', left: '50%', bottom: -13, transform: 'translateX(-50%)' }} aria-hidden>
          <path d="M0 0 C 20 0 26 13 42 13 C 58 13 64 0 84 0 Z" fill={v.base} />
        </svg>
      </div>

      {/* timeframe */}
      <div style={{ padding: '15px 22px 0', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 300, background: v.base, borderRadius: 999, padding: 3, boxShadow: `0 6px 18px ${alpha(v.base, 0.22)}` }}>
          {['day', 'week', 'month', 'year'].map((t) => {
            const on = t === 'week';
            return (
              <div key={t} className="lp-t" style={{ flex: 1, padding: '7px 0', textAlign: 'center', borderRadius: 999, background: on ? v.accent : 'transparent', fontWeight: on ? 700 : 600, fontSize: 12, color: on ? v.base : alpha(v.accent, 0.55) }}>{t}</div>
            );
          })}
        </div>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 14, padding: '22px 22px 0', flexShrink: 0 }}>
        {v.stats.map(([label, value, Icon], i) => {
          const solid = i === 1;
          const fg = solid ? v.accent : v.base;
          return (
            <div key={label} className="lp-t" style={{ background: solid ? v.base : WHITE, borderRadius: 22, padding: '14px 18px', boxShadow: `0 4px 14px ${alpha(v.base, 0.08)}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: fg, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
                {Icon(fg)}
              </div>
              <div style={{ marginTop: 8, fontWeight: 800, fontSize: 42, color: fg, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            </div>
          );
        })}
      </div>

      {/* shortcuts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 12, padding: '16px 22px 0', flexShrink: 0 }}>
        {v.actions.map(([label, aria, Icon]) => (
          <div key={aria} className="lp-t" style={{ background: WHITE, borderRadius: 18, padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 84, boxShadow: `0 4px 14px ${alpha(v.base, 0.08)}` }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{Icon(sheetInk)}</div>
            <div style={{ fontWeight: 600, fontSize: 12, color: sheetInk, lineHeight: 1.3, whiteSpace: 'pre-line' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* floating dock */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 20, display: 'flex', justifyContent: 'center', zIndex: 30 }}>
        <div style={{ position: 'relative', width: 280, height: 48, background: dock.bg, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 16px', boxSizing: 'border-box' }}>
          <div className="lp-t" style={{ position: 'absolute', left: 8, top: -5, width: 65, height: 58, background: dock.bg, borderRadius: 29, boxShadow: '0 4px 20px rgba(0,0,0,0.45)' }} />
          {v.dock.map((Icon, i) => (
            <div key={i} className="lp-t" style={{ position: 'relative', zIndex: 1, padding: 8, display: 'flex', transform: i === 0 ? 'scale(1.15)' : 'none' }}>
              {Icon(i === 0 ? dock.on : dock.off)}
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}

function Overview({ step }: SceneProps) {
  const v = VERTICALS[AT_STEP[Math.min(step, AT_STEP.length - 1)] ?? 0];
  return <Dashboard v={v} step={step} />;
}

export const overviewScene: SceneDefinition = {
  id: 'overview',
  steps: 5,
  label: 'taptpay home, showing property, trades and retail',
  Component: Overview,
};
