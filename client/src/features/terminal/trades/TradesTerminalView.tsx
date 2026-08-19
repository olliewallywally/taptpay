import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatNzd } from "@/lib/trades-money";
import { TRADES_THEME } from "@/lib/trades-theme";
import "./trades-terminal-view.css";

/* ═══ TOKENS (trades palette via TRADES_THEME — see trades-theme.ts) ═══ */
const NAVY  = TRADES_THEME.INK;    // charcoal base (was property NAVY)
const BLUE  = TRADES_THEME.ACCENT; // safety amber (was property BLUE)
const OFFW  = TRADES_THEME.OFFW;
const GREEN = TRADES_THEME.GREEN;
const RED   = TRADES_THEME.RED;
const AMBER = TRADES_THEME.AMBER;

const fmt = formatNzd; // canonical NZD formatter (Intl en-NZ) — see trades-money.ts

function clientInitials(t: any) {
  return `${t.firstName?.[0] ?? ''}${t.lastName?.[0] ?? ''}`.toUpperCase();
}
function clientName(t: any) { return `${t.firstName} ${t.lastName}`; }

// Map the trades job-invoice status vocabulary to the four dot states the UI shows.
function invoiceStatusFor(inv: any) {
  if (inv.status === 'paid' || inv.status === 'paid_external') return 'paid';
  if (inv.status === 'dispatch_failed') return 'failed';
  if (inv.status === 'dispatched' || inv.status === 'viewed') return 'sent';
  return 'awaiting';
}

// A trades job invoice's human label by kind (3a only sends 'full').
function kindLabel(inv: any) {
  if (inv.kind === 'deposit') return 'deposit';
  if (inv.kind === 'balance') return 'balance';
  return 'invoice';
}

