import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, Camera, Moon, RefreshCw, Wifi, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen bg-[#3d3d3d] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        
        {/* Amount Display */}
        <div className="bg-gradient-to-br from-green-400 to-green-500 rounded-[2rem] p-8 shadow-2xl">
          <div className="flex items-center justify-center">
            <span className="text-5xl font-bold text-gray-900">
              ${currentTransaction ? currentTransaction.amount : amount}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-[#505050] rounded-3xl p-4 flex justify-around items-center shadow-xl">
          <button
            onClick={() => {
              if (currentTransaction?.qrCodeUrl) {
                window.open(currentTransaction.qrCodeUrl, '_blank');
              }
            }}
            className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
            data-testid="button-download-qr"
          >
            <Download className="w-6 h-6 text-gray-900" />
          </button>
          
          <button
            onClick={() => {
              toast({
                title: "Camera",
                description: "Scan QR code feature",
              });
            }}
            className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
            data-testid="button-camera"
          >
            <Camera className="w-6 h-6 text-gray-900" />
          </button>
          
          <button
            onClick={() => {
              document.documentElement.classList.toggle('dark');
            }}
            className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
            data-testid="button-theme"
          >
            <Moon className="w-6 h-6 text-gray-900" />
          </button>
          
          <button
            onClick={() => handleCreatePayment()}
            disabled={!!currentTransaction && ['pending', 'processing'].includes(currentTransaction.status)}
            className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-refresh"
          >
            <RefreshCw className="w-6 h-6 text-gray-900" />
          </button>
        </div>

        {/* Status Display */}
        <div className="bg-[#1a1a1a] rounded-3xl p-8 shadow-xl">
          <div className="flex flex-col items-center space-y-4">
            <span className={`text-xl font-semibold ${status.color}`}>
              {status.text}
            </span>
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <Wifi className="w-8 h-8 text-green-400 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Payment Stones Button */}
        <button
          onClick={() => setShowStones(!showStones)}
          className="w-full bg-transparent border-4 border-green-500 rounded-full py-4 px-6 flex items-center justify-between hover:bg-green-500/10 transition-all shadow-lg"
          data-testid="button-payment-stones"
        >
          <span className="text-white font-semibold text-lg flex-1 text-center">
            payment stones
          </span>
          <ChevronDown className={`w-6 h-6 text-green-500 transition-transform ${showStones ? 'rotate-180' : ''}`} />
        </button>

        {/* Stones Dropdown */}
        {showStones && taptStones.length > 0 && (
          <div className="bg-[#505050] rounded-3xl p-4 space-y-2 shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
            {taptStones.map((stone) => (
              <button
                key={stone.id}
                onClick={() => {
                  window.open(stone.paymentUrl, '_blank');
                  setShowStones(false);
                }}
                className="w-full bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500 rounded-2xl py-3 px-4 text-green-400 font-medium transition-all"
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
            className="w-full bg-transparent border-4 border-red-500 rounded-full py-4 px-6 hover:bg-red-500/10 transition-all shadow-lg disabled:opacity-50"
            data-testid="button-cancel"
          >
            <span className="text-red-400 font-semibold text-lg">
              cancel payment
            </span>
          </button>
        )}

        {/* Amount Input (hidden only when transaction is pending/processing) */}
        {(!currentTransaction || !['pending', 'processing'].includes(currentTransaction.status)) && (
          <div className="bg-[#505050] rounded-3xl p-6 shadow-xl">
            <label className="block text-green-400 text-sm font-semibold mb-2">
              Enter Amount
            </label>
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              className="w-full bg-[#1a1a1a] border-2 border-green-500 rounded-2xl py-3 px-4 text-white text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="0.00"
              data-testid="input-amount"
            />
          </div>
        )}

      </div>
    </div>
  );
}
