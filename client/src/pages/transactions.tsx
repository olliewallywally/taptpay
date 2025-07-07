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
          setMerchantId(userData.merchantId);
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
      pending: { variant: "secondary" as const, label: "Pending" },
      processing: { variant: "default" as const, label: "Processing" },
      completed: { variant: "default" as const, label: "Completed", className: "bg-green-100 text-green-800" },
      failed: { variant: "destructive" as const, label: "Failed" },
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

  if (isLoading) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">All Transactions</h1>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleExportTransactions}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Link href="/terminal">
              <Button className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Terminal
              </Button>
            </Link>
          </div>
        </div>

        {/* Transactions List */}
        <Card className="rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg mb-4">No transactions yet</p>
                <p className="text-sm text-gray-400 mb-6">
                  Create your first transaction from the terminal page
                </p>
                <Link href="/terminal">
                  <Button>Go to Terminal</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Desktop Table Header */}
                <div className="hidden md:grid grid-cols-6 gap-4 font-medium text-gray-500 text-sm border-b pb-2">
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
                    className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {/* Mobile Layout */}
                    <div className="md:hidden space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">#{transaction.id}</p>
                          <p className="text-sm text-gray-600">{transaction.itemName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">${transaction.price}</p>
                          {getStatusBadge(transaction.status)}
                        </div>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>{transaction.windcaveTransactionId || 'N/A'}</span>
                        <span>{format(new Date(transaction.createdAt), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                    </div>

                    {/* Desktop Layout */}
                    <div className="hidden md:block">
                      <span className="font-medium">#{transaction.id}</span>
                    </div>
                    <div className="hidden md:block">
                      <span className="text-gray-900">{transaction.itemName}</span>
                    </div>
                    <div className="hidden md:block">
                      <span className="font-bold">${transaction.price}</span>
                    </div>
                    <div className="hidden md:block">
                      {getStatusBadge(transaction.status)}
                    </div>
                    <div className="hidden md:block">
                      <span className="text-sm text-gray-600 font-mono">
                        {transaction.windcaveTransactionId || 'N/A'}
                      </span>
                    </div>
                    <div className="hidden md:block">
                      <span className="text-sm text-gray-600">
                        {format(new Date(transaction.createdAt), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}