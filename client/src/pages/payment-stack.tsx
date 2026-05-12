import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Clock, Loader2, Plus, Copy, X, ChevronRight, Layers, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { Transaction } from "@shared/schema";

const BRAND = "#00DFC8";
const SURFACE = "rgba(26, 86, 255, 0.08)";
const BORDER = "rgba(26, 86, 255, 0.18)";

const statusConfig: Record<string, { color: string; label: string }> = {
  pending:    { color: "#3B82F6", label: "Awaiting Payment" },
  processing: { color: "#F59E0B", label: "Processing"       },
  completed:  { color: BRAND,    label: "Complete"          },
  failed:     { color: "#EF4444", label: "Failed"           },
};

function timeAgo(dateStr: string | Date): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function PaymentStack() {
  const merchantId = getCurrentMerchantId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  if (!merchantId) {
    window.location.href = "/login";
    return null;
  }

  const { data: allTransactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!r.ok) throw new Error("Failed to fetch transactions");
      return r.json();
    },
    refetchInterval: 5000,
  });

  const { data: taptStones = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/tapt-stones`);
      if (!r.ok) throw new Error();
      return r.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const r = await apiRequest("POST", `/api/transactions/${transactionId}/cancel`, {});
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
      toast({ title: "Transaction cancelled" });
      setExpandedId(null);
    },
    onError: () => {
      toast({ title: "Failed to cancel", variant: "destructive" });
    },
  });

  const activeStack = allTransactions.filter(
    (tx) => tx.status === "pending" || tx.status === "processing"
  );

  const copyPaymentLink = (tx: Transaction) => {
    const stone = taptStones.find((s: any) => s.id === (tx as any).taptStoneId);
    const url = stone?.paymentUrl
      ? stone.paymentUrl.replace(/\/pay\//, "/nfc/")
      : `${window.location.origin}/pay/${merchantId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(tx.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Link Copied", description: "Payment link copied to clipboard" });
  };

  return (
    <div className="min-h-screen text-white" style={{ background: "#060D1F" }}>
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/terminal">
            <button className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <ArrowLeft size={16} className="text-white/60" />
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <Layers size={20} className="text-white/60" />
            <h1 className="text-lg font-semibold text-white">Payment Stack</h1>
          </div>
          {activeStack.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold text-black"
              style={{ backgroundColor: BRAND }}>
              {activeStack.length}
            </span>
          )}
        </div>
        <p className="text-white/30 text-sm pl-12">Active &amp; pending transactions</p>
      </div>

      <div className="px-5 space-y-3 pb-36">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-white/30" />
          </div>
        )}

        {!isLoading && activeStack.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <Layers size={32} className="text-white/20" />
            </div>
            <p className="text-white/40 text-base font-medium">No active payments</p>
            <p className="text-white/20 text-sm mt-1">New transactions will appear here</p>
            <Link href="/terminal">
              <button className="mt-6 px-6 py-3 rounded-2xl text-sm font-semibold text-black flex items-center gap-2"
                style={{ backgroundColor: BRAND }}>
                <Plus size={16} />
                New Transaction
              </button>
            </Link>
          </div>
        )}

        <AnimatePresence initial={false}>
        {activeStack.map((tx, index) => {
          const sc = statusConfig[tx.status] ?? statusConfig.pending;
          const isExpanded = expandedId === tx.id;
          const amount = parseFloat(tx.price as string);

          return (
            <motion.div
              key={tx.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -30, scale: 0.92, transition: { duration: 0.2 } }}
              transition={{ delay: index * 0.055, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl overflow-hidden"
              style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
            >
              <motion.button
                className="w-full flex items-center gap-4 px-5 py-4 text-left"
                onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 600, damping: 28 }}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
                  style={{ backgroundColor: sc.color }} />

                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold tabular-nums" style={{ fontSize: "28px", lineHeight: 1.1, letterSpacing: "-0.5px" }}>
                    ${amount.toFixed(2)}
                  </div>
                  <p className="text-white/50 text-sm mt-0.5 truncate">{tx.itemName}</p>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${sc.color}22`, color: sc.color }}>
                    {sc.label}
                  </span>
                  <span className="text-white/30 text-xs">{timeAgo(tx.createdAt as any)}</span>
                </div>

                <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                  <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
                </motion.div>
              </motion.button>

              <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="px-5 pb-4 pt-0 border-t space-y-2" style={{ borderColor: BORDER }}>
                    {tx.isSplit && (
                      <div className="py-3 px-0">
                        <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Split Bill</p>
                        <p className="text-white/70 text-sm">
                          {tx.completedSplits ?? 0} / {tx.totalSplits ?? 1} paid
                          {tx.splitAmount ? ` · $${parseFloat(tx.splitAmount as string).toFixed(2)} each` : ""}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 600, damping: 26 }}
                        onClick={() => copyPaymentLink(tx)}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-black flex items-center justify-center gap-2"
                        style={{ backgroundColor: BRAND }}>
                        <Copy size={14} />
                        {copiedId === tx.id ? "Copied!" : "Copy Link"}
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 600, damping: 26 }}
                        onClick={() => cancelMutation.mutate(tx.id)}
                        disabled={cancelMutation.isPending}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-red-400 flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        {cancelMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        Cancel
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            </motion.div>
          );
        })}
        </AnimatePresence>

        {activeStack.length > 0 && (
          <Link href="/terminal">
            <button className="w-full py-4 rounded-2xl text-sm font-semibold text-black flex items-center justify-center gap-2 mt-2 transition-all hover:scale-[1.01]"
              style={{ backgroundColor: BRAND, boxShadow: `0 4px 20px ${BRAND}33` }}>
              <Plus size={16} />
              New Transaction
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}
