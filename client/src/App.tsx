import { Switch, Route, useLocation } from "wouter";
import { createContext, useCallback, useContext, useEffect, useState, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import "@/plugins/TaptPayPlugin";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationProvider } from "@/components/notification-system";

import { PageTransition } from "@/components/page-transition";
import { BottomNavigation } from "@/components/bottom-navigation";
import { TutorialPageBoundary, TutorialProvider } from "@/features/tutorial/tutorial";
import { useDeviceClass, type DeviceClass } from "@/hooks/use-device-class";
import { desktopChromeForLocation } from "@/lib/desktop-chrome-route";
import type { TutorialPageKey } from "@shared/tutorial";
import { redactCustomerPaymentAddress } from "@/lib/payment-addressing";

import { LandingPage } from "@/pages/landing-page";
import Login from "@/pages/login";
import AppLogin from "@/pages/app-login";
import MerchantSignup from "@/pages/merchant-signup";

const NotFound              = lazy(() => import("@/pages/not-found"));
const MerchantTerminalMobile = lazy(() => import("@/pages/merchant-terminal-mobile-v2"));
const PaymentStack           = lazy(() => import("@/pages/payment-stack"));
const MerchantTerminal      = lazy(() => import("@/pages/merchant-terminal"));
const DemoTerminal          = lazy(() => import("@/pages/demo-terminal"));
const CustomerPayment       = lazy(() => import("@/pages/customer-payment"));
const TokenPaymentEntry      = lazy(() => import("@/pages/token-payment"));
const Receipt               = lazy(() => import("@/pages/receipt"));
const Dashboard             = lazy(() => import("@/pages/dashboard"));
const Settings              = lazy(() => import("@/pages/settings"));
const Transactions          = lazy(() => import("@/pages/transactions"));
const NFCPayment            = lazy(() => import("@/pages/nfc-payment"));
const ForgotPassword        = lazy(() => import("@/pages/forgot-password"));
const ResetPassword         = lazy(() => import("@/pages/reset-password"));
const NewAdminDashboard     = lazy(() => import("@/pages/admin/AdminDashboard"));
const CreateMerchant        = lazy(() => import("@/pages/create-merchant"));
const StockManagement       = lazy(() => import("@/pages/stock-management"));
const LegalPage             = lazy(() => import("@/pages/legal"));
const InfoPage              = lazy(() => import("@/pages/info"));
const BusinessDetails       = lazy(() => import("@/pages/business-details"));
const CheckEmail            = lazy(() => import("@/pages/check-email"));
const ConfirmEmail          = lazy(() => import("@/pages/confirm-email"));
const MerchantOnboarding    = lazy(() => import("@/pages/merchant-onboarding"));
const AcceptInvite          = lazy(() => import("@/pages/accept-invite"));
const SplitPayment          = lazy(() => import("@/pages/split-payment"));
const PaymentResult         = lazy(() => import("@/pages/payment-result"));
const PaymentReturn         = lazy(() => import("@/pages/payment-return"));
const Checkout              = lazy(() => import("@/pages/checkout"));
const BoardBuilder          = lazy(() => import("@/pages/board-builder"));
const SmartTerminal         = lazy(() => import("@/components/SmartTransitions"));
const PropertyDashboard     = lazy(() => import("@/pages/property/property-dashboard"));
const TenantDirectory       = lazy(() => import("@/pages/property/tenant-directory"));
const TenantProfile         = lazy(() => import("@/pages/property/tenant-profile"));
const PropertyAnalytics     = lazy(() => import("@/pages/property/property-analytics"));
const PropertyTerminal      = lazy(() => import("@/pages/property/property-terminal"));
const TradesDashboard       = lazy(() => import("@/pages/trades/trades-dashboard"));
const TradesClientDirectory = lazy(() => import("@/pages/trades/client-directory"));
const TradesClientProfile   = lazy(() => import("@/pages/trades/client-profile"));
const TradesAnalytics       = lazy(() => import("@/pages/trades/trades-analytics"));
const TradesTerminal        = lazy(() => import("@/pages/trades/trades-terminal"));
const TradesQuoteBuilder    = lazy(() => import("@/pages/trades/quote-builder"));
const TradesRecurring       = lazy(() => import("@/pages/trades/recurring-schedules"));

// Tablet/desktop pages live in their own lazy chunks. Keep these as direct
// imports (rather than an eager barrel) so phones never download the second UI.
// The chrome is lazy for the same reason: it is mounted once above the router,
// but a static import would put the frame, shell, canvas and desktop.css in the
// entry chunk that phones also load.
const DesktopChrome           = lazy(() => import("@/desktop/DesktopChrome"));

