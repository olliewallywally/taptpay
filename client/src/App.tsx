import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MerchantTerminal from "@/pages/merchant-terminal";
import CustomerPayment from "@/pages/customer-payment";
import Dashboard from "@/pages/dashboard";
import { QrCode } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/merchant" component={MerchantTerminal} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/pay/:merchantId" component={CustomerPayment} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Home() {
  return (
    <div className="min-h-screen bg-[hsl(210,20%,98%)]">
      {/* Navigation */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[hsl(155,40%,25%)] rounded flex items-center justify-center">
                <QrCode className="text-white text-sm" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Scan to Pay Terminal</h1>
            </div>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <a 
                href="/merchant"
                className="px-4 py-2 text-sm font-medium rounded-md bg-white text-[hsl(155,40%,25%)] shadow-sm transition-all"
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
                href="/pay/1"
                className="px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900 transition-all"
              >
                Customer View
              </a>
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
