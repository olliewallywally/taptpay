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
  FileSpreadsheet
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
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Payment Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-600">Monitor your transactions and savings with our low-cost payment processing</p>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              From {analytics?.completedTransactions || 0} completed transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalTransactions || 0}</div>
            <p className="text-xs text-muted-foreground">
              {analytics?.completedTransactions || 0} successful payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Money Saved</CardTitle>
            <PiggyBank className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${analytics?.savings?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              vs your current provider
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Our Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-[hsl(155,40%,25%)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(155,40%,25%)]">
              $0.20
            </div>
            <p className="text-xs text-muted-foreground">
              Flat fee per transaction
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rate Comparison */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center space-x-2">
              <Calculator className="h-4 w-4" />
              <span>Rate Comparison</span>
            </div>
            {!isEditingRate && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditRate}
                className="flex items-center space-x-2"
              >
                <Edit2 className="h-4 w-4" />
                <span>Edit Rate</span>
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            See how much you save with our low-cost payment processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Desktop Layout */}
          <div className="hidden md:grid md:grid-cols-3 gap-4">
            {/* Current Provider */}
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="text-center">
                <p className="text-sm font-medium text-red-900 mb-2">Your Current Provider</p>
                {isEditingRate ? (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
                      <FormField
                        control={form.control}
                        name="currentProviderRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type="text"
                                  placeholder="2.9"
                                  className="pr-8 text-xl font-bold text-center"
                                  autoFocus
                                  {...field}
                                />
                                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-center space-x-1">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={updateRatesMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {updateRatesMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </form>
                  </Form>
                ) : (
                  <p className="text-2xl font-bold text-red-700 mb-2">
                    {analytics?.currentProviderRate?.toFixed(2) || "2.90"}%
                  </p>
                )}
                <div className="border-t border-red-200 pt-2">
                  <p className="text-xs text-red-600">Total Cost</p>
                  <p className="text-lg font-semibold text-red-700">
                    ${analytics?.currentProviderCost?.toFixed(2) || "0.00"}
                  </p>
                </div>
              </div>
            </div>

            {/* Our Rate */}
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-center">
                <p className="text-sm font-medium text-green-900 mb-2">Our Rate</p>
                <p className="text-2xl font-bold text-green-700 mb-2">
                  $0.20
                </p>
                <p className="text-xs text-green-600 mb-2">flat fee</p>
                <div className="border-t border-green-200 pt-2">
                  <p className="text-xs text-green-600">Total Cost</p>
                  <p className="text-lg font-semibold text-green-700">
                    ${analytics?.ourCost?.toFixed(2) || "0.00"}
                  </p>
                </div>
              </div>
            </div>

            {/* Savings */}
            <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-300">
              <div className="text-center">
                <p className="text-sm font-medium text-blue-900 mb-2">Your Savings</p>
                <p className="text-2xl font-bold text-blue-700 mb-2">
                  ${analytics?.savings?.toFixed(2) || "0.00"}
                </p>
                <div className="border-t border-blue-200 pt-2">
                  <p className="text-xs text-blue-600">Total Amount Saved</p>
                  <p className="text-lg font-semibold text-blue-700">
                    ${analytics?.savings?.toFixed(2) || "0.00"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="grid grid-cols-3 gap-2 md:hidden">
            {/* Previous */}
            <div className="p-2 bg-red-50 rounded border border-red-200">
              <div className="text-center">
                <p className="text-xs font-medium text-red-900 mb-1">Previous</p>
                {isEditingRate ? (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1">
                      <FormField
                        control={form.control}
                        name="currentProviderRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="text"
                                placeholder="2.9"
                                className="text-sm font-bold text-center h-6 px-1"
                                autoFocus
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-center space-x-1">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={updateRatesMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white h-6 w-6 p-0"
                        >
                          {updateRatesMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </form>
                  </Form>
                ) : (
                  <p className="text-lg font-bold text-red-700">
                    {analytics?.currentProviderRate?.toFixed(1) || "2.9"}%
                  </p>
                )}
              </div>
            </div>

            {/* Current */}
            <div className="p-2 bg-green-50 rounded border border-green-200">
              <div className="text-center">
                <p className="text-xs font-medium text-green-900 mb-1">Current</p>
                <p className="text-lg font-bold text-green-700">
                  0.2%
                </p>
              </div>
            </div>

            {/* Savings */}
            <div className="p-2 bg-blue-50 rounded border-2 border-blue-300">
              <div className="text-center">
                <p className="text-xs font-medium text-blue-900 mb-1">Savings</p>
                <p className="text-lg font-bold text-blue-700">
                  ${analytics?.savings?.toFixed(2) || "0.00"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
          <CardDescription>
            View all your recent payment transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Transaction ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllTransactions ? transactions : transactions.slice(0, 3)).map((transaction: any) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="text-sm">
                        {transaction.createdAt 
                          ? format(new Date(transaction.createdAt), "MMM dd, HH:mm")
                          : "N/A"
                        }
                      </TableCell>
                      <TableCell className="font-medium text-sm">{transaction.itemName}</TableCell>
                      <TableCell className="text-sm">${parseFloat(transaction.price).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(transaction.status)}
                          <Badge variant={getStatusBadgeVariant(transaction.status)} className="text-xs">
                            {transaction.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 hidden sm:table-cell">
                        {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {transactions.length > 3 && (
                <div className="flex justify-center mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowAllTransactions(!showAllTransactions)}
                    className="text-sm"
                  >
                    {showAllTransactions ? "Show Less" : `Show More (${transactions.length - 3} more)`}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h3>
              <p className="text-gray-500">Start processing payments to see your transaction history</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Download className="h-4 w-4" />
            <span>Export Data</span>
          </CardTitle>
          <CardDescription>
            Download your transaction data and business reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-medium text-sm">Transaction Data</p>
                  <p className="text-xs text-gray-500">CSV format for Excel</p>
                </div>
              </div>
              <Button 
                size="sm" 
                onClick={() => downloadCSV()}
                disabled={csvExportMutation.isPending}
              >
                {csvExportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Download"
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="font-medium text-sm">Business Report</p>
                  <p className="text-xs text-gray-500">PDF with analytics</p>
                </div>
              </div>
              <Button 
                size="sm" 
                onClick={() => downloadPDF()}
                disabled={pdfExportMutation.isPending}
              >
                {pdfExportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Download"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}