/**
 * Suspense fallback for the desktop chrome and its page slot. Deliberately
 * empty: a lazy chunk resolving must never paint a spinner over chrome that is
 * already on screen — the incoming page's own cascade is the only motion the
 * user should see. Defined here rather than imported, so that reaching for the
 * fallback does not drag the desktop chunk into the entry bundle.
 *
 * Being empty makes it invisible to a probe watching for painted loaders, so it
 * carries a `data-testid` instead: a suspended page slot is worth *reporting*
 * (the chrome held, the page area went briefly blank) without failing a run, and
 * that is only distinguishable from a real flash if it can be seen.
 */
function DesktopPageFallback() {
  return <div data-testid="desktop-page-fallback" className="tapt-desktop-page-fallback" aria-hidden="true" />;
}

const DesktopRetailHome       = lazy(() => import("@/desktop/pages/retail-home"));
const DesktopRetailStock      = lazy(() => import("@/desktop/pages/retail-stock"));
const DesktopRetailTerminal   = lazy(() => import("@/desktop/pages/retail-terminal"));
const DesktopRetailAnalytics  = lazy(() => import("@/desktop/pages/retail-analytics"));
const DesktopRetailSettings   = lazy(() => import("@/desktop/pages/retail-settings"));
const DesktopPropertyHome      = lazy(() => import("@/desktop/pages/property-home"));
const DesktopPropertyClients   = lazy(() => import("@/desktop/pages/property-clients"));
const DesktopPropertyTerminal  = lazy(() => import("@/desktop/pages/property-terminal"));
const DesktopPropertyAnalytics = lazy(() => import("@/desktop/pages/property-analytics"));
const DesktopPropertySettings  = lazy(() => import("@/desktop/pages/property-settings"));
const DesktopTradesHome         = lazy(() => import("@/desktop/pages/trades-home"));
const DesktopTradesClients      = lazy(() => import("@/desktop/pages/trades-clients"));
const DesktopTradesTerminal     = lazy(() => import("@/desktop/pages/trades-terminal"));
const DesktopTradesAnalytics    = lazy(() => import("@/desktop/pages/trades-analytics"));
const DesktopTradesSettings     = lazy(() => import("@/desktop/pages/trades-settings"));
const DesktopLegacyPage         = lazy(() => import("@/desktop/DesktopLegacyPage"));

/* Route chunks a signed-in merchant navigates between. Warmed one at a time
   during browser idle after first paint, so by the time they tap the dock the
   chunk is already cached and Suspense never shows the full-screen loader —
   the framer-motion page transition runs back-to-back instead. Vite dedupes
   these import() calls with the lazy() ones above (same module = same chunk).
   Ordered by likelihood of being the next tap. */
const MOBILE_PRELOAD_ROUTES: Array<() => Promise<unknown>> = [
  () => import("@/pages/dashboard"),
  () => import("@/pages/merchant-terminal-mobile-v2"),
  () => import("@/pages/transactions"),
  () => import("@/pages/stock-management"),
  () => import("@/pages/settings"),
  () => import("@/pages/property/property-dashboard"),
  () => import("@/pages/property/tenant-directory"),
  () => import("@/pages/property/property-analytics"),
  () => import("@/pages/property/property-terminal"),
  () => import("@/pages/property/tenant-profile"),
  () => import("@/pages/trades/trades-dashboard"),
  () => import("@/pages/trades/client-directory"),
  () => import("@/pages/trades/trades-analytics"),
  () => import("@/pages/trades/trades-terminal"),
  () => import("@/pages/trades/client-profile"),
  () => import("@/pages/trades/quote-builder"),
  () => import("@/pages/trades/recurring-schedules"),
  () => import("@/pages/payment-stack"),
  () => import("@/pages/nfc-payment"),
];

const DESKTOP_PRELOAD_ROUTES: Array<() => Promise<unknown>> = [
  () => import("@/desktop/pages/retail-home"),
  () => import("@/desktop/pages/retail-stock"),
  () => import("@/desktop/pages/retail-terminal"),
  () => import("@/desktop/pages/retail-analytics"),
  () => import("@/desktop/pages/retail-settings"),
  () => import("@/desktop/pages/property-home"),
  () => import("@/desktop/pages/property-clients"),
  () => import("@/desktop/pages/property-terminal"),
  () => import("@/desktop/pages/property-analytics"),
  () => import("@/desktop/pages/property-settings"),
  () => import("@/desktop/pages/trades-home"),
  () => import("@/desktop/pages/trades-clients"),
  () => import("@/desktop/pages/trades-terminal"),
  () => import("@/desktop/pages/trades-analytics"),
  () => import("@/desktop/pages/trades-settings"),
  () => import("@/desktop/DesktopLegacyPage"),
];

