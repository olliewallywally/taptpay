import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { Minus, Plus, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

export default function SplitPayment() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [, setLocation] = useLocation();
  const txnId = parseInt(transactionId);

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);

  // First-person state
  const [splitCount, setSplitCount] = useState(2);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [confirmedCustom, setConfirmedCustom] = useState<string | null>(null); // null = use equal split

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
    if (transaction) setCurrentTransaction(transaction);
  }, [transaction]);

  useEffect(() => {
    if (!transaction?.merchantId) return;
    sseClient.connect(transaction.merchantId, transaction.taptStoneId);
    const handleUpdate = (message: any) => {
      if (message.transaction?.id === txnId) {
        setCurrentTransaction(message.transaction);
        queryClient.setQueryData(["/api/transactions", txnId], message.transaction);
      }
    };
    sseClient.subscribe("transaction_updated", handleUpdate);
    return () => {
      sseClient.unsubscribe("transaction_updated", handleUpdate);
      sseClient.disconnect();
    };
  }, [transaction?.merchantId, txnId]);

  const txn = currentTransaction || transaction;
  const totalAmount = txn ? parseFloat(txn.price) : 0;
  const isSplitSetup = txn?.isSplit === true;
  const completedSplits = txn?.completedSplits || 0;
  const totalSplits = txn?.totalSplits || splitCount;
  const allDone = txn?.status === "completed";
  const nextPersonIndex = completedSplits + 1;

  // Equal share based on split count
  const equalShare = (totalAmount / (isSplitSetup ? totalSplits : splitCount)).toFixed(2);

  // Subsequent payers: remaining amount and their share
  const totalPaid = isSplitSetup && txn?.splitAmount
    ? parseFloat(txn.splitAmount) * completedSplits
    : 0;
  const remaining = totalAmount - totalPaid;
  const subsequentShare = isSplitSetup
    ? (parseFloat(txn?.splitAmount || "0") || parseFloat(equalShare)).toFixed(2)
    : equalShare;

  // What's shown as the large static amount
  const displayAmount = isSplitSetup
    ? subsequentShare
    : (confirmedCustom ?? equalShare);

  // Edit step: for first person in edit mode, step by equalShare; for subsequent payers, step by their share
  const editStep = parseFloat(isSplitSetup ? subsequentShare : equalShare);
  const maxEditAmount = isSplitSetup ? remaining : totalAmount;

  const parsedEdit = parseFloat(editValue) || 0;
  const isEditValid = parsedEdit > 0 && parsedEdit <= maxEditAmount + 0.01;

  // Subsequent payer edit state
  const [subEditMode, setSubEditMode] = useState(false);
  const [subEditValue, setSubEditValue] = useState("");
  const [subConfirmed, setSubConfirmed] = useState<string | null>(null);
  const subDisplay = subConfirmed ?? subsequentShare;
  const parsedSubEdit = parseFloat(subEditValue) || 0;
  const isSubEditValid = parsedSubEdit > 0 && parsedSubEdit <= remaining + 0.01;

  const handlePay = async () => {
    if (!txn) return;
    setIsProcessing(true);
    try {
      if (!isSplitSetup) {
        const response = await apiRequest("POST", `/api/transactions/${txnId}/split`, {
          totalSplits: splitCount,
        });
        const data = await response.json();
        if (data.transaction) {
          setCurrentTransaction(data.transaction);
          queryClient.setQueryData(["/api/transactions", txnId], data.transaction);
        }
        const payAmt = parseFloat(displayAmount);
        const defaultAmt = parseFloat(equalShare);
        if (Math.abs(payAmt - defaultAmt) > 0.001) {
          setLocation(`/checkout/${txnId}?amount=${payAmt.toFixed(2)}`);
        } else {
          setLocation(`/checkout/${txnId}`);
        }
      } else {
        const payAmt = parseFloat(subDisplay);
        const defaultAmt = parseFloat(subsequentShare);
        if (Math.abs(payAmt - defaultAmt) > 0.001) {
          setLocation(`/checkout/${txnId}?amount=${payAmt.toFixed(2)}`);
        } else {
          setLocation(`/checkout/${txnId}`);
        }
      }
    } catch (err) {
      console.error("Split payment error:", err);
      setIsProcessing(false);
    }
  };

  const logoStyle = merchant?.customLogoUrl
    ? {}
    : { filter: "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)" };

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
      <div className="w-full max-w-sm md:max-w-md shadow-2xl">

        {/* ── Blue card ── */}
        <div className="bg-[#0055FF] px-8 pt-8 pb-16 rounded-[48px] relative z-10">

          {/* Logo */}
          <div className="text-center mb-6">
            <img
              src={merchant?.customLogoUrl || taptLogo}
              alt="logo"
              className="h-12 mx-auto object-contain"
              style={logoStyle}
            />
          </div>

          {/* ── All paid ── */}
          {allDone && (
            <div className="text-center py-6">
              <CheckCircle className="w-16 h-16 text-[#00E5CC] mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">All Done!</h2>
              <p className="text-white/70">All {totalSplits} payments complete</p>
              <p className="text-[#00E5CC] text-4xl font-bold mt-4">${totalAmount.toFixed(2)}</p>
              <p className="text-white/60 text-sm">Total paid</p>
            </div>
          )}

          {/* ── Redirecting ── */}
          {!allDone && isProcessing && (
            <div className="text-center py-6">
              <Loader2 className="w-8 h-8 text-[#00E5CC] animate-spin mx-auto mb-3" />
              <p className="text-white">Taking you to payment...</p>
            </div>
          )}

          {/* ── First person ── */}
          {!allDone && !isProcessing && !isSplitSetup && (
            <div className="text-center">
              {/* Person badge */}
              <div className="bg-white/10 rounded-2xl px-4 py-2 inline-block mb-4">
                <p className="text-white/70 text-sm">Person 1 of {splitCount}</p>
              </div>

              <p className="text-white/60 text-lg mb-1">{txn.itemName}</p>

              {/* Full total — always shown */}
              <p className="text-[#00E5CC] text-5xl font-bold mb-4">${totalAmount.toFixed(2)}</p>

              {/* Split count adjuster — always visible */}
              <div className="flex items-center justify-center gap-6 mb-2">
                <button
                  onClick={() => { setSplitCount(c => Math.max(2, c - 1)); setConfirmedCustom(null); }}
                  disabled={splitCount <= 2}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${splitCount <= 2 ? "bg-[#00E5CC]/30 cursor-not-allowed" : "bg-[#00E5CC] hover:bg-[#00c9b3]"}`}
                >
                  <Minus size={20} className="text-white" />
                </button>
                <span className="text-white/60 text-sm w-20">{splitCount} people</span>
                <button
                  onClick={() => { setSplitCount(c => Math.min(10, c + 1)); setConfirmedCustom(null); }}
                  disabled={splitCount >= 10}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${splitCount >= 10 ? "bg-[#00E5CC]/30 cursor-not-allowed" : "bg-[#00E5CC] hover:bg-[#00c9b3]"}`}
                >
                  <Plus size={20} className="text-white" />
                </button>
              </div>

              {/* Per-person / custom amount display */}
              {!editMode && (
                <>
                  {confirmedCustom ? (
                    <p className="text-white/70 text-sm mb-3">
                      your amount:{" "}
                      <span className="text-[#00E5CC] font-semibold">${confirmedCustom}</span>
                    </p>
                  ) : (
                    <p className="text-white/70 text-sm mb-3">
                      each pays <span className="text-white font-semibold">${equalShare}</span>
                    </p>
                  )}
                  <button
                    onClick={() => { setEditValue(confirmedCustom ?? equalShare); setEditMode(true); }}
                    className="text-white/40 text-xs underline underline-offset-2 hover:text-white/60 transition-colors"
                  >
                    {confirmedCustom ? "change amount" : "enter different amount"}
                  </button>
                </>
              )}

              {/* Edit mode: custom dollar input — type only, no +/- */}
              {editMode && (
                <div className="mt-1">
                  <div className="flex justify-center mb-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                      className="w-36 text-center text-3xl font-bold bg-white/15 border border-white/20 rounded-xl px-3 py-2 text-[#00E5CC] outline-none focus:border-[#00E5CC]/50"
                    />
                  </div>
                  {editValue && !isEditValid && (
                    <p className="text-red-300 text-xs mt-1">
                      Enter an amount between $0.01 and ${maxEditAmount.toFixed(2)}
                    </p>
                  )}
                  <button
                    onClick={() => { setConfirmedCustom(null); setEditMode(false); }}
                    className="mt-2 text-white/40 text-xs underline underline-offset-2 hover:text-white/60 transition-colors"
                  >
                    use equal split
                  </button>
                </div>
              )}

              {/* Progress bars */}
              <div className="mt-5 flex gap-2 justify-center">
                {Array.from({ length: splitCount }).map((_, i) => (
                  <div key={i} className="h-2 flex-1 rounded-full bg-white/20" />
                ))}
              </div>
              <p className="text-white/50 text-xs mt-2">0 of {splitCount} paid</p>

              {/* Escape hatch — skip split and pay the full amount */}
              {!editMode && (
                <button
                  onClick={() => setLocation(`/checkout/${txnId}`)}
                  className="mt-4 text-white/30 text-xs underline underline-offset-2 hover:text-white/50 transition-colors"
                >
                  pay full amount instead
                </button>
              )}
            </div>
          )}

          {/* ── Subsequent payers ── */}
          {!allDone && !isProcessing && isSplitSetup && (
            <div className="text-center">
              <div className="bg-white/10 rounded-2xl px-4 py-2 inline-block mb-4">
                <p className="text-white/70 text-sm">Person {nextPersonIndex} of {totalSplits}</p>
              </div>

              <p className="text-white/60 text-lg mb-2">{txn.itemName}</p>

              {!subEditMode && (
                <>
                  <p className="text-[#00E5CC] text-5xl font-bold mb-3">${subDisplay}</p>
                  <button
                    onClick={() => { setSubEditValue(subDisplay); setSubEditMode(true); }}
                    className="text-white/40 text-xs underline underline-offset-2 hover:text-white/60 transition-colors"
                  >
                    {subConfirmed ? "change amount" : "enter different amount"}
                  </button>
                </>
              )}

              {subEditMode && (
                <>
                  <div className="flex justify-center mb-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      max={remaining}
                      value={subEditValue}
                      onChange={(e) => setSubEditValue(e.target.value)}
                      autoFocus
                      className="w-36 text-center text-3xl font-bold bg-white/15 border border-white/20 rounded-xl px-3 py-2 text-[#00E5CC] outline-none focus:border-[#00E5CC]/50"
                    />
                  </div>
                  {subEditValue && !isSubEditValid && (
                    <p className="text-red-300 text-xs mt-1">
                      Enter an amount between $0.01 and ${remaining.toFixed(2)}
                    </p>
                  )}
                  <button
                    onClick={() => { setSubConfirmed(null); setSubEditMode(false); }}
                    className="mt-2 text-white/40 text-xs underline underline-offset-2 hover:text-white/60 transition-colors"
                  >
                    use equal split
                  </button>
                </>
              )}

              {/* Progress bars */}
              <div className="mt-6 flex gap-2 justify-center">
                {Array.from({ length: totalSplits }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full ${i < completedSplits ? "bg-[#00E5CC]" : "bg-white/20"}`}
                  />
                ))}
              </div>
              <p className="text-white/50 text-xs mt-2">{completedSplits} of {totalSplits} paid</p>
            </div>
          )}
        </div>

        {/* ── Cyan tab ── */}
        <div
          className="bg-[#00E5CC] px-8 rounded-b-[48px] relative z-0"
          style={{ marginTop: "-44px", paddingTop: "60px", paddingBottom: "28px" }}
        >
          {allDone && (
            <Button
              className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
              onClick={() => setLocation("/")}
            >
              done
            </Button>
          )}

          {!allDone && !isProcessing && !isSplitSetup && (
            editMode ? (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
                onClick={() => {
                  if (isEditValid) {
                    setConfirmedCustom(parseFloat(editValue).toFixed(2));
                    setEditMode(false);
                  }
                }}
                disabled={!isEditValid}
              >
                confirm
              </Button>
            ) : (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
                onClick={handlePay}
                data-testid="button-pay-split"
              >
                pay ${displayAmount}
              </Button>
            )
          )}

          {!allDone && !isProcessing && isSplitSetup && (
            subEditMode ? (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
                onClick={() => {
                  if (isSubEditValid) {
                    setSubConfirmed(parseFloat(subEditValue).toFixed(2));
                    setSubEditMode(false);
                  }
                }}
                disabled={!isSubEditValid}
              >
                confirm
              </Button>
            ) : (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg font-medium"
                onClick={handlePay}
                data-testid="button-pay-split"
              >
                pay ${subDisplay}
              </Button>
            )
          )}
        </div>

      </div>
    </div>
  );
}
