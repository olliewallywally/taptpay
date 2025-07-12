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
import { Send, Loader2, CheckCircle, Clock, XCircle, Eye } from "lucide-react";
import { Link } from "wouter";

const transactionFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Please enter a valid price (e.g., 4.50)"),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

export default function MerchantTerminal() {
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
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
              <Clock className="w-6 h-6 text-white/70" />
              <span className="text-lg font-medium text-white">Awaiting Payment</span>
            </div>
            <p className="text-sm text-white/60 text-center">Customer can now scan QR code to pay</p>
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
      <div className="relative z-10 max-w-4xl mx-auto px-3 sm:px-4 pt-24 pb-4 sm:pt-28 sm:pb-8">
        <div className="mb-8 sm:mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Payment Terminal</h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 sm:gap-8">
          
          {/* Transaction Entry Card */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
            <div className="mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">New Transaction</h2>
              <p className="text-sm sm:text-base text-white/70">Enter item details to generate customer payment link</p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                <FormField
                  control={form.control}
                  name="itemName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-white">Item Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Cappuccino"
                          className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all text-lg text-white placeholder:text-white/50 backdrop-blur-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-white">Price</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/70 text-lg font-medium">$</span>
                          <Input
                            type="text"
                            placeholder="0.00"
                            className="pl-8 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all text-lg text-white placeholder:text-white/50 backdrop-blur-sm"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit"
                  disabled={createTransactionMutation.isPending}
                  className="w-full bg-white/20 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-white/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm border border-white/30"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {createTransactionMutation.isPending ? "Creating..." : "Send to Customer"}
                </Button>
              </form>
            </Form>
          </div>

          {/* Payment Status Indicator - Prominent Position */}
          {currentTransaction ? (
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
              <div className="text-center mb-4">
                <h3 className="text-xl font-bold text-white mb-1">
                  Transaction #{currentTransaction.id}
                </h3>
                <p className="text-sm text-white/70">
                  {currentTransaction.itemName} - ${currentTransaction.price}
                </p>
              </div>
              {getPaymentStatusIndicator(currentTransaction.status)}
            </div>
          ) : null}

          {/* QR Code Section - ALWAYS VISIBLE (static per merchant) */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl">
            <QRCodeDisplay 
              paymentUrl={merchant?.paymentUrl}
              qrCodeUrl={merchant?.qrCodeUrl}
              merchantId={merchantId}
            />
            {!currentTransaction && (
              <div className="mt-6 text-center p-4 bg-emerald-500/20 backdrop-blur-sm rounded-2xl border border-emerald-400/30">
                <p className="text-sm text-emerald-200 font-medium">
                  🏪 Static QR Code - Ready for Print
                </p>
                <p className="text-xs text-emerald-300 mt-1">
                  This QR code never changes. Print it and display in your shop!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Merchant URL Display - Always show for reference */}
      {merchant && (
        <div className="max-w-4xl mx-auto px-3 sm:px-4 mt-8">
          <MerchantUrlDisplay
            merchantId={merchantId}
            paymentUrl={merchant.paymentUrl}
            qrCodeUrl={merchant.qrCodeUrl}
            businessName={merchant.businessName || merchant.name}
          />
        </div>
      )}

      {/* Transactions Button - Bottom of page */}
      <div className="relative z-10 max-w-4xl mx-auto px-3 sm:px-4 mt-8 mb-8">
        <div className="flex justify-center">
          <Link href="/transactions">
            <button className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-2xl hover:bg-white/15 transition-all duration-300 backdrop-blur-sm">
              <Eye className="h-5 w-5" />
              View All Transactions
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
