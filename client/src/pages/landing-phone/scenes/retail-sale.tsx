/**
 * Scene: retail-sale (story card 05) — §4.6 Retail, normal sale
 *
 * Plays as one continuous session rather than a set of milestones: it opens on
 * the terminal home, where the merchant actually opens the app, and every screen
 * change is preceded by a visible press on the control that causes it —
 * + → keypad → 1 2 5 0 → ✓ → details → confirm → send → QR → stack → paid.
 * See FRAMES at the bottom; it is the script, in order, with its own timing.
 *
 * Fidelity source: client/src/components/SmartTransitions.jsx — the retail
 * terminal the merchant actually uses (Keypad → EnterDetails → pending home →
 * SharePayment → active stack), plus its TP_CSS block. Geometry, padding and
 * copy below are copied from it by value; nothing is imported from it, because
 * it carries wouter, timers and live send handlers.
 *
 * This file also owns the retail terminal chrome (sub-bar, FAB, send pill,
 * active stack, success banner) that retail-split re-uses, so the two retail
 * scenes cost one copy of it rather than two.
 */
import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, GREEN, NAVY, OFFW, WHITE } from '../tokens';
import { BottomHalf, Ic, Keypad, Press, Screen, SubHead, TopHalf } from '../primitives';
import { BEAT_MS, DWELL_MS, HOLD_MS, TAP_MS } from '../reducer';
import { RETAIL } from '../fixtures';

/* ── retail money ─────────────────────────────────────────────────────────
   The retail terminal prints two decimals on every amount (SmartTransitions
   `fmt`), where tokens' fmt drops them for whole dollars. Terminal screens use
   this one so $120 reads as $120.00 exactly as it does in the app. */
export const d2 = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function Amt({ cents, size = 88, color = NAVY, style }: { cents: number; size?: number; color?: string; style?: CSSProperties }) {
  return <div className="lp-amount" style={{ fontSize: size, color, ...style }}>{d2(cents)}</div>;
}

/* ── sub-bar ──────────────────────────────────────────────────────────────
   .tp-subbar: a sky pill floating on the panel seam. The production indicator
   is an absolutely positioned navy rect measured onto the active button; it is
   drawn here as the button's own background, which lands on the same pixels
   without a layout measurement. */
export type SubTab = 'stock' | 'split' | 'share' | 'cash';
const SUB_TABS: SubTab[] = ['stock', 'split', 'share', 'cash'];

function SubIcon({ id, c }: { id: SubTab; c: string }) {
  if (id === 'stock') {
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" fill={c} aria-hidden>
        <rect x="1" y="1" width="7" height="7" rx="2" /><rect x="12" y="1" width="7" height="7" rx="2" />
        <rect x="1" y="12" width="7" height="7" rx="2" /><rect x="12" y="12" width="7" height="7" rx="2" />
      </svg>
    );
  }
  if (id === 'split') {
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" aria-hidden>
        <line x1="10" y1="3" x2="10" y2="10" /><path d="M10 10Q10 14 5 17" /><path d="M10 10Q10 14 15 17" />
        <circle cx="10" cy="3" r="1.5" fill={c} stroke="none" /><circle cx="5" cy="17" r="1.5" fill={c} stroke="none" /><circle cx="15" cy="17" r="1.5" fill={c} stroke="none" />
      </svg>
    );
  }
  if (id === 'share') {
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" fill={c} aria-hidden>
        <circle cx="14" cy="4" r="2.5" /><circle cx="14" cy="16" r="2.5" /><circle cx="5" cy="10" r="2.5" />
        <rect x="6.5" y="5.5" width="6" height="1.8" rx="0.9" transform="rotate(-25 9.5 6.5)" />
        <rect x="6.5" y="12.5" width="6" height="1.8" rx="0.9" transform="rotate(25 9.5 13.5)" />
      </svg>
    );
  }
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <line x1="10" y1="2" x2="10" y2="18" />
      <path d="M14 5.5C14 5.5 12.5 4 10 4C7.5 4 5.5 5.5 5.5 7C5.5 8.5 7 9.5 10 10C13 10.5 14.5 11.5 14.5 13C14.5 14.5 12.5 16 10 16C7.5 16 6 14.5 6 14.5" />
    </svg>
  );
}

