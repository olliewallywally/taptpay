import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { sseClient } from "@/lib/sse-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

export default function CustomerPayment() {
  const { merchantId, stoneId } = useParams<{ merchantId: string; stoneId?: string }>();
  const [, setLocation] = useLocation();
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<"loading" | "redirecting" | "success" | "error">("loading");
  const hasRedirected = useRef(false);

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
    refetchInterval: 3000,
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
        setTimeout(() => setLocation(`/receipt/${message.transaction.id}`), 1500);
      } else if (message.transaction.status === "failed") {
        setPaymentStatus("error");
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
      hasRedirected.current = false;
    }
  }, [activeTransaction]);

  // Auto-redirect as soon as transaction loads
  useEffect(() => {
    if (!currentTransaction || hasRedirected.current) return;
    if (currentTransaction.status !== "pending") return;

    hasRedirected.current = true;

    // If split is enabled by merchant → go to split page
    if (currentTransaction.splitEnabled && !currentTransaction.isSplit) {
      setLocation(`/split/${currentTransaction.id}`);
      return;
    }

    // → Go to branded Hosted Fields checkout page
    setLocation(`/checkout/${currentTransaction.id}`);
  }, [currentTransaction]);

  const handleRetry = () => {
    hasRedirected.current = false;
    setPaymentStatus("loading");
    queryClient.invalidateQueries({ queryKey: ["/api/merchants", id, "active-transaction", stoneNumber] });
  };

  const logo = (
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
  );

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

  // Waiting for a transaction to be created by the merchant
  if (isLoading || (!currentTransaction && paymentStatus === "loading")) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm md:max-w-md">
          <div className="rounded-[48px] overflow-hidden shadow-2xl">
            <div className="bg-[#0055FF] px-8 pt-8 pb-20 rounded-b-[48px]">
              {logo}
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-[#00E5CC] animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Waiting for Payment</h2>
                <p className="text-white/70">The merchant will send payment details shortly</p>
              </div>
            </div>
            <div className="bg-[#00E5CC] px-8 py-4 -mt-4" />
          </div>
        </div>
      </div>
    );
  }

  // Success
  if (paymentStatus === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm md:max-w-md">
          <div className="rounded-[48px] overflow-hidden shadow-2xl">
            <div className="bg-[#0055FF] px-8 pt-8 pb-20 rounded-b-[48px]">
              {logo}
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-[#00E5CC] mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
                <p className="text-white/70">Thank you for your payment</p>
              </div>
            </div>
            <div className="bg-[#00E5CC] px-8 py-4 -mt-4" />
          </div>
        </div>
      </div>
    );
  }

  // Error / retry
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm md:max-w-md">
        <div className="rounded-[48px] overflow-hidden shadow-2xl">
          <div className="bg-[#0055FF] px-8 pt-8 pb-24 rounded-b-[48px] relative z-10">
            {logo}
            <div className="text-center">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
              <p className="text-white/70 text-sm">We couldn't connect to the payment page</p>
            </div>
          </div>
          <div
            className="bg-[#00E5CC] px-8 relative z-0"
            style={{ paddingTop: "4rem", paddingBottom: "2rem", marginTop: "-4rem" }}
          >
            <button
              onClick={handleRetry}
              className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-5 text-lg font-medium"
              data-testid="button-retry"
            >
              try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