/* Sequential (not Promise.all) so warming never competes with the page's own
   data fetches for bandwidth; each chunk waits for the next idle slice. */
function useRoutePreload(enabled: boolean, deviceClass: DeviceClass) {
  useEffect(() => {
    if (!enabled) return;
    const routes = deviceClass === "mobile" ? MOBILE_PRELOAD_ROUTES : DESKTOP_PRELOAD_ROUTES;
    let stopped = false;
    let i = 0;
    const idle = (cb: () => void) =>
      "requestIdleCallback" in window
        ? (window as any).requestIdleCallback(cb, { timeout: 2000 })
        : setTimeout(cb, 250);
    const next = () => {
      if (stopped || i >= routes.length) return;
      routes[i++]()
        .catch(() => {}) // offline / chunk 404 — the lazy() route will surface it if actually visited
        .finally(() => idle(next));
    };
    // Head start for first paint + the auth check before saturating the pipe.
    const t = setTimeout(() => idle(next), 1000);
    return () => { stopped = true; clearTimeout(t); };
  }, [deviceClass, enabled]);
}

/**
 * The route-level full-screen loader, for mobile and public routes.
 *
 * `data-testid` marks it as exactly that: the transition probes gate on this
 * element appearing, and must not confuse it with a page's own content spinner,
 * which shares the `animate-spin` utility class but covers nothing.
 */
