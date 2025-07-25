import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SlideToPayComponent } from "@/components/slide-to-pay";
import { sseClient } from "@/lib/sse-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, Lock, CheckCircle, XCircle } from "lucide-react";

export default function CustomerPayment() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const [, setLocation] = useLocation();
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success" | "error">("idle");

  // Debug URL parsing
  console.log("Raw URL:", window.location.pathname);
  console.log("Parsed merchantId from URL:", merchantId);
  
  const id = merchantId ? parseInt(merchantId) : null;
  
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

  // Get active transaction - optimized for speed
  const { data: activeTransaction, isLoading, error } = useQuery({
    queryKey: ["/api/merchants", id, "active-transaction"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${id}/active-transaction`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 1000, // Cache for 1 second only - real-time updates are important
    gcTime: 30000,   // Reduce garbage collection time 
    refetchInterval: 3000, // Check every 3 seconds instead of 5
    refetchOnWindowFocus: true,
    retry: 2, // Reduce retries for faster failure
  });

  console.log("Customer payment debug:", { 
    merchantId, 
    id, 
    activeTransaction, 
    isLoading, 
    error,
    currentTransaction,
    paymentStatus 
  });

  // Process payment mutation
  const processPaymentMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      console.log("Making payment API request for transaction:", transactionId);
      const response = await apiRequest("POST", `/api/transactions/${transactionId}/pay`, {});
      const result = await response.json();
      console.log("Payment API response:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("Payment mutation success:", data);
      setPaymentStatus("processing");
    },
    onError: (error) => {
      console.error("Payment mutation error:", error);
      setPaymentStatus("error");
    },
  });

  // Optimized SSE connection with memoization
  useEffect(() => {
    let isSubscribed = true;
    
    // Only connect if we have a valid merchant ID
    if (!id) return;
    
    sseClient.connect(id);
    
    const handleTransactionUpdate = (message: any) => {
      if (!isSubscribed) return;
      
      console.log("SSE transaction update received:", message);
      
      // Immediately update local state with SSE data
      setCurrentTransaction(message.transaction);
      
      // Invalidate cache to ensure fresh data on next query
      queryClient.invalidateQueries({ 
        queryKey: ["/api/merchants", id, "active-transaction"] 
      });
      
      // Update payment status based on transaction status
      if (message.transaction.status === "pending") {
        setPaymentStatus("idle"); // Reset to idle for new pending transactions
      } else if (message.transaction.status === "processing") {
        setPaymentStatus("processing");
      } else if (message.transaction.status === "completed") {
        setPaymentStatus("success");
        // Redirect to receipt page after a short delay
        setTimeout(() => {
          if (isSubscribed) {
            setLocation(`/receipt/${message.transaction.id}`);
          }
        }, 2000);
      } else if (message.transaction.status === "failed") {
        setPaymentStatus("error");
      }
    };
    
    sseClient.subscribe("transaction_updated", handleTransactionUpdate);

    return () => {
      isSubscribed = false;
      sseClient.disconnect();
    };
  }, [id, setLocation]);

  // Update current transaction from query - always use latest data
  useEffect(() => {
    if (activeTransaction) {
      console.log("Setting transaction from query:", activeTransaction);
      setCurrentTransaction(activeTransaction);
      if (activeTransaction.status === "pending") {
        setPaymentStatus("idle");
      }
    }
  }, [activeTransaction]);

  const handlePayment = () => {
    console.log("Payment triggered, current transaction:", currentTransaction);
    if (currentTransaction) {
      console.log("Initiating payment for transaction ID:", currentTransaction.id);
      processPaymentMutation.mutate(currentTransaction.id);
    } else {
      console.log("No current transaction available for payment");
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
        {/* Gradient Background with Floating Orbs */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          {/* Animated Gradient Orbs */}
          <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse"></div>
          <div className="absolute top-40 right-20 w-96 h-96 bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-75"></div>
          <div className="absolute -bottom-8 left-40 w-96 h-96 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-150"></div>
        </div>

        {/* Glass Morphism Container */}
        <div className="relative z-10 backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl text-center max-w-sm w-full">
          {/* Tapt Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-white backdrop-blur-lg rounded-2xl flex items-center justify-center border border-white/30 shadow-lg">
                <span className="text-black font-bold text-xl">T</span>
              </div>
            </div>
            <h1 className="text-2xl font-light text-white mb-2">tapt</h1>
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
      {/* Gradient Background with Floating Orbs */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Animated Gradient Orbs */}
        <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse"></div>
        <div className="absolute top-40 right-20 w-96 h-96 bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-75"></div>
        <div className="absolute -bottom-8 left-40 w-96 h-96 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-150"></div>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        
        {/* Main Payment Card - Liquid Glass */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl text-center">
          
          {/* Tapt Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-white backdrop-blur-lg rounded-2xl flex items-center justify-center border border-white/30 shadow-lg">
                <span className="text-black font-bold text-xl">T</span>
              </div>
            </div>
            <h1 className="text-2xl font-light text-white mb-2">tapt</h1>
          </div>

          {/* Item Name */}
          <h2 className="text-3xl font-bold text-white mb-2">
            {currentTransaction.itemName}
          </h2>

          {/* Price */}
          <div className="text-5xl font-bold text-white mb-12">
            ${parseFloat(currentTransaction.price).toFixed(2)}
          </div>

          {/* Slide to Pay Widget */}
          <div>
            <SlideToPayComponent 
              onPayment={handlePayment}
              disabled={paymentStatus !== "idle"}
              amount={parseFloat(currentTransaction.price)}
              currency="NZD"
              merchantName="Tapt Payment"
            />
          </div>

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
