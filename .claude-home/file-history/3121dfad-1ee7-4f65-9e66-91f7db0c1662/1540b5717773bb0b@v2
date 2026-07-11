// Brand wordmark for customer checkout cards: serif "tapt" + italic "pay"
// (Larken 900 — the DEMO family only ships the Black weights). Merchants with
// a custom logo see it in place of the wordmark.
import { CHECKOUT_THEME, FONT_WORDMARK } from "@/lib/checkout-theme";

interface TaptWordmarkProps {
  customLogoUrl?: string | null;
  size?: number;
}

export function TaptWordmark({ customLogoUrl, size = 34 }: TaptWordmarkProps) {
  if (customLogoUrl) {
    return (
      <img
        src={customLogoUrl}
        alt="Merchant logo"
        style={{ height: size + 8, maxWidth: 180, objectFit: "contain" }}
      />
    );
  }
  return (
    <span
      aria-label="taptpay"
      style={{
        fontFamily: FONT_WORDMARK,
        fontWeight: 900,
        fontSize: size,
        color: CHECKOUT_THEME.SKY,
        lineHeight: 1,
        letterSpacing: "-0.5px",
        userSelect: "none",
      }}
    >
      tapt<span style={{ fontStyle: "italic" }}>pay</span>
    </span>
  );
}
