/**
 * Scene: trades-invoice (story card 03) — §4.4 Trades, quick invoice
 *
 * Mirrors client/src/pages/trades/trades-terminal.tsx.
 *
 * Milestones:
 *   0  open Quick Invoice          → ChooseClient, quick-invoice card offered
 *   1  select the fixed client     → Dave Kerr · 12 Rimu Ave tapped
 *   2  enter $480 on the keypad    → AmountKeypad
 *   3  add "emergency callout"     → QuickInvoice composer, job note filled
 *   4  send                        → composer, CTA in its sending state
 *   5  "invoice sent"              → SentSuccess
 *   6  back on the current jobs surface with the new row
 *   7  … and the paid-status flourish
 *
 * Every geometry, colour and string below is copied by value from the real
 * terminal (screens ChooseClient / AmountKeypad / QuickInvoice / SentSuccess /
 * JobsHome and its TP_TERM_CSS block). Nothing here is stateful, timed, or
 * capable of a side effect: the frame is a pure function of `step`.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, FONT, GREEN, NAVY, NAVY_35, NAVY_50, OFFW, fmt } from '../tokens';
import { Amount, Ic, Keypad, Screen, SubHead } from '../primitives';
import { TRADES } from '../fixtures';

/* ── icons the terminal's chrome needs and primitives.Ic does not carry ───── */

const stroked = (d: ReactNode, sz: number, c: string, sw = 1.9): JSX.Element => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

export const TIc = {
  Person: (sz = 18, c = NAVY) => stroked(<><circle cx="12" cy="7.5" r="4" /><path d="M3.5 21c0-4 3.8-7 8.5-7s8.5 3 8.5 7" /></>, sz, c),
  Receipt: (sz = 18, c = NAVY) => stroked(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>, sz, c),
  Send: (sz = 18, c = NAVY) => stroked(<><path d="M21 4 3 11l6 2.5L12 20l3-7z" /><path d="m9 13.5 6-6.5" /></>, sz, c),
  Ext: (sz = 18, c = NAVY) => stroked(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7" /></>, sz, c),
  Search: (sz = 18, c = NAVY) => stroked(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.5-3.5" /></>, sz, c, 2),
  Mail: (sz = 18, c = BLUE) => stroked(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 7 10-7" /></>, sz, c, 1.8),
};

/* ── terminal chrome ──────────────────────────────────────────────────────── */

const SUBBAR = [
  { id: 'clients', Icon: TIc.Person },
  { id: 'quote', Icon: TIc.Receipt },
  { id: 'invoice', Icon: TIc.Send },
  { id: 'external', Icon: TIc.Ext },
] as const;

/**
 * The four-item terminal sub-bar.
 *
 * `top` is the resolved position of production's `.tp-psubbar`: 489 on the jobs
 * home (50% + 67px), and 20px above the top panel's boundary on every feature
 * screen — 365 for a 50% panel, 112 for the quote screen's 20% panel.
 *
 * The moving indicator is drawn as an inset layer inside the active item rather
 * than an absolutely measured sibling, which needs no ref, no ResizeObserver and
 * no double rAF while producing the same pill.
 */
export function TradesSubBar({ active = -1, top }: { active?: number; top: number }) {
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, height: 37, padding: '0 22px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', zIndex: 30 }}>
      <div
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: BLUE, borderRadius: 26, padding: '5px 11px', gap: 4,
          border: '1px solid rgba(255,255,255,0.3)',
          boxShadow: '0 16px 48px rgba(4,13,109,0.2), 0 4px 12px rgba(4,13,109,0.1), inset 0 1px 0 rgba(255,255,255,0.25)',
          transform: 'scale(0.85)',
        }}
      >
        {SUBBAR.map((item, i) => {
          const on = i === active;
          return (
            <div key={item.id} style={{ position: 'relative', height: 27, padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16 }}>
              {on && <span className="lp-t" style={{ position: 'absolute', inset: 0, borderRadius: 16, background: NAVY, boxShadow: '0 4px 16px rgba(4,13,109,0.4)' }} />}
              <span style={{ position: 'relative', display: 'flex' }}>{item.Icon(18, on ? BLUE : 'rgba(244,244,244,0.55)')}</span>
              {on && <span style={{ position: 'relative', fontFamily: FONT, fontWeight: 600, fontSize: 12, letterSpacing: '0.4px', color: OFFW, whiteSpace: 'nowrap' }}>{item.id}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Production `.tp-fab` — sits on the 50% boundary of the jobs home. */
function Fab() {
  return (
    <div className="lp-fab" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 30, color: OFFW }} aria-hidden>
      <Ic.Plus size={30} />
    </div>
  );
}

/* ── shared bits ──────────────────────────────────────────────────────────── */

const LAYER: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' };

/** Off-white top panel used by every feature screen (production: height 50%). */
const PANEL: CSSProperties = { background: OFFW, color: NAVY, height: '50%', display: 'flex', flexDirection: 'column', flexShrink: 0 };

/** Navy lower panel of a feature screen. */
const LOWER: CSSProperties = { flex: 1, background: NAVY, display: 'flex', flexDirection: 'column', minHeight: 0 };

const QI_LABEL: CSSProperties = { fontWeight: 600, fontSize: 11, color: 'rgba(244,244,244,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 };

/** Production `.tp-field`: the fat off-white pill input. Inert here — a div, so
 *  the cinematic screen adds no phantom form controls to the tab order (§7.5). */
function Field({ value, placeholder, style }: { value?: string; placeholder?: string; style?: CSSProperties }) {
  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '18px 24px', borderRadius: 999, background: OFFW, color: value ? NAVY : NAVY_35, fontFamily: FONT, fontWeight: 500, fontSize: 17, letterSpacing: '-0.01em', ...style }}>
      {value || placeholder}
    </div>
  );
}

/** Production `.tp-cta` / `.tp-cta-wire`. */
function Cta({ label, wire = false, dim = false, pressed = false, style }: { label: string; wire?: boolean; dim?: boolean; pressed?: boolean; style?: CSSProperties }) {
  return (
    <div
      className="lp-t"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 36px', borderRadius: 999,
        background: wire ? 'transparent' : BLUE, color: wire ? BLUE : OFFW, border: wire ? `1.5px solid ${BLUE}` : 'none',
        fontFamily: FONT, fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', boxSizing: 'border-box',
        opacity: dim ? 0.65 : 1, transform: pressed ? 'scale(0.96)' : 'none',
        ...style,
      }}
    >
      {label}
    </div>
  );
}

