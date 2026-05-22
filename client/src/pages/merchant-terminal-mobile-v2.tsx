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
      const authToken = localStorage.getItem("authToken");
      const r = await fetch(`/api/merchants/${merchantId}/tapt-stones`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!r.ok) throw new Error("Failed to fetch tapt stones");
      return r.json();
    },
    enabled: !!merchantId,
  });

  const { data: allTransactions = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const authToken = localStorage.getItem("authToken");
      const r = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
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
      const tx = message.transaction ?? null;
      queryClient.setQueryData(["/api/merchants", merchantId, "active-transaction"], tx);
      // Instantly push completed/failed/cancelled transactions into the allTransactions cache
      if (tx && ["completed", "failed", "cancelled"].includes(tx.status)) {
        queryClient.setQueryData<any[]>(
          ["/api/merchants", merchantId, "transactions"],
          (prev: any[] = []) => {
            const exists = prev.some((t: any) => t.id === tx.id);
            return exists
              ? prev.map((t: any) => (t.id === tx.id ? tx : t))
              : [tx, ...prev];
          }
        );
      }
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
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create transaction", variant: "destructive" });
    },
  });

  const createStoneMutation = useMutation({
    mutationFn: async () => {
      const stoneNumber = ((taptStones as any[])?.length || 0) + 1;
      const r = await apiRequest("POST", `/api/merchants/${merchantId}/tapt-stones`, {
        name: `Stone ${stoneNumber}`,
        stoneNumber,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "tapt-stones"] });
    },
  });

  const renameStoneMutation = useMutation({
    mutationFn: async ({ stoneId, name }: { stoneId: number; name: string }) => {
      const r = await apiRequest("PUT", `/api/merchants/${merchantId}/tapt-stones/${stoneId}`, { name });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "tapt-stones"] });
    },
  });

  const deleteStoneMutation = useMutation({
    mutationFn: async (stoneId: number) => {
      const r = await apiRequest("DELETE", `/api/merchants/${merchantId}/tapt-stones/${stoneId}`);
      return r.ok ? {} : r.json();
    },
    onSuccess: (_data, stoneId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "tapt-stones"] });
      if (selectedStoneId === stoneId) setSelectedStoneId(null);
    },
  });

  const cancelTransactionMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const r = await apiRequest("POST", `/api/transactions/${transactionId}/cancel`, {});
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel transaction", variant: "destructive" });
    },
  });

  const startTapToPayPayment = async (txOverride?: any) => {
    const tx = txOverride ?? activeTransaction;
    if (!tx) {
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
          amount: parseFloat(tx.price),
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
          transactionId: tx.id,
          amount: parseFloat(tx.price),
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

  const handleLiveSend = async (
    draft: { name: string; amount: number },
    options: { paywave?: boolean } = {}
  ) => {
    const newTx = await createTransactionMutation.mutateAsync({
      itemName: draft.name,
      price: (draft.amount / 100).toFixed(2),
      selectedStoneId: selectedStoneId ?? undefined,
    });
    if (options.paywave) {
      startTapToPayPayment(newTx);
    }
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
        onLiveSend={handleLiveSend}
        onLiveCancel={handleLiveCancel}
        onLivePaywave={startTapToPayPayment}
        onBoardSelect={(stoneId: number) => setSelectedStoneId(stoneId)}
        selectedStoneId={selectedStoneId}
        onStoneCreate={() => createStoneMutation.mutateAsync()}
        onStoneRename={(stoneId: number, name: string) => renameStoneMutation.mutateAsync({ stoneId, name })}
        onStoneDelete={(stoneId: number) => deleteStoneMutation.mutateAsync(stoneId)}
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
