/**
 * Scene: retail-split (story card 06) — §4.7 Retail/customer, split bill
 *
 * Milestones:
 *   0  create a $120 merchant transaction (terminal keypad)
 *   1  enable split bill and confirm it
 *   2  the transaction lands split-flagged, awaiting the customer
 *   3  crossfade to the customer split page — person 1 of 2, $60 each
 *   4  the customer raises the count to four people → $30 each
 *   5  one share confirmed — person 2 of 4, 1 of 4 paid
 *   6  progress runs on — person 4 of 4, 3 of 4 paid
 *   7  "All done!" — all 4 payments complete, $120.00 total paid
 *
 * This visibly demonstrates setup, customer choice, confirmation and
 * completion; merely toggling the split control does not satisfy the plan.
 *
 * Fidelity sources: SmartTransitions.jsx (merchant keypad + active stack split
 * block) and client/src/pages/split-payment.tsx with client/src/lib/
 * checkout-theme.ts (the customer card: navy 44px card on off-white, sky type,
 * segment progress bars, outline pill actions).
 */
import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, NAVY, OFFW } from '../tokens';
import { Screen } from '../primitives';
import { BEAT_MS, DWELL_MS, HOLD_MS, TAP_MS } from '../reducer';
import { RETAIL } from '../fixtures';
import { KeypadScreen, Terminal, d2 } from './retail-sale';

/** CHECKOUT_THEME.SKY_DIM — the muted sky the customer card uses on navy. */
export const SKY_DIM = '#7CB9FF';

/** The split transaction's name. SmartTransitions' split commit falls back to
 *  this exact label when the merchant rings the total straight on the keypad. */
const ITEM = 'split bill';

/* ── customer card shell ──────────────────────────────────────────────────*/

/** TaptWordmark: serif "tapt" + italic "pay" in Larken 900, sky on navy. */
export function TaptMark() {
  return (
    <span style={{ fontFamily: "'Larken', Georgia, serif", fontWeight: 900, fontSize: 34, color: BLUE, lineHeight: 1, letterSpacing: '-0.5px' }}>
      tapt<span style={{ fontStyle: 'italic' }}>pay</span>
    </span>
  );
}

/** pageStyle + cardStyle from checkout-theme.ts. */
export function CustomerCard({ children, minHeight = 560, center = false, secured = false }: {
  children: ReactNode;
  minHeight?: number;
  center?: boolean;
  secured?: boolean;
}) {
  return (
    <Screen background={OFFW}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div
            className="lp-t"
            style={{
              background: NAVY, borderRadius: 44, minHeight, padding: '44px 32px 36px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: center ? 'center' : 'flex-start',
              boxShadow: '0 24px 60px rgba(4,13,109,0.28)', position: 'relative', overflow: 'hidden',
            }}
          >
            {children}
          </div>
          {secured && (
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: '#9aa0b5', letterSpacing: '0.03em' }}>
              Secured by <strong style={{ color: NAVY, fontWeight: 600 }}>Windcave</strong> · PCI DSS Compliant
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}

/** chipStyle — "Person 1 of 4". */
export function Chip({ label }: { label: string }) {
  return (
    <div className="lp-t" style={{ background: 'rgba(88,171,255,0.14)', border: '1px solid rgba(88,171,255,0.35)', borderRadius: 10, color: BLUE, fontSize: 14, fontWeight: 500, padding: '8px 16px', marginBottom: 14 }}>
      {label}
    </div>
  );
}

/** labelStyle — the item name on the card. */
export function CardLabel({ text }: { text: string }) {
  return <p style={{ color: BLUE, fontSize: 22, fontWeight: 500, textAlign: 'center', lineHeight: 1.3, margin: 0 }}>{text}</p>;
}

/** amountStyle — the card's headline amount. */
export function CardAmount({ text, size = 56, style }: { text: string; size?: number; style?: CSSProperties }) {
  return (
    <p className="lp-t" style={{ color: BLUE, fontSize: size, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1.05, textAlign: 'center', margin: '10px 0', ...style }}>
      {text}
    </p>
  );
}

/** outlineBtnStyle — "pay $30.00", "confirm", "done". */
export function OutlineBtn({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <div
      className="lp-t"
      style={{
        background: 'transparent', color: BLUE, border: `1.5px solid ${BLUE}`, borderRadius: 14,
        padding: '14px 20px', fontSize: 16, fontWeight: 600, width: '100%', textAlign: 'center', boxSizing: 'border-box', ...style,
      }}
    >
      {label}
    </div>
  );
}

/** footerLinkStyle — "enter different amount", "pay full amount instead". */
export function FooterLink({ label }: { label: string }) {
  return <div style={{ color: SKY_DIM, fontSize: 14, fontWeight: 500, padding: 8 }}>{label}</div>;
}

/** split-payment's progressBars(count, done) — one segment per payer. */
function Bars({ total, done }: { total: number; done: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 20 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="lp-t" style={{ flex: 1, height: 6, borderRadius: 999, background: i < done ? BLUE : 'rgba(88,171,255,0.25)' }} />
      ))}
    </div>
  );
}

