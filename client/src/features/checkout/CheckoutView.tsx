import { CheckCircle, Loader2, XCircle } from "lucide-react";
import googlePayLogo from "@assets/Google_Pay_Logo.svg_1773556576322.png";
import {
  CHECKOUT_THEME as CT,
  FONT_WORDMARK,
  amountStyle,
  cardStyle,
  footerLinkStyle,
  iconBtnStyle,
  labelStyle,
  outlineBtnStyle,
  pageStyle,
  subtitleStyle,
} from "@/lib/checkout-theme";
import "./checkout-view.css";

export type CheckoutTerminalState =
  | "quote-unavailable" | "quote-declined" | "quote-expired"
  | "link-cancelled" | "link-not-found" | "payment-link-not-found"
  | "payment-link-closed" | "payment-in-progress" | "already-paid"
  | "payment-confirmed" | "payment-success";

export interface CheckoutQuoteViewProps {
  kind: "quote";
  customLogoUrl?: string | null;
  loading: boolean;
  accepting: boolean;
  responding: boolean;
  step: "view" | "confirm";
  title: string;
  amount: string;
  subtitle: string;
  error?: string;
  onPrimary: () => void;
  onViewQuote: () => void;
  onDecline: () => void;
}

export interface CheckoutTerminalViewProps {
  kind: "terminal";
  customLogoUrl?: string | null;
  state: CheckoutTerminalState;
  splitPayment?: boolean;
  invoicePayment?: boolean;
  detail?: string;
}

export interface CheckoutLoadingViewProps { kind: "loading" }
export interface CheckoutInvalidViewProps { kind: "invalid" }

