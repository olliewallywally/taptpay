/**
 * Scene: property-bill (story card 02) — §4.3 Property, utility bill
 *
 * Milestones:
 *   0  enter bill/expense intent — the terminal home with bill mode opened
 *   1  select the tenant
 *   2  enter $86.40
 *   3  select/type "water" and the due option
 *   4  show the pre-seeded water-invoice.pdf chip (never opens a file picker)
 *   5  send
 *   6  "bill sent"
 *   7  tenant history — the bill sits at sent
 *   8  tenant history — the bill moves to paid
 *
 * §4.3 beat 7 is three frames, not one: the confirmation, then the history row
 * before and after payment. `steps` is 9 rather than the stub's 7 so the
 * sent → paid movement is actually visible instead of asserted.
 *
 * The Property chrome (action bar, tenant picker, keypad, confirmation, CTA)
 * comes from rent-weekly.tsx so the two Property scenes ship one copy of it.
 */
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, GREEN, NAVY, NAVY_50, OFFW, fmt } from '../tokens';
import { BottomHalf, Ic, Press, Screen, SubHead, TopHalf } from '../primitives';
import { BEAT_MS, DWELL_MS, HOLD_MS, TAP_MS } from '../reducer';
import { PROPERTY } from '../fixtures';
import {
  ActionBar,
  AmountScreen,
  Caption,
  SuccessScreen,
  TenantPicker,
  WireCta,
  sky,
  wht,
} from './rent-weekly';

const TENANT = PROPERTY.tenant;
const INITIALS = TENANT.name.slice(0, 1).toUpperCase();

/* Production CHARGE_TYPES / DUE_OPTIONS, by value. */
const CHARGE_TYPES = ['water / utilities', 'late fee', 'cleaning', 'damages', 'other'];
const DUE_OPTIONS = ['on receipt', 'in 7 days', 'in 14 days'];
/** 'water' selects the utilities type, whose production preset fills the note. */
const CHARGE_LABEL = 'Water / utilities';
/** fixtures' 'due in 7 days' → the production option label 'in 7 days'. */
const DUE_ACTIVE = PROPERTY.billDue.replace('due ', '');

/** ChargeBill — what for, description, invoice document, due. */
function BillCompose({ step, tapSend = false, seq = 0 }: { step: number; tapSend?: boolean; seq?: number }) {
  const doc = step >= 4;
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="lp-amount" style={{ fontSize: 82, color: NAVY }}>{fmt(PROPERTY.billCents)}</span>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'rgba(4,13,109,0.4)', textDecoration: 'underline', textUnderlineOffset: 2 }}>edit</span>
          </div>
          <div style={{ marginTop: 14, fontWeight: 500, fontSize: 16, color: NAVY, lineHeight: 1.4, textTransform: 'capitalize' }}>
            {TENANT.name}
            <div style={{ fontWeight: 400, fontSize: 14, color: NAVY_50, marginTop: 4, textTransform: 'none' }}>{TENANT.address}</div>
          </div>
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>

      <BottomHalf padding="22px 22px 0">
        {/* what for */}
        <Caption style={{ marginBottom: 8 }}>what for</Caption>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {CHARGE_TYPES.map((c) => {
            const on = c.startsWith(PROPERTY.billType);
            return (
              <div key={c} className="lp-t" style={{ padding: '8px 16px', borderRadius: 999, border: `1.5px solid ${on ? BLUE : sky(0.35)}`, background: on ? BLUE : 'transparent', color: on ? NAVY : BLUE, fontWeight: 700, fontSize: 13 }}>
                {c}
              </div>
            );
          })}
        </div>

        {/* description — prefilled from the chosen type's preset */}
        <Caption style={{ marginBottom: 8 }}>description</Caption>
        <div style={{ width: '100%', padding: '12px 22px', borderRadius: 999, background: OFFW, color: NAVY, fontWeight: 500, fontSize: 16, letterSpacing: '-0.01em', boxSizing: 'border-box', marginBottom: 10 }}>
          {CHARGE_LABEL}
        </div>

        {/* invoice document — pre-seeded, so no file picker ever opens */}
        <Caption style={{ marginBottom: 8 }}>
          invoice <span style={{ opacity: 0.6 }}>· optional</span>
        </Caption>
        {doc ? (
          <div className="lp-t" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', background: sky(0.1), border: `1px solid ${sky(0.4)}`, borderRadius: 16, marginBottom: 10, color: BLUE }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 16.5h6" />
            </svg>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 13.5, color: BLUE }}>{PROPERTY.billDoc}</span>
            <span style={{ fontWeight: 600, fontSize: 12.5, color: sky(0.7), flexShrink: 0 }}>remove</span>
          </div>
        ) : (
          <div className="lp-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '13px 16px', background: wht(0.05), border: `1.5px dashed ${sky(0.4)}`, borderRadius: 16, marginBottom: 10 }}>
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: 13.5, color: BLUE }}>attach invoice (PDF/image)</span>
          </div>
        )}

        {/* due */}
        <Caption style={{ marginBottom: 8 }}>due</Caption>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {DUE_OPTIONS.map((d) => {
            const on = d === DUE_ACTIVE;
            return (
              <div key={d} className="lp-t" style={{ padding: '12px 4px', textAlign: 'center', borderRadius: 14, border: `1.5px solid ${on ? BLUE : sky(0.35)}`, background: on ? BLUE : 'transparent', color: on ? NAVY : BLUE, fontWeight: 700, fontSize: 12.5 }}>
                {d}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ flexShrink: 0, padding: '8px 0 14px', display: 'flex', justifyContent: 'center' }}>
          <WireCta label="send bill" filled={step >= 5} tap={tapSend} seq={seq} />
        </div>
      </BottomHalf>
      <ActionBar active="bill" />
    </Screen>
  );
}

