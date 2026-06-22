import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { tradesFetch, tradesHeaders } from "@/lib/trades-api";
import { TRADES_THEME } from "@/lib/trades-theme";

/* ═══ TOKENS (trades palette via TRADES_THEME — see trades-theme.ts) ═══ */
const NAVY  = TRADES_THEME.INK;    // charcoal base (was property NAVY)
const BLUE  = TRADES_THEME.ACCENT; // safety amber (was property BLUE)
const OFFW  = TRADES_THEME.OFFW;
const GREEN = TRADES_THEME.GREEN;
const RED   = TRADES_THEME.RED;
const AMBER = TRADES_THEME.AMBER;

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

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
function SubHead({ onCancel, onCommit }: any) {
  return (
    <div className="tp-subhead">
      <button className="tp-subhead-btn" onClick={onCancel} aria-label="cancel"><Ic.X /></button>
      <button className="tp-subhead-btn" onClick={onCommit} aria-label="confirm"><Ic.Check /></button>
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
        <div className="tp-amount" style={{ fontSize: 82, color: BLUE }}>{fmt(outstanding)}</div>
        <div style={{ marginTop: 10, color: BLUE, fontWeight: 500, fontSize: 16 }}>outstanding</div>
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
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: BLUE, letterSpacing: '0.02em', marginRight: 12 }}>
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
function ChooseClient({ clients, invoices, go, onSelect }: any) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const active = clients.filter((t: any) => t.status !== 'archived');
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
          <div style={{ color: 'rgba(26,29,33,0.35)', fontWeight: 500, fontSize: 18 }}>choose client</div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      {/* Bottom — INK */}
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '52px 22px 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '0 18px', height: 44, marginBottom: 14, flexShrink: 0 }}>
          <Ic.Search sz={16} c="rgba(255,122,26,0.6)" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="search clients or site"
            style={{ flex: 1, border: 'none', background: 'transparent', color: BLUE, fontFamily: 'Outfit, system-ui', fontWeight: 500, fontSize: 14, outline: 'none' }}
          />
        </div>
        <div className="tp-thin-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 130 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,122,26,0.4)', fontSize: 13 }}>no clients found</div>
          ) : filtered.map((t: any) => {
            const inv = latestInvoice(t.id);
            const amount = inv?.amountCents ?? 0;
            const st = inv ? invoiceStatusFor(inv) : null;
            const dotCls = st === 'paid' ? 'paid' : st === 'failed' ? 'declined' : 'awaiting';
            return (
              <button key={t.id} onClick={() => onSelect(t)}
                style={{ textAlign: 'left', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,122,26,0.15)', borderRadius: 18, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 38, height: 38, borderRadius: 999, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: NAVY }}>
                  {clientInitials(t)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BLUE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{clientName(t)}</div>
                  <div style={{ fontWeight: 400, fontSize: 11.5, color: 'rgba(255,122,26,0.55)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.siteAddress}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, fontVariantNumeric: 'tabular-nums' }}>{amount ? fmt(amount) : '—'}</div>
                  {st && <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 3 }}><span className={`tp-dot ${dotCls}`} /><span style={{ fontSize: 10, color: 'rgba(255,122,26,0.5)' }}>{st}</span></div>}
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
        <SubHead onCancel={() => go(backTo, 'down')} onCommit={commit} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="tp-amount" style={{ fontSize: 82, color: cents === 0 ? 'rgba(26,29,33,0.25)' : NAVY, marginTop: 18 }}>{fmt(cents)}</div>
          {selectedClient && (
            <div style={{ fontWeight: 500, fontSize: 15, color: 'rgba(26,29,33,0.5)', paddingBottom: 8 }}>
              {clientName(selectedClient)} · {selectedClient.siteAddress}
            </div>
          )}
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '38px 28px 28px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'center', justifyItems: 'center' }}>
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} className="tp-kp" onClick={() => press(d)}>{d}</button>
          ))}
          {/* Amounts entered in cents — no decimal key; this cell is an inert spacer. */}
          <div className="tp-kp" style={{ visibility: 'hidden' }} aria-hidden />
          <button className="tp-kp" onClick={() => press('0')}>0</button>
          <button className="tp-kp outline" onClick={back}><Ic.Back /></button>
        </div>
      </div>
    </div>
  );
}

