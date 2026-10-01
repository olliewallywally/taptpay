import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { QRCodeDisplay } from "@/components/qr-code-display";
import {
  apiRequest,
  BillingCardRequiredError,
  isBillingCardRequired,
  notifyIfBillingCardRequired,
} from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { useDeviceStatusMonitoring, useSSEConnectionMonitoring } from "@/components/notification-system";
import { getCurrentMerchantId } from "@/lib/auth";
import { Loader2, CheckCircle, XCircle, Waves, X } from "lucide-react";
import { canTapToPay } from "@/lib/native";
import RetailTerminalView, {
  type RetailCreateOptions,
  type RetailReceipt,
  type RetailRefundIntent,
  type RetailSaleDraft,
  type RetailShareIntent,
  type RetailShareSale,
  type RetailTerminalState,
} from "@/features/terminal/retail/RetailTerminalView";
import { sessionFetch } from "@/lib/session";

const BRAND = "#00DFC8";

/*
 * A board-less sale's own link, as the server gave it once when the sale was made (only its
 * hash is kept there). This phone remembers it for its share page (owner decision 2026-09-25:
 * the share page's sale dropdown), until the sale is no longer open, and at most a day. It
 * lives in localStorage beside the login's own token, which can do far more.
 */
type SaleLink = { paymentUrl: string; qrCodeUrl: string; savedAt: number };
const SALE_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const OPEN_SALE_STATUSES = new Set(["pending", "processing"]);
const saleLinksKey = (merchantId: number) => `taptpay:retail-sale-links:v1:${merchantId}`;

