import { useState, useEffect, useRef, type CSSProperties, Component, type ReactNode } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import taptLogo from "@assets/IMG_6592_1755070818452.png";
import googlePayLogo from "@assets/Google_Pay_Logo.svg_1773556576322.png";
// Window augmentations are declared centrally in client/src/global.d.ts.

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
  // This page serves two payment sources behind one branded UI:
  //   • Retail transactions at /checkout/:transactionId
  //   • Property rent/charge invoices at /r/:token
  // Only the data source and the three network calls differ; the wallet, 3DS,
  // navigation-guard and Hosted Fields machinery below is identical for both.
  const { transactionId, token } = useParams<{ transactionId?: string; token?: string }>();
  const isInvoice = !!token;
  const [, setLocation] = useLocation();
  const search = useSearch();
  const txId = transactionId ? parseInt(transactionId) : null;
  const urlParams = new URLSearchParams(search);
  const overrideAmount = urlParams.get("amount");

  // Source-specific endpoints — keyed by token for invoices, numeric id for txns.
  const sessionEndpoint = isInvoice ? `/api/checkout/${token}/session` : `/api/transactions/${txId}/pay`;
  const hfCompleteEndpoint = isInvoice ? `/api/checkout/${token}/hosted-fields-complete` : `/api/transactions/${txId}/hosted-fields-complete`;
  const gpayCompleteEndpoint = isInvoice ? `/api/checkout/${token}/googlepay-complete` : `/api/transactions/${txId}/googlepay-complete`;
  // Stable identifier for effect deps / guards across both sources.
  const payId: string | number | null = isInvoice ? (token ?? null) : txId;

  // Invoice split state (no-op for retail transactions).
  const [splitChoosing, setSplitChoosing] = useState(false);
  const [payerEmail, setPayerEmail] = useState("");
  const [splitBusy, setSplitBusy] = useState(false);

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
  const applePaySdkFailed = useRef(false);
  const preSessionRef = useRef<any>(null);
  // Incrementing this triggers the pre-session useEffect to create a fresh session
  const [preSessionTrigger, setPreSessionTrigger] = useState(0);

  // Google Pay pre-session — mirrors Apple Pay's approach so the Windcave session
  // is ready the moment the user approves Google Pay (no blocking network call).
  const googlePreSessionRef = useRef<any>(null);
  const [googlePreSessionTrigger, setGooglePreSessionTrigger] = useState(0);

  const { data: rawTransaction, isLoading: rawTxLoading } = useQuery({
    queryKey: ["/api/transactions", txId],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${txId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isInvoice && !!txId,
  });

  // Invoice resolve — amount, merchant, label, and split state for /r/:token.
  const { data: invoiceData, isLoading: invoiceLoading, error: invoiceError, refetch: refetchInvoice } = useQuery({
    queryKey: ["/api/checkout/resolve", token],
    queryFn: async () => {
      const res = await fetch(`/api/checkout/resolve/${token}`);
      if (res.status === 404) throw new Error("not-found");
      if (res.status === 410) throw new Error("voided");
      if (!res.ok) throw new Error("error");
      return res.json();
    },
    enabled: isInvoice && !!token,
    retry: false,
  });

  // Split-share maths (invoice only) — mirrors the server's share computation.
  const totalCents: number = invoiceData?.amountCents ?? 0;
  const splitCount: number = invoiceData?.splitCount ?? 0;
  const splitPaid: number = invoiceData?.splitPaidCount ?? 0;
  const splitActive = !!invoiceData?.splitEnabled && splitCount > 0;
  const shareBase = splitCount ? Math.floor(totalCents / splitCount) : 0;
  const isLastShare = splitCount ? splitPaid === splitCount - 1 : false;
  const shareCents = splitCount ? (isLastShare ? totalCents - shareBase * (splitCount - 1) : shareBase) : totalCents;
  const invoiceChargeCents = splitActive ? shareCents : totalCents;

  // Normalize both sources into the transaction shape the rest of the page uses.
  const transaction: any = isInvoice
    ? (invoiceData && !invoiceData.alreadyPaid
        ? {
            id: invoiceData.invoiceId,
            merchantId: invoiceData.merchantId,
            price: (invoiceChargeCents / 100).toFixed(2),
            itemName: invoiceData.vertical === "trades" ? (invoiceData.description || "Job invoice") : (invoiceData.kind === "charge" ? (invoiceData.description || "Payment") : "Rent"),
            taptStoneId: null,
            splitEnabled: false, // invoice splits are handled in-page, not via /split/:id
            isSplit: false,
          }
        : null)
    : rawTransaction;

  const txLoading = isInvoice ? invoiceLoading : rawTxLoading;

  // Body for the create-session call, per source.
  const buildSessionBody = (): Record<string, any> => {
    if (isInvoice) return payerEmail ? { payerEmail } : {};
    const body: Record<string, any> = { merchantId: transaction.merchantId };
    if (transaction.taptStoneId) body.stoneId = transaction.taptStoneId;
    if (overrideAmount) body.amount = overrideAmount;
    return body;
  };

  // Post-success navigation. Retail → receipt page; invoice → stay on the branded
  // success screen and refresh split progress (each payer pays on their own link).
  const navigateAfterSuccess = (result: any) => {
    if (isInvoice) { refetchInvoice(); return; }
    setTimeout(() => setLocation(result.redirectPath || `/receipt/${txId}`), 1200);
  };

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
  // googlePayEnv is controlled independently via GOOGLE_PAY_ENV server env var.
  // Defaults to "TEST" until the domain is registered at console.googlepay.com.
  const googlePayEnv: "TEST" | "PRODUCTION" = envData?.googlePayEnv || "TEST";
  const base = `https://${env}.windcave.com`;

  useEffect(() => {
    if (!envData) return;

    checkApplePay();

    // Pre-load the Windcave Apple Pay SDK eagerly so the SDK is ready before
    // the user taps. ApplePaySession.begin() must be called synchronously
    // within the original tap gesture — any await in between causes Safari to
    // silently drop the request and show no payment sheet.
    // The comprehensive navigation guards (href setter, assign, replace,
    // pushState, replaceState, window.open) already block any HPP redirect the
    // SDK may attempt when initialised without an active session.
    if (window.ApplePaySession?.canMakePayments()) {
      loadScript(`${base}/js/windcavepayments-applepay-v1.js`)
        .then(() => { applePaySdkLoaded.current = true; })
        .catch(() => {
          // Mark failure persistently so checkApplePay() never re-enables the
          // button even if envData changes or the effect re-runs.
          applePaySdkFailed.current = true;
          setApplePayAvailable(false);
        });
    }

    // Google Pay script — load unconditionally so the client is ready before tap.
    // In TEST mode (default) it shows a native bottom sheet without domain registration.
    // In PRODUCTION mode it requires domain registration at console.googlepay.com
    // (controlled via GOOGLE_PAY_ENV server env var).
    loadScript("https://pay.google.com/gp/p/js/pay.js")
      .then(() => checkGooglePay())
      .catch(() => {});
  }, [envData]);

  // Pre-create a Windcave session for Apple Pay as soon as the page is ready.
  // The Windcave ApplePay SDK checks opts.url at the moment ApplePay.create()
  // is called — if it is null the SDK skips ApplePaySession.begin() entirely
  // and the payment sheet never appears. By pre-creating the session here we
  // have the real ajaxSubmitApplePayUrl ready before the user taps, so
  // create() receives a valid URL immediately (within the user gesture).
  //
  // IMPORTANT: dependencies use primitive values (id, env string) rather than
  // the full React Query objects. React Query refetches in the background produce
  // new object references on every fetch, which would re-fire this effect, clear
  // preSessionRef, and create a race where the user taps between the clear and
  // the new async completing. Using stable primitives stops that churn.
  useEffect(() => {
    if (!applePayAvailable || !transaction?.id || !envData?.env || !payId) return;
    let cancelled = false;

    // Clear the stale pre-session only when a payment was attempted — that is,
    // when preSessionTrigger has incremented. On the initial load (trigger === 0)
    // we leave any existing session in place so there is never a gap where
    // preSessionRef.current is null while the async is in flight.
    if (preSessionTrigger > 0) {
      preSessionRef.current = null;
    }

    (async () => {
      try {
        const res = await apiRequest("POST", sessionEndpoint, buildSessionBody());
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.ajaxSubmitApplePayUrl) {
            preSessionRef.current = data;
          }
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  // Primitive deps: transaction.id and envData.env are stable across background
  // React Query refetches, so the effect only re-runs when something meaningful
  // changes (new transaction, different env, overrideAmount param, or a payment
  // was attempted and preSessionTrigger incremented).
  }, [applePayAvailable, transaction?.id, envData?.env, payId, overrideAmount, preSessionTrigger]);

  // Pre-create a Windcave session for Google Pay so it is ready the instant
  // the user approves — eliminates the createSession() network call that
  // previously happened after loadPaymentData() resolved, which added latency
  // at the most sensitive moment.  Same pattern as the Apple Pay pre-session.
  useEffect(() => {
    if (!googlePayAvailable || !transaction?.id || !envData?.env || !payId) return;
    let cancelled = false;

    if (googlePreSessionTrigger > 0) {
      googlePreSessionRef.current = null;
    }

    (async () => {
      try {
        const res = await apiRequest("POST", sessionEndpoint, buildSessionBody());
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data?.sessionId) {
            googlePreSessionRef.current = data;
          }
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [googlePayAvailable, transaction?.id, envData?.env, payId, overrideAmount, googlePreSessionTrigger]);

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
    const origHrefDesc      = Object.getOwnPropertyDescriptor(Location.prototype, "href");
    const origDocLocDesc    = Object.getOwnPropertyDescriptor(Document.prototype, "location");
    const origAssign        = Location.prototype.assign;
    const origReplace       = Location.prototype.replace;
    const origPushState     = History.prototype.pushState;
    const origReplState     = History.prototype.replaceState;
    const origWindowOpen    = window.open;
    // Form submission — the primary bypass used by Windcave's HPP fallback.
    // HTMLFormElement.prototype.submit is a native method that navigates the
    // browser without touching location.href/assign/replace/pushState/open,
    // so it bypasses all previous guards.
    const origFormSubmit    = HTMLFormElement.prototype.submit;

    function blockHPP(url: string | URL | null | undefined, via: string): boolean {
      const raw = (url == null ? "" : String(url)).trim();
      // Normalise scheme-relative URLs (//sec.windcave.com/…) so the regex
      // can match them even without an explicit http/https scheme prefix.
      const urlStr = raw.startsWith("//") ? `https:${raw}` : raw;
      if (WINDCAVE_HPP_RE.test(urlStr)) {
        // Always log — not just in DEV — so production incidents are visible
        // in browser console captures and bug reports.
        console.warn(
          `[Checkout] Blocked Windcave HPP redirect (${via}):`,
          urlStr.slice(0, 200)
        );
        return true;
      }
      return false;
    }

    // ── MutationObserver: neutralise Windcave forms the moment they are
    // injected into the DOM, before any JS can call .submit() on them.
    // Clearing `action` means even a non-guarded .submit() path navigates to
    // the current page (a no-op) rather than to the Windcave HPP.
    const formObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          const forms: HTMLFormElement[] = [];
          if (node instanceof HTMLFormElement) {
            forms.push(node);
          } else if (node instanceof Element) {
            forms.push(...Array.from(node.querySelectorAll("form")));
          }
          for (const form of forms) {
            const action = form.getAttribute("action") || "";
            if (blockHPP(action, "MutationObserver/form.action")) {
              // Remove the action attribute entirely so the form targets the
              // current page on any subsequent submit — this is a cleaner
              // no-op than setting action="#" which still triggers navigation.
              form.removeAttribute("action");
            }
          }
        }
      }
    });
    try {
      formObserver.observe(document.body, { childList: true, subtree: true });
    } catch {}

    // ── document-level submit event listener: backup for any form that
    // already exists in the DOM when the guard installs, or for submit events
    // dispatched via requestSubmit() rather than .submit().
    function onDocumentSubmit(e: Event) {
      const form = e.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement)) return;
      // Check both the attribute and the resolved .action property so that
      // property-only assignments (form.action = "https://...") are caught even
      // when the attribute was not set.
      const action = form.getAttribute("action") || form.action || "";
      if (blockHPP(action, "document.submit-event")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
    document.addEventListener("submit", onDocumentSubmit, true); // capture phase

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
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] location.href guard failed:", e);
      }

      // 2. assign
      try {
        if (!guardFns.has(Location.prototype.assign)) {
          function assignGuard(this: Location, url: string | URL) {
            if (!blockHPP(url, "location.assign")) origAssign.call(this, url);
          }
          guardFns.add(assignGuard);
          Location.prototype.assign = assignGuard;
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] location.assign guard failed:", e);
      }

      // 3. replace
      try {
        if (!guardFns.has(Location.prototype.replace)) {
          function replaceGuard(this: Location, url: string | URL) {
            if (!blockHPP(url, "location.replace")) origReplace.call(this, url);
          }
          guardFns.add(replaceGuard);
          Location.prototype.replace = replaceGuard;
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] location.replace guard failed:", e);
      }

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
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] history.pushState guard failed:", e);
      }

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
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] history.replaceState guard failed:", e);
      }

      // 6. window.open
      try {
        if (!guardFns.has(window.open)) {
          function openGuard(url?: string | URL, target?: string, features?: string): WindowProxy | null {
            if (blockHPP(url, "window.open")) return null;
            return origWindowOpen.call(window, url, target, features);
          }
          guardFns.add(openGuard);
          window.open = openGuard;
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] window.open guard failed:", e);
      }

      // 7. document.location setter — legacy path some webviews support.
      try {
        const curDocLoc = Object.getOwnPropertyDescriptor(Document.prototype, "location");
        if (origDocLocDesc?.set && !guardFns.has(curDocLoc?.set ?? Function.prototype)) {
          const origDocLocSet = origDocLocDesc.set;
          function docLocGuard(this: Document, url: string) {
            if (!blockHPP(url, "document.location")) origDocLocSet.call(this, url);
          }
          guardFns.add(docLocGuard);
          Object.defineProperty(Document.prototype, "location", {
            ...origDocLocDesc,
            set: docLocGuard,
            configurable: true,
          });
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] document.location guard failed:", e);
      }

      // 8. window.location (Window-level) setter.
      try {
        const winLocDesc = Object.getOwnPropertyDescriptor(Window.prototype, "location");
        if (winLocDesc?.set && !guardFns.has(winLocDesc.set)) {
          const origWinLocSet = winLocDesc.set;
          function winLocGuard(this: Window, url: string) {
            if (!blockHPP(url, "window.location")) origWinLocSet.call(this, url);
          }
          guardFns.add(winLocGuard);
          Object.defineProperty(Window.prototype, "location", {
            ...winLocDesc,
            set: winLocGuard,
            configurable: true,
          });
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] window.location guard failed (expected in most browsers):", e);
      }

      // 9. HTMLFormElement.prototype.submit — THE primary bypass vector.
      // Payment SDKs typically call form.submit() (not requestSubmit()) on a
      // hidden form whose action points to the HPP. This is invisible to all
      // the guards above because native form navigation does not go through
      // location.href/assign/replace/pushState/open. We override the prototype
      // method so every .submit() call is checked before the browser navigates.
      try {
        if (!guardFns.has(HTMLFormElement.prototype.submit)) {
          function formSubmitGuard(this: HTMLFormElement) {
            const action = this.getAttribute("action") || this.action || "";
            if (blockHPP(action, "HTMLFormElement.submit")) return; // block navigation
            origFormSubmit.call(this);
          }
          guardFns.add(formSubmitGuard);
          HTMLFormElement.prototype.submit = formSubmitGuard;
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Checkout] HTMLFormElement.submit guard failed:", e);
      }
    }

    // Install immediately on mount, then re-assert every 2 s in case a
    // subsequently-loaded Windcave SDK script overwrites the patched methods.
    installGuards();
    const reassertInterval = setInterval(installGuards, 2000);

    return () => {
      clearInterval(reassertInterval);
      formObserver.disconnect();
      document.removeEventListener("submit", onDocumentSubmit, true);
      try {
        if (origHrefDesc) Object.defineProperty(Location.prototype, "href", origHrefDesc);
        if (origDocLocDesc) Object.defineProperty(Document.prototype, "location", origDocLocDesc);
        Location.prototype.assign  = origAssign;
        Location.prototype.replace = origReplace;
        History.prototype.pushState    = origPushState;
        History.prototype.replaceState = origReplState;
        window.open = origWindowOpen;
        HTMLFormElement.prototype.submit = origFormSubmit;
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
      // Don't re-enable Apple Pay if the SDK previously failed to load
      if (!applePaySdkFailed.current && window.ApplePaySession?.canMakePayments()) {
        setApplePayAvailable(true);
      }
    } catch {}
  }

  async function checkGooglePay() {
    try {
      // Never show Google Pay on iOS — Apple Pay is the correct wallet there
      if (inAppEnv.isIOS) return;
      if (!window.google?.payments?.api?.PaymentsClient) return;
      // Use googlePayEnv (server-controlled via GOOGLE_PAY_ENV env var) rather
      // than deriving from Windcave env.  Switching to "PRODUCTION" requires
      // domain registration at console.googlepay.com; default is "TEST".
      const client = new window.google.payments.api.PaymentsClient({
        environment: googlePayEnv,
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
    if (!payId || !transaction) return null;
    try {
      const res = await apiRequest("POST", sessionEndpoint, buildSessionBody());
      if (!res.ok) return null;
      const data = await res.json();
      sessionRef.current = data;
      return data;
    } catch { return null; }
  }

  async function finaliseCard(sessionId: string) {
    try {
      const res = await apiRequest("POST", hfCompleteEndpoint, { sessionId, paymentMethod: "card" });
      const result = await res.json();
      if (result.approved) {
        setPayState("success");
        navigateAfterSuccess(result);
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
          // Generous timeout (20 min) so a slow bank 3DS challenge is never cut
          // short — we must never time the customer out mid-payment.
          1200,
          async (status: string) => {
            if (status === "done") {
              await finaliseCard(session.sessionId);
            } else {
              // Any non-"done" terminal status (abandoned / timed-out 3DS, etc.).
              // Surface a retryable error instead of leaving the spinner hanging
              // forever — the customer can tap "Try again" as many times as needed.
              console.warn("HF submit non-done status:", status);
              setPayState("error");
              setErrorMsg("Card payment didn't complete. Please try again.");
            }
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
    // Signal that a payment is in progress — activates the beforeunload/pagehide
    // navigation blocker and gives the UI a processing state for Apple Pay too.
    setPayState("processing");

    // Guard 1: Windcave Apple Pay SDK must be loaded (pre-loaded at page load).
    if (!applePaySdkLoaded.current || !window.WindcavePayments?.ApplePay?.create) {
      setPayState("error");
      setErrorMsg("Apple Pay is not ready yet. Please try again in a moment.");
      return;
    }

    // Guard 2: The Windcave ApplePay SDK checks opts.url at the moment
    // ApplePay.create() is called. If url is null it skips ApplePaySession.begin()
    // entirely and the payment sheet never appears. We pre-create the session in
    // a useEffect so the real ajaxSubmitApplePayUrl is ready here, before any
    // await, and well within the original user gesture.
    const preSession = preSessionRef.current;
    if (!preSession?.ajaxSubmitApplePayUrl) {
      setPayState("error");
      setErrorMsg("Apple Pay is still loading. Please try again in a moment.");
      setPreSessionTrigger(t => t + 1); // kick off a fresh pre-session
      return;
    }

    // Consume the pre-session — a new one will be created by the useEffect
    // once preSessionTrigger increments (at the end of this payment attempt).
    sessionRef.current = preSession;
    preSessionRef.current = null;

    const opts: any = {
      merchantId: applePayMerchantId,
      merchantName: merchant?.businessName || "TaptPay",
      countryCode: "NZ",
      currency: "NZD",
      amount: overrideAmount || transaction?.price || "0.00",
      supportedNetworks: ["visa", "masterCard", "amex"],
      url: preSession.ajaxSubmitApplePayUrl, // real URL — SDK calls begin() immediately
    };
    applePayOptions.current = opts;

    window.WindcavePayments.ApplePay.create(
      opts,
      async (state: string, _url: string, notify: (ok: boolean) => void) => {
        if (state === "done") {
          try {
            const res = await apiRequest("POST", hfCompleteEndpoint, {
              sessionId: preSession.sessionId,
              paymentMethod: "apple_pay",
            });
            const result = await res.json();
            notify(result.approved === true);
            if (result.approved) {
              setPayState("success");
              setPreSessionTrigger(t => t + 1); // queue a fresh session for any retry
              navigateAfterSuccess(result);
            } else {
              setPayState("error");
              setErrorMsg("Apple Pay payment was declined.");
              setPreSessionTrigger(t => t + 1);
            }
          } catch {
            notify(false);
            setPayState("error");
            setErrorMsg("Apple Pay failed.");
            setPreSessionTrigger(t => t + 1);
          }
        } else {
          // Any non-"done" state (e.g. "cancel") — user dismissed the sheet.
          // Reset UI to idle and regenerate the pre-session so the next tap works.
          setPayState("idle");
          setPreSessionTrigger(t => t + 1);
        }
      },
      (stage: string, msg: string) => {
        // SDK error callback. Distinguish early-stage failures (sheet never
        // appeared) from later failures (payment was in progress).
        console.error("Apple Pay:", stage, msg);
        const beforeSheet = ["setup", "pre-submit"].includes(stage);
        if (beforeSheet) {
          // Error before the payment sheet appeared — reset to idle so the
          // user can tap again. Without this the UI stays stuck on the spinner.
          setPayState("idle");
          setPreSessionTrigger(t => t + 1);
        } else {
          // Error during or after the sheet — show error state.
          setPayState("error");
          setErrorMsg("Apple Pay payment failed.");
          setPreSessionTrigger(t => t + 1);
        }
      },
      (_: string, next: () => void) => { next(); },
      // Callback 5 (pre-submit): URL is already in opts.url — just pass through.
      (next: () => void, _cancel: () => void) => { next(); }
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
      // Use pre-created session if available (no blocking network call).
      // Fall back to creating a new session if the pre-session wasn't ready.
      const session = googlePreSessionRef.current || await createSession();
      googlePreSessionRef.current = null; // consume the session
      if (!session) { setPayState("error"); setErrorMsg("Unable to start payment."); return; }
      // Trigger a new pre-session for retry after failed/cancelled payment
      setGooglePreSessionTrigger(t => t + 1);
      // NOTE: ajaxSubmitGooglePayUrl is intentionally NOT sent — the backend looks it
      // up from its server-side cache to prevent SSRF attacks.
      const res = await apiRequest("POST", gpayCompleteEndpoint, {
        sessionId: session.sessionId,
        googlePayToken,
      });
      const result = await res.json();
      if (result.approved) {
        setPayState("success");
        navigateAfterSuccess(result);
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
    // Mint fresh wallet pre-sessions so a retry after sitting on the error
    // screen never reuses a stale/expired Windcave session. The card flow
    // already creates a brand-new session on every handleCardPay, so retries
    // are effectively unlimited — there is no attempt cap anywhere.
    setPreSessionTrigger(t => t + 1);
    setGooglePreSessionTrigger(t => t + 1);
  }

  // Invoice split: payer picks how many people share the bill. Calls the
  // existing invoice split endpoint, then refreshes so the share amount updates.
  async function setupSplit(count: number) {
    if (!isInvoice || splitBusy) return;
    setSplitBusy(true);
    try {
      const res = await fetch(`/api/checkout/${token}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (res.ok) {
        setSplitChoosing(false);
        await refetchInvoice();
      }
    } catch {} finally {
      setSplitBusy(false);
    }
  }

  function handleCancel() {
    // Invoices are opened directly from a payment link — there is no prior TaptPay
    // page to return to, so the Cancel affordance is hidden for them (see render).
    if (isInvoice) return;
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

  // Invoice link is invalid / voided / errored.
  if (isInvoice && invoiceError) {
    const voided = (invoiceError as Error).message === "voided";
    return (
      <div style={pageStyle}>
        <div style={cardWrapStyle}>
          <div style={blueCardStyle}>
            <div style={logoWrap}><img src={logoSrc} alt="logo" style={{ ...logoImgStyle, ...logoStyle }} /></div>
            <div style={{ textAlign: "center" }}>
              <XCircle size={48} color="#f87171" style={{ margin: "0 auto 16px" }} />
              <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{voided ? "Link cancelled" : "Link not found"}</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{voided ? "This payment link has been cancelled." : "This payment link doesn't exist or has expired."}</p>
            </div>
          </div>
          <div style={tealTabStyle} />
        </div>
      </div>
    );
  }

  // Invoice already settled — show a branded confirmation instead of a pay form.
  if (isInvoice && invoiceData?.alreadyPaid) {
    return (
      <div style={pageStyle}>
        <div style={cardWrapStyle}>
          <div style={blueCardStyle}>
            <div style={logoWrap}><img src={logoSrc} alt="logo" style={{ ...logoImgStyle, ...logoStyle }} /></div>
            <div style={{ textAlign: "center" }}>
              <CheckCircle size={64} color="#00E5CC" style={{ margin: "0 auto 16px" }} />
              <p style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Already paid</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>This has already been paid. Thank you!</p>
            </div>
          </div>
          <div style={tealTabStyle} />
        </div>
      </div>
    );
  }

  if (!payId || (!txLoading && !transaction)) {
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
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>{isInvoice ? "Thank you — your payment is confirmed." : "Thank you — redirecting…"}</p>
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
              <p style={itemNameStyle}>{splitActive ? `${itemName} · your share` : itemName}</p>
              <p style={amountStyle}>{amountDisplay}</p>

              {/* View-invoice link — shown for one-off charges (not rent) that carry an
                  attached document. Opens in a new tab so the payer can read, download
                  or share it via their browser/OS. */}
              {isInvoice && invoiceData?.kind === "charge" && invoiceData?.documentUrl && (
                <a
                  href={invoiceData.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={viewInvoiceLinkStyle}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 16.5h6"/></svg>
                  View invoice
                </a>
              )}

              {/* ── Invoice split-bill (rent/charges only) ── */}
              {isInvoice && invoiceData?.splitEnabled && (
                <div style={{ marginBottom: 20 }}>
                  {/* Progress once a split is under way */}
                  {splitActive && (
                    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: "12px 14px", marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Split {splitCount} ways</span>
                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>{splitPaid} of {splitCount} paid</span>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {Array.from({ length: splitCount }).map((_, i) => (
                          <div key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: i < splitPaid ? "#00E5CC" : "rgba(255,255,255,0.25)" }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chooser: pick how many people are splitting */}
                  {!splitActive && splitChoosing && (
                    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: "14px" }}>
                      <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>How many of you are splitting?</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
                        {[2, 3, 4, 5, 6].map(n => (
                          <button key={n} onClick={() => setupSplit(n)} disabled={splitBusy}
                            style={{ padding: "12px 0", borderRadius: 12, border: "1.5px solid #00E5CC", background: "transparent", color: "#fff", fontWeight: 800, fontSize: 16, cursor: splitBusy ? "wait" : "pointer" }}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setSplitChoosing(false)} style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>cancel</button>
                    </div>
                  )}

                  {/* Offer to split (before a split has started) */}
                  {!splitActive && !splitChoosing && (
                    <button onClick={() => setSplitChoosing(true)} disabled={isProcessing}
                      style={{ width: "100%", padding: "12px 0", borderRadius: 14, border: "1.5px solid rgba(0,229,204,0.6)", background: "transparent", color: "#00E5CC", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      Split the bill
                    </button>
                  )}

                  {/* Payer email — so each split payer gets their own GST receipt */}
                  {splitActive && (
                    <input type="email" value={payerEmail} onChange={e => setPayerEmail(e.target.value)}
                      placeholder="your email (for your receipt)"
                      style={{ width: "100%", boxSizing: "border-box", marginTop: 12, padding: "12px 14px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, outline: "none" }} />
                  )}
                </div>
              )}

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

        {/* Cancel link — sits cleanly below the card stack. Hidden for invoices,
            which are opened directly from a link with no prior page to return to. */}
        {!isInvoice && (
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
        )}

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

const viewInvoiceLinkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 6,
  margin: "0 auto 18px",
  width: "fit-content",
  color: "#00E5CC",
  fontSize: 13.5,
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
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
