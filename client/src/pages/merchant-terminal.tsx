import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QRCodeDisplay } from "@/components/qr-code-display";
import { MerchantUrlDisplay } from "@/components/merchant-url-display";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { Send, Loader2, CheckCircle, Clock, XCircle, Eye, Copy, Check } from "lucide-react";
import { Link } from "wouter";

const transactionFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Please enter a valid price (e.g., 4.50)"),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

export default function MerchantTerminal() {
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const merchantId = getCurrentMerchantId();

  // Redirect to login if no merchantId
  if (!merchantId) {
    window.location.href = '/login';
    return <div>Redirecting to login...</div>;
  }

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      itemName: "",
      price: "",
    },
  });

  // Get merchant data
  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}`);
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
  });

  // Get active transaction
  const { data: activeTransaction } = useQuery({
    queryKey: ["/api/merchants", merchantId, "active-transaction"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/active-transaction`);
      if (!response.ok) throw new Error("Failed to fetch active transaction");
      return response.json();
    },
  });

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
      const response = await apiRequest("POST", "/api/transactions", {
        merchantId,
        itemName: data.itemName,
        price: data.price,
        status: "pending",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
      form.reset();
      toast({
        title: "Transaction Created",
        description: "Customer can now proceed with payment",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create transaction",
        variant: "destructive",
      });
    },
  });

  // Set up SSE connection
  useEffect(() => {
    sseClient.connect(merchantId);
    
    sseClient.subscribe("transaction_updated", (message) => {
      setCurrentTransaction(message.transaction);
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
    });

    return () => {
      sseClient.disconnect();
    };
  }, [merchantId, queryClient]);

  // Update current transaction from active transaction query
  useEffect(() => {
    if (activeTransaction) {
      setCurrentTransaction(activeTransaction);
    }
  }, [activeTransaction]);

  const onSubmit = (data: TransactionFormData) => {
    createTransactionMutation.mutate(data);
  };

  const getPaymentStatusIndicator = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <div className="flex flex-col items-center space-y-3 p-6 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20">
            <div className="flex items-center space-x-3">
              <Clock className="w-6 h-6 text-gray-600" />
              <span className="text-lg font-medium text-black">Awaiting Payment</span>
            </div>
            <p className="text-sm text-gray-700 text-center">Customer can now scan QR code to pay</p>
          </div>
        );
      case "processing":
        return (
          <div className="flex flex-col items-center space-y-3 p-6 bg-orange-500/20 backdrop-blur-sm rounded-2xl border border-orange-400/30">
            <div className="flex items-center space-x-3">
              <Loader2 className="w-7 h-7 text-orange-300 animate-spin" />
              <span className="text-lg font-medium text-orange-200">Processing Payment</span>
            </div>
            <p className="text-sm text-orange-300 text-center">Payment is being processed...</p>
          </div>
        );
      case "completed":
        return (
          <div className="flex flex-col items-center space-y-3 p-6 bg-green-500/20 backdrop-blur-sm rounded-2xl border border-green-400/30">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-7 h-7 text-green-300" />
              <span className="text-lg font-medium text-green-200">Payment Accepted</span>
            </div>
            <p className="text-sm text-green-300 text-center">Transaction completed successfully!</p>
          </div>
        );
      case "failed":
        return (
          <div className="flex flex-col items-center space-y-3 p-6 bg-red-500/20 backdrop-blur-sm rounded-2xl border border-red-400/30">
            <div className="flex items-center space-x-3">
              <XCircle className="w-7 h-7 text-red-300" />
              <span className="text-lg font-medium text-red-200">Payment Failed</span>
            </div>
            <p className="text-sm text-red-300 text-center">Please try again or contact support</p>
          </div>
        );
      default:
        return null;
    }
  };


  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Dynamic Moving Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-800">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-purple-900/20 via-transparent to-blue-900/20 animate-gradient-x"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-l from-gray-800/30 via-transparent to-gray-700/30 animate-gradient-y"></div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-3 sm:px-4 pt-28 pb-4 sm:pb-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">Payment Terminal</h1>
        </div>

        {/* Top Row: Transaction Entry + QR Code */}
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          
          {/* Transaction Entry Card */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:bg-white/15 hover:border-white/30 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-white mb-2">New Transaction</h2>
              <p className="text-sm text-white/70">Enter item details</p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="itemName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-white">Item Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Coffee, Lunch, etc."
                          {...field}
                          className="backdrop-blur-sm bg-white/5 border-white/10 text-white placeholder:text-white/50 focus:bg-white/10 focus:border-white/20"
                        />
                      </FormControl>
                      <FormMessage className="text-red-300" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-white">Price ($)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="4.50"
                          {...field}
                          className="backdrop-blur-sm bg-white/5 border-white/10 text-white placeholder:text-white/50 focus:bg-white/10 focus:border-white/20"
                        />
                      </FormControl>
                      <FormMessage className="text-red-300" />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={createTransactionMutation.isPending}
                  className="w-full backdrop-blur-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 py-3 rounded-xl font-medium transition-all duration-300"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {createTransactionMutation.isPending ? "Creating..." : "Send to Customer"}
                </Button>
              </form>
            </Form>
          </div>

          {/* QR Code Section */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:bg-white/15 hover:border-white/30 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-white mb-2">QR Code</h2>
              <p className="text-sm text-white/70">Static payment code</p>
            </div>
            
            <div className="text-center">
              <QRCodeDisplay 
                paymentUrl={merchant?.paymentUrl}
                qrCodeUrl={merchant?.qrCodeUrl}
                merchantId={merchantId}
              />
            </div>
          </div>
        </div>

        {/* Payment Status Row */}
        {currentTransaction && (
          <div className="mb-6">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:bg-white/15 hover:border-white/30 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold text-white mb-1">
                  Transaction #{currentTransaction.id}
                </h3>
                <p className="text-sm text-white/70">
                  {currentTransaction.itemName} - ${currentTransaction.price}
                </p>
              </div>
              {getPaymentStatusIndicator(currentTransaction.status)}
            </div>
          </div>
        )}

        {/* Bottom Row: Payment Link + Customer Page */}
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          {/* Payment Link Section */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:bg-white/15 hover:border-white/30 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-white mb-2">Payment Link</h2>
              <p className="text-sm text-white/70">Share this link with customers</p>
            </div>
            
            {merchant?.paymentUrl && (
              <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90 truncate font-mono">
                    {merchant.paymentUrl}
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(merchant.paymentUrl);
                      setCopiedLink(true);
                      toast({
                        title: "Copied!",
                        description: "Payment link copied to clipboard",
                      });
                      setTimeout(() => setCopiedLink(false), 2000);
                    } catch (err) {
                      toast({
                        title: "Failed to copy",
                        description: "Please copy the link manually",
                        variant: "destructive",
                      });
                    }
                  }}
                  size="sm"
                  className="backdrop-blur-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 shrink-0 px-3 py-2"
                >
                  {copiedLink ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Customer Payment Page Button */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:bg-white/15 hover:border-white/30 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-center h-full">
              {merchant?.paymentUrl && (
                <Link href={`/pay/${merchantId}`}>
                  <Button className="backdrop-blur-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 px-6 py-3 rounded-xl font-medium transition-all duration-300">
                    <Eye className="mr-2 h-4 w-4" />
                    View Customer Payment Page
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Transactions Button - Bottom of page */}
        <div className="mt-8 mb-8">
          <div className="flex justify-center">
            <Link href="/transactions">
              <button className="flex items-center gap-2 px-6 py-3 backdrop-blur-sm bg-white/10 border border-white/20 text-white rounded-2xl hover:bg-white/15 transition-all duration-300">
                <Eye className="h-5 w-5" />
                View All Transactions
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
