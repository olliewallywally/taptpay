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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

} from "lucide-react";
import { format } from "date-fns";
import { MobileHeader } from "@/components/mobile-header";


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
  
  // Track screen size for responsive chart settings
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
  const merchantId = getCurrentMerchantId();
  
  // Redirect to login if no merchantId
  if (!merchantId) {
    window.location.href = '/login';
    return <div>Redirecting to login...</div>;
  }
  const [isEditingRate, setIsEditingRate] = useState(false);


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

  // Get revenue over time data (30 days)
  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "revenue-over-time"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/revenue-over-time?days=30`);
      if (!response.ok) throw new Error("Failed to fetch revenue data");
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
      <div className="min-h-screen bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900">
        <div className="container mx-auto px-4 pt-32 pb-8">
          <div className="animate-pulse">
            <div className="h-8 backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl w-64 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileHeader title="Dashboard">
        <div className="min-h-screen bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900">
          <div className="container mx-auto px-4 pt-4 pb-8">
        {/* Analytics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <div className="dashboard-card-glass rounded-3xl p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Total Revenue</h3>
              <DollarSign className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-white/70">
              From {analytics?.completedTransactions || 0} completed transactions
            </p>
          </div>

          <div className="dashboard-card-glass rounded-3xl p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Total Transactions</h3>
              <CreditCard className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-white">{analytics?.totalTransactions || 0}</div>
            <p className="text-xs text-white/70">
              {analytics?.completedTransactions || 0} successful payments
            </p>
          </div>

          <div className="dashboard-card-glass rounded-3xl p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Money Saved</h3>
              <PiggyBank className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-green-400">
              ${analytics?.savings?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-white/70">
              vs your current provider
            </p>
          </div>

          <div className="dashboard-card-glass rounded-3xl p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Our Rate</h3>
              <TrendingUp className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-green-400">
              $0.25
            </div>
            <p className="text-xs text-white/70">
              Fixed fee per transaction
            </p>
          </div>
        </div>





        {/* Revenue Performance Graph */}
        <div className="dashboard-card-glass rounded-3xl p-4 md:p-8 mb-8">
          <div className="mb-4 md:mb-6">
            <h2 className="flex items-center space-x-2 text-base md:text-lg font-semibold text-white">
              <TrendingUp className="h-4 w-4 md:h-5 md:w-5" />
              <span>Revenue Performance</span>
            </h2>
            <p className="text-white/70 text-xs md:text-sm">
              Daily revenue over the last 30 days
            </p>
          </div>
          
          {revenueLoading ? (
            <div className="h-48 md:h-64 flex items-center justify-center">
              <div className="animate-pulse space-y-4 w-full">
                <div className="h-4 backdrop-blur-xl bg-white/10 border border-white/20 rounded w-48 md:w-64 mx-auto"></div>
                <div className="h-32 md:h-48 backdrop-blur-xl bg-white/10 border border-white/20 rounded"></div>
              </div>
            </div>
          ) : revenueData && revenueData.length > 0 ? (
            <div className="h-48 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={revenueData} 
                  margin={{ 
                    top: 5, 
                    right: isMobile ? 10 : 30, 
                    left: isMobile ? 5 : 20, 
                    bottom: 5 
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="rgba(255,255,255,0.7)"
                    fontSize={isMobile ? 10 : 12}
                    tick={{ fill: 'rgba(255,255,255,0.7)' }}
                    interval={isMobile ? 'preserveStartEnd' : 0}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return isMobile 
                        ? `${date.getMonth() + 1}/${date.getDate()}` 
                        : `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis 
                    stroke="rgba(255,255,255,0.7)"
                    fontSize={isMobile ? 10 : 12}
                    tick={{ fill: 'rgba(255,255,255,0.7)' }}
                    width={isMobile ? 40 : 60}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '12px',
                      backdropFilter: 'blur(12px)',
                      color: 'white',
                      fontSize: isMobile ? '12px' : '14px',
                      padding: isMobile ? '8px' : '12px'
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString();
                    }}
                    formatter={(value: number, name: string) => [
                      name === 'revenue' ? `$${value.toFixed(2)}` : value,
                      name === 'revenue' ? 'Revenue' : 'Transactions'
                    ]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#4ade80" 
                    strokeWidth={isMobile ? 2 : 3}
                    dot={{ 
                      fill: '#4ade80', 
                      strokeWidth: 2, 
                      r: isMobile ? 3 : 4 
                    }}
                    activeDot={{ 
                      r: isMobile ? 5 : 6, 
                      fill: '#22c55e' 
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 md:h-64 flex items-center justify-center">
              <div className="text-center px-4">
                <TrendingUp className="h-8 w-8 md:h-12 md:w-12 text-white/40 mx-auto mb-4" />
                <p className="text-white/70 text-sm md:text-base">No revenue data available yet</p>
                <p className="text-white/50 text-xs md:text-sm">Complete some transactions to see your revenue performance</p>
              </div>
            </div>
          )}
        </div>

        {/* Export Data */}
        <div className="dashboard-card-glass rounded-3xl p-8">
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
                <FileSpreadsheet className="h-8 w-8 text-green-400" />
                <div>
                  <p className="font-medium text-sm text-white">Transaction Data</p>
                  <p className="text-xs text-white/60">CSV format for Excel</p>
                </div>
              </div>
              <button 
                onClick={() => downloadCSV()}
                disabled={csvExportMutation.isPending}
                className="backdrop-blur-xl bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl transition-all duration-300 disabled:opacity-50"
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
                <FileText className="h-8 w-8 text-green-400" />
                <div>
                  <p className="font-medium text-sm text-white">Business Report</p>
                  <p className="text-xs text-white/60">PDF with analytics</p>
                </div>
              </div>
              <button 
                onClick={() => downloadPDF()}
                disabled={pdfExportMutation.isPending}
                className="backdrop-blur-xl bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl transition-all duration-300 disabled:opacity-50"
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
      </MobileHeader>
    );
  }

  // Desktop version
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900">
      <div className="container mx-auto px-4 pt-20 pb-8">
        {/* Analytics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <div className="dashboard-card-glass rounded-3xl p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Total Revenue</h3>
              <DollarSign className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-white/70">
              From {analytics?.completedTransactions || 0} completed transactions
            </p>
          </div>

          <div className="dashboard-card-glass rounded-3xl p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Total Transactions</h3>
              <CreditCard className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {analytics?.totalTransactions || 0}
            </div>
            <p className="text-xs text-white/70">
              {analytics?.completedTransactions || 0} completed, {analytics?.pendingTransactions || 0} pending
            </p>
          </div>

          <div className="dashboard-card-glass rounded-3xl p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Success Rate</h3>
              <TrendingUp className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {analytics?.successRate ? `${analytics.successRate.toFixed(1)}%` : "0%"}
            </div>
            <p className="text-xs text-white/70">
              Based on completed transactions
            </p>
          </div>

          <div className="dashboard-card-glass rounded-3xl p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-white/90">Avg. Transaction</h3>
              <PiggyBank className="h-4 w-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              ${analytics?.averageTransactionAmount?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-white/70">
              Average payment amount
            </p>
          </div>
        </div>

        {/* Savings Calculator */}
        <div className="dashboard-card-glass rounded-3xl p-8 mb-8">
          <div className="mb-6">
            <h2 className="flex items-center space-x-2 text-lg font-semibold text-white">
              <Calculator className="h-4 w-4" />
              <span>Savings Calculator</span>
            </h2>
            <p className="text-white/70 text-sm">
              Compare your current payment provider rates with Tapt's pricing
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-white mb-3">Current Provider</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl">
                      <span className="text-sm text-white/70">Processing Rate</span>
                      <div className="flex items-center space-x-2">
                        {isEditingRate ? (
                          <div className="flex items-center space-x-2">
                            <FormField
                              control={form.control}
                              name="currentProviderRate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      className="w-20 h-8 text-xs bg-white/20 border-white/30 text-white"
                                      placeholder="2.9"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <span className="text-xs text-white/70">%</span>
                            <Button type="submit" size="sm" className="h-6 w-6 p-0">
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-white">
                              {analytics?.currentProviderRate ? `${(analytics.currentProviderRate * 100).toFixed(2)}%` : "2.90%"}
                            </span>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-6 p-0"
                              onClick={handleEditRate}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl">
                      <span className="text-sm text-white/70">Monthly Cost</span>
                      <span className="text-sm text-white">
                        ${analytics?.currentProviderMonthlyCost?.toFixed(2) || "0.00"}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-white mb-3">Tapt Pricing</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 backdrop-blur-lg bg-green-500/20 border border-green-400/30 rounded-2xl">
                      <span className="text-sm text-green-200">Processing Rate</span>
                      <span className="text-sm text-green-200 font-medium">0.50%</span>
                    </div>
                    <div className="flex items-center justify-between p-4 backdrop-blur-lg bg-green-500/20 border border-green-400/30 rounded-2xl">
                      <span className="text-sm text-green-200">Monthly Cost</span>
                      <span className="text-sm text-green-200 font-medium">
                        ${analytics?.taptMonthlyCost?.toFixed(2) || "0.00"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {analytics?.monthlySavings && analytics.monthlySavings > 0 && (
                <div className="p-6 backdrop-blur-lg bg-green-500/20 border border-green-400/30 rounded-2xl">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-green-200 mb-2">
                      You could save ${analytics.monthlySavings.toFixed(2)} per month!
                    </h3>
                    <p className="text-sm text-green-300">
                      That's ${(analytics.monthlySavings * 12).toFixed(2)} in annual savings with Tapt's 0.50% processing rate.
                    </p>
                  </div>
                </div>
              )}
            </form>
          </Form>
        </div>

        {/* Recent Transactions */}
        <div className="dashboard-card-glass rounded-3xl p-8 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <h2 className="text-lg font-semibold text-white mb-2 sm:mb-0">Recent Transactions</h2>
            <Button 
              variant="outline" 
              className="border-white/20 text-white hover:bg-white/10"
              onClick={() => window.location.href = '/transactions'}
            >
              View All
            </Button>
          </div>
          
          {transactions && transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.slice(0, 5).map((transaction: any) => (
                <div 
                  key={transaction.id} 
                  className="flex items-center justify-between p-4 backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(transaction.status)}
                    <div>
                      <p className="text-sm font-medium text-white">{transaction.itemName}</p>
                      <p className="text-xs text-white/60">
                        {format(new Date(transaction.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">${transaction.price}</p>
                    <Badge variant={getStatusBadgeVariant(transaction.status)} className="text-xs">
                      {transaction.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-white/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No transactions yet</h3>
              <p className="text-white/60 text-sm">Start accepting payments to see your transaction history here.</p>
            </div>
          )}
        </div>

        {/* Revenue Chart */}
        <div className="dashboard-card-glass rounded-3xl p-8 mb-8">
          <h2 className="text-lg font-semibold text-white mb-6">Revenue Overview (Last 30 Days)</h2>
          {revenueData && revenueData.length > 0 ? (
            <div className="h-48 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="rgba(255,255,255,0.7)"
                    fontSize={isMobile ? 10 : 12}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return isMobile ? format(date, "M/d") : format(date, "MMM d");
                    }}
                  />
                  <YAxis 
                    stroke="rgba(255,255,255,0.7)"
                    fontSize={isMobile ? 10 : 12}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0,0,0,0.8)', 
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    labelFormatter={(value) => format(new Date(value), "MMM d, yyyy")}
                    formatter={(value: any) => [`$${value}`, "Revenue"]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#00FF66" 
                    strokeWidth={2}
                    dot={{ fill: '#00FF66', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, stroke: '#00FF66', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 md:h-64 flex items-center justify-center">
              <div className="text-center px-4">
                <TrendingUp className="h-8 w-8 md:h-12 md:w-12 text-white/40 mx-auto mb-4" />
                <p className="text-white/70 text-sm md:text-base">No revenue data available yet</p>
                <p className="text-white/50 text-xs md:text-sm">Complete some transactions to see your revenue performance</p>
              </div>
            </div>
          )}
        </div>

        {/* Export Data */}
        <div className="dashboard-card-glass rounded-3xl p-8">
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
                <FileSpreadsheet className="h-8 w-8 text-green-400" />
                <div>
                  <p className="font-medium text-sm text-white">Transaction Data</p>
                  <p className="text-xs text-white/60">CSV format for Excel</p>
                </div>
              </div>
              <button 
                onClick={() => downloadCSV()}
                disabled={csvExportMutation.isPending}
                className="backdrop-blur-xl bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl transition-all duration-300 disabled:opacity-50"
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
                <FileText className="h-8 w-8 text-green-400" />
                <div>
                  <p className="font-medium text-sm text-white">Business Report</p>
                  <p className="text-xs text-white/60">PDF with analytics</p>
                </div>
              </div>
              <button 
                onClick={() => downloadPDF()}
                disabled={pdfExportMutation.isPending}
                className="backdrop-blur-xl bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl transition-all duration-300 disabled:opacity-50"
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