function SendPill({ tap = false, seq = 0 }: { tap?: boolean; seq?: number }) {
  return (
    <Press on={tap} seq={seq} radius={38}>
      <div className="lp-send">
        <span className="lp-send-circle">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="3" y1="8" x2="13" y2="8" /><polyline points="9,4 13,8 9,12" />
          </svg>
        </span>
        <span className="lp-send-label">send</span>
      </div>
    </Press>
  );
}

/**
 * `feature` screens park the bar 20px above the panel seam; the home terminal
 * parks it 67px below, beside the send pill when a sale is pending.
 */
export function SubBar({ active, feature = false, send = false, tapSend = false, seq = 0 }: { active?: SubTab; feature?: boolean; send?: boolean; tapSend?: boolean; seq?: number }) {
  return (
    <div
      style={{
        position: 'absolute', top: '50%', left: '50%', height: 37, display: 'flex', alignItems: 'center', gap: 8,
        transform: feature ? 'translate(-50%, calc(-100% - 20px))' : 'translate(-50%, 67px)',
      }}
    >
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          background: BLUE, borderRadius: 26, padding: '5px 11px', border: '1px solid rgba(255,255,255,0.3)',
          boxShadow: '0 16px 48px rgba(4,13,109,0.2), 0 4px 12px rgba(4,13,109,0.1), inset 0 1px 0 rgba(255,255,255,0.25)',
        }}
      >
        {SUB_TABS.map((id) => {
          const on = active === id;
          return (
            <div
              key={id}
              className="lp-t"
              style={{
                height: 27, padding: send ? '0 13px' : '0 25px', borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: on ? NAVY : 'transparent', boxShadow: on ? '0 4px 16px rgba(4,13,109,0.4)' : 'none',
              }}
            >
              <SubIcon id={id} c={on ? BLUE : 'rgba(4,13,109,0.55)'} />
              {on && <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: '0.4px', color: BLUE, whiteSpace: 'nowrap' }}>{id}</span>}
            </div>
          );
        })}
      </div>
      {send && <SendPill tap={tapSend} seq={seq} />}
    </div>
  );
}

/**
 * The + that opens the keypad — centred on the panel seam.
 *
 * The centring transform stays on an outer element: `Press` animates `transform`
 * to sink the control, and sharing one transform would fight the centring.
 */
export function Fab({ tap = false, seq = 0 }: { tap?: boolean; seq?: number }) {
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
      <Press on={tap} seq={seq} radius={48}>
        <div className="lp-fab lp-t">
          <Ic.Plus size={30} />
        </div>
      </Press>
    </div>
  );
}

/** Sky pill CTA — "confirm", "copy link". */
export function Cta({ label, style, tap = false, seq = 0 }: { label: string; style?: CSSProperties; tap?: boolean; seq?: number }) {
  return (
    <Press on={tap} seq={seq} radius={54}>
      <div
        className="lp-t"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 36px', borderRadius: 999,
          background: BLUE, color: NAVY, fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', ...style,
        }}
      >
        {label}
      </div>
    </Press>
  );
}

/* ── active stack ─────────────────────────────────────────────────────────
   The retail stack is one white card of rows: name, a pulsing status dot with
   the lowercase status, and the price. A split transaction replaces the status
   line with the split block (bars, dots, "n of m paid"). */
export type SplitState = 'setup' | { total: number; done: number };
export type StackItem = { name: string; amount: number; status?: 'awaiting payment' | 'paid' | 'sent'; split?: SplitState };

