import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MerchantTerminalMobile from "@/pages/merchant-terminal-mobile";
import MerchantTerminal from "@/pages/merchant-terminal";
import CustomerPayment from "@/pages/customer-payment";
import Receipt from "@/pages/receipt";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings";
import Transactions from "@/pages/transactions";
import NFCPayment from "@/pages/nfc-payment";


import Landing from "@/pages/landing";
import Login from "@/pages/login";
import MerchantSignup from "@/pages/merchant-signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import AdminLogin from "@/pages/admin-login";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminMerchantDetail from "@/pages/admin-merchant";
import AdminRevenue from "@/pages/admin-revenue";
import AdminApi from "@/pages/admin-api";
import CreateMerchant from "@/pages/create-merchant";
import VerifyMerchant from "@/pages/verify-merchant";
import StockManagement from "@/pages/stock-management";

import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { Redirect } from "@/components/redirect";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        setIsChecking(false);
        window.location.href = "https://taptpay.online/login";
        return;
      }
      
      try {
        // Verify token with server to check if it's still valid
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          // Token is invalid, remove it and redirect to login
          localStorage.removeItem("authToken");
          window.location.href = "https://taptpay.online/login";
        }
      } catch (error) {
        // Network error or server down, keep token for now
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
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAdminAuth = async () => {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) {
        setIsAuthenticated(false);
        setIsChecking(false);
        window.location.href = "https://taptpay.online/admin";
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
          window.location.href = "https://taptpay.online/admin";
        }
      } catch (error) {
        localStorage.removeItem("adminAuthToken");
        localStorage.removeItem("adminUser");
        setIsAuthenticated(false);
        window.location.href = "https://taptpay.online/admin";
      }
      
      setIsChecking(false);
    };

    checkAdminAuth();
  }, [setLocation]);

  if (isChecking) {
    return <div>Loading...</div>;
  }

  return isAuthenticated ? <>{children}</> : null;
}

function Router() {
  return (
    <PageTransition>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login">
          <Redirect to="https://taptpay.online/login" />
        </Route>
        <Route path="/signup">
          <Redirect to="https://taptpay.online/signup" />
        </Route>
        <Route path="/forgot-password">
          <Redirect to="https://taptpay.online/forgot-password" />
        </Route>
        <Route path="/reset-password">
          <Redirect to="https://taptpay.online/reset-password" />
        </Route>
        <Route path="/app">
          <Redirect to="https://taptpay.online/login" />
        </Route>
        {/* Redirect all app routes to taptpay.online */}
        <Route path="/merchant">
          <Redirect to="https://taptpay.online/merchant" />
        </Route>
        <Route path="/merchant-terminal-mobile">
          <Redirect to="https://taptpay.online/merchant-terminal-mobile" />
        </Route>
        <Route path="/merchant-terminal">
          <Redirect to="https://taptpay.online/merchant-terminal" />
        </Route>
        <Route path="/terminal">
          <Redirect to="https://taptpay.online/terminal" />
        </Route>
        <Route path="/dashboard">
          <Redirect to="https://taptpay.online/dashboard" />
        </Route>
        <Route path="/settings">
          <Redirect to="https://taptpay.online/settings" />
        </Route>
        <Route path="/transactions">
          <Redirect to="https://taptpay.online/transactions" />
        </Route>
        <Route path="/stock">
          <Redirect to="https://taptpay.online/stock" />
        </Route>
        <Route path="/nfc">
          <Redirect to="https://taptpay.online/nfc" />
        </Route>

        <Route path="/admin">
          <Redirect to="https://taptpay.online/admin/login" />
        </Route>
        
        <Route path="/verify-merchant" component={VerifyMerchant} />
        <Route path="/pay/:merchantId" component={CustomerPayment} />
        <Route path="/pay/:merchantId/stone/:stoneId" component={CustomerPayment} />
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
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
