import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { tradesFetch } from "@/lib/trades-api";
import { TRADES_THEME } from "@/lib/trades-theme";
import {
  type Timeframe, buildBuckets, periodWindow, collectedCents,
  growthPct, collectionRate, fmtCompact, currentBucketIdx,
} from "@/lib/property-dashboard-data";

/* ── Design tokens — trades palette on the property-dashboard layout.
   TRADES_THEME's final palette matches property's navy/sky family, so the
   chart accents (SEL/CYAN) carry over from the property mockup. ── */
const INK  = TRADES_THEME.INK;
const SKY  = TRADES_THEME.ACCENT;
const BAR  = TRADES_THEME.ACCENT;        // resting bar
const SEL  = '#007FFF';                  // selected bar — brighter azure (mockup)
const CYAN = '#35C0FF';                  // timeframe indicator (mockup)
const SHEET = '#F4F4F4';

const TIMEFRAMES: Timeframe[] = ['day', 'week', 'month', 'year'];

const fmtWhole = (c: number) => '$' + Math.round(c / 100).toLocaleString('en-NZ');

/* ── Icons ── */
const IcoPlus  = () => <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;
const IcoBill  = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>;
const IcoRepeat = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>;
const IcoPeeps = () => <svg width={20} height={20} viewBox="0 0 24 24" fill={INK}><circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="8.5" r="2.4"/><path d="M2.6 19c0-3.2 2.6-5.6 5.9-5.6s5.9 2.4 5.9 5.6z"/><path d="M15.4 13.6c2.6.2 4.9 2.3 4.9 5.1z"/></svg>;
const IcoWarn  = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={SKY} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><circle cx="12" cy="15.8" r=".9" fill={SKY} stroke="none"/></svg>;
const IcoChev  = () => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={SKY} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>;

/* Press → one stroke-glow ring pulse. Remove+reflow+re-add restarts the CSS animation. */
function pulse(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.classList.remove('td-pulse');
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add('td-pulse');
}

/* ── Site filter — trades' analogue of property's portfolio filter. addr=null
   → everything. Invoices missing siteAddress fall back to their client's. ── */
function filterBySite(invoices: any[], clients: any[], addr: string | null) {
  if (!addr) return { invoices, clients };
  const byId = new Map(clients.map((c: any) => [c.id, c]));
  return {
    invoices: invoices.filter((i: any) =>
      (i.siteAddress ?? byId.get(i.clientProfileId)?.siteAddress) === addr),
    clients: clients.filter((c: any) => c.siteAddress === addr),
  };
}