const INITIALS = TRADES.client.name.split(' ').map((w) => w[0]).join('').toUpperCase();

/* ── screens ──────────────────────────────────────────────────────────────── */

/** Steps 0–1 — production ChooseClient, entered from the invoice flow. */
function ChooseClient({ picked }: { picked: boolean }) {
  return (
    <div style={LAYER}>
      <div style={PANEL}>
        <SubHead />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ color: NAVY_35, fontWeight: 500, fontSize: 18 }}>choose client</div>
        </div>
        <div style={{ height: 52 }} />
      </div>

      <div style={{ ...LOWER, padding: '52px 22px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '0 18px', height: 44, marginBottom: 14, flexShrink: 0 }}>
          {TIc.Search(16, 'rgba(244,244,244,0.6)')}
          <span style={{ fontWeight: 500, fontSize: 14, color: 'rgba(244,244,244,0.45)' }}>search clients or site</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* "no client — just enter their details": the Quick Invoice entry. */}
          <div style={{ background: 'rgba(88,171,255,0.1)', border: '1.5px dashed rgba(88,171,255,0.45)', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 38, height: 38, borderRadius: 999, border: `1.5px solid ${BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: BLUE }}>
              <Ic.Plus size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: OFFW }}>quick invoice</div>
              <div style={{ fontWeight: 400, fontSize: 11.5, color: 'rgba(244,244,244,0.55)', marginTop: 2 }}>no client — just enter their details</div>
            </div>
          </div>

          {/* The fixed client. `picked` draws the tap the script is performing. */}
          <div
            className="lp-t"
            style={{
              background: picked ? 'rgba(88,171,255,0.18)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${picked ? BLUE : 'rgba(88,171,255,0.15)'}`,
              borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13,
              transform: picked ? 'scale(0.98)' : 'none',
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 999, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: OFFW }}>{INITIALS}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: OFFW, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TRADES.client.name}</div>
              <div style={{ fontWeight: 400, fontSize: 11.5, color: 'rgba(244,244,244,0.55)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TRADES.client.site}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: OFFW, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>—</div>
          </div>
        </div>
      </div>

      <TradesSubBar active={0} top={365} />
    </div>
  );
}

/** Step 2 — production AmountKeypad with the client carried through. */
function AmountKeypad() {
  return (
    <div style={LAYER}>
      <div style={PANEL}>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Amount cents={TRADES.invoiceCents} style={{ marginTop: 18 }} />
          <div style={{ fontWeight: 500, fontSize: 15, color: NAVY_50, paddingBottom: 8 }}>
            {`${TRADES.client.name} · ${TRADES.client.site}`}
          </div>
        </div>
        <div style={{ height: 52 }} />
      </div>

      <div style={{ ...LOWER, padding: '38px 28px 28px' }}>
        <Keypad hit="0" />
      </div>

      <TradesSubBar top={365} />
    </div>
  );
}

