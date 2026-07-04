import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentMerchantId } from "@/lib/auth";
import {
  type Timeframe, buildBuckets, buildBilledBuckets, periodWindow, collectedCents,
  growthPct, fmtCompact, currentBucketIdx,
} from "@/lib/property-dashboard-data";

/* ── Design tokens — retail palette on the property-dashboard layout ── */
const BLUE = '#0055FF';                  // retail base (property's navy)
const TEAL = '#00E5CC';                  // retail accent (property's sky)
const BAR  = '#00E5CC';                  // resting bar
const SEL  = '#FFFFFF';                  // selected bar — white pops on the blue hero
const SHEET = '#F4F4F4';

const TIMEFRAMES: Timeframe[] = ['day', 'week', 'month', 'year'];

const fmtWhole = (c: number) => '$' + Math.round(c / 100).toLocaleString('en-NZ');

/* ── Icons ── */
const IcoPlus  = () => <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;
const IcoBox   = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>;
const IcoList  = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 16.5V11"/><path d="M12 16.5V7.5"/><path d="M16 16.5v-3.5"/></svg>;
const IcoTag   = () => <svg width={20} height={20} viewBox="0 0 24 24" fill={BLUE}><path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2c.5 0 1 .2 1.4.6zM7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>;
const IcoWarn  = () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><circle cx="12" cy="15.8" r=".9" fill={TEAL} stroke="none"/></svg>;

