import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DigitalWalletButtons } from "@/components/digital-wallet-buttons";
import { BillSplit } from "@/components/bill-split";
import { sseClient } from "@/lib/sse-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, Lock, CheckCircle, XCircle } from "lucide-react";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

export default function CustomerPayment() {
  const { merchantId, stoneId } = useParams<{ merchantId: string; stoneId?: string }>();
  const [, setLocation] = useLocation();
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success" | "error">("idle");

  // Debug URL parsing
  const id = merchantId ? parseInt(merchantId) : null;
  const stoneNumber = stoneId ? parseInt(stoneId) : null;
  
  // Redirect if no valid merchantId
  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-red-600">Invalid Payment Link</h2>
          <p className="text-gray-600">Please use a valid payment link from your merchant.</p>
          <div className="text-sm text-gray-500 space-y-2">
            <p>Payment URLs should be in format: /pay/[merchant-id]</p>
            <p>Example: /pay/22 for merchant #22</p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
              <p className="text-yellow-800 font-medium">Note:</p>
              <p className="text-yellow-700 text-xs">
                If you're trying to access /pay/1, this merchant doesn't exist. 
                Please use the correct payment link provided by your merchant.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get active transaction - heavily optimized for speed
  const { data: activeTransaction, isLoading, error } = useQuery({
    queryKey: ["/api/merchants", id, "active-transaction"],
    queryFn: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
      
      try {
        const response = await fetch(`/api/merchants/${id}/active-transaction`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
    staleTime: 500, // Cache for 0.5 seconds only
    gcTime: 10000, // Shorter garbage collection time 
    refetchInterval: 2000, // Check every 2 seconds for faster updates
    refetchOnWindowFocus: false, // Disable to reduce unnecessary requests
    retry: 1, // Only retry once for faster failure
    retryDelay: 1000, // 1 second retry delay
  });

  // Remove debug logging for faster performance

  // Process payment mutation - optimized
  const processPaymentMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const response = await apiRequest("POST", `/api/transactions/${transactionId}/pay`, {});
      return response.json();
    },
    onSuccess: () => {
      setPaymentStatus("processing");
    },
    onError: () => {
      setPaymentStatus("error");
    },
  });

  // Highly optimized SSE connection
  useEffect(() => {
    if (!id) return;
    
    sseClient.connect(id);
    
    const handleTransactionUpdate = (message: any) => {
      // Batch state updates for better performance
      setCurrentTransaction(message.transaction);
      
      // Optimized cache invalidation - only when necessary
      if (message.transaction) {
        queryClient.setQueryData(["/api/merchants", id, "active-transaction"], message.transaction);
      }
      
      // Fast status updates without excessive branching
      const statusMap = {
        "pending": "idle",
        "processing": "processing", 
        "completed": "success"
      } as const;
      
      const newStatus = statusMap[message.transaction.status as keyof typeof statusMap];
      if (newStatus) {
        setPaymentStatus(newStatus);
        
        // Fast redirect for completed payments
        if (newStatus === "success") {
          setTimeout(() => setLocation(`/receipt/${message.transaction.id}`), 1500);
        }
      } else if (message.transaction.status === "failed") {
        setPaymentStatus("error");
      }
    };
    
    sseClient.subscribe("transaction_updated", handleTransactionUpdate);

    return () => {
      sseClient.unsubscribe("transaction_updated", handleTransactionUpdate);
      sseClient.disconnect();
    };
  }, [id]);

  // Update current transaction from query - optimized
  useEffect(() => {
    if (activeTransaction) {
      setCurrentTransaction(activeTransaction);
      if (activeTransaction.status === "pending") {
        setPaymentStatus("idle");
      }
    }
  }, [activeTransaction]);

  const handlePayment = () => {
    if (currentTransaction) {
      processPaymentMutation.mutate(currentTransaction.id);
    }
  };

  const renderPaymentStatus = () => {
    switch (paymentStatus) {
      case "processing":
        return (
          <div className="backdrop-blur-xl bg-blue-500/20 border border-blue-400/30 rounded-2xl p-4 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-blue-200 font-medium">Processing Payment...</p>
          </div>
        );
      case "success":
        return (
          <div className="backdrop-blur-xl bg-green-500/20 border border-green-400/30 rounded-2xl p-4 text-center">
            <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-green-200 font-medium">Payment Successful!</p>
            <p className="text-green-300/80 text-sm">Thank you for your purchase</p>
          </div>
        );
      case "error":
        return (
          <div className="backdrop-blur-xl bg-red-500/20 border border-red-400/30 rounded-2xl p-4 text-center">
            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-200 font-medium">Payment Failed</p>
            <p className="text-red-300/80 text-sm">Please try again or contact staff</p>
          </div>
        );
      default:
        return null;
    }
  };

  // Show loading skeleton while fetching
  if (isLoading || !currentTransaction) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        {/* Background Layer - Fixed */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: '#00D4D4' }}
        >
          {/* Desktop Only: Lava Lamp Blue Balls */}
          <div className="hidden md:block">
            {/* Lava Lamp Ball 1 - Large */}
            <div 
              className="absolute w-96 h-96 rounded-full animate-lava-lamp-1 bottom-[-100px] right-[-100px]"
              style={{ 
                backgroundColor: '#0000FF',
                willChange: 'transform',
              }}
            />
            
            {/* Lava Lamp Ball 2 - Medium */}
            <div 
              className="absolute w-80 h-80 rounded-full animate-lava-lamp-2 top-[-80px] left-[-80px]"
              style={{ 
                backgroundColor: '#0000FF',
                willChange: 'transform',
              }}
            />
            
            {/* Lava Lamp Ball 3 - Large */}
            <div 
              className="absolute w-[28rem] h-[28rem] rounded-full animate-lava-lamp-3 top-[20%] right-[10%]"
              style={{ 
                backgroundColor: '#0000FF',
                willChange: 'transform',
              }}
            />
            
            {/* Lava Lamp Ball 4 - Small */}
            <div 
              className="absolute w-64 h-64 rounded-full animate-lava-lamp-4 bottom-[15%] left-[20%]"
              style={{ 
                backgroundColor: '#0000FF',
                willChange: 'transform',
              }}
            />
            
            {/* Lava Lamp Ball 5 - Extra Large */}
            <div 
              className="absolute w-[32rem] h-[32rem] rounded-full animate-lava-lamp-5 top-[40%] left-[-120px]"
              style={{ 
                backgroundColor: '#0000FF',
                willChange: 'transform',
              }}
            />
            
            {/* Lava Lamp Ball 6 - Medium */}
            <div 
              className="absolute w-72 h-72 rounded-full animate-lava-lamp-6 bottom-[30%] right-[25%]"
              style={{ 
                backgroundColor: '#0000FF',
                willChange: 'transform',
              }}
            />
          </div>
          
          {/* Mobile: Simple circles (non-morphing) */}
          <div className="block md:hidden">
            <div 
              className="absolute w-96 h-96 rounded-full animate-slow-float-1 bottom-[-120px] right-[-120px]"
              style={{ 
                backgroundColor: '#0000FF',
                willChange: 'transform',
              }}
            />
            <div 
              className="absolute w-48 h-48 rounded-full animate-slow-float-2 bottom-[200px] right-[250px]"
              style={{ 
                backgroundColor: '#0000FF',
                willChange: 'transform',
              }}
            />
          </div>
          
          {/* Floating Line-art Shapes */}
          <svg 
            className="absolute top-[15%] left-[10%] w-12 h-12 animate-float-shape-1" 
            style={{ 
              color: 'white', 
              opacity: 0.6,
              willChange: 'transform',
            }}
          >
            <polygon points="24,4 44,44 4,44" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          
          <svg 
            className="absolute top-[70%] left-[80%] w-10 h-10 animate-float-shape-2"
            style={{ 
              color: 'white', 
              opacity: 0.6,
              willChange: 'transform',
            }}
          >
            <polygon points="20,4 36,36 4,36" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          
          <svg 
            className="absolute top-[25%] right-[15%] w-11 h-11 animate-float-shape-3"
            style={{ 
              color: 'white', 
              opacity: 0.6,
              willChange: 'transform',
            }}
          >
            <rect x="4" y="4" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          
          <svg 
            className="absolute bottom-[30%] left-[20%] w-9 h-9 animate-float-shape-4"
            style={{ 
              color: 'white', 
              opacity: 0.6,
              willChange: 'transform',
            }}
          >
            <rect x="4" y="4" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          
          <svg 
            className="absolute top-[60%] right-[25%] w-10 h-10 animate-float-shape-5"
            style={{ 
              color: 'white', 
              opacity: 0.6,
              willChange: 'transform',
            }}
          >
            <line x1="6" y1="6" x2="34" y2="34" stroke="currentColor" strokeWidth="2" />
            <line x1="34" y1="6" x2="6" y2="34" stroke="currentColor" strokeWidth="2" />
          </svg>
          
          <svg 
            className="absolute top-[40%] left-[15%] w-12 h-12 animate-float-shape-6"
            style={{ 
              color: 'white', 
              opacity: 0.6,
              willChange: 'transform',
            }}
          >
            <line x1="8" y1="8" x2="40" y2="40" stroke="currentColor" strokeWidth="2" />
            <line x1="40" y1="8" x2="8" y2="40" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>

        {/* Glass Morphism Container */}
        <div className="relative z-10 backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl text-center max-w-sm w-full">
          {/* Tapt Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center">
              <img 
                src={taptLogo} 
                alt="tapt" 
                className="h-12 w-auto"
              />
            </div>
          </div>

          {isLoading ? (
            /* Loading skeleton */
            <div className="animate-pulse">
              <div className="h-8 bg-white/20 rounded w-32 mx-auto mb-2"></div>
              <div className="h-16 bg-white/20 rounded w-40 mx-auto mb-12"></div>
              <div className="h-12 bg-white/20 rounded-full w-full"></div>
            </div>
          ) : (
            /* No transaction state */
            <div>
              <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">💳</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Waiting for Transaction</h2>
              <p className="text-white/70">The merchant will send payment details shortly</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Background Layer - Fixed */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: '#00D4D4' }}
      >
        {/* Desktop Only: Lava Lamp Blue Balls */}
        <div className="hidden md:block">
          {/* Lava Lamp Ball 1 - Large */}
          <div 
            className="absolute w-96 h-96 rounded-full animate-lava-lamp-1 bottom-[-100px] right-[-100px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
          
          {/* Lava Lamp Ball 2 - Medium */}
          <div 
            className="absolute w-80 h-80 rounded-full animate-lava-lamp-2 top-[-80px] left-[-80px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
          
          {/* Lava Lamp Ball 3 - Large */}
          <div 
            className="absolute w-[28rem] h-[28rem] rounded-full animate-lava-lamp-3 top-[20%] right-[10%]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
          
          {/* Lava Lamp Ball 4 - Small */}
          <div 
            className="absolute w-64 h-64 rounded-full animate-lava-lamp-4 bottom-[15%] left-[20%]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
          
          {/* Lava Lamp Ball 5 - Extra Large */}
          <div 
            className="absolute w-[32rem] h-[32rem] rounded-full animate-lava-lamp-5 top-[40%] left-[-120px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
          
          {/* Lava Lamp Ball 6 - Medium */}
          <div 
            className="absolute w-72 h-72 rounded-full animate-lava-lamp-6 bottom-[30%] right-[25%]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
        </div>
        
        {/* Mobile: Simple circles (non-morphing) */}
        <div className="block md:hidden">
          <div 
            className="absolute w-96 h-96 rounded-full animate-slow-float-1 bottom-[-120px] right-[-120px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
          <div 
            className="absolute w-48 h-48 rounded-full animate-slow-float-2 bottom-[200px] right-[250px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
        </div>
        
        {/* Floating Line-art Shapes */}
        <svg 
          className="absolute top-[15%] left-[10%] w-12 h-12 animate-float-shape-1" 
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <polygon points="24,4 44,44 4,44" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute top-[70%] left-[80%] w-10 h-10 animate-float-shape-2"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <polygon points="20,4 36,36 4,36" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute top-[25%] right-[15%] w-11 h-11 animate-float-shape-3"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <rect x="4" y="4" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute bottom-[30%] left-[20%] w-9 h-9 animate-float-shape-4"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <rect x="4" y="4" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute top-[60%] right-[25%] w-10 h-10 animate-float-shape-5"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <line x1="6" y1="6" x2="34" y2="34" stroke="currentColor" strokeWidth="2" />
          <line x1="34" y1="6" x2="6" y2="34" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute top-[40%] left-[15%] w-12 h-12 animate-float-shape-6"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <line x1="8" y1="8" x2="40" y2="40" stroke="currentColor" strokeWidth="2" />
          <line x1="40" y1="8" x2="8" y2="40" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        
        {/* Main Payment Card - Liquid Glass */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl text-center">
          
          {/* Tapt Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center">
              <img 
                src={taptLogo} 
                alt="tapt" 
                className="h-12 w-auto"
              />
            </div>
          </div>

          {/* Item Name */}
          <h2 className="text-3xl font-bold text-white mb-2">
            {currentTransaction.itemName}
          </h2>

          {/* Price */}
          <div className="text-5xl font-bold text-white mb-4">
            ${currentTransaction.isSplit 
              ? parseFloat(currentTransaction.splitAmount).toFixed(2) 
              : parseFloat(currentTransaction.price).toFixed(2)
            }
          </div>

          {/* Show split info when split */}
          {currentTransaction.isSplit && (
            <div className="text-lg text-white/70 mb-8">
              <span className="text-sm">
                Split {currentTransaction.completedSplits + 1}/{currentTransaction.totalSplits}
              </span>
            </div>
          )}

          {/* Add spacing when not split */}
          {!currentTransaction.isSplit && (
            <div className="mb-8"></div>
          )}

          {/* Digital Wallet Payment Options */}
          <div className="mb-8">
            <DigitalWalletButtons 
              amount={currentTransaction.isSplit ? parseFloat(currentTransaction.splitAmount) : parseFloat(currentTransaction.price)}
              currency="NZD"
              merchantName="Tapt Payment"
              itemName={currentTransaction.itemName}
              transactionId={currentTransaction.id}
              onPaymentStart={() => setPaymentStatus("processing")}
              onPaymentSuccess={(paymentData) => {
                console.log("Payment successful:", paymentData);
                // Digital wallet payment is already processed by backend
                setPaymentStatus("success");
              }}
              onPaymentError={(error) => {
                console.error("Payment error:", error);
                setPaymentStatus("error");
              }}
              disabled={paymentStatus !== "idle"}
            />
          </div>

          {/* Bill Split Component - Only show if not already split */}
          {!currentTransaction.isSplit && paymentStatus === "idle" && (
            <div className="mt-8">
              <BillSplit
                transactionId={currentTransaction.id}
                totalAmount={parseFloat(currentTransaction.price)}
                onSplitCreated={() => {
                  // Refresh the transaction data to get the updated split information
                  queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
                }}
              />
            </div>
          )}

          {/* Split Payment Info - Show if transaction is split */}
          {currentTransaction.isSplit && (
            <div className="mt-6 backdrop-blur-xl bg-blue-500/10 border border-blue-400/30 rounded-2xl p-4 text-center">
              <div className="text-blue-200 font-medium mb-2">Split Payment</div>
              <div className="text-white/70 text-sm">
                Pay ${parseFloat(currentTransaction.splitAmount).toFixed(2)} 
                <span className="block text-xs mt-1">
                  ({currentTransaction.completedSplits + 1} of {currentTransaction.totalSplits} payments)
                </span>
              </div>
            </div>
          )}

          {/* Security Badges */}
          <div className="flex items-center justify-center space-x-6 pt-6 mt-6 border-t border-white/20">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-green-400" />
              <span className="text-xs font-medium text-white/80">PCI DSS</span>
            </div>
            <div className="flex items-center space-x-2">
              <Lock className="w-4 h-4 text-green-400" />
              <span className="text-xs font-medium text-white/80">SECURE PAYMENT</span>
            </div>
          </div>
        </div>

        {/* Payment Status Messages */}
        {paymentStatus !== "idle" && (
          <div className="mt-6">
            {renderPaymentStatus()}
          </div>
        )}
      </div>
    </div>
  );
}
