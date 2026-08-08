/**
 * Scene: rent-weekly (story card 01) — §4.2 Property, weekly rent collection
 *
 * Mirrors the production Property terminal flow in
 * client/src/pages/property/property-terminal.tsx.
 *
 * Milestones:
 *   0  open rent-request mode
 *   1  select Mia · 18 Tui St
 *   2  enter $620 on the keypad
 *   3  select weekly
 *   4  show "first request now, then weekly from …"
 *   5  press send & automate
 *   6  sent confirmation
 *   7  active schedule card: $620 · weekly · active
 *
 * The scene never POSTs the invoice or schedule endpoints.
 *
 * This file also owns the Property chrome shared with property-bill.tsx —
 * ActionBar, TenantPicker, AmountScreen, SuccessScreen, WireCta — so the two
 * Property scenes cost one copy of it rather than two (§6 rule 3). They are
 * candidates for promotion into primitives.tsx once every lane has landed.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, GREEN, NAVY, NAVY_35, NAVY_50, fmt } from '../tokens';
import { Amount, BottomHalf, Ic, Keypad, Screen, SubHead, TopHalf } from '../primitives';
import { PROPERTY } from '../fixtures';

/* ── production colour mixes, by value (property-terminal.tsx) ───────────── */
export const sky = (a: number) => `rgba(88,171,255,${a})`;
export const wht = (a: number) => `rgba(255,255,255,${a})`;

