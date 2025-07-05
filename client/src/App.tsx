import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MerchantTerminal from "@/pages/merchant-terminal";
import CustomerPayment from "@/pages/customer-payment";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings";
import Login from "@/pages/login";
import { Layout } from "@/components/layout";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setIsChecking(false);
      setLocation("/");
      return;
    }
    
    setIsAuthenticated(true);
    setIsChecking(false);
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/merchant">
        <ProtectedRoute>
          <Layout>
            <MerchantTerminal />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Layout>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Layout>
            <Settings />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/pay/:merchantId" component={CustomerPayment} />
      <Route component={NotFound} />
    </Switch>
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
