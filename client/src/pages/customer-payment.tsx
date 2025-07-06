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

  const id = merchantId ? parseInt(merchantId) : 1;

  // Get active transaction with optimized caching
  const { data: activeTransaction, isLoading } = useQuery({
    queryKey: ["/api/merchants", id, "active-transaction"],
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
    refetchInterval: 15000, // Reduced polling to 15 seconds
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
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

  // Update current transaction from query only if SSE hasn't already set it
  useEffect(() => {
    if (activeTransaction && !currentTransaction) {
      console.log("Setting transaction from query:", activeTransaction);
      setCurrentTransaction(activeTransaction);
      setPaymentStatus("idle");
    }
  }, [activeTransaction, currentTransaction]);

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
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-blue-700 font-medium">Processing Payment...</p>
          </div>
        );
      case "success":
        return (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="text-green-700 font-medium">Payment Successful!</p>
            <p className="text-green-600 text-sm">Thank you for your purchase</p>
          </div>
        );
      case "error":
        return (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
            <p className="text-red-700 font-medium">Payment Failed</p>
            <p className="text-red-600 text-sm">Please try again or contact staff</p>
          </div>
        );
      default:
        return null;
    }
  };

  // Show loading skeleton while fetching
  if (isLoading || !currentTransaction) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full">
          {isLoading ? (
            // Fast loading skeleton
            <div className="animate-pulse">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                  <div className="h-6 bg-gray-200 rounded w-24"></div>
                </div>
              </div>
              <div className="h-8 bg-gray-200 rounded w-32 mx-auto mb-2"></div>
              <div className="h-16 bg-gray-200 rounded w-40 mx-auto mb-12"></div>
              <div className="h-12 bg-gray-200 rounded-full w-full"></div>
            </div>
          ) : (
            // No transaction state
            <div>
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">💳</span>
              </div>
              <h2 className="text-xl font-bold text-gray-700 mb-2">Waiting for Transaction</h2>
              <p className="text-gray-500">The merchant will send payment details shortly</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        
        {/* Main Payment Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center">
          
          {/* Merchant Branding */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              {/* QR Code Icon */}
              <div className="w-12 h-12 bg-[hsl(155,40%,25%)] rounded-lg flex items-center justify-center">
                <div className="grid grid-cols-3 gap-0.5">
                  <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                  <div className="w-1.5 h-1.5 bg-transparent"></div>
                  <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                  <div className="w-1.5 h-1.5 bg-transparent"></div>
                  <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                  <div className="w-1.5 h-1.5 bg-transparent"></div>
                  <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                  <div className="w-1.5 h-1.5 bg-transparent"></div>
                  <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                </div>
              </div>
              <span className="text-lg font-bold text-gray-700 tracking-wide">MERCHANT</span>
            </div>
          </div>

          {/* Item Name */}
          <h2 className="text-4xl font-bold text-gray-900 mb-2">
            {currentTransaction.itemName}
          </h2>

          {/* Price */}
          <div className="text-6xl font-bold text-gray-900 mb-12">
            ${parseFloat(currentTransaction.price).toFixed(2)}
          </div>

          {/* Slide to Pay Widget */}
          <div>
            <div className="text-xs text-gray-500 mb-2">
              Status: {paymentStatus} | Transaction ID: {currentTransaction.id}
            </div>
            <SlideToPayComponent 
              onPayment={handlePayment}
              disabled={paymentStatus !== "idle"}
              amount={parseFloat(currentTransaction.price)}
              currency="NZD"
              merchantName="Tapt Payment"
            />
          </div>

          {/* Security Badges */}
          <div className="flex items-center justify-center space-x-6 pt-4 border-t border-gray-100">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-[hsl(155,40%,25%)]" />
              <span className="text-xs font-medium text-gray-600">PCI DSS</span>
            </div>
            <div className="flex items-center space-x-2">
              <Lock className="w-4 h-4 text-[hsl(155,40%,25%)]" />
              <span className="text-xs font-medium text-gray-600">SECURE PAYMENT</span>
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
