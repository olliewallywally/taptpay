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
const VerifyMerchant        = lazy(() => import("@/pages/verify-merchant"));
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
const RentCheckout          = lazy(() => import("@/pages/property/rent-checkout"));
const PropertyTerminal      = lazy(() => import("@/pages/property/property-terminal"));

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

function ProtectedRoute({ children, skipOnboardingCheck = false }: { children: React.ReactNode; skipOnboardingCheck?: boolean }) {
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

  return <>{children}</>;
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
      <GA4PageTracker />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/info" component={InfoPage} />
          <Route path="/business-details" component={BusinessDetails} />
          <Route path="/check-email" component={CheckEmail} />
          <Route path="/confirm-email" component={ConfirmEmail} />
          <Route path="/login" component={Login} />
          <Route path="/signup" component={MerchantSignup} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/terminal">
            <ProtectedRoute><MerchantTerminalMobile /></ProtectedRoute>
          </Route>
          <Route path="/stack">
            <ProtectedRoute><PaymentStack /></ProtectedRoute>
          </Route>
          <Route path="/dashboard">
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          </Route>
          <Route path="/settings">
            <ProtectedRoute><Settings /></ProtectedRoute>
          </Route>
          <Route path="/transactions">
            <ProtectedRoute><Transactions /></ProtectedRoute>
          </Route>
          <Route path="/stock">
            <ProtectedRoute><StockManagement /></ProtectedRoute>
          </Route>
          <Route path="/nfc">
            <ProtectedRoute><NFCPayment /></ProtectedRoute>
          </Route>
          <Route path="/board-builder">
            <ProtectedRoute><BoardBuilder /></ProtectedRoute>
          </Route>
          <Route path="/smart-terminal" component={SmartTerminal} />
          {/* ── Property management section ── */}
          <Route path="/property">
            <ProtectedRoute><PropertyDashboard /></ProtectedRoute>
          </Route>
          <Route path="/property/tenants">
            <ProtectedRoute><TenantDirectory /></ProtectedRoute>
          </Route>
          <Route path="/property/tenants/:id">
            <ProtectedRoute><TenantProfile /></ProtectedRoute>
          </Route>
          <Route path="/property/analytics">
            <ProtectedRoute><PropertyAnalytics /></ProtectedRoute>
          </Route>
          <Route path="/property/terminal">
            <ProtectedRoute><PropertyTerminal /></ProtectedRoute>
          </Route>
          {/* Public rent checkout — no auth required */}
          <Route path="/r/:token" component={RentCheckout} />
          <Route path="/onboarding">
            <ProtectedRoute skipOnboardingCheck={true}><MerchantOnboarding /></ProtectedRoute>
          </Route>
          <Route path="/admin" nest>
            <AdminProtectedRoute><NewAdminDashboard /></AdminProtectedRoute>
          </Route>
          <Route path="/app-login" component={AppLogin} />
          <Route path="/terms" component={LegalPage} />
          <Route path="/privacy" component={LegalPage} />
          <Route path="/verify-merchant" component={VerifyMerchant} />
          <Route path="/pay/:merchantId" component={CustomerPayment} />
          <Route path="/pay/:merchantId/stone/:stoneId" component={CustomerPayment} />
          <Route path="/checkout/:transactionId" component={Checkout} />
          <Route path="/split/:transactionId" component={SplitPayment} />
          <Route path="/payment/result/:transactionId" component={PaymentResult} />
          <Route path="/receipt/:transactionId" component={Receipt} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </PageTransition>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NotificationProvider>
          <AuthProvider>
            <Toaster />
            <Router />
            <BottomNavigation />
          </AuthProvider>
        </NotificationProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
