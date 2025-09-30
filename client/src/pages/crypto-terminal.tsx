import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { sseClient } from "@/lib/sse-client";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { Bitcoin, Loader2, QrCode, Copy, Check } from "lucide-react";
import QRCode from "qrcode";

const cryptoFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  fiatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Please enter a valid amount (e.g., 50.00)"),
  cryptocurrency: z.enum(["BTC", "ETH", "USDC", "USDT", "LTC", "BCH"]).default("BTC"),
});

type CryptoFormData = z.infer<typeof cryptoFormSchema>;

export default function CryptoTerminal() {
  const [currentCryptoTx, setCurrentCryptoTx] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  
  const { toast } = useToast();
  const merchantId = getCurrentMerchantId();

  if (!merchantId) {
    window.location.href = '/login';
    return <div>Redirecting to login...</div>;
  }

  // Connect to SSE for real-time updates
  useEffect(() => {
    if (!merchantId) return;

    sseClient.connect(merchantId);

    const handleTransactionUpdate = (data: any) => {
      if (data.cryptoTransaction && currentCryptoTx && data.cryptoTransaction.id === currentCryptoTx.id) {
        setCurrentCryptoTx(data.cryptoTransaction);
        setPaymentStatus(data.cryptoTransaction.status);
        
        // Show toast notification for status changes
        if (data.cryptoTransaction.status === 'confirmed') {
          toast({
            title: "Payment Confirmed!",
            description: "Crypto payment has been successfully confirmed",
          });
        } else if (data.cryptoTransaction.status === 'failed') {
          toast({
            title: "Payment Failed",
            description: "Crypto payment failed",
            variant: "destructive",
          });
        }
      }
    };

    sseClient.subscribe('transaction_update', handleTransactionUpdate);

    return () => {
      sseClient.unsubscribe('transaction_update', handleTransactionUpdate);
    };
  }, [merchantId, currentCryptoTx, toast]);

  const form = useForm<CryptoFormData>({
    resolver: zodResolver(cryptoFormSchema),
    defaultValues: {
      itemName: "",
      fiatAmount: "",
      cryptocurrency: "BTC",
    },
  });

  const createCryptoTxMutation = useMutation({
    mutationFn: async (data: CryptoFormData) => {
      const response = await apiRequest("/api/crypto-transactions", {
        method: "POST",
        body: JSON.stringify({
          merchantId,
          ...data,
        }),
      });
      return response;
    },
    onSuccess: async (data) => {
      setCurrentCryptoTx(data.cryptoTransaction);
      
      // Generate QR code for wallet address
      try {
        const qrUrl = await QRCode.toDataURL(data.cryptoTransaction.walletAddress, {
          width: 300,
          margin: 2,
        });
        setQrDataUrl(qrUrl);
      } catch (error) {
        console.error("Error generating QR code:", error);
      }

      toast({
        title: "Crypto Payment Created",
        description: `Payment request for ${data.cryptoTransaction.cryptoAmount} ${data.cryptoTransaction.cryptocurrency} created successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create crypto payment",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CryptoFormData) => {
    createCryptoTxMutation.mutate(data);
  };

  const copyAddress = () => {
    if (currentCryptoTx?.walletAddress) {
      navigator.clipboard.writeText(currentCryptoTx.walletAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center space-x-3 mb-8">
          <Bitcoin className="h-10 w-10 text-orange-500" />
          <h1 className="text-3xl font-bold text-white">Crypto Payment Terminal</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Payment Form */}
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Create Crypto Payment</h2>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="itemName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Item Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., Coffee, Laptop"
                            className="bg-gray-700 border-gray-600 text-white"
                            data-testid="input-crypto-item-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fiatAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Amount (NZD)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            placeholder="50.00"
                            className="bg-gray-700 border-gray-600 text-white text-2xl font-bold"
                            data-testid="input-crypto-amount"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cryptocurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">Cryptocurrency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-gray-700 border-gray-600 text-white" data-testid="select-cryptocurrency">
                              <SelectValue placeholder="Select cryptocurrency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="BTC">Bitcoin (BTC)</SelectItem>
                            <SelectItem value="ETH">Ethereum (ETH)</SelectItem>
                            <SelectItem value="USDC">USD Coin (USDC)</SelectItem>
                            <SelectItem value="USDT">Tether (USDT)</SelectItem>
                            <SelectItem value="LTC">Litecoin (LTC)</SelectItem>
                            <SelectItem value="BCH">Bitcoin Cash (BCH)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-6 text-lg"
                    disabled={createCryptoTxMutation.isPending}
                    data-testid="button-create-crypto-payment"
                  >
                    {createCryptoTxMutation.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Bitcoin className="h-5 w-5 mr-2" />
                        Create Crypto Payment
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Payment Details */}
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Payment Details</h2>
              
              {currentCryptoTx ? (
                <div className="space-y-4">
                  {/* QR Code */}
                  {qrDataUrl && (
                    <div className="bg-white p-4 rounded-lg flex justify-center">
                      <img src={qrDataUrl} alt="Payment QR Code" className="w-48 h-48" data-testid="img-crypto-qr" />
                    </div>
                  )}

                  {/* Crypto Amount */}
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Amount to Pay</p>
                    <p className="text-white text-2xl font-bold" data-testid="text-crypto-amount">
                      {currentCryptoTx.cryptoAmount} {currentCryptoTx.cryptocurrency}
                    </p>
                    <p className="text-gray-400 text-sm">≈ ${currentCryptoTx.fiatAmount} NZD</p>
                  </div>

                  {/* Wallet Address */}
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm mb-2">Send to Address</p>
                    <div className="flex items-center space-x-2">
                      <p className="text-white text-xs font-mono flex-1 break-all" data-testid="text-wallet-address">
                        {currentCryptoTx.walletAddress}
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={copyAddress}
                        className="border-gray-600 text-gray-300"
                        data-testid="button-copy-address"
                      >
                        {copiedAddress ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Status */}
                  <div className={`p-4 rounded-lg ${
                    paymentStatus === 'confirmed' 
                      ? 'bg-green-900/30 border border-green-700' 
                      : paymentStatus === 'failed' || paymentStatus === 'expired'
                      ? 'bg-red-900/30 border border-red-700'
                      : 'bg-blue-900/30 border border-blue-700'
                  }`}>
                    <p className={`text-sm font-semibold ${
                      paymentStatus === 'confirmed' 
                        ? 'text-green-300' 
                        : paymentStatus === 'failed' || paymentStatus === 'expired'
                        ? 'text-red-300'
                        : 'text-blue-300'
                    }`}>
                      Status: {paymentStatus === 'confirmed' ? 'Payment Confirmed ✓' : paymentStatus === 'failed' ? 'Payment Failed' : paymentStatus === 'expired' ? 'Payment Expired' : 'Waiting for payment...'}
                    </p>
                    {paymentStatus === 'pending' && (
                      <p className="text-blue-200 text-xs mt-1">Payment expires in 60 minutes</p>
                    )}
                  </div>

                  {/* Payment URL */}
                  <div className="pt-4 border-t border-gray-700">
                    <p className="text-gray-400 text-sm mb-2">Customer Payment Link</p>
                    <a 
                      href={currentCryptoTx.hostedUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-sm break-all"
                      data-testid="link-crypto-payment"
                    >
                      {currentCryptoTx.hostedUrl}
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <QrCode className="h-16 w-16 mb-4" />
                  <p>Create a payment to see details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
