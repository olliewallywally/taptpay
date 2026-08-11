/**
 * Scene: quote-deposit (story card 04) — §4.5 Trades, quote to deposit
 *
 * Milestones:
 *   0  choose the fixed client        → QuoteScreen builder, client chosen
 *   1  add "Heat pump service", qty 1, $1,250
 *   2  enable require deposit
 *   3  select 20% → $250 deposit      → totals scrolled into view
 *   4  send the quote                 → merchant "quote created" state
 *   5  crossfade to the customer quote card
 *   6  view quote                     → confirm + PDF affordance
 *   7  confirm → $250 deposit checkout request
 *
 * Two real surfaces are replicated here, both by value:
 *   • steps 0–4  client/src/pages/trades/trades-terminal.tsx → QuoteScreen
 *   • steps 5–7  client/src/pages/checkout.tsx quote mode, styled from
 *                client/src/lib/checkout-theme.ts + components/checkout/
 *                tapt-wordmark.tsx
 *
 * Quote totals use production's own pure maths — `includedGstCents` from
 * client/src/lib/trades-money.ts — and the deposit follows shared/trades-gst.ts
 * `computeQuoteTotals`: for a percent deposit that is `round(total × pct/100)`
 * → 20% of $1,250 = $250. Display goes through the demo's `fmt`, not
 * trades-money's `formatNzd`: the two are byte-identical for the cents-bearing
 * rows (subtotal, GST) and differ only on whole dollars, where `formatNzd`'s
 * Intl currency form would print "$1,250.00" and break both the frozen
 * `Amount` vocabulary and the plan's own copy.
 *
 * Nothing here mounts the API-bound Quote or Checkout page: the real quote GET
 * marks the quote viewed, and accepting it mints an invoice. No timers, no
 * state, no effects — the frame is a pure function of `step`.
 */
import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, FONT, GREEN, NAVY, NAVY_35, NAVY_50, OFFW, WHITE, fmt } from '../tokens';
import { Press, Screen, SubHead } from '../primitives';
import { BEAT_MS, DWELL_MS, HOLD_MS, TAP_MS } from '../reducer';
import { TRADES } from '../fixtures';
import { JobsHome, TradesSubBar } from './trades-invoice';
import { includedGstCents } from '@/lib/trades-money';

/* ── quote maths (production semantics, evaluated once at module load) ─────── */

const LINE = TRADES.quoteLine;
/** computeQuoteTotals: lineSum = round(qty × unitPrice). */
const TOTAL = Math.round(LINE.qty * LINE.unitCents);
/** GST-inclusive mode — the NZ trades default. */
const GST = includedGstCents(TOTAL);
const SUBTOTAL = TOTAL - GST;
/** Percent deposit = round(total × pct/100), clamped 0–100 upstream. */
const DEPOSIT = Math.round(TOTAL * (TRADES.depositPercent / 100));

/** Display-only. Production builds `${origin}/trades/quote/${token}`; a literal
 *  keeps the frame deterministic and the link inert. */
const QUOTE_LINK = 'taptpay.com/trades/quote/8f2c41';

/* ── production QuoteScreen constants ─────────────────────────────────────── */

const LAYER: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' };

const Q_LABEL: CSSProperties = { fontWeight: 600, fontSize: 11, color: 'rgba(88,171,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 };
const Q_FIELD: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 14, background: OFFW, color: NAVY, fontFamily: FONT, fontWeight: 500, fontSize: 15 };
const Q_TOTROW: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' };
const Q_DIM = 'rgba(88,171,255,0.7)';

/** Inert stand-in for the builder's `<input>` / `<select>` / `<textarea>` — a
 *  div, so the cinematic screen adds no phantom controls to the tab order. */
function QField({ value, placeholder, style }: { value?: string; placeholder?: string; style?: CSSProperties }) {
  return (
    <div style={{ ...Q_FIELD, color: value ? NAVY : NAVY_35, ...style }}>{value || placeholder}</div>
  );
}

function WireBtn({ label, dim = false, style }: { label: string; dim?: boolean; style?: CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 36px', borderRadius: 999, background: 'transparent', color: BLUE, border: `1.5px solid ${BLUE}`, fontFamily: FONT, fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', boxSizing: 'border-box', opacity: dim ? 0.5 : 1, ...style }}>
      {label}
    </div>
  );
}

/** The builder's deposit switch. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span style={{ width: 42, height: 25, borderRadius: 999, background: on ? BLUE : 'rgba(88,171,255,0.25)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 19, height: 19, borderRadius: 999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </span>
  );
}

/* ── steps 0–4: the merchant quote builder ────────────────────────────────── */

