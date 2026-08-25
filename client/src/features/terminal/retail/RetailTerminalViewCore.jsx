import { useState, useEffect, useRef } from "react";
import { setDockCollapse } from "@/features/navigation/dock-collapse-store";
import { SegmentedBar } from "../SegmentedBar";
import { useMeasuredChromeGutter } from "../useMeasuredChromeGutter";
import { useFitTerminalAmounts } from "../useFitTerminalAmounts";

const NAVY = '#040D6D';
const BLUE = '#58ABFF';
const OFFW = '#F4F4F4';
const GREEN = '#1BBF85';
const fmt = c => `$${(c / 100).toFixed(2)}`;

const Amount = ({ value, authoredSize, style, ...props }) => (
  <div
    {...props}
    className="tp-amount"
    style={{
      ...style,
      '--amount-authored': `${authoredSize}px`,
      '--amount-chars': Math.max(String(value).length, 1),
    }}
  >
    {value}
  </div>
);

const requestShare = async (onShare, intent, toast, successMessage) => {
  try {
    await onShare?.(intent);
    if (successMessage) toast(successMessage);
  } catch {
    toast('share failed');
  }
};

const STOCK_ITEMS = [
  { id: 's1', name: 'honey latte',  amount: 699  },
  { id: 's2', name: 'berry muffin', amount: 1200 },
  { id: 's3', name: 'flat white',   amount: 550  },
  { id: 's4', name: 'cappuccino',   amount: 575  },
  { id: 's5', name: 'croissant',    amount: 480  },
  { id: 's6', name: 'bacon & eggs', amount: 1285 },
  { id: 's7', name: 'choc cookie',  amount: 350  },
  { id: 's8', name: 'orange juice', amount: 650  },
  { id: 's9', name: 'green tea',    amount: 480  },
];

const SCREEN_TO_SUBBAR = { stock: 0, split: 1, share: 2, cash: 3 };
const SUBBAR_ROUTE = { 0: 'stock', 1: 'split', 2: 'share', 3: 'cash' };

