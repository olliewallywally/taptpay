import { Switch, Route, useLocation } from "wouter";
import { createContext, useContext, useEffect, useState, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import "@/plugins/TaptPayPlugin";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationProvider } from "@/components/notification-system";

import { PageTransition } from "@/components/page-transition";
import { BottomNavigation } from "@/components/bottom-navigation";
import { TutorialPageBoundary, TutorialProvider } from "@/features/tutorial/tutorial";
import type { TutorialPageKey } from "@shared/tutorial";

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
const SplitPayment          = lazy(() => import("@/pages/split-payment"));
const PaymentResult         = lazy(() => import("@/pages/payment-result"));
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

/* Route chunks a signed-in merchant navigates between. Warmed one at a time
   during browser idle after first paint, so by the time they tap the dock the
   chunk is already cached and Suspense never shows the full-screen loader —
   the framer-motion page transition runs back-to-back instead. Vite dedupes
   these import() calls with the lazy() ones above (same module = same chunk).
   Ordered by likelihood of being the next tap. */
const PRELOAD_ROUTES: Array<() => Promise<unknown>> = [
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

/* Sequential (not Promise.all) so warming never competes with the page's own
   data fetches for bandwidth; each chunk waits for the next idle slice. */
function useRoutePreload(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let i = 0;
    const idle = (cb: () => void) =>
      "requestIdleCallback" in window
        ? (window as any).requestIdleCallback(cb, { timeout: 2000 })
        : setTimeout(cb, 250);
    const next = () => {
      if (stopped || i >= PRELOAD_ROUTES.length) return;
      PRELOAD_ROUTES[i++]()
        .catch(() => {}) // offline / chunk 404 — the lazy() route will surface it if actually visited
        .finally(() => idle(next));
    };
    // Head start for first paint + the auth check before saturating the pipe.
    const t = setTimeout(() => idle(next), 1000);
    return () => { stopped = true; clearTimeout(t); };
  }, [enabled]);
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#060D1F" }}>
      <div className="w-8 h-8 border-2 border-[#00DFC8] border-t-transparent rounded-full animate-spin" />
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

const AuthContext = createContext<{ auth: AuthData | null; isChecking: boolean }>({
  auth: null,
  isChecking: true,
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setAuth({ isAuthenticated: false });
      setIsChecking(false);
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (r.ok) {
          const data = await r.json();
          setAuth({
            isAuthenticated: true,
            merchantId: data?.user?.merchantId ?? null,
            role: data?.user?.role ?? null,
            onboardingCompleted: data?.user?.onboardingCompleted ?? null,
            gstRegistered: data?.user?.gstRegistered ?? false,
            tradeGstMode: data?.user?.tradeGstMode === "exclusive" ? "exclusive" : "inclusive",
          });
        } else {
          localStorage.removeItem("authToken");
          localStorage.removeItem("user");
          localStorage.removeItem("merchantId");
          setAuth({ isAuthenticated: false });
        }
      })
      .catch(() => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        localStorage.removeItem("merchantId");
        setAuth({ isAuthenticated: false });
      })
      .finally(() => setIsChecking(false));
  }, []);

  return <AuthContext.Provider value={{ auth, isChecking }}>{children}</AuthContext.Provider>;
}

function ProtectedRoute({ children, skipOnboardingCheck = false, tutorialPage }: {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
  tutorialPage?: TutorialPageKey;
}) {
  const [, setLocation] = useLocation();
  const { auth, isChecking } = useContext(AuthContext);

  useEffect(() => {
    if (isChecking || !auth) return;
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
  }, [isChecking, auth, skipOnboardingCheck, setLocation]);

  if (isChecking) return <PageLoader />;
  if (!auth?.isAuthenticated) return null;
  if (!skipOnboardingCheck && auth.merchantId && auth.role !== 'admin' && auth.onboardingCompleted === false) return null;

  return tutorialPage
    ? <TutorialPageBoundary pageKey={tutorialPage}>{children}</TutorialPageBoundary>
    : <>{children}</>;
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAdminAuth = async () => {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) {
        setIsAuthenticated(false);
        setIsChecking(false);
        window.location.href = "/login";
        return;
      }
      try {
        const response = await fetch("/api/admin/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem("adminAuthToken");
          localStorage.removeItem("adminUser");
          setIsAuthenticated(false);
          window.location.href = "/login";
        }
      } catch (error) {
        localStorage.removeItem("adminAuthToken");
        localStorage.removeItem("adminUser");
        setIsAuthenticated(false);
        window.location.href = "/login";
      }
      setIsChecking(false);
    };
    checkAdminAuth();
  }, []);

  if (isChecking) return <PageLoader />;
  return isAuthenticated ? <>{children}</> : null;
}