/**
 * The real builder is one long scrollable column. There is no scripted
 * scrolling here — the column is translated by a per-step offset, so the
 * milestone alone decides which part of the form is on screen.
 */
const SCROLL: readonly number[] = [0, 0, 28, 54, 0];

function QuoteBuilder({ step, tapDone = false, seq = 0 }: { step: number; tapDone?: boolean; seq?: number }) {
  const hasLine = step >= 1;
  const deposit = step >= 2;
  const created = step >= 4;
  const total = hasLine ? TOTAL : 0;

  return (
    <div style={LAYER}>
      {/* Top — 20% white box: action bar, live total, client */}
      <div style={{ background: OFFW, color: NAVY, height: '20%', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <SubHead commitReady={hasLine} />
        <div style={{ flex: 1, minHeight: 0, padding: '2px 28px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span className="lp-amount" style={{ fontSize: 44, color: total === 0 ? 'rgba(4,13,109,0.25)' : NAVY }}>{fmt(total)}</span>
          <div style={{ marginTop: 4, fontWeight: 500, fontSize: 13, color: NAVY_50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {created ? 'quote created' : TRADES.client.name}
          </div>
        </div>
      </div>

      {/* Bottom — navy builder */}
      <div style={{ flex: 1, background: NAVY, padding: '26px 22px 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {created ? (
          <>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: GREEN, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>quote created</div>
              <div style={{ fontWeight: 500, fontSize: 14, color: 'rgba(88,171,255,0.75)', marginBottom: 18 }}>Sent to the client.</div>
              <div style={Q_LABEL}>customer link</div>
              <QField value={QUOTE_LINK} style={{ marginBottom: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
              <WireBtn label="copy link" style={{ width: '100%', marginBottom: 10 }} />
              <WireBtn label="download PDF" style={{ width: '100%' }} />
            </div>
            <div style={{ flexShrink: 0, padding: '12px 0 20px', display: 'flex', justifyContent: 'center' }}>
              <Press on={tapDone} seq={seq} radius={54}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 220, padding: '14px 36px', borderRadius: 999, background: BLUE, color: OFFW, fontFamily: FONT, fontWeight: 600, fontSize: 15 }}>done</div>
              </Press>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="lp-t" style={{ transform: `translateY(${-SCROLL[step]}px)` }}>
                <div style={Q_LABEL}>client</div>
                <QField value={`${TRADES.client.name} — ${TRADES.client.site}`} style={{ marginBottom: 20 }} />

                <div style={Q_LABEL}>line items</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px 90px 28px', gap: 7, marginBottom: 9 }}>
                  <QField value={hasLine ? LINE.description : undefined} placeholder="description" />
                  <QField value={hasLine ? String(LINE.qty) : undefined} placeholder="qty" style={{ padding: '13px 8px', textAlign: 'center' }} />
                  <QField value={hasLine ? String(LINE.unitCents / 100) : undefined} placeholder="$0.00" style={{ padding: '13px 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(88,171,255,0.25)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: BLUE, fontWeight: 700, fontSize: 13.5, padding: '4px 0 18px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                  add line
                </div>

                {/* Deposit */}
                <div className="lp-t" style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderRadius: 16, border: `1px solid ${deposit ? 'rgba(88,171,255,0.4)' : 'rgba(88,171,255,0.15)'}`, background: deposit ? 'rgba(88,171,255,0.1)' : 'rgba(255,255,255,0.04)' }}>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: BLUE }}>require deposit</span>
                  <Toggle on={deposit} />
                </div>
                {deposit && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 10 }}>
                    <QField value="percentage" />
                    <QField value={String(TRADES.depositPercent)} style={step === 3 ? { boxShadow: `inset 0 0 0 2px ${BLUE}` } : undefined} />
                  </div>
                )}

                <div style={{ ...Q_LABEL, marginTop: 20 }}>notes <span style={{ opacity: 0.6 }}>· optional</span></div>
                <QField placeholder="quote notes" style={{ minHeight: 78 }} />

                {/* Totals */}
                <div style={{ marginTop: 20, background: 'rgba(88,171,255,0.08)', border: '1px solid rgba(88,171,255,0.2)', borderRadius: 16, padding: '14px 16px' }}>
                  <div style={{ ...Q_TOTROW, color: Q_DIM, fontSize: 13 }}><span>subtotal (excl. GST)</span><span>{fmt(hasLine ? SUBTOTAL : 0)}</span></div>
                  <div style={{ ...Q_TOTROW, color: Q_DIM, fontSize: 13 }}><span>GST (15%) incl.</span><span>{fmt(hasLine ? GST : 0)}</span></div>
                  {deposit && (
                    <div className="lp-t" style={{ ...Q_TOTROW, fontSize: 13 }}>
                      <span style={{ color: Q_DIM }}>deposit on acceptance</span>
                      <strong style={{ color: BLUE }}>{fmt(DEPOSIT)}</strong>
                    </div>
                  )}
                  <div style={{ ...Q_TOTROW, borderTop: '1px solid rgba(88,171,255,0.2)', paddingTop: 11, marginTop: 6, fontSize: 17 }}>
                    <span style={{ color: WHITE, fontWeight: 700 }}>total</span>
                    <strong style={{ color: WHITE }}>{fmt(total)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ flexShrink: 0, padding: '12px 0 20px', display: 'flex', justifyContent: 'center' }}>
              <WireBtn label="create quote" dim={!hasLine} style={{ minWidth: 220 }} />
            </div>
          </>
        )}
      </div>

      {/* Production docks the sub-bar to the top panel's boundary: 20px above
          it on the 50% screens. Measured against this screen's 20% panel that
          resolves to ~112px, which lands on top of the live total, so it is
          docked centred on the boundary instead — the same rule, in the only
          gap this dense builder leaves. */}
      <TradesSubBar active={1} top={150} />
    </div>
  );
}

