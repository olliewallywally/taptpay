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
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, GREEN, NAVY, NAVY_50, OFFW, fmt } from '../tokens';
import { BottomHalf, Ic, Screen, SubHead, TopHalf } from '../primitives';
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
function BillCompose({ step }: { step: number }) {
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
          <WireCta label="send bill" filled={step >= 5} />
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
function HomeScreen({ bill, active }: { bill?: 'sent' | 'paid'; active?: string }) {
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
        <div className="lp-fab"><Ic.Plus size={30} /></div>
      </div>
      <ActionBar top="calc(40% + 67px)" send active={active} />
    </Screen>
  );
}

function PropertyBill({ step }: SceneProps) {
  /* 0 opens bill mode from the terminal home; the no-tenant prompt production
     shows next is folded into the tenant pick at step 1. */
  if (step === 0) return <HomeScreen active="bill" />;
  if (step === 1) return <TenantPicker selected amount={PROPERTY.rentCents} />;
  if (step === 2) return <AmountScreen cents={PROPERTY.billCents} hit="0" />;
  if (step <= 5) return <BillCompose step={step} />;
  if (step === 6) return <SuccessScreen cents={PROPERTY.billCents} title="bill sent" />;
  return <HomeScreen bill={step >= 8 ? 'paid' : 'sent'} />;
}

export const propertyBillScene: SceneDefinition = {
  id: 'property-bill',
  steps: 9,
  label: 'water bill for $86.40 sent and paid',
  Component: PropertyBill,
};