/* ── Site filter dropdown — wireframe pill + menu ── */
function SiteDropdown({ options, value, onPick }: {
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
      <button type="button" className="td-tap" onPointerDown={pulse} onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, background: 'transparent', border: `1.5px solid ${SKY}`, color: SKY, fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, system-ui', WebkitTapHighlightColor: 'transparent' }}>
        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value ?? 'all sites'}</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex' }}><IcoChev /></span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 200, maxHeight: 260, overflowY: 'auto', background: INK, border: `1.5px solid rgba(88,171,255,0.4)`, borderRadius: 16, padding: 6, boxShadow: '0 16px 40px rgba(0,0,0,0.35)' }}>
          {[null, ...options].map(opt => (
            <button key={opt ?? '__all'} type="button"
              onClick={() => { onPick(opt); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'Outfit, system-ui', fontSize: 13, fontWeight: (value ?? null) === opt ? 700 : 400, background: (value ?? null) === opt ? 'rgba(88,171,255,0.16)' : 'transparent', color: SKY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {opt ?? 'all sites'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Timeframe selector — sliding indicator, terminal SubBar pattern ──
   Reports the active button's viewport center-x via onIndicator so the
   hero notch can follow the selection. */
function TimeframeBar({ tf, onPick, onIndicator }: {
  tf: Timeframe; onPick: (t: Timeframe) => void;
  onIndicator?: (centerX: number, animate: boolean) => void;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mounted = useRef(false);
  const [ind, setInd] = useState({ x: 0, w: 0, on: false });
  const [animate, setAnim] = useState(false);
  const activeIdx = TIMEFRAMES.indexOf(tf);

  useEffect(() => {
    const tick = (anim: boolean) => {
      const el = btnRefs.current[activeIdx];
      if (!el) return;
      setInd({ x: el.offsetLeft, w: el.offsetWidth, on: true });
      const r = el.getBoundingClientRect();
      onIndicator?.(r.left + r.width / 2, anim);
    };
    const remeasure = () => tick(false);
    window.addEventListener('resize', remeasure);
    if (!mounted.current) {
      requestAnimationFrame(() => requestAnimationFrame(() => { tick(false); mounted.current = true; }));
      return () => window.removeEventListener('resize', remeasure);
    }
    setAnim(true);
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => tick(true))));
    const t = setTimeout(() => setAnim(false), 520);
    return () => { clearTimeout(t); window.removeEventListener('resize', remeasure); };
  }, [activeIdx]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 'min(300px, 100%)', background: INK, borderRadius: 999, padding: 3, boxShadow: '0 6px 18px rgba(4,13,109,0.22)' }}>
        <div className={`td-tf-ind${animate ? ' animate' : ''}`}
          style={{ position: 'absolute', top: 3, bottom: 3, left: ind.x, width: ind.w, borderRadius: 999, background: CYAN, opacity: ind.on ? 1 : 0 }} />
        {TIMEFRAMES.map((t, i) => (
          <button key={t} type="button" ref={el => (btnRefs.current[i] = el)}
            className="td-tap" onPointerDown={pulse}
            onClick={() => onPick(t)}
            style={{ position: 'relative', zIndex: 1, flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Outfit, system-ui', fontWeight: tf === t ? 700 : 600, fontSize: 12, textTransform: 'capitalize', color: tf === t ? INK : 'rgba(88,171,255,0.55)', transition: 'color 0.25s ease', WebkitTapHighlightColor: 'transparent' }}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Bar chart — clickable, animates between timeframes ── */
const MAX_SLOTS = 12;

function JobsBarChart({ buckets, selectedIdx, onSelectBar, animKey }: {
  buckets: { label: string; valueCents: number }[];
  selectedIdx: number;
  onSelectBar: (i: number) => void;
  animKey: string;
}) {
  const W = 375, CH = 190, LABEL_H = 30, H = CH + LABEL_H, PADX = 16, BASE = CH;
  const n = buckets.length;
  const gap = n > 8 ? 10 : 24;
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
            <rect key={i} className="td-bar"
              x={bx} width={Math.max(bw, 1)}
              y={BASE - bh} height={bh}
              rx={bw / 2}
              fill={i === selectedIdx ? SEL : BAR}
              style={{ cursor: active ? 'pointer' : 'default', pointerEvents: active ? 'auto' : 'none' }}
              onClick={() => active && onSelectBar(i)}
            />
          );
        })}
        {buckets.map((b, i) => (
          <text key={`${animKey}-${i}`} className="td-bar-label"
            x={x(i) + bw / 2} y={CH + 22} textAnchor="middle"
            fontFamily="Outfit, system-ui" fontWeight="600" fontSize={n > 8 ? 11 : 13} fill={SKY}>
            {b.label}
          </text>
        ))}
      </svg>
      {/* Value pill above the selected bar */}
      {sel && (
        <div key={`${animKey}-${selectedIdx}`} className="td-bar-pill"
          style={{ position: 'absolute', left: `${(selX / W) * 100}%`, top: `${(selTop / H) * 100}%`, transform: 'translate(-50%, calc(-100% - 8px))', background: SEL, color: INK, padding: '5px 14px', borderRadius: 999, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgba(0,127,255,0.35)', pointerEvents: 'none' }}>
          {fmtCompact(sel.valueCents)}
        </div>
      )}
    </div>
  );
}

export default function TradesDashboard() {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<Timeframe>('week');
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [selBar, setSelBar] = useState(-1); // -1 → default to last bucket
  const colRef = useRef<HTMLDivElement>(null);
  const [notch, setNotch] = useState<{ x: number; anim: boolean } | null>(null);

  // Notch follows the active timeframe button (x is relative to the column).
  const handleIndicator = (centerX: number, anim: boolean) => {
    const col = colRef.current?.getBoundingClientRect();
    if (col) setNotch({ x: centerX - col.left, anim });
  };

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/clients'],
    queryFn: () => tradesFetch('/api/trades/clients').then(r => { if (!r.ok) throw new Error('load failed'); return r.json(); }),
    staleTime: 60000, retry: false,
  });

  const { data: invoices = [], isLoading: invLoading, isError: invError, refetch: refetchInv } = useQuery<any[]>({
    queryKey: ['/api/trades/invoices'],
    queryFn: () => tradesFetch('/api/trades/invoices').then(r => { if (!r.ok) throw new Error('load failed'); return r.json(); }),
    staleTime: 30000, retry: false,
  });

  /* Site filter, then all figures derive from the filtered sets */
  const sites = Array.from(new Set(clients.map((c: any) => c.siteAddress).filter(Boolean))) as string[];
  const { invoices: fInv, clients: fCli } = filterBySite(invoices, clients, siteFilter);

  const win = periodWindow(tf);
  const collected = collectedCents(fInv, win.start, win.end);
  const prevCollected = collectedCents(fInv, win.prevStart, win.prevEnd);
  const growth = growthPct(collected, prevCollected);
  const rate = collectionRate(fInv, win.start, win.end);

  const buckets = buildBuckets(fInv, tf);
  const selectedIdx = selBar >= 0 && selBar < buckets.length
    ? selBar
    : Math.min(currentBucketIdx(tf), buckets.length - 1);

  const activeClients = fCli.filter((c: any) => c.status !== 'archived').length;
  const overdueCount = fInv.filter((i: any) => i.status === 'overdue').length;

  const pickTf = (t: Timeframe) => { setTf(t); setSelBar(-1); };

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
      <div ref={colRef} style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: SHEET, paddingBottom: 130, fontFamily: "'Outfit', system-ui, sans-serif" }}>
        <style>{TD_CSS}</style>

        {/* ── Ink hero ── */}
        <div style={{ position: 'relative', background: INK, borderRadius: '0 0 28px 28px', padding: '54px 22px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SiteDropdown options={sites} value={siteFilter} onPick={s => { setSiteFilter(s); setSelBar(-1); }} />
          </div>

          {/* Load error — retry instead of silently rendering zeros */}
          {invError && (
            <div style={{ margin: '14px 0 0', padding: '12px 16px', borderRadius: 14, background: 'rgba(255,59,78,0.14)', border: '1px solid rgba(255,59,78,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#FF8A94', fontSize: 13, fontWeight: 500 }}>{invLoading ? 'loading…' : "couldn't load your data"}</span>
              <button type="button" onClick={() => refetchInv()} style={{ background: SKY, color: INK, border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>retry</button>
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
          <div style={{ marginTop: 10, color: SKY, fontWeight: 500, fontSize: 15 }}>revenue collected</div>
          {rate !== null && (
            <div style={{ marginTop: 4, color: 'rgba(88,171,255,0.6)', fontWeight: 400, fontSize: 13 }}>{rate}% collection rate</div>
          )}

          <JobsBarChart buckets={buckets} selectedIdx={selectedIdx} onSelectBar={setSelBar} animKey={`${tf}-${siteFilter ?? 'all'}`} />

          {/* Notch — rounded wave flowing out of the hero, follows the active timeframe */}
          <svg width="84" height="14" viewBox="0 0 84 14"
            className={notch?.anim ? 'td-notch animate' : 'td-notch'}
            style={{ position: 'absolute', left: notch ? notch.x : '50%', bottom: -13, transform: 'translateX(-50%)' }}>
            <path d="M0 0 C 20 0 26 13 42 13 C 58 13 64 0 84 0 Z" fill={INK} />
          </svg>
        </div>

        {/* ── Timeframe selector ── */}
        <div style={{ padding: '15px 22px 0' }}>
          <TimeframeBar tf={tf} onPick={pickTf} onIndicator={handleIndicator} />
        </div>

        {/* ── Stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 14, padding: '26px 22px 0' }}>
          <button type="button" className="td-card td-tap" onPointerDown={pulse} onClick={() => setLocation('/trades/clients')}
            style={{ background: '#FFFFFF', borderRadius: 22, padding: '16px 18px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: INK, letterSpacing: '0.08em', textTransform: 'uppercase' }}>clients</div>
              <IcoPeeps />
            </div>
            <div style={{ marginTop: 10, fontWeight: 800, fontSize: 42, color: INK, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeClients}</div>
          </button>
          <button type="button" className="td-card td-tap" onPointerDown={pulse} onClick={() => setLocation('/trades/terminal')}
            style={{ background: INK, borderRadius: 22, padding: '16px 18px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: SKY, letterSpacing: '0.08em', textTransform: 'uppercase' }}>outstanding</div>
              <IcoWarn />
            </div>
            <div style={{ marginTop: 10, fontWeight: 800, fontSize: 42, color: SKY, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{overdueCount}</div>
          </button>
        </div>

        {/* ── Action shortcuts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 12, padding: '18px 22px 0' }}>
          {[
            { label: <>new<br />quote</>, Ico: IcoPlus, to: '/trades/quote', aria: 'new quote' },
            { label: <>quick<br />invoice</>, Ico: IcoBill, to: '/trades/terminal', aria: 'quick invoice' },
            { label: <>recurring<br />jobs</>, Ico: IcoRepeat, to: '/trades/recurring', aria: 'recurring jobs' },
          ].map(({ label, Ico, to, aria }) => (
            <button key={aria} type="button" className="td-card td-tap" aria-label={aria}
              onPointerDown={pulse} onClick={() => setLocation(to)}
              style={{ background: '#FFFFFF', borderRadius: 18, padding: '14px 14px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 88 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Ico /></div>
              <div style={{ fontWeight: 600, fontSize: 12, color: INK, lineHeight: 1.3 }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Injected CSS — mirrors the property dashboard's PD_CSS in trades tokens ── */
const TD_CSS = `
.td-tf-ind.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1), width 0.45s cubic-bezier(0.34,1.56,0.64,1); }
.td-notch.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1); }
.td-bar { transition: x 0.5s cubic-bezier(0.22,1,0.36,1), width 0.5s cubic-bezier(0.22,1,0.36,1), y 0.55s cubic-bezier(0.22,1,0.36,1), height 0.55s cubic-bezier(0.22,1,0.36,1), fill 0.25s ease; }
.td-bar-label { animation: tdFadeIn 0.5s ease 0.25s both; }
.td-bar-pill { animation: tdPillIn 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.2s both; }
@keyframes tdFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes tdPillIn { from { opacity: 0; transform: translate(-50%, calc(-100% - 2px)) scale(0.85); } to { opacity: 1; transform: translate(-50%, calc(-100% - 8px)) scale(1); } }
.td-card { box-shadow: 0 4px 14px rgba(4,13,109,0.08); transition: transform 0.18s ease, box-shadow 0.18s ease; -webkit-tap-highlight-color: transparent; }
.td-card:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(4,13,109,0.14); }
.td-card:active { transform: translateY(0) scale(0.985); }
.td-tap { position: relative; }
.td-tap::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: 0 0 0 0 rgba(88,171,255,0); }
.td-tap.td-pulse::after { animation: tdRing 0.45s ease-out; }
@keyframes tdRing { 0% { box-shadow: 0 0 0 0 rgba(88,171,255,0.55); } 100% { box-shadow: 0 0 0 9px rgba(88,171,255,0); } }
`;
