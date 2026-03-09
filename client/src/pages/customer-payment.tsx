import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { sseClient } from "@/lib/sse-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, XCircle, Loader2, ChevronDown, CreditCard } from "lucide-react";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

type Stage = "loading" | "ready" | "redirecting" | "success" | "error";

export default function CustomerPayment() {
  const { merchantId, stoneId } = useParams<{ merchantId: string; stoneId?: string }>();
  const [, setLocation] = useLocation();
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [googlePayAvailable, setGooglePayAvailable] = useState(false);
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

  // Detect available payment methods
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Apple Pay
    const appleSession = (window as any).ApplePaySession;
    if (appleSession && appleSession.canMakePayments?.()) {
      setApplePayAvailable(true);
    }

    // Google Pay via Payment Request API
    if ((window as any).PaymentRequest) {
      const req = new (window as any).PaymentRequest(
        [{ supportedMethods: "https://google.com/pay", data: { apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods: [{ type: "CARD", parameters: { allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["VISA", "MASTERCARD"] } }], merchantInfo: { merchantName: "TaptPay" } } }],
        { total: { label: "Total", amount: { currency: "NZD", value: "0.01" } } }
      );
      req.canMakePayment().then((ok: boolean) => { if (ok) setGooglePayAvailable(true); }).catch(() => {});
    }
  }, []);

  // SSE real-time updates
  useEffect(() => {
    if (!id) return;
    sseClient.connect(id, stoneNumber);

    const handleTransactionUpdate = (message: any) => {
      if (stoneNumber && message.transaction.taptStoneId !== stoneNumber) return;
      setCurrentTransaction(message.transaction);
      queryClient.setQueryData(["/api/merchants", id, "active-transaction", stoneNumber], message.transaction);

      if (message.transaction.status === "completed") {
        setStage("success");
        setTimeout(() => setLocation(`/payment/result/${message.transaction.id}?status=approved`), 1500);
      } else if (message.transaction.status === "failed") {
        setStage("error");
      }
    };

    sseClient.subscribe("transaction_updated", handleTransactionUpdate);
    return () => {
      sseClient.unsubscribe("transaction_updated", handleTransactionUpdate);
      sseClient.disconnect();
    };
  }, [id, stoneNumber]);

  // Sync polled transaction into state
  useEffect(() => {
    if (activeTransaction && currentTransaction?.id !== activeTransaction.id) {
      setCurrentTransaction(activeTransaction);
      hasRedirected.current = false;
    }
  }, [activeTransaction]);

  // Move to ready state when we have a pending transaction
  useEffect(() => {
    if (!currentTransaction) return;
    if (currentTransaction.status !== "pending") return;

    // If split is already set by merchant, go straight to split page
    if (currentTransaction.splitEnabled && !currentTransaction.isSplit) {
      setLocation(`/split/${currentTransaction.id}`);
      return;
    }

    setStage("ready");
  }, [currentTransaction]);

  // Pay via Windcave (card details)
  const handleCardPay = async () => {
    if (!currentTransaction || hasRedirected.current) return;
    hasRedirected.current = true;
    setStage("redirecting");

    try {
      const body: Record<string, any> = { merchantId: id };
      if (stoneNumber !== null) body.stoneId = stoneNumber;

      const res = await apiRequest("POST", `/api/transactions/${currentTransaction.id}/pay`, body);
      const data = await res.json();

      if (data.hppUrl) {
        window.location.href = data.hppUrl;
      } else if (data.status === "completed") {
        setStage("success");
        setTimeout(() => setLocation(`/payment/result/${currentTransaction.id}?status=approved`), 1500);
      } else {
        hasRedirected.current = false;
        setStage("error");
      }
    } catch {
      hasRedirected.current = false;
      setStage("error");
    }
  };

  const handleSplitBill = () => {
    if (!currentTransaction) return;
    setLocation(`/split/${currentTransaction.id}`);
  };

  const handleRetry = () => {
    hasRedirected.current = false;
    setStage("loading");
    queryClient.invalidateQueries({ queryKey: ["/api/merchants", id, "active-transaction", stoneNumber] });
  };

  const amount = parseFloat(currentTransaction?.price || "0").toFixed(2);
  const itemName = currentTransaction?.itemName || "";

  const logoEl = (
    <div className="flex justify-center mb-1">
      <img
        src={merchant?.customLogoUrl || taptLogo}
        alt="TaptPay"
        className="h-7 object-contain"
        style={
          merchant?.customLogoUrl
            ? {}
            : {
                filter:
                  "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)",
              }
        }
      />
    </div>
  );

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="text-center space-y-3 bg-white rounded-3xl p-8 shadow-lg">
          <h2 className="text-xl font-bold text-red-600">Invalid Payment Link</h2>
          <p className="text-gray-500 text-sm">Please use a valid payment link from your merchant.</p>
        </div>
      </div>
    );
  }

  // ── LOADING / WAITING ──────────────────────────────────────────────────────
  if (isLoading || stage === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-5">
        <div className="w-full max-w-[340px]">
          <div className="rounded-[36px] bg-[#0055FF] p-8 shadow-2xl text-center">
            {logoEl}
            <Loader2 className="w-8 h-8 text-[#00E5CC] animate-spin mx-auto mt-6 mb-3" />
            <p className="text-white/80 text-sm">Waiting for payment details…</p>
          </div>
          <div className="mx-4 h-5 rounded-b-[24px] bg-[#00E5CC] opacity-80" />
        </div>
      </div>
    );
  }

  // ── REDIRECTING ────────────────────────────────────────────────────────────
  if (stage === "redirecting") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-5">
        <div className="w-full max-w-[340px]">
          <div className="rounded-[36px] bg-[#0055FF] p-8 shadow-2xl text-center">
            {logoEl}
            <p className="text-white/60 text-sm mt-4 mb-1">{itemName}</p>
            <p className="text-white text-5xl font-bold mb-6">${amount}</p>
            <Loader2 className="w-8 h-8 text-[#00E5CC] animate-spin mx-auto mb-2" />
            <p className="text-white/60 text-sm">Taking you to payment…</p>
          </div>
          <div className="mx-4 h-5 rounded-b-[24px] bg-[#00E5CC] opacity-80" />
        </div>
      </div>
    );
  }

  // ── SUCCESS ────────────────────────────────────────────────────────────────
  if (stage === "success") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-5">
        <div className="w-full max-w-[340px]">
          <div className="rounded-[36px] bg-[#0055FF] p-8 shadow-2xl text-center">
            {logoEl}
            <CheckCircle className="w-14 h-14 text-[#00E5CC] mx-auto mt-6 mb-3" />
            <h2 className="text-white text-xl font-bold mb-1">Payment Successful!</h2>
            <p className="text-white/60 text-sm">Thank you for your payment</p>
          </div>
          <div className="mx-4 h-5 rounded-b-[24px] bg-[#00E5CC] opacity-80" />
        </div>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (stage === "error") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-5">
        <div className="w-full max-w-[340px]">
          <div className="rounded-[36px] bg-[#0055FF] p-8 shadow-2xl text-center">
            {logoEl}
            <XCircle className="w-12 h-12 text-red-400 mx-auto mt-6 mb-3" />
            <h2 className="text-white text-lg font-bold mb-1">Something went wrong</h2>
            <p className="text-white/60 text-sm mb-0">We couldn't connect to the payment page</p>
          </div>
          <div className="mx-4 rounded-b-[24px] bg-[#00E5CC] px-6 pt-8 pb-6 -mt-4 shadow-xl">
            <button
              onClick={handleRetry}
              className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white rounded-2xl py-4 text-base font-semibold transition-colors"
            >
              try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── READY — PAYMENT OPTIONS ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-5">
      <div className="w-full max-w-[340px]">

        {/* Blue card */}
        <div className="rounded-[36px] bg-[#0055FF] px-7 pt-7 pb-8 shadow-2xl">

          {/* Logo */}
          {logoEl}

          {/* Amount */}
          <div className="text-center mt-3 mb-6">
            {itemName ? (
              <p className="text-white/60 text-sm mb-1 font-medium">{itemName}</p>
            ) : null}
            <p className="text-white text-[52px] leading-none font-bold tracking-tight">
              ${amount}
            </p>
          </div>

          {/* Apple Pay */}
          {applePayAvailable && (
            <button
              onClick={handleCardPay}
              className="w-full mb-3 rounded-2xl bg-black text-white flex items-center justify-center gap-2 py-4 text-base font-semibold"
              style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
            >
              <svg viewBox="0 0 165.521 128" width="36" height="22" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M150.698 0H14.823C6.634 0 0 6.634 0 14.823v98.354C0 121.366 6.634 128 14.823 128h135.875c8.189 0 14.823-6.634 14.823-14.823V14.823C165.521 6.634 158.887 0 150.698 0zM52.932 98.449l-1.944-5.997H35.23l-1.944 5.997h-8.278l15.003-41.67h5.997l15.204 41.67H52.932zm-9.631-28.23l-4.655 15.304h9.51l-4.855-15.304zm40.741 28.23V56.779h8.478v41.67h-8.478zm23.928 0V56.779h8.478v34.593h17.549v7.077H108.97zm31.806 0V56.779h26.227v7.077h-17.749v9.631h16.649v7.077h-16.649v10.808h17.749v7.077H139.776z"/>
              </svg>
              Pay
            </button>
          )}

          {/* Google Pay */}
          {googlePayAvailable && (
            <button
              onClick={handleCardPay}
              className="w-full mb-3 rounded-2xl bg-black text-white flex items-center justify-center gap-2 py-4 text-base font-semibold"
            >
              <svg viewBox="0 0 48 48" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <path fill="#4285F4" d="M45.5 24.5c0-1.4-.1-2.7-.4-4H24v7.6h12.1c-.5 2.8-2.1 5.1-4.5 6.7v5.6h7.3c4.2-3.9 6.6-9.6 6.6-15.9z"/>
                <path fill="#34A853" d="M24 46c6.1 0 11.2-2 14.9-5.5l-7.3-5.6c-2 1.4-4.6 2.2-7.6 2.2-5.9 0-10.8-4-12.6-9.3H4v5.8C7.7 41.8 15.3 46 24 46z"/>
                <path fill="#FBBC04" d="M11.4 27.8c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.8H4C2.4 17.1 1.5 20.4 1.5 24s.9 6.9 2.5 10.2l7.4-6.4z"/>
                <path fill="#EA4335" d="M24 9.5c3.3 0 6.3 1.1 8.6 3.4l6.4-6.4C35.2 2.9 30.1.5 24 .5 15.3.5 7.7 4.7 4 13.8l7.4 5.8C13.2 13.5 18.1 9.5 24 9.5z"/>
              </svg>
              Pay
            </button>
          )}

          {/* Split the bill */}
          <button
            onClick={handleSplitBill}
            className="w-full rounded-2xl flex items-center justify-between px-5 py-4 text-[#0055FF] font-semibold text-base transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#00E5CC" }}
          >
            <span>split the bill</span>
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Enter card details — sits below the blue card */}
        <div
          className="mx-3 rounded-b-[28px] shadow-xl -mt-3 pt-6 pb-5 px-6 cursor-pointer hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "#00E5CC" }}
          onClick={handleCardPay}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleCardPay()}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#0055FF] font-semibold text-base">
              <CreditCard className="w-5 h-5" />
              <span>enter card details</span>
            </div>
            <ChevronDown className="w-5 h-5 text-[#0055FF]" />
          </div>
        </div>

      </div>
    </div>
  );
}
