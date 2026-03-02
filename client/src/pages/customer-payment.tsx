import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { sseClient } from "@/lib/sse-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, XCircle, Loader2, Split } from "lucide-react";
import taptLogo from "@assets/IMG_6592_1755070818452.png";
import { Button } from "@/components/ui/button";

export default function CustomerPayment() {
  const { merchantId, stoneId } = useParams<{ merchantId: string; stoneId?: string }>();
  const [, setLocation] = useLocation();
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "redirecting" | "success" | "error">("idle");

  const id = merchantId ? parseInt(merchantId) : null;
  const stoneNumber = stoneId ? parseInt(stoneId) : null;

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", id],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${id}`);
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
    enabled: !!id,
  });

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
    queryKey: ["/api/merchants", id, "active-transaction", stoneNumber],
    queryFn: async () => {
      const url = stoneNumber
        ? `/api/merchants/${id}/active-transaction?stoneId=${stoneNumber}`
        : `/api/merchants/${id}/active-transaction`;
      const response = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    staleTime: 500,
    gcTime: 10000,
    refetchInterval: 2000,
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (!id) return;
    sseClient.connect(id, stoneNumber);

    const handleTransactionUpdate = (message: any) => {
      if (stoneNumber && message.transaction.taptStoneId !== stoneNumber) return;
      setCurrentTransaction(message.transaction);
      queryClient.setQueryData(["/api/merchants", id, "active-transaction", stoneNumber], message.transaction);

      if (message.transaction.status === "completed") {
        setPaymentStatus("success");
        setTimeout(() => setLocation(`/payment/result/${message.transaction.id}?status=approved`), 1500);
      } else if (message.transaction.status === "failed") {
        setPaymentStatus("error");
      } else if (message.transaction.status === "pending") {
        setPaymentStatus("idle");
      }
    };

    sseClient.subscribe("transaction_updated", handleTransactionUpdate);
    return () => {
      sseClient.unsubscribe("transaction_updated", handleTransactionUpdate);
      sseClient.disconnect();
    };
  }, [id, stoneNumber]);

  useEffect(() => {
    if (activeTransaction && currentTransaction?.id !== activeTransaction.id) {
      setCurrentTransaction(activeTransaction);
    }
  }, [activeTransaction]);

  const handlePay = async () => {
    if (!currentTransaction) return;
    setPaymentStatus("redirecting");

    try {
      const body: Record<string, any> = { merchantId: id };
      if (stoneNumber !== null) body.stoneId = stoneNumber;

      const response = await apiRequest("POST", `/api/transactions/${currentTransaction.id}/pay`, body);
      const data = await response.json();

      if (data.hppUrl) {
        window.location.href = data.hppUrl;
      } else if (data.status === "completed") {
        setPaymentStatus("success");
        setTimeout(() => setLocation(`/payment/result/${currentTransaction.id}?status=approved`), 1500);
      } else {
        setPaymentStatus("error");
      }
    } catch (err) {
      console.error("Pay error:", err);
      setPaymentStatus("error");
    }
  };

  const handleSplitBill = () => {
    if (!currentTransaction) return;
    setLocation(`/split/${currentTransaction.id}`);
  };

  const renderStatus = () => {
    switch (paymentStatus) {
      case "redirecting":
        return (
          <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 text-center">
            <Loader2 className="w-6 h-6 text-white animate-spin mx-auto mb-2" />
            <p className="text-white font-medium">Taking you to payment...</p>
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
            <p className="text-white font-medium">Something went wrong</p>
            <p className="text-white/80 text-sm mb-3">Please try again</p>
            <button
              onClick={() => setPaymentStatus("idle")}
              className="bg-white/20 hover:bg-white/30 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  if (isLoading || !currentTransaction) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm md:max-w-md">
          <div className="rounded-[48px] overflow-hidden shadow-2xl">
            <div className="bg-[#0055FF] px-8 pt-8 pb-20 rounded-b-[48px]">
              <div className="text-center mb-8">
                <img src={merchant?.customLogoUrl || taptLogo} alt="logo" className="h-24 mx-auto" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-2">Waiting for Transaction</h2>
                <p className="text-white/70">The merchant will send payment details shortly</p>
              </div>
            </div>
            <div className="bg-[#00E5CC] px-8 py-4 -mt-4" />
          </div>
        </div>
      </div>
    );
  }

  const displayAmount = currentTransaction.isSplit
    ? parseFloat(currentTransaction.splitAmount || currentTransaction.price).toFixed(2)
    : parseFloat(currentTransaction.price).toFixed(2);

  const isAlreadySplit = currentTransaction.isSplit;
  const canPay = currentTransaction.status === "pending" && paymentStatus === "idle";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm md:max-w-md">
        <div className="rounded-[48px] overflow-hidden shadow-2xl">
          {/* Blue section */}
          <div className="bg-[#0055FF] px-8 pt-8 pb-24 rounded-b-[48px] relative z-10">
            {/* Logo */}
            <div className="text-center mb-8">
              <img
                src={merchant?.customLogoUrl || taptLogo}
                alt="merchant logo"
                className="h-12 sm:h-14 mx-auto object-contain"
                style={
                  merchant?.customLogoUrl
                    ? {}
                    : { filter: "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)" }
                }
              />
            </div>

            {paymentStatus !== "idle" ? (
              <div className="mb-8">{renderStatus()}</div>
            ) : (
              <div>
                {/* Item name */}
                <div className="text-center mb-3">
                  <p className="text-white/60 text-lg sm:text-xl">{currentTransaction.itemName}</p>
                </div>

                {/* Amount */}
                <div className="text-center mb-8">
                  <p className="text-[#00E5CC] text-5xl sm:text-6xl font-bold">${displayAmount}</p>
                  {isAlreadySplit && (
                    <p className="text-white/70 text-sm mt-2">
                      Person {currentTransaction.completedSplits + 1} of {currentTransaction.totalSplits} &mdash; your share
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cyan section — buttons */}
          <div
            className="bg-[#00E5CC] px-8 relative z-0"
            style={{ paddingTop: "4rem", paddingBottom: "2rem", marginTop: "-4rem" }}
          >
            {canPay && (
              <div className="space-y-3">
                {/* Primary pay button */}
                <Button
                  className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
                  onClick={handlePay}
                  data-testid="button-pay-now"
                >
                  pay ${displayAmount}
                </Button>

                {/* Split bill button — only shown when merchant enabled it for this transaction */}
                {!isAlreadySplit && currentTransaction.splitEnabled && (
                  <button
                    onClick={handleSplitBill}
                    className="w-full flex items-center justify-center gap-2 text-[#0055FF] font-medium py-3 rounded-[20px] bg-white/60 hover:bg-white/80 transition-colors text-base"
                    data-testid="button-split-bill"
                  >
                    <Split size={18} />
                    split the bill
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
