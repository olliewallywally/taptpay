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
