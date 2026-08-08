/**
 * Scene: checkout-wallet (story card 07) — §4.8 Customer, wallets + confirmation
 *
 * Milestones:
 *   0  open the branded $250 deposit checkout from the prior quote story
 *   1  highlight Apple Pay
 *   2  highlight Google Pay
 *   3  highlight the credit/debit card affordance
 *   4  select the deterministic demo method (Apple Pay)
 *   5  short local processing state
 *   6  "Payment confirmed" and the branded receipt state
 *
 * The plan's beat 2 is "highlight Apple Pay, Google Pay and card affordances in
 * sequence", which needs one milestone each — hence 7 steps rather than 5.
 *
 * No Windcave SDK, hosted fields, wallet API, session request, redirect or
 * provider script may load. Every wallet affordance below is drawn: the Apple
 * mark and the Google Pay lockup are inline SVG copied from the production
 * buttons, and nothing here mounts, imports or calls a payment provider.
 *
 * Fidelity source: client/src/pages/checkout.tsx (navy card, wordmark, label /
 * amount type scale, black 52px wallet pills, "enter credit card" footer link,
 * and its renderTerminal "Payment confirmed" state) with the token values from
 * client/src/lib/checkout-theme.ts.
 */
import type { ReactNode } from 'react';
import type { SceneDefinition, SceneProps } from '../types';
import { BLUE, fmt } from '../tokens';
import { CHECKOUT } from '../fixtures';
import { CardAmount, CardLabel, CheckCircleMark, CustomerCard, SKY_DIM, TaptMark } from './retail-split';

/**
 * The checkout's brand block: the production taptpay wordmark with the
 * merchant this deposit belongs to named underneath.
 *
 * The merchant name is set in Outfit, not Larken: the shipped Larken DEMO
 * Black face has no dotted "i", so "Kerr Plumbing" renders as "Plumbıng". The
 * wordmark itself ("taptpay") contains no i, which is why the app never hits
 * this.
 */
function Brand() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <TaptMark />
      <span style={{ color: SKY_DIM, fontSize: 14, fontWeight: 600, letterSpacing: '0.01em' }}>{CHECKOUT.merchant}</span>
    </div>
  );
}

/* ── wallet affordances (drawn, never mounted) ────────────────────────────*/

type Focus = 'apple' | 'google' | 'card' | null;

function WalletBtn({ children, focused = false, pressed = false, dim = false }: {
  children: ReactNode;
  focused?: boolean;
  pressed?: boolean;
  dim?: boolean;
}) {
  return (
    <div
      className="lp-t"
      style={{
        width: '100%', height: 52, borderRadius: 14, background: '#000000', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, flexShrink: 0,
        boxShadow: focused ? `0 0 0 3px rgba(88,171,255,0.55)` : 'none',
        transform: pressed ? 'scale(0.96)' : focused ? 'scale(1.02)' : undefined,
        opacity: dim ? 0.45 : 1,
      }}
    >
      {children}
    </div>
  );
}

/**  Apple Pay mark — the Apple glyph plus "Pay", as the native button draws it. */
function ApplePayMark() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 19, fontWeight: 500, letterSpacing: '-0.2px' }}>
      <svg width={16} height={20} viewBox="0 0 16 20" fill="#fff" aria-hidden>
        <path d="M8.9 2.9c-.5.6-.9 1.4-.8 2.2.8.1 1.7-.4 2.2-1 .5-.6.8-1.4.7-2.2-.8 0-1.6.4-2.1 1zm2.1 3.5c-1.2-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.7-3.2 1.8-1.4 2.4-.4 5.9 1 7.8.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6 1.2 0 1.5.6 2.6.6 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-3.2 0-2.1 1.7-3.1 1.8-3.2-1-1.5-2.5-1.6-3.1-1.6-.4-.1-.9-.3-1.4-.3z" />
      </svg>
      Pay
    </span>
  );
}

/** Google Pay lockup — the four-colour G followed by "Pay", as the branded
 *  button in checkout.tsx shows it (that one loads a PNG; this one is drawn). */