/* Press → one stroke-glow ring pulse. Remove+reflow+re-add restarts the CSS animation. */
function pulse(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.classList.remove('rd-pulse');
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add('rd-pulse');
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
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 'min(300px, 100%)', background: BLUE, borderRadius: 999, padding: 3, boxShadow: '0 6px 18px rgba(0,85,255,0.22)' }}>
        <div className={`rd-tf-ind${animate ? ' animate' : ''}`}
          style={{ position: 'absolute', top: 3, bottom: 3, left: ind.x, width: ind.w, borderRadius: 999, background: TEAL, opacity: ind.on ? 1 : 0 }} />
        {TIMEFRAMES.map((t, i) => (
          <button key={t} type="button" ref={el => (btnRefs.current[i] = el)}
            className="rd-tap" onPointerDown={pulse}
            onClick={() => onPick(t)}
            style={{ position: 'relative', zIndex: 1, flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Outfit, system-ui', fontWeight: tf === t ? 700 : 600, fontSize: 12, textTransform: 'capitalize', color: tf === t ? BLUE : 'rgba(0,229,204,0.55)', transition: 'color 0.25s ease', WebkitTapHighlightColor: 'transparent' }}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Bar chart — clickable, animates between timeframes ── */
const MAX_SLOTS = 12;

function SalesBarChart({ buckets, billed = [], selectedIdx, onSelectBar, animKey }: {
  buckets: { label: string; valueCents: number }[];
  billed?: { label: string; valueCents: number }[];
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

  // Both series share one scale so ghost (pending) and solid (completed) compare truthfully.
  const maxVal = Math.max(...buckets.map(b => b.valueCents), ...billed.map(b => b.valueCents), 1);
  const hOf = (v: number) => v <= 0 ? 6 : 12 + (v / maxVal) * (CH - 40);

  const sel = buckets[selectedIdx];
  const selX = x(Math.min(selectedIdx, n - 1)) + bw / 2;
  const selTop = BASE - hOf(sel?.valueCents ?? 0);

  return (
    <div style={{ position: 'relative', margin: '22px -6px 0' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto', overflow: 'visible' }}>
        {/* Ghost bars — wireframe outline of pending/processing sales not yet completed. */}
        {billed.map((b, i) => {
          if (i >= n || b.valueCents <= (buckets[i]?.valueCents ?? 0)) return null;
          const gh = reveal ? hOf(b.valueCents) : 0;
          return (
            <rect key={`g${animKey}-${i}`} className="rd-bar"
              x={x(i) + 0.75} width={Math.max(bw - 1.5, 1)}
              y={BASE - gh} height={gh}
              rx={(bw - 1.5) / 2}
              fill="none" stroke={BAR} strokeWidth={1.5} opacity={0.45}
              style={{ pointerEvents: 'none' }}
            />
          );
        })}
        {Array.from({ length: MAX_SLOTS }, (_, i) => {
          const active = i < n;
          const bh = active && reveal ? hOf(buckets[i].valueCents) : 0;
          const bx = active ? x(i) : W - PADX - bw;
          return (
            <rect key={i} className="rd-bar"
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
          <text key={`${animKey}-${i}`} className="rd-bar-label"
            x={x(i) + bw / 2} y={CH + 22} textAnchor="middle"
            fontFamily="Outfit, system-ui" fontWeight="600" fontSize={n > 8 ? 11 : 13} fill={TEAL}>
            {b.label}
          </text>
        ))}
      </svg>
      {/* Value pill above the selected bar */}
      {sel && (
        <div key={`${animKey}-${selectedIdx}`} className="rd-bar-pill"
          style={{ position: 'absolute', left: `${(selX / W) * 100}%`, top: `${(selTop / H) * 100}%`, transform: 'translate(-50%, calc(-100% - 8px))', background: SEL, color: BLUE, padding: '5px 14px', borderRadius: 999, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgba(255,255,255,0.3)', pointerEvents: 'none' }}>
          {fmtCompact(sel.valueCents)}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<Timeframe>('week');
  const [selBar, setSelBar] = useState(-1); // -1 → default to last bucket
  const colRef = useRef<HTMLDivElement>(null);
  const [notch, setNotch] = useState<{ x: number; anim: boolean } | null>(null);
  const merchantId = getCurrentMerchantId();

  useEffect(() => {
    if (!merchantId) setLocation('/login');
  }, [merchantId, setLocation]);

  // Notch follows the active timeframe button (x is relative to the column).
  const handleIndicator = (centerX: number, anim: boolean) => {
    const col = colRef.current?.getBoundingClientRect();
    if (col) setNotch({ x: centerX - col.left, anim });
  };

  const { data: merchant } = useQuery<any>({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
    enabled: !!merchantId,
  });

  const { data: transactions = [], isLoading: txLoading, isError: txError, refetch: refetchTx } = useQuery<any[]>({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
    staleTime: 30000, retry: false,
    enabled: !!merchantId,
  });

  if (!merchantId) return null;

  /* Adapt sales to the shared invoice-shaped helpers: a completed transaction
     is a "paid invoice" collected at its createdAt; price is dollars. */
  const sales = transactions.map((tx: any) => ({
    status: tx.status === 'completed' ? 'paid' : tx.status,
    createdAt: tx.createdAt,
    paidAt: tx.createdAt,
    amountCents: Math.round(parseFloat(tx.price ?? '0') * 100),
  }));

  const win = periodWindow(tf);
  const collected = collectedCents(sales, win.start, win.end);
  const prevCollected = collectedCents(sales, win.prevStart, win.prevEnd);
  const growth = growthPct(collected, prevCollected);

  const buckets = buildBuckets(sales, tf);
  const billedBuckets = buildBilledBuckets(sales, tf);
  const selectedIdx = selBar >= 0 && selBar < buckets.length
    ? selBar
    : Math.min(currentBucketIdx(tf), buckets.length - 1);

  const salesCount = sales.filter((s: any) =>
    s.status === 'paid' && new Date(s.paidAt) >= win.start && new Date(s.paidAt) < win.end).length;
  const activeCount = transactions.filter((tx: any) => tx.status === 'pending' || tx.status === 'processing').length;

  const pickTf = (t: Timeframe) => { setTf(t); setSelBar(-1); };

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
      <div ref={colRef} style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: SHEET, paddingBottom: 130, fontFamily: "'Outfit', system-ui, sans-serif" }}>
        <style>{RD_CSS}</style>

        {/* ── Blue hero ── */}
        <div style={{ position: 'relative', background: BLUE, borderRadius: '0 0 28px 28px', padding: '54px 22px 30px' }}>

          {/* Load error — retry instead of silently rendering zeros */}
          {txError && (
            <div style={{ margin: '14px 0 0', padding: '12px 16px', borderRadius: 14, background: 'rgba(255,59,78,0.14)', border: '1px solid rgba(255,59,78,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#FF8A94', fontSize: 13, fontWeight: 500 }}>{txLoading ? 'loading…' : "couldn't load your data"}</span>
              <button type="button" onClick={() => refetchTx()} style={{ background: TEAL, color: BLUE, border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>retry</button>
            </div>
          )}

          {/* Hero figure + growth pill */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800, fontSize: 54, color: TEAL, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {fmtWhole(collected)}
            </div>
            {growth !== null && (
              <div style={{ padding: '5px 12px', borderRadius: 999, border: `1.5px solid ${TEAL}`, color: TEAL, fontWeight: 600, fontSize: 12.5 }}>
                {growth > 0 ? `+${growth}%` : `${growth}%`}
              </div>
            )}
          </div>
          <div style={{ marginTop: 10, color: TEAL, fontWeight: 500, fontSize: 15 }}>sales revenue</div>
          <div style={{ marginTop: 4, color: 'rgba(0,229,204,0.6)', fontWeight: 400, fontSize: 13 }}>{salesCount} completed sale{salesCount !== 1 ? 's' : ''}</div>

          <SalesBarChart buckets={buckets} billed={billedBuckets} selectedIdx={selectedIdx} onSelectBar={setSelBar} animKey={tf} />

          {/* Notch — rounded wave flowing out of the hero, follows the active timeframe */}
          <svg width="84" height="14" viewBox="0 0 84 14"
            className={notch?.anim ? 'rd-notch animate' : 'rd-notch'}
            style={{ position: 'absolute', left: notch ? notch.x : '50%', bottom: -13, transform: 'translateX(-50%)' }}>
            <path d="M0 0 C 20 0 26 13 42 13 C 58 13 64 0 84 0 Z" fill={BLUE} />
          </svg>
        </div>

        {/* ── Timeframe selector ── */}
        <div style={{ padding: '15px 22px 0' }}>
          <TimeframeBar tf={tf} onPick={pickTf} onIndicator={handleIndicator} />
        </div>

        {/* Pending account banner */}
        {merchant && merchant.status !== 'active' && (
          <div style={{ margin: '18px 22px 0', padding: '12px 16px', borderRadius: 16, background: '#FFFBEB', border: '1px solid #FCD34D', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, lineHeight: '18px' }}>⏳</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#92400E' }}>Account pending activation</div>
              <div style={{ fontWeight: 400, fontSize: 11.5, color: '#B45309', marginTop: 2, lineHeight: 1.4 }}>
                Your account is being reviewed and connected to our payment network. You can set up your business details in Settings while you wait. We'll notify you once you're live.
              </div>
            </div>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 14, padding: '26px 22px 0' }}>
          <button type="button" className="rd-card rd-tap" onPointerDown={pulse} onClick={() => setLocation('/transactions')}
            style={{ background: '#FFFFFF', borderRadius: 22, padding: '16px 18px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: BLUE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>sales</div>
              <IcoTag />
            </div>
            <div style={{ marginTop: 10, fontWeight: 800, fontSize: 42, color: BLUE, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{salesCount}</div>
          </button>
          <button type="button" className="rd-card rd-tap" onPointerDown={pulse} onClick={() => setLocation('/transactions')}
            style={{ background: BLUE, borderRadius: 22, padding: '16px 18px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: TEAL, letterSpacing: '0.08em', textTransform: 'uppercase' }}>active</div>
              <IcoWarn />
            </div>
            <div style={{ marginTop: 10, fontWeight: 800, fontSize: 42, color: TEAL, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeCount}</div>
          </button>
        </div>

        {/* ── Action shortcuts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 12, padding: '18px 22px 0' }}>
          {[
            { label: <>new<br />sale</>, Ico: IcoPlus, to: '/terminal', aria: 'new sale' },
            { label: <>manage<br />stock</>, Ico: IcoBox, to: '/stock', aria: 'manage stock' },
            { label: <>view<br />sales</>, Ico: IcoList, to: '/transactions', aria: 'view sales' },
          ].map(({ label, Ico, to, aria }) => (
            <button key={aria} type="button" className="rd-card rd-tap" aria-label={aria}
              onPointerDown={pulse} onClick={() => setLocation(to)}
              style={{ background: '#FFFFFF', borderRadius: 18, padding: '14px 14px 12px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, system-ui', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 88 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Ico /></div>
              <div style={{ fontWeight: 600, fontSize: 12, color: BLUE, lineHeight: 1.3 }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Injected CSS — mirrors the property dashboard's PD_CSS in retail colors ── */
const RD_CSS = `
.rd-tf-ind.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1), width 0.45s cubic-bezier(0.34,1.56,0.64,1); }
.rd-notch.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1); }
.rd-bar { transition: x 0.5s cubic-bezier(0.22,1,0.36,1), width 0.5s cubic-bezier(0.22,1,0.36,1), y 0.55s cubic-bezier(0.22,1,0.36,1), height 0.55s cubic-bezier(0.22,1,0.36,1), fill 0.25s ease; }
.rd-bar-label { animation: rdFadeIn 0.5s ease 0.25s both; }
.rd-bar-pill { animation: rdPillIn 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.2s both; }
@keyframes rdFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes rdPillIn { from { opacity: 0; transform: translate(-50%, calc(-100% - 2px)) scale(0.85); } to { opacity: 1; transform: translate(-50%, calc(-100% - 8px)) scale(1); } }
.rd-card { box-shadow: 0 4px 14px rgba(0,85,255,0.08); transition: transform 0.18s ease, box-shadow 0.18s ease; -webkit-tap-highlight-color: transparent; }
.rd-card:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(0,85,255,0.14); }
.rd-card:active { transform: translateY(0) scale(0.985); }
.rd-tap { position: relative; }
.rd-tap::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: 0 0 0 0 rgba(0,229,204,0); }
.rd-tap.rd-pulse::after { animation: rdRing 0.45s ease-out; }
@keyframes rdRing { 0% { box-shadow: 0 0 0 0 rgba(0,229,204,0.55); } 100% { box-shadow: 0 0 0 9px rgba(0,229,204,0); } }
`;