/* ═══ SCREEN: QuickInvoice — keypad amount → optional note → send (kind: full) ═══ */
function QuickInvoice({ go, selectedClient, amount, onEditAmount, jobNote, setJobNote, onSend, sending }: any) {
  if (!selectedClient) {
    return (
      <div className="tp-screen" style={{ background: NAVY }}>
        <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
          <SubHead onCancel={() => go('home', 'down')} onCommit={() => go('clients')} />
          <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: 'rgba(26,29,33,0.35)', fontWeight: 500, fontSize: 18 }}>choose a client</div>
          </div>
          <div style={{ height: 52 }} />
        </div>
        <div className="stagger" style={{ flex: 1, background: NAVY, padding: '52px 28px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <button className="tp-cta" onClick={() => go('clients')}>choose client →</button>
        </div>
      </div>
    );
  }

  const channel = selectedClient.preferredChannel || 'email';
  const dest    = channel === 'email' ? selectedClient.email : selectedClient.phone;

  return (
    <div className="tp-screen" style={{ background: NAVY }}>
      <div className="stagger" style={{ background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column' }}>
        <SubHead onCancel={() => go('home', 'down')} onCommit={onSend} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <button onClick={onEditAmount} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="tp-amount" style={{ fontSize: 82, color: amount === 0 ? 'rgba(26,29,33,0.25)' : NAVY }}>{fmt(amount)}</span>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'rgba(26,29,33,0.4)', textDecoration: 'underline', textUnderlineOffset: 2 }}>edit</span>
          </button>
          <div style={{ marginTop: 14, fontWeight: 500, fontSize: 16, color: NAVY, lineHeight: 1.4 }}>
            {clientName(selectedClient)}
            <div style={{ fontWeight: 400, fontSize: 14, color: 'rgba(26,29,33,0.5)', marginTop: 4 }}>{selectedClient.siteAddress}</div>
          </div>
        </div>
        <div style={{ height: 52 }} />
      </div>
      <div className="stagger" style={{ flex: 1, background: NAVY, padding: '40px 28px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Job note */}
        <div style={{ width: '100%' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: 'rgba(255,122,26,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>job note <span style={{ opacity: 0.6 }}>· optional</span></div>
          <input className="tp-field" value={jobNote} onChange={e => setJobNote(e.target.value)} maxLength={500}
            placeholder="what's this invoice for?" />
        </div>

        {/* Channel badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', background: 'rgba(255,122,26,0.08)', border: `1px solid rgba(255,122,26,0.2)`, borderRadius: 20, width: '100%', boxSizing: 'border-box', marginTop: 18 }}>
          {channel === 'email' ? <Ic.Mail sz={22} c={BLUE} /> : <Ic.Msg sz={22} c={BLUE} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: 'rgba(255,122,26,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>sending via {channel}</div>
            <div style={{ fontWeight: 500, fontSize: 14, color: BLUE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dest || `client's ${channel}`}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button
          className="tp-cta"
          onClick={onSend}
          disabled={sending || amount <= 0}
          style={{ minWidth: 220, opacity: sending || amount <= 0 ? 0.65 : 1 }}
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
            <div style={{ color: 'rgba(26,29,33,0.35)', fontWeight: 500, fontSize: 18 }}>choose a client</div>
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
        <div style={{ color: BLUE, fontWeight: 500, fontSize: 18, textAlign: 'center' }}>mark as received externally</div>
        {!picked && (
          <div style={{ marginTop: 16, textAlign: 'center', color: 'rgba(255,122,26,0.5)', fontSize: 13 }}>no outstanding invoice found for this client</div>
        )}
        {picked && (
          <>
            {outstanding.length > 1 && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,122,26,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>which invoice?</div>
                {outstanding.map((inv: any) => {
                  const on = inv.id === picked.id;
                  return (
                    <button key={inv.id} onClick={() => setPickedId(inv.id)}
                      style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: on ? 'rgba(255,122,26,0.18)' : 'rgba(255,255,255,0.05)', border: `1.5px solid ${on ? BLUE : 'rgba(255,122,26,0.12)'}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer', fontFamily: 'Outfit, system-ui' }}>
                      <span style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${on ? BLUE : 'rgba(255,122,26,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {on && <span style={{ width: 8, height: 8, borderRadius: 999, background: BLUE }} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: BLUE, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kindLabel(inv)}</div>
                        <div style={{ fontSize: 10.5, color: 'rgba(255,122,26,0.5)', marginTop: 1 }}>{invoiceStatusFor(inv)}</div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: BLUE, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(inv.amountCents)}</div>
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

/* ═══ SCREEN: SentSuccess ═══ */
function SentSuccess({ amount, label, go }: any) {
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
        <div style={{ color: BLUE, fontWeight: 900, fontSize: 42, letterSpacing: '-0.04em' }}>sent</div>
        <div className="tp-success-check tp-pulse" style={{ marginTop: 14 }}><Ic.Check sz={40} sw={3.2} /></div>
        {label && <div style={{ marginTop: 18, color: 'rgba(255,122,26,0.6)', fontWeight: 500, fontSize: 14 }}>{label}</div>}
        <div style={{ flex: 1 }} />
        <button className="tp-cta" onClick={() => go('home', 'down')}>done</button>
      </div>
    </div>
  );
}

/* ═══ Job action sheet — tap a job row to mark received externally / cancel ═══ */
function JobActionSheet({ invoice, onClose, onMarkReceived, onSendBalance, onComplete, onVoid, busy }: any) {
  const st = invoiceStatusFor(invoice);
  const settled = st === 'paid';

  const Action = ({ label, onClick, danger, primary }: any) => (
    <button onClick={onClick} disabled={busy}
      style={{ width: '100%', padding: '15px 0', borderRadius: 16, border: danger ? '1.5px solid rgba(255,59,78,0.4)' : 'none',
        background: danger ? 'transparent' : primary ? NAVY : 'rgba(26,29,33,0.06)',
        color: danger ? RED : primary ? BLUE : NAVY,
        fontWeight: 700, fontSize: 15, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        fontFamily: 'Outfit, system-ui', marginBottom: 10, transition: 'opacity 0.15s' }}>
      {label}
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(26,29,33,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'tp-fade 0.2s ease both' }}>
      <style>{`@keyframes tp-fade{from{opacity:0}to{opacity:1}}@keyframes tp-sheetup{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: OFFW, borderRadius: '26px 26px 0 0', padding: '12px 22px 28px', animation: 'tp-sheetup 0.32s cubic-bezier(0.16,1,0.3,1) both' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 14px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(26,29,33,0.12)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoice.clientName || 'client'}</div>
            <div style={{ fontWeight: 500, fontSize: 12.5, color: 'rgba(26,29,33,0.5)', marginTop: 2 }}>
              {kindLabel(invoice)} · {fmt(invoice.amountCents)}
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999, background: st === 'paid' ? 'rgba(27,191,133,0.14)' : st === 'failed' ? 'rgba(255,59,78,0.12)' : 'rgba(255,122,26,0.16)', color: st === 'paid' ? GREEN : st === 'failed' ? RED : '#C2540D', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{st === 'failed' ? 'not delivered' : st}</div>
        </div>

        {settled ? (
          invoice.completedAt
            ? <div style={{ textAlign: 'center', padding: '8px 0 18px', color: 'rgba(26,29,33,0.5)', fontSize: 14, fontWeight: 500 }}>this job is complete</div>
            : <Action label="mark job complete" onClick={onComplete} primary />
        ) : (
          <>
            <Action label="mark received externally" onClick={onMarkReceived} />
            <Action label="cancel invoice" onClick={onVoid} danger />
          </>
        )}
        {invoice.kind === 'deposit' && settled && !invoice.balanceSent && <Action label="send remaining balance" onClick={onSendBalance} primary />}
        <Action label="close" onClick={onClose} />
      </div>
    </div>
  );
}

/* ═══ MAIN ═══ */
export default function TradesTerminal() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  /* State */
  const [screen, setScreen]                 = useState('home');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [amount, setAmount]                 = useState(0);
  const [jobNote, setJobNote]               = useState('');
  const [conveyor, setConveyor]             = useState<any>(null);
  const [contentKey, setContentKey]         = useState(0);
  const [toastMsg, setToastMsg]             = useState<string | null>(null);
  const [banner, setBanner]                 = useState<string | null>(null);
  const [successLabel, setSuccessLabel]     = useState('');
  const [boundaryDelta, setBoundaryDelta]   = useState(0);
  // When invoice/external is tapped from the subbar without a client, remember where to go after selection.
  const [pendingDest, setPendingDest]       = useState<'invoice' | 'external' | null>(null);
  // Tapped job row → action sheet (mark received / cancel).
  const [rowAction, setRowAction]           = useState<any>(null);
  const conveyorTimer = useRef<ReturnType<typeof setTimeout>>();
  const viewportRef = useRef<HTMLDivElement>(null);

  /* Data */
  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/clients'],
    queryFn: () => tradesFetch('/api/trades/clients').then(r => r.ok ? r.json() : []),
    staleTime: 60000, retry: false,
  });

  const { data: rawInvoices = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/invoices'],
    queryFn: () => tradesFetch('/api/trades/invoices').then(r => r.ok ? r.json() : []),
    staleTime: 30000, retry: false,
  });

  const { data: rawQuotes = [] } = useQuery<any[]>({
    queryKey: ['/api/trades/quotes'],
    queryFn: () => tradesFetch('/api/trades/quotes').then(r => r.ok ? r.json() : []),
    staleTime: 30000, retry: false,
  });

  // The invoices endpoint returns plain rows; decorate each with its client's name
  // (looked up from the clients query) so the stack + action sheet can show it.
  const clientById = (id: string) => (clients as any[]).find((c: any) => c.id === id);
  const invoices = (rawInvoices as any[]).map((i: any) => {
    const c = clientById(i.clientProfileId);
    const balanceSent = i.kind === 'deposit' && (rawInvoices as any[]).some((other: any) => other.quoteId === i.quoteId && other.kind === 'balance' && other.status !== 'voided');
    return { ...i, clientName: c ? clientName(c) : '', balanceSent };
  });
  const quoteRows = (rawQuotes as any[])
    .filter((q: any) => !['accepted', 'expired'].includes(q.status))
    .map((q: any) => {
      const c = clientById(q.clientProfileId);
      return { ...q, id: `quote-${q.id}`, quoteId: q.id, isQuote: true, kind: 'quote', amountCents: q.totalCents, clientName: c ? clientName(c) : '' };
    });
  const stackRows = [...quoteRows, ...invoices].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  /* Mutations */
  const invoiceMutation = useMutation({
    mutationFn: async ({ clientId, amountCents, channel, jobDetails }: any) => {
      const due = new Date(); due.setDate(due.getDate() + 7);
      const r = await fetch('/api/trades/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...tradesHeaders() },
        body: JSON.stringify({
          clientProfileId: clientId, amountCents, deliveryChannel: channel,
          dueAt: due.toISOString(), kind: 'full',
          jobDetails: jobDetails || undefined,
        }),
      });
      if (!r.ok) {
        const msg = await r.json().then((d: any) => d.message).catch(() => 'Failed to send invoice');
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] });
      setSuccessLabel(selectedClient?.email || selectedClient?.phone || '');
      setContentKey(k => k + 1);
      setScreen('success');
    },
    onError: (err: any) => { toast(err?.message || 'Failed to send invoice'); },
  });

  const markMutation = useMutation({
    mutationFn: async ({ invoiceId, ref }: any) => {
      const r = await fetch(`/api/trades/invoices/${invoiceId}/mark-paid-external`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...tradesHeaders() },
        body: JSON.stringify({ externalPaymentReference: ref || null }),
      });
      if (!r.ok) throw new Error('Failed to mark');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] });
      setBanner('Marked as received');
      triggerConveyor(screen, 'down');
      setScreen('home');
      setSelectedClient(null);
      setRowAction(null);
    },
  });

  // Cancel (void) a single job invoice — from the row action sheet.
  const voidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const r = await fetch(`/api/trades/invoices/${invoiceId}/void`, { method: 'POST', headers: tradesHeaders() });
      if (!r.ok) throw new Error('Failed to cancel');
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] }); setBanner('Invoice cancelled'); setRowAction(null); },
    onError: (e: any) => { toast(e?.message || 'Could not cancel'); },
  });

  const jobActionMutation = useMutation({
    mutationFn: async ({ invoiceId, action }: { invoiceId: string; action: 'send-balance' | 'complete' }) => {
      const r = await fetch(`/api/trades/invoices/${invoiceId}/${action}`, { method: 'POST', headers: tradesHeaders() });
      if (!r.ok) throw new Error(await r.json().then((d: any) => d.message).catch(() => 'Action failed'));
      return r.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/invoices'] });
      setBanner(vars.action === 'send-balance' ? 'Balance invoice created' : 'Job completed');
      setRowAction(null);
    },
    onError: (e: any) => toast(e?.message || 'Action failed'),
  });

  /* Helpers */
  const toast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 1600); };
  const outstanding = (invoices as any[])
    .filter((i: any) => ['pending_dispatch', 'dispatched', 'viewed', 'deposit_paid', 'balance_due', 'dispatch_failed'].includes(i.status))
    .reduce((s: number, i: any) => s + (i.amountCents ?? 0), 0);

  const triggerConveyor = (prevId: string, dir: string) => {
    setConveyor({ prevId, dir });
    clearTimeout(conveyorTimer.current);
    conveyorTimer.current = setTimeout(() => setConveyor(null), 650);
  };

  const go = (next: string, dir = 'up') => {
    if (next === 'home') {
      triggerConveyor(screen, dir);
      setScreen('home');
      setSelectedClient(null);
      setAmount(0);
      setJobNote('');
      setPendingDest(null);
      return;
    }
    // invoice/external with no client: remember destination, go to client picker
    if ((next === 'invoice' || next === 'external') && !selectedClient) {
      setPendingDest(next as 'invoice' | 'external');
      if (screen === 'home') triggerConveyor(screen, 'up');
      setContentKey(k => k + 1);
      setScreen('clients');
      return;
    }
    if (screen === 'home') triggerConveyor(screen, dir);
    setContentKey(k => k + 1);
    setScreen(next);
  };

  const handleClientSelect = (c: any) => {
    setSelectedClient(c);
    setContentKey(k => k + 1);
    const dest = pendingDest || 'invoice';
    setPendingDest(null);
    if (dest === 'external') { setScreen('external'); return; }
    setAmount(0);
    setJobNote('');
    setScreen('amount');
  };

  const handleRowTap = (inv: any) => {
    if (inv.isQuote) { setLocation(`/trades/clients/${inv.clientProfileId}`); return; }
    setRowAction(inv);
  };

  const handleVoid = () => {
    const inv = rowAction;
    if (!inv) return;
    if (window.confirm('Cancel this invoice? The client will no longer be able to pay it. This cannot be undone.')) {
      voidMutation.mutate(inv.id);
    }
  };

  // Send button / FAB entry into the invoice flow.
  const handleSend = () => {
    if (!selectedClient) { go('clients'); return; }
    go('invoice');
  };

  const handleMark = (invoiceId: string, ref: string) => {
    markMutation.mutate({ invoiceId, ref });
  };

  /* Subbar → go shortcut */
  const handleSubbarPick = (i: number) => {
    const dest = SUBBAR_ROUTE[i];
    if (!dest || dest === screen) return;
    if (dest === 'quote') { setLocation('/trades/quote'); return; }
    if ((dest === 'invoice' || dest === 'external') && !selectedClient) {
      setPendingDest(dest as 'invoice' | 'external');
      if (screen === 'home') triggerConveyor(screen, 'up');
      setContentKey(k => k + 1);
      setScreen('clients');
      return;
    }
    if (screen === 'home') triggerConveyor(screen, 'up');
    setContentKey(k => k + 1);
    setScreen(dest);
  };

  /* Boundary delta for subbar positioning on feature screens */
  const isFeatureScreen = screen !== 'home' && screen !== 'success';
  const currentId = screen;

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
      setBoundaryDelta(panelRect.bottom - stageRect.top - stageRect.height / 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    stage.querySelectorAll('.tp-layer .stagger').forEach((el: any) => ro.observe(el));
    return () => ro.disconnect();
  }, [isFeatureScreen, screen, conveyor]);

  const subbarVisible   = screen !== 'success';
  const subbarActiveIdx = SCREEN_TO_SUBBAR[screen] ?? -1;
  const fabVisible      = screen === 'home';
  const sendVisible     = screen === 'home' && !!selectedClient;
  const conveyorDir     = conveyor?.dir || 'up';

  const renderScreen = (id: string) => {
    if (id === 'home')     return <JobsHome invoices={stackRows} outstanding={outstanding} go={go} onRowTap={handleRowTap} />;
    if (id === 'clients')  return <ChooseClient clients={clients} invoices={invoices} go={go} onSelect={handleClientSelect} />;
    if (id === 'amount')   return <AmountKeypad go={go} selectedClient={selectedClient} backTo={'invoice'} onCommit={(c: number) => { setAmount(c); go('invoice'); }} />;
    if (id === 'invoice')  return <QuickInvoice go={go} selectedClient={selectedClient} amount={amount} onEditAmount={() => go('amount')} jobNote={jobNote} setJobNote={setJobNote} onSend={() => { if (!selectedClient || amount <= 0) { toast('set an amount first'); return; } invoiceMutation.mutate({ clientId: selectedClient.id, amountCents: amount, channel: selectedClient.preferredChannel || 'email', jobDetails: jobNote }); }} sending={invoiceMutation.isPending} />;
    if (id === 'external') return <MarkExternal go={go} selectedClient={selectedClient} amount={amount} invoices={invoices} onMark={handleMark} marking={markMutation.isPending} />;
    if (id === 'success')  return <SentSuccess amount={amount} label={successLabel} go={go} />;
    return null;
  };

  return (
    <div className="tp-viewport" ref={viewportRef}>
      <style>{TP_TERM_CSS}</style>

      {conveyor && (
        <div key={'leave-' + conveyor.prevId} className={`tp-layer leaving ${conveyorDir}`}>
          {renderScreen(conveyor.prevId)}
        </div>
      )}
      <div key={'enter-' + currentId + '-' + contentKey} className={`tp-layer${conveyor ? ' entering ' + conveyorDir : ''}`}>
        {renderScreen(currentId)}
      </div>

      <div className="tp-overlay">
        <TopBanner msg={banner} />

        <div className={`tp-pfab${fabVisible ? ' show' : ' hide'}`}>
          <FabBtn onClick={() => go('clients')} />
        </div>

        <div
          className={`tp-psubbar${subbarVisible ? ' show' : ' hide'}${isFeatureScreen ? ' feature' : ''}`}
          style={isFeatureScreen ? { transform: `translateY(calc(${boundaryDelta}px - 100% - 20px))` } : undefined}
        >
          <div className="tp-subbar-center">
            <SubBar activeIdx={subbarActiveIdx} onPick={handleSubbarPick} compact={sendVisible} hideLabel={false} />
          </div>
          <div className={`tp-send-slot${sendVisible ? ' show' : ''}`}>
            <SendBtn onClick={handleSend} />
          </div>
        </div>
      </div>

      <div className={`tp-toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>

      {rowAction && (
        <JobActionSheet
          invoice={rowAction}
          busy={voidMutation.isPending || markMutation.isPending || jobActionMutation.isPending}
          onClose={() => setRowAction(null)}
          onSendBalance={() => jobActionMutation.mutate({ invoiceId: rowAction.id, action: 'send-balance' })}
          onComplete={() => jobActionMutation.mutate({ invoiceId: rowAction.id, action: 'complete' })}
          onMarkReceived={() => { markMutation.mutate({ invoiceId: rowAction.id, ref: '' }); }}
          onVoid={handleVoid}
        />
      )}
    </div>
  );
}

/* ═══ CSS (same shell as SmartTransitions TP_CSS — solid hex interpolated from
   TRADES_THEME so the chrome matches the vertical; rgba tints are deferred to 3c) ═══ */
const TP_TERM_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
.tp-viewport { width: 100%; max-width: 430px; height: 100svh; margin: 0 auto; position: relative; overflow: hidden; font-family: 'Outfit', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.tp-screen { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; }
.tp-top-banner { position: absolute; top: 0; left: 0; right: 0; z-index: 55; background: linear-gradient(150deg,${NAVY} 0%,#072b20 100%); border-bottom: 2px solid ${GREEN}; box-shadow: 0 8px 40px rgba(27,191,133,0.3); padding: 52px 22px 20px; display: flex; align-items: center; gap: 16px; transform: translateY(-100%); transition: transform 0.6s cubic-bezier(0.34,1.56,0.64,1); pointer-events: none; }
.tp-top-banner.show { transform: translateY(0); pointer-events: auto; }
.tp-banner-icon { width: 44px; height: 44px; border-radius: 50%; background: ${GREEN}; color: ${NAVY}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tp-banner-body { display: flex; flex-direction: column; }
.tp-banner-title { font-weight: 700; font-size: 16px; color: #fff; }
.tp-subhead { display: flex; justify-content: space-between; align-items: center; padding: 20px 22px 0; }
.tp-subhead-btn { width: 44px; height: 44px; border-radius: 999px; border: 2px solid ${NAVY}; display: flex; align-items: center; justify-content: center; color: ${NAVY}; background: none; cursor: pointer; transition: transform 120ms, background 120ms; }
.tp-subhead-btn:active { transform: scale(0.92); background: rgba(26,29,33,0.06); }
.tp-amount { font-family: 'Outfit', system-ui; font-weight: 900; letter-spacing: -0.04em; line-height: 0.95; }
.tp-subbar-wrap { display: flex; justify-content: center; }
.tp-subbar { position: relative; display: inline-flex; align-items: center; justify-content: center; background: ${BLUE}; border-radius: 26px; padding: 5px 11px; gap: 4px; border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 16px 48px rgba(26,29,33,0.2), 0 4px 12px rgba(26,29,33,0.1), inset 0 1px 0 rgba(255,255,255,0.25); transform: scale(0.85); transform-origin: center; }
.tp-subbar-ind { position: absolute; top: 5px; height: 27px; background: ${NAVY}; border-radius: 16px; box-shadow: 0 4px 16px rgba(26,29,33,0.4); pointer-events: none; z-index: 2; opacity: 0; will-change: left, width, opacity; }
.tp-subbar-ind.on { opacity: 1; }
.tp-subbar-ind.animate { transition: left 0.45s cubic-bezier(0.34,1.56,0.64,1), width 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease; }
.tp-subbar-btn { position: relative; z-index: 1; height: 27px; padding: 0 22px; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 16px; border: none; cursor: pointer; background: transparent; color: rgba(244,244,244,0.55); transition: color 0.2s ease, transform 0.18s ease; -webkit-tap-highlight-color: transparent; flex-shrink: 0; }
.tp-subbar-btn:active { transform: scale(0.92); }
.tp-subbar-btn.active { background: transparent !important; box-shadow: none !important; color: ${BLUE}; z-index: 3; }
.tp-subbar.compact .tp-subbar-btn { padding: 0 11px; }
.tp-subbar-label { font-family: 'Outfit', system-ui; font-weight: 600; font-size: 12px; letter-spacing: 0.4px; color: ${BLUE}; white-space: nowrap; animation: tp-labelIn 0.3s ease-out; }
@keyframes tp-labelIn { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
.tp-send { display: flex; align-items: center; gap: 6px; padding: 4px 14px 4px 4px; border-radius: 26px; background: ${NAVY}; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(26,29,33,0.25); transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); -webkit-tap-highlight-color: transparent; flex-shrink: 0; height: 37px; }
.tp-send:active { transform: scale(0.94); }
.tp-send-circle { width: 20px; height: 20px; border-radius: 50%; background: ${BLUE}; display: flex; align-items: center; justify-content: center; }
.tp-send-label { font-size: 11px; font-weight: 700; color: ${BLUE}; letter-spacing: 0.3px; }
.tp-fab { width: 70px; height: 70px; border-radius: 999px; background: ${BLUE}; color: ${NAVY}; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(26,29,33,0.25); border: none; cursor: pointer; transition: transform 140ms; -webkit-tap-highlight-color: transparent; }
.tp-fab:active { transform: scale(0.92); }
.tp-stack-hdr { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; margin-bottom: 12px; }
.tp-stack-title { font-weight: 700; font-size: 14px; color: ${NAVY}; letter-spacing: -0.2px; }
.tp-stack-card { border-radius: 14px; background: #fff; overflow: hidden; box-shadow: 0 2px 12px rgba(26,29,33,0.06); border: 1px solid rgba(26,29,33,0.04); }
.tp-stack-row { display: flex; align-items: center; padding: 14px 16px; animation: tp-stackIn 0.38s cubic-bezier(0.34,1.56,0.64,1) both; }
.tp-stack-row + .tp-stack-row { border-top: 1px solid rgba(26,29,33,0.05); }
@keyframes tp-stackIn { from { opacity:0; transform:translateY(-12px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
.tp-stack-name { font-weight: 600; font-size: 14px; color: ${NAVY}; margin-bottom: 1px; }
.tp-stack-meta { display: flex; align-items: center; gap: 5px; }
.tp-stack-status { font-weight: 500; font-size: 11px; color: rgba(26,29,33,0.35); }
.tp-stack-price { font-weight: 700; font-size: 15px; color: ${NAVY}; letter-spacing: -0.3px; }
.tp-stack-empty { padding: 14px 16px; font-size: 13px; color: rgba(26,29,33,0.4); text-align: center; }
.tp-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; animation: tp-pulse 2s ease-in-out infinite; }
.tp-dot.awaiting { background: ${BLUE}; }
.tp-dot.payment-sent { background: ${BLUE}; }
.tp-dot.paid { background: ${GREEN}; animation: none; opacity: 1; }
.tp-dot.declined { background: ${RED}; animation: none; opacity: 1; }
@keyframes tp-pulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }
.tp-field { width: 100%; padding: 18px 24px; border-radius: 999px; background: ${OFFW}; border: none; color: ${NAVY}; font-family: 'Outfit', system-ui; font-weight: 500; font-size: 17px; letter-spacing: -0.01em; outline: none; box-sizing: border-box; }
.tp-field::placeholder { color: rgba(26,29,33,0.35); }
.tp-cta { display: inline-flex; align-items: center; justify-content: center; padding: 14px 36px; border-radius: 999px; background: ${BLUE}; color: ${NAVY}; font-family: 'Outfit', system-ui; font-weight: 600; font-size: 15px; transition: transform 120ms, opacity 120ms; white-space: nowrap; border: none; cursor: pointer; box-sizing: border-box; }
.tp-cta:active { transform: scale(0.96); opacity: 0.92; }
.tp-kp { width: 76px; height: 76px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-family: 'Outfit', system-ui; font-weight: 700; font-size: 30px; transition: transform 100ms, background 100ms; background: ${BLUE}; color: #fff; border: none; cursor: pointer; }
.tp-kp:active { transform: scale(0.92); }
.tp-kp.outline { background: transparent; color: ${BLUE}; box-shadow: inset 0 0 0 2px ${BLUE}; }
.tp-kp.outline:active { background: rgba(255,122,26,0.12); }
.tp-success-check { width: 92px; height: 92px; border-radius: 999px; background: ${BLUE}; display: flex; align-items: center; justify-content: center; color: ${NAVY}; }
.tp-pulse { animation: tp-pulseDot 1800ms ease-in-out infinite; }
@keyframes tp-pulseDot { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.08); opacity:0.85; } }
.tp-thin-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,122,26,0) transparent; transition: scrollbar-color 350ms; }
.tp-thin-scroll::-webkit-scrollbar { width: 3px; }
.tp-thin-scroll::-webkit-scrollbar-thumb { background-color: rgba(255,122,26,0); border-radius: 999px; }
.tp-stack-scroll { scrollbar-width: thin; scrollbar-color: ${NAVY} transparent; }
.tp-stack-scroll::-webkit-scrollbar { width: 4px; background: transparent; }
.tp-stack-scroll::-webkit-scrollbar-track { background: transparent; }
.tp-stack-scroll::-webkit-scrollbar-thumb { background: ${NAVY}; border-radius: 999px; }
.tp-toast { position: absolute; left: 50%; transform: translateX(-50%); bottom: 110px; background: ${NAVY}; color: ${OFFW}; padding: 12px 22px; border-radius: 999px; font-size: 14px; font-weight: 500; opacity: 0; pointer-events: none; transition: opacity 200ms, transform 200ms; z-index: 60; }
.tp-toast.show { opacity: 1; transform: translateX(-50%) translateY(-4px); }
.tp-layer { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; will-change: transform; z-index: 0; }
.tp-layer.leaving.up   { animation: tp-outUp   0.48s cubic-bezier(0.4,0,0.2,1) both; z-index: 1; }
.tp-layer.leaving.down { animation: tp-outDown 0.48s cubic-bezier(0.4,0,0.2,1) both; z-index: 1; }
.tp-layer.entering.up   { animation: tp-inUp   0.48s cubic-bezier(0.16,1,0.3,1) both; }
.tp-layer.entering.down { animation: tp-inDown 0.48s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes tp-inUp    { from { transform: translateY(100%); }  to { transform: translateY(0); } }
@keyframes tp-outUp   { from { transform: translateY(0); }     to { transform: translateY(-100%); } }
@keyframes tp-inDown  { from { transform: translateY(-100%); } to { transform: translateY(0); } }
@keyframes tp-outDown { from { transform: translateY(0); }     to { transform: translateY(100%); } }
@keyframes tp-popIn { from { opacity:0; transform:translateY(16px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
.stagger { transition: height 0.55s cubic-bezier(0.34,1.56,0.64,1); }
.stagger > * { animation: tp-popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
.stagger > *:nth-child(1) { animation-delay: 0s; }
.stagger > *:nth-child(2) { animation-delay: 0.06s; }
.stagger > *:nth-child(3) { animation-delay: 0.12s; }
.stagger > *:nth-child(4) { animation-delay: 0.18s; }
.tp-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 30; }
.tp-overlay > * { pointer-events: auto; }
.tp-pfab { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); transition: opacity 240ms cubic-bezier(0,0,0.2,1), transform 360ms cubic-bezier(0.34,1.56,0.64,1); will-change: opacity, transform; }
.tp-pfab.hide { opacity: 0; transform: translate(-50%, -50%) translateY(8px) scale(0.7); pointer-events: none; }
.tp-pfab.show { opacity: 1; }
.tp-psubbar { position: absolute; top: 50%; left: 0; right: 0; padding: 0 22px; box-sizing: border-box; transform: translateY(67px); display: flex; align-items: center; gap: 8px; transition: opacity 220ms cubic-bezier(0,0,0.2,1), transform 300ms cubic-bezier(0.4,0,0.2,1); will-change: opacity, transform; height: 37px; pointer-events: none; }
.tp-psubbar.show .tp-subbar, .tp-psubbar.show .tp-send-slot { pointer-events: auto; }
.tp-psubbar.hide { opacity: 0; transform: translateY(67px) scale(0.92); pointer-events: none; }
.tp-psubbar.show { opacity: 1; }
.tp-psubbar.feature { transform: translateY(calc(-100% - 20px)); }
.tp-subbar-center { flex: 1 1 auto; min-width: 0; display: flex; justify-content: center; }
.tp-send-slot { flex-shrink: 0; display: flex; align-items: center; overflow: hidden; max-width: 0; opacity: 0; transition: max-width 420ms cubic-bezier(0.34,1.56,0.64,1), opacity 280ms ease 80ms; height: 37px; }
.tp-send-slot.show { max-width: 143px; opacity: 1; }
`;
