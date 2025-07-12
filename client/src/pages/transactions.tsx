import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Eye } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

interface Transaction {
  id: number;
  merchantId: number;
  itemName: string;
  price: string;
  status: string;
  windcaveTransactionId?: string;
  createdAt: string;
}

export default function TransactionsPage() {
  const [merchantId, setMerchantId] = useState<number | null>(null);

  useEffect(() => {
    // Get merchantId using the same method as other pages
    const getMerchantId = async () => {
      try {
        const token = localStorage.getItem("authToken");
        if (!token) return;

        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const userData = await response.json();
          console.log("Auth response:", userData);
          setMerchantId(userData.user.merchantId);
        }
      } catch (error) {
        console.error("Failed to get merchant ID:", error);
      }
    };

    getMerchantId();
  }, []);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: [`/api/merchants/${merchantId}/transactions`],
    enabled: !!merchantId,
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: "secondary" as const, label: "Pending", className: "bg-gray-100 text-gray-800" },
      processing: { variant: "default" as const, label: "Processing", className: "bg-blue-100 text-blue-800" },
      completed: { variant: "default" as const, label: "Completed", className: "bg-green-100 text-green-800" },
      failed: { variant: "destructive" as const, label: "Failed", className: "bg-red-100 text-red-800" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <Badge 
        variant={config.variant} 
        className={config.className}
      >
        {config.label}
      </Badge>
    );
  };

  const handleExportTransactions = async () => {
    try {
      const response = await fetch(`/api/merchants/${merchantId}/export/transactions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (isLoading || !merchantId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  console.log("Transactions data:", transactions);
  console.log("Merchant ID:", merchantId);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Gradient Background with Floating Orbs */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900">
        <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse shadow-2xl" style={{
          animation: 'glow-pulse 4s ease-in-out infinite',
          filter: 'blur(40px)',
        }}></div>
        <div className="absolute top-40 right-20 w-96 h-96 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-75 shadow-2xl" style={{
          animation: 'glow-pulse 5s ease-in-out infinite 1.5s',
          filter: 'blur(45px)',
        }}></div>
        <div className="absolute -bottom-8 left-40 w-96 h-96 bg-gradient-to-r from-lime-400 to-green-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-150 shadow-2xl" style={{
          animation: 'glow-pulse 6s ease-in-out infinite 3s',
          filter: 'blur(50px)',
        }}></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 pt-28">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <button className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 text-black rounded-xl hover:bg-white/15 transition-all duration-300 backdrop-blur-sm">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
            </Link>
            <h1 className="text-3xl font-bold text-white">All Transactions</h1>
          </div>
          
          <button 
            onClick={handleExportTransactions}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 text-black rounded-xl hover:bg-white/15 transition-all duration-300 backdrop-blur-sm"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        {/* Transactions List */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-6">Transaction History</h2>
          
          {transactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/70 text-lg mb-4">No transactions yet</p>
              <p className="text-sm text-white/50 mb-6">
                Create your first transaction from the terminal page
              </p>
              <Link href="/terminal">
                <button className="px-6 py-3 bg-white/20 text-white rounded-xl hover:bg-white/25 transition-all duration-300 backdrop-blur-sm border border-white/30">
                  Go to Terminal
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Desktop Table Header */}
              <div className="hidden md:grid grid-cols-6 gap-4 font-medium text-white/70 text-sm border-b border-white/20 pb-2">
                <div>Transaction ID</div>
                <div>Item</div>
                <div>Amount</div>
                <div>Status</div>
                <div>Payment ID</div>
                <div>Date</div>
              </div>

                {/* Transactions */}
                {transactions.slice().reverse().map((transaction: Transaction) => (
                  <div 
                    key={transaction.id}
                    className="bg-white/5 border border-white/20 rounded-xl hover:bg-white/10 transition-all duration-300 backdrop-blur-sm"
                  >
                    {/* Mobile Layout */}
                    <div className="md:hidden p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-lg text-white">#{transaction.id}</p>
                          <p className="text-white/70">{transaction.itemName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-xl text-white">${transaction.price}</p>
                          {getStatusBadge(transaction.status)}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/20">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-white/60">Payment ID:</span>
                          <span className="font-mono text-xs text-white/80">{transaction.windcaveTransactionId || 'Pending'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm mt-1">
                          <span className="text-white/60">Date:</span>
                          <span className="text-white/80">{format(new Date(transaction.createdAt), 'MMM d, h:mm a')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Desktop Layout */}
                    <div className="hidden md:grid md:grid-cols-6 gap-4 p-4">
                      <div>
                        <span className="font-medium text-white">#{transaction.id}</span>
                      </div>
                      <div>
                        <span className="text-white">{transaction.itemName}</span>
                      </div>
                      <div>
                        <span className="font-bold text-white">${transaction.price}</span>
                      </div>
                      <div>
                        {getStatusBadge(transaction.status)}
                      </div>
                      <div>
                        <span className="text-sm text-white/70 font-mono">
                          {transaction.windcaveTransactionId || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">
                          {format(new Date(transaction.createdAt), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}