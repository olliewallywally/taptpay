import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Download, ArrowLeft, Receipt as ReceiptIcon } from "lucide-react";

export default function Receipt() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const id = transactionId ? parseInt(transactionId) : null;

  // Get transaction details
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

  // Get merchant details for receipt
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

  const handleDownloadPdf = async () => {
    if (!transaction || !merchant) return;
    
    setIsGeneratingPdf(true);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/receipt-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) throw new Error("Failed to generate PDF");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${transaction.id}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateGst = (amount: number) => {
    // NZ GST is 15%
    const gstRate = 0.15;
    const gstAmount = (amount * gstRate) / (1 + gstRate);
    const netAmount = amount - gstAmount;
    return { gstAmount, netAmount, gstRate };
  };

  if (!id) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <p className="text-gray-600">Invalid transaction ID</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (transactionLoading || merchantLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-3/4 mx-auto"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                <div className="h-4 bg-gray-200 rounded w-4/6"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!transaction || transaction.status !== "completed") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <p className="text-gray-600 mb-4">
              {!transaction ? "Transaction not found" : "Transaction not completed"}
            </p>
            <Button 
              variant="outline"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { gstAmount, netAmount, gstRate } = calculateGst(parseFloat(transaction.price));

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        
        {/* Success Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Payment Accepted!</h1>
          <p className="text-sm sm:text-base text-gray-600">Your transaction has been processed successfully</p>
        </div>

        {/* Receipt Card */}
        <Card className="shadow-lg mb-6">
          <CardHeader className="text-center pb-4">
            <CardTitle className="flex items-center justify-center space-x-2">
              <ReceiptIcon className="h-5 w-5" />
              <span>Receipt</span>
            </CardTitle>
            <Badge variant="outline" className="w-fit mx-auto">
              Transaction #{transaction.id}
            </Badge>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Business Information */}
            {merchant && (
              <div className="text-center border-b pb-4">
                <h3 className="font-semibold text-lg">
                  {merchant.businessName || merchant.name}
                </h3>
                {merchant.businessAddress && (
                  <p className="text-sm text-gray-600 whitespace-pre-line">
                    {merchant.businessAddress}
                  </p>
                )}
                {merchant.contactEmail && (
                  <p className="text-sm text-gray-600">{merchant.contactEmail}</p>
                )}
                {merchant.contactPhone && (
                  <p className="text-sm text-gray-600">{merchant.contactPhone}</p>
                )}
              </div>
            )}

            {/* Transaction Details */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Date & Time:</span>
                <span className="font-medium">{formatDate(transaction.createdAt)}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Item:</span>
                <span className="font-medium">{transaction.itemName}</span>
              </div>
              
              <Separator />
              
              {/* Price Breakdown */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal (excl. GST):</span>
                  <span>${netAmount.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">GST ({(gstRate * 100).toFixed(0)}%):</span>
                  <span>${gstAmount.toFixed(2)}</span>
                </div>
                
                <Separator />
                
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>${parseFloat(transaction.price).toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method */}
              <div className="flex justify-between">
                <span className="text-gray-600">Payment Method:</span>
                <span className="font-medium">Card Payment</span>
              </div>

              {/* Processing Fee */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Processing Fee:</span>
                <span className="text-gray-500">$0.20</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button 
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
          >
            {isGeneratingPdf ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Receipt PDF
              </>
            )}
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => window.location.href = `/pay/${transaction.merchantId}`}
          >
            New Transaction
          </Button>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-gray-500">
          <p>Thank you for your business!</p>
          <p className="mt-1">Powered by Tapt Payment Terminal</p>
        </div>
      </div>
    </div>
  );
}