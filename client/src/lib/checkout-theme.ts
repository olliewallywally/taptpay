// client/src/lib/checkout-theme.ts
// Shared design tokens + style constants for the customer-facing checkout
// surfaces (checkout.tsx, split-payment.tsx, quote steps). The palette is the
// brand navy/sky language from trades-theme.ts — one edit restyles every
// customer payment page. Mockups: attached_assets/*_customer_payment_page_*.png.
import type { CSSProperties } from "react";
import { TRADES_THEME } from "@/lib/trades-theme";

export const CHECKOUT_THEME = {
  ...TRADES_THEME,
  /** Sky-blue accent — headings, amount, links on the navy card. */
  SKY: TRADES_THEME.ACCENT,
  /** Muted sky for secondary text on navy (subtitles, footer links). */
  SKY_DIM: "#7CB9FF",
  /** Card-entry expanding panel background (user: "sky blue"). */
  PANEL: TRADES_THEME.ACCENT,
} as const;

const T = CHECKOUT_THEME;

export const FONT_BODY = "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const FONT_WORDMARK = "'Larken', Georgia, 'Times New Roman', serif";

export function money(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString("en-NZ")}`
    : `$${dollars.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── Card shell ─────────────────────────────────────────────────────── */

export const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: T.OFFW,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  fontFamily: FONT_BODY,
};

export const cardStyle: CSSProperties = {
  background: T.INK,
  borderRadius: 44,
  width: "100%",
  maxWidth: 380,
  minHeight: 520,
  padding: "44px 32px 36px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  boxShadow: "0 24px 60px rgba(4, 13, 109, 0.28)",
  position: "relative",
  overflow: "hidden",
};

/* ── Type scale (on navy) ───────────────────────────────────────────── */

export const labelStyle: CSSProperties = {
  color: T.SKY,
  fontSize: 22,
  fontWeight: 500,
  textAlign: "center",
  lineHeight: 1.3,
  overflowWrap: "anywhere",
};

export const amountStyle: CSSProperties = {
  color: T.SKY,
  fontSize: 64,
  fontWeight: 800,
  letterSpacing: "-2px",
  lineHeight: 1.05,
  textAlign: "center",
  margin: "10px 0",
};

export const subtitleStyle: CSSProperties = {
  color: T.SKY_DIM,
  fontSize: 15,
  fontWeight: 500,
  textAlign: "center",
};

/* ── Controls ───────────────────────────────────────────────────────── */

/** Outline pill on navy — "view quote", "confirm", split "confirm". */
export const outlineBtnStyle: CSSProperties = {
  background: "transparent",
  color: T.SKY,
  border: `1.5px solid ${T.SKY}`,
  borderRadius: 14,
  padding: "14px 20px",
  fontSize: 16,
  fontWeight: 600,
  fontFamily: FONT_BODY,
  cursor: "pointer",
  width: "100%",
  transition: "background 0.15s ease",
};

/** Small square outline button (QR / view-quote-again icon). */
export const iconBtnStyle: CSSProperties = {
  background: "transparent",
  color: T.SKY,
  border: `1.5px solid ${T.SKY}`,
  borderRadius: 14,
  width: 52,
  height: 52,
  flex: "0 0 52px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

/** Footer text link at the card bottom — "enter credit card ∨". */
export const footerLinkStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: T.SKY_DIM,
  fontSize: 14,
  fontWeight: 500,
  fontFamily: FONT_BODY,
  cursor: "pointer",
  padding: 8,
};

/** Chip — split "Person 1 of 2". */
export const chipStyle: CSSProperties = {
  background: "rgba(88, 171, 255, 0.14)",
  border: "1px solid rgba(88, 171, 255, 0.35)",
  borderRadius: 10,
  color: T.SKY,
  fontSize: 14,
  fontWeight: 500,
  padding: "8px 16px",
};