/** Steps 3–4 — production QuickInvoice composer for a selected client. */
function Composer({ sending }: { sending: boolean }) {
  return (
    <div style={LAYER}>
      <div style={PANEL}>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <Amount cents={TRADES.invoiceCents} />
            <span style={{ fontWeight: 600, fontSize: 12, color: 'rgba(4,13,109,0.4)', textDecoration: 'underline', textUnderlineOffset: 2 }}>edit</span>
          </div>
          <div style={{ marginTop: 14, fontWeight: 500, fontSize: 16, color: NAVY, lineHeight: 1.4 }}>
            {TRADES.client.name}
            <div style={{ fontWeight: 400, fontSize: 14, color: NAVY_50, marginTop: 4 }}>{TRADES.client.site}</div>
          </div>
        </div>
        <div style={{ height: 52 }} />
      </div>

      <div style={{ ...LOWER, padding: '40px 28px 100px', alignItems: 'center' }}>
        <div style={{ width: '100%' }}>
          <div style={QI_LABEL}>job note <span style={{ opacity: 0.6 }}>· optional</span></div>
          <Field value={TRADES.invoiceLabel} placeholder="what's this invoice for?" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', background: 'rgba(88,171,255,0.08)', border: '1px solid rgba(88,171,255,0.2)', borderRadius: 20, width: '100%', boxSizing: 'border-box', marginTop: 18 }}>
          {TIc.Mail(22, OFFW)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: 'rgba(244,244,244,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>sending via email</div>
            <div style={{ fontWeight: 500, fontSize: 14, color: OFFW, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>client&apos;s email</div>
          </div>
        </div>

        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderRadius: 16, marginTop: 14, border: '1px solid rgba(88,171,255,0.15)', background: 'rgba(255,255,255,0.04)', boxSizing: 'border-box' }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: BLUE }}>split the bill</span>
          <span style={{ width: 42, height: 25, borderRadius: 999, background: 'rgba(88,171,255,0.25)', position: 'relative', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: 3, width: 19, height: 19, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <Cta label={sending ? 'sending…' : 'send invoice'} dim={sending} pressed={sending} style={{ minWidth: 220, flexShrink: 0 }} />
      </div>

      <TradesSubBar active={2} top={365} />
    </div>
  );
}

/** Step 5 — production SentSuccess. The sub-bar is hidden on this screen. */
function SentSuccess() {
  return (
    <div style={LAYER}>
      <div style={PANEL}>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '12px 28px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Amount cents={TRADES.invoiceCents} />
          <div style={{ marginTop: 18, fontWeight: 700, fontSize: 22 }}>invoice sent</div>
        </div>
        <div style={{ height: 52 }} />
      </div>

      <div style={{ ...LOWER, padding: '52px 28px 100px', alignItems: 'center' }}>
        <div style={{ color: OFFW, fontWeight: 800, fontSize: 42, letterSpacing: '-0.04em' }}>sent</div>
        <div style={{ marginTop: 14, width: 92, height: 92, borderRadius: 999, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: OFFW }}>
          <Ic.Check size={40} />
        </div>
        <div style={{ marginTop: 18, color: 'rgba(244,244,244,0.6)', fontWeight: 500, fontSize: 14 }}>{TRADES.invoiceLabel}</div>
        <div style={{ flex: 1 }} />
        <Cta label="done" />
      </div>
    </div>
  );
}

/** Steps 6–7 — production JobsHome: the invoice lands, then settles. */
function JobsHome({ paid }: { paid: boolean }) {
  return (
    <div style={LAYER}>
      <div style={{ background: NAVY, height: '50%', padding: '100px 28px 28px', display: 'flex', flexDirection: 'column', flexShrink: 0, boxSizing: 'border-box' }}>
        <Amount cents={paid ? 0 : TRADES.invoiceCents} color={OFFW} />
        <div style={{ marginTop: 10, color: OFFW, fontWeight: 500, fontSize: 16 }}>outstanding</div>
      </div>

      <div style={{ flex: 1, background: OFFW, padding: '154px 22px 110px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="lp-stack-title">jobs</div>
        </div>
        <div className="lp-stack-card">
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: OFFW, letterSpacing: '0.02em', marginRight: 12 }}>{INITIALS}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: NAVY, marginBottom: 1 }}>{TRADES.client.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: paid ? GREEN : BLUE, transition: 'background 0.4s ease' }} />
                <span style={{ fontWeight: 500, fontSize: 11, color: paid ? GREEN : NAVY_35, transition: 'color 0.4s ease' }}>{paid ? 'paid' : 'sent'}</span>
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, letterSpacing: '-0.3px' }}>{fmt(TRADES.invoiceCents)}</div>
          </div>
        </div>
      </div>

      <Fab />
      <TradesSubBar top={489} />
    </div>
  );
}

/* ── scene ────────────────────────────────────────────────────────────────── */

function TradesInvoice({ step }: SceneProps) {
  return (
    <Screen>
      {step <= 1 && <ChooseClient picked={step === 1} />}
      {step === 2 && <AmountKeypad />}
      {(step === 3 || step === 4) && <Composer sending={step === 4} />}
      {step === 5 && <SentSuccess />}
      {step >= 6 && <JobsHome paid={step >= 7} />}
    </Screen>
  );
}

export const tradesInvoiceScene: SceneDefinition = {
  id: 'trades-invoice',
  steps: 8,
  label: 'emergency callout invoice for $480 sent',
  Component: TradesInvoice,
};
