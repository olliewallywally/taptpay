import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { ArrowLeft, Download, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { MobileHeader } from "@/components/mobile-header";

export default function Transactions() {
  const merchantId = getCurrentMerchantId();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Redirect to login if no merchantId
  if (!merchantId) {
    window.location.href = '/login';
    return null;
  }

  // Get transactions data
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  // Export to CSV
  const exportToCSV = () => {
    if (!transactions || transactions.length === 0) {
      alert("No transactions to export");
      return;
    }

    const headers = ["Date", "Item", "Amount", "Status"];
    const csvContent = [
      headers.join(","),
      ...transactions.map((t: any) => [
        t.createdAt ? format(new Date(t.createdAt), "yyyy-MM-dd") : "",
        `"${t.itemName}"`,
        t.price,
        t.status
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {isMobile && (
        <MobileHeader title="Transactions">
          <div className="space-y-4">
            <Link href="/dashboard" className="block text-white hover:text-gray-300">
              Dashboard
            </Link>
            <Link href="/merchant" className="block text-white hover:text-gray-300">
              Terminal
            </Link>
          </div>
        </MobileHeader>
      )}
      
      <div className="p-6" style={{ paddingTop: isMobile ? '100px' : '24px' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <button className="text-white hover:text-gray-300">
                <ArrowLeft className="h-6 w-6" />
              </button>
            </Link>
            <h1 className="text-3xl font-bold">Transactions</h1>
          </div>
          
          {transactions && transactions.length > 0 && (
            <button 
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-600 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-xl font-medium mb-2">No transactions yet</h3>
            <p className="text-gray-400">
              Transactions will appear here once you start processing payments
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction: any) => (
              <div 
                key={transaction.id} 
                className="bg-gray-900 border border-gray-700 rounded-xl p-6 hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-white mb-1">
                      {transaction.itemName}
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                      {transaction.createdAt 
                        ? format(new Date(transaction.createdAt), "MMM dd, yyyy 'at' HH:mm")
                        : "Date not available"
                      }
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-400">
                        ID: {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        transaction.status === 'completed' 
                          ? 'bg-green-900 text-green-200 border border-green-800' 
                          : transaction.status === 'failed'
                          ? 'bg-red-900 text-red-200 border border-red-800'
                          : 'bg-yellow-900 text-yellow-200 border border-yellow-800'
                      }`}>
                        {transaction.status}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      ${parseFloat(transaction.price).toFixed(2)}
                    </div>
                    {transaction.paymentMethod && (
                      <div className="text-gray-400 text-sm mt-1">
                        {transaction.paymentMethod === 'nfc_tap' ? 'NFC Tap' :
                         transaction.paymentMethod === 'qr_code' ? 'QR Code' :
                         transaction.paymentMethod === 'card_reader' ? 'Card Reader' :
                         'Card Payment'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}