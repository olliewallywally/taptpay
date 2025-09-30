import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { AnimatedBrandBackground } from "@/components/backgrounds/AnimatedBrandBackground";
import { 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  PiggyBank, 
  Loader2,
  Download,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const merchantId = getCurrentMerchantId();
  
  if (!merchantId) {
    window.location.href = '/login';
    return <div>Redirecting to login...</div>;
  }

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "analytics"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/analytics`);
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  const { data: revenueData } = useQuery({
    queryKey: ["/api/merchants", merchantId, "revenue-over-time"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/revenue-over-time?days=30`);
      if (!response.ok) throw new Error("Failed to fetch revenue data");
      return response.json();
    },
  });

  const csvExportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/export/csv`);
      if (!response.ok) throw new Error("Failed to export CSV");
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Export successful",
        description: "Transaction data has been downloaded as CSV.",
      });
    },
    onError: () => {
      toast({
        title: "Export failed",
        description: "Failed to export transaction data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const pdfExportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/export/pdf`);
      if (!response.ok) throw new Error("Failed to export PDF");
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `business-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Report generated",
        description: "Business report has been downloaded as PDF.",
      });
    },
    onError: () => {
      toast({
        title: "Export failed",
        description: "Failed to generate business report. Please try again.",
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

  if (analyticsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900">
        <div className="container mx-auto px-4 py-8">
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

  return (
    <AnimatedBrandBackground
      backgroundColor="#0000FF"
      circleColor="#00D4D4"
      largeCirclePosition="top-[-120px] right-[-120px]"
      smallCirclePosition="top-[200px] right-[250px]"
      extraLargeCirclePosition="bottom-[-120px] right-[-120px]"
      extraSmallCirclePosition="bottom-[200px] right-[250px]"
    >
      <div className="container mx-auto px-4 py-8">
          {/* Analytics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
            <div className="dashboard-card-glass rounded-3xl p-6">
              <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <h3 className="text-sm font-medium text-white/90">Total Revenue</h3>
                <DollarSign className="h-4 w-4 text-[#00FF66] drop-shadow-[0_0_8px_#00FF66]" />
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
                <CreditCard className="h-4 w-4 text-[#00FF66] drop-shadow-[0_0_8px_#00FF66]" />
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
                <h3 className="text-sm font-medium text-white/90">This Week's Transactions</h3>
                <TrendingUp className="h-4 w-4 text-[#00FF66] drop-shadow-[0_0_8px_#00FF66]" />
              </div>
              <div className="text-2xl font-bold text-white">
                {analytics?.weeklyTransactions || 0}
              </div>
              <p className="text-xs text-white/70">
                Transactions in the last 7 days
              </p>
            </div>

            <div className="dashboard-card-glass rounded-3xl p-6">
              <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <h3 className="text-sm font-medium text-white/90">This Week's Revenue</h3>
                <PiggyBank className="h-4 w-4 text-[#00FF66] drop-shadow-[0_0_8px_#00FF66]" />
              </div>
              <div className="text-2xl font-bold text-white">
                ${analytics?.weeklyRevenue?.toFixed(2) || "0.00"}
              </div>
              <p className="text-xs text-white/70">
                Revenue in the last 7 days
              </p>
            </div>
          </div>

          {/* Revenue Chart */}
          <div className="dashboard-card-glass rounded-3xl p-6 md:p-8 mb-8">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white mb-1">Revenue Performance</h3>
              <p className="text-sm text-white/70">Last 30 days revenue trend</p>
            </div>
            
            {revenueData && revenueData.length > 0 ? (
              <div className="h-64 md:h-80 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00FF66" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#00FF66" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" />
                    <XAxis 
                      dataKey="date" 
                      stroke="rgba(255,255,255,0.8)"
                      fontSize={isMobile ? 11 : 13}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return isMobile ? format(date, "M/d") : format(date, "MMM d");
                      }}
                      tick={{ fill: 'rgba(255,255,255,0.8)' }}
                    />
                    <YAxis 
                      stroke="rgba(255,255,255,0.8)"
                      fontSize={isMobile ? 11 : 13}
                      tickFormatter={(value) => `$${value}`}
                      tick={{ fill: 'rgba(255,255,255,0.8)' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(0,0,0,0.9)', 
                        border: '1px solid rgba(0,255,102,0.3)',
                        borderRadius: '12px',
                        fontSize: '13px',
                        padding: '12px'
                      }}
                      labelFormatter={(value) => format(new Date(value), "MMM d, yyyy")}
                      formatter={(value: any) => [`$${value}`, "Revenue"]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#00FF66" 
                      strokeWidth={3}
                      fill="url(#revenueGradient)"
                      dot={{ fill: '#00FF66', strokeWidth: 2, r: 4, stroke: '#001a0d' }}
                      activeDot={{ r: 6, stroke: '#00FF66', strokeWidth: 3, fill: '#001a0d' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 md:h-80 flex items-center justify-center">
                <div className="text-center px-4">
                  <TrendingUp className="h-12 w-12 md:h-16 md:w-16 text-[#00FF66] drop-shadow-[0_0_16px_#00FF66] mx-auto mb-4" />
                  <p className="text-white/80 text-base md:text-lg font-medium mb-2">No revenue data available yet</p>
                  <p className="text-white/60 text-sm md:text-base">Complete some transactions to see your revenue performance</p>
                </div>
              </div>
            )}
          </div>

          {/* Transaction Milestone Progress */}
          <div className="mb-6 sm:mb-8">
            <div className="dashboard-card-glass rounded-3xl p-4 sm:p-6">
              <div className="flex flex-col space-y-3 sm:space-y-4">
                {/* Mobile: Stacked layout, Desktop: Side by side */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-white">Transaction Milestone</h3>
                    <p className="text-xs sm:text-sm text-white/70 hidden sm:block">Progress toward 200,000 transactions - Gift awaits!</p>
                    <p className="text-xs text-white/70 sm:hidden">Target: 200K 🎁</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-xl sm:text-2xl font-bold text-[#00FF66]">
                      {analytics?.totalTransactions?.toLocaleString() || "0"}
                    </div>
                    <div className="text-xs sm:text-sm text-white/70">
                      / 200,000
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs sm:text-sm text-white/70">
                    <span>Progress</span>
                    <span>{((analytics?.totalTransactions || 0) / 200000 * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-800/80 rounded-full h-5 sm:h-6 relative overflow-hidden border border-gray-600/50">
                    <div 
                      className="h-full bg-gradient-to-r from-[#00FF66] to-[#00DD55] rounded-full transition-all duration-2000 ease-out relative shadow-[0_0_12px_#00FF66]"
                      style={{ 
                        width: `${Math.max(2, Math.min((analytics?.totalTransactions || 0) / 200000 * 100, 100))}%`,
                        minWidth: analytics?.totalTransactions > 0 ? '8px' : '0px'
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#00DD55] to-[#00FF66] opacity-80"></div>
                    </div>
                    {/* Gift Icon at the end */}
                    <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
                      <div className="w-4 h-4 sm:w-5 sm:h-5 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] sm:text-xs shadow-lg">
                        🎁
                      </div>
                    </div>
                  </div>
                  
                  {/* Milestone markers - simplified on mobile */}
                  <div className="flex justify-between text-[10px] sm:text-xs text-white/50 mt-1">
                    <span>0</span>
                    <span className="hidden sm:inline">50K</span>
                    <span className="sm:hidden">100K</span>
                    <span className="hidden sm:inline">100K</span>
                    <span className="hidden sm:inline">150K</span>
                    <span className="text-yellow-400 font-semibold">200K 🎁</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Export Data */}
          <div className="dashboard-card-glass rounded-3xl p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <FileSpreadsheet className="h-8 w-8 text-[#00FF66] drop-shadow-[0_0_12px_#00FF66]" />
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
                  <FileText className="h-8 w-8 text-[#00FF66] drop-shadow-[0_0_12px_#00FF66]" />
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
    </AnimatedBrandBackground>
  );
}