function Stepper({ children, pressed = false }: { children: ReactNode; pressed?: boolean }) {
  return (
    <div
      className="lp-t"
      style={{
        width: 48, height: 48, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1.5px solid ${BLUE}`, color: BLUE, transform: pressed ? 'scale(0.92)' : undefined,
        background: pressed ? 'rgba(88,171,255,0.18)' : 'transparent',
      }}
    >
      {children}
    </div>
  );
}

const stepIcon = (d: ReactNode) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>{d}</svg>
);

/** lucide CheckCircle — the split page's completion mark. */
export function CheckCircleMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block', margin: '0 auto 16px' }}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

/* ── customer screens ─────────────────────────────────────────────────────*/

/** First payer: picks how many ways the bill splits. */
function FirstPayer({ people, plusPressed = false }: { people: number; plusPressed?: boolean }) {
  const share = RETAIL.splitTotalCents / people;
  return (
    <CustomerCard secured>
      <TaptMark />
      <div style={{ flex: 1, minHeight: 12 }} />
      <Chip label={`Person 1 of ${people}`} />
      <CardLabel text={ITEM} />
      <CardAmount text={d2(RETAIL.splitTotalCents)} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 6 }}>
        <Stepper>{stepIcon(<path d="M5 12h14" />)}</Stepper>
        <span className="lp-t" style={{ color: SKY_DIM, fontSize: 14, width: 80, textAlign: 'center' }}>{people} people</span>
        <Stepper pressed={plusPressed}>{stepIcon(<path d="M12 5v14M5 12h14" />)}</Stepper>
      </div>

      <p className="lp-t" style={{ color: SKY_DIM, fontSize: 14, marginTop: 12, marginBottom: 0 }}>
        each pays <span style={{ color: BLUE, fontWeight: 700 }}>{d2(share)}</span>
      </p>
      <FooterLink label="enter different amount" />

      <Bars total={people} done={0} />
      <p style={{ color: SKY_DIM, fontSize: 12, marginTop: 8, marginBottom: 0 }}>{`0 of ${people} paid`}</p>

      <div style={{ flex: 1, minHeight: 16 }} />
      <OutlineBtn label={`pay ${d2(share)}`} />
      <FooterLink label="pay full amount instead" />
    </CustomerCard>
  );
}

/** Every payer after the first: the split is set up, progress is running. */
function NextPayer({ done }: { done: number }) {
  const total = RETAIL.splitPeople;
  return (
    <CustomerCard secured>
      <TaptMark />
      <div style={{ flex: 1, minHeight: 12 }} />
      <Chip label={`Person ${done + 1} of ${total}`} />
      <CardLabel text={ITEM} />
      <CardAmount text={d2(RETAIL.splitShareCents)} />
      <FooterLink label="enter different amount" />

      <Bars total={total} done={done} />
      <p style={{ color: SKY_DIM, fontSize: 12, marginTop: 8, marginBottom: 0 }}>{`${done} of ${total} paid`}</p>

      <div style={{ flex: 1, minHeight: 16 }} />
      <OutlineBtn label={`pay ${d2(RETAIL.splitShareCents)}`} />
    </CustomerCard>
  );
}

/** The completion + receipt confirmation the story finishes on. */
function AllDone() {
  return (
    <CustomerCard secured>
      <TaptMark />
      <div style={{ flex: 1 }} />
      <div style={{ textAlign: 'center' }}>
        <CheckCircleMark />
        <p style={{ color: BLUE, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>All done!</p>
        <p style={{ color: SKY_DIM, fontSize: 14, margin: 0 }}>{`All ${RETAIL.splitPeople} payments complete`}</p>
        <CardAmount text={d2(RETAIL.splitTotalCents)} size={44} style={{ margin: '16px 0 2px' }} />
        <p style={{ color: SKY_DIM, fontSize: 13, margin: 0 }}>total paid</p>
      </div>
      <div style={{ flex: 1 }} />
      <OutlineBtn label="done" style={{ marginTop: 8 }} />
    </CustomerCard>
  );
}

/* ── the session ──────────────────────────────────────────────────────────
   Opens on the retail terminal home, rings up $120 on the keypad a digit at a
   time, turns on split bill, and then hands over to the customer's own screen —
   which is the point of the scene, so the handover is given a beat of its own
   rather than being a cut nobody notices. */

const SPLIT_KEYS = ['1', '2', '0', '0', '0'] as const;
/** $0.01 → $0.12 → $1.20 → $12.00 → $120.00, as the terminal fills right to left. */
const SPLIT_AMOUNTS = [1, 12, 120, 1200, 12000];

const SPLIT_PENDING = [{ name: ITEM, amount: RETAIL.splitTotalCents, split: 'setup' as const }];

type Frame = { ms: number; screen: string; render: (seq: number) => ReactNode };

const FRAMES: Frame[] = [
  // The terminal home the merchant opens the app on.
  { ms: BEAT_MS, screen: 'home', render: () => <Terminal total={0} line="no items yet" items={[]} /> },
  { ms: TAP_MS, screen: 'home', render: (seq) => <Terminal total={0} line="no items yet" items={[]} tapFab seq={seq} /> },
  { ms: 440, screen: 'keypad', render: () => <KeypadScreen cents={0} /> },
  ...SPLIT_KEYS.map((k, i) => ({
    ms: TAP_MS,
    screen: 'keypad',
    render: (seq: number) => <KeypadScreen cents={SPLIT_AMOUNTS[i]} hit={k} seq={seq} commitReady={i > 0} />,
  })),
  // Tap "split bill" — the control this whole scene exists to show.
  { ms: TAP_MS, screen: 'keypad', render: (seq) => <KeypadScreen cents={RETAIL.splitTotalCents} commitReady tapSplit seq={seq} /> },
  { ms: DWELL_MS, screen: 'keypad', render: () => <KeypadScreen cents={RETAIL.splitTotalCents} splitOn commitReady /> },
  { ms: TAP_MS, screen: 'keypad', render: (seq) => <KeypadScreen cents={RETAIL.splitTotalCents} splitOn commitReady tapCommit seq={seq} /> },
  // Split-flagged on the terminal, waiting on the customer.
  { ms: DWELL_MS, screen: 'pending', render: () => <Terminal total={0} line="no items yet" items={SPLIT_PENDING} /> },
  // Over to the customer's phone: two ways, then they raise it to four.
  { ms: DWELL_MS, screen: 'customer', render: () => <FirstPayer people={2} /> },
  { ms: TAP_MS, screen: 'customer', render: () => <FirstPayer people={2} plusPressed /> },
  { ms: DWELL_MS, screen: 'customer', render: () => <FirstPayer people={RETAIL.splitPeople} /> },
  { ms: BEAT_MS, screen: 'paying', render: () => <NextPayer done={1} /> },
  { ms: BEAT_MS, screen: 'paying', render: () => <NextPayer done={RETAIL.splitPeople - 1} /> },
  { ms: HOLD_MS, screen: 'done', render: () => <AllDone /> },
];

function RetailSplit({ step }: SceneProps) {
  const i = Math.min(Math.max(step, 0), FRAMES.length - 1);
  const frame = FRAMES[i];
  return <Fragment key={frame.screen}>{frame.render(i)}</Fragment>;
}

export const retailSplitScene: SceneDefinition = {
  id: 'retail-split',
  steps: FRAMES.length,
  beats: FRAMES.map((f) => f.ms),
  label: '$120 bill split four ways and fully paid',
  Component: RetailSplit,
};
