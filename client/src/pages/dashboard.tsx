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
  X
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
  const merchantId = 1; // Using default merchant
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
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Dashboard</h1>
        <p className="text-gray-600">Monitor your transactions and savings with our low-cost payment processing</p>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
              {analytics?.ourRate?.toFixed(2) || "0.20"}%
            </div>
            <p className="text-xs text-muted-foreground">
              Fixed low rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rate Comparison */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calculator className="h-5 w-5" />
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
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Your Current Provider</p>
                {isEditingRate ? (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center space-x-2 mt-2">
                      <FormField
                        control={form.control}
                        name="currentProviderRate"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type="text"
                                  placeholder="2.9"
                                  className="pr-8 text-xl font-bold"
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
                    </form>
                  </Form>
                ) : (
                  <p className="text-2xl font-bold text-red-700">
                    {analytics?.currentProviderRate?.toFixed(2) || "2.90"}%
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-red-600">Total Cost</p>
                <p className="text-lg font-semibold text-red-700">
                  ${analytics?.currentProviderCost?.toFixed(2) || "0.00"}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-green-900">Our Rate</p>
                <p className="text-2xl font-bold text-green-700">
                  {analytics?.ourRate?.toFixed(2) || "0.20"}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-green-600">Total Cost</p>
                <p className="text-lg font-semibold text-green-700">
                  ${analytics?.ourCost?.toFixed(2) || "0.00"}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border-2 border-blue-200">
              <div>
                <p className="text-sm font-medium text-blue-900">Your Savings</p>
                <p className="text-2xl font-bold text-blue-700">
                  ${analytics?.savings?.toFixed(2) || "0.00"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-blue-600">Percentage Saved</p>
                <p className="text-lg font-semibold text-blue-700">
                  {analytics?.currentProviderRate && analytics?.ourRate 
                    ? ((analytics.currentProviderRate - analytics.ourRate) / analytics.currentProviderRate * 100).toFixed(1)
                    : "0"}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Transaction ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction: any) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      {transaction.createdAt 
                        ? format(new Date(transaction.createdAt), "MMM dd, yyyy HH:mm")
                        : "N/A"
                      }
                    </TableCell>
                    <TableCell className="font-medium">{transaction.itemName}</TableCell>
                    <TableCell>${parseFloat(transaction.price).toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(transaction.status)}
                        <Badge variant={getStatusBadgeVariant(transaction.status)}>
                          {transaction.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {transaction.windcaveTransactionId || `TXN-${transaction.id}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h3>
              <p className="text-gray-500">Start processing payments to see your transaction history</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}