/* ── steps 5–7: the customer-facing quote / deposit card ──────────────────── */

const SKY = BLUE;
const SKY_DIM = '#7CB9FF';

const PAGE: CSSProperties = { position: 'absolute', inset: 0, background: OFFW, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', fontFamily: FONT };
const CARD: CSSProperties = { background: NAVY, borderRadius: 44, width: '100%', maxWidth: 380, minHeight: 520, padding: '44px 32px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 24px 60px rgba(4,13,109,0.28)', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' };
const CARD_LABEL: CSSProperties = { color: SKY, fontSize: 22, fontWeight: 500, textAlign: 'center', lineHeight: 1.3, overflowWrap: 'anywhere' };
const CARD_AMOUNT: CSSProperties = { color: SKY, fontSize: 64, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1.05, textAlign: 'center', margin: '10px 0' };
const CARD_SUB: CSSProperties = { color: SKY_DIM, fontSize: 15, fontWeight: 500, textAlign: 'center' };
const OUTLINE_BTN: CSSProperties = { background: 'transparent', color: SKY, border: `1.5px solid ${SKY}`, borderRadius: 14, padding: '14px 20px', fontSize: 16, fontWeight: 600, fontFamily: FONT, width: '100%', textAlign: 'center', boxSizing: 'border-box' };
const FOOTER_LINK: CSSProperties = { color: SKY_DIM, fontSize: 14, fontWeight: 500, fontFamily: FONT, padding: 8 };

/** components/checkout/tapt-wordmark.tsx — serif "tapt" + italic "pay". */
function Wordmark() {
  return (
    <span aria-label="taptpay" style={{ fontFamily: "'Larken', Georgia, 'Times New Roman', serif", fontWeight: 900, fontSize: 34, color: SKY, lineHeight: 1, letterSpacing: '-0.5px' }}>
      tapt<span style={{ fontStyle: 'italic' }}>pay</span>
    </span>
  );
}

function CustomerCard({ children, minHeight = 520 }: { children: ReactNode; minHeight?: number }) {
  return (
    <div style={PAGE}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ ...CARD, minHeight }}>
          <Wordmark />
          {children}
        </div>
        <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: 11, color: '#9aa0b5', letterSpacing: '0.03em' }}>
          Secured by <strong style={{ color: NAVY, fontWeight: 600 }}>Windcave</strong> · PCI DSS Compliant
        </p>
      </div>
    </div>
  );
}

