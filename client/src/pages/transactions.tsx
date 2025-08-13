import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Menu, 
  X, 
  Download, 
  CreditCard, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  DollarSign
} from "lucide-react";
import { format } from "date-fns";

export default function Transactions() {
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [refundModal, setRefundModal] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

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
      return apiRequest(`/api/transactions/${transactionId}/refund`, {
        method: "POST",
        body: { amount, reason }
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
    <>
      {/* Menu Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Sliding Menu */}
      <div 
        className={`fixed right-0 top-0 h-full ${isMobile ? 'w-[70%]' : 'w-80'} bg-gray-800 ${isMobile ? '' : 'border-l border-gray-700'} z-50 transform transition-transform duration-300 ease-in-out ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-white">Menu</h2>
            <button onClick={() => setMenuOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="space-y-4">
            <a href="/dashboard" className="block py-3 px-4 text-white rounded-xl transition-colors font-medium">
              Dashboard
            </a>
            <a href="/merchant" className="block py-3 px-4 text-white rounded-xl transition-colors font-medium">
              Terminal
            </a>
            <a href="/transactions" className="block py-3 px-4 text-[#00CC52] rounded-xl font-medium">
              Transactions
            </a>
            <a href="/settings" className="block py-3 px-4 text-white rounded-xl transition-colors font-medium">
              Settings
            </a>
            <div className="pt-4 mt-4 border-t border-gray-600">
              <button 
                onClick={() => {
                  localStorage.removeItem('auth-token');
                  window.location.href = '/login';
                }}
                className="block w-full text-left py-3 px-4 text-red-400 hover:text-red-300 rounded-xl transition-colors font-medium"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Main Content with Slide Animation */}
      <div 
        className={`min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 transform transition-transform duration-300 ease-in-out ${
          menuOpen ? (isMobile ? '-translate-x-[70%]' : '-translate-x-80') : 'translate-x-0'
        }`}
      >
        {/* Menu Icon */}
        <div className="fixed top-4 right-4 z-30">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        <div className={`container mx-auto px-4 ${isMobile ? 'pt-20' : 'pt-28'} pb-8`}>
          {/* Header */}
          <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} justify-between items-start ${isMobile ? '' : 'sm:items-center'} mb-6 gap-4`}>
            <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-white`}>Transactions</h1>
            {transactions && transactions.length > 0 && (
              <button
                onClick={exportToCSV}
                className={`flex items-center gap-2 px-4 py-2 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors ${isMobile ? 'w-full justify-center' : ''}`}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
          </div>

          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full px-4 ${isMobile ? 'py-4 text-base' : 'py-3'} backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-[#00FF66]/50 transition-colors`}
            />
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00FF66]"></div>
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <div className="text-center py-12">
              <div className="dashboard-card-glass rounded-3xl p-12 mx-auto max-w-md">
                <CreditCard className="mx-auto h-12 w-12 text-white/40 mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">No transactions yet</h3>
                <p className="text-white/70">
                  Transactions will appear here once you start processing payments
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTransactions.map((transaction: any) => (
                <div 
                  key={transaction.id} 
                  className={`dashboard-card-glass rounded-3xl ${isMobile ? 'p-4' : 'p-6'} hover:bg-white/10 transition-all duration-200`}
                >
                  <div className={`flex ${isMobile ? 'flex-col' : 'items-start justify-between'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(transaction.status)}
                        <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-medium text-white`}>
                          {transaction.itemName}
                        </h3>
                      </div>
                      
                      <p className={`text-white/70 ${isMobile ? 'text-xs' : 'text-sm'} mb-3`}>
                        {transaction.createdAt 
                          ? format(new Date(transaction.createdAt), "MMM dd, yyyy 'at' HH:mm")
                          : "Date not available"
                        }
                      </p>
                      
                      <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center gap-4'} text-sm`}>
                        <span className="text-white/50">
                          ID: {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          {getPaymentIcon(transaction.paymentMethod)}
                          <span className="text-white/50">
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
                          {transaction.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className={`${isMobile ? 'mt-4 flex justify-between items-center' : 'text-right'}`}>
                      <div className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-white`}>
                        ${parseFloat(transaction.price).toFixed(2)}
                      </div>
                      
                      {transaction.status === 'completed' && (
                        <button
                          onClick={() => handleRefund(transaction)}
                          className={`flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 rounded-lg transition-colors ${isMobile ? 'text-sm' : ''}`}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {isMobile ? 'Refund' : 'Process Refund'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4">
          <div className={`dashboard-card-glass rounded-3xl ${isMobile ? 'w-full max-w-sm' : 'w-full max-w-md'} max-h-[90vh] overflow-y-auto`}>
            <div className={`${isMobile ? 'p-4' : 'p-6'}`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-white`}>Process Refund</h3>
                <button
                  onClick={() => setRefundModal(null)}
                  className="text-white/70 hover:text-white"
                >
                  <X className="h-6 w-6" />
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
                      className="w-full pl-10 pr-4 py-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-[#00FF66]/50 transition-colors"
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
                    rows={3}
                    className="w-full px-4 py-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-[#00FF66]/50 transition-colors resize-none"
                    placeholder="Enter reason for refund..."
                  />
                </div>
              </div>

              <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-3`}>
                <button
                  onClick={() => setRefundModal(null)}
                  className={`${isMobile ? 'w-full' : 'flex-1'} px-4 py-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors`}
                >
                  Cancel
                </button>
                <button
                  onClick={processRefund}
                  disabled={refundMutation.isPending}
                  className={`${isMobile ? 'w-full' : 'flex-1'} px-4 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
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
    </>
  );
}