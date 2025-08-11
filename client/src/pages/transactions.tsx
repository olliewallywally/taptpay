import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { 
  CreditCard, 
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ArrowLeft,
  Download,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MobileHeader } from "@/components/mobile-header";

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-400" />;
    case 'processing':
      return <Clock className="h-4 w-4 text-yellow-400" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
};

const getPaymentMethodDisplay = (method: string) => {
  switch (method) {
    case 'nfc_tap':
      return 'NFC Tap';
    case 'qr_code':
      return 'QR Code';
    case 'card_reader':
      return 'Card Reader';
    case 'manual':
      return 'Manual';
    default:
      return 'Card';
  }
};

export default function Transactions() {
  const merchantId = getCurrentMerchantId();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("original_payment_method");
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Redirect to login if no merchantId
  if (!merchantId) {
    window.location.href = '/login';
    return <div>Redirecting to login...</div>;
  }

  // Get transactions data
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  // Filter transactions based on search
  const filteredTransactions = transactions?.filter((transaction: any) => {
    const matchesSearch = transaction.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transaction.windcaveTransactionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         `TXN-${transaction.id}`.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  }) || [];

  // Refund mutation
  const refundMutation = useMutation({
    mutationFn: async (refundData: any) => {
      const response = await apiRequest(`/api/transactions/${selectedTransaction.id}/refunds`, "POST", refundData);
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Refund Processed",
        description: `Successfully processed $${refundAmount} refund for ${selectedTransaction.itemName}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
      handleCloseRefundDialog();
    },
    onError: (error: any) => {
      toast({
        title: "Refund Failed",
        description: error.message || "Failed to process refund",
        variant: "destructive",
      });
    },
  });

  const handleRefundClick = (transaction: any) => {
    setSelectedTransaction(transaction);
    setRefundAmount(transaction.price);
    setRefundReason("");
    setRefundMethod("original_payment_method");
    setIsRefundDialogOpen(true);
  };

  const handleCloseRefundDialog = () => {
    setIsRefundDialogOpen(false);
    setSelectedTransaction(null);
    setRefundAmount("");
    setRefundReason("");
    setRefundMethod("original_payment_method");
  };

  const handleRefundSubmit = () => {
    if (!selectedTransaction || !refundAmount || !refundReason) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const refundAmountNum = parseFloat(refundAmount);
    const transactionAmount = parseFloat(selectedTransaction.price);
    
    if (refundAmountNum <= 0 || refundAmountNum > transactionAmount) {
      toast({
        title: "Invalid Amount",
        description: `Refund amount must be between $0.01 and $${transactionAmount.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    refundMutation.mutate({
      transactionId: selectedTransaction.id,
      refundAmount,
      refundReason,
      refundMethod,
    });
  };

  // CSV Export Function
  const exportToCSV = () => {
    if (!filteredTransactions || filteredTransactions.length === 0) {
      alert("No transactions to export");
      return;
    }

    // Define CSV headers
    const headers = [
      "Date",
      "Time", 
      "Transaction ID",
      "Item Name",
      "Amount",
      "Status",
      "Payment Method"
    ];

    // Convert transactions to CSV format
    const csvContent = [
      headers.join(","),
      ...filteredTransactions.map((transaction: any) => {
        const date = transaction.createdAt ? new Date(transaction.createdAt) : new Date();
        return [
          format(date, "yyyy-MM-dd"),
          format(date, "HH:mm:ss"),
          transaction.windcaveTransactionId || `TXN-${transaction.id}`,
          `"${transaction.itemName}"`,
          transaction.price,
          transaction.status,
          getPaymentMethodDisplay(transaction.paymentMethod)
        ].join(",");
      })
    ].join("\n");

    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `transactions_${format(new Date(), "yyyy-MM-dd_HH-mm-ss")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {isMobile && <MobileHeader title="Transactions">{null}</MobileHeader>}
      
      <div className="p-4 max-w-4xl mx-auto" style={{ paddingTop: isMobile ? '80px' : '24px' }}>
        {/* Simple Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard">
            <button className="text-white hover:text-gray-300 transition-colors">
              <ArrowLeft className="h-6 w-6" />
            </button>
          </Link>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
        </div>

        {/* Simple Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-gray-600"
          />
        </div>

        {/* Transactions List */}
        {transactionsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        ) : filteredTransactions.length > 0 ? (
          <div className="space-y-4">
            {filteredTransactions.map((transaction: any) => (
              <div key={transaction.id} className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(transaction.status)}
                    <h3 className="font-medium text-white">{transaction.itemName}</h3>
                  </div>
                  <div className="text-white font-mono font-bold">${parseFloat(transaction.price).toFixed(2)}</div>
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                  <span>{getPaymentMethodDisplay(transaction.paymentMethod)}</span>
                  <span className="capitalize">{transaction.status}</span>
                </div>
                
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {transaction.createdAt 
                      ? format(new Date(transaction.createdAt), "MMM dd, yyyy HH:mm")
                      : "N/A"
                    }
                  </span>
                  <span className="font-mono">
                    {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                  </span>
                </div>
                
                {transaction.status === "completed" && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <Button
                      onClick={() => handleRefundClick(transaction)}
                      variant="outline"
                      size="sm"
                      className="bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Refund
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {searchTerm ? "No matching transactions" : "No transactions yet"}
            </h3>
            <p className="text-gray-400">
              {searchTerm 
                ? "Try adjusting your search criteria" 
                : "Start processing payments to see your transaction history"
              }
            </p>
          </div>
        )}

        {/* Export Section */}
        {filteredTransactions.length > 0 && (
          <div className="mt-6 bg-gray-900 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white mb-1">Export Data</h3>
                <p className="text-gray-400 text-sm">Download your transaction data</p>
              </div>
              <button 
                onClick={exportToCSV}
                className="bg-gray-800 border border-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
        )}

        {/* Refund Dialog */}
        <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
          <DialogContent className="sm:max-w-[500px] bg-gray-900 border border-gray-700 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-white flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-red-400" />
                Process Refund
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                {selectedTransaction && (
                  <>Process a refund for <span className="font-medium text-white">{selectedTransaction.itemName}</span> (${selectedTransaction.price})</>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {selectedTransaction && (
              <div className="space-y-4 py-4">
                {/* Transaction Details */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <h4 className="font-medium text-white mb-2">Transaction Details</h4>
                  <div className="space-y-1 text-sm text-gray-300">
                    <div className="flex justify-between">
                      <span>Transaction ID:</span>
                      <span className="font-mono">{selectedTransaction.windcaveTransactionId || `TXN-${selectedTransaction.id}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{selectedTransaction.createdAt ? format(new Date(selectedTransaction.createdAt), "MMM dd, yyyy HH:mm") : "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Payment Method:</span>
                      <span>{getPaymentMethodDisplay(selectedTransaction.paymentMethod)}</span>
                    </div>
                  </div>
                </div>

                {/* Refund Form */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="refund-amount" className="text-white">Refund Amount</Label>
                    <Input
                      id="refund-amount"
                      type="number"
                      step="0.01"
                      max={selectedTransaction.price}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="refund-reason" className="text-white">Reason for Refund</Label>
                    <Textarea
                      id="refund-reason"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="Please provide a reason for the refund..."
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="refund-method" className="text-white">Refund Method</Label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                      <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        <SelectItem value="original_payment_method">Original Payment Method</SelectItem>
                        <SelectItem value="store_credit">Store Credit</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleCloseRefundDialog}
                    className="border-gray-600 text-gray-300 hover:bg-gray-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRefundSubmit}
                    disabled={refundMutation.isPending || !refundAmount || !refundReason}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {refundMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      "Process Refund"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}