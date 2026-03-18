import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import taptLogo from "@assets/IMG_6592_1755070818452.png";
import googlePayLogo from "@assets/Google_Pay_Logo.svg_1773556576322.png";

declare global {
  interface Window {
    WindcavePayments?: any;
    ApplePaySession?: any;
    google?: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed: ${src}`));
    document.head.appendChild(s);
  });
}

export default function Checkout() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const txId = transactionId ? parseInt(transactionId) : null;
  const urlParams = new URLSearchParams(search);
  const overrideAmount = urlParams.get("amount");

  const [cardOpen, setCardOpen] = useState(false);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [googlePayAvailable, setGooglePayAvailable] = useState(false);
  const [hfReady, setHfReady] = useState(false);
  const [payState, setPayState] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const hfController = useRef<any>(null);
  const hfReadyRef = useRef(false);
  const googleClient = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const applePayOptions = useRef<any>(null);

  const { data: transaction, isLoading: txLoading } = useQuery({
    queryKey: ["/api/transactions", txId],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${txId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!txId,
  });

  const { data: envData } = useQuery({
    queryKey: ["/api/windcave/env"],
    queryFn: async () => (await fetch("/api/windcave/env")).json(),
  });

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", transaction?.merchantId],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${transaction.merchantId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!transaction?.merchantId,
  });

  const env: "uat" | "sec" = envData?.env || "uat";
  const applePayMerchantId: string = envData?.applePayMerchantId || "";
  const googlePayMerchantId: string = envData?.googlePayMerchantId || "";
  const base = `https://${env}.windcave.com`;

  useEffect(() => {
    if (!envData) return;

    Promise.all([
      loadScript(`${base}/js/lib/hosted-fields-v1.js`),
      loadScript(`${base}/js/windcavepayments-hostedfields-v1.js`),
      loadScript(`${base}/js/windcavepayments-applepay-v1.js`),
    ])
      .then(() => { initHostedFields(); checkApplePay(); })
      .catch((e) => console.warn("Windcave scripts:", e));

    loadScript("https://pay.google.com/gp/p/js/pay.js")
      .then(() => checkGooglePay())
      .catch(() => {});
  }, [envData]);

  const fieldStyle = {
    "background-color": "rgba(255,255,255,0.55)",
    "color": "#0a1a4a",
    "font-family": "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    "font-size": "14px",
    "padding": "11px 14px",
    "border": "1.5px solid rgba(0,85,255,0.18)",
    "border-radius": "12px",
  };

  function initHostedFields() {
    if (!window.WindcavePayments?.HostedFields?.create) return;
    hfController.current = window.WindcavePayments.HostedFields.create(
      {
        env,
        fields: {
          CardNumber: {
            container: "hf-number",
            placeholder: "1234  5678  9012  3456",
            tabOrder: 1,
            cardSchemaImagePlacement: "right",
            supportedCards: ["visa", "masterCard", "amex", "other"],
            styles: fieldStyle,
            length: { jumpToNextField: true },
          },
          ExpirationDate: {
            container: "hf-expiry",
            placeholder: "MM / YY",
            tabOrder: 2,
            styles: fieldStyle,
            length: { jumpToNextField: true },
          },
          CVV: {
            container: "hf-cvv",
            placeholder: "•••",
            tabOrder: 3,
            styles: fieldStyle,
          },
          CardholderName: {
            container: "hf-name",
            placeholder: "Name on card",
            tabOrder: 4,
            isOptional: true,
            styles: fieldStyle,
          },
        },
        threeDsIFrame: {
          overlayBgColor: { r: 0, g: 85, b: 255 },
          dimensions: { width: "420px", height: "550px" },
        },
      },
      30,
      () => { hfReadyRef.current = true; setHfReady(true); },
      (err: any) => console.error("HF init:", err)
    );
  }

  function checkApplePay() {
    try {
      if (window.ApplePaySession?.canMakePayments()) setApplePayAvailable(true);
    } catch {}
  }

  async function checkGooglePay() {
    try {
      if (!window.google?.payments?.api?.PaymentsClient) return;
      const client = new window.google.payments.api.PaymentsClient({
        environment: env === "sec" ? "PRODUCTION" : "TEST",
      });
      const { result } = await client.isReadyToPay({
        apiVersion: 2, apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: "CARD",
          parameters: {
            allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
            allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"],
          },
        }],
      });
      if (result) { googleClient.current = client; setGooglePayAvailable(true); }
    } catch {}
  }

  async function createSession() {
    if (!txId || !transaction) return null;
    const body: Record<string, any> = { merchantId: transaction.merchantId };
    if (transaction.taptStoneId) body.stoneId = transaction.taptStoneId;
    if (overrideAmount) body.amount = overrideAmount;
    try {
      const res = await apiRequest("POST", `/api/transactions/${txId}/pay`, body);
      if (!res.ok) return null;
      const data = await res.json();
      sessionRef.current = data;
      return data;
    } catch { return null; }
  }

  async function finaliseCard(sessionId: string) {
    try {
      const res = await apiRequest("POST", `/api/transactions/${txId}/hosted-fields-complete`, { sessionId, paymentMethod: "card" });
      const result = await res.json();
      if (result.approved) {
        setPayState("success");
        setTimeout(() => setLocation(result.redirectPath || `/receipt/${txId}`), 1200);
      } else {
        setPayState("error");
        setErrorMsg("Payment was declined. Please try another card.");
      }
    } catch {
      setPayState("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  async function handleCardPay() {
    setPayState("processing");
    const session = await createSession();
    if (!session?.sessionId) {
      setPayState("error");
      setErrorMsg("Unable to start payment. Please try again.");
      return;
    }
    if (!hfController.current) {
      setPayState("error");
      setErrorMsg("Card payment is not ready yet. Please try again.");
      return;
    }
    hfController.current.validateField(
      null,
      (results: any) => {
        const allValid = Object.values(results as Record<string, any>).every((r: any) => r.isValidationPass);
        if (!allValid) { setPayState("idle"); return; }
        hfController.current!.submit(
          session.ajaxSubmitCardUrl,
          60,
          async (status: string) => {
            if (status === "done") await finaliseCard(session.sessionId);
          },
          (err: any) => {
            console.error("HF submit:", err);
            setPayState("error");
            setErrorMsg("Card payment failed. Please try again.");
          }
        );
      },
      () => setPayState("idle")
    );
  }

  function handleApplePay() {
    if (!window.WindcavePayments?.ApplePay?.create) return;
    const opts: any = {
      merchantId: applePayMerchantId,
      merchantName: merchant?.businessName || "TaptPay",
      countryCode: "NZ",
      currency: "NZD",
      amount: overrideAmount || transaction?.price || "0.00",
      supportedNetworks: ["visa", "masterCard", "amex"],
      url: null,
    };
    applePayOptions.current = opts;
    window.WindcavePayments.ApplePay.create(
      opts,
      async (state: string, _url: string, notify: (ok: boolean) => void) => {
        if (state === "done") {
          try {
            const res = await apiRequest("POST", `/api/transactions/${txId}/hosted-fields-complete`, {
              sessionId: sessionRef.current?.sessionId,
              paymentMethod: "apple_pay",
            });
            const result = await res.json();
            notify(result.approved === true);
            if (result.approved) {
              setPayState("success");
              setTimeout(() => setLocation(result.redirectPath || `/receipt/${txId}`), 1200);
            } else {
              setPayState("error");
              setErrorMsg("Apple Pay payment was declined.");
            }
          } catch { notify(false); setPayState("error"); setErrorMsg("Apple Pay failed."); }
        }
      },
      (stage: string, msg: string) => {
        console.error("Apple Pay:", stage, msg);
        if (!["setup", "pre-submit", "payment-start"].includes(stage)) {
          setPayState("error"); setErrorMsg("Apple Pay payment failed.");
        }
      },
      (_: string, next: () => void) => { next(); },
      async (next: () => void, cancel: () => void) => {
        const session = await createSession();
        if (!session?.ajaxSubmitApplePayUrl) {
          cancel();
          setPayState("error");
          setErrorMsg("Could not start Apple Pay. Please try another payment method.");
          return;
        }
        opts.url = session.ajaxSubmitApplePayUrl;
        next();
      }
    );
  }

  async function handleGooglePay() {
    const client = googleClient.current;
    if (!client) return;
    setPayState("processing");
    try {
      const paymentData = await client.loadPaymentData({
        apiVersion: 2, apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: "CARD",
          parameters: {
            allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
            allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"],
          },
          tokenizationSpecification: {
            type: "PAYMENT_GATEWAY",
            parameters: { gateway: "windcave", gatewayMerchantId: googlePayMerchantId },
          },
        }],
        merchantInfo: { merchantName: merchant?.businessName || "TaptPay" },
        transactionInfo: {
          totalPriceStatus: "FINAL",
          totalPrice: overrideAmount || transaction?.price || "0.00",
          currencyCode: "NZD",
          countryCode: "NZ",
        },
      });
      const rawToken = paymentData?.paymentMethodData?.tokenizationData?.token || "{}";
      const googlePayToken = typeof rawToken === "string" ? JSON.parse(rawToken) : rawToken;
      const session = await createSession();
      if (!session) { setPayState("error"); setErrorMsg("Unable to start payment."); return; }
      // NOTE: ajaxSubmitGooglePayUrl is intentionally NOT sent — the backend looks it
      // up from its server-side cache to prevent SSRF attacks.
      const res = await apiRequest("POST", `/api/transactions/${txId}/googlepay-complete`, {
        sessionId: session.sessionId,
        googlePayToken,
      });
      const result = await res.json();
      if (result.approved) {
        setPayState("success");
        setTimeout(() => setLocation(result.redirectPath || `/receipt/${txId}`), 1200);
      } else {
        setPayState("error");
        setErrorMsg("Google Pay payment was declined.");
      }
    } catch (e: any) {
      if (e?.statusCode === "CANCELED") { setPayState("idle"); return; }
      setPayState("error");
      setErrorMsg("Google Pay payment failed.");
    }
  }

  function handleRetry() {
    setCardOpen(false);
    setErrorMsg("");
    sessionRef.current = null;
    setPayState("idle");
  }

  function handleCancel() {
    // If we came from a split flow (amount override or transaction is split-enabled),
    // go back to the split page so the customer can adjust — not to /pay which would loop
    if (transaction?.splitEnabled && txId) {
      setLocation(`/split/${txId}`);
    } else if (transaction?.merchantId) {
      setLocation(`/pay/${transaction.merchantId}`);
    } else {
      window.history.back();
    }
  }

  const logoSrc = merchant?.customLogoUrl || taptLogo;
  const logoStyle = merchant?.customLogoUrl ? {} : {
    filter: "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)",
  };

  const displayPrice = overrideAmount ? overrideAmount : (transaction?.price || "0");
  const amountDisplay = `$${parseFloat(displayPrice).toFixed(2)}`;
  const itemName = transaction?.itemName || "";

  if (!txId || (!txLoading && !transaction)) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4ff" }}>
        <div style={{ background: "#fff", borderRadius: 24, padding: 32, textAlign: "center" }}>
          <h2 style={{ color: "#e53e3e", fontWeight: 700, marginBottom: 8 }}>Invalid payment link</h2>
          <p style={{ color: "#666" }}>Please scan the merchant's QR code again.</p>
        </div>
      </div>
    );
  }

  if (txLoading || !transaction) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4ff" }}>
        <Loader2 size={40} color="#0055FF" style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (payState === "success") {
    return (
      <div style={pageStyle}>
        <div style={cardWrapStyle}>
          <div style={blueCardStyle}>
            <div style={logoWrap}><img src={logoSrc} alt="logo" style={{ ...logoImgStyle, ...logoStyle }} /></div>
            <div style={{ textAlign: "center" }}>
              <CheckCircle size={64} color="#00E5CC" style={{ margin: "0 auto 16px" }} />
              <p style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Payment Successful!</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>Thank you — redirecting…</p>
            </div>
          </div>
          <div style={tealTabStyle} />
        </div>
      </div>
    );
  }

  const isProcessing = payState === "processing";
  const isError = payState === "error";

  return (
    <div style={pageStyle}>
      <div style={cardWrapStyle}>

        {/* ── Blue card ── */}
        <div style={blueCardStyle}>

          {/* Logo */}
          <div style={logoWrap}>
            <img src={logoSrc} alt="logo" style={{ ...logoImgStyle, ...logoStyle }} />
          </div>

          {/* Error overlay — shown in place of normal content on failure */}
          {isError ? (
            <div style={{ textAlign: "center" }}>
              <XCircle size={48} color="#f87171" style={{ margin: "0 auto 16px" }} />
              <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Payment failed</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{errorMsg || "Something went wrong."}</p>
            </div>
          ) : (
            <>
              {/* Item name + Amount */}
              <p style={itemNameStyle}>{itemName}</p>
              <p style={amountStyle}>{amountDisplay}</p>

              {/* Apple Pay — native button (Safari/Apple devices only) */}
              {applePayAvailable && (
                isProcessing ? (
                  <button disabled style={applePayBtnStyle} aria-label="Processing">
                    <Loader2 size={20} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
                  </button>
                ) : (
                  <button
                    onClick={handleApplePay}
                    className="apple-pay-btn"
                    aria-label="Pay with Apple Pay"
                  />
                )
              )}

              {/* Google Pay — official branded button (Android/Chrome only) */}
              {googlePayAvailable && (
                <button
                  onClick={handleGooglePay}
                  disabled={isProcessing}
                  style={googlePayBtnStyle}
                  aria-label="Pay with Google Pay"
                >
                  {isProcessing ? (
                    <Loader2 size={20} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <img src={googlePayLogo} alt="Google Pay" style={{ height: 24, objectFit: "contain" }} />
                  )}
                </button>
              )}
            </>
          )}

        </div>

        {/* ── Cyan tab — always rendered so hosted fields stay mounted ── */}
        {isError ? (
          /* Error state: full-width "Try again" button in the teal tab */
          <div style={{ ...tealTabStyle, paddingTop: 64, paddingBottom: 24 }}>
            <button onClick={handleRetry} style={payBtnStyle}>Try again</button>
          </div>
        ) : (
          /* Normal state: expandable card details */
          <>
          <div
              style={{ ...cardTabStyle, ...(cardOpen ? cardTabOpenStyle : {}) }}
              onClick={() => !isProcessing && setCardOpen((o) => !o)}
              role="button"
              aria-expanded={cardOpen}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#0055FF", fontSize: 14, fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0055FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                enter card details
              </div>
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="#0055FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: cardOpen ? "rotate(180deg)" : "none", transition: "transform 0.25s ease", flexShrink: 0 }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* ── Expandable card form (Hosted Fields) ── */}
            <div style={{
              background: "#00E5CC",
              borderRadius: cardOpen ? "0 0 32px 32px" : 0,
              padding: cardOpen ? "4px 22px 22px" : "0 22px",
              position: "relative",
              zIndex: 0,
              boxShadow: cardOpen ? "0 16px 40px rgba(0,229,204,0.25)" : "none",
              maxHeight: cardOpen ? 500 : 0,
              overflow: "hidden",
              transition: "max-height 0.4s ease, padding 0.4s ease",
            }}>
              {/* Card Number */}
              <div style={{ marginBottom: 10 }}>
                <label style={formLabelStyle}>Card Number</label>
                <div id="hf-number" style={hfContainerStyle} />
              </div>

              {/* Expiry + CVV row */}
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={formLabelStyle}>Expiry</label>
                  <div id="hf-expiry" style={hfContainerStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={formLabelStyle}>CVC</label>
                  <div id="hf-cvv" style={hfContainerStyle} />
                </div>
              </div>

              {/* Cardholder Name */}
              <div style={{ marginBottom: 10 }}>
                <label style={formLabelStyle}>Cardholder Name</label>
                <div id="hf-name" style={hfContainerStyle} />
              </div>

              {/* Pay button */}
              <button
                onClick={handleCardPay}
                disabled={isProcessing}
                style={payBtnStyle}
              >
                {isProcessing ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                    Processing…
                  </span>
                ) : (
                  `Pay ${amountDisplay}`
                )}
              </button>
            </div>
          </>
        )}

        {/* Cancel link — sits cleanly below the card stack */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={handleCancel}
            disabled={isProcessing}
            style={{
              background: "none",
              border: "none",
              color: "#8899bb",
              fontSize: 13,
              fontWeight: 500,
              cursor: isProcessing ? "default" : "pointer",
              opacity: isProcessing ? 0.4 : 1,
              padding: "4px 0",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Cancel payment
          </button>
        </div>

        {/* Secured by line */}
        <p style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: "#aab0c0", letterSpacing: "0.03em" }}>
          Secured by <strong style={{ color: "#00E5CC", fontWeight: 600 }}>Windcave</strong> · PCI DSS Compliant
        </p>

        {/* Test card hint — UAT environment only */}
        {env === "uat" && (
          <div style={{
            marginTop: 16,
            background: "#fffbeb",
            border: "1.5px solid #f59e0b",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 11,
            color: "#78350f",
            lineHeight: 1.6,
          }}>
            <strong style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#92400e" }}>
              🧪 UAT Test Mode — Windcave Test Cards
            </strong>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #fcd34d" }}>
                  <th style={{ textAlign: "left", paddingBottom: 4, fontWeight: 600 }}>Card Number</th>
                  <th style={{ textAlign: "left", paddingBottom: 4, fontWeight: 600 }}>Type</th>
                  <th style={{ textAlign: "left", paddingBottom: 4, fontWeight: 600 }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { num: "4111 1111 1111 1111", type: "Visa", result: "Approved (Frictionless 3DS)" },
                  { num: "4242 4242 4242 4242", type: "Visa", result: "Approved" },
                  { num: "5431 1111 1111 1111", type: "Mastercard", result: "Approved" },
                  { num: "5588 8800 0007 7770", type: "Mastercard", result: "3DS Challenge (code: 123)" },
                  { num: "3711 1111 1111 114",  type: "Amex",       result: "Approved" },
                  { num: "5431 1111 1111 1228", type: "Mastercard", result: "Declined (insufficient funds)" },
                ].map((c) => (
                  <tr key={c.num} style={{ borderBottom: "1px solid #fef3c7" }}>
                    <td style={{ padding: "3px 0", fontFamily: "monospace", letterSpacing: "0.04em" }}>{c.num}</td>
                    <td style={{ padding: "3px 4px" }}>{c.type}</td>
                    <td style={{ padding: "3px 0", color: "#6b7280" }}>{c.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 6, color: "#92400e" }}>
              Use any future expiry · Any 3-digit CVC · Amount ending <strong>.76</strong> = always declined
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ── Style constants matching hpp-preview.html exactly ── */

const pageStyle: CSSProperties = {
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  background: "#f0f4ff",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px 40px",
};

const cardWrapStyle: CSSProperties = {
  width: "100%",
  maxWidth: 320,
};

const blueCardStyle: CSSProperties = {
  background: "#0055FF",
  borderRadius: 48,
  padding: "41px 28px 74px",
  boxShadow: "0 24px 60px rgba(0,85,255,0.35)",
  position: "relative",
  zIndex: 2,
};

const logoWrap: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginBottom: 20,
};

const logoImgStyle: CSSProperties = {
  height: 36,
  objectFit: "contain",
};

const itemNameStyle: CSSProperties = {
  textAlign: "center",
  color: "rgba(255,255,255,0.65)",
  fontSize: 14,
  marginBottom: 4,
  fontWeight: 400,
};

const amountStyle: CSSProperties = {
  textAlign: "center",
  color: "#ffffff",
  fontSize: 56,
  fontWeight: 700,
  letterSpacing: "-2px",
  lineHeight: 1,
  marginBottom: 28,
};

const applePayBtnStyle: CSSProperties = {
  width: "100%",
  background: "#000000",
  color: "#fff",
  border: "none",
  borderRadius: 18,
  height: 52,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "not-allowed",
  marginBottom: 10,
};

const googlePayBtnStyle: CSSProperties = {
  width: "100%",
  background: "#000000",
  border: "none",
  borderRadius: 18,
  height: 52,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  marginBottom: 10,
};

const cancelBtnStyle: CSSProperties = {
  width: "100%",
  background: "#00E5CC",
  color: "#0055FF",
  border: "none",
  borderRadius: 18,
  padding: 10,
  fontSize: 12,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  marginTop: 10,
  letterSpacing: "-0.1px",
};

const cardTabStyle: CSSProperties = {
  background: "#00E5CC",
  borderRadius: "0 0 32px 32px",
  padding: "52px 26px 17px",
  marginTop: -44,
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  cursor: "pointer",
  boxShadow: "0 16px 40px rgba(0,229,204,0.25)",
  transition: "background 0.15s ease",
  userSelect: "none",
};

const cardTabOpenStyle: CSSProperties = {
  borderRadius: 0,
  boxShadow: "none",
};

const tealTabStyle: CSSProperties = {
  background: "#00E5CC",
  borderRadius: "0 0 32px 32px",
  padding: "52px 26px 17px",
  marginTop: -44,
  position: "relative",
  zIndex: 1,
};

const tealTabOpenStyle: CSSProperties = {
  background: "#00E5CC",
  borderRadius: "0 0 32px 32px",
  padding: "0 22px",
  position: "relative",
  zIndex: 1,
};

const formLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#0044BB",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: 5,
};

const hfContainerStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.55)",
  border: "1.5px solid rgba(0,85,255,0.18)",
  borderRadius: 12,
  height: 46,
  overflow: "hidden",
};

const payBtnStyle: CSSProperties = {
  width: "100%",
  marginTop: 14,
  background: "#0055FF",
  color: "#fff",
  border: "none",
  borderRadius: 18,
  padding: 14,
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "-0.1px",
  boxShadow: "0 6px 20px rgba(0,85,255,0.35)",
};
