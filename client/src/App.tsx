import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MerchantTerminalMobile from "@/pages/merchant-terminal-mobile";
import CustomerPayment from "@/pages/customer-payment";
import Receipt from "@/pages/receipt";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings-simple";
import Transactions from "@/pages/transactions";
import NFCPayment from "@/pages/nfc-payment";


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

import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      const token = localStorage.getItem("authToken");
      if (!token) {
        setIsChecking(false);
        setLocation("/");
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
          setLocation("/");
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
        setLocation("/");
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
          setLocation("/");
        }
      } catch (error) {
        localStorage.removeItem("adminAuthToken");
        localStorage.removeItem("adminUser");
        setIsAuthenticated(false);
        setLocation("/");
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
        <Route path="/" component={Login} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={MerchantSignup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/merchant">
          <ProtectedRoute>
            <MerchantTerminalMobile />
          </ProtectedRoute>
        </Route>
        <Route path="/dashboard">
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/settings">
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/transactions">
          <ProtectedRoute>
            <Transactions />
          </ProtectedRoute>
        </Route>
        <Route path="/nfc">
          <ProtectedRoute>
            <NFCPayment />
          </ProtectedRoute>
        </Route>

        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/dashboard">
          <AdminProtectedRoute>
            <AdminDashboard />
          </AdminProtectedRoute>
        </Route>
        
        <Route path="/admin/revenue">
          <AdminProtectedRoute>
            <AdminRevenue />
          </AdminProtectedRoute>
        </Route>
        
        <Route path="/admin/merchants/:merchantId">
          <AdminProtectedRoute>
            <AdminMerchantDetail />
          </AdminProtectedRoute>
        </Route>
        
        <Route path="/admin/create-merchant">
          <AdminProtectedRoute>
            <CreateMerchant />
          </AdminProtectedRoute>
        </Route>
        
        <Route path="/admin/api">
          <AdminProtectedRoute>
            <AdminApi />
          </AdminProtectedRoute>
        </Route>
        
        <Route path="/verify-merchant" component={VerifyMerchant} />
        <Route path="/pay/:merchantId" component={CustomerPayment} />
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