function PageLoader() {
  return (
    <div data-testid="page-loader" className="min-h-screen flex items-center justify-center" style={{ background: "#060D1F" }}>
      <div className="w-8 h-8 border-2 border-[#00DFC8] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/**
 * The recovery screen for "we could not find out whether you are signed in".
 *
 * Deliberately built from nothing: no lazy chunk, no shared component, no data
 * of its own. It is shown precisely when the backend is failing, which is the
 * worst possible moment to depend on it for anything.
 */
function AuthUnavailable({ detail, isRetrying, onRetry, onSignOut }: {
  detail: string | null;
  isRetrying: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <div
      data-testid="auth-unavailable"
      role="alert"
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "#060D1F" }}
    >
      <div className="w-full max-w-sm text-center">
        <h1 className="text-white text-lg font-semibold">We couldn't check your session</h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "#9AA7C2" }}>
          {detail ?? "Something went wrong on our side."}
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "#9AA7C2" }}>
          You have not been signed out — your sign-in is still saved on this device.
        </p>
        <button
          type="button"
          data-testid="auth-unavailable-retry"
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-6 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
          style={{ background: "#00DFC8", color: "#04121F" }}
        >
          {isRetrying ? "Trying again…" : "Try again"}
        </button>
        <button
          type="button"
          data-testid="auth-unavailable-signout"
          onClick={onSignOut}
          className="mt-3 w-full rounded-xl py-3 text-sm font-medium"
          style={{ border: "1px solid rgba(255,255,255,0.18)", color: "#9AA7C2" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// Auth is checked ONCE at app load and cached here. ProtectedRoute reads from
// this context so navigating between protected routes never shows a loader or
// makes a redundant API call — both of which would destroy page transitions.
type AuthData = {
  isAuthenticated: boolean;
  merchantId?: string | null;
  role?: string | null;
  onboardingCompleted?: boolean | null;
  gstRegistered?: boolean;
  tradeGstMode?: "inclusive" | "exclusive";
};

/**
 * `checking`     — the session check is in flight. Always bounded; see below.
 * `resolved`     — we know. `auth.isAuthenticated` is the answer.
 * `unavailable`  — we could not find out. The stored credentials have NOT been
 *                  touched, because nothing has disproved them.
 *
 * The third state is the whole point: without it, "the backend is broken" had
 * to be squeezed into "signed out", which silently destroyed live sessions
 * during an outage.
 */
type AuthPhase = "checking" | "resolved" | "unavailable";

type AuthContextValue = {
  auth: AuthData | null;
  phase: AuthPhase;
  /** Why we could not check, for the recovery screen. Null unless unavailable. */
  detail: string | null;
  isRetrying: boolean;
  retry: () => void;
  signOut: () => void;
};

// Exported (with AuthProvider and ProtectedRoute below) so the outage
// behaviour can be tested directly — these bounds are only worth anything if
// something proves they hold.
export const AuthContext = createContext<AuthContextValue>({
  auth: null,
  phase: "checking",
  detail: null,
  isRetrying: false,
  retry: () => {},
  signOut: () => {},
});

/* ── Bounds on every session check ────────────────────────────────────────────
   `fetch` has no default timeout: a backend that accepts the connection and
   then never answers hands back a promise that never settles. That is exactly
   how this app once pinned itself on a full-screen loader with no way out.
   Every number below exists to make an unbounded wait unrepresentable —
   each attempt is aborted, the attempts are counted, and one deadline covers
   the entire sequence including the gaps between attempts.
   Invariant (asserted in the tests): the worst-case attempt sequence finishes
   inside the deadline, so the deadline is a backstop and not the normal exit. */
export const AUTH_ATTEMPT_TIMEOUT_MS = 4000;
export const AUTH_MAX_ATTEMPTS = 3;
export const AUTH_RETRY_DELAYS_MS = [300, 900];
export const AUTH_TOTAL_DEADLINE_MS = 14000;

type ProbeOutcome<T> =
  /** The server answered and the session is good. */
  | { kind: "ok"; value: T }
  /** The server looked at the credentials and refused them. 401/403 only. */
  | { kind: "rejected" }
  /** We learned nothing about the credentials. Never a reason to discard them. */
  | { kind: "unavailable"; detail: string; retryable: boolean };

type SessionResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "rejected" }
  | { kind: "unavailable"; detail: string };

function unreachableDetail(): string {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "Your device looks offline. Check your connection and try again."
    : "The server didn't respond in time.";
}

/**
 * Runs `probe` until it produces a definite answer, or until the bounds above
 * are spent — whichever comes first. `onResult` is called exactly once, with a
 * result that is never "still waiting".
 *
 * Returns a cancel function: after it runs, `onResult` can no longer fire, so
 * an unmounted consumer is never updated.
 */
function startBoundedSessionCheck<T>(
  probe: (signal: AbortSignal) => Promise<ProbeOutcome<T>>,
  onResult: (result: SessionResult<T>) => void,
): () => void {
  let settled = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const inFlight = new Set<AbortController>();

  const stopEverything = () => {
    timers.forEach(clearTimeout);
    timers.clear();
    inFlight.forEach((controller) => controller.abort());
    inFlight.clear();
  };

  // The single exit. First definite answer wins and cancels everything else, so
  // no straggler can revive the check or contradict the state it produced.
  const settle = (result: SessionResult<T>) => {
    if (settled) return;
    settled = true;
    stopEverything();
    onResult(result);
  };

  const after = (ms: number, run: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!settled) run();
    }, ms);
    timers.add(id);
    return id;
  };

  // The backstop. Nothing below is trusted to finish on its own: if the attempt
  // sequence is somehow still running when this fires, the check ends here in a
  // visible error rather than an open-ended spinner.
  after(AUTH_TOTAL_DEADLINE_MS, () => settle({ kind: "unavailable", detail: unreachableDetail() }));

  const attempt = async (n: number): Promise<void> => {
    const controller = new AbortController();
    inFlight.add(controller);
    // Covers the whole attempt, response body included — a half-sent body is
    // just as good at hanging as a request that is never answered.
    const abortAt = after(AUTH_ATTEMPT_TIMEOUT_MS, () => controller.abort());

    let outcome: ProbeOutcome<T>;
    try {
      outcome = await probe(controller.signal);
    } catch {
      // Network error, DNS failure, offline, or our own abort firing. None of
      // these says anything about the credentials.
      outcome = { kind: "unavailable", detail: unreachableDetail(), retryable: true };
    } finally {
      clearTimeout(abortAt);
      timers.delete(abortAt);
      inFlight.delete(controller);
    }

    if (settled) return;
    if (outcome.kind !== "unavailable") {
      settle(outcome);
      return;
    }
    if (outcome.retryable && n < AUTH_MAX_ATTEMPTS) {
      const delay = AUTH_RETRY_DELAYS_MS[n - 1] ?? AUTH_RETRY_DELAYS_MS[AUTH_RETRY_DELAYS_MS.length - 1];
      after(delay, () => runAttempt(n + 1));
      return;
    }
    settle({ kind: "unavailable", detail: outcome.detail });
  };

  // Even an unforeseen throw ends in a definite state rather than a dangling
  // promise. `settle` is idempotent, so this can never overwrite a real answer.
  const runAttempt = (n: number) => {
    void attempt(n).catch(() => settle({ kind: "unavailable", detail: unreachableDetail() }));
  };

  runAttempt(1);
  return () => {
    settled = true;
    stopEverything();
  };
}

/**
 * One session probe. The classification here is the client half of the fix:
 * only 401/403 — the server having looked at the credentials and refused them —
 * counts as a rejection. Everything else is an outage of some kind, and an
 * outage must never cost the user their session.
 */