function SplitBlock({ split }: { split: SplitState }) {
  const setup = split === 'setup';
  const total = setup ? 0 : split.total;
  const done = setup ? 0 : split.done;
  const cells = setup ? [] : Array.from({ length: total }, (_, i) => i < done);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 5, padding: '6px 8px', background: 'rgba(4,13,109,0.04)', borderRadius: 8, borderLeft: `3px solid ${BLUE}` }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: BLUE, letterSpacing: '0.6px', textTransform: 'uppercase' }}>split bill</span>
      {setup ? (
        <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>awaiting customer setup</span>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {cells.map((full, i) => (
              <div key={i} className="lp-t" style={{ height: 7, flex: 1, borderRadius: 4, background: full ? GREEN : 'rgba(4,13,109,0.1)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {cells.map((full, i) => (
              <div key={i} className="lp-t" style={{ width: 8, height: 8, borderRadius: '50%', background: full ? GREEN : 'rgba(4,13,109,0.12)', border: `1.5px solid ${full ? GREEN : 'rgba(4,13,109,0.15)'}` }} />
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{done >= total ? 'all paid' : `${done} of ${total} paid`}</span>
        </>
      )}
    </div>
  );
}

export function ActiveStack({ items }: { items: StackItem[] }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', marginBottom: 12 }}>
        <div className="lp-stack-title">active stack</div>
        <div style={{ color: BLUE, display: 'flex', padding: '4px 8px' }}><Ic.Chevron size={16} /></div>
      </div>
      <div className="lp-stack-card">
        {items.length === 0 ? (
          <div style={{ padding: '14px 16px', fontSize: 13, color: 'rgba(4,13,109,0.4)', textAlign: 'center' }}>tap + to add an item</div>
        ) : (
          items.map((it, i) => (
            <div
              key={it.name}
              className="lp-t"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderTop: i ? '1px solid rgba(4,13,109,0.05)' : undefined }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: NAVY, marginBottom: 1 }}>{it.name}</div>
                {it.split ? (
                  <SplitBlock split={it.split} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="lp-t" style={{ width: 5, height: 5, borderRadius: '50%', background: it.status === 'paid' ? GREEN : BLUE, opacity: it.status === 'paid' ? 1 : 0.7 }} />
                    <span style={{ fontWeight: 500, fontSize: 11, color: 'rgba(4,13,109,0.35)' }}>{it.status ?? 'awaiting payment'}</span>
                  </div>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, letterSpacing: '-0.3px' }}>{d2(it.amount)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** The merchant's "Payment Received" banner (.tp-top-banner). */
export function PaidBanner({ amount }: { amount: number }) {
  return (
    <div
      className="lp-t"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 55,
        background: 'linear-gradient(150deg, #040D6D 0%, #072b20 100%)',
        borderBottom: `2px solid ${GREEN}`, boxShadow: '0 8px 40px rgba(27,191,133,0.3)',
        padding: '52px 22px 20px', display: 'flex', alignItems: 'center', gap: 16,
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: GREEN, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ic.Check size={20} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: WHITE }}>Payment Received</div>
        <div style={{ fontWeight: 900, fontSize: 26, color: GREEN, letterSpacing: '-0.5px', marginTop: 2 }}>{d2(amount)}</div>
      </div>
    </div>
  );
}

/* ── screens ──────────────────────────────────────────────────────────────*/

/** Terminal home: navy amount half over the off-white active stack. */
export function Terminal({ total, line, sub, items, cancel = false, send = false, banner, tapFab = false, tapSend = false, seq = 0 }: {
  total: number;
  line: string;
  sub?: string;
  items: StackItem[];
  cancel?: boolean;
  send?: boolean;
  banner?: number;
  tapFab?: boolean;
  tapSend?: boolean;
  seq?: number;
}) {
  return (
    <Screen>
      <div style={{ background: NAVY, height: '50%', flexShrink: 0, padding: '100px 28px 28px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {cancel && (
          <div style={{ position: 'absolute', top: 18, left: 20, width: 44, height: 44, borderRadius: 999, color: NAVY, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic.Close size={16} />
          </div>
        )}
        <Amt cents={total} color={BLUE} />
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <div className="lp-pill outline">paywave</div>
          <div className="lp-pill outline" style={{ marginLeft: 10 }}>boards</div>
        </div>
        <div style={{ marginTop: 33, color: BLUE, fontWeight: 500, fontSize: 18, lineHeight: 1.25 }}>
          {line}
          {sub && <div style={{ marginTop: 6, color: WHITE, fontWeight: 600, fontSize: 14 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ flex: 1, background: OFFW, padding: '154px 22px 90px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ActiveStack items={items} />
      </div>
      <Fab tap={tapFab} seq={seq} />
      <SubBar send={send} tapSend={tapSend} seq={seq} />
      {banner !== undefined && <PaidBanner amount={banner} />}
    </Screen>
  );
}

/** Keypad compose screen. `hit` lights the key the script is pressing. */
export function KeypadScreen({ cents, hit, splitOn = false, commitReady = false, tapCommit = false, tapSplit = false, seq = 0 }: {
  cents: number;
  hit?: string;
  splitOn?: boolean;
  commitReady?: boolean;
  tapCommit?: boolean;
  tapSplit?: boolean;
  seq?: number;
}) {
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady={commitReady} tapCommit={tapCommit} seq={seq} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Amt cents={cents} color={cents === 0 ? 'rgba(4,13,109,0.32)' : NAVY} style={{ marginTop: 18 }} />
          <Press on={tapSplit} seq={seq} radius={40} style={{ alignSelf: 'flex-start' }}>
            <div
              className="lp-pill lp-t"
              style={{
                padding: '8px 16px',
                background: splitOn ? NAVY : 'transparent',
                color: splitOn ? BLUE : NAVY,
                boxShadow: splitOn ? 'none' : 'inset 0 0 0 1px rgba(4,13,109,0.5)',
              }}
            >
              split bill
            </div>
          </Press>
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>
      <BottomHalf>
        <Keypad hit={hit} seq={seq} />
      </BottomHalf>
      <SubBar feature />
    </Screen>
  );
}

const FIELD: CSSProperties = {
  width: '100%', padding: '18px 24px', borderRadius: 999, background: OFFW,
  fontWeight: 500, fontSize: 17, letterSpacing: '-0.01em', boxSizing: 'border-box',
};

function Field({ value, placeholder }: { value?: string; placeholder: string }) {
  return <div style={{ ...FIELD, color: value ? NAVY : 'rgba(4,13,109,0.35)' }}>{value ?? placeholder}</div>;
}

function Stepper({ children, size = 44 }: { children: ReactNode; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: BLUE, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}

function Minus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}

/** Keypad ✓ morphs into this: name the item, set the quantity, confirm. */
function DetailsScreen({ tapConfirm = false, seq = 0 }: { tapConfirm?: boolean; seq?: number } = {}) {
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '8px 28px 12px', display: 'flex', alignItems: 'center' }}>
          <Amt cents={RETAIL.saleCents} />
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>
      <BottomHalf padding="40px 28px 28px">
        <div style={{ color: BLUE, fontWeight: 500, fontSize: 18, textAlign: 'center' }}>enter transaction details</div>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field value="flat white" placeholder="item name" />
          <Field value="6.25" placeholder="amount" />
          <Field placeholder="description" />
        </div>
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 20 }}>quantity</div>
          <Stepper size={32}><Minus /></Stepper>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 22, minWidth: 22, textAlign: 'center' }}>2</div>
          <Stepper size={32}><Ic.Plus size={14} /></Stepper>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'center' }}><Cta label="confirm" tap={tapConfirm} seq={seq} /></div>
      </BottomHalf>
      <SubBar feature />
    </Screen>
  );
}

