import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationProvider } from "@/components/notification-system";
import NotFound from "@/pages/not-found";
import MerchantTerminalMobile from "@/pages/merchant-terminal-mobile";
import MerchantTerminal from "@/pages/merchant-terminal";
import DemoTerminal from "@/pages/demo-terminal";
import CustomerPayment from "@/pages/customer-payment";
import Receipt from "@/pages/receipt";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings";
import Transactions from "@/pages/transactions";
import NFCPayment from "@/pages/nfc-payment";

import Login from "@/pages/login";
import MerchantSignup from "@/pages/merchant-signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import NewAdminDashboard from "@/pages/admin/AdminDashboard";
import CreateMerchant from "@/pages/create-merchant";
import VerifyMerchant from "@/pages/verify-merchant";
import StockManagement from "@/pages/stock-management";
import { LandingPage } from "@/pages/landing-page";
import LegalPage from "@/pages/legal";
import SplitPayment from "@/pages/split-payment";
import PaymentResult from "@/pages/payment-result";
import Checkout from "@/pages/checkout";
import BoardBuilder from "@/pages/board-builder";

import { PageTransition } from "@/components/page-transition";
import { BottomNavigation } from "@/components/bottom-navigation";


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        setIsChecking(false);
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        setLocation(`/login?returnTo=${returnTo}`);
        return;
      }
      
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem("authToken");
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          setLocation(`/login?returnTo=${returnTo}`);
        }
      } catch (error) {
        console.log('Auth check failed, keeping existing token');
        setIsAuthenticated(true);
      }
      
      setIsChecking(false);
    };

    checkAuthStatus();
  }, [setLocation]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : null;
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

  if (isChecking) {
    return <div>Loading...</div>;
  }

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

function Router() {
  const [location] = useLocation();

  if (location === "/") {
    return (
      <>
        <GA4PageTracker />
        <LandingPage />
      </>
    );
  }

  return (
    <PageTransition>
      <GA4PageTracker />
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={MerchantSignup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/terminal">
          <ProtectedRoute>
            <DemoTerminal />
          </ProtectedRoute>
        </Route>
        <Route path="/dashboard">
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/settings">
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        </Route>
        <Route path="/transactions">
          <ProtectedRoute>
            <Transactions />
          </ProtectedRoute>
        </Route>
        <Route path="/stock">
          <ProtectedRoute>
            <StockManagement />
          </ProtectedRoute>
        </Route>
        <Route path="/nfc">
          <ProtectedRoute>
            <NFCPayment />
          </ProtectedRoute>
        </Route>
        <Route path="/board-builder">
          <ProtectedRoute>
            <BoardBuilder />
          </ProtectedRoute>
        </Route>
        
        {/* New Admin Portal with sub-routing */}
        <Route path="/admin" nest>
          <AdminProtectedRoute>
            <NewAdminDashboard />
          </AdminProtectedRoute>
        </Route>
        
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
    </PageTransition>
  );
}



function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NotificationProvider>
          <Toaster />
          <Router />
          <BottomNavigation />
        </NotificationProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