/** Steps 5–6 — the quote the customer is asked to accept. */
function CustomerQuote({ confirmStep, tap = false, seq = 0 }: { confirmStep: boolean; tap?: boolean; seq?: number }) {
  return (
    <CustomerCard>
      <div style={{ flex: 1, minHeight: 20 }} />
      <p style={{ ...CARD_LABEL, margin: 0 }}>{LINE.description}</p>
      <p style={{ ...CARD_AMOUNT }}>{fmt(TOTAL)}</p>
      <p style={{ ...CARD_SUB, margin: 0 }}>{`${TRADES.depositPercent}% deposit required`}</p>
      <div style={{ flex: 1, minHeight: 24 }} />

      <div style={{ display: 'flex', gap: 12, width: '100%' }}>
        <Press on={tap} seq={seq} radius={48} style={{ flex: 1 }}>
          <div className="lp-t" style={{ ...OUTLINE_BTN, flex: 1, width: '100%', boxSizing: 'border-box' }}>{confirmStep ? 'confirm' : 'view quote'}</div>
        </Press>
        {confirmStep && (
          <div className="lp-t" style={{ background: 'transparent', color: SKY, border: `1.5px solid ${SKY}`, borderRadius: 14, width: 52, height: 52, flex: '0 0 52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 14v.01M14 20h.01M17 20h.01M20 17v3" />
            </svg>
          </div>
        )}
      </div>
      <div style={{ ...FOOTER_LINK, marginTop: 12 }}>decline quote</div>
    </CustomerCard>
  );
}

/** Step 7 — the accepted quote's deposit checkout request. */
function DepositCheckout() {
  return (
    <CustomerCard minHeight={600}>
      <div style={{ flex: 1, minHeight: 20 }} />
      <p style={{ ...CARD_LABEL, margin: 0 }}>{LINE.description}</p>
      <p style={{ ...CARD_AMOUNT }}>{fmt(DEPOSIT)}</p>
      <p style={{ ...CARD_SUB, margin: 0 }}>{`${TRADES.depositPercent}% deposit of ${fmt(TOTAL)}`}</p>
      <div style={{ flex: 1, minHeight: 24 }} />

      {/* Wallet affordance — inert artwork. No provider script, session or SDK. */}
      <div style={{ width: '100%', background: '#000', borderRadius: 14, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 10, color: '#fff' }} aria-hidden>
        <svg width="18" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M16.4 12.6c0-2 1.6-3 1.7-3.1-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2.1 2.5 2 1-.1 1.4-.6 2.6-.6s1.5.6 2.6.6 1.7-1 2.4-1.9c.7-1.1 1-2.2 1-2.2s-1.9-.8-2-3.2zM14.5 5.9c.5-.7.9-1.6.8-2.6-.8 0-1.8.5-2.4 1.2-.5.6-1 1.6-.8 2.5.9.1 1.8-.4 2.4-1.1z" />
        </svg>
        <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 18 }}>Pay</span>
      </div>
      <div style={FOOTER_LINK}>
        enter credit card{' '}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </CustomerCard>
  );
}

/* ── scene ────────────────────────────────────────────────────────────────── */

/* ── the session ──────────────────────────────────────────────────────────
   Opens on the trades jobs home, the same surface trades-invoice opens on, then
   builds a quote from it and follows the quote to the customer, who accepts it
   and is asked for the deposit. Every screen change is preceded by a press. */

type Frame = { ms: number; screen: string; render: (seq: number) => ReactNode };

const FRAMES: Frame[] = [
  { ms: BEAT_MS, screen: 'jobs', render: () => <JobsHome paid={false} /> },
  { ms: TAP_MS, screen: 'jobs', render: (seq) => <JobsHome paid={false} tapFab seq={seq} /> },
  // The builder fills in: client, then the line item, then the deposit toggle.
  { ms: BEAT_MS, screen: 'builder', render: () => <QuoteBuilder step={0} /> },
  { ms: DWELL_MS, screen: 'builder', render: () => <QuoteBuilder step={1} /> },
  { ms: DWELL_MS, screen: 'builder', render: () => <QuoteBuilder step={2} /> },
  { ms: BEAT_MS, screen: 'builder', render: () => <QuoteBuilder step={3} /> },
  { ms: DWELL_MS, screen: 'created', render: () => <QuoteBuilder step={4} /> },
  { ms: TAP_MS, screen: 'created', render: (seq) => <QuoteBuilder step={4} tapDone seq={seq} /> },
  // Over to the customer, who opens the quote and accepts it.
  { ms: DWELL_MS, screen: 'customer', render: () => <CustomerQuote confirmStep={false} /> },
  { ms: TAP_MS, screen: 'customer', render: (seq) => <CustomerQuote confirmStep={false} tap seq={seq} /> },
  { ms: DWELL_MS, screen: 'confirm', render: () => <CustomerQuote confirmStep /> },
  { ms: TAP_MS, screen: 'confirm', render: (seq) => <CustomerQuote confirmStep tap seq={seq} /> },
  { ms: HOLD_MS, screen: 'deposit', render: () => <DepositCheckout /> },
];

function QuoteDeposit({ step }: SceneProps) {
  const i = Math.min(Math.max(step, 0), FRAMES.length - 1);
  const frame = FRAMES[i];
  return (
    <Screen>
      <Fragment key={frame.screen}>{frame.render(i)}</Fragment>
    </Screen>
  );
}

export const quoteDepositScene: SceneDefinition = {
  id: 'quote-deposit',
  steps: FRAMES.length,
  beats: FRAMES.map((f) => f.ms),
  label: '$1,250 quote confirmed with a $250 deposit requested',
  Component: QuoteDeposit,
};
