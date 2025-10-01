import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, Camera, Moon, RefreshCw, Wifi, ChevronDown, Menu, X, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedBrandBackground } from "@/components/backgrounds/AnimatedBrandBackground";
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";

interface Merchant {
  id: number;
  name: string;
  businessName: string;
  email: string;
}

interface Transaction {
  id: number;
  merchantId: number;
  amount: string;
  currency: string;
  status: string;
  qrCodeUrl?: string;
  paymentUrl?: string;
}

interface TaptStone {
  id: number;
  merchantId: number;
  name: string;
  stoneNumber: number;
  qrCodeUrl: string;
  paymentUrl: string;
  isActive: boolean;
}

export default function DemoTerminal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("15.99");
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);
  const [showStones, setShowStones] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Get current user/merchant
  const { data: user } = useQuery<{ user: { merchantId: number } }>({
    queryKey: ["/api/auth/me"],
  });

  const merchantId = user?.user?.merchantId;

  // Fetch merchant data
  const { data: merchant } = useQuery<Merchant>({
    queryKey: [`/api/merchants/${merchantId}`],
    enabled: !!merchantId,
  });

  // Fetch active transaction
  const { data: activeTransaction } = useQuery<Transaction>({
    queryKey: [`/api/merchants/${merchantId}/active-transaction`],
    enabled: !!merchantId,
    refetchInterval: 5000,
  });

  // Fetch tapt stones
  const { data: taptStones = [] } = useQuery<TaptStone[]>({
    queryKey: [`/api/merchants/${merchantId}/tapt-stones`],
    enabled: !!merchantId,
  });

  // Update current transaction when active transaction changes
  useEffect(() => {
    if (activeTransaction) {
      setCurrentTransaction(activeTransaction);
    }
  }, [activeTransaction]);

  // SSE connection for real-time updates
  useEffect(() => {
    if (!merchantId) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    const eventSource = new EventSource(
      `/api/merchants/${merchantId}/events?token=${encodeURIComponent(token)}`
    );

    eventSource.onopen = () => {
      console.log(`SSE connected for merchant ${merchantId}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "transaction_update" && data.transaction) {
          setCurrentTransaction(data.transaction);
          queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
          
          // Clear transaction if it's completed/failed/cancelled
          if (['completed', 'failed', 'cancelled'].includes(data.transaction.status)) {
            setTimeout(() => {
              setCurrentTransaction(null);
            }, 3000);
          }
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [merchantId]);

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: async () => {
      if (!merchantId) throw new Error("No merchant ID");
      
      const response = await apiRequest("POST", "/api/transactions", {
        merchantId,
        amount: parseFloat(amount),
        currency: "NZD",
      });
      return response.json();
    },
    onSuccess: (transaction) => {
      setCurrentTransaction(transaction);
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
      toast({
        title: "Payment Created",
        description: `Awaiting payment of $${amount}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment",
        variant: "destructive",
      });
    },
  });

  // Cancel transaction mutation
  const cancelTransactionMutation = useMutation({
    mutationFn: async () => {
      if (!currentTransaction) return;
      const response = await apiRequest("POST", `/api/transactions/${currentTransaction.id}/cancel`, {});
      return response.json();
    },
    onSuccess: () => {
      setTimeout(() => {
        setCurrentTransaction(null);
      }, 2000);
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
      toast({
        title: "Payment Cancelled",
        description: "Transaction has been cancelled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel payment",
        variant: "destructive",
      });
    },
  });

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    setAmount(value);
  };

  const handleCreatePayment = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }
    createTransactionMutation.mutate();
  };

  const handleCancelPayment = () => {
    cancelTransactionMutation.mutate();
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setLocation("/login");
  };

  const getStatusDisplay = () => {
    if (!currentTransaction) return { text: "ready", color: "text-green-400" };
    
    switch (currentTransaction.status) {
      case "pending":
        return { text: "awaiting payment", color: "text-green-400" };
      case "processing":
        return { text: "processing", color: "text-yellow-400" };
      case "completed":
        return { text: "payment successful", color: "text-green-400" };
      case "failed":
        return { text: "payment failed", color: "text-red-400" };
      case "cancelled":
        return { text: "cancelled", color: "text-gray-400" };
      default:
        return { text: currentTransaction.status, color: "text-green-400" };
    }
  };

  const status = getStatusDisplay();

  return (
    <AnimatedBrandBackground
      backgroundColor="#1a1a1a"
      circleColor="#2d2d2d"
      largeCirclePosition="top-[-120px] right-[-120px]"
      smallCirclePosition="top-[200px] right-[250px]"
      extraLargeCirclePosition="bottom-[-120px] right-[-120px]"
      extraSmallCirclePosition="bottom-[200px] right-[250px]"
    >
      {/* Logo in top left corner */}
      <div className="fixed top-6 left-6 z-50">
        <img 
          src={taptLogoPath} 
          alt="Tapt Logo" 
          className="h-12 w-auto drop-shadow-lg"
        />
      </div>

      {/* Menu icon in top right corner */}
      <div className="fixed top-6 right-6 z-50">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 shadow-lg"
          data-testid="button-menu"
        >
          {menuOpen ? <X className="w-6 h-6 text-gray-900" /> : <Menu className="w-6 h-6 text-gray-900" />}
        </button>
      </div>

      {/* Slide-over Menu */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-white/20 shadow-xl transform transition-transform duration-300 z-40 ${
        menuOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="p-6 pt-20">
          <nav className="space-y-4">
            <Link href="/merchant" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Terminal
            </Link>
            <Link href="/crypto-terminal" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-orange-400 rounded-xl hover:bg-orange-950/30 transition-colors font-medium">
              Crypto Terminal
            </Link>
            <Link href="/demo-terminal" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-green-400 rounded-xl hover:bg-green-950/30 transition-colors font-medium">
              Demo Terminal
            </Link>
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/transactions" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Transactions
            </Link>
            <Link href="/stock" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Stock
            </Link>
            <Link href="/settings" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Settings
            </Link>
            <div className="pt-4 mt-4 border-t border-white/20">
              <button 
                onClick={handleLogout}
                className="flex items-center w-full text-left py-3 px-4 text-red-400 hover:bg-red-950/30 rounded-xl transition-colors font-medium"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Content with slide-over effect */}
      <div className={`relative transition-transform duration-300 ${menuOpen ? '-translate-x-80' : 'translate-x-0'}`}>
        <div className="min-h-screen flex items-center justify-center p-3 sm:p-8 pt-24 sm:pt-32">
        <div className="w-full max-w-4xl space-y-4 sm:space-y-8">
        
        {/* Amount Display */}
        <div className="bg-gradient-to-br from-green-400 to-green-500 rounded-2xl sm:rounded-[2rem] p-6 sm:p-12 shadow-2xl relative z-10">
          <div className="flex items-center justify-center">
            <span className="text-4xl sm:text-7xl font-bold text-gray-900">
              ${currentTransaction ? currentTransaction.amount : amount}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-[#505050] rounded-2xl sm:rounded-3xl pt-16 sm:pt-28 pb-4 sm:pb-6 px-4 sm:px-8 -mt-16 sm:-mt-28 shadow-xl">
          <div className="flex justify-around items-center gap-2 sm:gap-4">
          <button
            onClick={() => {
              if (currentTransaction?.qrCodeUrl) {
                window.open(currentTransaction.qrCodeUrl, '_blank');
              }
            }}
            className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
            data-testid="button-download-qr"
          >
            <Download className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
          </button>
          
          <button
            onClick={() => {
              toast({
                title: "Camera",
                description: "Scan QR code feature",
              });
            }}
            className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
            data-testid="button-camera"
          >
            <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
          </button>
          
          <button
            onClick={() => {
              document.documentElement.classList.toggle('dark');
            }}
            className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
            data-testid="button-theme"
          >
            <Moon className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
          </button>
          
          <button
            onClick={() => handleCreatePayment()}
            disabled={!!currentTransaction && ['pending', 'processing'].includes(currentTransaction.status)}
            className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-refresh"
          >
            <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
          </button>
        </div>
        </div>

        {/* Status Display */}
        <div className="bg-[#0f0f0f] rounded-2xl sm:rounded-3xl p-6 sm:p-12 shadow-xl">
          <div className="flex flex-col items-center space-y-3 sm:space-y-6">
            <span className={`text-lg sm:text-3xl font-semibold ${status.color}`}>
              {status.text}
            </span>
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500/20 flex items-center justify-center">
              <Wifi className="w-7 h-7 sm:w-10 sm:h-10 text-green-400 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Payment Stones Button */}
        <button
          onClick={() => setShowStones(!showStones)}
          className="w-full bg-[#6b6b6b] border-3 border-green-500 sm:border-0 rounded-full py-4 sm:py-6 px-6 sm:px-8 flex items-center justify-between hover:bg-green-500/10 transition-all shadow-lg"
          data-testid="button-payment-stones"
        >
          <span className="text-white font-semibold text-lg sm:text-2xl flex-1 text-center">
            payment stones
          </span>
          <ChevronDown className={`w-5 h-5 sm:w-7 sm:h-7 text-green-500 transition-transform ${showStones ? 'rotate-180' : ''}`} />
        </button>

        {/* Stones Dropdown */}
        {showStones && taptStones.length > 0 && (
          <div className="bg-[#505050] rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-3 sm:space-y-4 shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
            {taptStones.map((stone) => (
              <button
                key={stone.id}
                onClick={() => {
                  window.open(stone.paymentUrl, '_blank');
                  setShowStones(false);
                }}
                className="w-full bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500 rounded-xl sm:rounded-2xl py-3 sm:py-5 px-4 sm:px-6 text-green-400 font-medium text-base sm:text-lg transition-all"
                data-testid={`button-stone-${stone.id}`}
              >
                {stone.name} - Stone {stone.stoneNumber}
              </button>
            ))}
          </div>
        )}

        {/* Cancel Button */}
        {currentTransaction && currentTransaction.status === 'pending' && (
          <button
            onClick={handleCancelPayment}
            disabled={cancelTransactionMutation.isPending}
            className="w-full bg-[#6b6b6b] border-3 border-red-500 sm:border-0 rounded-full py-4 sm:py-6 px-6 sm:px-8 hover:bg-red-500/10 transition-all shadow-lg disabled:opacity-50"
            data-testid="button-cancel"
          >
            <span className="text-red-400 font-semibold text-lg sm:text-2xl">
              cancel payment
            </span>
          </button>
        )}

        {/* Amount Input (hidden only when transaction is pending/processing) */}
        {(!currentTransaction || !['pending', 'processing'].includes(currentTransaction.status)) && (
          <div className="bg-[#505050] rounded-2xl sm:rounded-3xl p-5 sm:p-10 shadow-xl">
            <label className="block text-green-400 text-base sm:text-lg font-semibold mb-3 sm:mb-4">
              Enter Amount
            </label>
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              className="w-full bg-[#1a1a1a] border-2 border-green-500 rounded-xl sm:rounded-2xl py-3 sm:py-5 px-4 sm:px-6 text-white text-xl sm:text-2xl font-semibold focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="0.00"
              data-testid="input-amount"
            />
          </div>
        )}

      </div>
    </div>
    </div>
    </AnimatedBrandBackground>
  );
}
