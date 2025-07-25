import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QRCodeDisplay } from "@/components/qr-code-display";
import { MerchantUrlDisplay } from "@/components/merchant-url-display";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { Send, Loader2, CheckCircle, Clock, XCircle, Eye, Copy, Check, QrCode, Smartphone, Waves, CreditCard, X } from "lucide-react";
import { Link } from "wouter";

const transactionFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Please enter a valid price (e.g., 4.50)"),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

export default function MerchantTerminal() {
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState("qr");
  
  // NFC-specific state
  const [nfcCapabilities, setNfcCapabilities] = useState<any>(null);
  const [nfcPaymentStatus, setNfcPaymentStatus] = useState<"idle" | "creating" | "ready" | "processing" | "completed" | "failed">("idle");
  const [nfcSession, setNfcSession] = useState<any>(null);
  const [showNfcOverlay, setShowNfcOverlay] = useState(false);
  
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

  // Check NFC capabilities on load
  useEffect(() => {
    const checkCapabilities = async () => {
      try {
        const response = await fetch('/api/nfc/capabilities');
        const capabilities = await response.json();
        setNfcCapabilities(capabilities);
        
        if (!capabilities.nfcSupported) {
          console.log("NFC not supported on this device");
        }
      } catch (error) {
        console.error('Failed to check NFC capabilities:', error);
      }
    };
    
    checkCapabilities();
  }, []);

  // Update current transaction from active transaction query
  useEffect(() => {
    if (activeTransaction) {
      setCurrentTransaction(activeTransaction);
    }
  }, [activeTransaction]);

  const onSubmit = (data: TransactionFormData) => {
    createTransactionMutation.mutate(data);
  };

  // NFC Payment Functions
  const createNFCPayment = async () => {
    const itemName = form.getValues("itemName");
    const price = form.getValues("price");
    
    if (!price || !itemName || !merchantId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setNfcPaymentStatus("creating");
    
    try {
      const response = await fetch(`/api/merchants/${merchantId}/nfc-pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(price),
          itemName,
          deviceId: navigator.userAgent,
          nfcCapabilities: nfcCapabilities
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create NFC payment session');
      }

      const result = await response.json();
      setNfcSession(result.nfcSession);
      setNfcPaymentStatus("ready");
      setShowNfcOverlay(true);
      
      toast({
        title: "Payment Terminal Ready",
        description: "Ask customer to tap their card or digital wallet.",
      });
    } catch (error) {
      console.error('NFC payment creation failed:', error);
      setNfcPaymentStatus("failed");
      toast({
        title: "Payment Failed",
        description: "Could not create NFC payment session.",
        variant: "destructive",
      });
    }
  };

  const simulateNFCTap = async () => {
    if (!nfcSession) return;
    
    setNfcPaymentStatus("processing");
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await fetch(`/api/nfc-sessions/${nfcSession.sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethod: 'contactless_card',
          cardLast4: '4532',
          deviceId: navigator.userAgent
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete NFC payment');
      }

      const result = await response.json();
      setNfcPaymentStatus("completed");
      
      setTimeout(() => {
        setShowNfcOverlay(false);
        setNfcPaymentStatus("idle");
        setNfcSession(null);
        form.reset();
      }, 3000);
      
    } catch (error) {
      console.error('NFC payment failed:', error);
      setNfcPaymentStatus("failed");
      toast({
        title: "Payment Failed",
        description: "NFC payment could not be completed.",
        variant: "destructive",
      });
    }
  };

  const getPaymentStatusIndicator = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <div className="flex flex-col items-center space-y-2 sm:space-y-3 p-4 sm:p-6 bg-blue-500/10 backdrop-blur-sm rounded-2xl border border-blue-400/30">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-300" />
              <span className="text-base sm:text-lg font-medium text-blue-200">Awaiting Payment</span>
            </div>
            <p className="text-xs sm:text-sm text-blue-300 text-center">Customer can now scan QR code to pay</p>
          </div>
        );
      case "processing":
        return (
          <div className="flex flex-col items-center space-y-2 sm:space-y-3 p-4 sm:p-6 bg-orange-500/10 backdrop-blur-sm rounded-2xl border border-orange-400/30">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Loader2 className="w-5 h-5 sm:w-7 sm:h-7 text-orange-300 animate-spin" />
              <span className="text-base sm:text-lg font-medium text-orange-200">Processing Payment</span>
            </div>
            <p className="text-xs sm:text-sm text-orange-300 text-center">Payment is being processed...</p>
          </div>
        );
      case "completed":
        return (
          <div className="flex flex-col items-center space-y-2 sm:space-y-3 p-4 sm:p-6 bg-green-500/10 backdrop-blur-sm rounded-2xl border border-green-400/30">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <CheckCircle className="w-5 h-5 sm:w-7 sm:h-7 text-green-300" />
              <span className="text-base sm:text-lg font-medium text-green-200">Payment Accepted</span>
            </div>
            <p className="text-xs sm:text-sm text-green-300 text-center">Transaction completed successfully!</p>
          </div>
        );
      case "failed":
        return (
          <div className="flex flex-col items-center space-y-2 sm:space-y-3 p-4 sm:p-6 bg-red-500/10 backdrop-blur-sm rounded-2xl border border-red-400/30">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <XCircle className="w-5 h-5 sm:w-7 sm:h-7 text-red-300" />
              <span className="text-base sm:text-lg font-medium text-red-200">Payment Failed</span>
            </div>
            <p className="text-xs sm:text-sm text-red-300 text-center">Please try again or contact support</p>
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
      <div className="relative z-10 max-w-4xl mx-auto px-3 sm:px-4 pt-32 sm:pt-34 pb-4 sm:pb-8">
        <div className="mb-4 sm:mb-6 text-center">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-2 sm:mb-4">Payment Terminal</h1>
        </div>

        {/* Tabbed Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-transparent p-1 gap-2">
            <TabsTrigger 
              value="qr" 
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 border data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:border-white/40 data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/80 data-[state=inactive]:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <QrCode className="w-4 h-4" />
              <span>QR Code</span>
            </TabsTrigger>
            <TabsTrigger 
              value="nfc" 
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 border data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:border-white/40 data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/80 data-[state=inactive]:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <Smartphone className="w-4 h-4" />
              <span>NFC</span>
            </TabsTrigger>
          </TabsList>

          {/* QR Code Tab Content */}
          <TabsContent value="qr" className="space-y-4 sm:space-y-6">
            {/* Mobile: Stack vertically, Desktop: Side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          
          {/* Transaction Entry Card */}
          <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
            <div className="mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2">New Transaction</h2>
              <p className="text-xs sm:text-sm text-white/70">Enter item details</p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
                <FormField
                  control={form.control}
                  name="itemName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs sm:text-sm font-medium text-white">Item Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Coffee, Lunch, etc."
                          {...field}
                          className="backdrop-blur-sm bg-white/5 border-white/15 text-black sm:text-white placeholder:text-gray-600 sm:placeholder:text-white/60 focus:bg-white/8 focus:border-white/20 h-11 sm:h-10 text-base font-medium"
                        />
                      </FormControl>
                      <FormMessage className="text-red-300 text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs sm:text-sm font-medium text-white">Price ($)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="4.50"
                          {...field}
                          className="backdrop-blur-sm bg-white/5 border-white/15 text-black sm:text-white placeholder:text-gray-600 sm:placeholder:text-white/60 focus:bg-white/8 focus:border-white/20 h-11 sm:h-10 text-base font-medium"
                        />
                      </FormControl>
                      <FormMessage className="text-red-300 text-xs" />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={createTransactionMutation.isPending}
                  className="w-full relative backdrop-blur-sm bg-gradient-to-r from-green-500/80 via-emerald-500/80 to-green-400/80 border border-green-400/50 text-white hover:from-green-400/90 hover:via-emerald-400/90 hover:to-green-300/90 hover:border-green-300/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] py-3 sm:py-3 h-12 sm:h-11 rounded-xl font-medium transition-all duration-300 text-sm sm:text-base glow-green-button"
                >
                  <Send className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{createTransactionMutation.isPending ? "Creating..." : "Send to Customer"}</span>
                  <span className="sm:hidden">{createTransactionMutation.isPending ? "Creating..." : "Send"}</span>
                </Button>
              </form>
            </Form>
          </div>


        </div>

            {/* Payment Status Row for QR - MOVED above QR Code section */}
            {currentTransaction && (
              <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
                <div className="text-center mb-3 sm:mb-4">
                  <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                    Transaction #{currentTransaction.id}
                  </h3>
                  <p className="text-xs sm:text-sm text-white/70">
                    {currentTransaction.itemName} - ${currentTransaction.price}
                  </p>
                </div>
                {getPaymentStatusIndicator(currentTransaction.status)}
              </div>
            )}

            {/* QR Code Display Section */}
            <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
              <div className="mb-3 sm:mb-4">
                <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2">QR Code</h2>
                <p className="text-xs sm:text-sm text-white/70">Static payment code</p>
              </div>
              
              <div className="text-center">
                <QRCodeDisplay 
                  paymentUrl={merchant?.paymentUrl}
                  qrCodeUrl={merchant?.qrCodeUrl}
                  merchantId={merchantId}
                />
              </div>
            </div>
          </TabsContent>

          {/* NFC Tab Content */}
          <TabsContent value="nfc" className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              
              {/* NFC Transaction Entry Card */}
              <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
                <div className="mb-3 sm:mb-4">
                  <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2">NFC Payment</h2>
                  <p className="text-xs sm:text-sm text-white/70">Create contactless payment</p>
                </div>

                <Form {...form}>
                  <div className="space-y-3 sm:space-y-4">
                    <FormField
                      control={form.control}
                      name="itemName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm font-medium text-white">Item Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Coffee, Lunch, etc."
                              {...field}
                              className="backdrop-blur-sm bg-white/5 border-white/15 text-black sm:text-white placeholder:text-gray-600 sm:placeholder:text-white/60 focus:bg-white/8 focus:border-white/20 h-11 sm:h-10 text-base font-medium"
                            />
                          </FormControl>
                          <FormMessage className="text-red-300 text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm font-medium text-white">Price ($)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="4.50"
                              {...field}
                              className="backdrop-blur-sm bg-white/5 border-white/15 text-black sm:text-white placeholder:text-gray-600 sm:placeholder:text-white/60 focus:bg-white/8 focus:border-white/20 h-11 sm:h-10 text-base font-medium"
                            />
                          </FormControl>
                          <FormMessage className="text-red-300 text-xs" />
                        </FormItem>
                      )}
                    />
                    
                    {/* NFC Create Payment Button */}
                    {nfcPaymentStatus === "idle" && (
                      <button 
                        onClick={createNFCPayment}
                        disabled={!nfcCapabilities?.nfcSupported || !form.watch("price") || !form.watch("itemName")}
                        style={{
                          width: '100%',
                          padding: '16px',
                          background: (!nfcCapabilities?.nfcSupported || !form.watch("price") || !form.watch("itemName")) 
                            ? 'rgba(107, 114, 128, 0.5)' 
                            : 'linear-gradient(to right, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8), rgba(34, 197, 94, 0.8))',
                          border: '1px solid rgba(34, 197, 94, 0.5)',
                          borderRadius: '12px',
                          color: 'white',
                          fontSize: '16px',
                          fontWeight: '500',
                          cursor: (!nfcCapabilities?.nfcSupported || !form.watch("price") || !form.watch("itemName")) ? 'not-allowed' : 'pointer',
                          opacity: (!nfcCapabilities?.nfcSupported || !form.watch("price") || !form.watch("itemName")) ? 0.5 : 1,
                          transition: 'all 0.3s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        <Waves className="w-4 h-4" />
                        Create NFC Payment
                      </button>
                    )}
                  </div>
                </Form>
              </div>

              {/* NFC Status Card */}
              <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
                <div className="mb-3 sm:mb-4">
                  <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2">NFC Status</h2>
                  <p className="text-xs sm:text-sm text-white/70">Contactless payment ready</p>
                </div>
                
                <div className="text-center space-y-4">
                  {!nfcCapabilities?.nfcSupported && (
                    <div className="p-4 bg-red-500/10 border border-red-400/30 rounded-xl">
                      <p className="text-red-300 text-sm">NFC not supported on this device</p>
                    </div>
                  )}
                  
                  {nfcCapabilities?.nfcSupported && nfcPaymentStatus === "idle" && (
                    <div className="p-4 bg-blue-500/10 border border-blue-400/30 rounded-xl">
                      <Smartphone className="w-8 h-8 text-blue-300 mx-auto mb-2" />
                      <p className="text-blue-300 text-sm">Ready for NFC payment</p>
                    </div>
                  )}

                  {nfcSession && !showNfcOverlay && (
                    <div className="p-4 bg-green-500/10 border border-green-400/30 rounded-xl">
                      <div className="flex items-center justify-center gap-3 mb-3">
                        {nfcPaymentStatus === "ready" && <Waves className="h-5 w-5 text-blue-400 animate-pulse" />}
                        {nfcPaymentStatus === "processing" && <Loader2 className="h-5 w-5 text-yellow-400 animate-spin" />}
                        {nfcPaymentStatus === "completed" && <CheckCircle className="h-5 w-5 text-green-400" />}
                        {nfcPaymentStatus === "failed" && <XCircle className="h-5 w-5 text-red-400" />}
                        
                        <span className="text-white font-light">
                          {nfcPaymentStatus === "ready" && "Waiting for Customer"}
                          {nfcPaymentStatus === "processing" && "Processing Payment..."}
                          {nfcPaymentStatus === "completed" && "Payment Received"}
                          {nfcPaymentStatus === "failed" && "Payment Failed"}
                        </span>
                      </div>
                      
                      {nfcPaymentStatus === "ready" && (
                        <button
                          onClick={() => setShowNfcOverlay(true)}
                          style={{
                            background: 'linear-gradient(to right, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
                            border: '1px solid rgba(34, 197, 94, 0.5)',
                            borderRadius: '8px',
                            color: 'white',
                            padding: '8px 16px',
                            fontSize: '14px',
                            fontWeight: '300',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          Show Payment Screen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Bottom Row: Payment Link + Customer Page */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
          {/* Payment Link Section */}
          <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
            <div className="mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2">Payment Link</h2>
              <p className="text-xs sm:text-sm text-white/70">Share this link with customers</p>
            </div>
            
            {merchant?.paymentUrl && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 p-3 bg-white/3 border border-white/10 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-white/90 truncate font-mono break-all">
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
                  className="backdrop-blur-sm bg-white/5 border border-white/15 text-white hover:bg-white/8 hover:border-white/20 shrink-0 px-3 py-2 h-9 text-sm font-medium"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-4 w-4 mr-1 sm:mr-0" />
                      <span className="sm:hidden">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1 sm:mr-0" />
                      <span className="sm:hidden">Copy</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Customer Payment Page Button */}
          <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15 hover:transform hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-center h-full">
              {merchant?.paymentUrl && (
                <Link href={`/pay/${merchantId}`} className="w-full">
                  <Button className="w-full backdrop-blur-sm bg-white/5 border border-white/15 text-white hover:bg-white/8 hover:border-white/20 px-4 sm:px-6 py-3 h-12 sm:h-11 rounded-xl font-medium transition-all duration-300 text-sm sm:text-base">
                    <Eye className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">View Customer Payment Page</span>
                    <span className="sm:hidden">Customer Page</span>
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Transactions Button - Bottom of page */}
        <div className="mt-6 sm:mt-8 mb-6 sm:mb-8">
          <div className="flex justify-center">
            <Link href="/transactions" className="w-full sm:w-auto">
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 backdrop-blur-sm bg-white/5 border border-white/15 text-white rounded-2xl hover:bg-white/8 hover:border-white/20 transition-all duration-300 font-medium text-sm sm:text-base h-12 sm:h-11">
                <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">View All Transactions</span>
                <span className="sm:hidden">All Transactions</span>
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* NFC Glass Overlay Effect when NFC Payment is Active */}
      {showNfcOverlay && (
        <div className="fixed inset-0 z-50 backdrop-blur-2xl bg-black/60">
          <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-gray-900/30 to-gray-800/20"></div>
          
          <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
            <div className="backdrop-blur-3xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
              
              {nfcPaymentStatus === "ready" && (
                <div className="space-y-12">
                  {/* Close Button */}
                  <button
                    onClick={() => setShowNfcOverlay(false)}
                    className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200"
                  >
                    <X className="h-5 w-5 text-white/70" />
                  </button>
                  
                  {/* Minimal NFC Icon */}
                  <div className="mx-auto w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Waves className="h-8 w-8 text-white/80" />
                  </div>
                  
                  {/* Clean Typography */}
                  <div className="space-y-3">
                    <div className="text-5xl font-extralight text-white tracking-tight">${nfcSession?.amount}</div>
                    <div className="text-white/60 text-lg font-light">{nfcSession?.itemName}</div>
                  </div>
                  
                  {/* Simple Instruction */}
                  <div className="space-y-4">
                    <div className="text-white/80 text-xl font-light">Tap to Pay</div>
                    <div className="text-white/50 text-sm">Present card or device to terminal</div>
                    
                    {/* Clickable Payment Area for Demo */}
                    <div 
                      onClick={simulateNFCTap}
                      className="cursor-pointer w-full mt-8 py-6 px-8 bg-white/5 hover:bg-white/10 border border-white/20 rounded-2xl text-white/90 text-lg font-light transition-all duration-200 hover:border-white/30 text-center"
                    >
                      Tap here to pay
                    </div>
                  </div>
                </div>
              )}
              
              {nfcPaymentStatus === "processing" && (
                <div className="space-y-12">
                  {/* Close Button */}
                  <button
                    onClick={() => setShowNfcOverlay(false)}
                    className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200"
                  >
                    <X className="h-5 w-5 text-white/70" />
                  </button>
                  
                  {/* Minimal Processing Indicator */}
                  <div className="mx-auto w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
                  </div>
                  
                  {/* Clean Processing Text */}
                  <div className="space-y-4">
                    <div className="text-white/90 text-2xl font-light">Processing</div>
                    <div className="text-white/60 text-sm">Please wait...</div>
                  </div>
                </div>
              )}
              
              {nfcPaymentStatus === "completed" && (
                <div className="space-y-12">
                  {/* Close Button */}
                  <button
                    onClick={() => setShowNfcOverlay(false)}
                    className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200"
                  >
                    <X className="h-5 w-5 text-white/70" />
                  </button>
                  
                  {/* Success Icon */}
                  <div className="mx-auto w-20 h-20 rounded-full bg-green-500/10 border border-green-400/30 flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  </div>
                  
                  {/* Success Message */}
                  <div className="space-y-3">
                    <div className="text-green-300 text-xl font-light">Payment Complete</div>
                    <div className="text-4xl font-extralight text-white tracking-tight">${nfcSession?.amount}</div>
                    <div className="text-white/60 text-lg font-light">{nfcSession?.itemName}</div>
                  </div>
                </div>
              )}
              
              {nfcPaymentStatus === "failed" && (
                <div className="space-y-12">
                  {/* Close Button */}
                  <button
                    onClick={() => {
                      setShowNfcOverlay(false);
                      setNfcPaymentStatus("idle");
                      setNfcSession(null);
                    }}
                    className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200"
                  >
                    <X className="h-5 w-5 text-white/70" />
                  </button>
                  
                  {/* Error Icon */}
                  <div className="mx-auto w-20 h-20 rounded-full bg-red-500/10 border border-red-400/30 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  
                  {/* Error Message */}
                  <div className="space-y-4">
                    <div className="text-red-300 text-xl font-light">Payment Failed</div>
                    <div className="text-white/60 text-sm">Please try again</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
