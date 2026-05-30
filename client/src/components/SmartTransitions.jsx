import { useState, useEffect, useRef } from "react";

const NAVY = '#040D6D';
const BLUE = '#58ABFF';
const OFFW = '#F4F4F4';
const GREEN = '#1BBF85';
const fmt = c => `$${(c / 100).toFixed(2)}`;

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

function SubBar({ activeIdx = -1, onPick, compact = false }) {
  const trackRef   = useRef(null);
  const btnRefs    = useRef([]);
  const mountedRef = useRef(false);
  const [ind, setInd]         = useState({ x: 0, w: 0, on: false });
  const [animate, setAnimate] = useState(false);

  const measure = i => {
    const el = btnRefs.current[i], tr = trackRef.current;
    if (!el || !tr) return { x: 0, w: 0 };
    const r = el.getBoundingClientRect(), t = tr.getBoundingClientRect();
    return { x: r.left - t.left, w: r.width };
  };

  useEffect(() => {
    const tick = () => {
      if (activeIdx < 0) { setInd(p => ({ ...p, on: false })); }
      else { const m = measure(activeIdx); setInd({ x: m.x, w: m.w, on: true }); }
    };
    if (!mountedRef.current) {
      requestAnimationFrame(() => { tick(); mountedRef.current = true; });
    } else {
      setAnimate(true);
      requestAnimationFrame(() => requestAnimationFrame(tick));
      const t = setTimeout(() => setAnimate(false), 520);
      return () => clearTimeout(t);
    }
  }, [activeIdx]);

  return (
    <div className="tp-subbar-wrap">
      <div className={`tp-subbar${compact ? ' compact' : ''}`} ref={trackRef}>
        <div className={`tp-subbar-ind${animate ? ' animate' : ''}${ind.on ? ' on' : ''}`} style={{ left: ind.x, width: ind.w }} />
        {SUBBAR_ITEMS.map(({ id, label, Icon }, i) => {
          const active = activeIdx === i;
          const ic = active ? BLUE : 'rgba(4,13,109,0.55)';
          return (
            <button key={id} ref={el => (btnRefs.current[i] = el)}
              className={`tp-subbar-btn${active ? ' active' : ''}`}
              onClick={() => onPick?.(i)} aria-label={label}>
              <Icon sz={20} c={ic} />
              {active && <span className="tp-subbar-label">{label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SendBtn({ onClick }) {
  return (
    <button className="tp-send" onClick={onClick} aria-label="send">
      <span className="tp-send-circle"><Ic.Arrow /></span>
      <span className="tp-send-label">send</span>
    </button>
  );
}

function FabBtn({ onClick }) {
  return (
    <button className="tp-fab" onClick={onClick} aria-label="add item">
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

function SubHead({ onCancel, onCommit }) {
  return (
    <div className="tp-subhead">
      <button className="tp-subhead-btn" onClick={onCancel} aria-label="cancel"><Ic.X /></button>
      <button className="tp-subhead-btn" onClick={onCommit} aria-label="commit"><Ic.Check /></button>
    </div>
  );
}

function ActiveStack({ items, status = 'awaiting payment', onItemClick }) {
  return (
    <div>
      <div className="tp-stack-hdr">
        <div className="tp-stack-title">active stack</div>
        <button style={{ color: BLUE, display: 'flex', background: 'none', border: 'none', cursor: 'pointer' }}><Ic.ChevR /></button>
      </div>
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
            <div key={it.id} className={`tp-stack-row${isHold ? ' holdable' : ''}`} onClick={() => isHold && onItemClick?.(it)}>
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

function MainTerminal({ state, go, paywaveOn, togglePaywave, onItemClick, showPaywave }) {
  const total = state.items.reduce((s, i) => s + i.amount, 0);
  const line  = state.items.map(i => i.name).join(', ');
  return (
    <div className="tp-screen">
      <div className="stagger" style={{ background: NAVY, height: '50%', padding: '100px 28px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        <div className="tp-amount" style={{ fontSize: 88, color: BLUE }}>{fmt(total)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          {showPaywave && (
            <button className={`tp-pill${paywaveOn ? ' solid' : ' outline'}`} onClick={togglePaywave}>paywave</button>
          )}
          <button className="tp-pill outline" style={{ marginLeft: 10 }} onClick={() => go('boards')}>boards</button>
        </div>
        <div style={{ marginTop: 33, color: BLUE, fontWeight: 500, fontSize: 18 }}>{line || 'no items yet'}</div>
      </div>
      <div className="stagger" style={{ flex: 1, background: OFFW, padding: '154px 22px 90px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="tp-stack-scroll" style={{ flex: 1, overflow: 'auto', paddingRight: 2 }}>
          <ActiveStack items={state.sent || []} status="sent" onItemClick={onItemClick} />
        </div>
      </div>
    </div>
  );
}

function PendingTerminal({ state, go, paywaveOn, togglePaywave, onItemClick, showPaywave }) {
  const pending = state.pending;
  const total   = pending?.amount || 0;
  return (
    <div className="tp-screen">
      <div className="stagger" style={{ background: NAVY, height: '50%', padding: '100px 28px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', position: 'relative' }}>
        <button onClick={() => go('cancel')} aria-label="cancel transaction" style={{ position: 'absolute', top: 18, left: 20, width: 44, height: 44, borderRadius: 999, border: 'none', color: NAVY, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 120ms, opacity 120ms' }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onMouseUp={e => e.currentTarget.style.transform = ''}
          onMouseLeave={e => e.currentTarget.style.transform = ''}
          onTouchStart={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onTouchEnd={e => e.currentTarget.style.transform = ''}
        ><Ic.X sz={16} sw={2.4} /></button>
        <div className="tp-amount" style={{ fontSize: 88, color: BLUE }}>{fmt(total)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          {showPaywave && (
            <button className={`tp-pill${paywaveOn ? ' solid' : ' outline'}`} onClick={togglePaywave}>paywave</button>
          )}
          <button className="tp-pill outline" style={{ marginLeft: 10 }} onClick={() => go('boards')}>boards</button>
        </div>
        <div style={{ marginTop: 33, fontWeight: 500, fontSize: 18, color: BLUE, lineHeight: 1.25 }}>
          {pending?.name || '—'}
          <div style={{ marginTop: 6, color: '#fff', fontWeight: 600, fontSize: 14 }}>tap send to share payment</div>
        </div>
      </div>
      <div className="stagger" style={{ flex: 1, background: OFFW, padding: '154px 22px 90px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="tp-stack-scroll" style={{ flex: 1, overflow: 'auto', paddingRight: 2 }}>
          <ActiveStack items={state.sent || []} status="sent" onItemClick={onItemClick} />
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
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="tp-amount" style={{ fontSize: 88, color: cents === 0 ? 'rgba(4,13,109,0.32)' : NAVY, marginTop: 18 }}>{fmt(cents)}</div>
          <button className="tp-pill" style={{ alignSelf: 'flex-start', padding: '8px 16px', background: splitOn ? NAVY : 'transparent', color: splitOn ? BLUE : NAVY, boxShadow: splitOn ? 'none' : `inset 0 0 0 1px rgba(4,13,109,0.5)`, transition: 'background 0.18s ease, color 0.18s ease' }} onClick={handleSplit}>split bill</button>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '38px 28px 28px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'center', justifyItems: 'center' }}>
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} className="tp-kp" onClick={() => press(d)}>{d}</button>
          ))}
          <button className="tp-kp outline">·</button>
          <button className="tp-kp" onClick={() => press('0')}>0</button>
          <button className="tp-kp outline" onClick={back}><Ic.Back /></button>
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
    onCommitSplit({ name, amount: total, splitEnabled: true });
  };

  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="tp-amount" style={{ fontSize: 88, textAlign: 'center' }}>{fmt(partAmount)}</div>
          <div style={{ marginTop: 18, textAlign: 'center', fontWeight: 500, fontSize: 19, color: NAVY, lineHeight: 1.4 }}>
            payment 1/{parts}<br />total: {fmt(total)}
          </div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, color: BLUE, padding: '56px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>split bill</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
          <button className="tp-stepper" onClick={() => setParts(p => Math.max(2, p - 1))}><Ic.Minus /></button>
          <div className="tp-amount" style={{ fontSize: 88, color: BLUE, fontWeight: 900 }}>{parts}</div>
          <button className="tp-stepper" onClick={() => setParts(p => Math.min(12, p + 1))}><Ic.Plus sz={22} /></button>
        </div>
        <button onClick={() => go('keypad')} style={{ color: BLUE, fontWeight: 500, fontSize: 16, textDecoration: 'underline', textUnderlineOffset: 4, marginBottom: 22, background: 'none', border: 'none', cursor: 'pointer' }}>enter amount</button>
        <button className="tp-cta" onClick={commit}>confirm</button>
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
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', alignItems: 'center' }}>
          <div className="tp-amount" style={{ fontSize: 88 }}>{fmt(total)}</div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '52px 22px 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
              <button key={s.id} className={`tp-stock-tile${qty > 0 ? ' selected' : ''}`} onClick={() => tap(s.id)}
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
          <button className="tp-cta" onClick={commit}>
            confirm{totalPicks > 0 ? ` · ${totalPicks}` : ''}
          </button>
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
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', alignItems: 'center' }}>
          <div className="tp-amount" style={{ fontSize: 88 }}>{fmt(centsPreview || initialAmount)}</div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '40px 28px 28px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ color: BLUE, fontWeight: 500, fontSize: 18, textAlign: 'center' }}>enter transaction details</div>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="tp-field" placeholder="item name"   value={name}   onChange={e => setName(e.target.value)} />
          <input className="tp-field" placeholder="amount"      value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g,''))} inputMode="decimal" />
          <input className="tp-field" placeholder="description" value={desc}   onChange={e => setDesc(e.target.value)} />
        </div>
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 20 }}>quantity</div>
          <button className="tp-stepper" style={{ width: 32, height: 32 }} onClick={() => setQty(q => Math.max(1, q-1))}><Ic.Minus sz={14} sw={3.5} /></button>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 22, minWidth: 22, textAlign: 'center' }}>{qty}</div>
          <button className="tp-stepper" style={{ width: 32, height: 32 }} onClick={() => setQty(q => Math.min(99, q+1))}><Ic.Plus sz={14} sw={3.5} /></button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'center' }}><button className="tp-cta" onClick={commit}>confirm</button></div>
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
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={commit} />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', alignItems: 'center' }}>
          <div className="tp-amount" style={{ fontSize: 88 }}>{fmt(cents * qty)}</div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '40px 28px 28px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ color: BLUE, fontWeight: 500, fontSize: 18, textAlign: 'center' }}>cash payment</div>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="tp-field" placeholder="item name"   value={name}   onChange={e => setName(e.target.value)} />
          <input className="tp-field" placeholder="amount"      value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
          <input className="tp-field" placeholder="description" value={desc}   onChange={e => setDesc(e.target.value)} />
        </div>
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 20 }}>quantity</div>
          <button className="tp-stepper" style={{ width: 32, height: 32 }} onClick={() => setQty(q => Math.max(1, q - 1))}><Ic.Minus sz={14} sw={3.5} /></button>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 22, minWidth: 22, textAlign: 'center' }}>{qty}</div>
          <button className="tp-stepper" style={{ width: 32, height: 32 }} onClick={() => setQty(q => Math.min(99, q + 1))}><Ic.Plus sz={14} sw={3.5} /></button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="tp-cta" onClick={commit}>confirm</button>
        </div>
      </div>
    </div>
  );
}

const QR_SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 60 60" fill="none"><rect width="60" height="60" fill="#040D6D"/><path d="M6 14V8a2 2 0 012-2h6" stroke="#58ABFF" stroke-width="3" stroke-linecap="round"/><path d="M54 14V8a2 2 0 00-2-2h-6" stroke="#58ABFF" stroke-width="3" stroke-linecap="round"/><path d="M6 46v6a2 2 0 002 2h6" stroke="#58ABFF" stroke-width="3" stroke-linecap="round"/><path d="M54 46v6a2 2 0 01-2 2h-6" stroke="#58ABFF" stroke-width="3" stroke-linecap="round"/><rect x="18" y="18" width="9" height="9" rx="1.5" fill="#58ABFF"/><rect x="33" y="18" width="9" height="9" rx="1.5" fill="#58ABFF"/><rect x="18" y="33" width="9" height="9" rx="1.5" fill="#58ABFF"/><rect x="33" y="33" width="3" height="3" fill="#58ABFF"/><rect x="38" y="33" width="3" height="3" fill="#58ABFF"/><rect x="33" y="38" width="3" height="3" fill="#58ABFF"/><rect x="38" y="38" width="3" height="3" fill="#58ABFF"/></svg>`;

function SharePayment({ state, go, toast, onExpandQR, onConfirmPayment, livePayLink, qrElement }) {
  const total = state.pending?.amount || state.items.reduce((s, i) => s + i.amount, 0) || 0;
  const payLink = livePayLink || 'https://pay.taptpay.com/p/demo-abc123';

  const copyLink = () => {
    navigator.clipboard?.writeText(payLink).catch(() => {});
    toast('link copied');
  };

  const shareEmail = () => {
    const subject = encodeURIComponent(`Payment Request — ${fmt(state.pending?.amount || total)}`);
    const body = encodeURIComponent(`Pay here: ${payLink}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareSMS = () => {
    const body = encodeURIComponent(`Pay here: ${payLink}`);
    const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
    window.open(`sms:${isMac ? '&' : '?'}body=${body}`);
  };

  const downloadQR = () => {
    const blob = new Blob([QR_SVG_CONTENT], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'payment-qr.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('QR downloaded');
  };

  const handleConfirm = onConfirmPayment || (() => { toast('payment confirmed'); go('cash'); });

  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('cancel')} onCommit={handleConfirm} />
        <div style={{ flex: 1, padding: '8px 28px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div className="tp-amount" style={{ fontSize: 76 }}>{fmt(state.pending?.amount || total)}</div>
          <div style={{ marginTop: 16, fontWeight: 500, fontSize: 18, lineHeight: 1.4 }}>
            {state.pending?.name || 'payment'}
          </div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '52px 28px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
          <button className="tp-cta" style={{ minWidth: 180 }} onClick={copyLink}>copy link</button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '8px 20px', borderRadius: 999, border: `1px solid rgba(88,171,255,0.5)`, minWidth: 180 }}>
            <button className="tp-share-btn" onClick={downloadQR} aria-label="download QR"><Ic.DL sz={20} c={BLUE} /></button>
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            <button className="tp-share-btn" onClick={shareSMS} aria-label="share via SMS"><Ic.Msg sz={20} c={BLUE} /></button>
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            <button className="tp-share-btn" onClick={shareEmail} aria-label="share via email"><Ic.Mail sz={20} c={BLUE} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashSuccess({ state, go, setState, toast }) {
  const total = state.pending?.amount || state.items.reduce((s, i) => s + i.amount, 0) || 0;
  const clear = () => { setState(s => ({ ...s, items: [], pending: null })); go('home-pop'); };

  const copyLink = () => { navigator.clipboard?.writeText('https://pay.taptpay.com/p/demo-abc123').catch(() => {}); toast('receipt link copied'); };
  const shareEmail = () => window.open(`mailto:?subject=${encodeURIComponent('Your Receipt')}&body=${encodeURIComponent('Your receipt: https://pay.taptpay.com/p/demo-abc123')}`);
  const shareSMS = () => { const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent); window.open(`sms:${isMac?'&':'?'}body=${encodeURIComponent('Your receipt: https://pay.taptpay.com/p/demo-abc123')}`); };
  const downloadQR = () => {
    const blob = new Blob([QR_SVG_CONTENT], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'receipt-qr.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('QR downloaded');
  };

  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={clear} onCommit={clear} />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div className="tp-amount" style={{ fontSize: 88 }}>{fmt(total)}</div>
          <div style={{ marginTop: 22, fontWeight: 700, fontSize: 22 }}>cash payment</div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '52px 28px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ color: BLUE, fontWeight: 900, fontSize: 46, letterSpacing: '-0.04em' }}>success</div>
        <div className="tp-success-check tp-pulse" style={{ marginTop: 10 }}><Ic.Check sz={40} sw={3.2} /></div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
          <button className="tp-cta" style={{ minWidth: 180 }} onClick={copyLink}>copy receipt link</button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '8px 20px', borderRadius: 999, border: `1px solid rgba(88,171,255,0.5)`, minWidth: 180 }}>
            <button className="tp-share-btn" onClick={downloadQR}><Ic.DL sz={20} c={BLUE} /></button>
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            <button className="tp-share-btn" onClick={shareSMS}><Ic.Msg sz={20} c={BLUE} /></button>
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            <button className="tp-share-btn" onClick={shareEmail}><Ic.Mail sz={20} c={BLUE} /></button>
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
    <div className="tp-screen" style={{ background: NAVY }}>
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
export default function App({
  liveState           = null,
  onLiveCommit        = null,
  onLiveStockCommit   = null,
  onLiveDetailsCommit = null,
  onLiveCancel        = null,
  onLivePaywave       = null,
  onLiveSend          = null,
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

  const currentId = dockActive !== 'terminal' ? 'dock-' + dockActive : screen;

  const triggerConveyor = (prevId, dir) => {
    setConveyor({ prevId, dir });
    clearTimeout(conveyorTimer.current);
    conveyorTimer.current = setTimeout(() => setConveyor(null), 650);
  };

  const toast = msg => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 1600); };

  const setDockActive = id => {
    if (id === dockActive) return;
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
          onLiveCancel?.();
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
    if (isLive) {
      setLocalDraft({ name, amount });
    } else {
      setState(s => ({ ...s, pending: { id: 'i' + Date.now(), name, amount } }));
    }
    go('home-pop');
  };

  /* Split commit */
  const handleSplitCommit = ({ name, amount, splitEnabled = false }) => {
    if (isLive) {
      setLocalDraft({ name, amount, splitEnabled });
    } else {
      setState(s => ({ ...s, pending: { id: 'i' + Date.now(), name, amount } }));
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
    if (paywaveOn) {
      if (isLive) {
        if (localDraft) {
          try {
            await onLiveSend?.(localDraft, { paywave: true });
            setLocalDraft(null);
          } catch {
            /* draft preserved — error shown by parent */
          }
        } else {
          onLivePaywave?.();
        }
      } else {
        toast('tap-to-pay (demo only)');
      }
      return;
    }
    if (isLive) {
      if (localDraft) {
        try {
          await onLiveSend?.(localDraft, { paywave: false });
          setLocalDraft(null);
        } catch {
          /* draft preserved — error shown by parent */
        }
      }
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
      onLiveDetailsCommit?.({ name, amount });
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
      ? <PendingTerminal state={state} go={go} paywaveOn={paywaveOn} togglePaywave={() => setPaywaveOn(v => !v)} onItemClick={handleStackItemClick} showPaywave={showPaywave} />
      : <MainTerminal    state={state} go={go} paywaveOn={paywaveOn} togglePaywave={() => setPaywaveOn(v => !v)} onItemClick={handleStackItemClick} showPaywave={showPaywave} />;
    if (id === 'keypad')  return <Keypad       state={state} go={go} onCommit={handleCommit} />;
    if (id === 'split')   return <SplitPayment state={state} go={go} onCommitSplit={handleSplitCommit} />;
    if (id === 'stock')   return <ChooseStock  state={state} go={go} onCommitStock={handleStockCommit} />;
    if (id === 'details') return <EnterDetails state={state} go={go} onCommitDetails={handleDetailsCommit} initialAmount={keypadCents} />;
    if (id === 'share')   return <SharePayment state={state} go={go} toast={toast} onExpandQR={() => setShowQRModal(true)} onConfirmPayment={handleShareConfirm} livePayLink={livePayLink} qrElement={qrElement} />;
    if (id === 'cash')         return <CashEntry   go={go} onCommitCash={handleCashCommit} />;
    if (id === 'cash-success') return <CashSuccess state={state} go={go} setState={setState} toast={toast} />;
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
  const fabVisible      = onHome && !showBoards;
  const subbarVisible   = onTerminal && !showBoards;
  const subbarActiveIdx = onTerminal && SCREEN_TO_SUBBAR[screen] !== undefined ? SCREEN_TO_SUBBAR[screen] : -1;
  const dockVisible     = !showBoards && (onHome || !onTerminal);
  const sendVisible     = onHome && !!state.pending;
  const conveyorDir     = conveyor?.dir || 'up';

  return (
    <div className="tp-viewport" ref={viewportRef}>
      <style>{TP_CSS}</style>

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

        <div className={`tp-pfab${fabVisible ? ' show' : ' hide'}`}>
          <FabBtn onClick={() => go('keypad')} />
        </div>

        <div
          className={`tp-psubbar${subbarVisible ? ' show' : ' hide'}${isFeatureScreen ? ' feature' : ''}`}
          style={isFeatureScreen ? { transform: `translate(-50%, calc(${boundaryDelta}px - 100% - 20px))` } : undefined}
        >
          <SubBar activeIdx={subbarActiveIdx} onPick={i => go(SUBBAR_ROUTE[i])} compact={sendVisible} />
          <div className={`tp-send-slot${sendVisible ? ' show' : ''}`}>
            <SendBtn onClick={handleSend} />
          </div>
        </div>

        <div className={`tp-pdock${dockVisible ? ' show' : ' hide'}`}>
          <Dock active={dockActive} onPick={setDockActive} />
        </div>
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
    </div>
  );
}

/* ═══ CSS ═══ */
const TP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');

.tp-viewport {
  width: 100%; max-width: 390px; height: 100vh;
  margin: 0 auto; position: relative; overflow: hidden;
  font-family: 'Outfit', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.tp-screen { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; }

/* ── Top banner (success notification) ── */
.tp-top-banner {
  position: absolute; top: 0; left: 0; right: 0; z-index: 55;
  background: linear-gradient(150deg, #040D6D 0%, #072b20 100%);
  border-bottom: 2px solid #1BBF85;
  box-shadow: 0 8px 40px rgba(27,191,133,0.3);
  padding: 52px 22px 20px;
  display: flex; align-items: center; gap: 16px;
  transform: translateY(-100%);
  transition: transform 0.6s cubic-bezier(0.34,1.56,0.64,1);
  pointer-events: none;
}
.tp-top-banner.show { transform: translateY(0); pointer-events: auto; }
.tp-banner-icon {
  width: 44px; height: 44px; border-radius: 50%;
  background: #1BBF85; color: #040D6D;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  animation: tp-bannerPulse 1.4s ease-out 2;
}
@keyframes tp-bannerPulse {
  0%   { box-shadow: 0 0 0 0 rgba(27,191,133,0.5); }
  70%  { box-shadow: 0 0 0 18px rgba(27,191,133,0); }
  100% { box-shadow: 0 0 0 0 rgba(27,191,133,0); }
}
.tp-banner-body { display: flex; flex-direction: column; }
.tp-banner-title { font-weight: 700; font-size: 16px; color: #fff; }
.tp-banner-amount { font-weight: 900; font-size: 26px; color: #1BBF85; letter-spacing: -0.5px; margin-top: 2px; }

/* ── Subhead ── */
.tp-subhead { display: flex; justify-content: space-between; align-items: center; padding: 20px 22px 0; }
.tp-subhead-btn {
  width: 44px; height: 44px; border-radius: 999px; border: 2px solid #040D6D;
  display: flex; align-items: center; justify-content: center;
  color: #040D6D; background: none; cursor: pointer; transition: transform 120ms, background 120ms;
}
.tp-subhead-btn:active { transform: scale(0.92); background: rgba(4,13,109,0.06); }

/* ── Amount ── */
.tp-amount { font-family: 'Outfit', system-ui; font-weight: 900; letter-spacing: -0.04em; line-height: 0.95; }

/* ── Pills ── */
.tp-pill {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 9999px; padding: 6px 20px;
  font-family: 'Outfit', system-ui; font-weight: 400; font-size: 14px;
  transition: transform 120ms, background 120ms; line-height: 1; cursor: pointer; border: none;
}
.tp-pill:active { transform: scale(0.96); }
.tp-pill.solid   { background: #58ABFF; color: #040D6D; }
.tp-pill.outline { background: transparent; color: #58ABFF; box-shadow: inset 0 0 0 0.1px #58ABFF; }

/* ── SubBar ── */
.tp-subbar-wrap { display: flex; justify-content: center; }
.tp-subbar {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  background: #58ABFF; border-radius: 26px; padding: 5px 11px; gap: 4px;
  border: 1px solid rgba(255,255,255,0.3);
  box-shadow: 0 16px 48px rgba(4,13,109,0.2), 0 4px 12px rgba(4,13,109,0.1), inset 0 1px 0 rgba(255,255,255,0.25);
}
.tp-subbar-ind {
  position: absolute; top: 5px; height: 27px; background: #040D6D; border-radius: 16px;
  box-shadow: 0 4px 16px rgba(4,13,109,0.4); pointer-events: none; z-index: 0; opacity: 0;
  will-change: left, width, opacity;
}
.tp-subbar-ind.on { opacity: 1; }
.tp-subbar-ind.animate {
  transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1), width 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
}
.tp-subbar-btn {
  position: relative; z-index: 1; height: 27px; padding: 0 25px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 16px; border: none; cursor: pointer; background: transparent; color: rgba(4,13,109,0.55);
  transition: padding 0.45s cubic-bezier(0.34,1.56,0.64,1), color 0.3s ease, transform 0.18s ease;
  -webkit-tap-highlight-color: transparent; flex-shrink: 0;
}
.tp-subbar-btn:active { transform: scale(0.92); }
.tp-subbar-btn.active { background: transparent !important; box-shadow: none !important; color: #58ABFF; }
.tp-subbar.compact .tp-subbar-btn { padding: 0 13px; }
.tp-subbar-label {
  font-family: 'Outfit', system-ui; font-weight: 600; font-size: 12px;
  letter-spacing: 0.4px; color: #58ABFF; white-space: nowrap; animation: tp-labelIn 0.3s ease-out;
}
@keyframes tp-labelIn { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }

/* ── Send ── */
.tp-send {
  display: flex; align-items: center; gap: 6px; padding: 4px 14px 4px 4px; border-radius: 26px;
  background: #040D6D; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(4,13,109,0.25);
  transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
  -webkit-tap-highlight-color: transparent; flex-shrink: 0; height: 37px;
}
.tp-send:active { transform: scale(0.94); }
.tp-send-circle { width: 20px; height: 20px; border-radius: 50%; background: #58ABFF; display: flex; align-items: center; justify-content: center; }
.tp-send-label { font-size: 11px; font-weight: 700; color: #58ABFF; letter-spacing: 0.3px; }

/* ── FAB ── */
.tp-fab {
  width: 70px; height: 70px; border-radius: 999px; background: #58ABFF; color: #040D6D;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(4,13,109,0.25);
  border: none; cursor: pointer; transition: transform 140ms; -webkit-tap-highlight-color: transparent;
}
.tp-fab:active { transform: scale(0.92); }

/* ── Dock ── */
.tp-dock-wrap { position: relative; margin: 0 auto 28px; width: 320px; height: 58px; display: flex; align-items: center; justify-content: center; overflow: visible; }
.tp-dock {
  position: relative; width: 280px; height: 48px; background: #040D6D; border-radius: 24px;
  display: flex; align-items: center; justify-content: space-around; padding: 0 16px; overflow: visible;
}
.tp-dock-ind {
  position: absolute; top: -5px; width: 65px; height: 58px; background: #040D6D; border-radius: 29px; z-index: 0;
  box-shadow: 0 4px 20px rgba(0,0,0,0.45); pointer-events: none; will-change: left;
}
.tp-dock-ind.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1); }
.tp-dock-btn {
  position: relative; z-index: 1; background: none; border: none; padding: 8px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: transform 0.25s ease; -webkit-tap-highlight-color: transparent;
}
.tp-dock-btn:active { transform: scale(0.95); }
.tp-dock-btn.active { transform: scale(1.15); }

/* ── Stack ── */
.tp-stack-hdr { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; margin-bottom: 12px; }
.tp-stack-title { font-weight: 700; font-size: 14px; color: #040D6D; letter-spacing: -0.2px; }
.tp-stack-card { border-radius: 14px; background: #fff; overflow: hidden; box-shadow: 0 2px 12px rgba(4,13,109,0.06); border: 1px solid rgba(4,13,109,0.04); }
.tp-stack-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; animation: tp-stackIn 0.38s cubic-bezier(0.34,1.56,0.64,1) both; }
.tp-stack-row + .tp-stack-row { border-top: 1px solid rgba(4,13,109,0.05); }
@keyframes tp-stackIn { from { opacity:0; transform:translateY(-12px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
.tp-stack-row.holdable { cursor: pointer; background: rgba(255,159,67,0.04); }
.tp-stack-row.holdable:active { background: rgba(255,159,67,0.1); }
.tp-stack-name   { font-weight: 600; font-size: 14px; color: #040D6D; margin-bottom: 1px; }
.tp-stack-meta   { display: flex; align-items: center; gap: 5px; }
.tp-stack-status { font-weight: 500; font-size: 11px; color: rgba(4,13,109,0.35); }
.tp-stack-price  { font-weight: 700; font-size: 15px; color: #040D6D; letter-spacing: -0.3px; }
.tp-stack-empty  { padding: 14px 16px; font-size: 13px; color: rgba(4,13,109,0.4); text-align: center; }
.tp-hold-hint    { font-size: 10px; font-weight: 600; color: #FF9F43; }
.tp-dot { width: 5px; height: 5px; border-radius: 50%; animation: tp-pulse 2s ease-in-out infinite; }
.tp-dot.awaiting     { background: #58ABFF; }
.tp-dot.payment-sent { background: #58ABFF; }
.tp-dot.paid         { background: #1BBF85; animation: none; opacity: 1; }
.tp-dot.declined     { background: #FF5B5B; animation: none; opacity: 1; }
.tp-dot.hold         { background: #FF9F43; }
@keyframes tp-pulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }
.tp-stack-split       { display: flex; flex-direction: column; gap: 5px; margin-top: 5px; padding: 6px 8px; background: rgba(4,13,109,0.04); border-radius: 8px; border-left: 3px solid #58ABFF; }
.tp-stack-split-label { font-size: 9px; font-weight: 800; color: #58ABFF; letter-spacing: 0.6px; text-transform: uppercase; }
.tp-stack-split-bars  { display: flex; gap: 4px; align-items: center; }
.tp-split-bar         { height: 7px; flex: 1; border-radius: 4px; background: rgba(4,13,109,0.1); }
.tp-split-bar.filled  { background: #1BBF85; }
.tp-stack-split-dots  { display: flex; gap: 5px; align-items: center; }
.tp-split-dot         { width: 8px; height: 8px; border-radius: 50%; background: rgba(4,13,109,0.12); border: 1.5px solid rgba(4,13,109,0.15); }
.tp-split-dot.filled  { background: #1BBF85; border-color: #1BBF85; }
.tp-stack-split-count { font-size: 12px; font-weight: 700; color: #040D6D; }

/* ── Stock tiles ── */
.tp-stock-tile {
  aspect-ratio: 1/1; background: #F4F4F4; border-radius: 22px; border: none; cursor: pointer;
  transition: transform 120ms, box-shadow 120ms; position: relative;
}
.tp-stock-tile:active { transform: scale(0.95); }
.tp-stock-tile.selected { box-shadow: inset 0 0 0 3px #58ABFF; }
.tp-stock-qty {
  position: absolute; top: 7px; right: 7px;
  min-width: 20px; height: 20px; border-radius: 999px;
  background: #040D6D; color: #58ABFF;
  font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center;
  padding: 0 5px;
}

/* ── Fields ── */
.tp-field {
  width: 100%; padding: 18px 24px; border-radius: 999px;
  background: #F4F4F4; border: none; color: #040D6D;
  font-family: 'Outfit', system-ui; font-weight: 500; font-size: 17px;
  letter-spacing: -0.01em; outline: none; box-sizing: border-box;
}
.tp-field::placeholder { color: rgba(4,13,109,0.35); }

/* ── CTA ── */
.tp-cta {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 14px 36px; border-radius: 999px; background: #58ABFF; color: #040D6D;
  font-family: 'Outfit', system-ui; font-weight: 600; font-size: 15px;
  transition: transform 120ms, opacity 120ms; white-space: nowrap; border: none; cursor: pointer; box-sizing: border-box;
}
.tp-cta:active { transform: scale(0.96); opacity: 0.92; }

/* ── Stepper ── */
.tp-stepper {
  width: 44px; height: 44px; border-radius: 999px; background: #58ABFF; color: #040D6D;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 700; border: none; cursor: pointer; transition: transform 100ms;
}
.tp-stepper:active { transform: scale(0.92); }

/* ── Keypad ── */
.tp-kp {
  width: 76px; height: 76px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Outfit', system-ui; font-weight: 700; font-size: 30px;
  transition: transform 100ms, background 100ms; background: #58ABFF; color: #fff; border: none; cursor: pointer;
}
.tp-kp:active { transform: scale(0.92); }
.tp-kp.outline { background: transparent; color: #58ABFF; box-shadow: inset 0 0 0 2px #58ABFF; }
.tp-kp.outline:active { background: rgba(88,171,255,0.12); }

/* ── QR ── */
.tp-qr-card { width: 220px; height: 220px; border-radius: 28px; background: #040D6D; box-shadow: inset 0 0 0 4px #58ABFF; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.tp-qr-expand {
  position: absolute; bottom: 10px; right: 10px; width: 30px; height: 30px; border-radius: 50%;
  background: rgba(4,13,109,0.55); border: 1.5px solid #58ABFF; color: #58ABFF;
  display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.18s, background 0.18s;
}
.tp-qr-expand:active { transform: scale(0.88); background: rgba(88,171,255,0.25); }
.tp-qr-modal {
  position: absolute; inset: 0; z-index: 50;
  background: rgba(4,13,109,0.82); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  display: flex; align-items: center; justify-content: center; animation: tp-fadeIn 0.22s ease both;
}
.tp-qr-modal-inner {
  position: relative; background: #040D6D; border-radius: 36px;
  padding: 36px 36px 28px; border: 3px solid #58ABFF;
  box-shadow: 0 28px 80px rgba(4,13,109,0.7);
  animation: tp-scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
  display: flex; flex-direction: column; align-items: center;
}
.tp-qr-modal-close {
  position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%;
  border: 1.5px solid rgba(88,171,255,0.5); color: #58ABFF; background: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: background 0.15s, transform 0.15s;
}
.tp-qr-modal-close:active { background: rgba(88,171,255,0.15); transform: scale(0.9); }
@keyframes tp-fadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes tp-scaleIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }

/* ── Share buttons ── */
.tp-share-btn {
  background: none; border: none; cursor: pointer; padding: 8px;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s, opacity 0.15s; border-radius: 50%; -webkit-tap-highlight-color: transparent;
}
.tp-share-btn:active { transform: scale(0.85); opacity: 0.65; }

/* ── Success check ── */
.tp-success-check { width: 92px; height: 92px; border-radius: 999px; background: #58ABFF; display: flex; align-items: center; justify-content: center; color: #040D6D; }
.tp-pulse { animation: tp-pulseDot 1800ms ease-in-out infinite; }
@keyframes tp-pulseDot { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.08); opacity:0.85; } }

/* ── Scroll ── */
.tp-thin-scroll { scrollbar-width: thin; scrollbar-color: rgba(88,171,255,0) transparent; transition: scrollbar-color 350ms; }
.tp-thin-scroll.scrolling { scrollbar-color: #58ABFF transparent; }
.tp-thin-scroll::-webkit-scrollbar { width: 3px; }
.tp-thin-scroll::-webkit-scrollbar-thumb { background-color: rgba(88,171,255,0); border-radius: 999px; }
.tp-thin-scroll.scrolling::-webkit-scrollbar-thumb { background-color: #58ABFF; }
/* Stack scroll — navy thumb, no track, no arrows */
.tp-stack-scroll { scrollbar-width: thin; scrollbar-color: #040D6D transparent; }
.tp-stack-scroll::-webkit-scrollbar { width: 4px; background: transparent; }
.tp-stack-scroll::-webkit-scrollbar-track { background: transparent; }
.tp-stack-scroll::-webkit-scrollbar-thumb { background: #040D6D; border-radius: 999px; }
.tp-stack-scroll::-webkit-scrollbar-button { display: none; height: 0; width: 0; }

/* ── Toast ── */
.tp-toast {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: 28px;
  background: #040D6D; color: #F4F4F4; padding: 12px 22px; border-radius: 999px;
  font-size: 14px; font-weight: 500; opacity: 0; pointer-events: none;
  transition: opacity 200ms, transform 200ms; z-index: 60;
}
.tp-toast.show { opacity: 1; transform: translateX(-50%) translateY(-4px); }

/* ── Conveyor ── */
.tp-layer { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; will-change: transform; z-index: 0; }
.tp-layer.leaving.up   { animation: tp-outUp   0.48s cubic-bezier(0.4,0,0.2,1) both; z-index: 1; }
.tp-layer.leaving.down { animation: tp-outDown 0.48s cubic-bezier(0.4,0,0.2,1) both; z-index: 1; }
.tp-layer.entering.up   { animation: tp-inUp   0.48s cubic-bezier(0.16,1,0.3,1) both; }
.tp-layer.entering.down { animation: tp-inDown 0.48s cubic-bezier(0.16,1,0.3,1) both; }
.tp-layer.leaving.morph { animation: tp-outMorph 0.22s ease-out both; z-index: 1; }
@keyframes tp-outMorph { from { opacity: 1; } to { opacity: 0; } }
@keyframes tp-inUp    { from { transform: translateY(100%);  } to { transform: translateY(0); } }
@keyframes tp-outUp   { from { transform: translateY(0);     } to { transform: translateY(-100%); } }
@keyframes tp-inDown  { from { transform: translateY(-100%); } to { transform: translateY(0); } }
@keyframes tp-outDown { from { transform: translateY(0);     } to { transform: translateY(100%); } }

/* ── popIn ── */
@keyframes tp-popIn { from { opacity:0; transform:translateY(16px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
.stagger { transition: height 0.55s cubic-bezier(0.34,1.56,0.64,1); }
.stagger > * { animation: tp-popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
.stagger > *:nth-child(1) { animation-delay: 0s; }
.stagger > *:nth-child(2) { animation-delay: 0.06s; }
.stagger > *:nth-child(3) { animation-delay: 0.12s; }
.stagger > *:nth-child(4) { animation-delay: 0.18s; }
.stagger > *:nth-child(5) { animation-delay: 0.24s; }
.stagger > *:nth-child(6) { animation-delay: 0.30s; }

/* ── Overlay ── */
.tp-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 30; }
.tp-overlay > * { pointer-events: auto; }
.tp-pfab {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  transition: opacity 240ms cubic-bezier(0,0,0.2,1), transform 360ms cubic-bezier(0.34,1.56,0.64,1);
  will-change: opacity, transform;
}
.tp-pfab.hide { opacity: 0; transform: translate(-50%, -50%) translateY(8px) scale(0.7); pointer-events: none; }
.tp-pfab.show { opacity: 1; }
.tp-psubbar {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, 67px);
  display: flex; align-items: center; gap: 8px;
  transition: opacity 220ms cubic-bezier(0,0,0.2,1), transform 300ms cubic-bezier(0.4,0,0.2,1);
  will-change: opacity, transform;
  height: 37px;
}
.tp-psubbar.hide    { opacity: 0; transform: translate(-50%, 67px) scale(0.92); pointer-events: none; }
.tp-psubbar.show    { opacity: 1; }
.tp-psubbar.feature { transform: translate(-50%, calc(-100% - 20px)); }
.tp-send-slot {
  display: flex; align-items: center; overflow: hidden; max-width: 0; opacity: 0;
  transition: max-width 420ms cubic-bezier(0.34,1.56,0.64,1), opacity 280ms ease 80ms;
  height: 37px;
}
.tp-send-slot.show { max-width: 143px; opacity: 1; }
.tp-pdock {
  position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center;
  transition: opacity 280ms cubic-bezier(0,0,0.2,1), transform 360ms cubic-bezier(0.34,1.56,0.64,1);
  will-change: opacity, transform;
}
.tp-pdock.hide { opacity: 0; transform: translateY(24px); pointer-events: none; }
.tp-pdock.show { opacity: 1; transform: translateY(0); }
`;