/* ── tenant history — the terminal's request feed ───────────────────────── */

function HistoryRow({ label, status, cents, note, top }: { label: string; status: 'sent' | 'paid'; cents: number; note?: string; top?: boolean }) {
  const paid = status === 'paid';
  return (
    <div className="lp-t" style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: top ? 'none' : '1px solid rgba(4,13,109,0.05)' }}>
      <div style={{ width: 34, height: 34, borderRadius: 999, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: BLUE, marginRight: 12 }}>{INITIALS}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: NAVY, marginBottom: 1, textTransform: 'capitalize' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="lp-t" style={{ width: 5, height: 5, borderRadius: 999, background: paid ? GREEN : BLUE, flexShrink: 0 }} />
          <span className="lp-t" style={{ fontWeight: 500, fontSize: 11, color: paid ? GREEN : 'rgba(4,13,109,0.35)' }}>{status}</span>
          {note && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: NAVY, background: 'rgba(88,171,255,0.18)', padding: '1px 6px', borderRadius: 6 }}>{note}</span>
          )}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, letterSpacing: '-0.3px', flexShrink: 0 }}>{fmt(cents)}</div>
    </div>
  );
}

const FILTERS = ['all', 'overdue', 'sent', 'paid', 'failed'];

/** RequestsHome — the terminal's resting surface. It opens the scene (tapping
 *  `bill` is the expense intent) and closes it, because it is also where the
 *  tenant's bill visibly settles from sent to paid. */
