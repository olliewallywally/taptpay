import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  PiggyBank, 
  Calculator,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Edit2,
  Check,
  X,
  Download,
  FileText,
  FileSpreadsheet,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

const rateUpdateSchema = z.object({
  currentProviderRate: z.string()
    .regex(/^\d+(\.\d{1,4})?$/, "Please enter a valid percentage (e.g., 2.9)")
    .refine((val) => {
      const num = parseFloat(val);
      return num >= 0 && num <= 100;
    }, "Rate must be between 0 and 100"),
});

type RateUpdateFormData = z.infer<typeof rateUpdateSchema>;

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const merchantId = getCurrentMerchantId();
  
  // Redirect to login if no merchantId
  if (!merchantId) {
    window.location.href = '/login';
    return <div>Redirecting to login...</div>;
  }
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  const form = useForm<RateUpdateFormData>({
    resolver: zodResolver(rateUpdateSchema),
    defaultValues: {
      currentProviderRate: "",
    },
  });

  // Get analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "analytics"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/analytics`);
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  // Get all transactions
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  // Update rates mutation
  const updateRatesMutation = useMutation({
    mutationFn: async (data: RateUpdateFormData) => {
      const response = await apiRequest("PUT", `/api/merchants/${merchantId}/rates`, {
        currentProviderRate: (parseFloat(data.currentProviderRate) / 100).toString(), // Convert percentage to decimal
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "analytics"] });
      setIsEditingRate(false);
      toast({
        title: "Rates Updated",
        description: "Your provider rate has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update rates",
        variant: "destructive",
      });
    },
  });

  // Set default rate when analytics loads
  useEffect(() => {
    if (analytics && !form.watch("currentProviderRate")) {
      form.setValue("currentProviderRate", analytics.currentProviderRate.toString());
    }
  }, [analytics, form]);

  const onSubmit = (data: RateUpdateFormData) => {
    updateRatesMutation.mutate(data);
  };

  // CSV Export mutation
  const csvExportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/export/csv`);
      if (!response.ok) throw new Error('Failed to export CSV');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'transactions.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Export Complete",
        description: "Your transaction data has been downloaded.",
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "There was an error downloading your data.",
        variant: "destructive",
      });
    },
  });

  // PDF Export mutation
  const pdfExportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/export/pdf`);
      if (!response.ok) throw new Error('Failed to export PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'business_report.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Report Generated",
        description: "Your business report has been downloaded.",
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "There was an error generating your report.",
        variant: "destructive",
      });
    },
  });

  const downloadCSV = () => {
    csvExportMutation.mutate();
  };

  const downloadPDF = () => {
    pdfExportMutation.mutate();
  };

  const handleEditRate = () => {
    if (analytics) {
      form.setValue("currentProviderRate", analytics.currentProviderRate.toString());
      setIsEditingRate(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingRate(false);
    form.reset();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      case "processing":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (analyticsLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Gradient Background with Floating Orbs */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900">
        {/* Animated Gradient Orbs with Enhanced Glow */}
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
        
        {/* Additional Moving Glow Effects */}
        <div className="absolute top-0 left-1/2 w-72 h-72 bg-gradient-to-r from-teal-300 to-emerald-300 rounded-full mix-blend-screen filter blur-3xl opacity-30" style={{
          animation: 'float-slow 8s ease-in-out infinite, glow-pulse 3s ease-in-out infinite',
        }}></div>
        <div className="absolute bottom-0 right-1/3 w-80 h-80 bg-gradient-to-r from-green-300 to-lime-300 rounded-full mix-blend-screen filter blur-3xl opacity-25" style={{
          animation: 'float-reverse 10s ease-in-out infinite, glow-pulse 4s ease-in-out infinite 2s',
        }}></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-4 pt-24 pb-4 sm:pt-28 sm:pb-8">
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl text-white mb-2">Payment Dashboard</h1>
          <p className="text-sm sm:text-base text-white/70 minimal-text">Monitor your transactions and savings with our low-cost payment processing</p>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm text-white/90 minimal-text">Total Revenue</h3>
              <DollarSign className="h-4 w-4 text-white/70" />
            </div>
            <div className="text-2xl text-white">
              ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-white/60 minimal-text">
              From {analytics?.completedTransactions || 0} completed transactions
            </p>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm text-white/90 minimal-text">Total Transactions</h3>
              <CreditCard className="h-4 w-4 text-white/70" />
            </div>
            <div className="text-2xl text-white">{analytics?.totalTransactions || 0}</div>
            <p className="text-xs text-white/60 minimal-text">
              {analytics?.completedTransactions || 0} successful payments
            </p>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Money Saved</h3>
              <PiggyBank className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              ${analytics?.savings?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-white/60">
              vs your current provider
            </p>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Our Rate</h3>
              <TrendingUp className="h-4 w-4 text-teal-400" />
            </div>
            <div className="text-2xl font-bold text-teal-400">
              $0.20
            </div>
            <p className="text-xs text-white/60">
              Flat fee per transaction
            </p>
          </div>
        </div>



        {/* Transaction History */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl mb-8">
          <div className="flex flex-row items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Transaction History</h2>
              <p className="text-white/70 text-sm">
                View all your recent payment transactions
              </p>
            </div>
            <Link href="/transactions">
              <button className="backdrop-blur-xl bg-white/15 border border-white/30 text-white px-4 py-2 rounded-xl hover:bg-white/20 transition-all duration-300 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                View All
              </button>
            </Link>
          </div>
          {transactionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-white/70" />
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="backdrop-blur-lg bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/20">
                    <TableHead className="text-white/80">Date</TableHead>
                    <TableHead className="text-white/80">Item</TableHead>
                    <TableHead className="text-white/80">Amount</TableHead>
                    <TableHead className="text-white/80">Status</TableHead>
                    <TableHead className="text-white/80 hidden sm:table-cell">Transaction ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllTransactions ? transactions : transactions.slice(0, 3)).map((transaction: any) => (
                    <TableRow key={transaction.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-sm text-white/90">
                        {transaction.createdAt 
                          ? format(new Date(transaction.createdAt), "MMM dd, HH:mm")
                          : "N/A"
                        }
                      </TableCell>
                      <TableCell className="font-medium text-sm text-white">{transaction.itemName}</TableCell>
                      <TableCell className="text-sm text-white">${parseFloat(transaction.price).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(transaction.status)}
                          <span className="text-xs text-white/80 bg-white/10 px-2 py-1 rounded-lg border border-white/20">
                            {transaction.status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-white/60 hidden sm:table-cell">
                        {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {transactions.length > 3 && (
                <div className="flex justify-center mt-4 p-4">
                  <button
                    onClick={() => setShowAllTransactions(!showAllTransactions)}
                    className="backdrop-blur-xl bg-white/15 border border-white/30 text-white px-4 py-2 rounded-xl hover:bg-white/20 transition-all duration-300 text-sm"
                  >
                    {showAllTransactions ? "Show Less" : `Show More (${transactions.length - 3} more)`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCard className="mx-auto h-12 w-12 text-white/40 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No transactions yet</h3>
              <p className="text-white/60">Start processing payments to see your transaction history</p>
            </div>
          )}
        </div>

        {/* Export Data */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="flex items-center space-x-2 text-lg font-semibold text-white">
              <Download className="h-4 w-4" />
              <span>Export Data</span>
            </h2>
            <p className="text-white/70 text-sm">
              Download your transaction data and business reports
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl">
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
                <div>
                  <p className="font-medium text-sm text-white">Transaction Data</p>
                  <p className="text-xs text-white/60">CSV format for Excel</p>
                </div>
              </div>
              <button 
                onClick={() => downloadCSV()}
                disabled={csvExportMutation.isPending}
                className="backdrop-blur-xl bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl transition-all duration-300 disabled:opacity-50"
              >
                {csvExportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Download"
                )}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-teal-400" />
                <div>
                  <p className="font-medium text-sm text-white">Business Report</p>
                  <p className="text-xs text-white/60">PDF with analytics</p>
                </div>
              </div>
              <button 
                onClick={() => downloadPDF()}
                disabled={pdfExportMutation.isPending}
                className="backdrop-blur-xl bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl transition-all duration-300 disabled:opacity-50"
              >
                {pdfExportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Download"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}