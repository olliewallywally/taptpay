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
  Filter,
  Search,
  Calendar,
  RotateCcw,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
      return '📱 NFC Tap';
    case 'qr_code':
      return '📋 QR Code';
    case 'card_reader':
      return '💳 Card Reader';
    case 'manual':
      return '✋ Manual';
    default:
      return '💳 Card';
  }
};

export default function Transactions() {
  const merchantId = getCurrentMerchantId();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  // Filter transactions based on search and status
  const filteredTransactions = transactions?.filter((transaction: any) => {
    const matchesSearch = transaction.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transaction.windcaveTransactionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         `TXN-${transaction.id}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || transaction.status === statusFilter;
    return matchesSearch && matchesStatus;
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
    if (transaction.status !== "completed") {
      toast({
        title: "Cannot Refund",
        description: "Only completed transactions can be refunded",
        variant: "destructive",
      });
      return;
    }
    
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
      "Payment Method",
      "Windcave Transaction ID",
      "Windcave Fee",
      "Platform Fee",
      "Merchant Net"
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
          `"${transaction.itemName}"`, // Quote item name in case it contains commas
          transaction.price,
          transaction.status,
          getPaymentMethodDisplay(transaction.paymentMethod).replace(/📱|📋|💳|✋/g, ''), // Remove emojis for CSV
          transaction.windcaveTransactionId || "",
          transaction.windcaveFeeAmount || "0.00",
          transaction.platformFeeAmount || "0.00",
          transaction.merchantNet || "0.00"
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

  const totalTransactions = transactions?.length || 0;
  const completedTransactions = transactions?.filter((t: any) => t.status === 'completed').length || 0;
  const totalRevenue = transactions?.filter((t: any) => t.status === 'completed')
    .reduce((sum: number, t: any) => sum + parseFloat(t.price), 0) || 0;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {isMobile && <MobileHeader title="Transactions" />}
      {/* Dynamic black and grey gradients */}
      <div className="fixed inset-0 bg-gradient-to-br from-black via-gray-900 to-gray-800">
        <div className="absolute inset-0 bg-gradient-to-tr from-gray-900/40 via-black/60 to-gray-700/30 animate-gradient-xy"></div>
        <div className="absolute inset-0 bg-gradient-to-bl from-gray-800/30 via-gray-900/50 to-black/40 animate-gradient-reverse"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-600/10 via-transparent to-gray-900/20 animate-pulse"></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 max-w-7xl mx-auto" style={{ paddingTop: isMobile ? '80px' : '24px' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 sm:mb-8">
          <Link href="/dashboard">
            <button className="backdrop-blur-xl bg-white/10 border border-white/20 text-white p-3 rounded-xl hover:bg-white/20 hover:scale-110 hover:shadow-lg transition-all duration-300 self-start group">
              <ArrowLeft className="h-5 w-5 group-hover:translate-x-[-2px] transition-transform duration-300" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Transaction History</h1>
            <p className="text-white/70 text-sm sm:text-base">View and manage all your payment transactions</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-4 sm:p-6 hover:bg-white/10 hover:border-white/30 hover:scale-105 transition-all duration-300 cursor-pointer group">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400 group-hover:text-blue-300 transition-colors duration-300" />
              <h3 className="text-base sm:text-lg font-semibold text-white group-hover:text-white/90 transition-colors duration-300">Total Transactions</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white group-hover:text-blue-200 transition-colors duration-300">{totalTransactions}</p>
            <p className="text-white/60 text-xs sm:text-sm group-hover:text-white/70 transition-colors duration-300">All time</p>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-4 sm:p-6 hover:bg-white/10 hover:border-white/30 hover:scale-105 transition-all duration-300 cursor-pointer group">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-green-400 group-hover:text-green-300 transition-colors duration-300" />
              <h3 className="text-base sm:text-lg font-semibold text-white group-hover:text-white/90 transition-colors duration-300">Completed</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white group-hover:text-green-200 transition-colors duration-300">{completedTransactions}</p>
            <p className="text-white/60 text-xs sm:text-sm group-hover:text-white/70 transition-colors duration-300">{totalTransactions > 0 ? ((completedTransactions / totalTransactions) * 100).toFixed(1) : 0}% success rate</p>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-4 sm:p-6 hover:bg-white/10 hover:border-white/30 hover:scale-105 transition-all duration-300 cursor-pointer group">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xl sm:text-2xl group-hover:scale-110 transition-transform duration-300">💰</div>
              <h3 className="text-base sm:text-lg font-semibold text-white group-hover:text-white/90 transition-colors duration-300">Total Revenue</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white group-hover:text-yellow-200 transition-colors duration-300">${totalRevenue.toFixed(2)}</p>
            <p className="text-white/60 text-xs sm:text-sm group-hover:text-white/70 transition-colors duration-300">From completed transactions</p>
          </div>
        </div>

        {/* Filters */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm sm:text-base"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto pl-10 pr-8 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none text-sm sm:text-base"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="processing">Processing</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl overflow-hidden">
          {transactionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-white/70" />
            </div>
          ) : filteredTransactions.length > 0 ? (
            <div className="space-y-3 sm:space-y-0">
              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-3">
                {filteredTransactions.map((transaction: any) => (
                  <div key={transaction.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] transition-all duration-300 cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-white text-lg group-hover:text-blue-200 transition-colors duration-300">{transaction.itemName}</div>
                      <div className="text-white font-mono font-bold group-hover:text-green-200 transition-colors duration-300">${parseFloat(transaction.price).toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(transaction.status)}
                      <span className="text-xs text-white bg-white/10 px-2 py-1 rounded-lg border border-white/20">
                        {transaction.status}
                      </span>
                      <span className="text-white/60 text-sm ml-auto group-hover:text-white/80 transition-colors duration-300">{getPaymentMethodDisplay(transaction.paymentMethod)}</span>
                    </div>
                    <div className="text-white/60 text-xs">
                      {transaction.createdAt 
                        ? format(new Date(transaction.createdAt), "MMM dd, yyyy HH:mm:ss")
                        : "N/A"
                      }
                    </div>
                    <div className="text-white/40 text-xs mt-1 font-mono">
                      {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                    </div>
                    {transaction.status === "completed" && (
                      <Button
                        onClick={() => handleRefundClick(transaction)}
                        variant="outline"
                        size="sm"
                        className="mt-3 bg-red-500/20 border-red-400/30 text-red-300 hover:bg-red-500/30 hover:border-red-400/50 hover:text-red-200"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Refund
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-full">
                  {/* Table Header */}
                  <div className="bg-white/5 border-b border-white/10 px-6 py-4">
                    <div className="grid grid-cols-7 gap-4 text-white/80 font-medium text-sm">
                      <div>Date & Time</div>
                      <div>Item Name</div>
                      <div>Amount</div>
                      <div>Method</div>
                      <div>Status</div>
                      <div>Transaction ID</div>
                      <div>Actions</div>
                    </div>
                  </div>

                  {/* Table Body */}
                  <div className="divide-y divide-white/5">
                    {filteredTransactions.map((transaction: any) => (
                      <div key={transaction.id} className="px-6 py-4 hover:bg-white/10 hover:border-l-4 hover:border-l-blue-400 transition-all duration-300 group">
                        <div className="grid grid-cols-7 gap-4 items-center">
                          <div className="text-white/90 text-sm">
                            {transaction.createdAt 
                              ? format(new Date(transaction.createdAt), "MMM dd, yyyy\nHH:mm:ss")
                              : "N/A"
                            }
                          </div>
                          <div className="font-medium text-white group-hover:text-blue-200 transition-colors duration-300">{transaction.itemName}</div>
                          <div className="text-white font-mono group-hover:text-green-200 transition-colors duration-300">${parseFloat(transaction.price).toFixed(2)}</div>
                          <div className="text-white/80 text-sm group-hover:text-white transition-colors duration-300">{getPaymentMethodDisplay(transaction.paymentMethod)}</div>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(transaction.status)}
                            <span className="text-xs text-white bg-white/10 px-2 py-1 rounded-lg border border-white/20">
                              {transaction.status}
                            </span>
                          </div>
                          <div className="text-xs text-white/60 font-mono">
                            {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                          </div>
                          <div>
                            {transaction.status === "completed" && (
                              <Button
                                onClick={() => handleRefundClick(transaction)}
                                variant="outline"
                                size="sm"
                                className="bg-red-500/20 border-red-400/30 text-red-300 hover:bg-red-500/30 hover:border-red-400/50 hover:text-red-200"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Refund
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <CreditCard className="mx-auto h-12 w-12 text-white/40 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                {searchTerm || statusFilter !== "all" ? "No matching transactions" : "No transactions yet"}
              </h3>
              <p className="text-white/60">
                {searchTerm || statusFilter !== "all" 
                  ? "Try adjusting your search or filter criteria" 
                  : "Start processing payments to see your transaction history"
                }
              </p>
            </div>
          )}
        </div>

        {/* Export Section */}
        {filteredTransactions.length > 0 && (
          <div className="mt-6 sm:mt-8 backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-1">Export Data</h3>
                <p className="text-white/60 text-xs sm:text-sm">Download your transaction data for external analysis</p>
              </div>
              <button 
                onClick={exportToCSV}
                className="backdrop-blur-xl bg-white/15 border border-white/30 text-white px-4 sm:px-6 py-3 rounded-xl hover:bg-white/25 hover:border-white/40 hover:scale-105 hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm sm:text-base group"
              >
                <Download className="h-4 w-4 group-hover:translate-y-[-1px] transition-transform duration-300" />
                <span className="group-hover:text-green-200 transition-colors duration-300">Export CSV</span>
              </button>
            </div>
          </div>
        )}

        {/* Refund Dialog */}
        <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] bg-black/90 backdrop-blur-xl border border-white/20 text-white flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-xl font-semibold text-white flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-red-400" />
                Process Refund
              </DialogTitle>
              <DialogDescription className="text-white/70">
                {selectedTransaction && (
                  <>Process a refund for <span className="font-medium text-white">{selectedTransaction.itemName}</span> (${selectedTransaction.price})</>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {selectedTransaction && (
              <>
                <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2" style={{ maxHeight: 'calc(90vh - 200px)' }}>
                  {/* Transaction Details */}
                  <div className="bg-white/5 border border-white/20 rounded-xl p-4">
                    <h4 className="text-sm font-medium text-white/80 mb-2">Transaction Details</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/60">Transaction ID:</span>
                        <span className="text-white font-mono">{selectedTransaction.windcaveTransactionId || `TXN-${selectedTransaction.id}`}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Original Amount:</span>
                        <span className="text-white font-mono">${selectedTransaction.price}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Payment Method:</span>
                        <span className="text-white">{getPaymentMethodDisplay(selectedTransaction.paymentMethod)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Refund Amount */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-white/80">Refund Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={selectedTransaction.price}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder-white/60 focus:border-white/40"
                      placeholder="Enter refund amount"
                    />
                    <p className="text-xs text-white/60">Maximum refund: ${selectedTransaction.price}</p>
                  </div>

                  {/* Refund Reason */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-white/80">Refund Reason</Label>
                    <Textarea
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder-white/60 focus:border-white/40 min-h-[80px]"
                      placeholder="Enter reason for refund (required)"
                    />
                  </div>

                  {/* Refund Method */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-white/80">Refund Method</Label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 backdrop-blur-xl border border-white/20">
                        <SelectItem value="original_payment_method" className="text-white focus:bg-white/10">
                          Original Payment Method
                        </SelectItem>
                        <SelectItem value="bank_transfer" className="text-white focus:bg-white/10">
                          Bank Transfer
                        </SelectItem>
                        <SelectItem value="store_credit" className="text-white focus:bg-white/10">
                          Store Credit
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Warning */}
                  <div className="bg-red-500/10 border border-red-400/20 rounded-xl p-3 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-red-300 font-medium">Refund Confirmation</p>
                      <p className="text-red-400/80 mt-1">This action cannot be undone. The refund will be processed immediately.</p>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons - Fixed at bottom */}
                <div className="flex gap-3 pt-4 border-t border-white/20 bg-black/90 backdrop-blur-xl flex-shrink-0">
                  <Button
                    onClick={handleCloseRefundDialog}
                    variant="outline"
                    className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRefundSubmit}
                    disabled={refundMutation.isPending || !refundAmount || !refundReason}
                    className="flex-1 bg-red-500/80 border-red-400/50 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {refundMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Process Refund
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}