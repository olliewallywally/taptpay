import { useState, useEffect, useRef, type CSSProperties, Component, type ReactNode } from "react";
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

// ── Error boundary — catches any render crash and shows a safe fallback ──
class CheckoutErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error("[Checkout] Render error:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4ff", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 32, textAlign: "center", maxWidth: 320 }}>
            <XCircle size={48} color="#e53e3e" style={{ margin: "0 auto 16px" }} />
            <h2 style={{ color: "#e53e3e", fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ color: "#666", marginBottom: 20 }}>Please scan the QR code again to restart your payment.</p>
            <button
              onClick={() => window.history.back()}
              style={{ background: "#0055FF", color: "#fff", border: "none", borderRadius: 14, padding: "12px 24px", fontWeight: 600, cursor: "pointer" }}
            >
              Go back
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function detectInAppBrowser(): { isInApp: boolean; isAndroid: boolean; isIOS: boolean } {
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isInApp =
    /FBAN|FBAV|Instagram|Twitter|Line|WeChat|Snapchat|TikTok|LinkedIn|Pinterest|Tumblr|Reddit|Bytedance/i.test(ua) ||
    (isAndroid && /wv\)/i.test(ua)) ||
    (/\bMobile\b/.test(ua) && !/Chrome|CriOS|FxiOS|Safari/i.test(ua) && (isAndroid || isIOS));
  return { isInApp, isAndroid, isIOS };
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

// Windcave / PaymentExpress HPP domain patterns.
// Covers windcave.com (current) and paymentexpress.com (Windcave's legacy domain
// still referenced in some SDK redirect fallbacks).  Also catches any subdomain.
const WINDCAVE_HPP_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:windcave|paymentexpress)\.com/i;

