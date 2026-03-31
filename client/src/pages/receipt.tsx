import { useState } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Download, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

function formatPaymentMethod(method?: string): string {
  switch (method) {
    case "apple_pay": return "Apple Pay";
    case "google_pay": return "Google Pay";
    case "card": return "Card";
    case "nfc_tap": return "Tap to Pay";
    case "cash": return "Cash";
    default: return "Card";
  }
}

export default function Receipt() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const splitIdParam = params.get("splitId");
  const splitId = splitIdParam ? parseInt(splitIdParam) : null;

  const [isActioning, setIsActioning] = useState(false);
  const { toast } = useToast();

  const id = transactionId ? parseInt(transactionId) : null;

  const { data: transaction, isLoading: transactionLoading } = useQuery({
    queryKey: ["/api/transactions", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await fetch(`/api/transactions/${id}`);
      if (!response.ok) throw new Error("Failed to fetch transaction");
      return response.json();
    },
    enabled: !!id,
  });

  const { data: merchant, isLoading: merchantLoading } = useQuery({
    queryKey: ["/api/merchants", transaction?.merchantId],
    queryFn: async () => {
      if (!transaction?.merchantId) return null;
      const response = await fetch(`/api/merchants/${transaction.merchantId}`);
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
    enabled: !!transaction?.merchantId,
  });

  const { data: splitPayment, isLoading: splitLoading } = useQuery({
    queryKey: ["/api/split-payments", splitId],
    queryFn: async () => {
      if (!splitId) return null;
      const response = await fetch(`/api/split-payments/${splitId}`);
      if (!response.ok) throw new Error("Failed to fetch split payment");
      return response.json();
    },
    enabled: !!splitId,
  });

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString("en-NZ", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getPdfUrl = () => {
    const base = `/api/transactions/${id}/receipt-pdf`;
    return splitId ? `${base}?splitId=${splitId}` : base;
  };

  const fetchPdfBlob = async (): Promise<Blob> => {
    const response = await fetch(getPdfUrl(), { method: "POST" });
    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      let msg = "Failed to generate PDF";
      if (contentType.includes("application/json")) {
        const json = await response.json().catch(() => ({}));
        msg = json.message || msg;
      }
      throw new Error(msg);
    }
    return response.blob();
  };

  const handleDownload = async () => {
    if (!transaction) return;
    setIsActioning(true);
    try {
      const blob = await fetchPdfBlob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${transaction.id}-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        description: "Could not generate the PDF receipt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsActioning(false);
    }
  };

  const handleShare = async () => {
    if (!transaction || !merchant) return;
    setIsActioning(true);
    try {
      const blob = await fetchPdfBlob();
      const file = new File([blob], `receipt-${transaction.id}.pdf`, { type: "application/pdf" });
      const merchantName = merchant.businessName || merchant.name || "the merchant";
      const shareAmt = `$${effectiveAmount.toFixed(2)}`;

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Receipt from ${merchantName}`,
          text: `Payment receipt for ${shareAmt}`,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `Receipt from ${merchantName}`,
          text: `Payment receipt for ${shareAmt}`,
          url: window.location.href,
        });
      } else {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `receipt-${transaction.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Share error:", error);
        toast({
          title: "Share failed",
          description: "Could not share the receipt. Try downloading it instead.",
          variant: "destructive",
        });
      }
    } finally {
      setIsActioning(false);
    }
  };

  if (!id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center">
          <p className="text-gray-600">Invalid transaction ID</p>
        </div>
      </div>
    );
  }

  const isLoading = transactionLoading || merchantLoading || (!!splitId && splitLoading);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm md:max-w-md shadow-2xl">
          <div className="bg-[#0055FF] px-8 pt-8 pb-16 rounded-[48px] animate-pulse">
            <div className="h-12 bg-white/10 rounded-full w-32 mx-auto mb-8" />
            <div className="h-16 bg-white/10 rounded-full w-16 mx-auto mb-4" />
            <div className="h-8 bg-white/10 rounded-full w-48 mx-auto mb-3" />
            <div className="h-10 bg-white/10 rounded-full w-36 mx-auto" />
          </div>
          <div className="bg-[#00E5CC] px-8 py-8 rounded-b-[48px] -mt-4" />
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center">
          <p className="text-gray-600">Transaction not found</p>
        </div>
      </div>
    );
  }

  const isSplitReceipt = !!splitId && !!splitPayment;
  const effectiveAmount = isSplitReceipt
    ? parseFloat(splitPayment.amount)
    : parseFloat(transaction.price);

  const gstRate = 0.15;
  const gstAmount = (effectiveAmount * gstRate) / (1 + gstRate);
  const netAmount = effectiveAmount - gstAmount;

  const logoSrc = merchant?.customLogoUrl || taptLogo;
  const logoFilter = merchant?.customLogoUrl
    ? {}
    : { filter: "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)" };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm md:max-w-md">

        {/* ── Blue card ── */}
        <div className="bg-[#0055FF] px-8 pt-8 pb-20 rounded-[48px] rounded-b-none relative z-10">
          <div className="text-center mb-6">
            <img src={logoSrc} alt="logo" className="h-12 mx-auto object-contain" style={logoFilter} />
          </div>
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-[#00E5CC] mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-white mb-1">Payment Accepted!</h1>
            <p className="text-[#00E5CC] text-5xl font-bold mt-3">${effectiveAmount.toFixed(2)}</p>
            <p className="text-white/60 text-sm mt-2">{transaction.itemName}</p>
            {isSplitReceipt && (
              <p className="text-white/40 text-xs mt-1">
                Split — original total ${parseFloat(transaction.price).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* ── White receipt section ── */}
        <div className="bg-white px-6 py-5 shadow-lg relative z-20">

          {/* Business info */}
          {merchant && (
            <div className="text-center border-b border-gray-100 pb-4 mb-4">
              <p className="font-semibold text-gray-900 text-base">
                {merchant.businessName || merchant.name}
              </p>
              {merchant.businessAddress && (
                <p className="text-xs text-gray-400 whitespace-pre-line mt-1">{merchant.businessAddress}</p>
              )}
              {merchant.contactPhone && (
                <p className="text-xs text-gray-400">{merchant.contactPhone}</p>
              )}
              {merchant.gstNumber && (
                <p className="text-xs text-gray-500 mt-1 font-medium">GST No: {merchant.gstNumber}</p>
              )}
              {merchant.nzbn && (
                <p className="text-xs text-gray-400">NZBN: {merchant.nzbn}</p>
              )}
            </div>
          )}

          {/* Date + Method */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Date</span>
              <span className="text-gray-700 font-medium text-right text-xs leading-relaxed max-w-[60%]">
                {formatDate(transaction.createdAt)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Payment method</span>
              <span className="text-gray-700 font-medium">{formatPaymentMethod(transaction.paymentMethod)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Reference</span>
              <span className="text-gray-500 font-mono text-xs">#{transaction.id}</span>
            </div>
          </div>

          <Separator className="my-3" />

          {/* Items */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest mb-2">Items</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-700">{transaction.itemName}</span>
              <span className="font-medium text-gray-900">${effectiveAmount.toFixed(2)}</span>
            </div>
          </div>

          <Separator className="my-3" />

          {/* GST breakdown */}
          <div className="space-y-1.5 mb-1">
            <div className="flex justify-between text-sm text-gray-400">
              <span>Subtotal (excl. GST)</span>
              <span>${netAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>GST (15%)</span>
              <span>${gstAmount.toFixed(2)}</span>
            </div>
          </div>

          <Separator className="my-3" />

          <div className="flex justify-between font-bold text-base">
            <span className="text-gray-900">{isSplitReceipt ? "Your share" : "Total"}</span>
            <span className="text-[#0055FF]">${effectiveAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* ── Cyan tab with action buttons ── */}
        <div
          className="bg-[#00E5CC] px-8 rounded-b-[48px] relative z-0"
          style={{ paddingTop: "32px", paddingBottom: "28px", marginTop: 0 }}
        >
          <Button
            onClick={handleDownload}
            disabled={isActioning}
            className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white rounded-[20px] py-6 text-base font-medium mb-3"
          >
            {isActioning ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Working...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download PDF
              </span>
            )}
          </Button>

          <Button
            onClick={handleShare}
            disabled={isActioning}
            variant="outline"
            className="w-full border-[#0055FF] border-2 text-[#0055FF] bg-transparent hover:bg-[#0055FF]/5 rounded-[20px] py-6 text-base font-medium"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share Receipt
          </Button>

          <p className="text-center text-[#0055FF]/50 text-xs mt-4">Powered by TaptPay</p>
        </div>

      </div>
    </div>
  );
}
