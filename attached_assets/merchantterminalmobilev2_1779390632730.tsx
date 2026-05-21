import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeDisplay } from "@/components/qr-code-display";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { useDeviceStatusMonitoring, useSSEConnectionMonitoring } from "@/components/notification-system";
import { getCurrentMerchantId } from "@/lib/auth";
import { Loader2, CheckCircle, XCircle, Waves, X } from "lucide-react";
import { canTapToPay } from "@/lib/native";
import SmartTransitions from "@/components/SmartTransitions";

const BRAND = "#00DFC8";

export default function MerchantTerminalMobile() {
  const [selectedStoneId, setSelectedStoneId] = useState<number | null>(null);
  const [successNotif, setSuccessNotif] = useState<{ id: string; message: string; amount?: string } | null>(null);
  const prevTransactionStatusRef = useRef<string | null>(null);

  const [tapToPayStatus, setTapToPayStatus] = useState<"idle" | "waiting" | "processing" | "completed" | "failed">("idle");
  const [tapToPayApproved, setTapToPayApproved] = useState<boolean | null>(null);
  const [showTapToPayOverlay, setShowTapToPayOverlay] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const AudioCtx: typeof AudioContext =
      window.AudioContext ||
      (window as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    const unlock = () => { if (ctx.state === "suspended") ctx.resume(); };
    window.addEventListener("click", unlock, { once: false });
    window.addEventListener("touchstart", unlock, { once: false });
    window.addEventListener("keydown", unlock, { once: false });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
      ctx.close();
    };
  }, []);

  const playSuccessChime = async () => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") await ctx.resume();
      const playTone = (freq: number, startTime: number, duration: number, gain: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.018);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const t = ctx.currentTime;
      playTone(523.25, t,        0.22, 0.28);
      playTone(659.25, t + 0.09, 0.22, 0.30);
      playTone(783.99, t + 0.18, 0.22, 0.30);
      playTone(1046.5, t + 0.27, 0.55, 0.36);
    } catch (e) { console.warn("Chime failed:", e); }
  };

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const merchantId = getCurrentMerchantId();

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}`);
      if (!r.ok) throw new Error("Failed to fetch merchant");
      return r.json();
    },
    enabled: !!merchantId,
  });

  const { data: activeTransaction } = useQuery({
    queryKey: ["/api/merchants", merchantId, "active-transaction"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/active-transaction`);
      if (!r.ok) throw new Error("Failed to fetch active transaction");
      return r.json();
    },
    refetchInterval: 3000,
    enabled: !!merchantId,
  });

  const { data: taptStones = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/tapt-stones`);
      if (!r.ok) throw new Error("Failed to fetch tapt stones");
      return r.json();
    },
    enabled: !!merchantId,
  });

  const { data: allTransactions = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!r.ok) throw new Error("Failed to fetch transactions");
      return r.json();
    },
    refetchInterval: 5000,
    enabled: !!merchantId,
  });

  useEffect(() => {
    if ((taptStones as any[]).length > 0 && selectedStoneId === null) {
      setSelectedStoneId((taptStones as any[])[0].id);
    }
  }, [taptStones, selectedStoneId]);

  useEffect(() => {
    if (!merchantId) return;
    sseClient.connect(merchantId);
    sseClient.subscribe("transaction_updated", (message) => {
      queryClient.setQueryData(["/api/merchants", merchantId, "active-transaction"], message.transaction ?? null);
    });
    return () => { sseClient.disconnect(); };
  }, [merchantId, queryClient]);

  useDeviceStatusMonitoring();
  useSSEConnectionMonitoring(merchantId ?? 0);

  useEffect(() => {
    const prev = prevTransactionStatusRef.current;
    const status = activeTransaction?.status ?? null;
    if (status === "completed" && prev && prev !== "completed") {
      playSuccessChime();
      const amount = activeTransaction?.price
        ? parseFloat(activeTransaction.price).toFixed(2)
        : undefined;
      setSuccessNotif({ id: `success-${Date.now()}`, message: "Payment Received", amount });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
    }
    prevTransactionStatusRef.current = status;
  }, [activeTransaction?.status]);

  const createTransactionMutation = useMutation({
    mutationFn: async (data: { itemName: string; price: string; selectedStoneId?: number }) => {
      const r = await apiRequest("POST", "/api/transactions", {
        merchantId,
        itemName: data.itemName,
        price: data.price,
        status: "pending",
        selectedStoneId: data.selectedStoneId,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create transaction", variant: "destructive" });
    },
  });

  const cancelTransactionMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const r = await apiRequest("POST", `/api/transactions/${transactionId}/cancel`, {});
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel transaction", variant: "destructive" });
    },
  });

  const startTapToPayPayment = async () => {
    if (!activeTransaction) {
      toast({ title: "No Transaction", description: "Create a transaction first.", variant: "destructive" });
      return;
    }
    setTapToPayStatus("waiting");
    setTapToPayApproved(null);
    setShowTapToPayOverlay(true);
    try {
      let bridgeResult: { approved: boolean; token?: string; cancelled?: boolean; error?: string };
      if (canTapToPay()) {
        bridgeResult = await (window as any).TaptPay!.startTapToPay({
          amount: parseFloat(activeTransaction.price),
          currency: "NZD",
          merchantName: merchant?.businessName || "TaptPay",
        });
      } else if (import.meta.env.DEV) {
        await new Promise(r => setTimeout(r, 2000));
        bridgeResult = { approved: true, token: `SIM_TOKEN_${Date.now()}` };
      } else {
        setTapToPayStatus("idle");
        setShowTapToPayOverlay(false);
        toast({ title: "Not available", description: "Tap to Pay requires the TaptPay iOS app.", variant: "destructive" });
        return;
      }
      if (bridgeResult.cancelled) {
        setTapToPayStatus("idle");
        setShowTapToPayOverlay(false);
        toast({ title: "Cancelled", description: "Tap to Pay was cancelled." });
        return;
      }
      setTapToPayStatus("processing");
      const authToken = localStorage.getItem("authToken");
      const r = await fetch("/api/transactions/tap-to-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          merchantId,
          transactionId: activeTransaction.id,
          amount: parseFloat(activeTransaction.price),
          windcaveToken: bridgeResult.token,
        }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.message || `Processor error (${r.status})`);
      }
      const data = await r.json();
      setTapToPayApproved(data.approved);
      setTapToPayStatus(data.approved ? "completed" : "failed");
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
      setTimeout(() => { setShowTapToPayOverlay(false); setTapToPayStatus("idle"); setTapToPayApproved(null); }, 3500);
    } catch (err: any) {
      setTapToPayStatus("failed");
      setTapToPayApproved(false);
      toast({ title: "Payment error", description: err?.message || "Tap to Pay failed", variant: "destructive" });
    }
  };

  const closeTapToPayOverlay = () => {
    setShowTapToPayOverlay(false);
    setTapToPayStatus("idle");
    setTapToPayApproved(null);
  };

  if (!merchantId) {
    window.location.href = "/login";
    return <div>Redirecting...</div>;
  }

  // --- Live state mapping ---
  const pending = activeTransaction &&
    (activeTransaction.status === "pending" || activeTransaction.status === "processing")
    ? {
        id: activeTransaction.id,
        name: activeTransaction.itemName,
        amount: Math.round(parseFloat(activeTransaction.price) * 100),
      }
    : null;

  const sent = (allTransactions as any[])
    .filter((tx: any) => tx.status === "completed")
    .slice(0, 10)
    .map((tx: any) => ({
      id: tx.id,
      name: tx.itemName,
      amount: Math.round(parseFloat(tx.price) * 100),
      status: "sent",
    }));

  const liveState = { items: [], pending, sent };

  const liveStones = (taptStones as any[]).map((s: any) => ({
    id: s.id,
    name: s.name || `Board #${s.stoneNumber}`,
    stoneNumber: s.stoneNumber,
  }));

  const livePayLink = `${window.location.origin}/pay/${merchantId}${selectedStoneId ? `/stone/${selectedStoneId}` : ""}`;

  const qrElement = (
    <QRCodeDisplay
      merchantId={merchantId}
      stoneId={selectedStoneId ?? undefined}
    />
  );

  const handleLiveCommit = (cents: number) => {
    createTransactionMutation.mutate({
      itemName: "Payment",
      price: (cents / 100).toFixed(2),
      selectedStoneId: selectedStoneId ?? undefined,
    });
  };

  const handleLiveDetailsCommit = ({ name, amount }: { name: string; amount: number }) => {
    createTransactionMutation.mutate({
      itemName: name,
      price: (amount / 100).toFixed(2),
      selectedStoneId: selectedStoneId ?? undefined,
    });
  };

  const handleLiveStockCommit = (picks: { id: any; name: string; amount: number; qty: number }[]) => {
    const name = picks.map(p => p.qty > 1 ? `${p.name} x${p.qty}` : p.name).join(", ");
    const total = picks.reduce((s, p) => s + p.amount * p.qty, 0);
    createTransactionMutation.mutate({
      itemName: name,
      price: (total / 100).toFixed(2),
      selectedStoneId: selectedStoneId ?? undefined,
    });
  };

  const handleLiveCancel = () => {
    if (activeTransaction?.id) {
      cancelTransactionMutation.mutate(activeTransaction.id);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <SmartTransitions
        liveState={liveState}
        onLiveCommit={handleLiveCommit}
        onLiveStockCommit={handleLiveStockCommit}
        onLiveDetailsCommit={handleLiveDetailsCommit}
        onLiveCancel={handleLiveCancel}
        onLivePaywave={startTapToPayPayment}
        onBoardSelect={(stoneId: number) => setSelectedStoneId(stoneId)}
        liveStones={liveStones}
        livePayLink={livePayLink}
        qrElement={qrElement}
        showPaywave={true}
        successNotification={successNotif}
      />

      <AnimatePresence>
        {showTapToPayOverlay && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ backgroundColor: "#060D1F" }}
          >
            <button
              onClick={closeTapToPayOverlay}
              className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <X className="h-4 w-4 text-white/60" />
            </button>
            <motion.div
              className="rounded-3xl p-10 max-w-sm w-full mx-6 text-center"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              style={{
                background: `linear-gradient(135deg, ${BRAND}14, ${BRAND}08)`,
                border: `1px solid ${BRAND}40`,
                boxShadow: `0 25px 50px rgba(0,0,0,0.6), 0 0 60px ${BRAND}18`,
              }}
            >
              {tapToPayStatus === "waiting" && (
                <div className="space-y-6">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                    style={{ border: `2px solid ${BRAND}60`, background: `${BRAND}10` }}
                  >
                    <Waves className="w-10 h-10 animate-pulse" style={{ color: BRAND }} />
                  </div>
                  <div>
                    <p className="text-white text-xl font-semibold">Hold to Card</p>
                    <p className="text-white/50 text-sm mt-2">Hold the top of your iPhone near the customer's card</p>
                  </div>
                </div>
              )}
              {tapToPayStatus === "processing" && (
                <div className="space-y-6">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    <Loader2 className="h-8 w-8 text-white/60 animate-spin" />
                  </div>
                  <div>
                    <p className="text-white text-xl font-semibold">Processing</p>
                    <p className="text-white/40 text-sm mt-2">Please wait...</p>
                  </div>
                </div>
              )}
              {tapToPayStatus === "completed" && (
                <div className="space-y-6">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                    style={{ background: `${BRAND}18`, border: `1px solid ${BRAND}40` }}
                  >
                    <CheckCircle className="h-8 w-8" style={{ color: BRAND }} />
                  </div>
                  <div>
                    <p className="text-white text-xl font-semibold">Payment Approved</p>
                    <p className="text-white/40 text-sm mt-2">Transaction complete</p>
                  </div>
                </div>
              )}
              {tapToPayStatus === "failed" && (
                <div className="space-y-6">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto bg-red-500/20"
                    style={{ border: "1px solid rgba(239,68,68,0.3)" }}
                  >
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  <div>
                    <p className="text-white text-xl font-semibold">Payment Declined</p>
                    <p className="text-white/40 text-sm mt-2">Please try again</p>
                  </div>
                  <button
                    onClick={closeTapToPayOverlay}
                    className="w-full py-3 rounded-2xl text-sm font-medium"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