/** Terminal icons, hand-rolled at the production stroke weight. */
const ico = (d: ReactNode, sz = 18, sw = 1.9): JSX.Element => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
export const Tic = {
  Person: (sz?: number) => ico(<><circle cx="12" cy="7.5" r="4" /><path d="M3.5 21c0-4 3.8-7 8.5-7s8.5 3 8.5 7" /></>, sz),
  Send: (sz?: number) => ico(<><path d="M21 4 3 11l6 2.5L12 20l3-7z" /><path d="m9 13.5 6-6.5" /></>, sz),
  Receipt: (sz?: number) => ico(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>, sz),
  External: (sz?: number) => ico(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h7" /></>, sz),
  Repeat: (sz?: number) => ico(<><path d="M17 2l3 3-3 3" /><path d="M3 11V9a4 4 0 014-4h13" /><path d="M7 22l-3-3 3-3" /><path d="M21 13v2a4 4 0 01-4 4H4" /></>, sz),
  Mail: (sz?: number) => ico(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 7 10-7" /></>, sz, 1.8),
  Search: (sz?: number) => ico(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.5-3.5" /></>, sz, 2),
  Pause: (sz?: number) => ico(<><path d="M9 5v14M15 5v14" /></>, sz, 2.4),
  Trash: (sz?: number) => ico(<path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />, sz),
};

/* ── the terminal's floating action bar ─────────────────────────────────────
   Production positions a navy indicator pill absolutely and animates its
   left/width between buttons. A frame that never animates does not need the
   measurement: painting the navy on the active button itself is the same
   picture with no state, no refs and no layout read. */
const BAR_ITEMS = [
  { id: 'tenants', label: 'tenants', Icon: Tic.Person },
  { id: 'send', label: 'send', Icon: Tic.Send },
  { id: 'bill', label: 'bill', Icon: Tic.Receipt },
  { id: 'external', label: 'external', Icon: Tic.External },
] as const;

export function ActionBar({ active, top = 'calc(50% - 57px)', send = false }: { active?: string; top?: string; send?: boolean }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, height: 37, padding: '0 22px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, zIndex: 30 }}>
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', background: BLUE, borderRadius: 26, padding: '5px 11px', gap: 4, border: `1px solid ${wht(0.3)}`, boxShadow: `0 16px 48px rgba(4,13,109,0.2), 0 4px 12px rgba(4,13,109,0.1), inset 0 1px 0 ${wht(0.25)}`, transform: 'scale(0.85)' }}>
          {BAR_ITEMS.map(({ id, label, Icon }) => {
            const on = id === active;
            return (
              <div
                key={id}
                className="lp-t"
                style={{ height: 27, padding: send ? '0 11px' : '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, background: on ? NAVY : 'transparent', color: on ? BLUE : 'rgba(4,13,109,0.55)', boxShadow: on ? '0 4px 16px rgba(4,13,109,0.4)' : 'none' }}
              >
                {Icon(18)}
                {on && <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: '0.4px', color: BLUE, whiteSpace: 'nowrap' }}>{label}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {send && (
        <div className="lp-send" style={{ flexShrink: 0 }}>
          <span className="lp-send-circle" style={{ color: NAVY }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="3" y1="8" x2="13" y2="8" /><polyline points="9,4 13,8 9,12" />
            </svg>
          </span>
          <span className="lp-send-label">send</span>
        </div>
      )}
    </div>
  );
}

/* ── the terminal's confirm button ──────────────────────────────────────────
   WireframeLiquidButton at CTA_SIZE: rests as a wireframe pill, fills solid
   from the bottom on press. `filled` is the topped-out end of that fill. */
export function WireCta({ label, filled = false, dim = false }: { label: string; filled?: boolean; dim?: boolean }) {
  return (
    <div
      className="lp-t"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '10px 27px', minWidth: 165, borderRadius: 999, boxSizing: 'border-box',
        border: `1.5px solid ${BLUE}`, background: filled ? BLUE : 'transparent',
        color: filled ? NAVY : BLUE, fontWeight: 600, fontSize: 13,
        opacity: dim ? 0.65 : 1, transform: filled ? 'scale(0.96)' : 'none',
      }}
    >
      {label}
    </div>
  );
}

/** Uppercase field caption used down the whole navy half. */
export function Caption({ icon, children, style }: { icon?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: sky(0.7), ...style }}>
      {icon}
      <span style={{ fontWeight: 600, fontSize: 11, color: sky(0.55), letterSpacing: '0.12em', textTransform: 'uppercase' }}>{children}</span>
    </div>
  );
}

/* ── shared screens ─────────────────────────────────────────────────────── */

const TENANT = PROPERTY.tenant;
/** 'Mia' → 'M', exactly as the terminal's tenantInitials does. */
const INITIALS = TENANT.name.slice(0, 1).toUpperCase();

/** ChooseTenant. Production navigates away on tap, so `selected` is the demo's
 *  way of holding the tap visible for a beat. */
export function TenantPicker({ selected, amount }: { selected: boolean; amount?: number }) {
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady={selected} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ color: NAVY_35, fontWeight: 500, fontSize: 18 }}>choose tenant</div>
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>
      <BottomHalf padding="52px 22px 0">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: wht(0.08), borderRadius: 999, padding: '0 18px', height: 44, marginBottom: 14, flexShrink: 0, color: sky(0.6) }}>
          {Tic.Search(16)}
          <span style={{ fontWeight: 500, fontSize: 14, color: sky(0.5) }}>search tenants or address</span>
        </div>
        <div
          className="lp-t"
          style={{
            display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 18,
            border: `1.5px solid ${selected ? BLUE : sky(0.28)}`,
            background: selected ? sky(0.18) : 'transparent',
            boxShadow: selected ? `inset 0 0 0 1.5px ${BLUE}` : 'none',
            transform: selected ? 'scale(0.985)' : 'none',
          }}
        >
          <div style={{ width: 38, height: 38, borderRadius: 999, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: NAVY }}>{INITIALS}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: BLUE, textTransform: 'capitalize' }}>{TENANT.name}</div>
            <div style={{ fontWeight: 400, fontSize: 11.5, color: sky(0.55), marginTop: 2 }}>{TENANT.address}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, fontVariantNumeric: 'tabular-nums' }}>{amount ? fmt(amount) : '—'}</div>
            {amount !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 3 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: BLUE }} />
                <span style={{ fontSize: 10, color: sky(0.5) }}>sent</span>
              </div>
            )}
          </div>
        </div>
      </BottomHalf>
      <ActionBar active="tenants" />
    </Screen>
  );
}

