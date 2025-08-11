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

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "analytics"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/analytics`);
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  if (analyticsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900">
        {isMobile && <MobileHeader title="Dashboard" />}
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
      {isMobile && <MobileHeader title="Dashboard" />}
      <div className="container mx-auto px-4 pt-20 pb-8">
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
      </div>
    </div>
  );
}