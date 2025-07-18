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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900">
      <div className="container mx-auto px-4 pt-32 pb-8">
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
              3.4%
            </div>
            <p className="text-xs text-white/70">
              Total processing fee
            </p>
          </div>
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