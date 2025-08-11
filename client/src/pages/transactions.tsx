import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { 
  Menu, 
  X, 
  Download, 
  CreditCard, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { format } from "date-fns";

export default function Transactions() {
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
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

  const exportToCSV = () => {
    if (!transactions || transactions.length === 0) {
      alert("No transactions to export");
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
        className={`fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-700 z-50 transform transition-transform duration-300 ease-in-out ${
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
            <a href="/dashboard" className="block py-3 px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              Dashboard
            </a>
            <a href="/merchant" className="block py-3 px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              Terminal
            </a>
            <a href="/transactions" className="block py-3 px-4 text-[#00FF66] bg-[#00FF66]/20 rounded-xl drop-shadow-[0_0_8px_#00FF66] font-medium">
              Transactions
            </a>
            <a href="/settings" className="block py-3 px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              Settings
            </a>
            <div className="pt-4 mt-4 border-t border-gray-700">
              <button 
                onClick={() => {
                  localStorage.removeItem('auth-token');
                  window.location.href = '/login';
                }}
                className="block w-full text-left py-3 px-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Main Content with Slide Animation */}
      <div 
        className={`min-h-screen bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900 transform transition-transform duration-300 ease-in-out ${
          menuOpen ? '-translate-x-80' : 'translate-x-0'
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

        <div className="container mx-auto px-4 pt-24 sm:pt-28 pb-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <h1 className="text-3xl font-bold text-white">Transactions</h1>
            {transactions && transactions.length > 0 && (
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors"
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
              className="w-full px-4 py-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-[#00FF66]/50 transition-colors"
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
                  className="dashboard-card-glass rounded-3xl p-6 hover:bg-white/10 transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(transaction.status)}
                        <h3 className="text-lg font-medium text-white">
                          {transaction.itemName}
                        </h3>
                      </div>
                      
                      <p className="text-white/70 text-sm mb-3">
                        {transaction.createdAt 
                          ? format(new Date(transaction.createdAt), "MMM dd, yyyy 'at' HH:mm")
                          : "Date not available"
                        }
                      </p>
                      
                      <div className="flex items-center gap-4 text-sm">
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
                    
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">
                        ${parseFloat(transaction.price).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}