export interface CheckoutPaymentViewProps {
  kind: "payment";
  customLogoUrl?: string | null;
  itemName: string;
  amount: string;
  subtitle?: string | null;
  isInvoice: boolean;
  invoiceDocumentAvailable: boolean;
  splitEnabled: boolean;
  splitActive: boolean;
  splitChoosing: boolean;
  splitBusy: boolean;
  splitCount: number;
  splitPaid: number;
  payerEmail: string;
  inAppBrowser: boolean;
  inAppIOS: boolean;
  inAppAndroid: boolean;
  linkCopied: boolean;
  applePayAvailable: boolean;
  googlePayAvailable: boolean;
  cardOpen: boolean;
  cardReady: boolean;
  status: "idle" | "processing" | "error";
  errorMessage?: string;
  onViewInvoice: () => void;
  onStartSplit: () => void;
  onCancelSplit: () => void;
  onChooseSplit: (count: number) => void;
  onPayerEmailChange: (value: string) => void;
  onOpenExternalBrowser: () => void;
  onCopyLink: () => void;
  onApplePay: () => void;
  onGooglePay: () => void;
  onToggleCard: () => void;
  onCardPay: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

export type CheckoutViewProps = CheckoutQuoteViewProps | CheckoutTerminalViewProps |
  CheckoutLoadingViewProps | CheckoutInvalidViewProps | CheckoutPaymentViewProps;

const terminalCopy: Record<CheckoutTerminalState, { title: string; detail: string; icon: "ok" | "error" | "loading"; large?: boolean }> = {
  "quote-unavailable": { title: "Quote unavailable", detail: "This quote link doesn't exist or has expired.", icon: "error" },
  "quote-declined": { title: "Quote declined", detail: "You've declined this quote. Contact the business if you'd like to revisit it.", icon: "error" },
  "quote-expired": { title: "Quote expired", detail: "This quote has expired. Contact the business for an updated one.", icon: "error" },
  "link-cancelled": { title: "Link cancelled", detail: "This payment link has been cancelled.", icon: "error" },
  "link-not-found": { title: "Link not found", detail: "This payment link doesn't exist or has expired.", icon: "error" },
  "payment-link-not-found": { title: "Payment link not found", detail: "This payment link doesn't exist or has expired.", icon: "error" },
  "payment-link-closed": { title: "Payment link closed", detail: "This payment can no longer be completed.", icon: "error" },
  "payment-in-progress": { title: "Payment in progress", detail: "We're waiting for the current payment attempt to finish.", icon: "loading" },
  "already-paid": { title: "Already paid", detail: "This has already been paid. Thank you!", icon: "ok", large: true },
  "payment-confirmed": { title: "Payment confirmed", detail: "Opening your receipt…", icon: "ok", large: true },
  "payment-success": { title: "Payment Successful!", detail: "Thank you — redirecting…", icon: "ok", large: true },
};

function CheckoutBrand({ customLogoUrl, size = 34 }: { customLogoUrl?: string | null; size?: number }) {
  if (customLogoUrl) {
    return <img src={customLogoUrl} alt="Merchant logo" draggable={false} style={{ height: size + 8, maxWidth: 180, objectFit: "contain" }} />;
  }
  return (
    <span aria-label="taptpay" style={{ fontFamily: FONT_WORDMARK, fontWeight: 900, fontSize: size, color: CT.SKY, lineHeight: 1, letterSpacing: "-0.5px", userSelect: "none" }}>
      tapt<span style={{ fontStyle: "italic" }}>pay</span>
    </span>
  );
}

function SecureFooter() {
  return <p style={{ marginTop: 14, textAlign: "center", fontSize: 11, color: "#9aa0b5", letterSpacing: "0.03em" }}>Secured by <strong style={{ color: CT.INK, fontWeight: 600 }}>Windcave</strong> · PCI DSS Compliant</p>;
}

function Terminal({ props }: { props: CheckoutTerminalViewProps }) {
  const copy = terminalCopy[props.state];
  const detail = props.detail ?? (props.state === "payment-confirmed" && props.splitPayment
    ? "Open the original link to see the split status."
    : props.state === "payment-success" && props.invoicePayment
      ? "Thank you — your payment is confirmed."
      : copy.detail);
  return <div style={pageStyle} data-demo-id={`checkout-${props.state}`}><div style={{ width: "100%", maxWidth: 380 }}><div style={{ ...cardStyle, minHeight: 420, justifyContent: "center" }}>
    <div style={{ position: "absolute", top: 44, left: 0, right: 0, display: "flex", justifyContent: "center" }}><CheckoutBrand customLogoUrl={props.customLogoUrl} /></div>
    <div style={{ textAlign: "center" }}>
      {copy.icon === "ok" ? <CheckCircle size={64} color={CT.SKY} style={{ margin: "0 auto 16px" }} /> : copy.icon === "loading" ? <Loader2 size={42} color={CT.SKY} style={{ margin: "0 auto 16px", animation: "spin 1s linear infinite" }} /> : <XCircle size={48} color={CT.RED} style={{ margin: "0 auto 16px" }} />}
      <p style={{ color: CT.SKY, fontSize: copy.large ? 22 : 18, fontWeight: 700, marginBottom: 8 }}>{copy.title}</p>
      <p style={{ color: CT.SKY_DIM, fontSize: copy.large ? 14 : 13 }}>{detail}</p>
    </div>
  </div></div></div>;
}

export function CheckoutView(props: CheckoutViewProps) {
  if (props.kind === "loading") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F4F4" }} data-demo-id="checkout-loading"><Loader2 size={40} color={CT.INK} style={{ animation: "spin 1s linear infinite" }} /></div>;
  if (props.kind === "invalid") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F4F4" }} data-demo-id="checkout-invalid"><div style={{ background: "#fff", borderRadius: 24, padding: 32, textAlign: "center" }}><h2 style={{ color: "#e53e3e", fontWeight: 700, marginBottom: 8 }}>Invalid payment link</h2><p style={{ color: "#666" }}>Please scan the merchant's QR code again.</p></div></div>;
  if (props.kind === "terminal") return <Terminal props={props} />;
  if (props.kind === "quote") return <div style={pageStyle} data-demo-id="checkout-quote"><div style={{ width: "100%", maxWidth: 380 }}><div style={{ ...cardStyle, minHeight: 520, justifyContent: "flex-start" }}>
    <CheckoutBrand customLogoUrl={props.customLogoUrl} />
    {props.loading ? <><div style={{ flex: 1 }} /><Loader2 size={32} color={CT.SKY} style={{ animation: "spin 1s linear infinite" }} /><div style={{ flex: 1 }} /></> : <><div style={{ flex: 1, minHeight: 20 }} /><p style={labelStyle}>{props.title}</p><p style={amountStyle}>{props.amount}</p><p style={subtitleStyle}>{props.subtitle}</p><div style={{ flex: 1, minHeight: 24 }} />
      {props.accepting ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 0", color: CT.SKY }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 14, fontWeight: 600 }}>Confirming…</span></div> : <><div className={props.step === "confirm" ? "checkout-view__quote-actions checkout-view__quote-actions--expanded" : "checkout-view__quote-actions"}><button onClick={props.onPrimary} disabled={props.responding} data-demo-id="checkout-quote-primary" style={{ ...outlineBtnStyle, flex: 1, opacity: props.responding ? 0.6 : 1 }}>{props.responding ? "…" : props.step === "view" ? "view quote" : "confirm"}</button><span className="checkout-view__quote-icon-slot" aria-hidden={props.step !== "confirm"}><button onClick={props.onViewQuote} disabled={props.step !== "confirm" || props.responding} tabIndex={props.step === "confirm" ? 0 : -1} aria-label="View quote PDF" style={iconBtnStyle}><svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 14v.01M14 20h.01M17 20h.01M20 17v3" /></svg></button></span></div><button onClick={props.onDecline} disabled={props.responding} data-demo-id="checkout-quote-decline" style={{ ...footerLinkStyle, marginTop: 12 }}>decline quote</button>{props.error && <p style={{ color: CT.RED, fontSize: 12, marginTop: 4, textAlign: "center" }}>{props.error}</p>}</>}
    </>}
  </div><SecureFooter /></div></div>;

  const processing = props.status === "processing";
  const failed = props.status === "error";
  return <div style={pageStyle} data-demo-id="checkout-payment"><div style={{ width: "100%", maxWidth: 380 }}><div style={{ ...cardStyle, minHeight: 600 }}><CheckoutBrand customLogoUrl={props.customLogoUrl} />
    {failed ? <><div style={{ flex: 1 }} /><div style={{ textAlign: "center" }}><XCircle size={48} color={CT.RED} style={{ margin: "0 auto 16px" }} /><p style={{ color: CT.SKY, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Payment failed</p><p style={{ color: CT.SKY_DIM, fontSize: 13 }}>{props.errorMessage || "Something went wrong."}</p></div><div style={{ flex: 1 }} /></> : <><div style={{ flex: 1, minHeight: 20 }} /><p style={labelStyle}>{props.splitActive ? `${props.itemName} · your share` : props.itemName}</p><p style={amountStyle}>{props.amount}</p>{props.subtitle && <p style={subtitleStyle}>{props.subtitle}</p>}
      {props.invoiceDocumentAvailable && <button onClick={props.onViewInvoice} style={{ ...viewInvoiceLinkStyle, background: "none", border: "none" }} data-demo-id="checkout-view-invoice"><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 16.5h6"/></svg>View invoice</button>}
      {props.isInvoice && props.splitEnabled && <div style={{ marginTop: 20, width: "100%" }}>{props.splitActive && <div style={{ background: "rgba(88,171,255,0.12)", borderRadius: 16, padding: "12px 14px", marginBottom: 12 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ color: CT.SKY, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Split {props.splitCount} ways</span><span style={{ color: CT.SKY_DIM, fontSize: 12 }}>{props.splitPaid} of {props.splitCount} paid</span></div><div style={{ display: "flex", gap: 4 }}>{Array.from({ length: props.splitCount }).map((_, i) => <div key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: i < props.splitPaid ? CT.SKY : "rgba(88,171,255,0.25)" }} />)}</div></div>}{!props.splitActive && props.splitChoosing && <div style={{ background: "rgba(88,171,255,0.12)", borderRadius: 16, padding: 14 }}><p style={{ color: CT.SKY, fontSize: 13, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>How many of you are splitting?</p><div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>{[2,3,4,5,6].map(n => <button key={n} onClick={() => props.onChooseSplit(n)} disabled={props.splitBusy} data-demo-id={`checkout-split-${n}`} style={{ padding: "12px 0", borderRadius: 12, border: `1.5px solid ${CT.SKY}`, background: "transparent", color: CT.SKY, fontWeight: 800, fontSize: 16, cursor: props.splitBusy ? "wait" : "pointer" }}>{n}</button>)}</div><button onClick={props.onCancelSplit} style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: CT.SKY_DIM, fontSize: 12, cursor: "pointer" }}>cancel</button></div>}{!props.splitActive && !props.splitChoosing && <button onClick={props.onStartSplit} disabled={processing} data-demo-id="checkout-start-split" style={{ width: "100%", padding: "12px 0", borderRadius: 14, border: "1.5px solid rgba(88,171,255,0.6)", background: "transparent", color: CT.SKY, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Split the bill</button>}{props.splitActive && <input type="email" value={props.payerEmail} onChange={e => props.onPayerEmailChange(e.target.value)} placeholder="your email (for your receipt)" style={{ width: "100%", boxSizing: "border-box", marginTop: 12, padding: "12px 14px", borderRadius: 12, border: "1.5px solid rgba(88,171,255,0.35)", background: "rgba(88,171,255,0.12)", color: CT.SKY, fontSize: 14, outline: "none" }} />}</div>}
      <div style={{ flex: 1, minHeight: 24 }} />{props.inAppBrowser ? <div style={{ background: "rgba(88,171,255,0.12)", border: "1px solid rgba(88,171,255,0.3)", borderRadius: 16, padding: "16px 18px", marginTop: 8, textAlign: "center", width: "100%", boxSizing: "border-box" }}><p style={{ color: CT.SKY, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{props.inAppIOS ? "Apple Pay not available" : "Google Pay & Apple Pay not available"}</p><p style={{ color: CT.SKY_DIM, fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>{props.inAppIOS ? "This page is open in an in-app browser. Open it in Safari to use Apple Pay, or pay by card below." : "This page is open in an in-app browser. Open it in Chrome to use wallet payments, or pay by card below."}</p>{(props.inAppAndroid || props.inAppIOS) && <button onClick={props.onOpenExternalBrowser} style={{ display: "block", background: CT.SKY, color: CT.INK, border: "none", width: "100%", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{props.inAppIOS ? "Open in Safari" : "Open in Chrome"}</button>}<button onClick={props.onCopyLink} style={{ background: "rgba(88,171,255,0.2)", color: CT.SKY, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, width: "100%", cursor: "pointer" }}>{props.linkCopied ? "Link copied!" : "Copy payment link"}</button></div> : <>{props.applePayAvailable && (processing ? <button disabled style={applePayBtnStyle} aria-label="Processing"><Loader2 size={20} color="#fff" style={{ animation: "spin 1s linear infinite" }} /></button> : <button onClick={props.onApplePay} className="checkout-view__apple-pay-button" aria-label="Pay with Apple Pay" data-demo-id="checkout-apple-pay" />)}{props.googlePayAvailable && <button onClick={props.onGooglePay} disabled={processing} style={googlePayBtnStyle} aria-label="Pay with Google Pay" data-demo-id="checkout-google-pay">{processing ? <Loader2 size={20} color="#fff" style={{ animation: "spin 1s linear infinite" }} /> : <img src={googlePayLogo} alt="Google Pay" style={{ height: 24, objectFit: "contain" }} />}</button>}</>}</>}
    {failed ? <button onClick={props.onRetry} style={{ ...outlineBtnStyle, marginTop: 8 }}>Try again</button> : <><button onClick={props.onToggleCard} style={footerLinkStyle} aria-expanded={props.cardOpen} data-demo-id="checkout-card-toggle">enter credit card <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: props.cardOpen ? "rotate(180deg)" : "none", transition: "transform 0.25s ease", display: "inline", verticalAlign: "-2px" }}><polyline points="6 9 12 15 18 9" /></svg></button><div style={{ background: CT.PANEL, borderRadius: props.cardOpen ? 24 : 0, padding: props.cardOpen ? "16px 18px 18px" : "0 18px", width: "100%", boxSizing: "border-box", marginTop: props.cardOpen ? 10 : 0, maxHeight: props.cardOpen ? 500 : 0, overflow: "hidden", transition: "max-height 0.4s ease, padding 0.4s ease, margin 0.4s ease" }}>{props.cardOpen && !props.cardReady && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "24px 0", color: CT.INK }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 13, fontWeight: 500 }}>Loading payment form…</span></div>}<div style={{ display: props.cardReady ? "block" : "none" }}><div style={{ marginBottom: 10 }}><label style={formLabelStyle}>Card Number</label><div id="hf-number" style={hfContainerStyle} /></div><div style={{ display: "flex", gap: 10, marginBottom: 10 }}><div style={{ flex: 1 }}><label style={formLabelStyle}>Expiry</label><div id="hf-expiry" style={hfContainerStyle} /></div><div style={{ flex: 1 }}><label style={formLabelStyle}>CVC</label><div id="hf-cvv" style={hfContainerStyle} /></div></div><div style={{ marginBottom: 10 }}><label style={formLabelStyle}>Cardholder Name</label><div id="hf-name" style={hfContainerStyle} /></div><button onClick={props.onCardPay} disabled={processing} style={payBtnStyle} data-demo-id="checkout-card-pay">{processing ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />Processing…</span> : `Pay ${props.amount}`}</button></div></div></>}
  </div>{!props.isInvoice && <div style={{ textAlign: "center", marginTop: 20 }}><button onClick={props.onCancel} disabled={processing} style={{ background: "none", border: "none", color: "#8899bb", fontSize: 13, fontWeight: 500, cursor: processing ? "default" : "pointer", opacity: processing ? 0.4 : 1, padding: "4px 0", textDecoration: "underline", textUnderlineOffset: 3 }}>Cancel payment</button></div>}<SecureFooter /></div></div>;
}

const viewInvoiceLinkStyle: React.CSSProperties = { display: "flex", justifyContent: "center", alignItems: "center", gap: 6, margin: "10px auto 0", width: "fit-content", color: CT.SKY, fontSize: 13.5, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" };
const applePayBtnStyle: React.CSSProperties = { width: "100%", background: "#000", color: "#fff", border: "none", borderRadius: 14, height: 52, display: "flex", alignItems: "center", justifyContent: "center", cursor: "not-allowed", marginBottom: 10 };
const googlePayBtnStyle: React.CSSProperties = { ...applePayBtnStyle, cursor: "pointer" };
const formLabelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: CT.INK, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 };
const hfContainerStyle: React.CSSProperties = { width: "100%", background: "#fff", border: "1.5px solid rgba(4,13,109,0.18)", borderRadius: 12, height: 46, overflow: "hidden", boxSizing: "border-box" };
const payBtnStyle: React.CSSProperties = { width: "100%", marginTop: 14, background: CT.INK, color: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.1px", boxShadow: "0 6px 20px rgba(4,13,109,0.3)" };