/** RentAmount — the keypad. `hit` lights the key the script is pressing. */
export function AmountScreen({ cents, hit }: { cents: number; hit?: string }) {
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady={cents > 0} />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Amount cents={cents} style={{ marginTop: 18 }} />
          <div style={{ fontWeight: 500, fontSize: 15, color: NAVY_50, paddingBottom: 8 }}>{`${TENANT.name} · ${TENANT.address}`}</div>
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>
      <BottomHalf>
        <Keypad hit={hit} />
      </BottomHalf>
      <ActionBar />
    </Screen>
  );
}

/** SentSuccess — 'rent link sent' / 'bill sent'. */
export function SuccessScreen({ cents, title }: { cents: number; title: string }) {
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '12px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Amount cents={cents} />
          <div style={{ marginTop: 18, fontWeight: 700, fontSize: 22 }}>{title}</div>
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>
      <BottomHalf padding="52px 28px 100px">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ color: BLUE, fontWeight: 900, fontSize: 42, letterSpacing: '-0.04em' }}>sent</div>
          <div style={{ marginTop: 14, width: 92, height: 92, borderRadius: 999, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: NAVY }}>
            <Ic.Check size={40} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'center' }}><WireCta label="done" /></div>
      </BottomHalf>
    </Screen>
  );
}

/* ── scene-local screens ────────────────────────────────────────────────── */

const FREQ = [
  { id: 'once', label: 'once' },
  { id: 'weekly', label: 'weekly' },
  { id: 'fortnightly', label: 'fortn.' },
  { id: 'monthly', label: 'monthly' },
];
/** 'first request now, then weekly from fri 14 aug' → 'fri 14 aug'. Sliced from
 *  the fixture rather than restated, so the two can never disagree. */
const NEXT_RUN = PROPERTY.scheduleNote.split(' from ')[1];