async function probeSession<T>(
  url: string,
  token: string,
  signal: AbortSignal,
  read: (payload: any) => T,
): Promise<ProbeOutcome<T>> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });

  if (response.status === 401 || response.status === 403) {
    return { kind: "rejected" };
  }

  if (response.ok) {
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      // A 200 we cannot parse is a proxy or a broken deploy talking, not a
      // verdict on the session.
      return { kind: "unavailable", detail: "The server sent a reply we couldn't read.", retryable: true };
    }
    return { kind: "ok", value: read(payload) };
  }

  if (response.status >= 500) {
    return {
      kind: "unavailable",
      detail: `The server is having trouble right now (error ${response.status}).`,
      retryable: true,
    };
  }

  // Any other 4xx — including the 404 the server now reserves for an account
  // that genuinely is not there. Asking again will not change it, and it is
  // still not a rejection of these credentials, so the user gets the recovery
  // screen with an explicit way to sign out.
  return {
    kind: "unavailable",
    detail: `The server couldn't confirm this session (error ${response.status}). Signing out and back in may fix it.`,
    retryable: false,
  };
}

function readStoredToken(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
    return null;
  }
}

function clearStoredSession(keys: string[]) {
  try {
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing to clear if storage is unreachable.
  }
}

const MERCHANT_SESSION_KEYS = ["authToken", "user", "merchantId"];
const ADMIN_SESSION_KEYS = ["adminAuthToken", "adminUser"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ phase: AuthPhase; auth: AuthData | null; detail: string | null }>({
    phase: "checking",
    auth: null,
    detail: null,
  });
  const [isRetrying, setIsRetrying] = useState(false);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const token = readStoredToken("authToken");
    if (!token) {
      setState({ phase: "resolved", auth: { isAuthenticated: false }, detail: null });
      setIsRetrying(false);
      return;
    }

    return startBoundedSessionCheck(
      (signal) =>
        probeSession(
          "/api/auth/me",
          token,
          signal,
          (data): AuthData => ({
            isAuthenticated: true,
            merchantId: data?.user?.merchantId ?? null,
            role: data?.user?.role ?? null,
            onboardingCompleted: data?.user?.onboardingCompleted ?? null,
            gstRegistered: data?.user?.gstRegistered ?? false,
            tradeGstMode: data?.user?.tradeGstMode === "exclusive" ? "exclusive" : "inclusive",
          }),
        ),
      (result) => {
        setIsRetrying(false);
        if (result.kind === "ok") {
          setState({ phase: "resolved", auth: result.value, detail: null });
          return;
        }
        if (result.kind === "rejected") {
          // The one and only place a failed check discards credentials.
          clearStoredSession(MERCHANT_SESSION_KEYS);
          setState({ phase: "resolved", auth: { isAuthenticated: false }, detail: null });
          return;
        }
        setState({ phase: "unavailable", auth: null, detail: result.detail });
      },
    );
  }, [runId]);

  // Re-runs the effect above, which is bounded, so a user hammering this button
  // can queue work but cannot produce an unbounded wait.
  const retry = useCallback(() => {
    setIsRetrying(true);
    setRunId((n) => n + 1);
  }, []);

  // Bumping runId as well as setting the state cancels any check still in
  // flight (the effect's cleanup), so a retry that lands after the user has
  // chosen to sign out cannot quietly sign them back in.
  const signOut = useCallback(() => {
    clearStoredSession(MERCHANT_SESSION_KEYS);
    setIsRetrying(false);
    setState({ phase: "resolved", auth: { isAuthenticated: false }, detail: null });
    setRunId((n) => n + 1);
  }, []);

  return (
    <AuthContext.Provider
      value={{ auth: state.auth, phase: state.phase, detail: state.detail, isRetrying, retry, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children, skipOnboardingCheck = false, tutorialPage }: {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
  tutorialPage?: TutorialPageKey;
}) {
  const [, setLocation] = useLocation();
  const { auth, phase, detail, isRetrying, retry, signOut } = useContext(AuthContext);

  useEffect(() => {
    // `unavailable` deliberately does not redirect. Bouncing to /login during an
    // outage hides the real fault behind a login form whose own requests are
    // failing too, and looks to the merchant like their account was deleted.
    if (phase !== "resolved" || !auth) return;
    if (!auth.isAuthenticated) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      setLocation(`/login?returnTo=${returnTo}`);
      return;
    }
    if (
      !skipOnboardingCheck &&
      auth.merchantId &&
      auth.role !== 'admin' &&
      auth.onboardingCompleted === false
    ) {
      setLocation("/onboarding");
    }
  }, [phase, auth, skipOnboardingCheck, setLocation]);

  if (phase === "unavailable") {
    return <AuthUnavailable detail={detail} isRetrying={isRetrying} onRetry={retry} onSignOut={signOut} />;
  }
  if (phase === "checking") return <PageLoader />;
  if (!auth?.isAuthenticated) return null;
  if (!skipOnboardingCheck && auth.merchantId && auth.role !== 'admin' && auth.onboardingCompleted === false) return null;

  return tutorialPage
    ? <TutorialPageBoundary pageKey={tutorialPage}>{children}</TutorialPageBoundary>
    : <>{children}</>;
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  // Same three-way split as the merchant provider, and for the same reason: the
  // old version awaited a `fetch` with no timeout and only cleared its loading
  // flag afterwards, so a hung backend left this on PageLoader indefinitely.
  const [state, setState] = useState<{ phase: AuthPhase | "signedOut"; detail: string | null }>({
    phase: "checking",
    detail: null,
  });
  const [isRetrying, setIsRetrying] = useState(false);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const token = readStoredToken("adminAuthToken");
    if (!token) {
      setState({ phase: "signedOut", detail: null });
      return;
    }

    return startBoundedSessionCheck(
      (signal) => probeSession("/api/admin/auth/me", token, signal, () => true),
      (result) => {
        setIsRetrying(false);
        if (result.kind === "ok") {
          setState({ phase: "resolved", detail: null });
          return;
        }
        if (result.kind === "rejected") {
          clearStoredSession(ADMIN_SESSION_KEYS);
          setState({ phase: "signedOut", detail: null });
          return;
        }
        setState({ phase: "unavailable", detail: result.detail });
      },
    );
  }, [runId]);

  useEffect(() => {
    if (state.phase === "signedOut") window.location.href = "/login";
  }, [state.phase]);

  const retry = useCallback(() => {
    setIsRetrying(true);
    setRunId((n) => n + 1);
  }, []);

  const signOut = useCallback(() => {
    clearStoredSession(ADMIN_SESSION_KEYS);
    setIsRetrying(false);
    setState({ phase: "signedOut", detail: null });
    setRunId((n) => n + 1);
  }, []);

  if (state.phase === "unavailable") {
    return <AuthUnavailable detail={state.detail} isRetrying={isRetrying} onRetry={retry} onSignOut={signOut} />;
  }
  if (state.phase === "checking") return <PageLoader />;
  return state.phase === "resolved" ? <>{children}</> : null;
}

