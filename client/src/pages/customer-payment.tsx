import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DigitalWalletButtons } from "@/components/digital-wallet-buttons";
import { BillSplit } from "@/components/bill-split";
import { sseClient } from "@/lib/sse-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Minus, Plus, CreditCard } from "lucide-react";
import taptLogo from "@assets/IMG_6592_1755070818452.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CustomerPayment() {
  const { merchantId, stoneId } = useParams<{ merchantId: string; stoneId?: string }>();
  const [, setLocation] = useLocation();
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [showSplitBill, setShowSplitBill] = useState(false);
  const [showCardDetails, setShowCardDetails] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardName, setCardName] = useState("");

  const id = merchantId ? parseInt(merchantId) : null;
  const stoneNumber = stoneId ? parseInt(stoneId) : null;
  
  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-200">
        <div className="text-center space-y-4 bg-white rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-red-600">Invalid Payment Link</h2>
          <p className="text-gray-600">Please use a valid payment link from your merchant.</p>
        </div>
      </div>
    );
  }

  const { data: activeTransaction, isLoading } = useQuery({
    queryKey: ["/api/merchants", id, "active-transaction"],
    queryFn: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch(`/api/merchants/${id}/active-transaction`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
    staleTime: 500,
    gcTime: 10000,
    refetchInterval: 2000,
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 1000,
  });

  const processPaymentMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const response = await apiRequest("POST", `/api/transactions/${transactionId}/pay`, {});
      return response.json();
    },
    onSuccess: () => setPaymentStatus("processing"),
    onError: () => setPaymentStatus("error"),
  });

  const processCardPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!currentTransaction) throw new Error("No transaction");
      // In a real implementation, this would send card details to a payment processor
      // For now, we'll simulate the payment process
      const response = await apiRequest("POST", `/api/transactions/${currentTransaction.id}/pay`, {
        paymentMethod: "card",
        cardLast4: cardNumber.slice(-4)
      });
      return response.json();
    },
    onSuccess: () => {
      setPaymentStatus("processing");
      setShowCardDetails(false);
      // Reset card form
      setCardNumber("");
      setCardExpiry("");
      setCardCvc("");
      setCardName("");
    },
    onError: () => setPaymentStatus("error"),
  });

  useEffect(() => {
    if (!id) return;
    
    sseClient.connect(id);
    
    const handleTransactionUpdate = (message: any) => {
      setCurrentTransaction(message.transaction);
      queryClient.setQueryData(["/api/merchants", id, "active-transaction"], message.transaction);
      
      const statusMap = {
        "pending": "idle",
        "processing": "processing", 
        "completed": "success"
      } as const;
      
      const newStatus = statusMap[message.transaction.status as keyof typeof statusMap];
      if (newStatus) {
        setPaymentStatus(newStatus);
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

  useEffect(() => {
    if (activeTransaction) {
      setCurrentTransaction(activeTransaction);
      if (activeTransaction.status === "pending") {
        setPaymentStatus("idle");
      }
    }
  }, [activeTransaction]);

  const renderPaymentStatus = () => {
    switch (paymentStatus) {
      case "processing":
        return (
          <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-white font-medium">Processing Payment...</p>
          </div>
        );
      case "success":
        return (
          <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-4 text-center">
            <CheckCircle className="w-8 h-8 text-[#00E5CC] mx-auto mb-2" />
            <p className="text-white font-medium">Payment Successful!</p>
            <p className="text-white/80 text-sm">Thank you for your purchase</p>
          </div>
        );
      case "error":
        return (
          <div className="bg-red-500/20 border border-red-400/30 rounded-xl p-4 text-center">
            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-white font-medium">Payment Failed</p>
            <p className="text-white/80 text-sm">Please try again or contact staff</p>
          </div>
        );
      default:
        return null;
    }
  };

  if (isLoading || !currentTransaction) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm md:max-w-md lg:max-w-lg">
          <div className="rounded-[48px] md:rounded-[60px] overflow-hidden shadow-2xl">
            <div className="bg-[#0055FF] px-8 md:px-12 pt-8 pb-16 rounded-b-[48px] md:rounded-b-[60px]">
              <div className="text-center mb-8 md:mb-10">
                <img src={taptLogo} alt="taptpay" className="h-24 sm:h-28 md:h-32 mx-auto" />
              </div>
              {isLoading ? (
                <div className="animate-pulse text-center">
                  <div className="h-8 bg-white/20 rounded w-32 mx-auto mb-2"></div>
                  <div className="h-16 bg-white/20 rounded w-40 mx-auto mb-12"></div>
                </div>
              ) : (
                <div className="text-center">
                  <h2 className="text-xl font-bold text-white mb-2">Waiting for Transaction</h2>
                  <p className="text-white/70">The merchant will send payment details shortly</p>
                </div>
              )}
            </div>
            <div className="bg-[#00E5CC] px-8 py-4 -mt-4"></div>
          </div>
        </div>
      </div>
    );
  }

  const displayAmount = currentTransaction.isSplit 
    ? parseFloat(currentTransaction.splitAmount).toFixed(2) 
    : parseFloat(currentTransaction.price).toFixed(2);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg">
        <div className="rounded-[48px] md:rounded-[60px] overflow-hidden shadow-2xl">
          {/* Blue section with payment content */}
          <div 
            className="bg-[#0055FF] px-8 md:px-12 rounded-b-[48px] md:rounded-b-[60px] relative z-10 transition-all duration-500 ease-in-out"
            style={{
              paddingTop: '2rem',
              paddingBottom: showSplitBill ? '20rem' : showCardDetails ? '32rem' : '6rem'
            }}
          >
            {/* Logo */}
            <div className="text-center mb-8 md:mb-10">
              <img src={taptLogo} alt="taptpay" className="h-24 sm:h-28 md:h-32 mx-auto" />
            </div>

            {/* Payment Status or Content */}
            {paymentStatus !== "idle" ? (
              <div className="mb-8">
                {renderPaymentStatus()}
              </div>
            ) : (
              <div>
                {/* Item Name */}
                <div className="text-center mb-3 sm:mb-4 md:mb-5">
                  <p className="text-white/60 text-lg sm:text-xl md:text-2xl">{currentTransaction.itemName}</p>
                </div>

                {/* Amount */}
                <div className="text-center mb-8 sm:mb-10 md:mb-12">
                  <p className="text-[#00E5CC] text-5xl sm:text-6xl md:text-7xl font-bold">${displayAmount}</p>
                  {currentTransaction.isSplit && (
                    <p className="text-white/70 text-sm mt-2">
                      Split {currentTransaction.completedSplits + 1}/{currentTransaction.totalSplits}
                    </p>
                  )}
                </div>

                {/* Digital Wallet Payment Options */}
                <div className="mb-4 sm:mb-5">
                  <DigitalWalletButtons 
                    amount={currentTransaction.isSplit ? parseFloat(currentTransaction.splitAmount) : parseFloat(currentTransaction.price)}
                    currency="NZD"
                    merchantName="Tapt Payment"
                    itemName={currentTransaction.itemName}
                    transactionId={currentTransaction.id}
                    onPaymentStart={() => setPaymentStatus("processing")}
                    onPaymentSuccess={(paymentData) => {
                      console.log("Payment successful:", paymentData);
                      setPaymentStatus("success");
                    }}
                    onPaymentError={(error) => {
                      console.error("Payment error:", error);
                      setPaymentStatus("error");
                    }}
                    disabled={paymentStatus !== "idle"}
                  />
                </div>

                {/* Enter Card Details Button */}
                <div className="relative mb-4">
                  <button 
                    onClick={() => {
                      setShowCardDetails(!showCardDetails);
                      setShowSplitBill(false);
                    }}
                    className="w-full bg-white/10 hover:bg-white/20 border-2 border-white/30 text-white rounded-[20px] sm:rounded-[24px] md:rounded-[28px] py-4 sm:py-5 md:py-6 flex items-center justify-center gap-2 transition-colors relative z-10"
                    style={{
                      borderBottomLeftRadius: showCardDetails ? '0' : '',
                      borderBottomRightRadius: showCardDetails ? '0' : ''
                    }}
                  >
                    <CreditCard size={20} />
                    <span className="text-base sm:text-lg md:text-xl">enter card details</span>
                    {showCardDetails ? (
                      <ChevronUp size={20} />
                    ) : (
                      <ChevronDown size={20} />
                    )}
                  </button>

                  {/* Card Details Dropdown */}
                  <div 
                    className="transition-all duration-500 ease-in-out overflow-hidden absolute top-full left-0 right-0 z-0"
                    style={{
                      maxHeight: showCardDetails ? '500px' : '0px',
                      opacity: showCardDetails ? 1 : 0
                    }}
                  >
                    <div className="bg-white rounded-b-[28px] md:rounded-b-[32px] px-6 py-8 space-y-4">
                      <h3 className="text-[#0055FF] font-semibold text-lg mb-4">Card Details</h3>
                      
                      <div>
                        <label className="text-[#0055FF] text-sm font-medium mb-1 block">Card Number</label>
                        <Input
                          type="text"
                          placeholder="1234 5678 9012 3456"
                          value={cardNumber}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\s/g, '').replace(/\D/g, '');
                            const formatted = value.match(/.{1,4}/g)?.join(' ') || value;
                            setCardNumber(formatted);
                          }}
                          maxLength={19}
                          className="bg-[#0055FF]/10 border-2 border-[#00E5CC] text-[#0055FF] rounded-xl h-12 px-4"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[#0055FF] text-sm font-medium mb-1 block">Expiry</label>
                          <Input
                            type="text"
                            placeholder="MM/YY"
                            value={cardExpiry}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              let formatted = value;
                              if (value.length >= 2) {
                                formatted = value.slice(0, 2) + '/' + value.slice(2, 4);
                              }
                              setCardExpiry(formatted);
                            }}
                            maxLength={5}
                            className="bg-[#0055FF]/10 border-2 border-[#00E5CC] text-[#0055FF] rounded-xl h-12 px-4"
                          />
                        </div>
                        <div>
                          <label className="text-[#0055FF] text-sm font-medium mb-1 block">CVC</label>
                          <Input
                            type="text"
                            placeholder="123"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            maxLength={4}
                            className="bg-[#0055FF]/10 border-2 border-[#00E5CC] text-[#0055FF] rounded-xl h-12 px-4"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[#0055FF] text-sm font-medium mb-1 block">Cardholder Name</label>
                        <Input
                          type="text"
                          placeholder="John Smith"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          className="bg-[#0055FF]/10 border-2 border-[#00E5CC] text-[#0055FF] rounded-xl h-12 px-4"
                        />
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => setShowCardDetails(false)}
                          className="flex-1 bg-[#E8E5E0] text-[#0055FF] rounded-xl py-3 hover:opacity-90 transition-opacity font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => processCardPaymentMutation.mutate()}
                          disabled={!cardNumber || !cardExpiry || !cardCvc || !cardName || processCardPaymentMutation.isPending}
                          className="flex-1 bg-[#00E5CC] text-[#0055FF] rounded-xl py-3 hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
                        >
                          {processCardPaymentMutation.isPending ? "Processing..." : "Pay Now"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Split the Bill Button - Only if not already split */}
                {!currentTransaction.isSplit && (
                  <div className="relative mb-4 md:mb-6">
                    <button 
                      onClick={() => {
                        setShowSplitBill(!showSplitBill);
                        setShowCardDetails(false);
                      }}
                      className="w-full bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF] rounded-[20px] sm:rounded-[24px] md:rounded-[28px] py-4 sm:py-5 md:py-6 flex items-center justify-center gap-2 transition-colors relative z-10"
                      style={{
                        borderBottomLeftRadius: showSplitBill ? '0' : '',
                        borderBottomRightRadius: showSplitBill ? '0' : ''
                      }}
                    >
                      <span className="text-base sm:text-lg md:text-xl">split the bill</span>
                      {showSplitBill ? (
                        <ChevronUp size={20} className="text-[#0055FF]" />
                      ) : (
                        <ChevronDown size={20} className="text-[#0055FF]" />
                      )}
                    </button>

                    {/* Split Bill Dropdown */}
                    <div 
                      className="transition-all duration-500 ease-in-out overflow-hidden absolute top-full left-0 right-0 z-0"
                      style={{
                        maxHeight: showSplitBill ? '300px' : '0px',
                        opacity: showSplitBill ? 1 : 0
                      }}
                    >
                      <div className="bg-white rounded-b-[48px] px-6 py-8">
                        <BillSplit
                          transactionId={currentTransaction.id}
                          originalAmount={parseFloat(currentTransaction.price)}
                          onSplitCreated={() => setShowSplitBill(false)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cyan section */}
          <div 
            className="bg-[#00E5CC] px-8 relative z-0 transition-all duration-500 ease-in-out" 
            style={{ 
              paddingTop: '5rem',
              paddingBottom: '2rem',
              marginTop: '-4rem'
            }}
          ></div>
        </div>
      </div>
    </div>
  );
}