export function HomeScreen({ bill, active, tapFab = false, tapBar, seq = 0 }: { bill?: 'sent' | 'paid'; active?: string; tapFab?: boolean; tapBar?: string; seq?: number }) {
  return (
    <Screen background={OFFW}>
      <div style={{ background: NAVY, height: '40%', padding: '86px 28px 24px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div className="lp-amount" style={{ fontSize: 82, color: BLUE }}>{fmt(PROPERTY.rentCents)}</div>
        <div style={{ marginTop: 10, color: BLUE, fontWeight: 500, fontSize: 16 }}>outstanding rent</div>
        <div className="lp-amount lp-t" style={{ marginTop: 12, fontSize: 42, fontWeight: 500, color: sky(0.55) }}>{fmt(bill === 'sent' ? PROPERTY.billCents : 0)}</div>
        <div style={{ marginTop: 4, color: sky(0.55), fontWeight: 400, fontSize: 13 }}>outstanding expenses</div>
      </div>

      <div style={{ flex: 1, background: OFFW, padding: '154px 22px 100px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
          <span className="lp-stack-title">rent requests</span>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 15l-6-6-6 6" /></svg>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
          {FILTERS.map((f) => {
            const on = f === 'all';
            return (
              <div key={f} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${on ? NAVY : 'rgba(4,13,109,0.25)'}`, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', background: on ? NAVY : 'transparent', color: on ? BLUE : 'rgba(4,13,109,0.45)' }}>
                {f}
              </div>
            );
          })}
        </div>
        <div className="lp-stack-card">
          {bill && <HistoryRow top label={TENANT.name} status={bill} cents={PROPERTY.billCents} note={CHARGE_LABEL} />}
          <HistoryRow top={!bill} label={TENANT.name} status="sent" cents={PROPERTY.rentCents} />
        </div>
      </div>

      {/* the home overlay: new-request FAB over the boundary, action bar below */}
      <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 30 }}>
        <Press on={tapFab} seq={seq} radius={48}>
          <div className="lp-fab"><Ic.Plus size={30} /></div>
        </Press>
      </div>
      <ActionBar top="calc(40% + 67px)" send active={active} tap={tapBar} seq={seq} />
    </Screen>
  );
}

/* ── the session ──────────────────────────────────────────────────────────
   Opens on the property terminal home — outstanding rent and expenses, which is
   what a manager opens the app to see — then raises a water bill from it and
   returns there to watch it settle. Every screen change is preceded by a press. */

const BILL_KEYS = ['8', '6', '4', '0'] as const;
/** $0.08 → $0.86 → $8.64 → $86.40, filling right to left. */
const BILL_AMOUNTS = [8, 86, 864, 8640];

type Frame = { ms: number; screen: string; render: (seq: number) => ReactNode };

const FRAMES: Frame[] = [
  { ms: BEAT_MS, screen: 'home', render: () => <HomeScreen /> },
  // Tap "bill" on the action bar — the expense intent.
  { ms: TAP_MS, screen: 'home', render: (seq) => <HomeScreen tapBar="bill" seq={seq} /> },
  { ms: 480, screen: 'home', render: () => <HomeScreen active="bill" /> },
  { ms: BEAT_MS, screen: 'tenant', render: () => <TenantPicker selected={false} amount={PROPERTY.rentCents} /> },
  { ms: TAP_MS, screen: 'tenant', render: (seq) => <TenantPicker selected={false} amount={PROPERTY.rentCents} tap seq={seq} /> },
  { ms: 480, screen: 'tenant', render: () => <TenantPicker selected amount={PROPERTY.rentCents} /> },
  { ms: 440, screen: 'amount', render: () => <AmountScreen cents={0} /> },
  ...BILL_KEYS.map((k, i) => ({
    ms: TAP_MS,
    screen: 'amount',
    render: (seq: number) => <AmountScreen cents={BILL_AMOUNTS[i]} hit={k} seq={seq} />,
  })),
  { ms: DWELL_MS, screen: 'amount', render: () => <AmountScreen cents={PROPERTY.billCents} /> },
  { ms: TAP_MS, screen: 'amount', render: (seq) => <AmountScreen cents={PROPERTY.billCents} tapCommit seq={seq} /> },
  // The composer fills in: charge type, description, then the attached invoice.
  { ms: BEAT_MS, screen: 'compose', render: () => <BillCompose step={3} /> },
  { ms: DWELL_MS, screen: 'compose', render: () => <BillCompose step={4} /> },
  { ms: TAP_MS, screen: 'compose', render: (seq) => <BillCompose step={4} tapSend seq={seq} /> },
  { ms: DWELL_MS, screen: 'sent', render: () => <SuccessScreen cents={PROPERTY.billCents} title="bill sent" /> },
  // Back home: the bill is outstanding, then the tenant pays it.
  { ms: DWELL_MS, screen: 'home-after', render: () => <HomeScreen bill="sent" /> },
  { ms: HOLD_MS, screen: 'home-after', render: () => <HomeScreen bill="paid" /> },
];

function PropertyBill({ step }: SceneProps) {
  const i = Math.min(Math.max(step, 0), FRAMES.length - 1);
  const frame = FRAMES[i];
  return <Fragment key={frame.screen}>{frame.render(i)}</Fragment>;
}

export const propertyBillScene: SceneDefinition = {
  id: 'property-bill',
  steps: FRAMES.length,
  beats: FRAMES.map((f) => f.ms),
  label: 'water bill for $86.40 sent and paid',
  Component: PropertyBill,
};
