/**
 * Shared presentational primitives for the landing phone demo.
 *
 * These are the vocabulary every scene is built from — the plan's §3.1 list —
 * so that seven scenes cost roughly one screen's worth of bytes instead of
 * seven independent page trees.
 *
 * Rules for anything added here:
 *   • presentational only — no state, no effects, no timers, no data fetching;
 *   • no icon pack, no motion library: inline SVG paths and CSS transitions;
 *   • every value traceable to the production terminals (see tokens.ts).
 */
import type { CSSProperties, ReactNode } from 'react';
import { BLUE, BLUE_40, BLUE_55, FONT, GREEN, NAVY, NAVY_25, NAVY_35, NAVY_50, OFFW, WHITE, fmt } from './tokens';

/* ── icons ─────────────────────────────────────────────────────────────────
   Hand-rolled so the phone chunk never pulls in an icon library. */
const svg = (d: ReactNode, size = 20, stroke = 2): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

export const Ic = {
  Check: (p?: { size?: number }) => svg(<path d="M20 6L9 17l-5-5" />, p?.size ?? 20, 2.6),
  Close: (p?: { size?: number }) => svg(<path d="M18 6L6 18M6 6l12 12" />, p?.size ?? 20),
  Back: (p?: { size?: number }) => svg(<path d="M19 12H5m6-6l-6 6 6 6" />, p?.size ?? 20),
  Chevron: (p?: { size?: number }) => svg(<path d="M9 18l6-6-6-6" />, p?.size ?? 18),
  Plus: (p?: { size?: number }) => svg(<path d="M12 5v14M5 12h14" />, p?.size ?? 20),
  Doc: (p?: { size?: number }) => svg(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></>, p?.size ?? 16),
  Send: (p?: { size?: number }) => svg(<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />, p?.size ?? 14, 2.2),
};

/* ── screen shell ───────────────────────────────────────────────────────── */

/**
 * The terminal's two-part screen: an off-white working half over a navy half.
 * `topHeight` matches the production `height: 50%` unless a scene overrides it.
 */
export function Screen({ children, background = NAVY, style }: { children: ReactNode; background?: string; style?: CSSProperties }) {
  return (
    <div className="lp-screen" style={{ background, color: NAVY, ...style }}>
      {children}
    </div>
  );
}

export function TopHalf({ children, height = '50%', background = OFFW }: { children: ReactNode; height?: string; background?: string }) {
  return (
    <div style={{ background, color: NAVY, height, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {children}
    </div>
  );
}

export function BottomHalf({ children, padding = '38px 28px 28px' }: { children: ReactNode; padding?: string }) {
  return (
    <div style={{ flex: 1, background: NAVY, padding, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {children}
    </div>
  );
}

/** Cancel / commit header used by every compose screen. */
export function SubHead({ commitReady = false }: { commitReady?: boolean }) {
  return (
    <div className="lp-subhead">
      <div className="lp-subhead-btn"><Ic.Close size={18} /></div>
      <div className="lp-subhead-btn" style={{ borderColor: commitReady ? NAVY : 'rgba(4,13,109,0.25)', color: commitReady ? NAVY : NAVY_25 }}>
        <Ic.Check size={18} />
      </div>
    </div>
  );
}

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 22px 0' }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: WHITE, letterSpacing: '-0.2px' }}>{title}</div>
      {right}
    </div>
  );
}

/* ── amount + keypad ────────────────────────────────────────────────────── */

export function Amount({ cents, size = 82, color, muted = false, style }: { cents: number; size?: number; color?: string; muted?: boolean; style?: CSSProperties }) {
  return (
    <div className="lp-amount" style={{ fontSize: size, color: color ?? (muted || cents === 0 ? NAVY_25 : NAVY), ...style }}>
      {fmt(cents)}
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * The 3×4 keypad. `hit` lights the key the script is currently pressing —
 * the demo shows the press, it does not simulate a real one.
 */
export function Keypad({ hit }: { hit?: string }) {
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, alignItems: 'center', justifyItems: 'center' }}>
      {KEYS.map((d) => (
        <div key={d} className={`lp-kp lp-t${hit === d ? ' hit' : ''}`}>{d}</div>
      ))}
      <div className="lp-kp" style={{ visibility: 'hidden' }} aria-hidden />
      <div className={`lp-kp lp-t${hit === '0' ? ' hit' : ''}`}>0</div>
      <div className="lp-kp outline"><Ic.Back size={22} /></div>
    </div>
  );
}

/* ── rows and controls ──────────────────────────────────────────────────── */

/** Tenant / client selector row. `selected` draws the production active state. */
export function PersonRow({ name, sub, amount, selected = false }: { name: string; sub?: string; amount?: number; selected?: boolean }) {
  return (
    <div
      className="lp-t"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        padding: '14px 16px', borderRadius: 14, border: 'none', textAlign: 'left',
        background: selected ? 'rgba(88,171,255,0.18)' : 'rgba(244,244,244,0.06)',
        boxShadow: selected ? `inset 0 0 0 1.5px ${BLUE}` : 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: WHITE }}>{name}</div>
        {sub && <div style={{ fontWeight: 400, fontSize: 12.5, color: BLUE_55 }}>{sub}</div>}
      </div>
      {amount !== undefined && (
        <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, fontVariantNumeric: 'tabular-nums' }}>{amount ? fmt(amount) : '—'}</div>
      )}
    </div>
  );
}