function GA4PageTracker() {
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'page_view', {
        page_path: redactCustomerPaymentAddress(location),
        page_title: document.title,
      });
    }
  }, [location]);
  return null;
}

function isPwaStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

type MerchantMode = "retail" | "property" | "trades";

const RETAIL_MODE_PATHS = new Set(["/dashboard", "/stock", "/terminal", "/transactions"]);

function merchantModeForLocation(location: string): MerchantMode {
  if (location.startsWith("/property")) return "property";
  if (location.startsWith("/trades")) return "trades";
  if (RETAIL_MODE_PATHS.has(location)) return "retail";
  try {
    const stored = localStorage.getItem("taptMode");
    if (stored === "property" || stored === "trades" || stored === "retail") return stored;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return "retail";
}

function Router({ deviceClass }: { deviceClass: DeviceClass }) {
  const [location] = useLocation();
  const merchantMode = merchantModeForLocation(location);

  if (location === "/") {
    return (
      <>
        <GA4PageTracker />
        {isPwaStandalone() ? <AppLogin /> : <LandingPage />}
      </>
    );
  }

  /* Tablet/desktop app screens keep a persistent chrome and deliberately skip
     PageTransition: that wrapper keys a motion.div on the location, so the frame
     inside it was torn down and rebuilt on every hop, and its mode="wait" exit
     spends 220ms on a blank screen before the destination even mounts. Here the
     frame + header + nav stay mounted and only the page slot swaps — the
     incoming page's own cascade is the transition. */
  if (deviceClass !== "mobile") {
    const chromeRoute = desktopChromeForLocation(location, merchantMode);
    if (chromeRoute) {
      return (
        <>
          <GA4PageTracker />
          {/* Outer boundary covers only the chrome's own chunk on cold load;
              once resolved it stays mounted, so navigation never suspends here
              and the frame cannot blink between screens. */}
          <Suspense fallback={<DesktopPageFallback />}>
            <DesktopChrome deviceClass={deviceClass} route={chromeRoute}>
              <Suspense fallback={<DesktopPageFallback />}>
                {/* Keyed on the screen, not the raw location, so the cascade
                    replays whenever the user lands on a different screen but a
                    one-shot param (?quick=1) or an id segment does not throw away
                    a screen the user is already on. */}
                <RouteTable
                  key={`${chromeRoute.vertical}/${chromeRoute.page}`}
                  location={location}
                  deviceClass={deviceClass}
                  merchantMode={merchantMode}
                />
              </Suspense>
            </DesktopChrome>
          </Suspense>
        </>
      );
    }
  }

  return (
    <PageTransition>
      {/* Pin the Switch to the wrapper's location — matching from context would
          let the exiting page re-render as the destination during the exit
          animation (a double mount that eats one-shot params like ?quick=1). */}
      {(transitionLocation) => (
        <>
          <GA4PageTracker />
          <Suspense fallback={<PageLoader />}>
            <RouteTable
              location={transitionLocation}
              deviceClass={deviceClass}
              merchantMode={merchantMode}
            />
          </Suspense>
        </>
      )}
    </PageTransition>
  );
}

function RouteTable({
  location,
  deviceClass,
  merchantMode,
}: {
  location: string;
  deviceClass: DeviceClass;
  merchantMode: MerchantMode;
}) {
  return (
        <Switch location={location}>
          <Route path="/"><LandingPage /></Route>
          <Route path="/info" component={InfoPage} />
          <Route path="/business-details" component={BusinessDetails} />
          <Route path="/check-email" component={CheckEmail} />
          <Route path="/confirm-email" component={ConfirmEmail} />
          <Route path="/login" component={Login} />
          <Route path="/signup" component={MerchantSignup} />
          <Route path="/accept-invite" component={AcceptInvite} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/terminal">
            <ProtectedRoute tutorialPage="retail-terminal">
              {deviceClass === "mobile" ? <MerchantTerminalMobile /> : <DesktopRetailTerminal deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/stack">
            <ProtectedRoute tutorialPage="retail-payment-stack">
              {deviceClass === "mobile" ? <PaymentStack /> : <DesktopRetailTerminal deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/dashboard">
            <ProtectedRoute tutorialPage="retail-dashboard">
              {deviceClass === "mobile" ? <Dashboard /> : <DesktopRetailHome deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/settings">
            <ProtectedRoute tutorialPage="settings">
              {deviceClass === "mobile" ? <Settings />
                : merchantMode === "property" ? <DesktopPropertySettings deviceClass={deviceClass} />
                : merchantMode === "trades" ? <DesktopTradesSettings deviceClass={deviceClass} />
                : <DesktopRetailSettings deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/transactions">
            <ProtectedRoute tutorialPage="retail-transactions">
              {deviceClass === "mobile" ? <Transactions /> : <DesktopRetailAnalytics deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/stock">
            <ProtectedRoute tutorialPage="retail-stock">
              {deviceClass === "mobile" ? <StockManagement /> : <DesktopRetailStock deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/nfc">
            <ProtectedRoute tutorialPage="retail-nfc">
              {deviceClass === "mobile" ? <NFCPayment /> : <DesktopLegacyPage deviceClass={deviceClass} vertical="retail" page="terminal"><NFCPayment /></DesktopLegacyPage>}
            </ProtectedRoute>
          </Route>
          <Route path="/board-builder">
            <ProtectedRoute tutorialPage="payment-board-builder">
              {deviceClass === "mobile" ? <BoardBuilder /> : <DesktopLegacyPage deviceClass={deviceClass} vertical="retail" page="settings"><BoardBuilder /></DesktopLegacyPage>}
            </ProtectedRoute>
          </Route>
          <Route path="/smart-terminal" component={SmartTerminal} />
          {/* ── Property management section ── */}
          <Route path="/property">
            <ProtectedRoute tutorialPage="property-dashboard">
              {deviceClass === "mobile" ? <PropertyDashboard /> : <DesktopPropertyHome deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/property/tenants">
            <ProtectedRoute tutorialPage="property-tenants">
              {deviceClass === "mobile" ? <TenantDirectory /> : <DesktopPropertyClients deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/property/tenants/:id">
            <ProtectedRoute tutorialPage="property-tenant-profile">
              {deviceClass === "mobile" ? <TenantProfile /> : <DesktopLegacyPage deviceClass={deviceClass} vertical="property" page="directory"><TenantProfile /></DesktopLegacyPage>}
            </ProtectedRoute>
          </Route>
          <Route path="/property/analytics">
            <ProtectedRoute tutorialPage="property-analytics">
              {deviceClass === "mobile" ? <PropertyAnalytics /> : <DesktopPropertyAnalytics deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/property/terminal">
            <ProtectedRoute tutorialPage="property-terminal">
              {deviceClass === "mobile" ? <PropertyTerminal /> : <DesktopPropertyTerminal deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          {/* ── Trades section ── */}
          <Route path="/trades">
            <ProtectedRoute tutorialPage="trades-dashboard">
              {deviceClass === "mobile" ? <TradesDashboard /> : <DesktopTradesHome deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/trades/clients">
            <ProtectedRoute tutorialPage="trades-clients">
              {deviceClass === "mobile" ? <TradesClientDirectory /> : <DesktopTradesClients deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/trades/clients/:id">
            <ProtectedRoute tutorialPage="trades-client-profile">
              {deviceClass === "mobile" ? <TradesClientProfile /> : <DesktopLegacyPage deviceClass={deviceClass} vertical="trades" page="directory"><TradesClientProfile /></DesktopLegacyPage>}
            </ProtectedRoute>
          </Route>
          <Route path="/trades/analytics">
            <ProtectedRoute tutorialPage="trades-analytics">
              {deviceClass === "mobile" ? <TradesAnalytics /> : <DesktopTradesAnalytics deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/trades/terminal">
            <ProtectedRoute tutorialPage="trades-terminal">
              {deviceClass === "mobile" ? <TradesTerminal /> : <DesktopTradesTerminal deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          <Route path="/trades/quote">
            <ProtectedRoute tutorialPage="trades-quote">
              {deviceClass === "mobile" ? <TradesQuoteBuilder /> : <DesktopTradesTerminal deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          {/* Customer-facing quote acceptance → deposit/full payment, all on the
              branded Checkout card (quoteMode drives the animated 3-step flow). */}
          <Route path="/trades/quote/:token">{() => <Checkout sourceKind="quote-token" />}</Route>
          <Route path="/trades/recurring">
            <ProtectedRoute tutorialPage="trades-recurring">
              {deviceClass === "mobile" ? <TradesRecurring /> : <DesktopTradesTerminal deviceClass={deviceClass} />}
            </ProtectedRoute>
          </Route>
          {/* Public rent/charge checkout — no auth required. Uses the shared
              branded Checkout page (same UI as retail) via the invoice token. */}
          <Route path="/r/:token">{() => <Checkout sourceKind="invoice-token" />}</Route>
          <Route path="/onboarding">
            <ProtectedRoute skipOnboardingCheck={true}><MerchantOnboarding /></ProtectedRoute>
          </Route>
          <Route path="/admin" nest>
            <AdminProtectedRoute><NewAdminDashboard /></AdminProtectedRoute>
          </Route>
          <Route path="/app-login" component={AppLogin} />
          <Route path="/terms" component={LegalPage} />
          <Route path="/privacy" component={LegalPage} />
          {/* Bearer-token routes must precede every generic/numeric payment
              route so the credential stays in the address through receipt. */}
          <Route path="/pay/return/:state" component={PaymentReturn} />
          <Route path="/pay/t/:token" component={TokenPaymentEntry} />
          <Route path="/split/t/:token">{() => <SplitPayment sourceKind="retail-token" />}</Route>
          <Route path="/checkout/t/:token">{() => <Checkout sourceKind="retail-token" />}</Route>
          <Route path="/receipt/t/:token">{() => <Receipt sourceKind="retail-token" />}</Route>
          <Route path="/pay/:merchantId" component={CustomerPayment} />
          <Route path="/pay/:merchantId/stone/:stoneId" component={CustomerPayment} />
          <Route path="/checkout/:transactionId">{() => <Checkout sourceKind="retail-legacy" />}</Route>
          <Route path="/split/:transactionId">{() => <SplitPayment sourceKind="retail-legacy" />}</Route>
          <Route path="/payment/result/:transactionId" component={PaymentResult} />
          <Route path="/receipt/:transactionId">{() => <Receipt sourceKind="retail-legacy" />}</Route>
          <Route component={NotFound} />
        </Switch>
  );
}

function AppRoutes() {
  // Only warm app chunks for signed-in merchants — marketing visitors on the
  // landing page shouldn't download the entire app in the background.
  const { auth } = useContext(AuthContext);
  const deviceClass = useDeviceClass();
  useRoutePreload(auth?.isAuthenticated === true, deviceClass);
  const tutorialEnabled = auth?.isAuthenticated === true && auth.role !== "admin" && !!auth.merchantId && auth.onboardingCompleted === true;
  return (
    <TutorialProvider enabled={tutorialEnabled}>
      <Router deviceClass={deviceClass} />
      {deviceClass === "mobile" && <BottomNavigation />}
    </TutorialProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NotificationProvider>
          <AuthProvider>
            <Toaster />
            <AppRoutes />
          </AuthProvider>
        </NotificationProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