/* ═══ ICONS ═══ */
const Ic = {
  X:        ({ sz = 18, sw = 2.4 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/></svg>,
  Check:    ({ sz = 20, sw = 2.4 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Plus:     ({ sz = 28, sw = 3   }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/></svg>,
  Minus:    ({ sz = 22, sw = 3   }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/></svg>,
  Back:     ({ sz = 22           }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ChevR:    ({ sz = 16, sw = 2.2 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Arrow:    ()                       => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="8" x2="13" y2="8"/><polyline points="9,4 13,8 9,12"/></svg>,
  Expand:   ({ sz = 15 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
  Pencil:   ({ sz = 16, sw = 1.8 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  Trash:    ({ sz = 16, sw = 1.8 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>,
  Mail:     ({ sz = 20, c = 'currentColor' }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>,
  Msg:      ({ sz = 20, c = 'currentColor' }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  DL:       ({ sz = 20, c = 'currentColor' }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  Grid:     ({ sz = 20, c }) => <svg width={sz} height={sz} viewBox="0 0 20 20" fill={c}><rect x="1" y="1" width="7" height="7" rx="2"/><rect x="12" y="1" width="7" height="7" rx="2"/><rect x="1" y="12" width="7" height="7" rx="2"/><rect x="12" y="12" width="7" height="7" rx="2"/></svg>,
  Split:    ({ sz = 20, c }) => <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><line x1="10" y1="3" x2="10" y2="10"/><path d="M10 10Q10 14 5 17"/><path d="M10 10Q10 14 15 17"/><circle cx="10" cy="3" r="1.5" fill={c} stroke="none"/><circle cx="5" cy="17" r="1.5" fill={c} stroke="none"/><circle cx="15" cy="17" r="1.5" fill={c} stroke="none"/></svg>,
  Share:    ({ sz = 20, c }) => <svg width={sz} height={sz} viewBox="0 0 20 20" fill={c}><circle cx="14" cy="4" r="2.5"/><circle cx="14" cy="16" r="2.5"/><circle cx="5" cy="10" r="2.5"/><rect x="6.5" y="5.5" width="6" height="1.8" rx="0.9" transform="rotate(-25 9.5 6.5)"/><rect x="6.5" y="12.5" width="6" height="1.8" rx="0.9" transform="rotate(25 9.5 13.5)"/></svg>,
  Coins:    ({ sz = 20, c }) => <svg width={sz} height={sz} viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><line x1="10" y1="2" x2="10" y2="18"/><path d="M14 5.5C14 5.5 12.5 4 10 4C7.5 4 5.5 5.5 5.5 7C5.5 8.5 7 9.5 10 10C13 10.5 14.5 11.5 14.5 13C14.5 14.5 12.5 16 10 16C7.5 16 6 14.5 6 14.5"/></svg>,
  DkHome:   ({ sz = 22, c }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20V9.5z"/><path d="M9 21.5V14h6v7.5"/></svg>,
  DkCat:    ({ sz = 22, c }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.7" stroke={c} strokeWidth="1.7"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.7" stroke={c} strokeWidth="1.7"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.7" stroke={c} strokeWidth="1.7"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.7" stroke={c} strokeWidth="1.7"/></svg>,
  DkTerm:   ({ sz = 22, c }) => <svg width={sz} height={sz} viewBox="0 0 32 22" fill="none"><path d="M4 4l6 7-6 7" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 18h13" stroke={c} strokeWidth="2.6" strokeLinecap="round"/></svg>,
  DkAnal:   ({ sz = 22, c }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke={c} strokeWidth="1.7"/><path d="M8 16.5V11" stroke={c} strokeWidth="1.7" strokeLinecap="round"/><path d="M12 16.5V7.5" stroke={c} strokeWidth="1.7" strokeLinecap="round"/><path d="M16 16.5v-3.5" stroke={c} strokeWidth="1.7" strokeLinecap="round"/></svg>,
  DkSet:    ({ sz = 22, c }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.6"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  QRBig:    ({ sz = 140 }) => (
    <svg width={sz} height={sz} viewBox="0 0 100 100" fill="none">
      <path d="M8,22 L8,8 L22,8"   stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M78,8 L92,8 L92,22" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8,78 L8,92 L22,92" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M78,92 L92,92 L92,78" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="20" y="20" width="22" height="22" rx="4" fill={BLUE}/>
      <rect x="58" y="20" width="22" height="22" rx="4" fill={BLUE}/>
      <rect x="20" y="58" width="22" height="22" rx="4" fill={BLUE}/>
      <rect x="58" y="58" width="9"  height="9"  rx="1.5" fill={BLUE}/>
      <rect x="71" y="58" width="9"  height="9"  rx="1.5" fill={BLUE}/>
      <rect x="58" y="71" width="9"  height="9"  rx="1.5" fill={BLUE}/>
      <rect x="71" y="71" width="9"  height="9"  rx="1.5" fill={BLUE}/>
    </svg>
  ),
};

/* ═══ SUBBAR ═══ */
const SUBBAR_ITEMS = [
  { id: 'stock', label: 'stock', Icon: Ic.Grid  },
  { id: 'split', label: 'split', Icon: Ic.Split },
  { id: 'share', label: 'share', Icon: Ic.Share },
  { id: 'cash',  label: 'cash',  Icon: Ic.Coins },
];

/* Phase B of docs/PLAN-2026-08-17-terminal-panels-and-dock.md replaced the
   hand-tuned bottom paddings this helper covered with .tp-panel's own
   padding-bottom (terminal-tokens.css), which reads --dock-h directly. */

function SubBar({ activeIdx = -1, onPick, compact = false }) {
  return <SegmentedBar items={SUBBAR_ITEMS} activeIdx={activeIdx} onPick={onPick}
    compact={compact} activeColor={BLUE} inactiveColor="rgba(4,13,109,0.55)"
    demoIdPrefix="retail-mode" iconSize={20} />;
}

function SendBtn({ onClick }) {
  return (
    <button className="tp-send tap-target" onClick={onClick} aria-label="send" data-demo-id="retail-create-sale">
      <span className="tp-send-circle"><Ic.Arrow /></span>
      <span className="tp-send-label">send</span>
    </button>
  );
}

function FabBtn({ onClick }) {
  return (
    <button className="tp-fab" onClick={onClick} aria-label="add item" data-demo-id="retail-add-sale">
      <Ic.Plus sz={30} />
    </button>
  );
}

const DOCK_ITEMS = [
  { id: 'home',      img: '/dock-home.png'      },
  { id: 'stock',     img: '/dock-option.png'    },
  { id: 'terminal',  img: '/dock-terminal.png'  },
  { id: 'analytics', img: '/dock-analytics.png' },
  { id: 'settings',  img: '/dock-settings.png'  },
];
/* CSS filter that turns pure-black PNG icons → #58ABFF light-blue */
const DOCK_FILTER_ACTIVE  = 'brightness(0) saturate(100%) invert(68%) sepia(45%) saturate(762%) hue-rotate(183deg) brightness(103%)';
const DOCK_FILTER_DIMMED  = 'brightness(0) saturate(100%) invert(68%) sepia(45%) saturate(762%) hue-rotate(183deg) brightness(103%) opacity(0.45)';

function Dock({ active = 'terminal', onPick }) {
  const trackRef   = useRef(null);
  const btnRefs    = useRef([]);
  const mountedRef = useRef(false);
  const [left, setLeft]       = useState(0);
  const [animate, setAnimate] = useState(false);

  const calcLeft = idx => {
    const btn = btnRefs.current[idx], tr = trackRef.current;
    if (!btn || !tr) return 0;
    const b = btn.getBoundingClientRect(), t = tr.getBoundingClientRect();
    return b.left - t.left + b.width / 2 - 32.5;
  };

  useEffect(() => {
    const idx = Math.max(0, DOCK_ITEMS.findIndex(i => i.id === active));
    if (!mountedRef.current) {
      setLeft(calcLeft(idx));
      requestAnimationFrame(() => { mountedRef.current = true; });
    } else {
      setAnimate(true);
      setLeft(calcLeft(idx));
      const t = setTimeout(() => setAnimate(false), 550);
      return () => clearTimeout(t);
    }
  }, [active]);

  return (
    <div className="tp-dock-wrap">
      <div className="tp-dock" ref={trackRef}>
        <div className={`tp-dock-ind${animate ? ' animate' : ''}`} style={{ left }} />
        {DOCK_ITEMS.map(({ id, img }, i) => {
          const isActive = active === id;
          return (
            <button key={id} ref={el => (btnRefs.current[i] = el)}
              className={`tp-dock-btn${isActive ? ' active' : ''}`}
              onClick={() => onPick?.(id)} aria-label={id}>
              <img src={img} alt={id} width={22} height={22}
                style={{ filter: isActive ? DOCK_FILTER_ACTIVE : DOCK_FILTER_DIMMED, display: 'block', objectFit: 'contain' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubHead({ onCancel, onCommit, demoScope, demoCommitId }) {
  return (
    <div className="tp-subhead">
      <button className="tp-subhead-btn" onClick={onCancel} aria-label="cancel" data-demo-id="retail-cancel"><Ic.X /></button>
      <button className="tp-subhead-btn" onClick={onCommit} aria-label="commit" data-demo-id={demoCommitId || (demoScope ? `${demoScope}-confirm` : undefined)}><Ic.Check /></button>
    </div>
  );
}

function StackHeader({ onExpand }) {
  return (
    <div className="tp-stack-hdr">
      <div className="tp-stack-title">active stack</div>
      <button className="tap-target" onClick={onExpand} data-demo-id="retail-stack-expand" aria-label="expand active stack" style={{ color: BLUE, display: 'flex', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}><Ic.ChevR /></button>
    </div>
  );
}

function ActiveStack({ items, status = 'awaiting payment', onItemClick, onRowClick }) {
  return (
      <div className="tp-stack-card">
        {items.length === 0 ? (
          <div className="tp-stack-empty">tap + to add an item</div>
        ) : items.map(it => {
          const st = it.status || status;
          const isHold = st === 'hold'; // demo-mode hold-and-resume

          const dotCls =
            st === 'paid'             ? 'paid' :
            st === 'declined'         ? 'declined' :
            st === 'processing'       ? 'payment-sent' :
            st === 'awaiting payment' ? 'awaiting' :
            st === 'hold'             ? 'hold' :
            st === 'sent'             ? 'paid' :
            'awaiting';

          // Three ways a tile is a split:
          //  1. splitEnabled=true  → merchant flagged it, customer hasn't set up yet
          //  2. isSplit=true       → customer called /split and set it up
          //  3. totalSplits>1      → the only field that is guaranteed >1 after createBillSplit
          //                          (covers old transactions where splitEnabled stayed false)
          const isSplitTx  = !!(it.splitEnabled || it.isSplit || (it.totalSplits > 1));
          const splitSetup = (it.totalSplits ?? 0) > 1;
          const allPaid    = splitSetup && (it.completedSplits ?? 0) >= (it.totalSplits ?? 1);

          return (
            <div key={it.id} className={`tp-stack-row${isHold ? ' holdable' : ''}`} data-demo-id={`retail-stack-${it.id}`} onClick={() => { if (isHold) onItemClick?.(it); }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tp-stack-name">{it.name}</div>
                {isSplitTx ? (
                  <div className="tp-stack-split">
                    <span className="tp-stack-split-label">split bill</span>
                    {splitSetup ? (
                      <>
                        <div className="tp-stack-split-bars">
                          {Array.from({ length: it.totalSplits }).map((_, i) => (
                            <div key={i} className={`tp-split-bar${i < (it.completedSplits ?? 0) ? ' filled' : ''}`} />
                          ))}
                        </div>
                        <div className="tp-stack-split-dots">
                          {Array.from({ length: it.totalSplits }).map((_, i) => (
                            <div key={i} className={`tp-split-dot${i < (it.completedSplits ?? 0) ? ' filled' : ''}`} />
                          ))}
                        </div>
                        <span className="tp-stack-split-count">
                          {allPaid ? 'all paid' : `${it.completedSplits ?? 0} of ${it.totalSplits} paid`}
                        </span>
                      </>
                    ) : (
                      <span className="tp-stack-split-count">awaiting customer setup</span>
                    )}
                  </div>
                ) : (
                  <div className="tp-stack-meta">
                    <span className={`tp-dot ${dotCls}`} />
                    <span className="tp-stack-status">{st}</span>
                    {isHold && <span className="tp-hold-hint">tap to resume</span>}
                  </div>
                )}
              </div>
              <div className="tp-stack-price">{fmt(it.amount)}</div>
            </div>
          );
        })}
    </div>
  );
}

/* ═══ TOP BANNER (success notification) ═══ */
function TopBanner({ notification }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!notification) return;
    setShow(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 4200);
    return () => clearTimeout(timerRef.current);
  }, [notification?.id ?? notification]);

  return (
    <div className={`tp-top-banner${show ? ' show' : ''}`}>
      <div className="tp-banner-icon"><Ic.Check sz={20} sw={3} /></div>
      <div className="tp-banner-body">
        <div className="tp-banner-title">{notification?.message || 'Payment Received'}</div>
        {notification?.amount && <div className="tp-banner-amount">${notification.amount}</div>}
      </div>
    </div>
  );
}

/* ═══════════════ SCREENS ═══════════════ */

function MainTerminal({ state, go, paywaveOn, togglePaywave, onItemClick, showPaywave, onExpand, onRowClick }) {
  const total = state.items.reduce((s, i) => s + i.amount, 0);
  const line  = state.items.map(i => i.name).join(', ');
  return (
    <div className="tp-screen tp-home">
      <div className="stagger tp-home-hero" style={{ background: NAVY, padding: 'clamp(52px, 11svh, 100px) 28px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        <Amount value={fmt(total)} authoredSize={88} style={{ color: BLUE }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          {showPaywave && (
            <button className={`tp-pill tap-target${paywaveOn ? ' solid' : ' outline'}`} onClick={togglePaywave} data-demo-id="retail-paywave">paywave</button>
          )}
          <button className="tp-pill outline tap-target" style={{ marginLeft: 10 }} onClick={() => go('boards')} data-demo-id="retail-boards">boards</button>
        </div>
        <div style={{ marginTop: 33, color: BLUE, fontWeight: 500, fontSize: 18 }}>{line || 'no items yet'}</div>
      </div>
      <div className="tp-home-chrome" aria-hidden="true" />
      <div className="stagger tp-home-stack" style={{ background: OFFW, padding: '0 22px' }}>
        <StackHeader onExpand={onExpand} />
        <div className="tp-stack-scroll" style={{ flex: 1, overflow: 'auto', paddingRight: 2 }}>
          <ActiveStack items={state.sent || []} status="sent" onItemClick={onItemClick} onRowClick={onRowClick} />
        </div>
      </div>
    </div>
  );
}

function PendingTerminal({ state, go, paywaveOn, togglePaywave, onItemClick, showPaywave, onExpand, onRowClick }) {
  const pending = state.pending;
  const total   = pending?.amount || 0;
  return (
    <div className="tp-screen tp-home">
      <div className="stagger tp-home-hero" style={{ background: NAVY, padding: 'clamp(52px, 11svh, 100px) 28px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', position: 'relative' }}>
        <button onClick={() => go('cancel')} aria-label="cancel transaction" style={{ position: 'absolute', top: 18, left: 20, width: 44, height: 44, borderRadius: 999, border: 'none', color: NAVY, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 120ms, opacity 120ms' }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onMouseUp={e => e.currentTarget.style.transform = ''}
          onMouseLeave={e => e.currentTarget.style.transform = ''}
          onTouchStart={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onTouchEnd={e => e.currentTarget.style.transform = ''}
        ><Ic.X sz={16} sw={2.4} /></button>
        <Amount value={fmt(total)} authoredSize={88} style={{ color: BLUE }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          {showPaywave && (
            <button className={`tp-pill tap-target${paywaveOn ? ' solid' : ' outline'}`} onClick={togglePaywave} data-demo-id="retail-paywave">paywave</button>
          )}
          <button className="tp-pill outline tap-target" style={{ marginLeft: 10 }} onClick={() => go('boards')} data-demo-id="retail-boards">boards</button>
        </div>
        <div style={{ marginTop: 33, fontWeight: 500, fontSize: 18, color: BLUE, lineHeight: 1.25 }}>
          {pending?.name || '—'}
          <div style={{ marginTop: 6, color: '#fff', fontWeight: 600, fontSize: 14 }}>tap send to share payment</div>
        </div>
      </div>
      <div className="tp-home-chrome" aria-hidden="true" />
      <div className="stagger tp-home-stack" style={{ background: OFFW, padding: '0 22px' }}>
        <StackHeader onExpand={onExpand} />
        <div className="tp-stack-scroll" style={{ flex: 1, overflow: 'auto', paddingRight: 2 }}>
          <ActiveStack items={state.sent || []} status="sent" onItemClick={onItemClick} onRowClick={onRowClick} />
        </div>
      </div>
    </div>
  );
}

function Keypad({ state, go, onCommit }) {
  const [digits, setDigits] = useState('');
  const [splitOn, setSplitOn] = useState(false);
  const cents = parseInt(digits || '0', 10);
  const press = d => { if (digits.length < 7) setDigits(p => p === '' && d === '0' ? '' : p + d); };
  const back  = () => setDigits(p => p.slice(0, -1));
  const commit = () => { if (cents === 0) return; onCommit(cents, splitOn); };
  const handleSplit = () => { setSplitOn(s => !s); };

  return (
    <div className="tp-screen tp-feature" style={{ background: NAVY }}>
      <div className="stagger tp-hero" style={{ background: OFFW, color: NAVY, display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} demoScope="retail-keypad" />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Amount value={fmt(cents)} authoredSize={88} data-demo-id="retail-amount" style={{ color: cents === 0 ? 'rgba(4,13,109,0.32)' : NAVY, marginTop: 18 }} />
          <button className="tp-pill" data-demo-id="retail-split-toggle" style={{ alignSelf: 'flex-start', padding: '8px 16px', background: splitOn ? NAVY : 'transparent', color: splitOn ? BLUE : NAVY, boxShadow: splitOn ? 'none' : `inset 0 0 0 1px rgba(4,13,109,0.5)`, transition: 'background 0.18s ease, color 0.18s ease' }} onClick={handleSplit}>split bill</button>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger tp-panel" style={{ background: NAVY }}>
        <div className="tp-panel-body" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--sp-3)', alignItems: 'center', justifyItems: 'center', alignContent: 'center' }}>
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} className="tp-kp" data-demo-id={`retail-key-${d}`} onClick={() => press(d)}>{d}</button>
          ))}
          <button className="tp-kp outline" data-demo-id="retail-key-decimal">·</button>
          <button className="tp-kp" data-demo-id="retail-key-0" onClick={() => press('0')}>0</button>
          <button className="tp-kp outline" data-demo-id="retail-key-back" aria-label="delete digit" onClick={back}><Ic.Back /></button>
        </div>
        </div>
      </div>
    </div>
  );
}

function SplitPayment({ state, go, onCommitSplit }) {
  const total = state.pending?.amount || state.items.reduce((s, i) => s + i.amount, 0) || 0;
  const [parts, setParts] = useState(2);
  const partAmount = Math.round(total / parts);

  const commit = () => {
    if (total === 0) return;
    // Use the real item name and send the TOTAL price — the split setup page
    // handles dividing it. splitEnabled flags this for the split payment flow.
    const name = state.pending?.name || state.items.map(i => i.name).join(', ') || 'split bill';
    onCommitSplit({ name, amount: total, splitEnabled: true, splitParts: parts });
  };

  return (
    <div className="tp-screen tp-feature" style={{ background: NAVY }}>
      <div className="stagger tp-hero" style={{ background: OFFW, color: NAVY, display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} demoScope="retail-split" />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Amount value={fmt(partAmount)} authoredSize={88} style={{ textAlign: 'center' }} />
          <div style={{ marginTop: 18, textAlign: 'center', fontWeight: 500, fontSize: 19, color: NAVY, lineHeight: 1.4 }}>
            payment 1/{parts}<br />total: {fmt(total)}
          </div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger tp-panel" style={{ background: NAVY, color: BLUE }}>
        <div className="tp-panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>split bill</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
          <button className="tp-stepper" data-demo-id="retail-split-decrease" aria-label="decrease split" onClick={() => setParts(p => Math.max(2, p - 1))}><Ic.Minus /></button>
          <Amount value={parts} authoredSize={88} data-demo-id={parts === 4 ? 'retail-split-four' : `retail-split-${parts}`} style={{ color: BLUE, fontWeight: 900 }} />
          <button className="tp-stepper" data-demo-id="retail-split-increase" aria-label="increase split" onClick={() => setParts(p => Math.min(12, p + 1))}><Ic.Plus sz={22} /></button>
        </div>
        <button onClick={() => go('keypad')} style={{ color: BLUE, fontWeight: 500, fontSize: 16, textDecoration: 'underline', textUnderlineOffset: 4, marginBottom: 22, background: 'none', border: 'none', cursor: 'pointer' }}>enter amount</button>
        <button className="tp-cta" data-demo-id="retail-split-commit" onClick={commit}>confirm</button>
        </div>
      </div>
    </div>
  );
}

/* picks is Map<stockId, qty> */
function ChooseStock({ state, go, onCommitStock }) {
  const total = state.items.reduce((s, i) => s + i.amount, 0) || 0;
  const [picks, setPicks] = useState(new Map());
  const scrollRef = useRef(null);
  const [scrolling, setScrolling] = useState(false);
  const stRef = useRef(null);

  const tap = id => setPicks(prev => {
    const n = new Map(prev);
    n.set(id, (n.get(id) || 0) + 1);
    return n;
  });

  const totalPicks = [...picks.values()].reduce((s, q) => s + q, 0);

  const commit = () => {
    if (!picks.size) return;
    const selected = STOCK_ITEMS.filter(s => picks.has(s.id)).map(s => ({ ...s, qty: picks.get(s.id) }));
    onCommitStock(selected);
  };

  return (
    <div className="tp-screen tp-feature" style={{ background: NAVY }}>
      <div className="stagger tp-hero" style={{ background: OFFW, color: NAVY, display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} demoScope="retail-stock" />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', alignItems: 'center' }}>
          <Amount value={fmt(total)} authoredSize={88} />
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger tp-panel" style={{ background: NAVY }}>
        <div className="tp-panel-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ color: BLUE, fontWeight: 500, fontSize: 18, textAlign: 'center', flexShrink: 0 }}>choose from stock</div>
        <div
          ref={scrollRef}
          className={`tp-thin-scroll${scrolling ? ' scrolling' : ''}`}
          onScroll={() => { setScrolling(true); clearTimeout(stRef.current); stRef.current = setTimeout(() => setScrolling(false), 800); }}
          style={{ marginTop: 14, flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4, minHeight: 0 }}
        >
          {STOCK_ITEMS.map(s => {
            const qty = picks.get(s.id) || 0;
            return (
              <button key={s.id} className={`tp-stock-tile${qty > 0 ? ' selected' : ''}`} data-demo-id={`retail-stock-${s.name.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`} onClick={() => tap(s.id)}
                style={{ position: 'relative', padding: 10, textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                {qty > 0 && (
                  <div className="tp-stock-qty">{qty}</div>
                )}
                <div style={{ fontWeight: 700, fontSize: 13, color: NAVY, lineHeight: 1.15 }}>{s.name}</div>
                <div style={{ fontWeight: 500, fontSize: 12, color: BLUE }}>{fmt(s.amount)}</div>
              </button>
            );
          })}
        </div>
        <div style={{ flexShrink: 0, padding: '12px 0 20px', display: 'flex', justifyContent: 'center' }}>
          <button className="tp-cta" data-demo-id="retail-stock-commit" onClick={commit}>
            confirm{totalPicks > 0 ? ` · ${totalPicks}` : ''}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

function EnterDetails({ state, go, onCommitDetails, initialAmount = 0 }) {
  const [name, setName]     = useState('');
  const [amount, setAmount] = useState(initialAmount ? (initialAmount / 100).toFixed(2) : '');
  const [desc, setDesc]     = useState('');
  const [qty, setQty]       = useState(1);
  const centsPreview = Math.round(parseFloat(amount || '0') * 100) * qty;

  const commit = () => {
    const cents = Math.round(parseFloat(amount || '0') * 100);
    if (!name || cents === 0) return;
    onCommitDetails({ name: qty > 1 ? `${name} x${qty}` : name, amount: cents * qty });
  };

  return (
    <div className="tp-screen tp-feature" style={{ background: NAVY }}>
      <div className="stagger tp-hero" style={{ background: OFFW, color: NAVY, display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} demoScope="retail-details" />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', alignItems: 'center' }}>
          <Amount value={fmt(centsPreview || initialAmount)} authoredSize={88} />
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger tp-panel" style={{ background: NAVY }}>
        <div className="tp-panel-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="tp-thin-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ color: BLUE, fontWeight: 500, fontSize: 18, textAlign: 'center' }}>enter transaction details</div>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="tp-field" data-demo-id="retail-item-name" placeholder="item name"   value={name}   onChange={e => setName(e.target.value)} />
          <input className="tp-field" data-demo-id="retail-amount" placeholder="amount"      value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g,''))} inputMode="decimal" />
          <input className="tp-field" data-demo-id="retail-description" placeholder="description" value={desc}   onChange={e => setDesc(e.target.value)} />
        </div>
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 20 }}>quantity</div>
          <button className="tp-stepper" data-demo-id="retail-quantity-decrease" aria-label="decrease quantity" style={{ width: 32, height: 32 }} onClick={() => setQty(q => Math.max(1, q-1))}><Ic.Minus sz={14} sw={3.5} /></button>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 22, minWidth: 22, textAlign: 'center' }}>{qty}</div>
          <button className="tp-stepper" data-demo-id="retail-quantity-increase" aria-label="increase quantity" style={{ width: 32, height: 32 }} onClick={() => setQty(q => Math.min(99, q+1))}><Ic.Plus sz={14} sw={3.5} /></button>
        </div>
        </div>
        <div style={{ flexShrink: 0, paddingTop: 12, display: 'flex', justifyContent: 'center' }}><button className="tp-cta" onClick={commit}>confirm</button></div>
        </div>
      </div>
    </div>
  );
}

function CashEntry({ go, onCommitCash }) {
  const [name, setName]     = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc]     = useState('');
  const [qty, setQty]       = useState(1);
  const cents = Math.round(parseFloat(amount || '0') * 100);

  const commit = () => {
    if (!name || cents === 0) return;
    onCommitCash({ name: qty > 1 ? `${name} x${qty}` : name, amount: cents * qty });
  };

  return (
    <div className="tp-screen tp-feature" style={{ background: NAVY }}>
      <div className="stagger tp-hero" style={{ background: OFFW, color: NAVY, display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} demoScope="retail-cash" />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', alignItems: 'center' }}>
          <Amount value={fmt(cents * qty)} authoredSize={88} />
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger tp-panel" style={{ background: NAVY }}>
        <div className="tp-panel-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="tp-thin-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ color: BLUE, fontWeight: 500, fontSize: 18, textAlign: 'center' }}>cash payment</div>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="tp-field" data-demo-id="retail-cash-item-name" placeholder="item name"   value={name}   onChange={e => setName(e.target.value)} />
          <input className="tp-field" data-demo-id="retail-cash-amount" placeholder="amount"      value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
          <input className="tp-field" data-demo-id="retail-cash-description" placeholder="description" value={desc}   onChange={e => setDesc(e.target.value)} />
        </div>
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 20 }}>quantity</div>
          <button className="tp-stepper" style={{ width: 32, height: 32 }} onClick={() => setQty(q => Math.max(1, q - 1))}><Ic.Minus sz={14} sw={3.5} /></button>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 22, minWidth: 22, textAlign: 'center' }}>{qty}</div>
          <button className="tp-stepper" style={{ width: 32, height: 32 }} onClick={() => setQty(q => Math.min(99, q + 1))}><Ic.Plus sz={14} sw={3.5} /></button>
        </div>
        </div>
        <div style={{ flexShrink: 0, paddingTop: 12, display: 'flex', justifyContent: 'center' }}>
          <button className="tp-cta" data-demo-id="retail-cash-sale" onClick={commit}>confirm</button>
        </div>
        </div>
      </div>
    </div>
  );
}

function SharePayment({ state, go, toast, onShare, onExpandQR, onConfirmPayment, livePayLink, qrElement }) {
  const total = state.pending?.amount || state.items.reduce((s, i) => s + i.amount, 0) || 0;
  const payLink = livePayLink || 'https://pay.taptpay.com/p/demo-abc123';
  const share = (channel, successMessage) => requestShare(onShare, {
    kind: 'payment',
    channel,
    url: payLink,
    amountCents: state.pending?.amount || total,
    label: state.pending?.name || 'payment',
  }, toast, successMessage);

  const handleConfirm = onConfirmPayment || (() => { toast('payment confirmed'); go('cash'); });

  return (
    <div className="tp-screen tp-feature" data-demo-id="retail-share" style={{ background: NAVY }}>
      <div className="stagger tp-hero" style={{ background: OFFW, color: NAVY, display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={handleConfirm} demoScope="retail-share" />
        <div style={{ flex: 1, padding: '8px 28px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <Amount value={fmt(state.pending?.amount || total)} authoredSize={76} />
          <div style={{ marginTop: 16, fontWeight: 500, fontSize: 18, lineHeight: 1.4 }}>
            {state.pending?.name || 'payment'}
          </div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger tp-panel" style={{ background: NAVY }}>
        <div className="tp-panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
        <div style={{ position: 'relative' }}>
          <div className="tp-qr-card">
            <Ic.QRBig sz={150} />
          </div>
          <button className="tp-qr-expand" onClick={onExpandQR} aria-label="expand QR code">
            <Ic.Expand sz={14} />
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
          <button className="tp-cta" style={{ minWidth: 180 }} onClick={() => share('copy', 'link copied')}>copy link</button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '8px 20px', borderRadius: 999, border: `1px solid rgba(88,171,255,0.5)`, minWidth: 180 }}>
            <button className="tp-share-btn" onClick={() => share('download-qr', 'QR downloaded')} aria-label="download QR"><Ic.DL sz={20} c={BLUE} /></button>
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            <button className="tp-share-btn" onClick={() => share('sms', null)} aria-label="share via SMS"><Ic.Msg sz={20} c={BLUE} /></button>
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            <button className="tp-share-btn" onClick={() => share('email', null)} aria-label="share via email"><Ic.Mail sz={20} c={BLUE} /></button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function CashSuccess({ state, go, setState, toast, onShare }) {
  const total = state.pending?.amount || state.items.reduce((s, i) => s + i.amount, 0) || 0;
  const clear = () => { setState(s => ({ ...s, items: [], pending: null })); go('home-pop'); };
  const share = (channel, successMessage) => requestShare(onShare, {
    kind: 'receipt',
    channel,
    url: 'https://pay.taptpay.com/p/demo-abc123',
    amountCents: total,
    label: state.pending?.name || 'cash payment',
  }, toast, successMessage);

  return (
    <div className="tp-screen tp-feature" data-demo-id="retail-cash-success" style={{ background: NAVY }}>
      <div className="stagger tp-hero" style={{ background: OFFW, color: NAVY, display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={clear} onCommit={clear} demoScope="retail-cash-success" />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Amount value={fmt(total)} authoredSize={88} />
          <div style={{ marginTop: 22, fontWeight: 700, fontSize: 22 }}>cash payment</div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger tp-panel" style={{ background: NAVY }}>
        <div className="tp-panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
        <div style={{ color: BLUE, fontWeight: 900, fontSize: 46, letterSpacing: '-0.04em' }}>success</div>
        <div className="tp-success-check tp-pulse" style={{ marginTop: 10 }}><Ic.Check sz={40} sw={3.2} /></div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
          <button className="tp-cta" style={{ minWidth: 180 }} onClick={() => share('copy', 'receipt link copied')}>copy receipt link</button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '8px 20px', borderRadius: 999, border: `1px solid rgba(88,171,255,0.5)`, minWidth: 180 }}>
            <button className="tp-share-btn" onClick={() => share('download-qr', 'QR downloaded')}><Ic.DL sz={20} c={BLUE} /></button>
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            <button className="tp-share-btn" onClick={() => share('sms', null)}><Ic.Msg sz={20} c={BLUE} /></button>
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            <button className="tp-share-btn" onClick={() => share('email', null)}><Ic.Mail sz={20} c={BLUE} /></button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function BoardsModal({ onClose, toast, stones, selectedStoneId, onStoneSelect, onStoneCreate, onStoneRename, onStoneDelete, isLive }) {
  const items = isLive
    ? (stones || []).map(s => ({ id: s.id, name: s.name || `Stone ${s.stoneNumber}`, stoneNumber: s.stoneNumber, isReal: true }))
    : [
        { id: 'm1', name: 'Stone 1', stoneNumber: 1, isReal: false },
        { id: 'm2', name: 'Stone 2', stoneNumber: 2, isReal: false },
        { id: 'm3', name: 'Stone 3', stoneNumber: 3, isReal: false },
      ];

  const showCrud = isLive;

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName]   = useState('');
  const [busyId, setBusyId]       = useState(null);
  const [creating, setCreating]   = useState(false);

  const beginEdit = (item) => { setEditingId(item.id); setEditName(item.name); };
  const cancelEdit = () => { setEditingId(null); setEditName(''); };

  const saveEdit = async (item) => {
    const next = editName.trim();
    if (!next || next === item.name) { cancelEdit(); return; }
    setBusyId(item.id);
    try {
      await onStoneRename?.(item.id, next);
      toast('stone renamed');
      cancelEdit();
    } catch (e) {
      toast('rename failed');
    } finally {
      setBusyId(null);
    }
  };

  const deleteStone = async (item) => {
    setBusyId(item.id);
    try {
      await onStoneDelete?.(item.id);
      toast('stone deleted');
      cancelEdit();
    } catch (e) {
      toast('delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const createStone = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await onStoneCreate?.();
      toast('stone created');
      onClose();
    } catch (e) {
      toast('create failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,13,109,0.65)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* ── Centered card ── */}
      <div style={{ width: 300, maxHeight: '80%', background: BLUE, borderRadius: 28, display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(4,13,109,0.5), 0 0 0 6px rgba(4,13,109,0.9)', overflow: 'hidden', position: 'relative' }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 20px 0', flexShrink: 0, position: 'relative' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: '0.2px' }}>payment boards</span>
          <button onClick={onClose} aria-label="close" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: 999, border: '1.5px solid rgba(255,255,255,0.4)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', cursor: 'pointer' }}><Ic.X sz={13} /></button>
        </div>

        {/* scrollable stone list */}
        <div style={{ overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {items.map(item => {
            const selected = selectedStoneId != null && selectedStoneId === item.id;
            const isEditing = editingId === item.id;
            const label = `${item.name} — Stone ${item.stoneNumber}`;

            if (isEditing) {
              return (
                <div key={item.id} style={{ background: 'rgba(4,13,109,0.25)', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') cancelEdit(); }}
                    placeholder="stone name"
                    style={{ background: 'rgba(4,13,109,0.4)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontWeight: 500, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => saveEdit(item)} disabled={busyId === item.id}
                      style={{ flex: 1, background: NAVY, color: OFFW, borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busyId === item.id ? 0.6 : 1 }}>save</button>
                    <button onClick={() => deleteStone(item)} disabled={busyId === item.id}
                      style={{ flex: 1, background: 'rgba(255,80,80,0.25)', color: '#ffaaaa', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,80,80,0.4)', cursor: 'pointer', opacity: busyId === item.id ? 0.6 : 1 }}>delete</button>
                    <button onClick={cancelEdit} disabled={busyId === item.id}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.12)', color: '#fff', borderRadius: 10, padding: '9px 0', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busyId === item.id ? 0.6 : 1 }}>cancel</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={item.id} style={{ position: 'relative' }}>
                <button
                  data-demo-id={`retail-board-${item.id}`}
                  onClick={() => { onStoneSelect?.(item.id); toast(`paired with ${item.name}`); onClose(); }}
                  style={{
                    width: '100%',
                    background: selected ? NAVY : 'rgba(4,13,109,0.3)',
                    color: '#fff',
                    border: selected ? `1.5px solid rgba(255,255,255,0.4)` : '1.5px solid rgba(255,255,255,0.2)',
                    borderRadius: 16,
                    padding: showCrud ? '14px 48px 14px 16px' : '14px 16px',
                    textAlign: 'left',
                    fontWeight: selected ? 700 : 500,
                    fontSize: 14,
                    letterSpacing: '0.1px',
                    cursor: 'pointer',
                    transition: 'background 0.18s ease',
                    boxSizing: 'border-box',
                  }}
                >
                  {label}
                </button>
                {showCrud && item.isReal && (
                  <button
                    onClick={(e) => { e.stopPropagation(); beginEdit(item); }}
                    aria-label="edit stone"
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <Ic.Pencil sz={14} />
                  </button>
                )}
              </div>
            );
          })}

          {showCrud && (
            <button
              onClick={createStone}
              disabled={creating}
              style={{
                marginTop: 2,
                background: 'rgba(4,13,109,0.2)',
                color: '#fff',
                border: '2px dashed rgba(255,255,255,0.4)',
                borderRadius: 16,
                padding: '14px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: creating ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: creating ? 0.6 : 1,
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <Ic.Plus sz={16} sw={2.4} /> Create Stone
            </button>
          )}
        </div>

        {/* confirm footer */}
        <div style={{ padding: '0 18px 18px', flexShrink: 0 }}>
          <button className="tp-cta" style={{ background: NAVY, color: OFFW, width: '100%' }} onClick={onClose}>confirm</button>
        </div>
      </div>
    </div>
  );
}

function QRModal({ onClose, qrElement, payLink }) {
  const displayLink = payLink || 'https://pay.taptpay.com/p/demo-abc123';
  return (
    <div className="tp-qr-modal" onClick={onClose}>
      <div className="tp-qr-modal-inner" onClick={e => e.stopPropagation()}>
        {qrElement
          ? <div style={{ width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{qrElement}</div>
          : <Ic.QRBig sz={260} />
        }
        <div style={{ marginTop: 18, color: BLUE, fontWeight: 600, fontSize: 15 }}>scan to pay</div>
        <div style={{ marginTop: 6, color: 'rgba(88,171,255,0.6)', fontWeight: 500, fontSize: 11, maxWidth: 240, textAlign: 'center', wordBreak: 'break-all' }}>{displayLink}</div>
        <button className="tp-qr-modal-close" onClick={onClose} aria-label="close"><Ic.X sz={15} sw={2.5} /></button>
      </div>
    </div>
  );
}

function DockPlaceholder({ tab }) {
  const meta = {
    home:      { title: 'home',      sub: 'analytics summary · live transactions · daily revenue' },
    stock:     { title: 'catalog',   sub: 'manage product library · prices · variants' },
    analytics: { title: 'analytics', sub: 'transaction records · settlement history · payouts' },
    settings:  { title: 'settings',  sub: 'terminal pairing · account · hardware config' },
  }[tab] || {};
  return (
    <div className="tp-screen tp-plain" style={{ background: NAVY }}>
      <div style={{ flex: 1, padding: '100px 28px 120px', color: BLUE, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 700, fontSize: 52, letterSpacing: '-0.02em' }}>{meta.title}</div>
        <div style={{ marginTop: 14, color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.5, maxWidth: 280 }}>{meta.sub}</div>
        <div style={{ marginTop: 32, padding: 22, background: 'rgba(88,171,255,0.1)', border: '1px solid rgba(88,171,255,0.25)', borderRadius: 22, color: BLUE, fontSize: 14 }}>
          placeholder — return to <strong style={{ color: '#fff', fontWeight: 700 }}>terminal</strong>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   ROOT — accepts optional live-mode props
   When liveState is null, runs in demo mode
   ═══════════════════════════════════════ */
export default function RetailTerminalViewCore({
  liveState           = null,
  onCreateSale        = null,
  onCreateSplit       = null,
  onCancel            = null,
  onPickStock         = null,
  onShare             = null,
  onCashSale          = null,
  onRefund            = null,
  onOpenReceipt       = null,
  onNavigate          = null,
  onBoardSelect       = null,
  selectedStoneId     = null,
  onStoneCreate       = null,
  onStoneRename       = null,
  onStoneDelete       = null,
  liveStones          = null,
  livePayLink         = null,
  qrElement           = null,
  showPaywave         = true,
  successNotification = null,
  publishDockState    = false,
} = {}) {
  const isLive = liveState !== null;

  const [demoState, setDemoState] = useState({
    items:   [{ id: 'i1', name: 'honey latte', amount: 699 }, { id: 'i2', name: 'berry muffin', amount: 1200 }],
    pending: null,
    sent:    [],
  });

  const [localDraft, setLocalDraft] = useState(null);

  const effectivePending = isLive ? (localDraft ?? liveState?.pending ?? null) : demoState.pending;
  const state    = isLive ? { ...liveState, pending: effectivePending } : demoState;
  const setState = fn => { if (!isLive) setDemoState(fn); };

  const [screen, setScreen]           = useState('home');
  const [dockActive, setDockRaw]      = useState('terminal');
  const [showBoards, setShowBoards]   = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [toastMsg, setToastMsg]       = useState(null);
  const [paywaveOn, setPaywaveOn]     = useState(false);
  const [conveyor, setConveyor]       = useState(null);
  const [contentKey, setContentKey]   = useState(0);
  const [keypadCents, setKeypadCents] = useState(0);
  const [pendingSplitEnabled, setPendingSplitEnabled] = useState(false);
  const conveyorTimer = useRef(null);

  /* Active stack expand + transaction detail */
  const [stackExpanded, setStackExpanded] = useState(false);
  const [selectedStackTx, setSelectedStackTx] = useState(null);
  const [showTxRefundForm, setShowTxRefundForm] = useState(false);
  const [txRefundAmount, setTxRefundAmount] = useState('');
  const [txRefundReason, setTxRefundReason] = useState('');
  const [txRefundSubmitting, setTxRefundSubmitting] = useState(false);

  const currentId = dockActive !== 'terminal' ? 'dock-' + dockActive : screen;

  const triggerConveyor = (prevId, dir) => {
    setConveyor({ prevId, dir });
    clearTimeout(conveyorTimer.current);
    conveyorTimer.current = setTimeout(() => setConveyor(null), 650);
  };

  const toast = msg => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 1600); };

  const setDockActive = id => {
    if (id === dockActive) return;
    if (onNavigate?.(id) === true) return;
    triggerConveyor(currentId, 'up');
    setDockRaw(id);
    if (id === 'terminal') setScreen('home');
  };

  const go = next => {
    if (next === 'boards') { setShowBoards(true); return; }
    if (next === 'keypad') {
      const fromHome = screen === 'home';
      if (fromHome) {
        if (!isLive && state.pending) {
          setState(s => ({ ...s, items: [{ ...s.pending, status: 'hold' }, ...s.items], pending: null }));
        }
        triggerConveyor(currentId, 'up');
      }
      setScreen('keypad');
      setDockRaw('terminal');
      return;
    }
    if (next === 'cancel' || next === 'home') {
      if (isLive && next === 'cancel') {
        if (localDraft) {
          setLocalDraft(null);
        } else if (liveState?.pending) {
          onCancel?.(liveState.pending);
        }
      }
      if (screen !== 'home') triggerConveyor(screen, 'down');
      setScreen('home');
      setDockRaw('terminal');
      return;
    }
    if (next === 'home-pop') {
      triggerConveyor(screen, 'down');
      setScreen('home');
      setDockRaw('terminal');
      return;
    }
    setContentKey(k => k + 1);
    setScreen(next);
    setDockRaw('terminal');
  };

  /* Keypad ✓ commit — morph into details, panels stay still */
  const handleCommit = (cents, splitEnabled = false) => {
    setKeypadCents(cents);
    setPendingSplitEnabled(splitEnabled);
    setContentKey(k => k + 1);
    setConveyor({ prevId: 'keypad', dir: 'morph' });
    clearTimeout(conveyorTimer.current);
    conveyorTimer.current = setTimeout(() => setConveyor(null), 420);
    setScreen('details');
    setDockRaw('terminal');
  };

  /* Stock commit — builds one combined pending */
  const handleStockCommit = picks => {
    const name = picks.map(p => p.qty > 1 ? `${p.name} x${p.qty}` : p.name).join(', ');
    const amount = picks.reduce((s, p) => s + p.amount * p.qty, 0);
    onPickStock?.(picks);
    if (isLive) {
      setLocalDraft({ name, amount });
    } else {
      setState(s => ({ ...s, pending: { id: 'i' + Date.now(), name, amount } }));
    }
    go('home-pop');
  };

  /* Split commit */
  const handleSplitCommit = ({ name, amount, splitEnabled = false, splitParts }) => {
    if (isLive) {
      setLocalDraft({ name, amount, splitEnabled, splitParts });
    } else {
      setState(s => ({ ...s, pending: { id: 'i' + Date.now(), name, amount, splitEnabled, splitParts } }));
    }
    go('home-pop');
  };

  /* Details commit */
  const handleDetailsCommit = ({ name, amount }) => {
    if (isLive) {
      setLocalDraft({ name, amount, splitEnabled: pendingSplitEnabled });
      setPendingSplitEnabled(false);
    } else {
      setState(s => ({ ...s, pending: { id: 'i' + Date.now(), name, amount } }));
    }
    go('home-pop');
  };

  /* Send: open customer payment page (live) or share screen (demo) */
  const handleSend = async () => {
    if (!state.pending) return;
    if (isLive) {
      if (!localDraft) {
        if (paywaveOn) {
          await onCreateSale?.(state.pending, { paywave: true, existing: true });
        }
        return;
      }

      const create = localDraft.splitEnabled ? (onCreateSplit ?? onCreateSale) : onCreateSale;
      try {
        await create?.(localDraft, { paywave: paywaveOn, existing: false });
        setLocalDraft(null);
      } catch {
        /* draft preserved — error shown by parent */
      }
      return;
    }

    if (paywaveOn) {
      toast('tap-to-pay (demo only)');
      return;
    }

    // demo: show share screen
    triggerConveyor('home', 'up');
    setContentKey(k => k + 1);
    setScreen('share');
    setDockRaw('terminal');
  };

  /* Share screen ✓ confirm */
  const handleShareConfirm = () => {
    if (isLive) {
      triggerConveyor('share', 'down');
      setScreen('home');
      setDockRaw('terminal');
    } else {
      setState(s => ({
        ...s,
        sent: [{ ...s.pending, status: 'sent' }, ...(s.sent || [])],
        pending: null,
      }));
      triggerConveyor('share', 'down');
      setScreen('home');
      setDockRaw('terminal');
    }
  };

  /* Cash entry commit → success screen */
  const handleCashCommit = ({ name, amount }) => {
    if (isLive) {
      onCashSale?.({ name, amount });
    } else {
      setState(s => ({ ...s, pending: { id: 'i' + Date.now(), name, amount } }));
    }
    triggerConveyor('cash', 'up');
    setScreen('cash-success');
    setDockRaw('terminal');
  };

  /* Hold item restore (demo only) */
  const handleStackItemClick = item => {
    if (item.status !== 'hold' || isLive) return;
    setState(s => ({ ...s, items: s.items.filter(i => i.id !== item.id), pending: { ...item } }));
    setContentKey(k => k + 1);
  };

  const renderScreen = id => {
    if (id.startsWith('dock-')) return <DockPlaceholder tab={id.slice(5)} />;
    if (id === 'home') return state.pending
      ? <PendingTerminal state={state} go={go} paywaveOn={paywaveOn} togglePaywave={() => setPaywaveOn(v => !v)} onItemClick={handleStackItemClick} showPaywave={showPaywave} onExpand={() => setStackExpanded(true)} onRowClick={it => { setSelectedStackTx(it); setShowTxRefundForm(false); }} />
      : <MainTerminal    state={state} go={go} paywaveOn={paywaveOn} togglePaywave={() => setPaywaveOn(v => !v)} onItemClick={handleStackItemClick} showPaywave={showPaywave} onExpand={() => setStackExpanded(true)} onRowClick={it => { setSelectedStackTx(it); setShowTxRefundForm(false); }} />;
    if (id === 'keypad')  return <Keypad       state={state} go={go} onCommit={handleCommit} />;
    if (id === 'split')   return <SplitPayment state={state} go={go} onCommitSplit={handleSplitCommit} />;
    if (id === 'stock')   return <ChooseStock  state={state} go={go} onCommitStock={handleStockCommit} />;
    if (id === 'details') return <EnterDetails state={state} go={go} onCommitDetails={handleDetailsCommit} initialAmount={keypadCents} />;
    if (id === 'share')   return <SharePayment state={state} go={go} toast={toast} onShare={onShare} onExpandQR={() => setShowQRModal(true)} onConfirmPayment={handleShareConfirm} livePayLink={livePayLink} qrElement={qrElement} />;
    if (id === 'cash')         return <CashEntry   go={go} onCommitCash={handleCashCommit} />;
    if (id === 'cash-success') return <CashSuccess state={state} go={go} setState={setState} toast={toast} onShare={onShare} />;
    return null;
  };

  const onTerminal      = dockActive === 'terminal';
  const onHome          = onTerminal && screen === 'home';
  const isFeatureScreen = onTerminal && screen !== 'home';
  const viewportRef = useRef(null);
  const [boundaryDelta, setBoundaryDelta] = useState(0);

  useEffect(() => {
    if (!isFeatureScreen) { setBoundaryDelta(0); return; }
    if (conveyor) return;
    const stage = viewportRef.current;
    if (!stage) return;
    const measure = () => {
      const layers = stage.querySelectorAll('.tp-layer');
      const entering = layers[layers.length - 1];
      if (!entering) return;
      const topPanel = entering.querySelector('.stagger');
      if (!topPanel) return;
      const stageRect = stage.getBoundingClientRect();
      const panelRect = topPanel.getBoundingClientRect();
      const bottomPx = panelRect.bottom - stageRect.top;
      const midPx = stageRect.height / 2;
      setBoundaryDelta(bottomPx - midPx);
    };
    measure();
    const ro = new ResizeObserver(measure);
    stage.querySelectorAll('.tp-layer .stagger').forEach(el => ro.observe(el));
    return () => { ro.disconnect(); };
  }, [isFeatureScreen, screen, conveyor]);

  /* Phase D of docs/PLAN-2026-08-17-terminal-panels-and-dock.md. Gated on the
     prop, not just being mounted, so the landing demo and the desktop app —
     which mount this same view — never drive the real dock (mirrors Phase A's
     placement === "fixed" gate on --dock-h). See dock-collapse-store.ts. */
  useEffect(() => {
    if (!publishDockState) return;
    setDockCollapse(isFeatureScreen ? 'collapsed' : 'auto');
    return () => setDockCollapse('auto');
  }, [publishDockState, isFeatureScreen]);

  const fabVisible      = onHome && !showBoards;
  const subbarVisible   = onTerminal && !showBoards;
  const subbarActiveIdx = onTerminal && SCREEN_TO_SUBBAR[screen] !== undefined ? SCREEN_TO_SUBBAR[screen] : -1;
  const dockVisible     = !showBoards && (onHome || !onTerminal);
  const sendVisible     = onHome && !!state.pending;
  const conveyorDir     = conveyor?.dir || 'up';
  useMeasuredChromeGutter(viewportRef, fabVisible ? 'fab' : subbarVisible ? 'bar' : null);
  useFitTerminalAmounts(viewportRef);

  return (
    <div className="retail-terminal-view tp-viewport" data-retail-terminal-view ref={viewportRef}>
      {conveyor && (
        <div key={'leave-' + conveyor.prevId} className={`tp-layer leaving ${conveyorDir}`}>
          {renderScreen(conveyor.prevId)}
        </div>
      )}
      <div key={'enter-' + currentId + '-' + contentKey} className={`tp-layer${conveyor ? ' entering ' + conveyorDir : ''}`}>
        {renderScreen(currentId)}
      </div>

      <div className="tp-overlay">
        <TopBanner notification={successNotification} />

        <div className={`tp-pfab${fabVisible ? ' show' : ' hide'}${onHome ? ' home' : ''}`}>
          <FabBtn onClick={() => go('keypad')} />
        </div>

        <div
          className={`tp-psubbar${subbarVisible ? ' show' : ' hide'}${isFeatureScreen ? ' feature' : ''}${onHome ? ' home' : ''}`}
          style={isFeatureScreen ? { transform: `translate(-50%, calc(${boundaryDelta}px - 100% - 20px))` } : undefined}
        >
          <SubBar activeIdx={subbarActiveIdx} onPick={i => go(SUBBAR_ROUTE[i])} compact={sendVisible} />
          <div className={`tp-send-slot${sendVisible ? ' show' : ''}`}>
            <SendBtn onClick={handleSend} />
          </div>
        </div>

        {/* Dock removed — BottomNavigation in App handles global nav */}
      </div>

      {showBoards && (
        <BoardsModal
          onClose={() => setShowBoards(false)}
          toast={toast}
          stones={liveStones}
          selectedStoneId={selectedStoneId}
          onStoneSelect={onBoardSelect}
          onStoneCreate={onStoneCreate}
          onStoneRename={onStoneRename}
          onStoneDelete={onStoneDelete}
          isLive={isLive}
        />
      )}

      {showQRModal && <QRModal onClose={() => setShowQRModal(false)} qrElement={qrElement} payLink={livePayLink} />}

      <div className={`tp-toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>

      {/* ── Active Stack Full-Page Overlay ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 55,
        background: OFFW,
        transform: stackExpanded ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.38s cubic-bezier(0.16,1,0.3,1)',
        display: 'flex', flexDirection: 'column',
        overflowY: stackExpanded ? 'auto' : 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: NAVY, padding: '52px 24px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={() => setStackExpanded(false)}
              style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: 'none', color: BLUE, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            ><Ic.Back sz={20} /></button>
            <span style={{ fontSize: 16, fontWeight: 700, color: BLUE, letterSpacing: '0.1em', textTransform: 'uppercase' }}>active stack</span>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            {(state.sent || []).length} transaction{(state.sent || []).length !== 1 ? 's' : ''}
          </div>
        </div>
        {/* Transaction list */}
        <div style={{ padding: '16px 18px 120px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(state.sent || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#aaa', fontSize: 14 }}>No active transactions</div>
          ) : (state.sent || []).map(it => {
            const statusColors = { paid: '#22C55E', sent: '#22C55E', processing: '#3B82F6', 'awaiting payment': '#F59E0B', declined: '#EF4444', hold: '#8B5CF6' };
            const dotColor = statusColors[it.status] || statusColors[it.status || ''] || '#8C8C8C';
            const isSplitTx = !!(it.splitEnabled || it.isSplit || (it.totalSplits > 1));
            return (
              <div
                key={it.id}
                onClick={() => { setSelectedStackTx(it); setShowTxRefundForm(false); setTxRefundAmount(''); setTxRefundReason(''); }}
                style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name || it.itemName}</div>
                  {isSplitTx && it.totalSplits > 1 ? (
                    <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 3 }}>split bill · {it.completedSplits ?? 0} of {it.totalSplits} paid</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#8C8C8C', textTransform: 'capitalize' }}>{it.status || 'awaiting payment'}</span>
                    </div>
                  )}
                  {it.createdAt && (
                    <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
                      {new Date(it.createdAt).toLocaleString('en-NZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 12, gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{fmt(it.amount)}</span>
                  <span style={{ fontSize: 11, color: BLUE }}>view →</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Transaction Detail Modal (in expanded stack) ── */}
      {selectedStackTx && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(4,13,109,0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'tp-fadeIn 0.2s ease both',
        }} onClick={e => { if (e.target === e.currentTarget) { setSelectedStackTx(null); } }}>
          <div style={{
            background: '#fff', borderRadius: '28px 28px 0 0',
            width: '100%', maxHeight: '85vh', overflowY: 'auto',
            padding: '24px 22px 40px',
            animation: 'tp-inUp 0.34s cubic-bezier(0.16,1,0.3,1) both',
          }}>
            {/* Handle bar */}
            <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.1)', margin: '0 auto 20px' }} />

            {/* Details */}
            <div style={{ background: '#F8F9FF', borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>Transaction Details</p>
              {selectedStackTx.id && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: '#6B7280' }}>ID</span>
                  <span style={{ color: NAVY, fontWeight: 600 }}>#{selectedStackTx.id}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#6B7280' }}>Item</span>
                <span style={{ color: NAVY, fontWeight: 600 }}>{selectedStackTx.name || selectedStackTx.itemName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#6B7280' }}>Amount</span>
                <span style={{ color: NAVY, fontWeight: 700 }}>{fmt(selectedStackTx.amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#6B7280' }}>Status</span>
                <span style={{ color: NAVY, fontWeight: 600, textTransform: 'capitalize' }}>{selectedStackTx.status || 'awaiting payment'}</span>
              </div>
              {selectedStackTx.paymentMethod && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: '#6B7280' }}>Method</span>
                  <span style={{ color: NAVY, fontWeight: 600, textTransform: 'capitalize' }}>{selectedStackTx.paymentMethod.replace(/_/g, ' ')}</span>
                </div>
              )}
              {selectedStackTx.createdAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#6B7280' }}>Time</span>
                  <span style={{ color: NAVY, fontWeight: 600 }}>{new Date(selectedStackTx.createdAt).toLocaleString('en-NZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              {selectedStackTx.totalSplits > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
                  <span style={{ color: '#6B7280' }}>Split</span>
                  <span style={{ color: NAVY, fontWeight: 600 }}>{selectedStackTx.completedSplits ?? 0} of {selectedStackTx.totalSplits} paid</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Receipt Share */}
              <button
                data-demo-id="retail-open-receipt"
                onClick={() => {
                  const transaction = selectedStackTx;
                  setSelectedStackTx(null);
                  onOpenReceipt?.(transaction);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 14, background: NAVY, border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                <Ic.Share sz={16} c="#fff" /> Share Receipt
              </button>

              {/* Refund */}
              {(selectedStackTx.status === 'paid' || selectedStackTx.status === 'completed') && selectedStackTx.id && (
                <button
                  data-demo-id="retail-refund"
                  onClick={() => setShowTxRefundForm(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 14, background: 'transparent', border: '1.5px solid #EF4444', color: '#EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  {showTxRefundForm ? 'Cancel Refund' : 'Issue Refund'}
                </button>
              )}

              {/* Refund form */}
              {showTxRefundForm && selectedStackTx.id && (
                <div style={{ background: '#FFF5F5', borderRadius: 12, padding: 14, border: '1px solid #FECACA', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#EF4444' }}>Issue Refund</p>
                  <div>
                    <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 4 }}>Amount (NZD)</label>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={txRefundAmount}
                      onChange={e => setTxRefundAmount(e.target.value)}
                      placeholder={fmt(selectedStackTx.amount).replace('$', '')}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #FECACA', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 4 }}>Reason</label>
                    <textarea
                      value={txRefundReason}
                      onChange={e => setTxRefundReason(e.target.value)}
                      placeholder="e.g. Customer requested refund"
                      rows={2}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #FECACA', fontSize: 13, resize: 'none', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                  <button
                    data-demo-id="retail-refund-confirm"
                    disabled={txRefundSubmitting}
                    onClick={async () => {
                      const amount = parseFloat(txRefundAmount);
                      if (!amount || amount <= 0 || !txRefundReason.trim()) {
                        toast('Amount and reason required'); return;
                      }
                      setTxRefundSubmitting(true);
                      try {
                        await onRefund?.({
                          transactionId: selectedStackTx.id,
                          refundAmount: amount.toFixed(2),
                          refundReason: txRefundReason.trim(),
                          refundMethod: 'original_payment_method',
                        });
                        toast('Refund processed');
                        setSelectedStackTx(null);
                        setShowTxRefundForm(false);
                      } catch (error) {
                        toast(error?.message || 'Refund failed');
                      }
                      finally { setTxRefundSubmitting(false); }
                    }}
                    style={{ padding: '12px', borderRadius: 12, background: txRefundSubmitting ? '#ccc' : '#EF4444', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: txRefundSubmitting ? 'default' : 'pointer' }}
                  >
                    {txRefundSubmitting ? 'Processing…' : `Confirm Refund`}
                  </button>
                </div>
              )}

              <button
                onClick={() => { setSelectedStackTx(null); setShowTxRefundForm(false); }}
                style={{ padding: '12px', borderRadius: 14, background: '#F3F4F6', border: 'none', color: NAVY, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ CSS ═══
   Lives in ./retail-terminal-view.css, scoped under `.retail-terminal-view`.
   It was an unscoped `<style>{TP_CSS}</style>` here until phase 2 of
   docs/PLAN-2026-08-17-mobile-responsive-ui.md §5.1 — see that file's header. */