/** Label + value + affordance, as used for rent amount, due date, doc chip. */
export function FieldRow({ label, value, action = '›', tone = 'navy', icon }: { label: string; value: string; action?: string; tone?: 'navy' | 'blue'; icon?: ReactNode }) {
  const dim = tone === 'navy' ? 'rgba(88,171,255,0.55)' : NAVY_50;
  return (
    <div style={{ width: '100%', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 11, color: dim, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div className="lp-t" style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(244,244,244,0.06)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 24, color: value ? BLUE : BLUE_40, fontVariantNumeric: 'tabular-nums' }}>
          {icon}
          {value}
        </span>
        <span style={{ fontWeight: 600, fontSize: 12.5, color: BLUE }}>{action}</span>
      </div>
    </div>
  );
}

/** Frequency / split / deposit selector. */
export function Segmented({ options, active }: { options: readonly string[]; active: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {options.map((o) => (
        <div key={o} className={`lp-pill lp-t ${o === active ? 'solid' : 'outline'}`}>{o}</div>
      ))}
    </div>
  );
}

export type Status = 'sent' | 'paid' | 'active' | 'awaiting' | 'pending';

const STATUS_COLOR: Record<Status, string> = {
  sent: BLUE,
  paid: GREEN,
  active: GREEN,
  awaiting: '#FFB02E',
  pending: '#FFB02E',
};

export function StatusRow({ label, status, amount }: { label: string; status: Status; amount?: number }) {
  const c = STATUS_COLOR[status];
  return (
    <div className="lp-stack-card lp-t" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', marginTop: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="lp-stack-title">{label}</div>
        <div style={{ fontWeight: 600, fontSize: 11, color: c, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{status}</div>
      </div>
      {amount !== undefined && <div style={{ fontWeight: 800, fontSize: 16, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>{fmt(amount)}</div>}
    </div>
  );
}

/** Full-width commit button — "send & automate", "send", "confirm". */
export function PrimaryAction({ label, tone = 'blue', pressed = false }: { label: string; tone?: 'blue' | 'green'; pressed?: boolean }) {
  const bg = tone === 'green' ? GREEN : BLUE;
  return (
    <div
      className="lp-t"
      style={{
        marginTop: 16, width: '100%', height: 56, borderRadius: 999, background: bg, color: NAVY,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: FONT, fontWeight: 700, fontSize: 17,
        transform: pressed ? 'scale(0.96)' : 'none',
        boxShadow: '0 8px 24px rgba(4,13,109,0.28)',
      }}
    >
      {label}
    </div>
  );
}

/** The post-send confirmation the story beats have to land on. */
export function SuccessCard({ title, sub, tone = 'green' }: { title: string; sub?: string; tone?: 'green' | 'blue' }) {
  const c = tone === 'green' ? GREEN : BLUE;
  return (
    <div className="lp-t" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 22px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 999, background: c, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ic.Check size={30} />
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 22, color: WHITE, letterSpacing: '-0.02em' }}>{title}</div>
      {sub && <div style={{ fontFamily: FONT, fontWeight: 400, fontSize: 14, color: BLUE_55 }}>{sub}</div>}
    </div>
  );
}

/** Split-bill progress: "3 of 4 paid". */
export function Progress({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div style={{ width: '100%', marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BLUE_55 }}>
        <span>{`${paid} of ${total} paid`}</span>
        <span>{`${pct}%`}</span>
      </div>
      <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: 'rgba(88,171,255,0.18)', overflow: 'hidden' }}>
        <div className="lp-grow" style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: GREEN }} />
      </div>
    </div>
  );
}

/** Branded header on the customer checkout screens. */
export function Wordmark({ merchant, sub }: { merchant: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 8 }}>
      <div style={{ fontFamily: "'Larken', Georgia, serif", fontWeight: 900, fontSize: 22, color: NAVY }}>{merchant}</div>
      {sub && <div style={{ fontFamily: FONT, fontWeight: 400, fontSize: 12.5, color: NAVY_35 }}>{sub}</div>}
    </div>
  );
}