function GA4PageTracker() {
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'page_view', {
        page_path: location,
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

function Router() {
  const [location] = useLocation();

  if (location === "/") {
    return (
      <>
        <GA4PageTracker />
        {isPwaStandalone() ? <AppLogin /> : <LandingPage />}
      </>
    );
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
        <Switch location={transitionLocation}>
          <Route path="/"><LandingPage /></Route>
          <Route path="/info" component={InfoPage} />
          <Route path="/business-details" component={BusinessDetails} />
          <Route path="/check-email" component={CheckEmail} />
          <Route path="/confirm-email" component={ConfirmEmail} />
          <Route path="/login" component={Login} />
          <Route path="/signup" component={MerchantSignup} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/terminal">
            <ProtectedRoute tutorialPage="retail-terminal"><MerchantTerminalMobile /></ProtectedRoute>
          </Route>
          <Route path="/stack">
            <ProtectedRoute tutorialPage="retail-payment-stack"><PaymentStack /></ProtectedRoute>
          </Route>
          <Route path="/dashboard">
            <ProtectedRoute tutorialPage="retail-dashboard"><Dashboard /></ProtectedRoute>
          </Route>
          <Route path="/settings">
            <ProtectedRoute tutorialPage="settings"><Settings /></ProtectedRoute>
          </Route>
          <Route path="/transactions">
            <ProtectedRoute tutorialPage="retail-transactions"><Transactions /></ProtectedRoute>
          </Route>
          <Route path="/stock">
            <ProtectedRoute tutorialPage="retail-stock"><StockManagement /></ProtectedRoute>
          </Route>
          <Route path="/nfc">
            <ProtectedRoute tutorialPage="retail-nfc"><NFCPayment /></ProtectedRoute>
          </Route>
          <Route path="/board-builder">
            <ProtectedRoute tutorialPage="payment-board-builder"><BoardBuilder /></ProtectedRoute>
          </Route>
          <Route path="/smart-terminal" component={SmartTerminal} />
          {/* ── Property management section ── */}
          <Route path="/property">
            <ProtectedRoute tutorialPage="property-dashboard"><PropertyDashboard /></ProtectedRoute>
          </Route>
          <Route path="/property/tenants">
            <ProtectedRoute tutorialPage="property-tenants"><TenantDirectory /></ProtectedRoute>
          </Route>
          <Route path="/property/tenants/:id">
            <ProtectedRoute tutorialPage="property-tenant-profile"><TenantProfile /></ProtectedRoute>
          </Route>
          <Route path="/property/analytics">
            <ProtectedRoute tutorialPage="property-analytics"><PropertyAnalytics /></ProtectedRoute>
          </Route>
          <Route path="/property/terminal">
            <ProtectedRoute tutorialPage="property-terminal"><PropertyTerminal /></ProtectedRoute>
          </Route>
          {/* ── Trades section ── */}
          <Route path="/trades">
            <ProtectedRoute tutorialPage="trades-dashboard"><TradesDashboard /></ProtectedRoute>
          </Route>
          <Route path="/trades/clients">
            <ProtectedRoute tutorialPage="trades-clients"><TradesClientDirectory /></ProtectedRoute>
          </Route>
          <Route path="/trades/clients/:id">
            <ProtectedRoute tutorialPage="trades-client-profile"><TradesClientProfile /></ProtectedRoute>
          </Route>
          <Route path="/trades/analytics">
            <ProtectedRoute tutorialPage="trades-analytics"><TradesAnalytics /></ProtectedRoute>
          </Route>
          <Route path="/trades/terminal">
            <ProtectedRoute tutorialPage="trades-terminal"><TradesTerminal /></ProtectedRoute>
          </Route>
          <Route path="/trades/quote">
            <ProtectedRoute tutorialPage="trades-quote"><TradesQuoteBuilder /></ProtectedRoute>
          </Route>
          {/* Customer-facing quote acceptance → deposit/full payment, all on the
              branded Checkout card (quoteMode drives the animated 3-step flow). */}
          <Route path="/trades/quote/:token">{() => <Checkout quoteMode />}</Route>
          <Route path="/trades/recurring">
            <ProtectedRoute tutorialPage="trades-recurring"><TradesRecurring /></ProtectedRoute>
          </Route>
          {/* Public rent/charge checkout — no auth required. Uses the shared
              branded Checkout page (same UI as retail) via the invoice token. */}
          <Route path="/r/:token">{() => <Checkout />}</Route>
          <Route path="/onboarding">
            <ProtectedRoute skipOnboardingCheck={true}><MerchantOnboarding /></ProtectedRoute>
          </Route>
          <Route path="/admin" nest>
            <AdminProtectedRoute><NewAdminDashboard /></AdminProtectedRoute>
          </Route>
          <Route path="/app-login" component={AppLogin} />
          <Route path="/terms" component={LegalPage} />
          <Route path="/privacy" component={LegalPage} />
          <Route path="/pay/:merchantId" component={CustomerPayment} />
          <Route path="/pay/:merchantId/stone/:stoneId" component={CustomerPayment} />
          <Route path="/checkout/:transactionId">{() => <Checkout />}</Route>
          <Route path="/split/:transactionId" component={SplitPayment} />
          <Route path="/payment/result/:transactionId" component={PaymentResult} />
          <Route path="/receipt/:transactionId" component={Receipt} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      </>
      )}
    </PageTransition>
  );
}

function AppRoutes() {
  // Only warm app chunks for signed-in merchants — marketing visitors on the
  // landing page shouldn't download the entire app in the background.
  const { auth } = useContext(AuthContext);
  useRoutePreload(auth?.isAuthenticated === true);
  const tutorialEnabled = auth?.isAuthenticated === true && auth.role !== "admin" && !!auth.merchantId && auth.onboardingCompleted === true;
  return (
    <TutorialProvider enabled={tutorialEnabled}>
      <Router />
      <BottomNavigation />
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
