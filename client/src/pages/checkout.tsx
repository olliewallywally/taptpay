import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

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
  const txId = transactionId ? parseInt(transactionId) : null;

  const [cardOpen, setCardOpen] = useState(false);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [googlePayAvailable, setGooglePayAvailable] = useState(false);
  const [hfReady, setHfReady] = useState(false);
  const [scriptsFailed, setScriptsFailed] = useState(false);
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
  const simMode: boolean = envData?.simMode === true;
  const applePayMerchantId: string = envData?.applePayMerchantId || "";
  const googlePayMerchantId: string = envData?.googlePayMerchantId || "";
  const base = `https://${env}.windcave.com`;

  useEffect(() => {
    if (!envData) return;
    // In simulation mode (no Windcave credentials), skip external scripts entirely.
    // The UI shows a test button that bypasses the Hosted Fields controller.
    if (simMode) return;

    // Fallback: if scripts haven't loaded + HF isn't ready within 6 s, show sim button.
    // hfReadyRef avoids stale closure — it's updated synchronously when HF init succeeds.
    const timeout = setTimeout(() => {
      if (!hfReadyRef.current) setScriptsFailed(true);
    }, 6000);

    Promise.all([
      loadScript(`${base}/js/lib/hosted-fields-v1.js`),
      loadScript(`${base}/js/windcavepayments-hostedfields-v1.js`),
      loadScript(`${base}/js/windcavepayments-applepay-v1.js`),
    ])
      .then(() => { initHostedFields(); checkApplePay(); })
      .catch((e) => { console.warn("Windcave scripts:", e); setScriptsFailed(true); });

    loadScript("https://pay.google.com/gp/p/js/pay.js")
      .then(() => checkGooglePay())
      .catch(() => {});

    return () => clearTimeout(timeout);
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
      const res = await apiRequest("POST", `/api/transactions/${txId}/hosted-fields-complete`, { sessionId });
      const result = await res.json();
      if (result.approved) {
        setPayState("success");
        setTimeout(() => setLocation(result.redirectPath || `/payment/result/${txId}?status=approved`), 1200);
      } else {
        setPayState("error");
        setErrorMsg("Payment was declined. Please try another card.");
      }
    } catch {
      setPayState("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  // Fully simulated payment — calls the backend sim-pay endpoint (no Windcave).
  // Used when simMode=true (no credentials) or when scripts failed to load.
  async function handleSimPay() {
    if (!txId) return;
    setPayState("processing");
    try {
      const res = await apiRequest("POST", `/api/transactions/${txId}/sim-pay`);
      const data = await res.json();
      if (data.redirectPath) {
        setLocation(data.redirectPath);
      } else {
        setPayState("error");
        setErrorMsg("Payment simulation failed. Please try again.");
      }
    } catch {
      setPayState("error");
      setErrorMsg("Payment simulation failed. Please try again.");
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
    // In simulation mode or when the card URL is a sim URL, bypass Hosted Fields
    const isSimUrl = !session.ajaxSubmitCardUrl || session.ajaxSubmitCardUrl.includes("/api/windcave/sim-submit");
    if (simMode || isSimUrl || !hfController.current) {
      await finaliseCard(session.sessionId);
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
      amount: transaction?.price || "0.00",
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
            });
            const result = await res.json();
            notify(result.approved === true);
            if (result.approved) {
              setPayState("success");
              setTimeout(() => setLocation(result.redirectPath || `/payment/result/${txId}?status=approved`), 1200);
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
          totalPrice: transaction?.price || "0.00",
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
        setTimeout(() => setLocation(result.redirectPath || `/payment/result/${txId}?status=approved`), 1200);
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
    setPayState("idle");
    setErrorMsg("");
    sessionRef.current = null;
  }

  function handleCancel() {
    if (transaction?.merchantId) {
      setLocation(`/pay/${transaction.merchantId}`);
    } else {
      window.history.back();
    }
  }

  const logoSrc = merchant?.customLogoUrl || taptLogo;
  const logoStyle = merchant?.customLogoUrl ? {} : {
    filter: "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)",
  };

  const amountDisplay = `$${parseFloat(transaction?.price || "0").toFixed(2)}`;
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

  if (payState === "error") {
    return (
      <div style={pageStyle}>
        <div style={cardWrapStyle}>
          <div style={{ ...blueCardStyle, paddingBottom: 96 }}>
            <div style={logoWrap}><img src={logoSrc} alt="logo" style={{ ...logoImgStyle, ...logoStyle }} /></div>
            <div style={{ textAlign: "center" }}>
              <XCircle size={48} color="#f87171" style={{ margin: "0 auto 16px" }} />
              <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Payment failed</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{errorMsg || "Something went wrong."}</p>
            </div>
          </div>
          <div style={{ ...tealTabOpenStyle, paddingTop: 64, paddingBottom: 24 }}>
            <button onClick={handleRetry} style={payBtnStyle}>Try again</button>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing = payState === "processing";

  return (
    <div style={pageStyle}>
      <div style={cardWrapStyle}>

        {/* ── Blue card ── */}
        <div style={blueCardStyle}>

          {/* Logo */}
          <div style={logoWrap}>
            <img src={logoSrc} alt="logo" style={{ ...logoImgStyle, ...logoStyle }} />
          </div>

          {/* Item name + Amount */}
          <p style={itemNameStyle}>{itemName}</p>
          <p style={amountStyle}>{amountDisplay}</p>

          {/* Apple Pay button — only on Safari/Apple devices */}
          {applePayAvailable && (
            <button
              onClick={handleApplePay}
              disabled={isProcessing}
              style={applePayBtnStyle}
              aria-label="Pay with Apple Pay"
            >
              {isProcessing ? (
                <Loader2 size={18} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <>
                  <svg width="18" height="22" viewBox="0 0 814 1000" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.4-57.8-155.5-127.4C46 790.8 0 663.4 0 541.8c0-207.8 133.4-317.5 264.4-317.5 99.1 0 181.5 65.5 243.5 65.5 59.3 0 152-69.3 263.4-69.3zM643.4 159.5c-28.4 33.8-74.2 60.3-115.8 60.3-5.2 0-10.4-.5-15.5-1.5-.9-5.5-1.4-11-1.4-16.5 0-49.5 25.5-101.3 62.6-134.4 19.4-16.9 49.7-33.5 75.6-43.9 4.8 8.1 6.8 17.3 6.8 26.3 0 47.8-20.2 99.1-42.3 109.7z" />
                  </svg>
                  Pay
                </>
              )}
            </button>
          )}

          {/* Google Pay button — only on Android/Chrome with Google Pay */}
          {googlePayAvailable && (
            <button
              onClick={handleGooglePay}
              disabled={isProcessing}
              style={googlePayBtnStyle}
              aria-label="Pay with Google Pay"
            >
              {isProcessing ? (
                <Loader2 size={18} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <>
                  <svg width="41" height="17" viewBox="0 0 41 17" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.527 11.338H17.6V7.54h1.927c.963 0 1.697.742 1.697 1.899s-.734 1.899-1.697 1.899zm-.077-4.582H16.5v6.54h1.05v-1.17h1.9c1.548 0 2.74-1.173 2.74-2.685s-1.192-2.685-2.74-2.685zM23.4 13.296h1.05V6.756H23.4v6.54zM27.826 11.648l-1.663-4.892h-1.127l2.254 6.297-.093.27c-.15.44-.39.65-.756.65-.13 0-.274-.02-.38-.06l-.126 1.003c.16.05.38.08.57.08.934 0 1.532-.49 1.98-1.718l2.347-6.522H29.7l-1.874 4.892z" fill="#fff"/>
                    <path d="M10.254 8.03c0-.397-.034-.78-.097-1.147H5.23v2.17h2.822c-.122.65-.49 1.2-1.044 1.569v1.303h1.69c.99-.912 1.556-2.255 1.556-3.895z" fill="#4285F4"/>
                    <path d="M5.23 12.83c1.418 0 2.607-.47 3.476-1.272l-1.69-1.303c-.47.314-1.07.5-1.786.5-1.373 0-2.535-.927-2.952-2.174H.533v1.344A5.228 5.228 0 005.23 12.83z" fill="#34A853"/>
                    <path d="M2.278 8.581a3.12 3.12 0 010-1.993V5.244H.533A5.228 5.228 0 000 8.585a5.228 5.228 0 00.533 3.34l1.745-1.344z" fill="#FBBC04"/>
                    <path d="M5.23 4.413c.773 0 1.467.266 2.013.788l1.508-1.508A5.198 5.198 0 005.23 2.341 5.228 5.228 0 00.533 5.245l1.745 1.344c.417-1.247 1.58-2.176 2.952-2.176z" fill="#EA4335"/>
                  </svg>
                  Pay
                </>
              )}
            </button>
          )}

          {/* Cancel button */}
          <button onClick={handleCancel} style={cancelBtnStyle} disabled={isProcessing}>
            Cancel Payment
          </button>
        </div>

        {/* ── Simulation mode OR scripts failed to load: single pay button, no card form ── */}
        {(simMode || scriptsFailed) ? (
          <div style={{
            background: "#00E5CC",
            borderRadius: "0 0 32px 32px",
            padding: "52px 22px 22px",
            marginTop: -44,
            position: "relative",
            zIndex: 1,
            boxShadow: "0 16px 40px rgba(0,229,204,0.25)",
          }}>
            <p style={{ textAlign: "center", fontSize: 11, color: "#0055FF", fontWeight: 600, marginBottom: 12, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Test mode — no card required
            </p>
            <button
              onClick={handleSimPay}
              disabled={isProcessing}
              style={payBtnStyle}
            >
              {isProcessing ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                  Processing…
                </span>
              ) : (
                `Simulate Payment ${amountDisplay}`
              )}
            </button>
          </div>
        ) : (
          <>
            {/* ── Expandable card details tab ── */}
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

        {/* Secured by line */}
        <p style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: "#aab0c0", letterSpacing: "0.03em" }}>
          Secured by <strong style={{ color: "#00E5CC", fontWeight: 600 }}>Windcave</strong> · PCI DSS Compliant
        </p>
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
  borderRadius: 40,
  padding: "28px 28px 104px",
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
  padding: 10,
  fontSize: 12,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
  marginBottom: 0,
  letterSpacing: "-0.2px",
};

const googlePayBtnStyle: CSSProperties = {
  width: "100%",
  background: "#1a1a1a",
  color: "#fff",
  border: "none",
  borderRadius: 18,
  padding: "10px 16px",
  fontSize: 12,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
  marginTop: 10,
  letterSpacing: "-0.2px",
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