/* ═══ ICONS ═══ */
const Ic = {
  X:       ({ sz = 18, sw = 2.4 }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/></svg>,
  Check:   ({ sz = 20, sw = 2.4 }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Plus:    ({ sz = 28, sw = 3   }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/></svg>,
  Back:    ({ sz = 22           }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Arrow:   () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="8" x2="13" y2="8"/><polyline points="9,4 13,8 9,12"/></svg>,
  Person:  ({ sz = 20, c = NAVY }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7.5" r="4"/><path d="M3.5 21c0-4 3.8-7 8.5-7s8.5 3 8.5 7"/></svg>,
  Send:    ({ sz = 20, c = NAVY }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4 3 11l6 2.5L12 20l3-7z"/><path d="m9 13.5 6-6.5"/></svg>,
  External:({ sz = 20, c = NAVY }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7"/></svg>,
  Search:  ({ sz = 18, c = NAVY }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.5-3.5"/></svg>,
  Mail:    ({ sz = 18, c = BLUE }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>,
  Msg:     ({ sz = 18, c = BLUE }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  Receipt: ({ sz = 20, c = NAVY }: any) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>,
};

/* ═══ SUBBAR — 4 items (clients · quote · invoice · external) ═══ */
const SUBBAR_ITEMS = [
  { id: 'clients',  label: 'clients',  Icon: Ic.Person   },
  { id: 'quote',    label: 'quote',    Icon: Ic.Receipt  },
  { id: 'invoice',  label: 'invoice',  Icon: Ic.Send     },
  { id: 'external', label: 'external', Icon: Ic.External },
];
const SCREEN_TO_SUBBAR: Record<string, number> = { clients: 0, quote: 1, invoice: 2, external: 3 };
const SUBBAR_ROUTE: Record<number, string> = { 0: 'clients', 1: 'quote', 2: 'invoice', 3: 'external' };

function SubBar({ activeIdx = -1, onPick, compact = false, hideLabel = false }: any) {
  const trackRef  = useRef<HTMLDivElement>(null);
  const btnRefs   = useRef<(HTMLElement | null)[]>([]);
  const mounted   = useRef(false);
  const [ind, setInd]       = useState({ x: 0, w: 0, on: false });
  const [animate, setAnim]  = useState(false);

  const measure = (i: number) => {
    const el = btnRefs.current[i];
    if (!el) return { x: 0, w: 0 };
    // Use offsetLeft/offsetWidth, not getBoundingClientRect: the indicator lives
    // inside .tp-subbar's `transform: scale(0.85)`, so its inline left/width are in
    // the track's PRE-scale local space.
    return { x: el.offsetLeft, w: el.offsetWidth };
  };

  useEffect(() => {
    const tick = () => {
      if (activeIdx < 0) { setInd(p => ({ ...p, on: false })); }
      else { const m = measure(activeIdx); setInd({ x: m.x, w: m.w, on: true }); }
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
    <div className="tp-subbar-wrap">
      <div className={`tp-subbar${compact ? ' compact' : ''}`} ref={trackRef}>
        <div className={`tp-subbar-ind${animate ? ' animate' : ''}${ind.on ? ' on' : ''}`} style={{ left: ind.x, width: ind.w }} />
        {SUBBAR_ITEMS.map(({ id, label, Icon }, i) => {
          const active = activeIdx === i;
          const ic = active ? BLUE : 'rgba(244,244,244,0.55)';
          return (
            <button key={id} ref={(el: any) => (btnRefs.current[i] = el)}
              className={`tp-subbar-btn${active ? ' active' : ''}`}
              data-demo-id={`trades-mode-${id}`}
              onClick={() => onPick?.(i)} aria-label={label}>
              <Icon sz={18} c={ic} />
              {active && !hideLabel && <span className="tp-subbar-label">{label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SendBtn({ onClick }: any) {
  return (
    <button className="tp-send" onClick={onClick} aria-label="send">
      <span className="tp-send-circle"><Ic.Arrow /></span>
      <span className="tp-send-label">send</span>
    </button>
  );
}

function FabBtn({ onClick }: any) {
  return (
    <button className="tp-fab" onClick={onClick} aria-label="new invoice">
      <Ic.Plus sz={30} />
    </button>
  );
}

/* ═══ SUCCESS BANNER ═══ */
function TopBanner({ msg }: { msg: string | null }) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!msg) return;
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(timer.current);
  }, [msg]);
  return (
    <div className={`tp-top-banner${show ? ' show' : ''}`}>
      <div className="tp-banner-icon"><Ic.Check sz={20} sw={3} /></div>
      <div className="tp-banner-body">
        <div className="tp-banner-title">{msg}</div>
      </div>
    </div>
  );
}

/* ═══ SUBHEAD (cancel / confirm) ═══ */
function SubHead({ onCancel, onCommit, demoCommitId }: any) {
  return (
    <div className="tp-subhead">
      <button className="tp-subhead-btn" onClick={onCancel} aria-label="cancel"><Ic.X /></button>
      <button className="tp-subhead-btn" onClick={onCommit} aria-label="confirm" data-demo-id={demoCommitId}><Ic.Check /></button>
    </div>
  );
}

/* ═══ SCREEN: JobsHome — the stack of quotes/jobs/invoices ═══ */
function JobsHome({ invoices, outstanding, go, onRowTap }: any) {
  const recent = [...invoices]
    .filter((i: any) => i.status !== 'voided')
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);

  return (
    <div className="tp-screen">
      {/* Top — ink */}
      <div className="stagger" style={{ background: NAVY, height: '50%', padding: '100px 28px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        <div className="tp-amount" style={{ fontSize: 82, color: OFFW }}>{fmt(outstanding)}</div>
        <div style={{ marginTop: 10, color: OFFW, fontWeight: 500, fontSize: 16 }}>outstanding</div>
      </div>
      {/* Bottom — OFFW */}
      <div className="stagger" style={{ flex: 1, background: OFFW, padding: '154px 22px 110px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="tp-stack-title">jobs</div>
        </div>
        <div className="tp-stack-scroll" style={{ flex: 1, overflow: 'auto', paddingRight: 2 }}>
          <div className="tp-stack-card">
            {recent.length === 0 ? (
              <div className="tp-stack-empty">tap + to send an invoice</div>
            ) : recent.map((inv: any) => {
              const st = invoiceStatusFor(inv);
              const dotCls = st === 'paid' ? 'paid' : st === 'failed' ? 'declined' : st === 'sent' ? 'payment-sent' : 'awaiting';
              return (
                <div key={inv.id} className="tp-stack-row" style={{ cursor: 'pointer' }} onClick={() => onRowTap?.(inv)}>
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: OFFW, letterSpacing: '0.02em', marginRight: 12 }}>
                    {(inv.clientName || '??').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tp-stack-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.clientName || '—'}</div>
                    <div className="tp-stack-meta">
                      <span className={`tp-dot ${dotCls}`} />
                      <span className="tp-stack-status">{st}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="tp-stack-price">{fmt(inv.amountCents ?? 0)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ SCREEN: ChooseClient ═══ */
/* Phase A of docs/PLAN-2026-08-17-terminal-panels-and-dock.md. Feature panels
   reserve the dock's measured footprint (--dock-h, published on
   document.documentElement by TerminalDockView) instead of a hand-tuned bottom
   padding. The 0px fallback keeps a dockless mount unchanged.

   Only the panels whose bottom padding is under the dock's 78px get this. The
   ones already sitting at 100px clear it with room to spare and the gate passes
   them; adding another 78px there would reserve 178px of dead space. Those
   literals are still underived, and Phase B deletes all of them with the 50/50
   split. */
const dockPad = (base: string) => `calc(${base} + var(--dock-h, 0px))`;

function ChooseClient({ clients, invoices, go, onSelect, onQuickInvoice }: any) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const active = clients.filter((t: any) => !['archived', 'prospect'].includes(t.status));
  const filtered = active.filter((t: any) =>
    !term || clientName(t).toLowerCase().includes(term) || (t.siteAddress || '').toLowerCase().includes(term)
  );

  const latestInvoice = (cid: string) =>
    [...invoices].filter((i: any) => i.clientProfileId === cid && i.status !== 'voided')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      {/* Top — OFFW */}
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('home', 'down')} onCommit={() => go('home', 'down')} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ color: 'rgba(4,13,109,0.35)', fontWeight: 500, fontSize: 18 }}>choose client</div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      {/* Bottom — INK */}
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: `52px 22px ${dockPad('0px')}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '0 18px', height: 44, marginBottom: 14, flexShrink: 0 }}>
          <Ic.Search sz={16} c="rgba(244,244,244,0.6)" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="search clients or site"
            style={{ flex: 1, border: 'none', background: 'transparent', color: OFFW, fontFamily: 'Outfit, system-ui', fontWeight: 500, fontSize: 14, outline: 'none' }}
          />
        </div>
        <div className="tp-thin-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 130 }}>
          {/* Invoice flow only: skip the client entirely — type details inline */}
          {onQuickInvoice && !q && (
            <button onClick={onQuickInvoice} data-demo-id="trades-quick-invoice"
              style={{ textAlign: 'left', background: 'rgba(88,171,255,0.1)', border: '1.5px dashed rgba(88,171,255,0.45)', borderRadius: 18, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 38, height: 38, borderRadius: 999, border: `1.5px solid ${BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: BLUE }}>
                <Ic.Plus sz={18} sw={2.6} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: OFFW }}>quick invoice</div>
                <div style={{ fontWeight: 400, fontSize: 11.5, color: 'rgba(244,244,244,0.55)', marginTop: 2 }}>no client — just enter their details</div>
              </div>
            </button>
          )}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(244,244,244,0.4)', fontSize: 13 }}>no clients found</div>
          ) : filtered.map((t: any) => {
            const inv = latestInvoice(t.id);
            const amount = inv?.amountCents ?? 0;
            const st = inv ? invoiceStatusFor(inv) : null;
            const dotCls = st === 'paid' ? 'paid' : st === 'failed' ? 'declined' : 'awaiting';
            return (
              <button key={t.id} onClick={() => onSelect(t)} data-demo-id={`trades-client-${t.id}`}
                style={{ textAlign: 'left', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(88,171,255,0.15)', borderRadius: 18, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 38, height: 38, borderRadius: 999, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: OFFW }}>
                  {clientInitials(t)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: OFFW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{clientName(t)}</div>
                  <div style={{ fontWeight: 400, fontSize: 11.5, color: 'rgba(244,244,244,0.55)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.siteAddress}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: OFFW, fontVariantNumeric: 'tabular-nums' }}>{amount ? fmt(amount) : '—'}</div>
                  {st && <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 3 }}><span className={`tp-dot ${dotCls}`} /><span style={{ fontSize: 10, color: 'rgba(244,244,244,0.5)' }}>{st}</span></div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══ SCREEN: AmountKeypad ═══ */
function AmountKeypad({ go, selectedClient, onCommit, backTo = 'invoice' }: any) {
  const [digits, setDigits] = useState('');
  const cents = parseInt(digits || '0', 10);
  const press = (d: string) => { if (digits.length < 7) setDigits(p => p === '' && d === '0' ? '' : p + d); };
  const back  = () => setDigits(p => p.slice(0, -1));
  const commit = () => { if (cents === 0) return; onCommit(cents); };

  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go(backTo, 'down')} onCommit={commit} demoCommitId="trades-amount-confirm" />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="tp-amount" data-demo-id="trades-amount" style={{ fontSize: 82, color: cents === 0 ? 'rgba(4,13,109,0.25)' : NAVY, marginTop: 18 }}>{fmt(cents)}</div>
          {selectedClient && (
            <div style={{ fontWeight: 500, fontSize: 15, color: 'rgba(4,13,109,0.5)', paddingBottom: 8 }}>
              {clientName(selectedClient)} · {selectedClient.siteAddress}
            </div>
          )}
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: `38px 28px ${dockPad('28px')}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'center', justifyItems: 'center' }}>
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} className="tp-kp" data-demo-id={`trades-key-${d}`} onClick={() => press(d)}>{d}</button>
          ))}
          {/* Amounts entered in cents — no decimal key; this cell is an inert spacer. */}
          <div className="tp-kp" style={{ visibility: 'hidden' }} aria-hidden />
          <button className="tp-kp" data-demo-id="trades-key-0" onClick={() => press('0')}>0</button>
          <button className="tp-kp outline" data-demo-id="trades-key-back" onClick={back}><Ic.Back /></button>
        </div>
      </div>
    </div>
  );
}

/* ═══ SCREEN: QuickInvoice — keypad amount → optional note → send (kind: full)
   quickMode: no client — the merchant types recipient details inline instead. ═══ */
function QuickInvoice({ go, selectedClient, quickMode, recipient, setRecipient, amount, onEditAmount, jobNote, setJobNote, splitEnabled, setSplitEnabled, onSend, sending }: any) {
  if (!selectedClient && !quickMode) {
    return (
      <div className="tp-screen" style={{ background: NAVY }}>
        <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
          <SubHead onCancel={() => go('home', 'down')} onCommit={() => go('clients')} />
          <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: 'rgba(4,13,109,0.35)', fontWeight: 500, fontSize: 18 }}>choose a client</div>
          </div>
          <div style={{ height: 52 }} />
        </div>
        <div className="stagger" style={{ flex: 1, background: NAVY, padding: '52px 28px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <button className="tp-cta" onClick={() => go('clients')}>choose client →</button>
        </div>
      </div>
    );
  }

  const isQuick  = quickMode && !selectedClient;
  const channel  = isQuick ? recipient.channel : (selectedClient.preferredChannel || 'email');
  const dest     = isQuick
    ? (channel === 'email' ? recipient.email : recipient.phone)
    : (channel === 'email' ? selectedClient.email : selectedClient.phone);
  const quickOk  = !isQuick || (recipient.name.trim() && (channel === 'email' ? recipient.email.trim() : recipient.phone.trim()));
  const QI_LABEL = { fontWeight: 600, fontSize: 11, color: 'rgba(244,244,244,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 10 };

  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('home', 'down')} onCommit={onSend} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <button onClick={onEditAmount} data-demo-id="trades-invoice-amount" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="tp-amount" style={{ fontSize: 82, color: amount === 0 ? 'rgba(4,13,109,0.25)' : NAVY }}>{fmt(amount)}</span>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'rgba(4,13,109,0.4)', textDecoration: 'underline', textUnderlineOffset: 2 }}>edit</span>
          </button>
          <div style={{ marginTop: 14, fontWeight: 500, fontSize: 16, color: NAVY, lineHeight: 1.4 }}>
            {isQuick ? (recipient.name.trim() || 'new customer') : clientName(selectedClient)}
            {!isQuick && <div style={{ fontWeight: 400, fontSize: 14, color: 'rgba(4,13,109,0.5)', marginTop: 4 }}>{selectedClient.siteAddress}</div>}
            {isQuick && <div style={{ fontWeight: 400, fontSize: 14, color: 'rgba(4,13,109,0.5)', marginTop: 4 }}>quick invoice</div>}
          </div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: isQuick ? '30px 28px 100px' : '40px 28px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: isQuick ? 'auto' : undefined }}>
        {/* Quick mode: inline recipient details */}
        {isQuick && (
          <div style={{ width: '100%', marginBottom: 18 }}>
            <div style={QI_LABEL}>send to</div>
            <input className="tp-field" data-demo-id="trades-recipient-name" value={recipient.name} maxLength={120}
              onChange={e => setRecipient((r: any) => ({ ...r, name: e.target.value }))}
              placeholder="customer name" />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {(['email', 'sms'] as const).map(ch => (
                <button key={ch} type="button" data-demo-id={`trades-recipient-channel-${ch}`} onClick={() => setRecipient((r: any) => ({ ...r, channel: ch }))} aria-pressed={channel === ch}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 999, border: `1.5px solid ${channel === ch ? BLUE : 'rgba(88,171,255,0.25)'}`, background: channel === ch ? BLUE : 'transparent', color: channel === ch ? NAVY : 'rgba(244,244,244,0.65)', fontWeight: 700, fontSize: 12.5, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Outfit, system-ui', transition: 'background 0.18s, color 0.18s, border-color 0.18s' }}>
                  {ch === 'sms' ? 'text' : 'email'}
                </button>
              ))}
            </div>
            {channel === 'email' ? (
              <input key="qi-email" className="tp-field" data-demo-id="trades-recipient-email" type="email" inputMode="email" autoComplete="email" value={recipient.email} maxLength={200}
                onChange={e => setRecipient((r: any) => ({ ...r, email: e.target.value }))}
                placeholder="customer email" style={{ marginTop: 10 }} />
            ) : (
              <input key="qi-phone" className="tp-field" data-demo-id="trades-recipient-phone" type="tel" inputMode="tel" autoComplete="tel" value={recipient.phone} maxLength={40}
                onChange={e => setRecipient((r: any) => ({ ...r, phone: e.target.value }))}
                placeholder="mobile number" style={{ marginTop: 10 }} />
            )}
          </div>
        )}

        {/* Job note */}
        <div style={{ width: '100%' }}>
          <div style={QI_LABEL}>job note <span style={{ opacity: 0.6 }}>· optional</span></div>
          <input className="tp-field" data-demo-id="trades-job-note" value={jobNote} onChange={e => setJobNote(e.target.value)} maxLength={500}
            placeholder="what's this invoice for?" />
        </div>

        {/* Channel badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', background: 'rgba(88,171,255,0.08)', border: `1px solid rgba(88,171,255,0.2)`, borderRadius: 20, width: '100%', boxSizing: 'border-box', marginTop: 18 }}>
          {channel === 'email' ? <Ic.Mail sz={22} c={OFFW} /> : <Ic.Msg sz={22} c={OFFW} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: 'rgba(244,244,244,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>sending via {channel === 'sms' ? 'text' : channel}</div>
            <div style={{ fontWeight: 500, fontSize: 14, color: OFFW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dest || (isQuick ? 'enter details above' : `client's ${channel}`)}
            </div>
          </div>
        </div>

        {/* Split bill — merchant enables; customer divides at pay time */}
        <button type="button" data-demo-id="trades-split-toggle" onClick={() => setSplitEnabled((v: boolean) => !v)} aria-pressed={splitEnabled}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderRadius: 16, marginTop: 14, border: `1px solid ${splitEnabled ? 'rgba(88,171,255,0.4)' : 'rgba(88,171,255,0.15)'}`, background: splitEnabled ? 'rgba(88,171,255,0.1)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', fontFamily: 'Outfit, system-ui' }}>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: BLUE }}>split the bill</span>
            {splitEnabled && <span style={{ display: 'block', fontWeight: 400, fontSize: 11.5, color: 'rgba(88,171,255,0.7)', marginTop: 2 }}>customer can divide this into shares</span>}
          </span>
          <span style={{ width: 42, height: 25, borderRadius: 999, background: splitEnabled ? BLUE : 'rgba(88,171,255,0.25)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: splitEnabled ? 20 : 3, width: 19, height: 19, borderRadius: 999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          className="tp-cta"
          data-demo-id="trades-invoice-send"
          onClick={onSend}
          disabled={sending || amount <= 0 || !quickOk}
          style={{ minWidth: 220, opacity: sending || amount <= 0 || !quickOk ? 0.65 : 1, flexShrink: 0 }}
        >
          {sending ? 'sending…' : 'send invoice'}
        </button>
      </div>
    </div>
  );
}

/* ═══ SCREEN: MarkExternal ═══ */
function MarkExternal({ go, selectedClient, amount, invoices, onMark, marking }: any) {
  const [ref, setRef] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);

  if (!selectedClient) {
    return (
      <div className="tp-screen" style={{ background: NAVY }}>
        <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
          <SubHead onCancel={() => go('home', 'down')} onCommit={() => go('clients')} />
          <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: 'rgba(4,13,109,0.35)', fontWeight: 500, fontSize: 18 }}>choose a client</div>
          </div>
          <div style={{ height: 52 }} />
        </div>
        <div className="stagger" style={{ flex: 1, background: NAVY, padding: '52px 28px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <button className="tp-cta" onClick={() => go('clients')}>choose client →</button>
        </div>
      </div>
    );
  }

  // This client's outstanding job invoices — the merchant picks which one was paid externally.
  const LIVE = ['pending_dispatch', 'dispatched', 'viewed', 'deposit_paid', 'balance_due', 'dispatch_failed'];
  const outstanding = (invoices as any[])
    .filter((i: any) => i.clientProfileId === selectedClient?.id && LIVE.includes(i.status))
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const picked = outstanding.find((i: any) => i.id === pickedId) || outstanding[0] || null;

  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('home', 'down')} onCommit={() => picked && onMark(picked.id, ref)} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="tp-amount" style={{ fontSize: 82 }}>{picked ? fmt(picked.amountCents) : fmt(amount)}</div>
          {selectedClient && (
            <div style={{ marginTop: 14, fontWeight: 500, fontSize: 15, color: NAVY }}>{clientName(selectedClient)}</div>
          )}
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '40px 28px 100px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ color: OFFW, fontWeight: 500, fontSize: 18, textAlign: 'center' }}>mark as received externally</div>
        {!picked && (
          <div style={{ marginTop: 16, textAlign: 'center', color: 'rgba(244,244,244,0.5)', fontSize: 13 }}>no outstanding invoice found for this client</div>
        )}
        {picked && (
          <>
            {outstanding.length > 1 && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(244,244,244,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>which invoice?</div>
                {outstanding.map((inv: any) => {
                  const on = inv.id === picked.id;
                  return (
                    <button key={inv.id} onClick={() => setPickedId(inv.id)}
                      style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: on ? 'rgba(88,171,255,0.18)' : 'rgba(255,255,255,0.05)', border: `1.5px solid ${on ? BLUE : 'rgba(88,171,255,0.12)'}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer', fontFamily: 'Outfit, system-ui' }}>
                      <span style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${on ? BLUE : 'rgba(88,171,255,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {on && <span style={{ width: 8, height: 8, borderRadius: 999, background: BLUE }} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: OFFW, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kindLabel(inv)}</div>
                        <div style={{ fontSize: 10.5, color: 'rgba(244,244,244,0.5)', marginTop: 1 }}>{invoiceStatusFor(inv)}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: OFFW, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(inv.amountCents)}</div>
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <input
                className="tp-field"
                placeholder="reference (optional)"
                value={ref}
                onChange={e => setRef(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="tp-cta" onClick={() => onMark(picked.id, ref)} disabled={marking} style={{ opacity: marking ? 0.65 : 1 }}>
                {marking ? 'marking…' : 'confirm received'}
              </button>
            </div>
          </>
        )}
        {!picked && (
          <div style={{ flex: 1 }} />
        )}
      </div>
    </div>
  );
}

/* ═══ SCREEN: SentSuccess — quick invoices offer "add client" (promotes the
   hidden prospect profile into a real directory client) ═══ */
function SentSuccess({ amount, label, go, showAddClient, onAddClient, addState }: any) {
  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('home', 'down')} onCommit={() => go('home', 'down')} />
        <div style={{ flex: 1, padding: '12px 28px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div className="tp-amount" style={{ fontSize: 82 }}>{fmt(amount)}</div>
          <div style={{ marginTop: 18, fontWeight: 700, fontSize: 22 }}>invoice sent</div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '52px 28px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ color: OFFW, fontWeight: 900, fontSize: 42, letterSpacing: '-0.04em' }}>sent</div>
        <div className="tp-success-check tp-pulse" style={{ marginTop: 14 }}><Ic.Check sz={40} sw={3.2} /></div>
        {label && <div style={{ marginTop: 18, color: 'rgba(244,244,244,0.6)', fontWeight: 500, fontSize: 14 }}>{label}</div>}
        <div style={{ flex: 1 }} />
        {showAddClient && (
          <button
            className="tp-cta-wire"
            onClick={addState === 'idle' ? onAddClient : undefined}
            disabled={addState !== 'idle'}
            style={{ marginBottom: 12, minWidth: 220, opacity: addState === 'saving' ? 0.65 : 1, ...(addState === 'saved' ? { borderColor: GREEN, color: GREEN, cursor: 'default' } : {}) }}
          >
            {addState === 'saving' ? 'saving…' : addState === 'saved' ? 'client saved ✓' : 'add client'}
          </button>
        )}
        <button className="tp-cta" onClick={() => go('home', 'down')}>done</button>
      </div>
    </div>
  );
}

/* ═══ Job action sheet — tap a job row to mark received externally / cancel ═══ */
function JobActionSheet({ invoice, onClose, onMarkReceived, onSendBalance, onComplete, onVoid, busy }: any) {
  const st = invoiceStatusFor(invoice);
  const settled = st === 'paid';
  const [balanceSplit, setBalanceSplit] = useState(false);

  const Action = ({ label, onClick, danger, primary }: any) => (
    <button onClick={onClick} disabled={busy}
      style={{ width: '100%', padding: '15px 0', borderRadius: 16, border: danger ? '1.5px solid rgba(255,59,78,0.4)' : 'none',
        background: danger ? 'transparent' : primary ? NAVY : 'rgba(4,13,109,0.06)',
        color: danger ? RED : primary ? OFFW : NAVY,
        fontWeight: 700, fontSize: 15, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        fontFamily: 'Outfit, system-ui', marginBottom: 10, transition: 'opacity 0.15s' }}>
      {label}
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(4,13,109,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'tp-fade 0.2s ease both' }}>
      <style>{`@keyframes tp-fade{from{opacity:0}to{opacity:1}}@keyframes tp-sheetup{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: OFFW, borderRadius: '26px 26px 0 0', padding: '12px 22px 28px', animation: 'tp-sheetup 0.32s cubic-bezier(0.16,1,0.3,1) both' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 14px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(4,13,109,0.12)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoice.clientName || 'client'}</div>
            <div style={{ fontWeight: 500, fontSize: 12.5, color: 'rgba(4,13,109,0.5)', marginTop: 2 }}>
              {kindLabel(invoice)} · {fmt(invoice.amountCents)}
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999, background: st === 'paid' ? 'rgba(27,191,133,0.14)' : st === 'failed' ? 'rgba(255,59,78,0.12)' : 'rgba(88,171,255,0.16)', color: st === 'paid' ? GREEN : st === 'failed' ? RED : '#3C4248', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{st === 'failed' ? 'not delivered' : st}</div>
        </div>

        {settled ? (
          invoice.completedAt
            ? <div style={{ textAlign: 'center', padding: '8px 0 18px', color: 'rgba(4,13,109,0.5)', fontSize: 14, fontWeight: 500 }}>this job is complete</div>
            : <Action label="mark job complete" onClick={onComplete} primary />
        ) : (
          <>
            <Action label="mark received externally" onClick={onMarkReceived} />
            <Action label="cancel invoice" onClick={onVoid} danger />
          </>
        )}
        {invoice.kind === 'deposit' && settled && !invoice.balanceSent && (
          <>
            <button type="button" onClick={() => setBalanceSplit(v => !v)} aria-pressed={balanceSplit}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 16, marginBottom: 10, border: `1px solid ${balanceSplit ? 'rgba(88,171,255,0.4)' : 'rgba(4,13,109,0.1)'}`, background: balanceSplit ? 'rgba(88,171,255,0.1)' : 'rgba(4,13,109,0.04)', cursor: 'pointer', fontFamily: 'Outfit, system-ui' }}>
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 13.5, color: NAVY }}>split the balance</span>
              <span style={{ width: 42, height: 25, borderRadius: 999, background: balanceSplit ? BLUE : 'rgba(4,13,109,0.15)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: balanceSplit ? 20 : 3, width: 19, height: 19, borderRadius: 999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </span>
            </button>
            <Action label="send remaining balance" onClick={() => onSendBalance(balanceSplit)} primary />
          </>
        )}
        <Action label="close" onClick={onClose} />
      </div>
    </div>
  );
}

/* ═══ SCREEN: QuoteScreen — build & send a quote, PM ChargeBill layout ═══
   White top box (20%): action bar + live total + client.
   Solid navy box (80%, scrollable): client, line items, deposit, notes, total, CTA. */
export type QuoteDraftLine = { id: number; description: string; qty: string; unitPrice: string };
const Q_LABEL = { fontWeight: 600, fontSize: 11, color: 'rgba(88,171,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 10 };
const Q_FIELD = { width: '100%', boxSizing: 'border-box' as const, padding: '13px 15px', borderRadius: 14, background: OFFW, border: 'none', color: NAVY, fontFamily: 'Outfit, system-ui', fontWeight: 500, fontSize: 15, outline: 'none' };
const Q_TOTROW = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' };

export type TradesQuoteTotals = {
  total: number;
  gst: number;
  net: number;
  deposit: number;
};

export type QuoteViewProps = {
  clients: any[];
  clientId: string;
  lines: QuoteDraftLine[];
  depositEnabled: boolean;
  depositType: 'percent' | 'fixed';
  depositValue: string;
  notes: string;
  created: any | null;
  error: string;
  gstRegistered: boolean;
  gstMode: 'inclusive' | 'exclusive';
  totals: TradesQuoteTotals;
  publicUrl: string;
  isCreating: boolean;
  onClientIdChange: (clientId: string) => void;
  onLineChange: (id: number, field: keyof QuoteDraftLine, value: string) => void;
  onRemoveLine: (id: number) => void;
  onAddLine: () => void;
  onDepositEnabledChange: (enabled: boolean) => void;
  onDepositTypeChange: (depositType: 'percent' | 'fixed') => void;
  onDepositValueChange: (value: string) => void;
  onNotesChange: (notes: string) => void;
  onCreate: () => void;
  onCopyLink: () => void;
  onDownloadPdf: () => void;
  onCancel: () => void;
  onExit: () => void;
};

// Querying, writes, clipboard and PDF behavior are injected by the owning controller.
export function QuoteView({
  clients,
  clientId,
  lines,
  depositEnabled,
  depositType,
  depositValue,
  notes,
  created,
  error,
  gstRegistered,
  gstMode,
  totals,
  publicUrl,
  isCreating,
  onClientIdChange,
  onLineChange,
  onRemoveLine,
  onAddLine,
  onDepositEnabledChange,
  onDepositTypeChange,
  onDepositValueChange,
  onNotesChange,
  onCreate,
  onCopyLink,
  onDownloadPdf,
  onCancel,
  onExit,
}: QuoteViewProps) {
  const selected = clients.find((client: any) => client.id === clientId);
  const selectedName = selected ? `${selected.firstName} ${selected.lastName}` : '';
  const ready = !!clientId && totals.total > 0;

  return (
    <div className="tp-screen" style={{ background: NAVY }} data-demo-id="trades-quote">
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '20%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={onCancel} onCommit={() => { if (created) { onExit(); return; } if (ready) onCreate(); }} />
        <div style={{ flex: 1, minHeight: 0, padding: '2px 28px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span className="tp-amount" style={{ fontSize: 44, color: totals.total === 0 ? 'rgba(4,13,109,0.25)' : NAVY }}>{fmt(totals.total)}</span>
          <div style={{ marginTop: 4, fontWeight: 500, fontSize: 13, color: 'rgba(4,13,109,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {created ? 'quote created' : selectedName || 'new quote'}
          </div>
        </div>
      </div>

      <div className="stagger" style={{ flex: 1, background: NAVY, padding: `26px 22px ${dockPad('0px')}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {created ? (
          <>
            <div className="tp-thin-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: GREEN, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>quote created</div>
              <div style={{ fontWeight: 500, fontSize: 14, color: 'rgba(88,171,255,0.75)', marginBottom: 18 }}>
                {created.delivered ? 'Sent to the client.' : 'Delivery was unavailable — share this link instead.'}
              </div>
              <div style={{ ...Q_LABEL }}>customer link</div>
              <input readOnly value={publicUrl} onFocus={event => event.currentTarget.select()} style={{ ...Q_FIELD, marginBottom: 14 }} />
              <button data-demo-id="trades-quote-copy" className="tp-cta-wire" onClick={onCopyLink} style={{ width: '100%', marginBottom: 10 }}>copy link</button>
              <button data-demo-id="trades-quote-pdf" className="tp-cta-wire" onClick={onDownloadPdf} style={{ width: '100%' }}>download PDF</button>
              {error && <p role="alert" style={{ color: RED, fontWeight: 600, marginTop: 12 }}>{error}</p>}
            </div>
            <div style={{ flexShrink: 0, padding: '12px 0 20px', display: 'flex', justifyContent: 'center' }}>
              <button data-demo-id="trades-quote-done" className="tp-cta" onClick={onExit} style={{ minWidth: 220 }}>done</button>
            </div>
          </>
        ) : (
          <>
            <div className="tp-thin-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
              <div style={Q_LABEL}>client</div>
              <select
                data-demo-id="trades-quote-client"
                value={clientId}
                onChange={event => onClientIdChange(event.target.value)}
                style={{ ...Q_FIELD, marginBottom: 20, appearance: 'none' }}
              >
                <option value="">choose client</option>
                {clients
                  .filter((client: any) => !['archived', 'prospect'].includes(client.status))
                  .map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.firstName} {client.lastName} — {client.siteAddress}
                    </option>
                  ))}
              </select>

              <div style={Q_LABEL}>line items</div>
              {lines.map((line, index) => (
                <div key={line.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px 90px 28px', gap: 7, marginBottom: 9 }}>
                  <input
                    data-demo-id={`trades-quote-line-${index}-description`}
                    aria-label={`Item ${index + 1} description`}
                    placeholder="description"
                    value={line.description}
                    onChange={event => onLineChange(line.id, 'description', event.target.value)}
                    style={Q_FIELD}
                  />
                  <input
                    data-demo-id={`trades-quote-line-${index}-quantity`}
                    aria-label="Quantity"
                    inputMode="numeric"
                    placeholder="qty"
                    value={line.qty}
                    onChange={event => onLineChange(line.id, 'qty', event.target.value.replace(/\D/g, ''))}
                    style={{ ...Q_FIELD, padding: '13px 8px', textAlign: 'center' }}
                  />
                  <input
                    data-demo-id={`trades-quote-line-${index}-price`}
                    aria-label="Unit price"
                    inputMode="decimal"
                    placeholder="$0.00"
                    value={line.unitPrice}
                    onChange={event => onLineChange(line.id, 'unitPrice', event.target.value.replace(/[^\d.]/g, ''))}
                    style={{ ...Q_FIELD, padding: '13px 10px' }}
                  />
                  <button
                    aria-label="Remove item"
                    disabled={lines.length === 1}
                    onClick={() => onRemoveLine(line.id)}
                    style={{ border: 0, background: 'none', color: lines.length === 1 ? 'rgba(88,171,255,0.25)' : RED, cursor: lines.length === 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ic.X sz={16} />
                  </button>
                </div>
              ))}
              <button
                data-demo-id="trades-quote-add-line"
                onClick={onAddLine}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: BLUE, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'Outfit, system-ui', padding: '4px 0 18px' }}
              >
                <Ic.Plus sz={16} sw={2.4} /> add line
              </button>

              <button
                data-demo-id="trades-quote-deposit"
                data-tutorial-id="tq-deposit"
                onClick={() => onDepositEnabledChange(!depositEnabled)}
                aria-pressed={depositEnabled}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderRadius: 16, border: `1px solid ${depositEnabled ? 'rgba(88,171,255,0.4)' : 'rgba(88,171,255,0.15)'}`, background: depositEnabled ? 'rgba(88,171,255,0.1)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', fontFamily: 'Outfit, system-ui' }}
              >
                <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 13.5, color: BLUE }}>require deposit</span>
                <span style={{ width: 42, height: 25, borderRadius: 999, background: depositEnabled ? BLUE : 'rgba(88,171,255,0.25)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 3, left: depositEnabled ? 20 : 3, width: 19, height: 19, borderRadius: 999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </span>
              </button>
              {depositEnabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 10 }}>
                  <select
                    data-demo-id="trades-quote-deposit-type"
                    value={depositType}
                    onChange={event => onDepositTypeChange(event.target.value as 'percent' | 'fixed')}
                    style={{ ...Q_FIELD, appearance: 'none' }}
                  >
                    <option value="percent">percentage</option>
                    <option value="fixed">fixed amount</option>
                  </select>
                  <input
                    data-demo-id="trades-quote-deposit-value"
                    value={depositValue}
                    onChange={event => onDepositValueChange(event.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    aria-label="Deposit value"
                    style={Q_FIELD}
                  />
                </div>
              )}

              <div style={{ ...Q_LABEL, marginTop: 20 }}>notes <span style={{ opacity: 0.6 }}>· optional</span></div>
              <textarea
                data-demo-id="trades-quote-notes"
                value={notes}
                onChange={event => onNotesChange(event.target.value)}
                placeholder="quote notes"
                maxLength={1000}
                style={{ ...Q_FIELD, minHeight: 78, resize: 'vertical' }}
              />

              <div data-tutorial-id="tq-totals" style={{ marginTop: 20, background: 'rgba(88,171,255,0.08)', border: '1px solid rgba(88,171,255,0.2)', borderRadius: 16, padding: '14px 16px' }}>
                {gstRegistered && <div style={{ ...Q_TOTROW, color: 'rgba(88,171,255,0.7)', fontSize: 13 }}><span>{gstMode === 'exclusive' ? 'subtotal' : 'subtotal (excl. GST)'}</span><span>{fmt(totals.net)}</span></div>}
                {gstRegistered && <div style={{ ...Q_TOTROW, color: 'rgba(88,171,255,0.7)', fontSize: 13 }}><span>{gstMode === 'exclusive' ? 'GST (15%)' : 'GST (15%) incl.'}</span><span>{fmt(totals.gst)}</span></div>}
                {depositEnabled && <div style={{ ...Q_TOTROW, fontSize: 13 }}><span style={{ color: 'rgba(88,171,255,0.7)' }}>deposit on acceptance</span><strong style={{ color: BLUE }}>{fmt(totals.deposit)}</strong></div>}
                <div style={{ ...Q_TOTROW, borderTop: '1px solid rgba(88,171,255,0.2)', paddingTop: 11, marginTop: 6, fontSize: 17 }}><span style={{ color: '#fff', fontWeight: 700 }}>{gstMode === 'exclusive' && gstRegistered ? 'total (incl GST)' : 'total'}</span><strong style={{ color: '#fff' }}>{fmt(totals.total)}</strong></div>
              </div>
              {error && <p role="alert" style={{ color: RED, fontWeight: 600, marginTop: 12 }}>{error}</p>}
            </div>

            <div style={{ flexShrink: 0, padding: '12px 0 20px', display: 'flex', justifyContent: 'center' }}>
              <button
                data-demo-id="trades-quote-create"
                data-tutorial-id="tq-create"
                className="tp-cta-wire"
                onClick={() => ready && onCreate()}
                disabled={!ready || isCreating}
                style={{ minWidth: 220, opacity: !ready ? 0.5 : 1, ...(isCreating ? { background: BLUE, color: NAVY } : {}) }}
              >
                {isCreating ? 'creating…' : 'create quote'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export type TradesTerminalScreen =
  | 'home'
  | 'clients'
  | 'amount'
  | 'invoice'
  | 'quote'
  | 'profile'
  | 'external'
  | 'success';

export type TradesRecipient = {
  name: string;
  email: string;
  phone: string;
  channel: 'email' | 'sms';
};

type StateUpdater<T> = T | ((current: T) => T);

export type TradesTerminalViewProps = {
  screen: TradesTerminalScreen;
  contentKey: number;
  conveyor: { prevId: TradesTerminalScreen; dir: string } | null;
  clients: any[];
  invoices: any[];
  stackRows: any[];
  outstanding: number;
  selectedClient: any | null;
  amount: number;
  jobNote: string;
  splitEnabled: boolean;
  quickMode: boolean;
  recipient: TradesRecipient;
  allowQuickInvoice: boolean;
  successLabel: string;
  showAddClient: boolean;
  addClientState: 'idle' | 'saving' | 'saved';
  banner: string | null;
  toastMessage: string | null;
  rowAction: any | null;
  quoteView: ReactNode;
  profileView: ReactNode;
  busy: {
    invoice: boolean;
    mark: boolean;
    row: boolean;
  };
  onNavigate: (screen: TradesTerminalScreen, direction?: string) => void;
  onClientSelect: (client: any) => void;
  onQuickInvoice: () => void;
  onAmountCommit: (amountCents: number) => void;
  onRecipientChange: (recipient: StateUpdater<TradesRecipient>) => void;
  onJobNoteChange: (jobNote: string) => void;
  onSplitEnabledChange: (splitEnabled: StateUpdater<boolean>) => void;
  onSendInvoice: () => void;
  onEditAmount: () => void;
  onRowTap: (invoice: any) => void;
  onMarkExternal: (invoiceId: string, reference: string) => void;
  onSubbarPick: (index: number) => void;
  onSendShortcut: () => void;
  onAddClient: () => void;
  onCloseRow: () => void;
  onSendBalance: (splitEnabled: boolean) => void;
  onCompleteRow: () => void;
  onMarkRowReceived: () => void;
  onVoidRow: () => void;
};

// Shared presentation/state-machine boundary. External capabilities stay in owners.
export function TradesTerminalView(props: TradesTerminalViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [boundaryDelta, setBoundaryDelta] = useState(0);
  const isFeatureScreen = props.screen !== 'home' && props.screen !== 'success';

  useEffect(() => {
    if (!isFeatureScreen) {
      setBoundaryDelta(0);
      return;
    }
    if (props.conveyor) return;
    const stage = viewportRef.current;
    if (!stage) return;
    const measure = () => {
      const layers = stage.querySelectorAll('.tp-layer');
      const entering = layers[layers.length - 1];
      const topPanel = entering?.querySelector('.stagger');
      if (!topPanel) return;
      const stageRect = stage.getBoundingClientRect();
      const panelRect = topPanel.getBoundingClientRect();
      setBoundaryDelta(panelRect.bottom - stageRect.top - stageRect.height / 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    stage.querySelectorAll('.tp-layer .stagger').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [isFeatureScreen, props.screen, props.conveyor]);

  const renderScreen = (id: TradesTerminalScreen) => {
    if (id === 'home') return <JobsHome
      invoices={props.stackRows}
      outstanding={props.outstanding}
      go={props.onNavigate}
      onRowTap={props.onRowTap}
    />;
    if (id === 'clients') return <ChooseClient
      clients={props.clients}
      invoices={props.invoices}
      go={props.onNavigate}
      onSelect={props.onClientSelect}
      onQuickInvoice={props.allowQuickInvoice ? props.onQuickInvoice : undefined}
    />;
    if (id === 'amount') return <AmountKeypad
      go={props.onNavigate}
      selectedClient={props.selectedClient}
      backTo="invoice"
      onCommit={props.onAmountCommit}
    />;
    if (id === 'invoice') return <QuickInvoice
      go={props.onNavigate}
      selectedClient={props.selectedClient}
      quickMode={props.quickMode}
      recipient={props.recipient}
      setRecipient={props.onRecipientChange}
      amount={props.amount}
      onEditAmount={props.onEditAmount}
      jobNote={props.jobNote}
      setJobNote={props.onJobNoteChange}
      splitEnabled={props.splitEnabled}
      setSplitEnabled={props.onSplitEnabledChange}
      onSend={props.onSendInvoice}
      sending={props.busy.invoice}
    />;
    if (id === 'quote') return props.quoteView;
    if (id === 'profile') return props.profileView;
    if (id === 'external') return <MarkExternal
      go={props.onNavigate}
      selectedClient={props.selectedClient}
      amount={props.amount}
      invoices={props.invoices}
      onMark={props.onMarkExternal}
      marking={props.busy.mark}
    />;
    if (id === 'success') return <SentSuccess
      amount={props.amount}
      label={props.successLabel}
      go={props.onNavigate}
      showAddClient={props.showAddClient}
      onAddClient={props.onAddClient}
      addState={props.addClientState}
    />;
    return null;
  };

  const subbarVisible = props.screen !== 'success';
  const subbarActiveIdx = SCREEN_TO_SUBBAR[props.screen] ?? -1;
  const fabVisible = props.screen === 'home';
  const sendVisible = props.screen === 'home' && !!props.selectedClient;
  const conveyorDirection = props.conveyor?.dir || 'up';

  return (
    <div
      className="trades-terminal-view tp-viewport"
      ref={viewportRef}
      data-demo-id="trades-terminal"
      data-terminal-screen={props.screen}
    >
      {props.conveyor && (
        <div key={`leave-${props.conveyor.prevId}`} className={`tp-layer leaving ${conveyorDirection}`}>
          {renderScreen(props.conveyor.prevId)}
        </div>
      )}
      <div
        key={`enter-${props.screen}-${props.contentKey}`}
        className={`tp-layer${props.conveyor ? ` entering ${conveyorDirection}` : ''}`}
      >
        {renderScreen(props.screen)}
      </div>

      <div className="tp-overlay">
        <TopBanner msg={props.banner} />
        <div className={`tp-pfab${fabVisible ? ' show' : ' hide'}`}>
          <FabBtn onClick={() => props.onNavigate('clients')} />
        </div>
        <div
          className={`tp-psubbar${subbarVisible ? ' show' : ' hide'}${isFeatureScreen ? ' feature' : ''}`}
          style={isFeatureScreen ? { transform: `translateY(calc(${boundaryDelta}px - 100% - 20px))` } : undefined}
        >
          <div className="tp-subbar-center">
            <SubBar activeIdx={subbarActiveIdx} onPick={props.onSubbarPick} compact={sendVisible} hideLabel={false} />
          </div>
          <div className={`tp-send-slot${sendVisible ? ' show' : ''}`}>
            <SendBtn onClick={props.onSendShortcut} />
          </div>
        </div>
      </div>

      <div className={`tp-toast${props.toastMessage ? ' show' : ''}`}>{props.toastMessage}</div>

      {props.rowAction && (
        <JobActionSheet
          invoice={props.rowAction}
          busy={props.busy.row}
          onClose={props.onCloseRow}
          onSendBalance={props.onSendBalance}
          onComplete={props.onCompleteRow}
          onMarkReceived={props.onMarkRowReceived}
          onVoid={props.onVoidRow}
        />
      )}
    </div>
  );
}

export default TradesTerminalView;
