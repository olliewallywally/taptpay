import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
 
  Download, 
  CreditCard, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  DollarSign,
  Eye,
  EyeOff,
  RotateCw,
  Calendar,
  Hash,
  Smartphone,
  QrCode,
  CreditCard as Card
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";

export default function Transactions() {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");
  const [refundModal, setRefundModal] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Function to toggle card flip
  const toggleCardFlip = (transactionId: number) => {
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionId)) {
        newSet.delete(transactionId);
      } else {
        newSet.add(transactionId);
      }
      return newSet;
    });
  };
  

  const merchantId = getCurrentMerchantId();
  
  if (!merchantId) {
    window.location.href = '/login';
    return <div>Redirecting to login...</div>;
  }

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  const filteredTransactions = transactions?.filter((transaction: any) =>
    transaction.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (transaction.windcaveTransactionId && transaction.windcaveTransactionId.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  // Refund mutation
  const refundMutation = useMutation({
    mutationFn: async ({ transactionId, amount, reason }: { transactionId: number, amount: number, reason: string }) => {
      return apiRequest("POST", `/api/transactions/${transactionId}/refunds`, { 
        refundAmount: amount.toString(), 
        refundReason: reason,
        refundMethod: "original_payment_method"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
      toast({
        title: "Refund processed",
        description: "The refund has been processed successfully.",
      });
      setRefundModal(null);
      setRefundAmount("");
      setRefundReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Refund failed",
        description: error.message || "Failed to process refund. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleRefund = (transaction: any) => {
    setRefundModal(transaction);
    setRefundAmount(transaction.price.toString());
    setRefundReason("");
  };

  const processRefund = () => {
    if (!refundModal || !refundAmount || !refundReason) {
      toast({
        title: "Missing information",
        description: "Please enter both refund amount and reason.",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(refundAmount);
    if (amount <= 0 || amount > parseFloat(refundModal.price)) {
      toast({
        title: "Invalid amount",
        description: "Refund amount must be between $0.01 and the transaction amount.",
        variant: "destructive",
      });
      return;
    }

    refundMutation.mutate({
      transactionId: refundModal.id,
      amount,
      reason: refundReason
    });
  };

  const exportToCSV = () => {
    if (!transactions || transactions.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no transactions to export.",
        variant: "destructive",
      });
      return;
    }

    const headers = ["Date", "Time", "Transaction ID", "Item", "Amount", "Status", "Payment Method"];
    const csvContent = [
      headers.join(","),
      ...transactions.map((t: any) => {
        const date = t.createdAt ? new Date(t.createdAt) : new Date();
        return [
          format(date, "yyyy-MM-dd"),
          format(date, "HH:mm:ss"),
          t.windcaveTransactionId || `TXN-${t.id}`,
          `"${t.itemName}"`,
          t.price,
          t.status,
          t.paymentMethod === 'nfc_tap' ? 'NFC Tap' :
          t.paymentMethod === 'qr_code' ? 'QR Code' :
          t.paymentMethod === 'card_reader' ? 'Card Reader' : 'Card Payment'
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export successful",
      description: "Transaction data has been downloaded as CSV.",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-400" />;
    }
  };

  const getPaymentIcon = (paymentMethod: string) => {
    switch (paymentMethod) {
      case 'nfc_tap':
        return <ArrowUpRight className="h-4 w-4 text-blue-400" />;
      case 'qr_code':
        return <CreditCard className="h-4 w-4 text-purple-400" />;
      default:
        return <ArrowDownRight className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900">
      <div className={`container mx-auto ${isMobile ? 'px-3' : 'px-4'} ${isMobile ? 'pt-6' : 'pt-8'} ${isMobile ? 'pb-4' : 'pb-8'}`}>
          {/* Header */}
          <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} justify-between items-start ${isMobile ? '' : 'sm:items-center'} ${isMobile ? 'mb-4' : 'mb-6'} ${isMobile ? 'gap-3' : 'gap-4'}`}>
            <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-bold text-white`}>Transactions</h1>
            {transactions && transactions.length > 0 && (
              <button
                onClick={exportToCSV}
                className={`flex items-center gap-2 ${isMobile ? 'px-4 py-3 text-sm' : 'px-4 py-2'} backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors ${isMobile ? 'w-full justify-center' : ''}`}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
          </div>

          {/* Search */}
          <div className={`${isMobile ? 'mb-4' : 'mb-6'}`}>
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full ${isMobile ? 'px-4 py-4 text-base rounded-2xl' : 'px-4 py-3 rounded-xl'} backdrop-blur-xl bg-black/40 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-[#00FF66]/50 transition-colors`}
            />
          </div>

          {/* Content */}
          {isLoading ? (
            <div className={`flex flex-col items-center justify-center ${isMobile ? 'py-16' : 'py-12'}`}>
              <div className={`animate-spin rounded-full ${isMobile ? 'h-10 w-10' : 'h-8 w-8'} border-b-2 border-[#00FF66] mb-4`}></div>
              <p className={`text-white/70 ${isMobile ? 'text-sm' : 'text-base'}`}>Loading transactions...</p>
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <div className={`text-center ${isMobile ? 'py-8' : 'py-12'}`}>
              <div className={`dashboard-card-glass ${isMobile ? 'rounded-2xl p-8' : 'rounded-3xl p-12'} mx-auto max-w-md`}>
                <CreditCard className={`mx-auto ${isMobile ? 'h-10 w-10' : 'h-12 w-12'} text-white/40 mb-4`} />
                <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-medium text-white mb-2`}>No transactions yet</h3>
                <p className={`text-white/70 ${isMobile ? 'text-sm' : ''}`}>
                  Transactions will appear here once you start processing payments
                </p>
              </div>
            </div>
          ) : (
            <div className={`${isMobile ? 'space-y-4' : 'space-y-4'}`}>
              {filteredTransactions.map((transaction: any) => {
                const isFlipped = flippedCards.has(transaction.id);
                
                if (isMobile) {
                  return (
                    <div key={transaction.id} className="dashboard-card-glass rounded-2xl p-5">
                      {!isFlipped ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(transaction.status)}
                              <h3 className="text-xl font-semibold text-white">
                                {transaction.itemName}
                              </h3>
                            </div>
                            <button
                              onClick={() => toggleCardFlip(transaction.id)}
                              className="p-2 text-white/50 hover:text-white transition-colors"
                            >
                              <Eye className="h-5 w-5" />
                            </button>
                          </div>
                          
                          <div className="text-white/70 text-base">
                            {transaction.createdAt 
                              ? format(new Date(transaction.createdAt), "MMM dd, yyyy 'at' HH:mm")
                              : "Date not available"
                            }
                          </div>
                          
                          <div className="bg-black/20 p-4 rounded-xl text-center">
                            <div className="text-3xl font-bold text-white mb-3">
                              ${parseFloat(transaction.price).toFixed(2)}
                            </div>
                            <div className={`inline-flex px-4 py-2 rounded-xl text-sm font-medium ${
                              transaction.status === 'completed' 
                                ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                                : transaction.status === 'failed'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                            }`}>
                              {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="bg-black/20 p-3 rounded-xl">
                              <span className="text-white/50 text-sm">
                                ID: {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-3 bg-black/20 p-3 rounded-xl">
                              {getPaymentIcon(transaction.paymentMethod)}
                              <span className="text-white/50 text-sm">
                                {transaction.paymentMethod === 'nfc_tap' ? 'NFC Tap' :
                                 transaction.paymentMethod === 'qr_code' ? 'QR Code' :
                                 transaction.paymentMethod === 'card_reader' ? 'Card Reader' :
                                 'Card Payment'}
                              </span>
                            </div>
                          </div>
                          
                          {transaction.status === 'completed' && (
                            <button
                              onClick={() => handleRefund(transaction)}
                              className="w-full flex items-center justify-center gap-2 px-6 py-4 text-base rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 transition-colors"
                            >
                              <RotateCcw className="h-5 w-5" />
                              Process Refund
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-5">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-white">Transaction Details</h3>
                            <button
                              onClick={() => toggleCardFlip(transaction.id)}
                              className="p-3 text-white/50 hover:text-white transition-colors"
                            >
                              <EyeOff className="h-5 w-5" />
                            </button>
                          </div>

                          <div className="space-y-4">
                            <div className="bg-black/20 p-4 rounded-xl">
                              <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                                <Hash className="h-4 w-4" />
                                Transaction ID
                              </div>
                              <p className="text-white text-sm font-mono break-all">
                                {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                              </p>
                            </div>
                            
                            <div className="bg-black/20 p-4 rounded-xl">
                              <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                                <Calendar className="h-4 w-4" />
                                Date & Time
                              </div>
                              <p className="text-white text-sm">
                                {transaction.createdAt 
                                  ? format(new Date(transaction.createdAt), "dd/MM/yyyy HH:mm")
                                  : "N/A"
                                }
                              </p>
                            </div>

                            <div className="bg-black/20 p-4 rounded-xl">
                              <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                                {getPaymentIcon(transaction.paymentMethod)}
                                Payment Method
                              </div>
                              <div className="flex items-center gap-2 px-3 py-2 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl">
                                {transaction.paymentMethod === 'nfc_tap' && <Smartphone className="h-4 w-4 text-blue-400" />}
                                {transaction.paymentMethod === 'qr_code' && <QrCode className="h-4 w-4 text-green-400" />}
                                {transaction.paymentMethod === 'card_reader' && <Card className="h-4 w-4 text-yellow-400" />}
                                <span className="text-white text-sm">
                                  {transaction.paymentMethod === 'nfc_tap' ? 'NFC Tap Payment' :
                                   transaction.paymentMethod === 'qr_code' ? 'QR Code Payment' :
                                   transaction.paymentMethod === 'card_reader' ? 'Card Reader Payment' :
                                   'Card Payment'}
                                </span>
                              </div>
                            </div>

                            <div className="bg-black/20 p-4 rounded-xl">
                              <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
                                <DollarSign className="h-4 w-4" />
                                Amount Details
                              </div>
                              <div className="px-3 py-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl">
                                <div className="flex justify-between items-center">
                                  <span className="text-white/70 text-sm">Total Amount:</span>
                                  <span className="text-white font-bold text-lg">
                                    ${parseFloat(transaction.price).toFixed(2)}
                                  </span>
                                </div>
                                {transaction.fee && (
                                  <div className="flex justify-between items-center mt-1 text-sm">
                                    <span className="text-white/50">Processing Fee:</span>
                                    <span className="text-white/70">${transaction.fee.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="bg-black/20 p-4 rounded-xl">
                              <div className="text-white/70 text-sm mb-2">Status</div>
                              <div className={`flex items-center gap-2 px-3 py-3 rounded-xl ${
                                transaction.status === 'completed' 
                                  ? 'bg-green-500/20 border border-green-500/30' 
                                  : transaction.status === 'failed'
                                  ? 'bg-red-500/20 border border-red-500/30'
                                  : 'bg-yellow-500/20 border border-yellow-500/30'
                              }`}>
                                {getStatusIcon(transaction.status)}
                                <span className={`font-medium text-sm ${
                                  transaction.status === 'completed' ? 'text-green-300' :
                                  transaction.status === 'failed' ? 'text-red-300' : 'text-yellow-300'
                                }`}>
                                  {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {transaction.status === 'completed' && (
                            <div className="pt-4 border-t border-white/10">
                              <button
                                onClick={() => handleRefund(transaction)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-4 text-base rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 transition-colors"
                              >
                                <RotateCcw className="h-5 w-5" />
                                Process Refund
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                
                // Desktop layout
                return (
                  <div 
                    key={transaction.id} 
                    className="relative perspective-1000 min-h-[180px]"
                  >
                    <div className={`relative w-full h-full transform transition-transform duration-700 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
                      <div className="absolute inset-0 dashboard-card-glass rounded-3xl p-6 hover:bg-white/10 transition-all duration-200 backface-hidden">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              {getStatusIcon(transaction.status)}
                              <h3 className="text-lg font-medium text-white">
                                {transaction.itemName}
                              </h3>
                              <button
                                onClick={() => toggleCardFlip(transaction.id)}
                                className="ml-auto p-1 text-white/50 hover:text-white transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            </div>
                            
                            <p className="text-white/70 text-sm mb-3">
                              {transaction.createdAt 
                                ? format(new Date(transaction.createdAt), "MMM dd, yyyy 'at' HH:mm")
                                : "Date not available"
                              }
                            </p>
                            
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-white/50 text-xs">
                                ID: {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                              </span>
                              
                              <div className="flex items-center gap-1">
                                {getPaymentIcon(transaction.paymentMethod)}
                                <span className="text-white/50 text-xs">
                                  {transaction.paymentMethod === 'nfc_tap' ? 'NFC Tap' :
                                   transaction.paymentMethod === 'qr_code' ? 'QR Code' :
                                   transaction.paymentMethod === 'card_reader' ? 'Card Reader' :
                                   'Card Payment'}
                                </span>
                              </div>
                              
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                transaction.status === 'completed' 
                                  ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                                  : transaction.status === 'failed'
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                  : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                              }`}>
                                {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-2xl font-bold text-white">
                              ${parseFloat(transaction.price).toFixed(2)}
                            </div>
                            
                            {transaction.status === 'completed' && (
                              <button
                                onClick={() => handleRefund(transaction)}
                                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 transition-colors"
                              >
                                <RotateCcw className="h-4 w-4" />
                                Process Refund
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="absolute inset-0 dashboard-card-glass rounded-3xl p-6 backface-hidden rotate-y-180 overflow-y-auto">
                        <div className="h-full flex flex-col">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-white">Transaction Details</h3>
                            <button
                              onClick={() => toggleCardFlip(transaction.id)}
                              className="p-1 text-white/50 hover:text-white transition-colors"
                            >
                              <EyeOff className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="space-y-4 flex-1">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-white/70 text-sm">
                                  <Hash className="h-4 w-4" />
                                  Transaction ID
                                </div>
                                <p className="text-white text-sm font-mono break-all">
                                  {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                                </p>
                              </div>
                              
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-white/70 text-sm">
                                  <Calendar className="h-4 w-4" />
                                  Date & Time
                                </div>
                                <p className="text-white text-sm">
                                  {transaction.createdAt 
                                    ? format(new Date(transaction.createdAt), "dd/MM/yyyy HH:mm")
                                    : "N/A"
                                  }
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-white/70 text-sm">
                                {getPaymentIcon(transaction.paymentMethod)}
                                Payment Method
                              </div>
                              <div className="flex items-center gap-2 px-3 py-2 backdrop-blur-xl bg-black/40 border border-white/20 rounded-lg">
                                {transaction.paymentMethod === 'nfc_tap' && <Smartphone className="h-4 w-4 text-blue-400" />}
                                {transaction.paymentMethod === 'qr_code' && <QrCode className="h-4 w-4 text-green-400" />}
                                {transaction.paymentMethod === 'card_reader' && <Card className="h-4 w-4 text-yellow-400" />}
                                <span className="text-white text-sm">
                                  {transaction.paymentMethod === 'nfc_tap' ? 'NFC Tap Payment' :
                                   transaction.paymentMethod === 'qr_code' ? 'QR Code Payment' :
                                   transaction.paymentMethod === 'card_reader' ? 'Card Reader Payment' :
                                   'Card Payment'}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-white/70 text-sm">
                                <DollarSign className="h-4 w-4" />
                                Amount Details
                              </div>
                              <div className="px-3 py-2 backdrop-blur-xl bg-black/40 border border-white/20 rounded-lg">
                                <div className="flex justify-between items-center">
                                  <span className="text-white/70 text-sm">Total Amount:</span>
                                  <span className="text-white font-bold text-lg">
                                    ${parseFloat(transaction.price).toFixed(2)}
                                  </span>
                                </div>
                                {transaction.fee && (
                                  <div className="flex justify-between items-center mt-1 text-sm">
                                    <span className="text-white/50">Processing Fee:</span>
                                    <span className="text-white/70">${transaction.fee.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="text-white/70 text-sm">Status</div>
                              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                                transaction.status === 'completed' 
                                  ? 'bg-green-500/20 border border-green-500/30' 
                                  : transaction.status === 'failed'
                                  ? 'bg-red-500/20 border border-red-500/30'
                                  : 'bg-yellow-500/20 border border-yellow-500/30'
                              }`}>
                                {getStatusIcon(transaction.status)}
                                <span className={`font-medium text-sm ${
                                  transaction.status === 'completed' ? 'text-green-300' :
                                  transaction.status === 'failed' ? 'text-red-300' : 'text-yellow-300'
                                }`}>
                                  {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {transaction.status === 'completed' && (
                            <div className="mt-4 pt-4 border-t border-white/10">
                              <button
                                onClick={() => handleRefund(transaction)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 transition-colors"
                              >
                                <RotateCcw className="h-4 w-4" />
                                Process Refund
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4">
          <div className={`dashboard-card-glass ${isMobile ? 'rounded-2xl w-full max-w-sm' : 'rounded-3xl w-full max-w-md'} max-h-[90vh] overflow-y-auto`}>
            <div className={`${isMobile ? 'p-5' : 'p-6'}`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-white`}>Process Refund</h3>
                <button
                  onClick={() => setRefundModal(null)}
                  className="text-white/70 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-white/90 text-sm font-medium mb-2">
                    Transaction Details
                  </label>
                  <div className="backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl p-4">
                    <p className="text-white font-medium">{refundModal.itemName}</p>
                    <p className="text-white/70 text-sm">
                      {refundModal.createdAt 
                        ? format(new Date(refundModal.createdAt), "MMM dd, yyyy 'at' HH:mm")
                        : "Date not available"
                      }
                    </p>
                    <p className="text-white/70 text-sm">
                      ID: {refundModal.windcaveTransactionId || `TXN-${refundModal.id}`}
                    </p>
                    <p className="text-white font-bold text-lg mt-2">
                      Original Amount: ${parseFloat(refundModal.price).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-white/90 text-sm font-medium mb-2">
                    Refund Amount
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                    <input
                      type="number"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      max={refundModal.price}
                      min="0.01"
                      step="0.01"
                      className={`w-full pl-10 pr-4 ${isMobile ? 'py-4 text-base' : 'py-3'} backdrop-blur-xl bg-black/40 border border-white/20 ${isMobile ? 'rounded-2xl' : 'rounded-xl'} text-white placeholder-white/50 focus:outline-none focus:border-[#00FF66]/50 transition-colors`}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white/90 text-sm font-medium mb-2">
                    Refund Reason
                  </label>
                  <textarea
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    rows={isMobile ? 4 : 3}
                    className={`w-full px-4 ${isMobile ? 'py-4 text-base' : 'py-3'} backdrop-blur-xl bg-black/40 border border-white/20 ${isMobile ? 'rounded-2xl' : 'rounded-xl'} text-white placeholder-white/50 focus:outline-none focus:border-[#00FF66]/50 transition-colors resize-none`}
                    placeholder="Enter reason for refund..."
                  />
                </div>
              </div>

              <div className={`flex ${isMobile ? 'flex-col gap-4' : 'flex-row gap-3'}`}>
                <button
                  onClick={() => setRefundModal(null)}
                  className={`${isMobile ? 'w-full py-4' : 'flex-1 py-3'} px-4 backdrop-blur-xl bg-black/40 border border-white/20 ${isMobile ? 'rounded-2xl' : 'rounded-xl'} text-white hover:bg-black/60 transition-colors`}
                >
                  Cancel
                </button>
                <button
                  onClick={processRefund}
                  disabled={refundMutation.isPending}
                  className={`${isMobile ? 'w-full py-4' : 'flex-1 py-3'} px-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 ${isMobile ? 'rounded-2xl' : 'rounded-xl'} transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                >
                  {refundMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-300"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      Process Refund
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}