function readSaleLinks(merchantId: number | null): Record<string, SaleLink> {
  if (!merchantId) return {};
  try {
    const stored = JSON.parse(localStorage.getItem(saleLinksKey(merchantId)) ?? "{}");
    const fresh: Record<string, SaleLink> = {};
    for (const [id, link] of Object.entries(stored as Record<string, SaleLink>)) {
      if (link && typeof link.paymentUrl === "string" && Date.now() - Number(link.savedAt) < SALE_LINK_TTL_MS) {
        fresh[id] = link;
      }
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeSaleLinks(merchantId: number | null, links: Record<string, SaleLink>) {
  if (!merchantId) return;
  try {
    if (Object.keys(links).length === 0) localStorage.removeItem(saleLinksKey(merchantId));
    else localStorage.setItem(saleLinksKey(merchantId), JSON.stringify(links));
  } catch {
    // Storage refused (private mode, quota): the links still serve this visit.
  }
}

async function handleBrowserShare(intent: RetailShareIntent): Promise<void> {
  if (intent.channel === "copy") {
    await navigator.clipboard?.writeText(intent.url).catch(() => {});
    return;
  }

  if (intent.channel === "download-qr") {
    // A real, scannable picture of exactly the link being shared (2026-09-25: this saved a
    // decorative QR that could not be scanned). Navy on white, for any screen or print.
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(intent.url, {
      width: 800,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#040D6D", light: "#FFFFFF" },
    });
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `${intent.kind}-qr.png`;
    anchor.click();
    return;
  }

  const subject = intent.kind === "receipt"
    ? "Your Receipt"
    : `Payment Request — $${(intent.amountCents / 100).toFixed(2)}`;
  const body = intent.kind === "receipt"
    ? `Your receipt: ${intent.url}`
    : `Pay here: ${intent.url}`;

  if (intent.channel === "email") {
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    return;
  }

  const isAppleDevice = /Mac|iPhone|iPad/.test(navigator.userAgent);
  window.open(`sms:${isAppleDevice ? "&" : "?"}body=${encodeURIComponent(body)}`);
}

export default function MerchantTerminalMobile() {
  const [selectedStoneId, setSelectedStoneId] = useState<number | null>(null);
  const [successNotif, setSuccessNotif] = useState<{ id: string; message: string; amount?: string } | null>(null);
  const prevTransactionStatusRef = useRef<string | null>(null);

  // The cash sale last recorded here, for the success screen and its receipt link.
  const [liveReceipt, setLiveReceipt] = useState<RetailReceipt | null>(null);

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
  const [, setLocation] = useLocation();
  const merchantId = getCurrentMerchantId();
  const [saleLinks, setSaleLinks] = useState<Record<string, SaleLink>>(() => readSaleLinks(merchantId));
  useEffect(() => {
    writeSaleLinks(merchantId, saleLinks);
  }, [merchantId, saleLinks]);

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", merchantId, "profile"],
    queryFn: async () => {
      const r = await sessionFetch(`/api/merchants/${merchantId}/profile`);
      if (!r.ok) throw new Error("Failed to fetch merchant");
      return r.json();
    },
    enabled: !!merchantId,
  });

  const { data: activeTransaction } = useQuery({
    queryKey: ["/api/merchants", merchantId, "active-transaction"],
    queryFn: async () => {
      // Signed in: this business's newest open sale, a board-less sale with its own link
      // included. The anonymous read of this address was retired on 2026-09-25.
      const r = await sessionFetch(`/api/merchants/${merchantId}/active-transaction`);
      if (!r.ok) throw new Error("Failed to fetch active transaction");
      return r.json();
    },
    // SSE keeps this cache live via queryClient.setQueryData — no polling needed.
    // A 30 s fallback refetch guards against SSE gaps (disconnect, reconnect lag).
    refetchInterval: 30000,
    enabled: !!merchantId,
  });

  const { data: taptStones = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const r = await sessionFetch(`/api/merchants/${merchantId}/tapt-stones`);
      if (!r.ok) throw new Error("Failed to fetch tapt stones");
      return r.json();
    },
    enabled: !!merchantId,
  });

  const { data: allTransactions = [], isSuccess: transactionsLoaded } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const r = await sessionFetch(`/api/merchants/${merchantId}/transactions`);
      if (!r.ok) throw new Error("Failed to fetch transactions");
      return r.json();
    },
    refetchInterval: 5000,
    enabled: !!merchantId,
  });

  // Forget a remembered link once its sale is no longer open.
  useEffect(() => {
    if (!transactionsLoaded) return;
    setSaleLinks((prev) => {
      let next = prev;
      for (const id of Object.keys(prev)) {
        const tx = (allTransactions as any[]).find((t: any) => String(t.id) === id);
        if (tx && !OPEN_SALE_STATUSES.has(tx.status)) {
          if (next === prev) next = { ...prev };
          delete next[id];
        }
      }
      return next;
    });
  }, [transactionsLoaded, allTransactions]);

  useEffect(() => {
    if ((taptStones as any[]).length > 0 && selectedStoneId === null) {
      setSelectedStoneId((taptStones as any[])[0].id);
    }
  }, [taptStones, selectedStoneId]);

  useEffect(() => {
    if (!merchantId) return;
    sseClient.connectMerchant(merchantId);
    sseClient.subscribe("transaction_updated", (message) => {
      const tx = message.transaction ?? null;
      queryClient.setQueryData(["/api/merchants", merchantId, "active-transaction"], tx);
      // Keep allTransactions cache in sync for all updates so split progress,
      // status changes, and completedSplits increments appear immediately.
      if (tx) {
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
    mutationFn: async (data: { itemName: string; price: string; selectedStoneId?: number; splitEnabled?: boolean }) => {
      const r = await apiRequest("POST", "/api/transactions", {
        merchantId,
        itemName: data.itemName,
        price: data.price,
        status: "pending",
        // Gap 12: mirror retail-terminal.tsx's destination-kind check — a
        // board selected means the existing shared standing address
        // ("legacy"); no board means mint a private per-sale link.
        ...(data.selectedStoneId
          ? { selectedStoneId: data.selectedStoneId, linkMode: "legacy" as const }
          : { linkMode: "per_payment" as const }),
        splitEnabled: data.splitEnabled ?? false,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
    },
    onError: (error) => {
      /* A billing 402 is stated once, by the billing banner apiRequest raises; the
         sale adds nothing and stays to send again (R1-T9). */
      if (isBillingCardRequired(error)) return;
      toast({ title: "Error", description: apiErrorMessage(error, "Failed to create transaction"), variant: "destructive" });
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
      const r = await sessionFetch("/api/transactions/tap-to-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId,
          transactionId: tx.id,
          amount: parseFloat(tx.price),
          windcaveToken: bridgeResult.token,
        }),
      });
      if (notifyIfBillingCardRequired(r)) throw new BillingCardRequiredError();
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
      /* A billing 402: the server refused before charging, so no card was
         declined. The billing banner says why (R1-T9); the overlay closes and the
         sale stays pending to take again. */
      if (isBillingCardRequired(err)) {
        setTapToPayStatus("idle");
        setShowTapToPayOverlay(false);
        return;
      }
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

  // Terminal always resets to $0.00 after send — sent transactions live in the stack, not the pending display
  const sent = (allTransactions as any[])
    .filter((tx: any) => ["pending", "processing", "completed", "failed"].includes(tx.status))
    .slice(0, 10)
    .map((tx: any) => {
      let displayStatus: string;
      if (tx.status === "completed") displayStatus = "paid";
      else if (tx.status === "failed") displayStatus = "declined";
      else if (tx.status === "processing") displayStatus = "processing";
      else displayStatus = "awaiting payment";
      return {
        id: tx.id,
        name: tx.itemName,
        amount: Math.round(parseFloat(tx.price) * 100),
        status: displayStatus,
        splitEnabled: !!tx.splitEnabled,
        isSplit: !!tx.isSplit,
        completedSplits: tx.completedSplits != null ? Number(tx.completedSplits) : 0,
        totalSplits: tx.totalSplits != null ? Number(tx.totalSplits) : 1,
      };
    });

  const liveState: RetailTerminalState = { items: [], pending: null, sent };

  // What the share page may offer, newest first (owner decision 2026-09-25): open sales with a
  // link this phone can give. A board sale's is its board's page; a board-less sale's is its own,
  // if this phone made it. Never the business-wide /pay/<merchant>, retired the same day.
  const liveShareSales: RetailShareSale[] = (allTransactions as any[])
    .filter((tx: any) => OPEN_SALE_STATUSES.has(tx.status))
    .sort((a: any, b: any) =>
      (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || (Number(b.id) - Number(a.id)))
    .flatMap((tx: any): RetailShareSale[] => {
      const base = { id: tx.id, name: tx.itemName, amount: Math.round(parseFloat(tx.price) * 100) };
      if (tx.taptStoneId != null) {
        return [{
          ...base,
          payLink: `${window.location.origin}/pay/${merchantId}/stone/${tx.taptStoneId}`,
          qrElement: <QRCodeDisplay merchantId={merchantId} stoneId={tx.taptStoneId} />,
        }];
      }
      const link = saleLinks[String(tx.id)];
      if (!link) return [];
      return [{
        ...base,
        payLink: link.paymentUrl,
        qrElement: <QRCodeDisplay paymentUrl={link.paymentUrl} qrCodeUrl={link.qrCodeUrl} />,
      }];
    });

  // A cash sale is recorded before the view shows success (2026-09-25: it never was). A billing
  // 402 is the banner's alone (R1-T9); any other failure says why. Either way the view is told.
  const handleCashSale = async (draft: RetailSaleDraft) => {
    setLiveReceipt(null);
    try {
      const r = await apiRequest("POST", "/api/transactions/cash-sale", {
        merchantId,
        itemName: draft.name,
        price: (draft.amount / 100).toFixed(2),
      });
      const { transaction } = await r.json();
      queryClient.setQueryData<any[]>(
        ["/api/merchants", merchantId, "transactions"],
        (prev: any[] = []) => (prev.some((t: any) => t.id === transaction.id) ? prev : [transaction, ...prev]),
      );
      setLiveReceipt({
        name: typeof transaction?.itemName === "string" ? transaction.itemName : draft.name,
        amount: Math.round(parseFloat(transaction?.price) * 100),
        url: `${window.location.origin}/receipt/${transaction.id}`,
      });
    } catch (error) {
      if (!isBillingCardRequired(error)) {
        toast({ title: "Error", description: apiErrorMessage(error, "Failed to record cash sale"), variant: "destructive" });
      }
      throw error;
    }
  };

  const liveStones = (taptStones as any[]).map((s: any) => ({
    id: s.id,
    name: s.name || `Board #${s.stoneNumber}`,
    stoneNumber: s.stoneNumber,
  }));

  const handleLiveSend = async (
    draft: RetailSaleDraft,
    options: Partial<RetailCreateOptions> = {}
  ) => {
    // The same client-known decision sent as linkMode above — never gate the
    // share overlay on response field presence (server/routes.ts populates
    // paymentUrl/qrCodeUrl unconditionally on every successful create).
    const boardId = selectedStoneId ?? undefined;
    const newTx = await createTransactionMutation.mutateAsync({
      itemName: draft.name,
      price: (draft.amount / 100).toFixed(2),
      selectedStoneId: boardId,
      splitEnabled: draft.splitEnabled,
    });
    // Push the new transaction into the list cache immediately so it appears in the
    // active stack before the next background poll fires.
    queryClient.setQueryData<any[]>(
      ["/api/merchants", merchantId, "transactions"],
      (prev: any[] = []) => {
        const exists = prev.some((t: any) => t.id === newTx.id);
        return exists ? prev : [newTx, ...prev];
      }
    );
    // A board-less sale's own link is given once, now: remember it for the share page, which
    // the view opens next with this sale chosen. A board sale shares its board's page.
    if (!boardId && newTx?.id != null && typeof newTx?.paymentUrl === "string" && newTx.paymentUrl) {
      const link: SaleLink = {
        paymentUrl: newTx.paymentUrl,
        qrCodeUrl: typeof newTx?.qrCodeUrl === "string" ? newTx.qrCodeUrl : "",
        savedAt: Date.now(),
      };
      setSaleLinks((prev) => ({ ...prev, [String(newTx.id)]: link }));
    }
    if (options.paywave) {
      startTapToPayPayment(newTx);
    }
  };

  const handleLiveCancel = () => {
    if (activeTransaction?.id) {
      cancelTransactionMutation.mutate(activeTransaction.id);
    }
  };

  const handleCreateSale = async (draft: RetailSaleDraft, options: RetailCreateOptions) => {
    if (options.existing && options.paywave) {
      await startTapToPayPayment();
      return;
    }
    await handleLiveSend(draft, options);
  };

  const handleRefund = async ({
    transactionId,
    refundAmount,
    refundReason,
    refundMethod,
  }: RetailRefundIntent) => {
    const response = await sessionFetch(`/api/transactions/${transactionId}/refunds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refundAmount, refundReason, refundMethod }),
    });
    if (response.ok) return;
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Refund failed");
  };

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <RetailTerminalView
        publishDockState
        liveState={liveState}
        onCreateSale={handleCreateSale}
        onCreateSplit={handleCreateSale}
        onCancel={handleLiveCancel}
        onShare={handleBrowserShare}
        onCashSale={handleCashSale}
        onRefund={handleRefund}
        onOpenReceipt={(transaction) => setLocation(`/receipt/${transaction.id}`)}
        onBoardSelect={(stoneId: number) => setSelectedStoneId(stoneId)}
        selectedStoneId={selectedStoneId}
        onStoneCreate={() => createStoneMutation.mutateAsync()}
        onStoneRename={(stoneId: number, name: string) => renameStoneMutation.mutateAsync({ stoneId, name })}
        onStoneDelete={(stoneId: number) => deleteStoneMutation.mutateAsync(stoneId)}
        liveStones={liveStones}
        liveShareSales={liveShareSales}
        liveReceipt={liveReceipt}
        showPaywave={false}
        successNotification={successNotif}
      />

      <AnimatePresence>
        {showTapToPayOverlay && (
          <motion.div
            data-testid="tap-to-pay-overlay"
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
