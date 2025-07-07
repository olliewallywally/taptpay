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
import { Send } from "lucide-react";

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

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <div className="flex items-center justify-center space-x-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-yellow-700">Waiting for customer</span>
          </div>
        );
      case "processing":
        return (
          <div className="flex items-center justify-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-blue-700">Processing payment</span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center justify-center space-x-2 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-sm font-medium text-green-700">Payment successful</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center justify-center space-x-2 p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            <span className="text-sm font-medium text-red-700">Payment failed</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-8">
        
        {/* Transaction Entry Card */}
        <Card className="rounded-2xl shadow-lg">
          <CardContent className="p-4 sm:p-8">
            <div className="mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">New Transaction</h2>
              <p className="text-sm sm:text-base text-gray-600">Enter item details to generate customer payment link</p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                <FormField
                  control={form.control}
                  name="itemName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">Item Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Cappuccino"
                          className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[hsl(155,40%,25%)] focus:border-transparent transition-all text-lg"
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
                      <FormLabel className="text-sm font-medium text-gray-700">Price</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 text-lg font-medium">$</span>
                          <Input
                            type="text"
                            placeholder="0.00"
                            className="pl-8 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[hsl(155,40%,25%)] focus:border-transparent transition-all text-lg"
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
                  className="w-full bg-[hsl(155,40%,25%)] text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-[hsl(155,40%,20%)] transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {createTransactionMutation.isPending ? "Creating..." : "Send to Customer"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* QR Code & Status Card */}
        <Card className="rounded-2xl shadow-lg">
          <CardContent className="p-8">
            <QRCodeDisplay 
              paymentUrl={merchant?.paymentUrl}
              qrCodeUrl={merchant?.qrCodeUrl}
              merchantId={merchantId}
            />

            {currentTransaction && getStatusDisplay(currentTransaction.status)}
          </CardContent>
        </Card>
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
    </div>
  );
}
