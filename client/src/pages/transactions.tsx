import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentMerchantId } from "@/lib/auth";
import { 
  Home, Package, BarChart3, SlidersHorizontal, Terminal, 
  Download, Calendar, TrendingUp, DollarSign, CreditCard, ArrowUpDown,
  Share2, Receipt, RotateCcw, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface Transaction {
  id: number;
  price: string;
  status: string;
  itemName: string;
  paymentMethod: string;
  createdAt: string;
  refundableAmount?: string;
  totalRefunded?: string;
  windcaveTransactionId?: string;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1F1A5F] rounded-lg px-4 py-2 shadow-lg opacity-90">
        <p className="text-white text-sm font-medium">${payload[0].value.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

const CustomDot = (props: any) => {
  const { cx, cy } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="#6976EB" stroke="#fff" strokeWidth={2} />
    </g>
  );
};

export default function Transactions() {
  const [, setLocation] = useLocation();
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const { toast } = useToast();
  const merchantId = getCurrentMerchantId();

  if (!merchantId) {
    setLocation('/login');
    return null;
  }

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
    enabled: !!merchantId,
  });

  const refundMutation = useMutation({
    mutationFn: async ({ txId, amount, reason }: { txId: number; amount: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/transactions/${txId}/refunds`, {
        refundAmount: amount,
        refundReason: reason,
        refundMethod: "original_payment_method",
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Refund successful", description: data.message || "The refund has been processed." });
      setShowRefundForm(false);
      setRefundAmount("");
      setRefundReason("");
      if (data.transaction) {
        setSelectedTx((prev) => prev ? { ...prev, ...data.transaction } : null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
    },
    onError: (err: any) => {
      toast({ title: "Refund failed", description: err.message || "Could not process refund.", variant: "destructive" });
    },
  });

  const handleRefundSubmit = () => {
    if (!selectedTx) return;
    const amount = parseFloat(refundAmount);
    const maxRefundable = parseFloat(selectedTx.refundableAmount || selectedTx.price);
    if (!refundAmount || isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid refund amount.", variant: "destructive" });
      return;
    }
    if (amount > maxRefundable) {
      toast({ title: "Amount too high", description: `Maximum refundable amount is $${maxRefundable.toFixed(2)}.`, variant: "destructive" });
      return;
    }
    if (!refundReason.trim()) {
      toast({ title: "Reason required", description: "Please enter a reason for the refund.", variant: "destructive" });
      return;
    }
    refundMutation.mutate({ txId: selectedTx.id, amount: amount.toFixed(2), reason: refundReason.trim() });
  };

  const fetchPdfBlob = async (txId: number): Promise<Blob> => {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`/api/transactions/${txId}/receipt-pdf`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Failed to generate PDF");
    return response.blob();
  };

  const handleDownload = async (tx: Transaction) => {
    setIsActioning(true);
    try {
      const blob = await fetchPdfBlob(tx.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${tx.id}-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not generate receipt PDF.", variant: "destructive" });
    } finally {
      setIsActioning(false);
    }
  };

  const handleShare = async (tx: Transaction) => {
    setIsActioning(true);
    const merchantName = merchant?.businessName || merchant?.name || "Merchant";
    try {
      const blob = await fetchPdfBlob(tx.id);
      const file = new File([blob], `receipt-${tx.id}.pdf`, { type: "application/pdf" });
      const amount = `$${parseFloat(tx.price).toFixed(2)}`;
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: `Receipt from ${merchantName}`, text: `Payment receipt for ${amount}`, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: `Receipt from ${merchantName}`, text: `Payment receipt for ${amount}`, url: window.location.href });
      } else {
        await handleDownload(tx);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        toast({ title: "Share failed", description: "Could not share receipt.", variant: "destructive" });
      }
    } finally {
      setIsActioning(false);
    }
  };

  const filteredTransactions = transactions.filter((tx: Transaction) => {
    if (!dateRange.from && !dateRange.to) return true;
    const txDate = new Date(tx.createdAt);
    txDate.setHours(0, 0, 0, 0);
    if (dateRange.from) {
      const fromDate = new Date(dateRange.from);
      fromDate.setHours(0, 0, 0, 0);
      if (txDate < fromDate) return false;
    }
    if (dateRange.to) {
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      if (txDate > toDate) return false;
    }
    return true;
  });

  const totalRevenue = filteredTransactions
    .filter((tx: Transaction) => tx.status === 'completed')
    .reduce((sum: number, tx: Transaction) => sum + parseFloat(tx.price), 0);

  const totalTransactions = filteredTransactions.filter((tx: Transaction) => tx.status === 'completed').length;
  const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  const successRate = transactions.length > 0 
    ? (transactions.filter((tx: Transaction) => tx.status === 'completed').length / transactions.length) * 100 
    : 0;

  // Generate monthly data for chart (current year)
  const currentYear = new Date().getFullYear();
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = new Date(currentYear, i, 1).toLocaleString('default', { month: 'short' });
    const monthTransactions = transactions.filter((tx: Transaction) => {
      const txDate = new Date(tx.createdAt);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      return txMonth === i && txYear === currentYear && tx.status === 'completed';
    });
    const value = monthTransactions.reduce((sum: number, tx: Transaction) => 
      sum + parseFloat(tx.price), 0
    );
    return { month, value: parseFloat(value.toFixed(2)) };
  });

  const handleDownloadCSV = () => {
    const headers = ['ID', 'Date', 'Time', 'Item', 'Amount', 'Method', 'Status'];
    const rows = filteredTransactions.map((tx: Transaction) => {
      const date = new Date(tx.createdAt);
      return [
        tx.id,
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        tx.itemName,
        parseFloat(tx.price).toFixed(2),
        tx.paymentMethod,
        tx.status,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell: any) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast({ title: "CSV file downloaded successfully" });
  };

  const handleDownloadPDF = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/export/pdf`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `business-report-${new Date().toISOString().split('T')[0]}.pdf`;
        a.click();
        toast({ title: "Business report downloaded successfully" });
      } else {
        toast({ title: "Failed to download report", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Failed to download report", variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-[#00E5CC]';
      case 'pending': return 'text-yellow-500';
      case 'failed': return 'text-red-500';
      case 'refunded': return 'text-purple-500';
      case 'partially_refunded': return 'text-orange-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-[#00E5CC]/10';
      case 'pending': return 'bg-yellow-500/10';
      case 'failed': return 'bg-red-500/10';
      case 'refunded': return 'bg-purple-500/10';
      case 'partially_refunded': return 'bg-orange-500/10';
      default: return 'bg-gray-500/10';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'partially_refunded': return 'partial refund';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header Section */}
      <div className="relative">
        <div className="absolute left-0 right-0 h-[80px] sm:h-[106px] bg-[#00E5CC] rounded-b-[60px] sm:rounded-b-[100px] z-0" style={{ bottom: '-20px' }}></div>
        
        <div className="bg-[#0055FF] pt-6 sm:pt-8 pb-10 sm:pb-12 rounded-b-[60px] sm:rounded-b-[100px] relative z-10">
          <div className="max-w-4xl mx-auto px-3 sm:px-6">
            <h1 className="text-[#00E5CC] text-center text-xl sm:text-2xl md:text-3xl mb-6 sm:mb-8">analytics & reports</h1>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 max-w-full">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <DollarSign className="text-[#00E5CC] flex-shrink-0" size={12} />
                  <div className="text-[#00E5CC]/70 text-[9px] sm:text-[10px] md:text-xs truncate">Revenue</div>
                </div>
                <div className="text-white text-xs sm:text-sm md:text-base truncate" data-testid="stat-revenue">${totalRevenue.toFixed(2)}</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <CreditCard className="text-[#00E5CC] flex-shrink-0" size={12} />
                  <div className="text-[#00E5CC]/70 text-[9px] sm:text-[10px] md:text-xs truncate">Transactions</div>
                </div>
                <div className="text-white text-xs sm:text-sm md:text-base truncate" data-testid="stat-transactions">{totalTransactions}</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <TrendingUp className="text-[#00E5CC] flex-shrink-0" size={12} />
                  <div className="text-[#00E5CC]/70 text-[9px] sm:text-[10px] md:text-xs truncate">Avg. Sale</div>
                </div>
                <div className="text-white text-xs sm:text-sm md:text-base truncate" data-testid="stat-avg">${avgTransaction.toFixed(2)}</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <ArrowUpDown className="text-[#00E5CC] flex-shrink-0" size={12} />
                  <div className="text-[#00E5CC]/70 text-[9px] sm:text-[10px] md:text-xs truncate">Success Rate</div>
                </div>
                <div className="text-white text-xs sm:text-sm md:text-base truncate" data-testid="stat-success">{successRate.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 mt-[40px] sm:mt-[50px] relative z-10 space-y-4 sm:space-y-6">
        {/* Chart Section */}
        <div className="bg-white rounded-[15px] p-4 sm:p-8 shadow-[0px_23px_28.6px_rgba(0,0,0,0.03)]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mb-6 sm:mb-8">
            <h2 className="text-[#808080] text-base sm:text-lg">Revenue performance</h2>
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger className="w-full sm:w-[170px] border-b border-black/[0.11] rounded-none">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="profit">Profit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full h-[300px] sm:h-[350px] md:h-[400px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-[#3B3D53]">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6976EB" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6976EB" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" stroke="rgba(0, 0, 0, 0.06)" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="rgba(128, 128, 128, 0.69)"
                    tick={{ fill: 'rgba(128, 128, 128, 0.69)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="rgba(128, 128, 128, 0.69)"
                    tick={{ fill: 'rgba(128, 128, 128, 0.69)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => value.toString()}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#6976EB', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#6976EB" 
                    strokeWidth={3}
                    fill="url(#colorValue)"
                    dot={<CustomDot />}
                    activeDot={{ r: 8, fill: '#6976EB', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={800}
                    animationEasing="ease-in-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Reports Section */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-md">
          <h2 className="text-[#3B3D53] text-base sm:text-lg mb-4">Download Reports</h2>
          
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 justify-start border-[#0055FF]/30 text-left" data-testid="button-date-range">
                  <Calendar className="mr-2 h-4 w-4 text-[#0055FF] flex-shrink-0" />
                  <span className="truncate">
                    {dateRange.from ? (
                      dateRange.to ? (
                        `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
                      ) : (
                        dateRange.from.toLocaleDateString()
                      )
                    ) : (
                      'Select date range'
                    )}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                  onSelect={(range: any) => {
                    if (range?.from) {
                      setDateRange({ from: range.from, to: range.to });
                      if (range.to) {
                        setShowDatePicker(false);
                        toast({ title: `Date range: ${range.from.toLocaleDateString()} - ${range.to.toLocaleDateString()}` });
                      }
                    } else {
                      setDateRange({});
                    }
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {dateRange.from && (
              <Button 
                variant="outline" 
                onClick={() => setDateRange({})}
                className="border-[#0055FF]/30 text-[#0055FF]"
                data-testid="button-clear-date"
              >
                Clear
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button onClick={handleDownloadPDF} className="bg-[#0055FF] hover:bg-[#0044DD] text-white" data-testid="button-pdf">
              <Download className="mr-2 h-4 w-4" />
              Business Report (PDF)
            </Button>
            <Button onClick={handleDownloadCSV} className="bg-[#00E5CC] hover:bg-[#00D4BC] text-white" data-testid="button-csv">
              <Download className="mr-2 h-4 w-4" />
              Raw Data (CSV)
            </Button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-md">
          <h2 className="text-[#3B3D53] text-base sm:text-lg mb-4">Transaction History</h2>
          
          {isLoading ? (
            <div className="text-center py-12 text-[#3B3D53]">Loading transactions...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-[#3B3D53]">No transactions found</div>
          ) : (
            <div className="space-y-2 sm:space-y-3 max-h-96 overflow-y-auto">
              {filteredTransactions.map((tx: Transaction) => (
                <div
                  key={tx.id}
                  className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:border-[#0055FF]/50 hover:bg-blue-50/30 transition-colors cursor-pointer"
                  data-testid={`transaction-${tx.id}`}
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-[#3B3D53] text-sm sm:text-base truncate">{tx.itemName}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBg(tx.status)} ${getStatusColor(tx.status)}`}>
                          {getStatusLabel(tx.status)}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs sm:text-sm">
                        <div className="text-[#161A41]/70">
                          {new Date(tx.createdAt).toLocaleString()}
                        </div>
                        <div className="text-[#161A41]/70 capitalize">
                          {tx.paymentMethod.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="text-sm sm:text-base text-[#0055FF]">
                        ${parseFloat(tx.price).toFixed(2)}
                      </div>
                      <span className="text-[#00E5CC] text-xs">View receipt →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Receipt Modal */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => { if (!open) { setSelectedTx(null); setShowRefundForm(false); setRefundAmount(""); setRefundReason(""); } }}>
        <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#00E5CC]" />
              Transaction Receipt
            </DialogTitle>
          </DialogHeader>

          {selectedTx && (() => {
            const effectiveAmount = parseFloat(selectedTx.price);
            const gstAmount = (effectiveAmount * 0.15) / 1.15;
            const netAmount = effectiveAmount - gstAmount;
            const merchantName = merchant?.businessName || merchant?.name || "Merchant";

            return (
              <div className="space-y-4">
                {/* Transaction Details */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Transaction Details</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Transaction ID</span>
                    <span className="font-mono text-gray-800">#{selectedTx.id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Date</span>
                    <span className="text-gray-800">{new Date(selectedTx.createdAt).toLocaleString("en-NZ", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Payment Method</span>
                    <span className="text-gray-800 capitalize">{selectedTx.paymentMethod.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Status</span>
                    <span className={`font-medium ${getStatusColor(selectedTx.status)}`}>{getStatusLabel(selectedTx.status)}</span>
                  </div>
                </div>

                {/* Receipt Card */}
                <div className="border border-gray-200 rounded-lg p-4 text-gray-800">
                  <div className="text-center border-b border-gray-200 pb-3 mb-3">
                    <h3 className="font-semibold text-base">{merchantName}</h3>
                    {merchant?.businessAddress && (
                      <p className="text-xs text-gray-500 whitespace-pre-line mt-1">{merchant.businessAddress}</p>
                    )}
                    {merchant?.contactPhone && <p className="text-xs text-gray-500">{merchant.contactPhone}</p>}
                    {merchant?.contactEmail && <p className="text-xs text-gray-500">{merchant.contactEmail}</p>}
                    {merchant?.gstNumber && <p className="text-xs text-gray-500 mt-1 font-medium">GST No: {merchant.gstNumber}</p>}
                    {merchant?.nzbn && <p className="text-xs text-gray-500">NZBN: {merchant.nzbn}</p>}
                  </div>

                  <div className="space-y-1 mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Items</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{selectedTx.itemName}</span>
                      <span className="font-medium">${effectiveAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <Separator className="my-2" />

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cost Breakdown</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal (excl. GST)</span>
                      <span>${netAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">GST (15%)</span>
                      <span>${gstAmount.toFixed(2)}</span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex justify-between font-bold text-base">
                      <span>Total</span>
                      <span>${effectiveAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <p className="text-center text-xs text-gray-400 mt-3">Powered by TaptPay</p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Button
                    onClick={() => handleDownload(selectedTx)}
                    disabled={isActioning}
                    className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white"
                  >
                    {isActioning ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Working...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />Download Receipt PDF</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleShare(selectedTx)}
                    disabled={isActioning}
                    variant="outline"
                    className="w-full border-[#0055FF] text-[#0055FF] hover:bg-blue-50"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share Receipt
                  </Button>

                  {/* Refund button — only for completed / partially refunded transactions */}
                  {(selectedTx.status === "completed" || selectedTx.status === "partially_refunded") && (
                    parseFloat(selectedTx.refundableAmount || selectedTx.price) > 0
                  ) && (
                    <Button
                      variant="outline"
                      className="w-full border-red-400 text-red-500 hover:bg-red-50"
                      onClick={() => {
                        setShowRefundForm((v) => !v);
                        const max = parseFloat(selectedTx.refundableAmount || selectedTx.price);
                        setRefundAmount(max.toFixed(2));
                        setRefundReason("");
                      }}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      {showRefundForm ? "Cancel Refund" : "Issue Refund"}
                    </Button>
                  )}
                </div>

                {/* Inline refund form */}
                {showRefundForm && (selectedTx.status === "completed" || selectedTx.status === "partially_refunded") && (
                  <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <p className="text-sm font-medium text-red-700">Issue a Refund</p>
                    </div>
                    <p className="text-xs text-red-600">
                      Max refundable: <strong>${parseFloat(selectedTx.refundableAmount || selectedTx.price).toFixed(2)}</strong>
                      {selectedTx.totalRefunded && parseFloat(selectedTx.totalRefunded) > 0 && (
                        <> &nbsp;·&nbsp; Already refunded: <strong>${parseFloat(selectedTx.totalRefunded).toFixed(2)}</strong></>
                      )}
                    </p>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Refund Amount (NZD)</label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={parseFloat(selectedTx.refundableAmount || selectedTx.price)}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="border-red-200 focus:border-red-400"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Reason for Refund</label>
                      <Textarea
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        className="border-red-200 focus:border-red-400 text-sm"
                        placeholder="e.g. Customer requested refund, item out of stock..."
                        rows={2}
                      />
                    </div>
                    <Button
                      className="w-full bg-red-500 hover:bg-red-600 text-white"
                      onClick={handleRefundSubmit}
                      disabled={refundMutation.isPending}
                    >
                      {refundMutation.isPending ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Processing Refund...</>
                      ) : (
                        <><RotateCcw className="w-4 h-4 mr-2" />Confirm Refund ${parseFloat(refundAmount || "0").toFixed(2)}</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
