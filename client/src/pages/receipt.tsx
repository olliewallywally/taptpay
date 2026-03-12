import { useState } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Download, Share2, Receipt as ReceiptIcon } from "lucide-react";

export default function Receipt() {
  const { transactionId } = useParams<{ transactionId: string }>();

  const [isActioning, setIsActioning] = useState(false);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-NZ", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPdfUrl = () => `/api/transactions/${id}/receipt-pdf`;

  const fetchPdfBlob = async (): Promise<Blob> => {
    const response = await fetch(getPdfUrl(), { method: "POST" });
    if (!response.ok) throw new Error("Failed to generate PDF");
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
      }
    } finally {
      setIsActioning(false);
    }
  };

  if (!id) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <p className="text-gray-600">Invalid transaction ID</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = transactionLoading || merchantLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-3/4 mx-auto" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-5/6" />
                <div className="h-4 bg-gray-200 rounded w-4/6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <p className="text-gray-600">Transaction not found</p>
          </CardContent>
        </Card>
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

  const allSplitsInReceipt = transaction.totalSplits && transaction.totalSplits > 1;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">

        {/* Success Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Payment Accepted!</h1>
          <p className="text-sm text-gray-500">Your transaction has been processed successfully</p>
        </div>

        {/* Receipt Card */}
        <Card className="shadow-lg mb-5">
          <CardHeader className="text-center pb-3">
            <CardTitle className="flex items-center justify-center space-x-2 text-base">
              <ReceiptIcon className="h-4 w-4" />
              <span>Receipt</span>
            </CardTitle>
            <p className="text-xs text-gray-500">Transaction #{transaction.id}</p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Business Info */}
            {merchant && (
              <div className="text-center border-b pb-4">
                <h3 className="font-semibold text-base">
                  {merchant.businessName || merchant.name}
                </h3>
                {merchant.businessAddress && (
                  <p className="text-xs text-gray-500 whitespace-pre-line mt-1">
                    {merchant.businessAddress}
                  </p>
                )}
                {merchant.contactPhone && (
                  <p className="text-xs text-gray-500">{merchant.contactPhone}</p>
                )}
                {merchant.contactEmail && (
                  <p className="text-xs text-gray-500">{merchant.contactEmail}</p>
                )}
                {merchant.gstNumber && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">GST No: {merchant.gstNumber}</p>
                )}
                {merchant.nzbn && (
                  <p className="text-xs text-gray-500">NZBN: {merchant.nzbn}</p>
                )}
              </div>
            )}

            {/* Date & Item */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date & Time</span>
                <span className="font-medium text-right">{formatDate(transaction.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Payment Method</span>
                <span className="font-medium">Card</span>
              </div>
            </div>

            <Separator />

            {/* Itemised breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Items</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">{transaction.itemName}</span>
                <span className="font-medium">${effectiveAmount.toFixed(2)}</span>
              </div>
              {isSplitReceipt && allSplitsInReceipt && (
                <p className="text-xs text-gray-400">
                  Split payment — original total ${parseFloat(transaction.price).toFixed(2)} divided {transaction.totalSplits} ways
                </p>
              )}
            </div>

            <Separator />

            {/* Cost breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cost Breakdown</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal (excl. GST)</span>
                <span>${netAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">GST (15%)</span>
                <span>${gstAmount.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>{isSplitReceipt ? "Your Share" : "Total"}</span>
                <span>${effectiveAmount.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={handleDownload}
            disabled={isActioning}
            className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white"
            size="lg"
          >
            {isActioning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Working...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Receipt PDF
              </>
            )}
          </Button>

          <Button
            onClick={handleShare}
            disabled={isActioning}
            variant="outline"
            className="w-full border-[#0055FF] text-[#0055FF] hover:bg-blue-50"
            size="lg"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share Receipt
          </Button>
        </div>

        <div className="text-center mt-6 text-xs text-gray-400">
          <p>Thank you for your business!</p>
          <p className="mt-1">Powered by TaptPay</p>
        </div>
      </div>
    </div>
  );
}
