import { useState, useEffect, useMemo, useRef, Component, type ReactNode } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { XCircle } from "lucide-react";
import "@/styles/checkout.css";
import { money } from "@/lib/checkout-theme";
import { CheckoutView } from "@/features/checkout/CheckoutView";
import { useTokenPagePrivacy } from "@/hooks/use-token-page-privacy";
import {
  checkoutCompletionEndpoint,
  checkoutResolveEndpoint,
  checkoutSessionEndpoint,
  checkoutSourceForRoute,
  bindPaymentIdempotencyKey,
  clearPaymentIdempotencyKey,
  currentTokenPaymentAmount,
  currentTokenShareIndex,
  getOrCreatePaymentIdempotencyKey,
  paymentIdempotencyKey,
  redactCustomerPaymentAddress,
  rememberPaymentReturnState,
  tokenCompletionRequest,
  tokenPaymentPath,
  tokenSessionRequest,
  type CheckoutRouteKind,
  type CheckoutSource,
  type PaymentCheckoutSource,
} from "@/lib/payment-addressing";
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
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F4F4", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 32, textAlign: "center", maxWidth: 320 }}>
            <XCircle size={48} color="#e53e3e" style={{ margin: "0 auto 16px" }} />
            <h2 style={{ color: "#e53e3e", fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ color: "#666", marginBottom: 20 }}>Please scan the QR code again to restart your payment.</p>
            <button
              onClick={() => window.history.back()}
              style={{ background: "#040D6D", color: "#fff", border: "none", borderRadius: 14, padding: "12px 24px", fontWeight: 600, cursor: "pointer" }}
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