/** SendRentLink — amount, channel, repeat, schedule summary, commit. */
function SendRent({ step }: { step: number }) {
  const freqOn = step >= 3;
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Amount cents={PROPERTY.rentCents} />
          <div style={{ marginTop: 14, fontWeight: 500, fontSize: 16, color: NAVY, lineHeight: 1.4, textTransform: 'capitalize' }}>
            {TENANT.name}
            <div style={{ fontWeight: 400, fontSize: 14, color: NAVY_50, marginTop: 4, textTransform: 'none' }}>{TENANT.address}</div>
          </div>
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>
      <BottomHalf padding="40px 28px 100px">
        {/* rent amount — tap to re-open the keypad */}
        <div style={{ width: '100%' }}>
          <Caption icon={Tic.Receipt(15)}>rent amount</Caption>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderRadius: 16, border: `1.5px solid ${sky(0.2)}`, background: wht(0.05) }}>
            <span style={{ fontWeight: 700, fontSize: 24, color: BLUE, fontVariantNumeric: 'tabular-nums' }}>{fmt(PROPERTY.rentCents)}</span>
            <span style={{ fontWeight: 600, fontSize: 12.5, color: BLUE }}>edit ›</span>
          </div>
        </div>

        {/* channel badge — inherited from the tenant, shown not chosen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', background: sky(0.08), border: `1px solid ${sky(0.2)}`, borderRadius: 20, width: '100%', boxSizing: 'border-box', marginTop: 18, color: BLUE }}>
          {Tic.Mail(22)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: sky(0.55), letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>sending via email</div>
            <div style={{ fontWeight: 500, fontSize: 14, color: BLUE }}>tenant's email</div>
          </div>
        </div>

        {/* repeat */}
        <div style={{ width: '100%', marginTop: 18 }}>
          <Caption icon={Tic.Repeat(15)}>repeat</Caption>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {FREQ.map(({ id, label }) => {
              const on = freqOn && id === PROPERTY.frequency;
              return (
                <div key={id} className="lp-t" style={{ padding: '12px 4px', textAlign: 'center', borderRadius: 14, border: `1.5px solid ${on ? BLUE : sky(0.35)}`, background: on ? BLUE : 'transparent', color: on ? NAVY : BLUE, fontWeight: 700, fontSize: 12.5 }}>
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        {/* recurring summary — the beat that proves it automates */}
        <div className="lp-t" style={{ width: '100%', marginTop: 14, minHeight: 34, fontSize: 12.5, color: sky(0.7), lineHeight: 1.5, textAlign: 'center', opacity: step >= 4 ? 1 : 0 }}>
          first request now, then <strong style={{ color: BLUE }}>{PROPERTY.frequency}</strong> from {NEXT_RUN}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <WireCta label={freqOn ? 'send & automate' : 'send rent request'} filled={step >= 5} />
        </div>
      </BottomHalf>
      <ActionBar active="send" />
    </Screen>
  );
}

/** AutomateScreen — the live schedule the story has to land on. */
function ScheduleScreen() {
  const { amount, cadence, status } = PROPERTY.scheduleCard;
  return (
    <Screen>
      <TopHalf>
        <SubHead commitReady />
        <div style={{ flex: 1, padding: '12px 28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="lp-amount" style={{ fontSize: 64, color: NAVY }}>1</div>
          <div style={{ marginTop: 10, fontWeight: 500, fontSize: 15, color: NAVY_50 }}>active automation</div>
        </div>
        <div style={{ height: 52 }} />
      </TopHalf>
      <BottomHalf padding="52px 22px 0">
        <div style={{ color: BLUE, fontWeight: 500, fontSize: 18, textAlign: 'center', marginBottom: 16 }}>automation</div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: sky(0.45), letterSpacing: '0.12em', textTransform: 'uppercase', margin: '6px 2px 10px' }}>recurring rent</div>
        <div className="lp-t" style={{ background: wht(0.06), border: `1px solid ${sky(0.15)}`, borderRadius: 18, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 999, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: NAVY }}>{INITIALS}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: BLUE, textTransform: 'capitalize' }}>{TENANT.name}</div>
              <div style={{ fontWeight: 400, fontSize: 11.5, color: sky(0.55), marginTop: 2 }}>{`${fmt(amount)} · ${cadence}`}</div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: 8, background: 'rgba(19,194,154,0.16)', color: GREEN, fontWeight: 700, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>{status}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${sky(0.12)}` }}>
            <div style={{ fontSize: 11, color: sky(0.5) }}>{`next ${NEXT_RUN}`}</div>
            <div style={{ display: 'flex', gap: 8, color: BLUE }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 999, border: `1px solid ${sky(0.3)}`, background: sky(0.1), fontWeight: 600, fontSize: 12 }}>
                {Tic.Pause(12)}pause
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 999, border: '1px solid rgba(255,59,78,0.3)', background: 'rgba(255,59,78,0.08)', color: '#FF3B4E' }}>
                {Tic.Trash(14)}
              </div>
            </div>
          </div>
        </div>
      </BottomHalf>
      <ActionBar />
    </Screen>
  );
}

function RentWeekly({ step }: SceneProps) {
  if (step <= 1) return <TenantPicker selected={step === 1} />;
  if (step === 2) return <AmountScreen cents={PROPERTY.rentCents} hit="0" />;
  if (step <= 5) return <SendRent step={step} />;
  if (step === 6) return <SuccessScreen cents={PROPERTY.rentCents} title="rent link sent" />;
  return <ScheduleScreen />;
}

export const rentWeeklyScene: SceneDefinition = {
  id: 'rent-weekly',
  steps: 8,
  label: 'weekly rent request sent and automated for $620',
  Component: RentWeekly,
};
