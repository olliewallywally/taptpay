import { useState, useEffect } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { Minus, Plus, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

export default function SplitPayment() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const txnId = parseInt(transactionId);

  const [splitCount, setSplitCount] = useState(2);
  const [pageStatus, setPageStatus] = useState<"choosing" | "waiting" | "redirecting" | "done">("choosing");
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);

  const { data: transaction, isLoading } = useQuery({
    queryKey: ["/api/transactions", txnId],
    queryFn: async () => {
      const response = await fetch(`/api/transactions/${txnId}`);
      if (!response.ok) throw new Error("Transaction not found");
      return response.json();
    },
    enabled: !!txnId,
    refetchInterval: 3000,
  });

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", transaction?.merchantId],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${transaction.merchantId}`);
      if (!response.ok) throw new Error("Merchant not found");
      return response.json();
    },
    enabled: !!transaction?.merchantId,
  });

  useEffect(() => {
    if (transaction) {
      setCurrentTransaction(transaction);
      if (transaction.isSplit) {
        setPageStatus("waiting");
      }
    }
  }, [transaction]);

  // SSE for real-time split progress updates
  useEffect(() => {
    if (!transaction?.merchantId) return;
    sseClient.connect(transaction.merchantId, transaction.taptStoneId);

    const handleUpdate = (message: any) => {
      if (message.transaction?.id === txnId) {
        setCurrentTransaction(message.transaction);
        queryClient.setQueryData(["/api/transactions", txnId], message.transaction);

        if (message.transaction.status === "completed") {
          setPageStatus("done");
        }
        if (message.transaction.isSplit && pageStatus === "choosing") {
          setPageStatus("waiting");
        }
      }
    };

    sseClient.subscribe("transaction_updated", handleUpdate);
    return () => {
      sseClient.unsubscribe("transaction_updated", handleUpdate);
      sseClient.disconnect();
    };
  }, [transaction?.merchantId, txnId]);

  const handleConfirmSplit = async () => {
    try {
      setPageStatus("redirecting");
      const response = await apiRequest("POST", `/api/transactions/${txnId}/split`, {
        totalSplits: splitCount,
      });
      const data = await response.json();
      if (data.transaction) {
        setCurrentTransaction(data.transaction);
        queryClient.setQueryData(["/api/transactions", txnId], data.transaction);
      }
      setPageStatus("waiting");
    } catch (err) {
      console.error("Split creation failed:", err);
      setPageStatus("choosing");
    }
  };

  const handlePay = async () => {
    if (!currentTransaction) return;
    setPageStatus("redirecting");
    try {
      const response = await apiRequest("POST", `/api/transactions/${txnId}/pay`, {
        merchantId: currentTransaction.merchantId,
        stoneId: currentTransaction.taptStoneId,
      });
      const data = await response.json();
      if (data.hppUrl) {
        window.location.href = data.hppUrl;
      } else if (data.status === "completed") {
        setPageStatus("done");
      } else {
        setPageStatus("waiting");
      }
    } catch (err) {
      console.error("Pay error:", err);
      setPageStatus("waiting");
    }
  };

  const txn = currentTransaction || transaction;
  const totalAmount = txn ? parseFloat(txn.price) : 0;
  const splitAmount = (totalAmount / splitCount).toFixed(2);
  const perSplitAmount = txn?.splitAmount ? parseFloat(txn.splitAmount).toFixed(2) : splitAmount;
  const completedSplits = txn?.completedSplits || 0;
  const totalSplits = txn?.totalSplits || splitCount;
  const allDone = txn?.status === "completed";
  const nextPersonIndex = completedSplits + 1;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#0055FF]" />
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-2xl p-8">
          <h2 className="text-xl font-bold text-red-600">Transaction not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm md:max-w-md">
        <div className="rounded-[48px] overflow-hidden shadow-2xl">
          {/* Blue section */}
          <div className="bg-[#0055FF] px-8 pt-8 pb-24 rounded-b-[48px] relative z-10">
            {/* Logo */}
            <div className="text-center mb-6">
              <img
                src={merchant?.customLogoUrl || taptLogo}
                alt="logo"
                className="h-12 mx-auto object-contain"
                style={merchant?.customLogoUrl ? {} : { filter: "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)" }}
              />
            </div>

            {/* All done */}
            {allDone && (
              <div className="text-center py-6">
                <CheckCircle className="w-16 h-16 text-[#00E5CC] mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">All Done!</h2>
                <p className="text-white/70">All {totalSplits} payments complete</p>
                <p className="text-[#00E5CC] text-4xl font-bold mt-4">${txn.price}</p>
                <p className="text-white/60 text-sm">Total paid</p>
              </div>
            )}

            {/* Choose splits */}
            {!allDone && pageStatus === "choosing" && (
              <div>
                <div className="text-center mb-3">
                  <p className="text-white/60 text-lg">{txn.itemName}</p>
                </div>
                <div className="text-center mb-6">
                  <p className="text-[#00E5CC] text-5xl font-bold">${totalAmount.toFixed(2)}</p>
                </div>
                <h2 className="text-white text-xl font-bold text-center mb-6">Split the bill</h2>

                {/* Counter */}
                <div className="flex items-center justify-center gap-8 mb-4">
                  <button
                    onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                    className="w-14 h-14 bg-[#00E5CC] hover:bg-[#00c9b3] rounded-full flex items-center justify-center transition-colors"
                    data-testid="button-decrease-split"
                  >
                    <Minus size={24} className="text-white" />
                  </button>
                  <div className="text-[#00E5CC] text-5xl font-bold" data-testid="text-split-count">
                    {splitCount}
                  </div>
                  <button
                    onClick={() => setSplitCount(Math.min(10, splitCount + 1))}
                    className="w-14 h-14 bg-[#00E5CC] hover:bg-[#00c9b3] rounded-full flex items-center justify-center transition-colors"
                    data-testid="button-increase-split"
                  >
                    <Plus size={24} className="text-white" />
                  </button>
                </div>

                <div className="text-center mb-2">
                  <p className="text-white/80 text-sm">each person pays</p>
                  <p className="text-[#00E5CC] text-3xl font-bold" data-testid="text-split-amount">
                    ${splitAmount}
                  </p>
                </div>
              </div>
            )}

            {/* Your turn to pay */}
            {!allDone && pageStatus === "waiting" && (
              <div className="text-center">
                <div className="bg-white/10 rounded-2xl px-4 py-2 inline-block mb-4">
                  <p className="text-white/70 text-sm">
                    Person {nextPersonIndex} of {totalSplits}
                  </p>
                </div>
                <p className="text-white/60 text-lg mb-2">{txn.itemName}</p>
                <p className="text-[#00E5CC] text-5xl font-bold mb-1">${perSplitAmount}</p>
                <p className="text-white/50 text-sm">your share</p>

                {/* Progress bar */}
                <div className="mt-6 flex gap-2 justify-center">
                  {Array.from({ length: totalSplits }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 flex-1 rounded-full ${i < completedSplits ? "bg-[#00E5CC]" : "bg-white/20"}`}
                    />
                  ))}
                </div>
                <p className="text-white/50 text-xs mt-2">
                  {completedSplits} of {totalSplits} paid
                </p>
              </div>
            )}

            {pageStatus === "redirecting" && (
              <div className="text-center py-6">
                <Loader2 className="w-8 h-8 text-[#00E5CC] animate-spin mx-auto mb-3" />
                <p className="text-white">Taking you to payment...</p>
              </div>
            )}
          </div>

          {/* Cyan section — action button */}
          <div
            className="bg-[#00E5CC] px-8 relative z-0"
            style={{ paddingTop: "4rem", paddingBottom: "2rem", marginTop: "-4rem" }}
          >
            {pageStatus === "choosing" && (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
                onClick={handleConfirmSplit}
                data-testid="button-confirm-split"
              >
                confirm split
              </Button>
            )}

            {pageStatus === "waiting" && (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
                onClick={handlePay}
                data-testid="button-pay-split"
              >
                pay ${perSplitAmount}
              </Button>
            )}

            {allDone && (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
                onClick={() => setLocation("/")}
              >
                done
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
