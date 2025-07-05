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
import { QrCode, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

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
          <Home />
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
      <Route path="/pay/:merchantId" component={CustomerPayment} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Home() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-[hsl(210,20%,98%)]">
      {/* Navigation */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-800 rounded flex items-center justify-center">
                <QrCode className="text-white text-sm" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Tapt Payment Terminal</h1>
                {user && (
                  <p className="text-sm text-gray-600">Welcome back, {user.email}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <a 
                  href="/merchant"
                  className="px-4 py-2 text-sm font-medium rounded-md bg-white text-green-800 shadow-sm transition-all"
                >
                  Terminal
                </a>
                <a 
                  href="/dashboard"
                  className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900 transition-all"
                >
                  Dashboard
                </a>
                <a 
                  href="/settings"
                  className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900 transition-all"
                >
                  Settings
                </a>
                <a 
                  href="/pay/1"
                  className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900 transition-all"
                >
                  Customer View
                </a>
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="text-gray-600 hover:text-gray-900"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Default to merchant terminal */}
      <MerchantTerminal />
    </div>
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
