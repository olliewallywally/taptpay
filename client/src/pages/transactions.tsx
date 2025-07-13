import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

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

  const totalTransactions = transactions?.length || 0;
  const completedTransactions = transactions?.filter((t: any) => t.status === 'completed').length || 0;
  const totalRevenue = transactions?.filter((t: any) => t.status === 'completed')
    .reduce((sum: number, t: any) => sum + parseFloat(t.price), 0) || 0;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Dynamic black and grey gradients */}
      <div className="fixed inset-0 bg-gradient-to-br from-black via-gray-900 to-gray-800">
        <div className="absolute inset-0 bg-gradient-to-tr from-gray-900/40 via-black/60 to-gray-700/30 animate-gradient-xy"></div>
        <div className="absolute inset-0 bg-gradient-to-bl from-gray-800/30 via-gray-900/50 to-black/40 animate-gradient-reverse"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-600/10 via-transparent to-gray-900/20 animate-pulse"></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 sm:mb-8">
          <Link href="/dashboard">
            <button className="backdrop-blur-xl bg-white/10 border border-white/20 text-white p-3 rounded-xl hover:bg-white/20 transition-all duration-300 self-start">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Transaction History</h1>
            <p className="text-white/70 text-sm sm:text-base">View and manage all your payment transactions</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400" />
              <h3 className="text-base sm:text-lg font-semibold text-white">Total Transactions</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{totalTransactions}</p>
            <p className="text-white/60 text-xs sm:text-sm">All time</p>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-green-400" />
              <h3 className="text-base sm:text-lg font-semibold text-white">Completed</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{completedTransactions}</p>
            <p className="text-white/60 text-xs sm:text-sm">{totalTransactions > 0 ? ((completedTransactions / totalTransactions) * 100).toFixed(1) : 0}% success rate</p>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xl sm:text-2xl">💰</div>
              <h3 className="text-base sm:text-lg font-semibold text-white">Total Revenue</h3>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white">${totalRevenue.toFixed(2)}</p>
            <p className="text-white/60 text-xs sm:text-sm">From completed transactions</p>
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
                  <div key={transaction.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors duration-200">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-white text-lg">{transaction.itemName}</div>
                      <div className="text-white font-mono font-bold">${parseFloat(transaction.price).toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(transaction.status)}
                      <span className="text-xs text-white bg-white/10 px-2 py-1 rounded-lg border border-white/20">
                        {transaction.status}
                      </span>
                      <span className="text-white/60 text-sm ml-auto">{getPaymentMethodDisplay(transaction.paymentMethod)}</span>
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
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-full">
                  {/* Table Header */}
                  <div className="bg-white/5 border-b border-white/10 px-6 py-4">
                    <div className="grid grid-cols-6 gap-4 text-white/80 font-medium text-sm">
                      <div>Date & Time</div>
                      <div>Item Name</div>
                      <div>Amount</div>
                      <div>Method</div>
                      <div>Status</div>
                      <div>Transaction ID</div>
                    </div>
                  </div>

                  {/* Table Body */}
                  <div className="divide-y divide-white/5">
                    {filteredTransactions.map((transaction: any) => (
                      <div key={transaction.id} className="px-6 py-4 hover:bg-white/5 transition-colors duration-200">
                        <div className="grid grid-cols-6 gap-4 items-center">
                          <div className="text-white/90 text-sm">
                            {transaction.createdAt 
                              ? format(new Date(transaction.createdAt), "MMM dd, yyyy\nHH:mm:ss")
                              : "N/A"
                            }
                          </div>
                          <div className="font-medium text-white">{transaction.itemName}</div>
                          <div className="text-white font-mono">${parseFloat(transaction.price).toFixed(2)}</div>
                          <div className="text-white/80 text-sm">{getPaymentMethodDisplay(transaction.paymentMethod)}</div>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(transaction.status)}
                            <span className="text-xs text-white bg-white/10 px-2 py-1 rounded-lg border border-white/20">
                              {transaction.status}
                            </span>
                          </div>
                          <div className="text-xs text-white/60 font-mono">
                            {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
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
              <button className="backdrop-blur-xl bg-white/15 border border-white/30 text-white px-4 sm:px-6 py-3 rounded-xl hover:bg-white/25 transition-all duration-300 flex items-center justify-center gap-2 text-sm sm:text-base">
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}