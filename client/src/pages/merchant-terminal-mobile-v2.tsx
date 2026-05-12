import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeDisplay } from "@/components/qr-code-display";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { useDeviceStatusMonitoring, useSSEConnectionMonitoring } from "@/components/notification-system";
import { getCurrentMerchantId } from "@/lib/auth";
import {
  Send, Loader2, CheckCircle, XCircle, QrCode, Smartphone,
  Split, MoreHorizontal, X, Waves, ChevronDown, Copy, CreditCard,
  Layers, Plus, Share2
} from "lucide-react";
import { Link } from "wouter";
import { isNativeIOS, canTapToPay } from "@/lib/native";

const transactionFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Please enter a valid price (e.g., 4.50)"),
  selectedStoneId: z.number().optional(),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

const BRAND = "#00DFC8";
const SURFACE = "rgba(26, 86, 255, 0.08)";
const BORDER = "rgba(26, 86, 255, 0.18)";

export default function MerchantTerminalMobile() {
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<"QR" | "NFC" | "TAP">("QR");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [qrCollapsed, setQrCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [nfcCapabilities, setNfcCapabilities] = useState<any>(null);
  const [nfcPaymentStatus, setNfcPaymentStatus] = useState<"idle" | "creating" | "ready" | "processing" | "completed" | "failed">("idle");
  const [nfcSession, setNfcSession] = useState<any>(null);
  const [showNfcOverlay, setShowNfcOverlay] = useState(false);

  const [tapToPayStatus, setTapToPayStatus] = useState<"idle" | "waiting" | "processing" | "completed" | "failed">("idle");
  const [tapToPayApproved, setTapToPayApproved] = useState<boolean | null>(null);
  const [showTapToPayOverlay, setShowTapToPayOverlay] = useState(false);

  const [selectedStoneId, setSelectedStoneId] = useState<number | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [successAmount, setSuccessAmount] = useState<string | null>(null);
  const prevTransactionStatusRef = useRef<string | null>(null);
  const successOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (activeTab === "NFC" && !nfcCapabilities) {
      fetch("/api/nfc/capabilities")
        .then(r => r.json())
        .then(caps => {
          setNfcCapabilities(caps);
          if (!caps.nfcSupported) {
            toast({ title: "NFC Not Supported", description: "Use QR code instead.", variant: "destructive" });
          }
        })
        .catch(console.error);
    }
  }, [activeTab, nfcCapabilities, toast]);

  if (!merchantId) {
    window.location.href = "/login";
    return <div>Redirecting...</div>;
  }

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: { itemName: "", price: "", selectedStoneId: undefined },
  });

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}`);
      if (!r.ok) throw new Error("Failed to fetch merchant");
      return r.json();
    },
  });

  const { data: activeTransaction } = useQuery({
    queryKey: ["/api/merchants", merchantId, "active-transaction"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/active-transaction`);
      if (!r.ok) throw new Error("Failed to fetch active transaction");
      return r.json();
    },
    refetchInterval: 3000,
  });

  const { data: taptStones = [], isLoading: taptStonesLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/tapt-stones`);
      if (!r.ok) throw new Error("Failed to fetch tapt stones");
      return r.json();
    },
  });

  const { data: allTransactions = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!r.ok) throw new Error("Failed to fetch transactions");
      return r.json();
    },
    refetchInterval: 5000,
  });

  const pendingCount = (allTransactions as any[]).filter(
    (tx: any) => tx.status === "pending" || tx.status === "processing"
  ).length;

  useEffect(() => {
    if (taptStones.length > 0 && selectedStoneId === null) {
      setSelectedStoneId(taptStones[0].id);
    }
  }, [taptStones, selectedStoneId]);

  const createTaptStoneMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/merchants/${merchantId}/tapt-stones`, {});
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "tapt-stones"] });
      toast({ title: "Success", description: "New tapt stone created!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create tapt stone", variant: "destructive" });
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
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
      form.reset();
      toast({ title: "Transaction Created", description: "Customer can now proceed with payment" });
      setActiveAction(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create transaction", variant: "destructive" });
    },
  });

  useEffect(() => {
    sseClient.connect(merchantId);
    sseClient.subscribe("transaction_updated", (message) => {
      queryClient.setQueryData(["/api/merchants", merchantId, "active-transaction"], message.transaction ?? null);
    });
    return () => { sseClient.disconnect(); };
  }, [merchantId, queryClient]);

  useDeviceStatusMonitoring();
  useSSEConnectionMonitoring(merchantId);

  useEffect(() => {
    const prev = prevTransactionStatusRef.current;
    const status = activeTransaction?.status ?? null;
    if (status === "completed" && prev && prev !== "completed") {
      playSuccessChime();
      if (activeTransaction?.price) setSuccessAmount(parseFloat(activeTransaction.price).toFixed(2));
      form.reset();
      setCurrentTransaction(null);
      setShowSuccessOverlay(true);
      if (successOverlayTimerRef.current) clearTimeout(successOverlayTimerRef.current);
      successOverlayTimerRef.current = setTimeout(() => setShowSuccessOverlay(false), 5000);
      prevTransactionStatusRef.current = "completed";
      return;
    }
    if (!activeTransaction || status === "completed") return;
    setCurrentTransaction(activeTransaction);
    prevTransactionStatusRef.current = status;
  }, [activeTransaction]);

  const onSubmit = (data: TransactionFormData) => createTransactionMutation.mutate(data);

  const handleActionClick = (action: string) => {
    setActiveAction(prev => (prev === action ? null : action));
  };

  const createNFCPayment = async () => {
    const transaction = currentTransaction ?? (
      activeTransaction?.status === "pending" || activeTransaction?.status === "processing"
        ? activeTransaction : null
    );
    if (!transaction) {
      toast({ title: "No Transaction", description: "Create a transaction first.", variant: "destructive" });
      return;
    }
    setNfcPaymentStatus("creating");
    try {
      const r = await fetch(`/api/merchants/${merchantId}/nfc-pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(transaction.price),
          itemName: transaction.itemName,
          deviceId: navigator.userAgent,
          nfcCapabilities,
        }),
      });
      if (!r.ok) throw new Error("Failed to create NFC payment session");
      const result = await r.json();
      setNfcSession(result.nfcSession);
      setNfcPaymentStatus("ready");
      setShowNfcOverlay(true);
      toast({ title: "Payment Terminal Ready", description: "Ask customer to tap their card." });
    } catch {
      setNfcPaymentStatus("failed");
      toast({ title: "Payment Failed", description: "Could not create NFC payment session.", variant: "destructive" });
    }
  };

  const simulateNFCTap = async () => {
    if (!nfcSession) return;
    setNfcPaymentStatus("processing");
    try {
      await new Promise(r => setTimeout(r, 2000));
      const r = await fetch(`/api/nfc-sessions/${nfcSession.sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: "contactless_card", cardLast4: "4532", deviceId: navigator.userAgent }),
      });
      if (!r.ok) throw new Error("Failed to complete NFC payment");
      setNfcPaymentStatus("completed");
      toast({ title: "Payment Received!", description: `Customer paid $${nfcSession.amount} successfully` });
      setTimeout(() => resetNfcPayment(), 4000);
    } catch {
      setNfcPaymentStatus("failed");
      toast({ title: "Payment Failed", description: "Ask customer to try again.", variant: "destructive" });
    }
  };

  const resetNfcPayment = () => { setNfcPaymentStatus("idle"); setNfcSession(null); setShowNfcOverlay(false); };
  const closeNfcOverlay = () => { setShowNfcOverlay(false); resetNfcPayment(); };

  const startTapToPayPayment = async () => {
    const transaction = currentTransaction ?? (
      activeTransaction?.status === "pending" || activeTransaction?.status === "processing"
        ? activeTransaction : null
    );
    if (!transaction) {
      toast({ title: "No Transaction", description: "Create a transaction first.", variant: "destructive" });
      return;
    }
    setTapToPayStatus("waiting");
    setTapToPayApproved(null);
    setShowTapToPayOverlay(true);
    try {
      let bridgeResult: { approved: boolean; token?: string; cancelled?: boolean; error?: string };
      if (canTapToPay()) {
        bridgeResult = await window.TaptPay!.startTapToPay({
          amount: parseFloat(transaction.price),
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
        body: JSON.stringify({ merchantId, transactionId: transaction.id, amount: parseFloat(transaction.price), windcaveToken: bridgeResult.token }),
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

  const closeTapToPayOverlay = () => { setShowTapToPayOverlay(false); setTapToPayStatus("idle"); setTapToPayApproved(null); };

  const txToShow = showSuccessOverlay ? null : (
    currentTransaction ??
    (activeTransaction?.status === "pending" || activeTransaction?.status === "processing" ? activeTransaction : null)
  );

  const statusConfig: Record<string, { color: string; label: string; pulse: boolean }> = {
    pending:    { color: "#3B82F6", label: "Awaiting Payment", pulse: true },
    processing: { color: "#F59E0B", label: "Processing",       pulse: true },
    completed:  { color: BRAND,    label: "Complete",          pulse: false },
    failed:     { color: "#EF4444", label: "Failed",           pulse: false },
  };

  const txStatus = txToShow?.status ?? "pending";
  const sc = statusConfig[txStatus] ?? statusConfig.pending;

  if (isMobile) {
    return (
      <>
        <AnimatePresence>
          {showSuccessOverlay && (
            <motion.div
              className="fixed inset-0 z-[999] flex items-center justify-center pointer-events-none"
              initial={{ backgroundColor: "rgba(0,0,0,0)" }}
              animate={{ backgroundColor: "rgba(0,0,0,0.78)" }}
              exit={{ backgroundColor: "rgba(0,0,0,0)", transition: { duration: 0.4 } }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{ border: `1.5px solid ${BRAND}` }}
                  initial={{ width: 128, height: 128, opacity: 0.7 }}
                  animate={{ width: 340 + i * 70, height: 340 + i * 70, opacity: 0 }}
                  transition={{ delay: 0.15 + i * 0.18, duration: 1.1, ease: "easeOut" }}
                />
              ))}
              <div className="flex flex-col items-center gap-5 relative z-10">
                <motion.div
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: 128, height: 128,
                    background: `conic-gradient(from 180deg, ${BRAND}, #00CFFF, ${BRAND})`,
                    boxShadow: `0 0 60px ${BRAND}55, 0 0 120px ${BRAND}22`,
                  }}
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.05 }}
                >
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <motion.path
                      d="M14 32 L26 44 L50 20"
                      stroke="black"
                      strokeWidth="5.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.32, duration: 0.38, ease: "easeOut" }}
                    />
                  </svg>
                </motion.div>
                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45, duration: 0.3, ease: "easeOut" }}
                >
                  <p className="text-white text-2xl font-bold tracking-tight">Payment Received</p>
                  {successAmount && (
                    <p className="mt-1 font-bold tabular-nums" style={{ fontSize: 36, color: BRAND, letterSpacing: "-1px" }}>
                      ${successAmount}
                    </p>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-h-screen text-white" style={{ background: "#060D1F" }}>
          <div className="flex items-center justify-between px-5 pt-12 pb-2">
            <div className="flex rounded-full p-1 gap-0.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              {(["QR", "NFC", ...(isNativeIOS() ? ["TAP"] : [])] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
                  style={activeTab === tab ? { backgroundColor: BRAND, color: "#000" } : { color: "rgba(255,255,255,0.5)" }}
                >
                  {tab === "TAP" ? "Paywave" : tab}
                </button>
              ))}
            </div>

            <Link href="/transactions">
              <motion.button
                className="w-10 h-10 rounded-xl flex items-center justify-center relative"
                style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 600, damping: 26 }}
              >
                <Layers className="h-5 w-5 text-white/70" />
                <AnimatePresence>
                  {pendingCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-black text-[10px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: BRAND }}
                    >
                      {pendingCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </Link>
          </div>

          <div className="px-6 pt-6 pb-4 text-center">
            {txToShow ? (
              <>
                <p className="text-white/40 text-xs uppercase tracking-[0.2em] mb-2">Total Due</p>
                <div className="text-white font-bold tabular-nums" style={{ fontSize: "clamp(56px,15vw,80px)", lineHeight: 1, letterSpacing: "-2px" }}>
                  ${parseFloat(txToShow.price).toFixed(2)}
                </div>
                <p className="text-white/50 text-base mt-2">{txToShow.itemName}</p>
                <div
                  className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: `${sc.color}22`, border: `1px solid ${sc.color}55`, color: sc.color }}
                >
                  {sc.pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: sc.color }} />}
                  {sc.label}
                </div>
              </>
            ) : (
              <>
                <p className="text-white/20 text-xs uppercase tracking-[0.2em] mb-2">Ready to Charge</p>
                <div className="font-bold tabular-nums" style={{ fontSize: "clamp(56px,15vw,80px)", lineHeight: 1, letterSpacing: "-2px", color: "rgba(255,255,255,0.15)" }}>
                  $0.00
                </div>
                <p className="text-white/20 text-sm mt-2">No active transaction</p>
              </>
            )}
          </div>

          <div className="px-5 py-2">
            <div className="rounded-2xl p-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <div className="flex justify-around">
                {[
                  { id: "edit",  icon: Plus,          label: "New"   },
                  { id: "send",  icon: Share2,         label: "Share" },
                  { id: "split", icon: Split,          label: "Split" },
                  { id: "more",  icon: MoreHorizontal, label: "More"  },
                ].map(({ id, icon: Icon, label }) => {
                  const active = activeAction === id;
                  return (
                    <motion.button
                      key={id}
                      onClick={() => handleActionClick(id)}
                      className="flex flex-col items-center gap-1.5"
                      whileTap={{ scale: 0.86 }}
                      transition={{ type: "spring", stiffness: 600, damping: 26 }}
                    >
                      <motion.div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        animate={active ? { backgroundColor: BRAND, scale: 1.08 } : { backgroundColor: "rgba(255,255,255,0.08)", scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                      >
                        <Icon size={20} style={active ? { color: "#000" } : { color: "rgba(255,255,255,0.75)" }} />
                      </motion.div>
                      <span className="text-[11px] font-medium" style={{ color: active ? BRAND : "rgba(255,255,255,0.4)" }}>{label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {activeAction && (
              <motion.div
                className="px-5"
                key="action-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: "hidden" }}
              >
                <div className="rounded-2xl p-5 mt-2" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
                  {activeAction === "edit" && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-white/80 uppercase tracking-widest mb-3">New Transaction</h3>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                          <FormField control={form.control} name="itemName" render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="Item name" {...field}
                                  className="rounded-xl text-white placeholder:text-white/30 border-0"
                                  style={{ background: "rgba(255,255,255,0.08)" }} />
                              </FormControl>
                              <FormMessage className="text-red-400 text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="price" render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="0.00" {...field}
                                  className="rounded-xl text-white placeholder:text-white/30 border-0 text-center text-2xl font-bold"
                                  style={{ background: "rgba(255,255,255,0.08)" }} />
                              </FormControl>
                              <FormMessage className="text-red-400 text-xs" />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="selectedStoneId" render={({ field }) => (
                            <FormItem>
                              <Select onValueChange={(v) => field.onChange(v ? parseInt(v) : undefined)} value={field.value?.toString() || ""}>
                                <FormControl>
                                  <SelectTrigger className="rounded-xl text-white border-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                                    <SelectValue placeholder="Tapt Stone (optional)" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="border-0" style={{ background: "#1a1a1a" }}>
                                  <SelectItem value="none">No specific stone</SelectItem>
                                  {taptStones.map((s: any) => (
                                    <SelectItem key={s.id} value={s.id.toString()}>{s.name} (Stone {s.stoneNumber})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )} />
                          <Button type="submit" disabled={createTransactionMutation.isPending}
                            className="w-full rounded-xl font-semibold text-black border-0"
                            style={{ backgroundColor: BRAND }}>
                            {createTransactionMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create Transaction"}
                          </Button>
                        </form>
                      </Form>
                    </div>
                  )}

                  {activeAction === "split" && (
                    <div className="text-center space-y-4">
                      <h3 className="text-sm font-semibold text-white/80 uppercase tracking-widest">Split the Bill</h3>
                      <p className="text-white/40 text-sm">How many ways?</p>
                      <div className="flex justify-center gap-3">
                        {[2, 3, 4, 5].map((num) => (
                          <button key={num}
                            onClick={() => { toast({ title: "Bill Split", description: `Split ${num} ways` }); setActiveAction(null); }}
                            className="w-12 h-12 rounded-full font-bold text-black transition-all hover:scale-105"
                            style={{ backgroundColor: BRAND }}>
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeAction === "send" && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-white/80 uppercase tracking-widest mb-3">
                        {activeTab === "NFC" ? "NFC Payment" : "Share Payment"}
                      </h3>
                      {activeTab === "NFC" ? (
                        txToShow ? (
                          <div className="space-y-3">
                            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                              <p className="text-white/50 text-xs">{txToShow.itemName}</p>
                              <p className="text-white text-xl font-bold">${txToShow.price}</p>
                            </div>
                            <Button onClick={() => { createNFCPayment(); setActiveAction(null); }}
                              disabled={nfcPaymentStatus === "creating"}
                              className="w-full rounded-xl text-black font-semibold border-0"
                              style={{ backgroundColor: BRAND }}>
                              {nfcPaymentStatus === "creating" ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Starting...</> : "Start NFC Payment"}
                            </Button>
                          </div>
                        ) : <p className="text-white/40 text-sm text-center">Create a transaction first</p>
                      ) : (
                        taptStones.length > 0 ? (
                          <div className="space-y-2">
                            {taptStones.map((stone: any) => {
                              const url = stone.paymentUrl?.replace(/\/pay\//, "/nfc/") ?? stone.paymentUrl;
                              return (
                                <button key={stone.id}
                                  onClick={() => {
                                    navigator.clipboard.writeText(url);
                                    setCopiedLink(true);
                                    setTimeout(() => setCopiedLink(false), 2000);
                                    toast({ title: "Link Copied", description: `${stone.name} link copied` });
                                    setActiveAction(null);
                                  }}
                                  className="w-full p-3 rounded-xl text-sm font-semibold text-black transition-all hover:scale-[1.02]"
                                  style={{ backgroundColor: BRAND }}>
                                  Copy {stone.name} Link
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <Button onClick={() => {
                            if (merchant?.paymentUrl) {
                              const url = merchant.paymentUrl.replace(/\/pay\//, "/nfc/");
                              navigator.clipboard.writeText(url);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                              toast({ title: "Link Copied", description: "Payment link copied" });
                            }
                            setActiveAction(null);
                          }} className="w-full rounded-xl text-black font-semibold border-0" style={{ backgroundColor: BRAND }}>
                            <Copy className="w-4 h-4 mr-2" />{copiedLink ? "Copied!" : "Copy Payment Link"}
                          </Button>
                        )
                      )}
                    </div>
                  )}

                  {activeAction === "more" && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-white/80 uppercase tracking-widest mb-3">More</h3>
                      <button
                        onClick={() => { localStorage.removeItem("authToken"); window.location.href = "/login"; }}
                        className="w-full py-3 px-4 rounded-xl text-sm text-red-400 hover:bg-red-500/10 text-left transition-colors"
                        style={{ border: `1px solid rgba(239,68,68,0.2)` }}>
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {activeTab === "QR" && (
            <div className="px-5 pb-32 mt-2">
              <div className="rounded-2xl overflow-hidden" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                <button
                  className="w-full flex items-center justify-between px-5 py-4"
                  onClick={() => setQrCollapsed(prev => !prev)}
                >
                  <span className="text-sm font-semibold text-white/80 uppercase tracking-widest">QR Codes</span>
                  <motion.div animate={{ rotate: qrCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-white/40" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {!qrCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="px-4 pb-4 space-y-4">
                        {taptStones.map((stone: any) => (
                          <div key={stone.id} className="rounded-xl overflow-hidden bg-white p-4">
                            <p className="text-center text-black font-semibold text-sm mb-3">Stone #{stone.stoneNumber}</p>
                            <div className="w-40 h-40 mx-auto bg-white rounded-lg p-2 border border-gray-100 shadow-sm">
                              <QRCodeDisplay merchantId={merchantId} stoneId={stone.id} />
                            </div>
                            <div className="text-center mt-3">
                              <button
                                onClick={async () => {
                                  try {
                                    const downloadUrl = `/api/merchants/${merchantId}/stone/${stone.id}/qr?size=800&download=true`;
                                    const response = await fetch(downloadUrl);
                                    if (!response.ok) throw new Error("Failed to fetch QR code");
                                    const blob = await response.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const link = document.createElement("a");
                                    link.href = url;
                                    link.download = `tapt-payment-qr-stone-${stone.stoneNumber}.png`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    window.URL.revokeObjectURL(url);
                                    toast({ title: "QR Code Downloaded", description: `Stone ${stone.stoneNumber} QR code saved` });
                                  } catch {
                                    toast({ title: "Download Failed", description: "Could not download QR code", variant: "destructive" });
                                  }
                                }}
                                className="px-4 py-2 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                              >
                                Download QR
                              </button>
                            </div>
                            <p className="text-center text-gray-500 text-xs mt-2">Scan to pay with {stone.name}</p>
                          </div>
                        ))}
                        {txToShow && taptStones.length < 10 && (
                          <button
                            onClick={() => createTaptStoneMutation.mutate()}
                            disabled={createTaptStoneMutation.isPending}
                            className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                            style={{ background: "rgba(255,255,255,0.06)", border: `1px dashed ${BORDER}`, color: "rgba(255,255,255,0.5)" }}
                          >
                            {createTaptStoneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "+ Add Tapt Stone"}
                          </button>
                        )}
                        {taptStones.length === 0 && (
                          <div className="text-center py-8">
                            <Smartphone size={40} className="mx-auto mb-3 text-white/20" />
                            <p className="text-white/30 text-sm">Create a stone to enable NFC payments</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {activeTab === "NFC" && (
            <div className="px-5 pb-32 mt-2">
              <div className="rounded-2xl overflow-hidden" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                <button
                  className="w-full flex items-center justify-between px-5 py-4"
                  onClick={() => setQrCollapsed(prev => !prev)}
                >
                  <span className="text-sm font-semibold text-white/80 uppercase tracking-widest">NFC Stones</span>
                  <motion.div animate={{ rotate: qrCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-white/40" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {!qrCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="px-4 pb-4 space-y-3">
                        {taptStones.map((stone: any) => (
                          <div key={stone.id}>
                            <button
                              onClick={() => setSelectedStoneId(selectedStoneId === stone.id ? null : stone.id)}
                              className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-semibold text-sm transition-all"
                              style={{ backgroundColor: BRAND, color: "#000" }}
                            >
                              <span>Stone #{stone.stoneNumber}</span>
                              <motion.div animate={{ rotate: selectedStoneId === stone.id ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                <ChevronDown className="h-4 w-4" />
                              </motion.div>
                            </button>
                            <AnimatePresence>
                              {selectedStoneId === stone.id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  style={{ overflow: "hidden" }}
                                  className="mt-2"
                                >
                                  <div style={{ background: `${BRAND}0a`, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }} className="text-center">
                                    <Smartphone size={48} className="mx-auto mb-3 text-white/20" />
                                    <p className="text-white/40 text-sm">Create a transaction for NFC payment</p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                        {taptStones.length === 0 && (
                          <div className="text-center py-8">
                            <QrCode size={40} className="mx-auto mb-3 text-white/20" />
                            <p className="text-white/30 text-sm">No tapt stones available</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {activeTab === "TAP" && isNativeIOS() && (
            <div className="px-5 pb-32 mt-2">
              <div className="rounded-2xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-center gap-2 mb-5">
                  <Waves size={18} style={{ color: BRAND }} />
                  <h3 className="text-sm font-semibold text-white/80 uppercase tracking-widest">Paywave</h3>
                </div>
                {txToShow ? (
                  <div className="text-center space-y-4">
                    <p className="text-white/50 text-sm">{txToShow.itemName}</p>
                    <p className="text-white font-bold text-4xl">${parseFloat(txToShow.price).toFixed(2)}</p>
                    <p className="text-white/30 text-xs leading-relaxed">Hold your iPhone near the customer's card or device</p>
                    <button
                      onClick={startTapToPayPayment}
                      className="w-full py-4 rounded-2xl font-semibold text-sm text-black flex items-center justify-center gap-2 transition-all active:scale-95"
                      style={{ backgroundColor: BRAND, boxShadow: `0 4px 20px ${BRAND}44` }}
                    >
                      <CreditCard size={18} />
                      Start Paywave Payment
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-6 space-y-3">
                    <CreditCard size={40} className="mx-auto text-white/20" />
                    <p className="text-white/30 text-sm">Create a transaction to enable Paywave</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <AnimatePresence>
            {showTapToPayOverlay && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center"
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
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{ border: `2px solid ${BRAND}60`, background: `${BRAND}10` }}>
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
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
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
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{ background: `${BRAND}18`, border: `1px solid ${BRAND}40` }}>
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
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto bg-red-500/20"
                        style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
                        <XCircle className="h-8 w-8 text-red-400" />
                      </div>
                      <div>
                        <p className="text-white text-xl font-semibold">Payment Declined</p>
                        <p className="text-white/40 text-sm mt-2">Please try again</p>
                      </div>
                      <button
                        onClick={closeTapToPayOverlay}
                        className="w-full py-3 rounded-2xl text-sm font-medium"
                        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showNfcOverlay && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ backgroundColor: "#060D1F" }}
              >
                <button
                  onClick={closeNfcOverlay}
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
                  {nfcPaymentStatus === "ready" && (
                    <div className="space-y-6">
                      <div>
                        <p className="text-white font-extralight tabular-nums" style={{ fontSize: 52, letterSpacing: "-2px" }}>
                          ${nfcSession?.amount}
                        </p>
                        <p className="text-white/50 text-base mt-1">{nfcSession?.itemName}</p>
                      </div>
                      <div>
                        <p className="text-xl font-light tracking-widest uppercase" style={{ color: BRAND }}>Tap Card Here</p>
                        <p className="text-white/40 text-sm mt-2">Present your card or device</p>
                      </div>
                      <button
                        onClick={simulateNFCTap}
                        className="w-full py-3 rounded-2xl text-sm font-medium"
                        style={{ background: `${BRAND}18`, border: `1px solid ${BRAND}40`, color: "rgba(255,255,255,0.8)" }}
                      >
                        Simulate Payment
                      </button>
                    </div>
                  )}
                  {nfcPaymentStatus === "processing" && (
                    <div className="space-y-6">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                        <Loader2 className="h-8 w-8 text-white/60 animate-spin" />
                      </div>
                      <div>
                        <p className="text-white text-xl font-semibold">Processing Payment</p>
                        <p className="text-white/40 text-sm mt-2">Please wait...</p>
                      </div>
                    </div>
                  )}
                  {nfcPaymentStatus === "completed" && (
                    <div className="space-y-6">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{ background: `${BRAND}18`, border: `1px solid ${BRAND}40` }}>
                        <CheckCircle className="h-8 w-8" style={{ color: BRAND }} />
                      </div>
                      <div>
                        <p className="text-white text-xl font-semibold">Payment Successful</p>
                        <p className="text-white/40 text-sm mt-2">Transaction completed</p>
                      </div>
                    </div>
                  )}
                  {nfcPaymentStatus === "failed" && (
                    <div className="space-y-6">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto bg-red-500/20"
                        style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
                        <XCircle className="h-8 w-8 text-red-400" />
                      </div>
                      <div>
                        <p className="text-white text-xl font-semibold">Payment Failed</p>
                        <p className="text-white/40 text-sm mt-2">Please try again</p>
                      </div>
                      <button
                        onClick={resetNfcPayment}
                        className="w-full py-3 rounded-2xl text-sm font-medium"
                        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
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
      </>
    );
  }

  // Desktop fallback
  return (
    <div className="min-h-screen text-white" style={{ background: "#060D1F" }}>
      <div className="max-w-lg mx-auto px-6 pt-16 pb-8">
        <div className="text-center mb-8">
          {txToShow ? (
            <>
              <p className="text-white/40 text-xs uppercase tracking-[0.2em] mb-3">Total Due</p>
              <div className="text-white font-bold tabular-nums" style={{ fontSize: 72, lineHeight: 1, letterSpacing: "-2px" }}>
                ${parseFloat(txToShow.price).toFixed(2)}
              </div>
              <p className="text-white/50 text-base mt-3">{txToShow.itemName}</p>
              <div
                className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: `${sc.color}22`, border: `1px solid ${sc.color}55`, color: sc.color }}
              >
                {sc.pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: sc.color }} />}
                {sc.label}
              </div>
            </>
          ) : (
            <>
              <p className="text-white/20 text-xs uppercase tracking-[0.2em] mb-3">Ready to Charge</p>
              <div className="font-bold tabular-nums" style={{ fontSize: 72, lineHeight: 1, letterSpacing: "-2px", color: "rgba(255,255,255,0.15)" }}>
                $0.00
              </div>
              <p className="text-white/20 text-sm mt-3">No active transaction</p>
            </>
          )}
        </div>

        <div className="rounded-2xl p-6 mb-6" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-4">New Transaction</h3>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField control={form.control} name="itemName" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder="Item name" {...field}
                      className="rounded-xl text-white placeholder:text-white/30 border-0"
                      style={{ background: "rgba(255,255,255,0.08)" }} />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )} />
              <FormField control={form.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder="0.00" {...field}
                      className="rounded-xl text-white placeholder:text-white/30 border-0 text-center text-2xl font-bold"
                      style={{ background: "rgba(255,255,255,0.08)" }} />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )} />
              <FormField control={form.control} name="selectedStoneId" render={({ field }) => (
                <FormItem>
                  <Select onValueChange={(v) => field.onChange(v ? parseInt(v) : undefined)} value={field.value?.toString() || ""}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl text-white border-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <SelectValue placeholder="Tapt Stone (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="border-0" style={{ background: "#1a1a1a" }}>
                      <SelectItem value="none">No specific stone</SelectItem>
                      {taptStones.map((s: any) => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.name} (Stone {s.stoneNumber})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <Button type="submit" disabled={createTransactionMutation.isPending}
                className="w-full rounded-xl font-semibold text-black border-0"
                style={{ backgroundColor: BRAND }}>
                {createTransactionMutation.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
                  : <><Send className="mr-2 h-4 w-4" />Create Transaction</>}
              </Button>
            </form>
          </Form>
        </div>

        <AnimatePresence>
          {showNfcOverlay && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ backgroundColor: "#060D1F" }}
            >
              <button onClick={closeNfcOverlay}
                className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                <X className="h-4 w-4 text-white/60" />
              </button>
              <motion.div
                className="rounded-3xl p-14 max-w-md w-full mx-8 text-center"
                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                style={{ background: `linear-gradient(135deg, ${BRAND}14, ${BRAND}08)`, border: `1px solid ${BRAND}40`, boxShadow: `0 25px 50px rgba(0,0,0,0.6)` }}
              >
                {nfcPaymentStatus === "ready" && (
                  <div className="space-y-8">
                    <div>
                      <p className="text-white font-extralight tabular-nums" style={{ fontSize: 64, letterSpacing: "-2px" }}>${nfcSession?.amount}</p>
                      <p className="text-white/50 text-lg mt-1">{nfcSession?.itemName}</p>
                    </div>
                    <p className="text-2xl font-light tracking-widest uppercase" style={{ color: BRAND }}>Tap Card Here</p>
                    <button onClick={simulateNFCTap}
                      className="w-full py-4 rounded-2xl text-sm font-medium"
                      style={{ background: `${BRAND}18`, border: `1px solid ${BRAND}40`, color: "rgba(255,255,255,0.8)" }}>
                      Simulate Payment
                    </button>
                  </div>
                )}
                {nfcPaymentStatus === "processing" && (
                  <div className="space-y-8">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      <Loader2 className="h-10 w-10 text-white/60 animate-spin" />
                    </div>
                    <p className="text-white text-2xl font-light">Processing Payment</p>
                  </div>
                )}
                {nfcPaymentStatus === "completed" && (
                  <div className="space-y-8">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                      style={{ background: `${BRAND}18`, border: `1px solid ${BRAND}40` }}>
                      <CheckCircle className="h-10 w-10" style={{ color: BRAND }} />
                    </div>
                    <p className="text-white text-2xl font-light">Payment Successful</p>
                  </div>
                )}
                {nfcPaymentStatus === "failed" && (
                  <div className="space-y-8">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto bg-red-500/20"
                      style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
                      <XCircle className="h-10 w-10 text-red-400" />
                    </div>
                    <p className="text-white text-2xl font-light">Payment Failed</p>
                    <button onClick={resetNfcPayment}
                      className="w-full py-4 rounded-2xl text-sm font-medium"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}>
                      Try Again
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSuccessOverlay && (
            <motion.div
              className="fixed inset-0 z-[999] flex items-center justify-center pointer-events-none"
              initial={{ backgroundColor: "rgba(0,0,0,0)" }}
              animate={{ backgroundColor: "rgba(0,0,0,0.78)" }}
              exit={{ backgroundColor: "rgba(0,0,0,0)" }}
            >
              <div className="flex flex-col items-center gap-5">
                <motion.div
                  className="rounded-full flex items-center justify-center"
                  style={{ width: 128, height: 128, background: `conic-gradient(from 180deg, ${BRAND}, #00CFFF, ${BRAND})`, boxShadow: `0 0 60px ${BRAND}55` }}
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18 }}
                >
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <motion.path d="M14 32 L26 44 L50 20" stroke="black" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.38 }} />
                  </svg>
                </motion.div>
                <motion.div className="text-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                  <p className="text-white text-2xl font-bold">Payment Received</p>
                  {successAmount && <p className="mt-1 font-bold tabular-nums" style={{ fontSize: 36, color: BRAND }}>${successAmount}</p>}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