function GooglePayMark() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 19, fontWeight: 500, letterSpacing: '-0.2px' }}>
      <svg width={21} height={21} viewBox="0 0 48 48" aria-hidden>
        <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
        <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
        <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
        <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
      </svg>
      Pay
    </span>
  );
}

/** Static spinner arc — the processing state without a running animation. */
function Spinner() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-6.2-8.57" />
    </svg>
  );
}

/** footerLinkStyle + the chevron that expands the hosted-card panel. */
function CardLink({ focused = false, dim = false }: { focused?: boolean; dim?: boolean }) {
  return (
    <div
      className="lp-t"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8,
        color: focused ? BLUE : SKY_DIM, fontSize: 14, fontWeight: focused ? 600 : 500, opacity: dim ? 0.45 : 1,
      }}
    >
      enter credit card
      <svg
        width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: focused ? 'rotate(180deg)' : undefined, transition: 'transform 0.25s ease' }}
        aria-hidden
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

/* ── screens ──────────────────────────────────────────────────────────────*/

/**
 * `focus` walks the affordances for beat 2; `chosen` is the tap on the
 * deterministic demo method; `processing` is the short local wait that follows.
 */
function PayScreen({ focus, chosen = false, processing = false }: { focus: Focus; chosen?: boolean; processing?: boolean }) {
  const apple = focus === 'apple';
  return (
    <CustomerCard minHeight={600}>
      <Brand />
      <div style={{ flex: 1, minHeight: 20 }} />
      <CardLabel text={CHECKOUT.reference} />
      <CardAmount text={fmt(CHECKOUT.amountCents)} size={64} />
      <div style={{ flex: 1, minHeight: 24 }} />

      <WalletBtn focused={apple && !processing} pressed={chosen} dim={processing || (focus !== null && !apple)}>
        {processing ? <Spinner /> : <ApplePayMark />}
      </WalletBtn>
      <WalletBtn focused={focus === 'google'} dim={processing || chosen || (focus !== null && focus !== 'google')}>
        <GooglePayMark />
      </WalletBtn>
      <CardLink focused={focus === 'card'} dim={processing || chosen || (focus !== null && focus !== 'card')} />
    </CustomerCard>
  );
}

function ReceiptRow({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
      <span style={{ color: SKY_DIM, fontSize: 12.5, flexShrink: 0 }}>{k}</span>
      <span style={{ color: BLUE, fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 600, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

/** checkout.tsx renderTerminal("Payment confirmed") plus the branded receipt. */
function Confirmed() {
  return (
    <CustomerCard minHeight={540}>
      <Brand />
      <div style={{ flex: 1, minHeight: 16 }} />
      <div style={{ textAlign: 'center' }}>
        <CheckCircleMark />
        <p style={{ color: BLUE, fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Payment confirmed</p>
        <p style={{ color: SKY_DIM, fontSize: 14, margin: 0 }}>Thank you — your payment is confirmed.</p>
      </div>

      <div style={{ marginTop: 22, width: '100%', boxSizing: 'border-box', background: 'rgba(88,171,255,0.12)', borderRadius: 16, padding: '14px 16px' }}>
        <div style={{ color: BLUE, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>receipt</div>
        <ReceiptRow k="paid to" v={CHECKOUT.merchant} />
        <ReceiptRow k="for" v={CHECKOUT.reference} />
        <ReceiptRow k="method" v="Apple Pay" />
        <div style={{ height: 1, background: 'rgba(88,171,255,0.25)', margin: '12px 0 2px' }} />
        <ReceiptRow k="total" v={fmt(CHECKOUT.amountCents)} strong />
      </div>
      <div style={{ flex: 1, minHeight: 16 }} />
    </CustomerCard>
  );
}

const FOCUS: Focus[] = [null, 'apple', 'google', 'card'];

function CheckoutWallet({ step }: SceneProps) {
  if (step >= 6) return <Confirmed />;
  if (step === 5) return <PayScreen focus="apple" processing />;
  if (step === 4) return <PayScreen focus="apple" chosen />;
  return <PayScreen focus={FOCUS[step < 0 ? 0 : step]} />;
}

export const checkoutWalletScene: SceneDefinition = {
  id: 'checkout-wallet',
  steps: 7,
  label: '$250 deposit paid and confirmed',
  Component: CheckoutWallet,
};
