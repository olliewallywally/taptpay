import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { useDeviceStatusMonitoring, useSSEConnectionMonitoring } from "@/components/notification-system";
import { getCurrentMerchantId } from "@/lib/auth";
import { canTapToPay } from "@/lib/native";
import { QRCodeDisplay } from "@/components/qr-code-display";
import SmartTransitions from "@/components/SmartTransitions";

const BRAND = "#00DFC8";

export default function MerchantTerminalMobile() {
  const merchantId = getCurrentMerchantId();

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

  if (!merchantId) {
    window.location.href = "/login";
    return <div>Redirecting...</div>;
  }

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useDeviceStatusMonitoring();
  useSSEConnectionMonitoring(merchantId);

  const [selectedStoneId, setSelectedStoneId] = useState<number | null>(null);
  const [successNotif, setSuccessNotif] = useState<{ id: number; message: string; amount: string } | null>(null);
  const [showTapToPayOverlay, setShowTapToPayOverlay] = useState(false);
  const [tapToPayStatus, setTapToPayStatus] = useState<"idle" | "waiting" | "processing" | "completed" | "failed">("idle");
  const [tapToPayApproved, setTapToPayApproved] = useState<boolean | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const { data: merchant } = useQuery<any>({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
      });
      if (!r.ok) throw new Error("Failed to fetch merchant");
      return r.json();
    },
  });

  const { data: activeTransaction } = useQuery<any>({
    queryKey: ["/api/merchants", merchantId, "active-transaction"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/active-transaction`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
      });
      if (!r.ok) throw new Error("Failed to fetch active transaction");
      return r.json();
    },
    refetchInterval: 3000,
  });

  const { data: taptStones = [] } = useQuery<any[]>({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/tapt-stones`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
      });
      if (!r.ok) throw new Error("Failed to fetch tapt stones");
      return r.json();
    },
  });

  const { data: allTransactions = [] } = useQuery<any[]>({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
      });
      if (!r.ok) throw new Error("Failed to fetch transactions");
      return r.json();
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (taptStones.length > 0 && selectedStoneId === null) {
      setSelectedStoneId(taptStones[0].id);
    }
  }, [taptStones, selectedStoneId]);

  useEffect(() => {
    sseClient.connect(merchantId);
    const handler = (message: any) => {
      queryClient.setQueryData(
        ["/api/merchants", merchantId, "active-transaction"],
        message.transaction ?? null
      );
    };
    sseClient.subscribe("transaction_updated", handler);
    return () => {
      sseClient.unsubscribe("transaction_updated", handler);
      sseClient.disconnect();
    };
  }, [merchantId, queryClient]);

  useEffect(() => {
    const status = activeTransaction?.status ?? null;
    const prev = prevStatusRef.current;
    if (status === "completed" && prev && prev !== "completed") {
      playSuccessChime();
      setSuccessNotif({
        id: Date.now(),
        message: `${activeTransaction.itemName} paid`,
        amount: parseFloat(activeTransaction.price).toFixed(2),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
    }
    prevStatusRef.current = status;
  }, [activeTransaction, merchantId, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: async (txId: number) => {
      await apiRequest("POST", `/api/transactions/${txId}/cancel`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not cancel transaction", variant: "destructive" });
    },
  });

  const createTransaction = async (itemName: string, price: string, stoneId?: number | null) => {
    const r = await apiRequest("POST", "/api/transactions", {
      merchantId,
      itemName,
      price,
      status: "pending",
      ...(stoneId ? { selectedStoneId: stoneId } : {}),
    });
    const tx = await r.json();
    queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
    return tx;
  };

  const handleLiveCommit = async (cents: number) => {
    await createTransaction("custom item", (cents / 100).toFixed(2), selectedStoneId);
  };

  const handleLiveStockCommit = async (picks: any[]) => {
    const name = picks.map((p: any) => p.qty > 1 ? `${p.name} x${p.qty}` : p.name).join(", ");
    const totalCents = picks.reduce((s: number, p: any) => s + p.amount * p.qty, 0);
    await createTransaction(name, (totalCents / 100).toFixed(2), selectedStoneId);
  };

  const handleLiveDetailsCommit = async ({ name, amount }: { name: string; amount: number }) => {
    await createTransaction(name, (amount / 100).toFixed(2), selectedStoneId);
  };

  const handleLiveCancel = () => {
    if (activeTransaction?.id) cancelMutation.mutate(activeTransaction.id);
  };

  const handleLivePaywave = async () => {
    if (!activeTransaction) return;
    setTapToPayStatus("waiting");
    setTapToPayApproved(null);
    setShowTapToPayOverlay(true);
    try {
      let bridgeResult: { approved: boolean; token?: string; cancelled?: boolean; error?: string };
      if (canTapToPay()) {
        bridgeResult = await window.TaptPay!.startTapToPay({
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
        throw new Error((errData as any).message || `Processor error (${r.status})`);
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
      setTimeout(() => { setShowTapToPayOverlay(false); setTapToPayStatus("idle"); setTapToPayApproved(null); }, 3500);
    }
  };

  const pending = activeTransaction && (activeTransaction.status === "pending" || activeTransaction.status === "processing")
    ? {
        id: String(activeTransaction.id),
        name: activeTransaction.itemName,
        amount: Math.round(parseFloat(activeTransaction.price) * 100),
      }
    : null;

  const sent = (allTransactions || [])
    .filter((t: any) => t.status === "completed")
    .slice(0, 5)
    .map((t: any) => ({
      id: String(t.id),
      name: t.itemName,
      amount: Math.round(parseFloat(t.price) * 100),
      status: "sent" as const,
    }));

  const liveState = { items: [], pending, sent };

  const selectedStone = (taptStones || []).find((s: any) => s.id === selectedStoneId);
  const livePayLink = selectedStone?.paymentUrl
    ? `${window.location.origin}${selectedStone.paymentUrl}`
    : merchant?.paymentUrl
    ? `${window.location.origin}${merchant.paymentUrl}`
    : null;

  const qrElement = (
    <QRCodeDisplay merchantId={merchantId} stoneId={selectedStoneId} />
  );

  return (
    <>
      <AnimatePresence>
        {showTapToPayOverlay && (
          <motion.div
            className="fixed inset-0 z-[999] flex flex-col items-center justify-center"
            style={{ background: "#060D1F" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {tapToPayStatus === "waiting" && (
              <>
                <div className="w-32 h-32 rounded-full border-4 flex items-center justify-center mb-6"
                  style={{ borderColor: BRAND, boxShadow: `0 0 60px ${BRAND}44` }}>
                  <div className="w-16 h-16 rounded-full animate-ping" style={{ background: `${BRAND}33` }} />
                </div>
                <p className="text-white text-xl font-bold">Hold iPhone to card</p>
                <p className="mt-2 text-sm" style={{ color: `${BRAND}99` }}>Waiting for tap...</p>
              </>
            )}
            {tapToPayStatus === "processing" && (
              <>
                <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-6"
                  style={{ borderColor: BRAND }} />
                <p className="text-white text-xl font-bold">Processing...</p>
              </>
            )}
            {tapToPayStatus === "completed" && (
              <>
                {[0, 1, 2].map(i => (
                  <motion.div key={i} className="absolute rounded-full"
                    style={{ border: `1.5px solid ${BRAND}` }}
                    initial={{ width: 128, height: 128, opacity: 0.7 }}
                    animate={{ width: 340 + i * 70, height: 340 + i * 70, opacity: 0 }}
                    transition={{ delay: 0.15 + i * 0.18, duration: 1.1, ease: "easeOut" }}
                  />
                ))}
                <motion.div className="rounded-full flex items-center justify-center mb-6"
                  style={{ width: 128, height: 128, background: `conic-gradient(from 180deg, ${BRAND}, #00CFFF, ${BRAND})`, boxShadow: `0 0 60px ${BRAND}55` }}
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18 }}>
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <motion.path d="M14 32 L26 44 L50 20" stroke="black" strokeWidth="5.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ delay: 0.3, duration: 0.38, ease: "easeOut" }} />
                  </svg>
                </motion.div>
                <p className="text-white text-2xl font-bold">Payment Received</p>
              </>
            )}
            {tapToPayStatus === "failed" && (
              <>
                <div className="w-32 h-32 rounded-full flex items-center justify-center mb-6"
                  style={{ background: "rgba(239,68,68,0.15)", border: "2px solid #EF4444" }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6l12 12M18 6L6 18" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-white text-xl font-bold">Payment Failed</p>
                <p className="mt-2 text-sm text-red-400">Ask customer to try again</p>
              </>
            )}
            {(tapToPayStatus === "waiting") && (
              <button onClick={() => { setShowTapToPayOverlay(false); setTapToPayStatus("idle"); setTapToPayApproved(null); }}
                className="mt-10 px-6 py-3 rounded-full text-sm font-medium"
                style={{ border: `1px solid ${BRAND}55`, color: `${BRAND}99` }}>
                Cancel
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <SmartTransitions
        liveState={liveState}
        onLiveCommit={handleLiveCommit}
        onLiveStockCommit={handleLiveStockCommit}
        onLiveDetailsCommit={handleLiveDetailsCommit}
        onLiveCancel={handleLiveCancel}
        onLivePaywave={handleLivePaywave}
        onBoardSelect={(id: any) => {
          const stoneId = typeof id === "number" ? id : null;
          setSelectedStoneId(stoneId);
        }}
        liveStones={taptStones}
        livePayLink={livePayLink}
        qrElement={qrElement}
        showPaywave={canTapToPay()}
        successNotification={successNotif}
      />
    </>
  );
}