function CheckoutInner({ sourceKind }: { sourceKind: CheckoutRouteKind }) {
  // This page serves four explicitly-addressed payment sources behind one UI:
  //   • Retail transactions at /checkout/:transactionId
  //   • Property rent/charge invoices at /r/:token
  //   • Trades quotes at /trades/quote/:token (quoteMode) — the customer accepts
  //     the quote here, which mints a deposit/full invoice; from that point the
  //     page behaves exactly like an /r/:token invoice. Until acceptance there
  //     is no invoice token, so `token` is undefined and the invoice/wallet
  //     machinery stays dormant — the animated quote steps render instead.
  const routeParams = useParams<{ transactionId?: string; token?: string }>();
  const routeSource = useMemo(
    () => checkoutSourceForRoute(sourceKind, routeParams),
    [routeParams.token, routeParams.transactionId, sourceKind],
  );
  const quoteMode = routeSource?.kind === "quote-token";
  // In quote mode the route param is the QUOTE token, not an invoice token.
  const quoteToken = routeSource?.kind === "quote-token" ? routeSource.token : undefined;
  const [acceptedInvoiceToken, setAcceptedInvoiceToken] = useState<string | null>(null);
  // Effective invoice token: the accepted deposit/full invoice in quote mode,
  // otherwise the /r/:token route param. Keeps every downstream endpoint,
  // guard and effect below identical across all three sources.
  const activeSource: CheckoutSource | null = quoteMode && acceptedInvoiceToken
    ? { kind: "invoice-token", token: acceptedInvoiceToken }
    : routeSource;
  const paymentSource: PaymentCheckoutSource | null = activeSource?.kind === "quote-token"
    ? null
    : activeSource;
  const token = activeSource?.kind === "invoice-token" ? activeSource.token : undefined;
  const retailToken = activeSource?.kind === "retail-token" ? activeSource.token : undefined;
  const isInvoice = activeSource?.kind === "invoice-token";
  const isRetailToken = activeSource?.kind === "retail-token";
  const [, setLocation] = useLocation();
  const search = useSearch();
  const txId = activeSource?.kind === "retail-legacy" ? activeSource.transactionId : null;
  const urlParams = new URLSearchParams(search);
  const overrideAmount = urlParams.get("amount");
  useTokenPagePrivacy(isRetailToken);

  // Source-specific endpoints. A retail token is never exchanged for an ID.
  const sessionEndpoint = paymentSource ? checkoutSessionEndpoint(paymentSource) : "";
  const hfCompleteEndpoint = paymentSource ? checkoutCompletionEndpoint(paymentSource, "hosted-fields") : "";
  const gpayCompleteEndpoint = paymentSource ? checkoutCompletionEndpoint(paymentSource, "googlepay") : "";
  // Stable identifier for effect deps / guards across both sources.
  const payId: string | number | null = paymentSource?.kind === "retail-legacy"
    ? paymentSource.transactionId
    : paymentSource?.token ?? null;

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

  // Timers that schedule state updates — tracked so they can be cancelled on
  // unmount and never fire against an unmounted component.
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      if (linkCopiedTimerRef.current) clearTimeout(linkCopiedTimerRef.current);
    };
  }, []);

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
    enabled: activeSource?.kind === "retail-legacy" && !!txId,
  });

  const {
    data: tokenPayment,
    isLoading: tokenPaymentLoading,
    error: tokenPaymentError,
    refetch: refetchTokenPayment,
  } = useQuery<any>({
    queryKey: ["token-payment", retailToken],
    queryFn: async () => {
      const res = await fetch(checkoutResolveEndpoint({ kind: "retail-token", token: retailToken! }), {
        headers: { "Cache-Control": "no-cache" },
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 410 && body?.payment) return { ...body.payment, closed: true };
      if (!res.ok) throw new Error(res.status === 404 ? "not-found" : "error");
      return body;
    },
    enabled: isRetailToken && !!retailToken,
    retry: false,
    staleTime: 0,
    refetchInterval: 2500,
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

  // ── Trades quote (quoteMode only) ──────────────────────────────────────
  // Fetches the quote the customer is being asked to accept. The GET marks the
  // quote "viewed" server-side; if it was already accepted it also returns the
  // minted invoice so a revisit jumps straight to the payment step.
  const { data: quoteData, isLoading: quoteLoading, error: quoteError } = useQuery<any>({
    queryKey: ["/api/trades/quotes/token", quoteToken],
    queryFn: async () => {
      const res = await fetch(`/api/trades/quotes/token/${quoteToken}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Quote not found");
      return res.json();
    },
    enabled: quoteMode && !!quoteToken,
    retry: false,
  });
  const quote = quoteData?.quote;
  // view → confirm within the card; drives the button-row animation.
  const [quoteStep, setQuoteStep] = useState<"view" | "confirm">("view");
  const [quoteResponding, setQuoteResponding] = useState(false);
  const [quoteRespondError, setQuoteRespondError] = useState("");
  const [quoteDeclined, setQuoteDeclined] = useState(false);

  // Decide the opening step exactly once, from the first quote response. A quote
  // the customer has already opened (previouslyViewed) skips straight to "confirm";
  // a first-time open stays on "view" so they see the quote before committing.
  // Must use the server's pre-mutation `previouslyViewed` flag, not the returned
  // viewedAt (which the GET always sets), and apply it only once so a background
  // refetch can't jump the customer forward mid-interaction.
  const didInitQuoteStep = useRef(false);
  useEffect(() => {
    if (didInitQuoteStep.current || !quoteData) return;
    didInitQuoteStep.current = true;
    if (quoteData.previouslyViewed) setQuoteStep("confirm");
  }, [quoteData]);

  // Accepted quote revisited → adopt its invoice token and fall through to pay.
  useEffect(() => {
    if (quoteMode && quoteData?.invoice?.token && !acceptedInvoiceToken) {
      setAcceptedInvoiceToken(quoteData.invoice.token);
    }
  }, [quoteMode, quoteData?.invoice?.token, acceptedInvoiceToken]);

  const openQuotePdf = () => {
    if (quoteToken) window.open(`/api/trades/quotes/token/${quoteToken}/pdf`, "_blank", "noopener,noreferrer");
  };
  const respondToQuote = async (accept: boolean) => {
    if (!quoteToken || quoteResponding) return;
    setQuoteResponding(true);
    setQuoteRespondError("");
    try {
      const res = await fetch(`/api/trades/quotes/token/${quoteToken}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not respond");
      const result = await res.json();
      if (!accept) { setQuoteDeclined(true); return; }
      // Acceptance mints the deposit/full invoice → switch the page onto it. The
      // card shell stays mounted; the payment layout crossfades in once resolved.
      if (result.depositInvoice?.token) setAcceptedInvoiceToken(result.depositInvoice.token);
    } catch (err) {
      setQuoteRespondError((err as Error).message);
    } finally {
      setQuoteResponding(false);
    }
  };

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
            itemName: invoiceData.vertical === "trades" ? (invoiceData.description || "Job invoice") : (invoiceData.kind === "charge" ? (invoiceData.description || "Payment") : (invoiceData.propertyAddress || "Rent")),
            taptStoneId: null,
            splitEnabled: false, // invoice splits are handled in-page, not via /split/:id
            isSplit: false,
          }
        : null)
    : isRetailToken
      ? (tokenPayment
          ? {
              price: currentTokenPaymentAmount(tokenPayment),
              itemName: tokenPayment.itemName,
              status: tokenPayment.status,
              paymentMethod: tokenPayment.paymentMethod,
              taptStoneId: null,
              splitEnabled: tokenPayment.splitEnabled,
              isSplit: tokenPayment.isSplit,
              totalSplits: tokenPayment.totalSplits,
              completedSplits: tokenPayment.completedSplits,
              splitAmount: tokenPayment.splitAmount,
              createdAt: tokenPayment.createdAt,
            }
          : null)
      : rawTransaction;

  const txLoading = isInvoice ? invoiceLoading : isRetailToken ? tokenPaymentLoading : rawTxLoading;
  const tokenShareIndex = isRetailToken ? currentTokenShareIndex(tokenPayment ?? {}) : 0;

  const getTokenIdempotencyKey = (shareIndex = tokenShareIndex) => {
    if (!isRetailToken || !activeSource) return null;
    return getOrCreatePaymentIdempotencyKey(activeSource, shareIndex);
  };

  const hydrateSession = (data: any) => {
    if (!isRetailToken || !retailToken || !activeSource) return data;
    const shareIndex = Number.isInteger(data?.shareIndex) ? data.shareIndex : tokenShareIndex;
    const idempotencyKey = getTokenIdempotencyKey(tokenShareIndex);
    bindPaymentIdempotencyKey(activeSource, tokenShareIndex, shareIndex, idempotencyKey!);
    if (data?.returnState) rememberPaymentReturnState(data.returnState, retailToken);
    return { ...data, shareIndex, __clientIdempotencyKey: idempotencyKey };
  };

  const completionBody = (session: any, extra: Record<string, any>) => {
    if (!isRetailToken) return { sessionId: session.sessionId, ...extra };
    const shareIndex = Number.isInteger(session?.shareIndex) ? session.shareIndex : tokenShareIndex;
    return tokenCompletionRequest({
      sessionId: session.sessionId,
      idempotencyKey: session.__clientIdempotencyKey ?? getTokenIdempotencyKey(shareIndex)!,
      shareIndex,
    }, extra);
  };

  const reconcileTokenAttempt = (result: any, session: any) => {
    if (!isRetailToken || !activeSource) return;
    if (!["approved", "declined", "cancelled"].includes(result?.outcome)) return;
    const shareIndex = Number.isInteger(session?.shareIndex) ? session.shareIndex : tokenShareIndex;
    clearPaymentIdempotencyKey(activeSource, shareIndex);
    refetchTokenPayment();
  };

  // Body for the create-session call, per source.
  const buildSessionBody = (): Record<string, any> => {
    if (isInvoice) return payerEmail ? { payerEmail } : {};
    if (isRetailToken) {
      return tokenSessionRequest(getTokenIdempotencyKey()!);
    }
    const body: Record<string, any> = { merchantId: transaction.merchantId };
    if (transaction.taptStoneId) body.stoneId = transaction.taptStoneId;
    if (overrideAmount) body.amount = overrideAmount;
    return body;
  };

  // Post-success navigation. Retail → receipt page; invoice → stay on the branded
  // success screen and refresh split progress (each payer pays on their own link).
  const navigateAfterSuccess = (result: any) => {
    if (isInvoice) { refetchInvoice(); return; }
    if (isRetailToken && retailToken) {
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      const receiptShare = Number.isInteger(result?.receiptShare) ? result.receiptShare : null;
      navigateTimerRef.current = setTimeout(() => setLocation(
        tokenPaymentPath(retailToken, "receipt", receiptShare),
        { replace: true },
      ), 1200);
      return;
    }
    if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
    navigateTimerRef.current = setTimeout(() => setLocation(result.redirectPath || `/receipt/${txId}`), 1200);
  };

  const { data: envData } = useQuery({
    queryKey: ["/api/windcave/env"],
    queryFn: async () => (await fetch("/api/windcave/env")).json(),
  });

  const { data: legacyMerchant } = useQuery({
    queryKey: ["/api/merchants", transaction?.merchantId],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${transaction.merchantId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isRetailToken && activeSource?.kind !== "quote-token" && !!transaction?.merchantId,
  });
  const merchant = isRetailToken ? tokenPayment?.merchant : legacyMerchant;

  useEffect(() => {
    if (!isRetailToken || !retailToken || !tokenPayment) return;
    if (!["completed", "partially_refunded", "refunded"].includes(tokenPayment.status)) return;
    if (tokenPayment.isSplit) return;
    setLocation(tokenPaymentPath(retailToken, "receipt"), { replace: true });
  }, [isRetailToken, retailToken, setLocation, tokenPayment?.isSplit, tokenPayment?.status]);

  const tokenHasLocalAttempt = isRetailToken && activeSource
    ? !!paymentIdempotencyKey(activeSource, tokenShareIndex)
    : false;
  const tokenCanCreateSession = !isRetailToken || tokenPayment?.status === "pending" || (
    tokenPayment?.status === "processing" && tokenHasLocalAttempt
  );

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
    if (!applePayAvailable || !transaction || !envData?.env || !payId || !tokenCanCreateSession) return;
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
          const data = hydrateSession(await res.json());
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
  }, [applePayAvailable, payId, transaction?.status, envData?.env, overrideAmount, preSessionTrigger, tokenCanCreateSession, tokenShareIndex]);

  // Pre-create a Windcave session for Google Pay so it is ready the instant
  // the user approves — eliminates the createSession() network call that
  // previously happened after loadPaymentData() resolved, which added latency
  // at the most sensitive moment.  Same pattern as the Apple Pay pre-session.
  useEffect(() => {
    if (!googlePayAvailable || !transaction || !envData?.env || !payId || !tokenCanCreateSession) return;
    let cancelled = false;

    if (googlePreSessionTrigger > 0) {
      googlePreSessionRef.current = null;
    }

    (async () => {
      try {
        const res = await apiRequest("POST", sessionEndpoint, buildSessionBody());
        if (!cancelled && res.ok) {
          const data = hydrateSession(await res.json());
          if (data?.sessionId) {
            googlePreSessionRef.current = data;
          }
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [googlePayAvailable, payId, transaction?.status, envData?.env, overrideAmount, googlePreSessionTrigger, tokenCanCreateSession, tokenShareIndex]);

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
          redactCustomerPaymentAddress(urlStr).slice(0, 200)
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
        currentUrl: redactCustomerPaymentAddress(window.location.href),
        referrer: redactCustomerPaymentAddress(document.referrer),
      });
      e.preventDefault();
      e.returnValue = "";
    }
    function onPageHide() {
      console.error("[Checkout] Page hidden during payment processing (pagehide)", {
        currentUrl: redactCustomerPaymentAddress(window.location.href),
        referrer: redactCustomerPaymentAddress(document.referrer),
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
    "background-color": "#FFFFFF",
    "color": "#040D6D",
    "font-family": "'Outfit', Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    "font-size": "14px",
    "padding": "11px 14px",
    "border": "1.5px solid rgba(4,13,109,0.18)",
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
          overlayBgColor: { r: 4, g: 13, b: 109 },
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
    if (!payId || !transaction || !tokenCanCreateSession) return null;
    try {
      const res = await apiRequest("POST", sessionEndpoint, buildSessionBody());
      if (!res.ok) return null;
      const data = hydrateSession(await res.json());
      if (isRetailToken && ["approved", "declined", "cancelled"].includes(data?.attemptState)) {
        const result = {
          approved: data.attemptState === "approved",
          outcome: data.attemptState,
          receiptShare: data.shareIndex > 0 ? data.shareIndex : null,
        };
        reconcileTokenAttempt(result, data);
        if (result.approved) {
          setPayState("success");
          navigateAfterSuccess(result);
        } else {
          setPayState("error");
          setErrorMsg("The previous payment attempt did not complete. Please try again.");
        }
        return { ...data, __terminal: true };
      }
      sessionRef.current = data;
      return data;
    } catch { return null; }
  }

  async function finaliseCard(session: any) {
    try {
      const res = await apiRequest("POST", hfCompleteEndpoint, completionBody(session, { paymentMethod: "card" }));
      const result = await res.json();
      reconcileTokenAttempt(result, session);
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
    if (session?.__terminal) return;
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
              await finaliseCard(session);
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
            const res = await apiRequest("POST", hfCompleteEndpoint, completionBody(preSession, {
              paymentMethod: "apple_pay",
            }));
            const result = await res.json();
            reconcileTokenAttempt(result, preSession);
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
      if (session?.__terminal) return;
      if (!session) { setPayState("error"); setErrorMsg("Unable to start payment."); return; }
      // Trigger a new pre-session for retry after failed/cancelled payment
      if (!isRetailToken) setGooglePreSessionTrigger(t => t + 1);
      // NOTE: ajaxSubmitGooglePayUrl is intentionally NOT sent — the backend looks it
      // up from its server-side cache to prevent SSRF attacks.
      const res = await apiRequest("POST", gpayCompleteEndpoint, completionBody(session, {
        googlePayToken,
      }));
      const result = await res.json();
      reconcileTokenAttempt(result, session);
      if (isRetailToken) setGooglePreSessionTrigger(t => t + 1);
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
    // A token retry re-resolves the same durable attempt with the same UUID.
    // The UUID is cleared only after an explicit reconciled terminal outcome,
    // never because a browser request timed out.
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
    if (isRetailToken && retailToken) {
      setLocation(tokenPaymentPath(retailToken, transaction?.splitEnabled ? "split" : "entry"));
      return;
    }
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

  const customLogoUrl: string | null = merchant?.customLogoUrl ?? invoiceData?.customLogoUrl ?? null;

  const displayPrice = overrideAmount ? overrideAmount : (transaction?.price || "0");
  const amountDisplay = money(Math.round(parseFloat(displayPrice) * 100) || 0);
  const itemName = transaction?.itemName || "";

  // Context line under the amount — per-vertical (mockups 2026-07-11).
  const subtitle: string | null = !isInvoice ? null
    : invoiceData?.vertical === "trades"
      ? (invoiceData.kind === "deposit"
          ? (invoiceData.quote
              ? (invoiceData.quote.depositType === "percent"
                  ? `${invoiceData.quote.depositValue}% deposit of ${money(invoiceData.quote.totalCents)}`
                  : `deposit of ${money(invoiceData.quote.totalCents)} total`)
              : "deposit payment")
          : invoiceData?.kind === "balance" ? "balance payment"
          : invoiceData?.kind === "recurring" ? "recurring payment"
          : null)
      : invoiceData?.kind === "rent"
        ? (invoiceData.frequency ? `${invoiceData.frequency} rent payment` : "rent payment")
        : (invoiceData?.chargeType ?? null);

  const openInvoiceDocument = () => {
    if (isInvoice && invoiceData?.kind === "charge" && invoiceData?.documentUrl) {
      window.open(invoiceData.documentUrl, "_blank", "noopener,noreferrer");
    }
  };

  const openExternalBrowser = () => {
    const currentUrl = window.location.href;
    if (inAppEnv.isAndroid) {
      window.location.href = "intent://" + currentUrl.replace(/^https?:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;end";
      return;
    }
    if (inAppEnv.isIOS) {
      window.open(currentUrl, "_blank", "noopener,noreferrer");
    }
  };

  const copyPaymentLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      if (linkCopiedTimerRef.current) clearTimeout(linkCopiedTimerRef.current);
      linkCopiedTimerRef.current = setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  // Trades quote mode owns the phase from quote resolution through acceptance.
  // The accepted invoice token then falls through to this same payment adapter.
  const inQuotePhase = quoteMode && !acceptedInvoiceToken;
  const inAcceptLoading = quoteMode && !!acceptedInvoiceToken
    && !invoiceError && !invoiceData?.alreadyPaid && (txLoading || !transaction);
  if (inQuotePhase || inAcceptLoading) {
    if (quoteError) {
      return (
        <CheckoutView
          kind="terminal"
          state="quote-unavailable"
          customLogoUrl={customLogoUrl}
          detail={(quoteError as Error).message || "This quote link doesn't exist or has expired."}
        />
      );
    }

    const status = quoteDeclined ? "declined" : quote?.status;
    if (status === "declined" || status === "expired") {
      return (
        <CheckoutView
          kind="terminal"
          state={status === "declined" ? "quote-declined" : "quote-expired"}
          customLogoUrl={customLogoUrl}
        />
      );
    }

    const loadingQuote = inQuotePhase && (quoteLoading || !quote);
    const title = quote?.lineItems?.[0]?.description || "Quote";
    const quoteAmount = money(quote?.totalCents ?? 0);
    const quoteSubtitle = quote?.depositEnabled
      ? (quote.depositType === "percent" ? quote.depositValue + "% deposit required" : "deposit required")
      : "quote total";

    return (
      <CheckoutView
        kind="quote"
        customLogoUrl={customLogoUrl}
        loading={loadingQuote}
        accepting={inAcceptLoading}
        responding={quoteResponding}
        step={quoteStep}
        title={title}
        amount={quoteAmount}
        subtitle={quoteSubtitle}
        error={quoteRespondError}
        onPrimary={() => {
          if (quoteStep === "view") {
            openQuotePdf();
            setQuoteStep("confirm");
          } else {
            respondToQuote(true);
          }
        }}
        onViewQuote={openQuotePdf}
        onDecline={() => respondToQuote(false)}
      />
    );
  }

  if (isInvoice && invoiceError) {
    return (
      <CheckoutView
        kind="terminal"
        state={(invoiceError as Error).message === "voided" ? "link-cancelled" : "link-not-found"}
        customLogoUrl={customLogoUrl}
      />
    );
  }

  if (isInvoice && invoiceData?.alreadyPaid) {
    return <CheckoutView kind="terminal" state="already-paid" customLogoUrl={customLogoUrl} />;
  }

  if (isRetailToken && tokenPaymentError) {
    return <CheckoutView kind="terminal" state="payment-link-not-found" customLogoUrl={customLogoUrl} />;
  }

  if (isRetailToken && (tokenPayment?.closed || ["failed", "cancelled"].includes(tokenPayment?.status))) {
    return <CheckoutView kind="terminal" state="payment-link-closed" customLogoUrl={customLogoUrl} />;
  }

  if (isRetailToken && tokenPayment?.status === "processing" && !tokenHasLocalAttempt) {
    return <CheckoutView kind="terminal" state="payment-in-progress" customLogoUrl={customLogoUrl} />;
  }

  if (isRetailToken && ["completed", "partially_refunded", "refunded"].includes(tokenPayment?.status)) {
    return (
      <CheckoutView
        kind="terminal"
        state="payment-confirmed"
        customLogoUrl={customLogoUrl}
        splitPayment={!!tokenPayment?.isSplit}
      />
    );
  }

  if (!quoteMode && (!payId || (!txLoading && !transaction))) {
    return <CheckoutView kind="invalid" />;
  }

  if (txLoading || !transaction) {
    return <CheckoutView kind="loading" />;
  }

  if (payState === "success") {
    return (
      <CheckoutView
        kind="terminal"
        state="payment-success"
        customLogoUrl={customLogoUrl}
        invoicePayment={isInvoice}
      />
    );
  }

  const isProcessing = payState === "processing";
  const isError = payState === "error";

  return (
    <CheckoutView
      kind="payment"
      customLogoUrl={customLogoUrl}
      itemName={itemName}
      amount={amountDisplay}
      subtitle={subtitle}
      isInvoice={isInvoice}
      invoiceDocumentAvailable={!!(isInvoice && invoiceData?.kind === "charge" && invoiceData?.documentUrl)}
      splitEnabled={!!invoiceData?.splitEnabled}
      splitActive={splitActive}
      splitChoosing={splitChoosing}
      splitBusy={splitBusy}
      splitCount={splitCount}
      splitPaid={splitPaid}
      payerEmail={payerEmail}
      inAppBrowser={inAppEnv.isInApp}
      inAppIOS={inAppEnv.isIOS}
      inAppAndroid={inAppEnv.isAndroid}
      linkCopied={linkCopied}
      applePayAvailable={applePayAvailable}
      googlePayAvailable={googlePayAvailable}
      cardOpen={cardOpen}
      cardReady={hfReady}
      status={isError ? "error" : isProcessing ? "processing" : "idle"}
      errorMessage={errorMsg}
      onViewInvoice={openInvoiceDocument}
      onStartSplit={() => setSplitChoosing(true)}
      onCancelSplit={() => setSplitChoosing(false)}
      onChooseSplit={setupSplit}
      onPayerEmailChange={setPayerEmail}
      onOpenExternalBrowser={openExternalBrowser}
      onCopyLink={copyPaymentLink}
      onApplePay={handleApplePay}
      onGooglePay={handleGooglePay}
      onToggleCard={() => {
        if (!isProcessing) setCardOpen((open) => !open);
      }}
      onCardPay={handleCardPay}
      onRetry={handleRetry}
      onCancel={handleCancel}
    />
  );
}

export default function Checkout({ sourceKind = "retail-legacy" }: { sourceKind?: CheckoutRouteKind }) {
  return (
    <CheckoutErrorBoundary>
      <CheckoutInner sourceKind={sourceKind} />
    </CheckoutErrorBoundary>
  );
}
