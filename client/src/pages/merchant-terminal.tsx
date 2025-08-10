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
import { Send, Loader2, CheckCircle, Clock, XCircle, Eye, Copy, Check, QrCode, Smartphone, Waves, CreditCard, X, Menu, Edit, Split, MoreHorizontal } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  
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

  const handleActionClick = (action: string) => {
    if (activeAction === action) {
      setActiveAction(null);
    } else {
      setActiveAction(action);
    }
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

  // Real NFC hardware would trigger payment completion through SSE events
  // No simulation function needed - payments process only through actual card taps

  const getPaymentStatusIndicator = (status: string) => {
    const transaction = currentTransaction || activeTransaction;
    
    switch (status) {
      case "pending":
        return (
          <div className="flex flex-col items-center space-y-2 sm:space-y-3 p-4 sm:p-6 bg-blue-500/10 backdrop-blur-sm rounded-2xl border border-blue-400/30">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-300" />
              <span className="text-base sm:text-lg font-medium text-blue-200">Awaiting Payment</span>
            </div>
            
            {/* Show split information if transaction is split */}
            {transaction?.isSplit ? (
              <div className="text-center space-y-1">
                <p className="text-xs sm:text-sm text-blue-300">Split Bill Payment</p>
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-sm font-bold text-blue-200">
                    {transaction.completedSplits + 1} of {transaction.totalSplits}
                  </span>
                  <span className="text-xs text-blue-300">payments</span>
                </div>
                <p className="text-xs text-blue-300">
                  ${parseFloat(transaction.splitAmount).toFixed(2)} per person
                </p>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-blue-300 text-center">Customer can now scan QR code to pay</p>
            )}
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
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Menu overlay */}
      {menuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Main content container */}
      <div 
        className="relative z-10 min-h-screen transition-transform duration-300 ease-in-out"
        style={{
          transform: menuOpen ? 'translateX(-70%)' : 'translateX(0)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6">
          <div className="flex-1" />
          <h1 className="text-2xl font-bold text-center text-white">tapt</h1>
          <div className="flex-1 flex justify-end">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("qr")}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === "qr"
                  ? "bg-black text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              QR
            </button>
            <button
              onClick={() => setActiveTab("nfc")}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === "nfc"
                  ? "bg-black text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              NFC
            </button>
          </div>
        </div>

        {/* Amount Box */}
        <div className="px-6 mb-6">
          {currentTransaction || activeTransaction ? (
            <div 
              className="rounded-2xl p-6 text-center"
              style={{ backgroundColor: '#00FF66' }}
            >
              <div className="text-black text-lg font-medium mb-2">Total</div>
              <div className="text-black text-4xl font-bold">
                ${parseFloat((currentTransaction || activeTransaction).price).toFixed(2)}
              </div>
              <div className="text-black text-sm mt-2">
                {(currentTransaction || activeTransaction).itemName}
              </div>
            </div>
          ) : (
            <div 
              className="rounded-2xl p-6 text-center border-2 border-dashed"
              style={{ borderColor: '#00FF66' }}
            >
              <div className="text-gray-400 text-lg font-medium mb-2">Total</div>
              <div className="text-gray-400 text-4xl font-bold">$0.00</div>
              <div className="text-gray-400 text-sm mt-2">No active transaction</div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 mb-6 px-6">
          <button
            onClick={() => handleActionClick("send")}
            className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 ${
              activeAction === "send"
                ? 'text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            style={{
              backgroundColor: activeAction === "send" ? '#00FF66' : undefined
            }}
          >
            <Send size={24} />
            <span className="text-xs mt-1 font-medium">Send</span>
          </button>
          
          <button
            onClick={() => handleActionClick("edit")}
            className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 ${
              activeAction === "edit"
                ? 'text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            style={{
              backgroundColor: activeAction === "edit" ? '#00FF66' : undefined
            }}
          >
            <Edit size={24} />
            <span className="text-xs mt-1 font-medium">Edit</span>
          </button>
          
          <button
            onClick={() => handleActionClick("split")}
            className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 ${
              activeAction === "split"
                ? 'text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            style={{
              backgroundColor: activeAction === "split" ? '#00FF66' : undefined
            }}
          >
            <Split size={24} />
            <span className="text-xs mt-1 font-medium">Split</span>
          </button>
          
          <button
            onClick={() => handleActionClick("more")}
            className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 ${
              activeAction === "more"
                ? 'text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            style={{
              backgroundColor: activeAction === "more" ? '#00FF66' : undefined
            }}
          >
            <MoreHorizontal size={24} />
            <span className="text-xs mt-1 font-medium">More</span>
          </button>
        </div>

        {/* Action Panel */}
        <div className="px-6">
          <div 
            className="overflow-hidden transition-all duration-250 ease-in-out"
            style={{
              maxHeight: activeAction ? '400px' : '0px',
            }}
          >
            <div className="bg-gray-800 rounded-2xl p-6 mb-6">
              {activeAction === "edit" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold mb-4 text-white">Edit Transaction</h3>
                  <Form {...form}>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="itemName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-gray-300">Item Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter item name"
                                {...field}
                                className="bg-gray-700 border-gray-600 text-white rounded-lg"
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
                            <FormLabel className="text-sm font-medium text-gray-300">Price ($)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter price"
                                {...field}
                                className="bg-gray-700 border-gray-600 text-white rounded-lg"
                              />
                            </FormControl>
                            <FormMessage className="text-red-300 text-xs" />
                          </FormItem>
                        )}
                      />
                      <Button
                        onClick={form.handleSubmit(onSubmit)}
                        className="w-full text-black font-semibold rounded-lg"
                        style={{ backgroundColor: '#00FF66' }}
                      >
                        Create Transaction
                      </Button>
                    </div>
                  </Form>
                </div>
              )}

              {activeAction === "split" && (
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">Split the Bill</h3>
                  <p className="text-gray-300 mb-4">How many ways would you like to split this payment?</p>
                  <div className="flex justify-center gap-3 mb-4">
                    {[2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        onClick={() => {
                          // Handle split logic here
                          toast({
                            title: "Bill Split",
                            description: `Transaction will be split ${num} ways`,
                          });
                          setActiveAction(null);
                        }}
                        className="w-12 h-12 rounded-full font-semibold transition-colors text-black"
                        style={{ backgroundColor: '#00FF66' }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeAction === "send" && (
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">Share Payment</h3>
                  <p className="text-gray-300 mb-4">Copy the payment link to share with customers</p>
                  <Button
                    onClick={() => {
                      if (merchant) {
                        navigator.clipboard.writeText(merchant.paymentUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                        toast({
                          title: "Link Copied",
                          description: "Payment link copied to clipboard",
                        });
                      }
                      setActiveAction(null);
                    }}
                    className="w-full text-black font-semibold rounded-lg"
                    style={{ backgroundColor: '#00FF66' }}
                  >
                    {copiedLink ? "Copied!" : "Copy Payment Link"}
                  </Button>
                </div>
              )}

              {activeAction === "more" && (
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">More Options</h3>
                  <div className="space-y-3">
                    <Link href="/dashboard">
                      <Button
                        variant="outline"
                        className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                      >
                        View Dashboard
                      </Button>
                    </Link>
                    <Link href="/transactions">
                      <Button
                        variant="outline"
                        className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                      >
                        Transaction History
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                      onClick={() => setActiveAction(null)}
                    >
                      Settings
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="px-6">
          {currentTransaction || activeTransaction ? (
            <div className="bg-white rounded-2xl p-8 flex items-center justify-center">
              <div className="text-center">
                <QRCodeDisplay 
                  merchantId={merchantId} 
                  className="w-48 h-48 mx-auto mb-4"
                />
                <p className="text-gray-600 text-sm">
                  {activeTab === "qr" ? "Scan to pay with any device" : "Tap your phone to pay"}
                </p>
                <div className="mt-4 text-center">
                  {getPaymentStatusIndicator((currentTransaction || activeTransaction).status)}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 flex items-center justify-center">
              <div className="text-center">
                <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4">
                  {activeTab === "qr" ? (
                    <QrCode size={64} className="text-gray-400" />
                  ) : (
                    <Smartphone size={64} className="text-gray-400" />
                  )}
                </div>
                <p className="text-gray-600 text-sm">
                  {activeTab === "qr" ? "Create a transaction to show QR code" : "Create a transaction for NFC payment"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slide-out Hamburger Menu */}
      <div 
        className="menu-container fixed top-0 right-0 h-full bg-gray-900 z-50 transition-transform duration-300 ease-in-out"
        style={{
          width: '70%',
          transform: menuOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-white">Menu</h2>
            <button
              onClick={() => setMenuOpen(false)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X size={24} className="text-white" />
            </button>
          </div>
          
          <nav className="space-y-4">
            <Link href="/dashboard">
              <a className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
                Dashboard
              </a>
            </Link>
            <Link href="/transactions">
              <a className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
                Transaction History
              </a>
            </Link>
            <Link href="/settings">
              <a className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
                Settings
              </a>
            </Link>
            <button 
              onClick={() => {
                localStorage.removeItem('auth-token');
                window.location.href = '/login';
              }}
              className="block w-full text-left py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              Logout
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
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
        <div className="fixed inset-0 z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)' }}>
          <div className="min-h-screen flex items-center justify-center p-6">
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.05)', 
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '24px',
              padding: '32px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
            }} className="max-w-sm w-full text-center relative">
              
              {nfcPaymentStatus === "ready" && (
                <div className="space-y-12">
                  {/* Close Button */}
                  <button
                    onClick={() => setShowNfcOverlay(false)}
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                  >
                    <X style={{ width: '20px', height: '20px', color: 'rgba(255, 255, 255, 0.8)' }} />
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
                    
                    {/* NFC Payment Area - Pure Visual Indicator */}
                    <div className="w-full mt-8 py-6 px-8 bg-white/5 border border-white/20 rounded-2xl text-white/90 text-lg font-light text-center">
                      <div className="animate-pulse">Ready for contactless payment</div>
                    </div>
                  </div>
                </div>
              )}
              
              {nfcPaymentStatus === "processing" && (
                <div className="space-y-12">
                  {/* Close Button */}
                  <button
                    onClick={() => setShowNfcOverlay(false)}
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                  >
                    <X style={{ width: '20px', height: '20px', color: 'rgba(255, 255, 255, 0.8)' }} />
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
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                  >
                    <X style={{ width: '20px', height: '20px', color: 'rgba(255, 255, 255, 0.8)' }} />
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
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
                  >
                    <X style={{ width: '20px', height: '20px', color: 'rgba(255, 255, 255, 0.8)' }} />
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