function CheckoutInner() {
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
  const [linkCopied, setLinkCopied] = useState(false);
  const inAppEnv = detectInAppBrowser();

  const hfController = useRef<any>(null);
  const hfReadyRef = useRef(false);
  const hfScriptsReady = useRef(false);
  const hfInitialised = useRef(false);
  const googleClient = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const applePayOptions = useRef<any>(null);
  const applePaySdkLoaded = useRef(false);

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

    // Apple Pay availability: checked using the native browser API — no Windcave
    // SDK needed. The SDK is lazy-loaded only when the user taps the Apple Pay
    // button, which prevents it from auto-initialising without a session and
    // redirecting to the Windcave HPP fallback URL.
    checkApplePay();

    // Google Pay script is safe to load unconditionally — Google's own SDK
    // never redirects; it only shows a native bottom sheet.
    loadScript("https://pay.google.com/gp/p/js/pay.js")
      .then(() => checkGooglePay())
      .catch(() => {});
  }, [envData]);

  // Lazy-load Windcave Hosted Fields scripts only when the card tab is first
  // opened — loading them at page load causes the HF SDK to auto-initialise
  // without a session and redirect the browser to the HPP fallback URL,
  // which breaks the Google Pay native sheet flow on Android.
  useEffect(() => {
    if (!envData || !cardOpen || hfInitialised.current) return;
    hfInitialised.current = true;
    Promise.all([
      loadScript(`${base}/js/lib/hosted-fields-v1.js`),
      loadScript(`${base}/js/windcavepayments-hostedfields-v1.js`),
    ])
      .then(() => { hfScriptsReady.current = true; initHostedFields(); })
      .catch((e) => {
        console.warn("Windcave HF scripts:", e);
        // Reset so the user can retry by closing and re-opening the card tab
        hfInitialised.current = false;
      });
  }, [envData, cardOpen]);

  // ── Navigation guard (prototype-level, comprehensive, self-healing) ──────
  // Intercepts every path Windcave SDKs may use to redirect to the HPP:
  //   1. window.location.href = url     (Location.prototype href setter)
  //   2. window.location.assign(url)    (Location.prototype.assign)
  //   3. window.location.replace(url)   (Location.prototype.replace)
  //   4. history.pushState(…, url)      (History.prototype.pushState)
  //   5. history.replaceState(…, url)   (History.prototype.replaceState)
  //   6. window.open(url, …)            (window.open)
  //
  // Guards are re-asserted on a 2 s interval so that a later SDK script load
  // cannot silently overwrite the patched methods.  Each patch uses its own
  // try/catch so a failure in one does not prevent the others from installing.
  useEffect(() => {
    // Track all guard functions so re-assertion can tell whether the currently
    // installed method is ours or was replaced by a later SDK script load.
    const guardFns = new Set<Function>();

    // Stash the true original methods once — never overwrite these during
    // re-assertion, so the chain always terminates at the real browser impl.
    const origHrefDesc    = Object.getOwnPropertyDescriptor(Location.prototype, "href");
    const origAssign      = Location.prototype.assign;
    const origReplace     = Location.prototype.replace;
    const origPushState   = History.prototype.pushState;
    const origReplState   = History.prototype.replaceState;
    const origWindowOpen  = window.open.bind(window);

    function blockHPP(url: string | URL | null | undefined, via: string): boolean {
      const urlStr = url == null ? "" : String(url);
      if (WINDCAVE_HPP_RE.test(urlStr)) {
        if (import.meta.env.DEV) {
          console.warn(
            `[Checkout] Blocked Windcave HPP redirect (${via}):`,
            urlStr.slice(0, 200)
          );
        }
        return true;
      }
      return false;
    }

    function installGuards() {
      // 1. href setter
      try {
        const current = Object.getOwnPropertyDescriptor(Location.prototype, "href");
        if (origHrefDesc?.set && !guardFns.has(current?.set ?? Function.prototype)) {
          const origSet = origHrefDesc.set;
          function hrefGuard(this: Location, url: string) {
            if (!blockHPP(url, "location.href")) origSet.call(this, url);
          }
          guardFns.add(hrefGuard);
          Object.defineProperty(Location.prototype, "href", {
            ...origHrefDesc,
            set: hrefGuard,
            configurable: true,
          });
        }
      } catch {}

      // 2. assign
      try {
        if (!guardFns.has(Location.prototype.assign)) {
          function assignGuard(this: Location, url: string | URL) {
            if (!blockHPP(url, "location.assign")) origAssign.call(this, url);
          }
          guardFns.add(assignGuard);
          Location.prototype.assign = assignGuard;
        }
      } catch {}

      // 3. replace
      try {
        if (!guardFns.has(Location.prototype.replace)) {
          function replaceGuard(this: Location, url: string | URL) {
            if (!blockHPP(url, "location.replace")) origReplace.call(this, url);
          }
          guardFns.add(replaceGuard);
          Location.prototype.replace = replaceGuard;
        }
      } catch {}

      // 4. history.pushState
      try {
        if (!guardFns.has(History.prototype.pushState)) {
          function pushStateGuard(
            this: History,
            ...args: Parameters<typeof History.prototype.pushState>
          ) {
            if (blockHPP(args[2], "history.pushState")) return;
            origPushState.call(this, ...args);
          }
          guardFns.add(pushStateGuard);
          History.prototype.pushState = pushStateGuard;
        }
      } catch {}

      // 5. history.replaceState
      try {
        if (!guardFns.has(History.prototype.replaceState)) {
          function replStateGuard(
            this: History,
            ...args: Parameters<typeof History.prototype.replaceState>
          ) {
            if (blockHPP(args[2], "history.replaceState")) return;
            origReplState.call(this, ...args);
          }
          guardFns.add(replStateGuard);
          History.prototype.replaceState = replStateGuard;
        }
      } catch {}

      // 6. window.open
      try {
        if (!guardFns.has(window.open)) {
          function openGuard(url?: string | URL, target?: string, features?: string): WindowProxy | null {
            if (blockHPP(url, "window.open")) return null;
            return origWindowOpen(url, target, features);
          }
          guardFns.add(openGuard);
          window.open = openGuard;
        }
      } catch {}
    }

    // Install immediately on mount, then re-assert every 2 s in case a
    // subsequently-loaded Windcave SDK script overwrites the patched methods.
    installGuards();
    const reassertInterval = setInterval(installGuards, 2000);

    return () => {
      clearInterval(reassertInterval);
      try {
        if (origHrefDesc) Object.defineProperty(Location.prototype, "href", origHrefDesc);
        Location.prototype.assign  = origAssign;
        Location.prototype.replace = origReplace;
        History.prototype.pushState    = origPushState;
        History.prototype.replaceState = origReplState;
        window.open = origWindowOpen;
      } catch {}
    };
  }, []);

  // ── Active-payment navigation blocker ───────────────────────────────────
  // While processing, any navigation attempt (beforeunload / pagehide) is
  // logged as a console.error so future regressions are immediately visible
  // in production logs. The beforeunload handler also prompts the browser to
  // confirm before leaving, which stops most accidental navigations.
  useEffect(() => {
    if (payState !== "processing") return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      console.error("[Checkout] Navigation attempted during payment processing (beforeunload)", {
        currentUrl: window.location.href,
        referrer: document.referrer,
      });
      e.preventDefault();
      e.returnValue = "";
    }
    function onPageHide() {
      console.error("[Checkout] Page hidden during payment processing (pagehide)", {
        currentUrl: window.location.href,
        referrer: document.referrer,
      });
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [payState]);

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
      // Never show Google Pay on iOS — Apple Pay is the correct wallet there
      if (inAppEnv.isIOS) return;
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

  async function handleApplePay() {
    // Signal that a payment is in progress — activates the beforeunload/pagehide
    // navigation blocker and gives the UI a processing state for Apple Pay too.
    setPayState("processing");

    // Lazy-load the Windcave Apple Pay SDK on first tap only — never at page
    // load.  Loading eagerly gave the SDK a chance to auto-initialise without a
    // session and redirect the browser to the HPP fallback URL.
    if (!applePaySdkLoaded.current) {
      try {
        await loadScript(`${base}/js/windcavepayments-applepay-v1.js`);
        applePaySdkLoaded.current = true;
      } catch (e) {
        console.error("[Checkout] Apple Pay SDK load failed:", e);
        setPayState("error");
        setErrorMsg("Apple Pay is not available right now. Please try another payment method.");
        return;
      }
    }
    if (!window.WindcavePayments?.ApplePay?.create) {
      setPayState("error");
      setErrorMsg("Apple Pay is not available.");
      return;
    }
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
        merchantInfo: {
          merchantId: googlePayMerchantId,
          merchantName: merchant?.businessName || "TaptPay",
        },
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

              {/* In-app browser warning — shown instead of wallet buttons */}
              {inAppEnv.isInApp ? (
                <div style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 16,
                  padding: "16px 18px",
                  marginTop: 8,
                  textAlign: "center",
                }}>
                  <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {inAppEnv.isIOS ? "Apple Pay not available" : "Google Pay & Apple Pay not available"}
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                    {inAppEnv.isIOS
                      ? "This page is open in an in-app browser. Open it in Safari to use Apple Pay, or pay by card below."
                      : "This page is open in an in-app browser. Open it in Chrome to use wallet payments, or pay by card below."}
                  </p>
                  {inAppEnv.isAndroid && (
                    <a
                      href={`intent://${window.location.href.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`}
                      style={{
                        display: "block",
                        background: "#0055FF",
                        color: "#fff",
                        borderRadius: 10,
                        padding: "10px 0",
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                        marginBottom: 8,
                      }}
                    >
                      Open in Chrome
                    </a>
                  )}
                  {inAppEnv.isIOS && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "block",
                        background: "#0055FF",
                        color: "#fff",
                        borderRadius: 10,
                        padding: "10px 0",
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                        marginBottom: 8,
                      }}
                    >
                      Open in Safari
                    </a>
                  )}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href).then(() => {
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2500);
                      });
                    }}
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 0",
                      fontSize: 13,
                      fontWeight: 600,
                      width: "100%",
                      cursor: "pointer",
                    }}
                  >
                    {linkCopied ? "Link copied!" : "Copy payment link"}
                  </button>
                </div>
              ) : (
                <>
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
              {/* Loading state while hosted fields initialise */}
              {cardOpen && !hfReady && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "24px 0", color: "#0055FF" }}>
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Loading payment form…</span>
                </div>
              )}

              {/* Card fields — only visible once hosted fields are ready */}
              <div style={{ display: hfReady ? "block" : "none" }}>
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

export default function Checkout() {
  return (
    <CheckoutErrorBoundary>
      <CheckoutInner />
    </CheckoutErrorBoundary>
  );
}