/** The terminal's stylised QR mark (Ic.QRBig). Decorative: it encodes nothing,
 *  needs no QR library, and the demo shows no working payment link. */
function QrMark({ size = 150 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <path d="M8,22 L8,8 L22,8" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M78,8 L92,8 L92,22" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8,78 L8,92 L22,92" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M78,92 L92,92 L92,78" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="20" width="22" height="22" rx="4" fill={BLUE} />
      <rect x="58" y="20" width="22" height="22" rx="4" fill={BLUE} />
      <rect x="20" y="58" width="22" height="22" rx="4" fill={BLUE} />
      <rect x="58" y="58" width="9" height="9" rx="1.5" fill={BLUE} />
      <rect x="71" y="58" width="9" height="9" rx="1.5" fill={BLUE} />
      <rect x="58" y="71" width="9" height="9" rx="1.5" fill={BLUE} />
      <rect x="71" y="71" width="9" height="9" rx="1.5" fill={BLUE} />
    </svg>
  );
}

const shareIcon = (d: ReactNode) => (
  <div style={{ padding: 8, display: 'flex', color: BLUE }}>
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
  </div>
);

function ShareScreen() {
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '8px 28px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <Amt cents={RETAIL.saleCents} size={76} />
          <div style={{ marginTop: 16, fontWeight: 500, fontSize: 18, lineHeight: 1.4 }}>{RETAIL.saleItem}</div>
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>
      <BottomHalf padding="52px 28px 22px">
        <div style={{ position: 'relative', alignSelf: 'center' }}>
          <div style={{ width: 220, height: 220, borderRadius: 28, background: NAVY, boxShadow: `inset 0 0 0 4px ${BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <QrMark />
          </div>
          <div style={{ position: 'absolute', bottom: 10, right: 10, width: 30, height: 30, borderRadius: '50%', background: 'rgba(4,13,109,0.55)', border: `1.5px solid ${BLUE}`, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
          <Cta label="copy link" style={{ minWidth: 180 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '8px 20px', borderRadius: 999, border: '1px solid rgba(88,171,255,0.5)', minWidth: 180 }}>
            {shareIcon(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></>)}
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            {shareIcon(<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />)}
            <div style={{ width: 1, height: 20, background: 'rgba(88,171,255,0.3)' }} />
            {shareIcon(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 7 10-7" /></>)}
          </div>
        </div>
      </BottomHalf>
      <SubBar feature active="share" />
    </Screen>
  );
}

/* ── the session ──────────────────────────────────────────────────────────
   One pass through the retail terminal, written as the frames a viewer sees
   rather than as milestones. It opens where the merchant actually opens the
   app — the terminal home — and every screen change is preceded by a visible
   press on the control that causes it, so the phone reads as somebody using it
   rather than as a slideshow advancing itself.

   `ms` is how long the frame holds. Presses are brief; the screens they open
   linger. */
type Frame = {
  ms: number;
  /**
   * Which screen this frame is. Frames are keyed on it, so a screen change
   * remounts and replays `lp-screen-in` while four keypresses on one keypad do
   * not.
   */
  screen: string;
  render: (seq: number) => ReactNode;
};

const KEY_SEQUENCE = ['1', '2', '5', '0'] as const;
/** The amount as each key lands: $0.00 → $1.25 → $12.50. */
const KEY_AMOUNTS = [1, 12, 125, 1250];

const PENDING = { total: RETAIL.saleCents, line: RETAIL.saleItem, sub: 'tap send to share payment' } as const;
const STACKED = (status: 'awaiting payment' | 'paid'): StackItem[] => [
  { name: RETAIL.saleItem, amount: RETAIL.saleCents, status },
];

const FRAMES: Frame[] = [
  // Terminal home, nothing pending — where the merchant actually opens the app.
  { ms: BEAT_MS, screen: 'home', render: () => <Terminal total={0} line="no items yet" items={[]} /> },
  // Tap + to start a sale.
  { ms: TAP_MS, screen: 'home', render: (seq) => <Terminal total={0} line="no items yet" items={[]} tapFab seq={seq} /> },
  // Keypad opens empty.
  { ms: 440, screen: 'keypad', render: () => <KeypadScreen cents={0} /> },
  // Type 1, 2, 5, 0 — each press visible, the amount building as it goes.
  ...KEY_SEQUENCE.map((k, i) => ({
    ms: TAP_MS,
    screen: 'keypad',
    render: (seq: number) => <KeypadScreen cents={KEY_AMOUNTS[i]} hit={k} seq={seq} commitReady={i > 0} />,
  })),
  // The finished amount, read for a moment before committing.
  { ms: DWELL_MS, screen: 'keypad', render: () => <KeypadScreen cents={RETAIL.saleCents} commitReady /> },
  // Tap ✓ to name the item.
  { ms: TAP_MS, screen: 'keypad', render: (seq) => <KeypadScreen cents={RETAIL.saleCents} commitReady tapCommit seq={seq} /> },
  { ms: DWELL_MS, screen: 'details', render: () => <DetailsScreen /> },
  { ms: TAP_MS, screen: 'details', render: (seq) => <DetailsScreen tapConfirm seq={seq} /> },
  { ms: BEAT_MS, screen: 'pending', render: () => <Terminal {...PENDING} items={[]} cancel send /> },
  // Tap send to raise the QR.
  { ms: TAP_MS, screen: 'pending', render: (seq) => <Terminal {...PENDING} items={[]} cancel send tapSend seq={seq} /> },
  { ms: DWELL_MS + 400, screen: 'share', render: () => <ShareScreen /> },
  // Back on the terminal, the sale sitting in the stack awaiting the customer.
  { ms: DWELL_MS, screen: 'stack', render: () => <Terminal total={0} line="no items yet" items={STACKED('awaiting payment')} /> },
  // The customer pays: banner drops in, the row flips to paid.
  { ms: HOLD_MS, screen: 'stack', render: () => <Terminal total={0} line="no items yet" items={STACKED('paid')} banner={RETAIL.saleCents} /> },
];

function RetailSale({ step }: SceneProps) {
  const i = Math.min(Math.max(step, 0), FRAMES.length - 1);
  const frame = FRAMES[i];
  return <Fragment key={frame.screen}>{frame.render(i)}</Fragment>;
}

export const retailSaleScene: SceneDefinition = {
  id: 'retail-sale',
  steps: FRAMES.length,
  beats: FRAMES.map((f) => f.ms),
  label: '$12.50 flat white sale paid',
  Component: RetailSale,
};
