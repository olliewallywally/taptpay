import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeDisplay } from "@/components/qr-code-display";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { Send, Loader2, CheckCircle, Clock, XCircle, QrCode, Smartphone, Edit, Split, MoreHorizontal, Menu, X, Waves, ChevronDown, Copy } from "lucide-react";
import { Link } from "wouter";

const transactionFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Please enter a valid price (e.g., 4.50)"),
  selectedStoneId: z.number().optional(),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

export default function MerchantTerminalMobile() {
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<"QR" | "NFC">("QR");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  // NFC-specific states
  const [nfcCapabilities, setNfcCapabilities] = useState<any>(null);
  const [nfcPaymentStatus, setNfcPaymentStatus] = useState<"idle" | "creating" | "ready" | "processing" | "completed" | "failed">("idle");
  const [nfcSession, setNfcSession] = useState<any>(null);
  const [showNfcOverlay, setShowNfcOverlay] = useState(false);
  const [showQrDropdown, setShowQrDropdown] = useState(false);
  
  // Tapt Stone states
  const [selectedStoneId, setSelectedStoneId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const merchantId = getCurrentMerchantId();
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Check NFC capabilities when NFC tab is selected
  useEffect(() => {
    if (activeTab === "NFC" && !nfcCapabilities) {
      const checkNfcCapabilities = async () => {
        try {
          const response = await fetch('/api/nfc/capabilities');
          const capabilities = await response.json();
          setNfcCapabilities(capabilities);
          
          if (!capabilities.nfcSupported) {
            toast({
              title: "NFC Not Supported",
              description: "This device doesn't support NFC payments. Use QR code instead.",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error('Failed to check NFC capabilities:', error);
        }
      };
      
      checkNfcCapabilities();
    }
  }, [activeTab, nfcCapabilities, toast]);

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
      selectedStoneId: undefined,
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

  // Get tapt stones for this merchant
  const { data: taptStones = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/tapt-stones`);
      if (!response.ok) throw new Error("Failed to fetch tapt stones");
      return response.json();
    },
  });

  // Create tapt stone mutation
  const createTaptStoneMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/merchants/${merchantId}/tapt-stones`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "tapt-stones"] });
      toast({
        title: "Success",
        description: "New tapt stone created successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create tapt stone",
        variant: "destructive",
      });
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
        selectedStoneId: data.selectedStoneId,
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
      setActiveAction(null);
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
    console.log('Form submitted with data:', data);
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
    if (!currentTransaction && !activeTransaction) {
      toast({
        title: "No Transaction",
        description: "Create a transaction first to enable NFC payment.",
        variant: "destructive",
      });
      return;
    }

    const transaction = currentTransaction || activeTransaction;
    setNfcPaymentStatus("creating");
    
    try {
      const response = await fetch(`/api/merchants/${merchantId}/nfc-pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(transaction.price),
          itemName: transaction.itemName,
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
      // Simulate processing delay
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

      setNfcPaymentStatus("completed");
      
      toast({
        title: "Payment Received!",
        description: `Customer paid $${nfcSession.amount} successfully`,
      });

      // Auto-reset after showing success
      setTimeout(() => {
        resetNfcPayment();
      }, 4000);

    } catch (error) {
      console.error('NFC payment failed:', error);
      setNfcPaymentStatus("failed");
      
      toast({
        title: "Payment Failed",
        description: "Ask customer to try tapping again or use different payment method.",
        variant: "destructive",
      });
    }
  };

  const resetNfcPayment = () => {
    setNfcPaymentStatus("idle");
    setNfcSession(null);
    setShowNfcOverlay(false);
  };

  const closeNfcOverlay = () => {
    setShowNfcOverlay(false);
    resetNfcPayment();
  };

  const getPaymentStatusIndicator = (status: string) => {
    return (
      <div className="flex items-center justify-center">
        {status === "pending" && (
          <div className="relative w-12 h-12">
            {/* Static ring for pending */}
            <div className="absolute inset-0 rounded-full border-3 border-[#00FF66]/40"></div>
            <Clock className="absolute inset-2 w-8 h-8 text-[#00FF66]/70" />
          </div>
        )}
        
        {status === "processing" && (
          <div className="relative w-12 h-12">
            {/* Animated ring only when processing */}
            <div className="absolute inset-0 rounded-full border-3 border-[#00FF66]/30"></div>
            <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-[#00FF66] animate-spin duration-700"></div>
          </div>
        )}
        
        {status === "completed" && (
          <div className="relative w-12 h-12 flex items-center justify-center">
            {/* Success tick with smooth transition */}
            <div className="absolute inset-0 rounded-full border-3 border-[#00FF66] animate-[fadeIn_0.5s_ease-in-out]"></div>
            <CheckCircle className="w-6 h-6 text-[#00FF66] animate-[scaleIn_0.5s_ease-in-out]" />
          </div>
        )}
        
        {status === "failed" && (
          <div className="relative w-12 h-12 flex items-center justify-center">
            {/* Failed X with smooth transition */}
            <div className="absolute inset-0 rounded-full border-3 border-red-400 animate-[fadeIn_0.5s_ease-in-out]"></div>
            <XCircle className="w-6 h-6 text-red-400 animate-[scaleIn_0.5s_ease-in-out]" />
          </div>
        )}
      </div>
    );
  };

  if (isMobile) {
    return (
      <>
        {/* Menu Backdrop */}
        <div 
          className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
            menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setMenuOpen(false)}
        />

        {/* Sliding Menu */}
        <div 
          className={`fixed right-0 top-0 h-full w-80 bg-gray-100 border-l border-gray-300 z-50 transform transition-transform duration-300 ease-in-out ${
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="p-6">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-black">Menu</h2>
              <button onClick={() => setMenuOpen(false)} className="text-black/70 hover:text-black">
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="space-y-4">
              <a href="/dashboard" className="block py-3 px-4 text-black/70 hover:text-black hover:bg-black/10 rounded-xl transition-colors">
                Dashboard
              </a>
              <a href="/merchant" className="block py-3 px-4 text-[#00FF66] bg-gray-200 rounded-xl font-medium">
                Terminal
              </a>
              <a href="/transactions" className="block py-3 px-4 text-black/70 hover:text-black hover:bg-black/10 rounded-xl transition-colors">
                Transactions
              </a>
              <a href="/settings" className="block py-3 px-4 text-black/70 hover:text-black hover:bg-black/10 rounded-xl transition-colors">
                Settings
              </a>
              <div className="pt-4 mt-4 border-t border-gray-300">
                <button 
                  onClick={() => {
                    localStorage.removeItem('auth-token');
                    window.location.href = '/login';
                  }}
                  className="block w-full text-left py-3 px-4 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-xl transition-colors"
                >
                  Logout
                </button>
              </div>
            </nav>
          </div>
        </div>

        {/* Main Content with Slide Animation */}
        <div 
          className={`min-h-screen text-white relative overflow-hidden transform transition-transform duration-300 ease-in-out ${
            menuOpen ? '-translate-x-80' : 'translate-x-0'
          }`}
          style={{
            background: 'linear-gradient(45deg, #000000, #1a1a1a, #0a0a0a, #2a2a2a)',
            backgroundSize: '400% 400%',
            animation: 'gradientMove 15s ease infinite'
          }}
        >
          {/* Menu Icon */}
          <div className="fixed top-4 right-4 z-30">
            <button
              onClick={() => setMenuOpen(true)}
              className="p-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>

          <div className="relative z-10 p-4 pt-20">
          <div className="relative z-10 p-4">{/* Main content container */}

        {/* Mode Switcher */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("QR")}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === "QR"
                  ? "bg-black text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              QR
            </button>
            <button
              onClick={() => setActiveTab("NFC")}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === "NFC"
                  ? "bg-black text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              NFC
            </button>
          </div>
        </div>

        {/* Amount Box - More Rounded */}
        <div className="px-6 mb-6">
          {currentTransaction || activeTransaction ? (
            <div 
              className="rounded-3xl p-6 text-center"
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
              className="rounded-3xl p-6 text-center border-2 border-dashed"
              style={{ borderColor: '#00FF66' }}
            >
              <div className="text-gray-400 text-lg font-medium mb-2">Total</div>
              <div className="text-gray-400 text-4xl font-bold">$0.00</div>
              <div className="text-gray-400 text-sm mt-2">No active transaction</div>
            </div>
          )}
        </div>

        {/* Action Buttons - Connected Dark Grey Box */}
        <div className="px-6 mb-6">
          <div className="bg-gray-800 rounded-3xl p-4">
            <div className="flex justify-center gap-4">
              <button
                onClick={() => handleActionClick("send")}
                className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 ${
                  activeAction === "send"
                    ? 'text-black'
                    : 'text-gray-300 hover:bg-gray-700'
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
                    : 'text-gray-300 hover:bg-gray-700'
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
                    : 'text-gray-300 hover:bg-gray-700'
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
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
                style={{
                  backgroundColor: activeAction === "more" ? '#00FF66' : undefined
                }}
              >
                <MoreHorizontal size={24} />
                <span className="text-xs mt-1 font-medium">More</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Panel - Light Grey Dropdown */}
        <div className="px-6">
          <div 
            className="overflow-hidden transition-all duration-250 ease-in-out"
            style={{
              maxHeight: activeAction ? '400px' : '0px',
            }}
          >
            <div className="bg-gray-600 rounded-3xl p-6 mb-6">
              {activeAction === "edit" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold mb-4 text-white">Create Transaction</h3>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      
                      <FormField
                        control={form.control}
                        name="selectedStoneId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-gray-300">Tapt Stone (Optional)</FormLabel>
                            <Select onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} value={field.value?.toString() || ""}>
                              <FormControl>
                                <SelectTrigger className="bg-gray-700 border-gray-600 text-white rounded-lg">
                                  <SelectValue placeholder="Select tapt stone for payment" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-gray-700 border-gray-600">
                                <SelectItem value="none">No specific stone</SelectItem>
                                {taptStones.map((stone: any) => (
                                  <SelectItem key={stone.id} value={stone.id.toString()}>
                                    {stone.name} (Stone {stone.stoneNumber})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-red-300 text-xs" />
                          </FormItem>
                        )}
                      />
                      
                      <Button
                        type="submit"
                        disabled={createTransactionMutation.isPending}
                        className="w-full text-black font-semibold rounded-lg"
                        style={{ backgroundColor: '#00FF66' }}
                      >
                        {createTransactionMutation.isPending ? "Creating..." : "Create Transaction"}
                      </Button>
                    </form>
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
                  <h3 className="text-lg font-semibold mb-4 text-white">
                    {activeTab === "NFC" ? "NFC Payment" : "Share Payment"}
                  </h3>
                  
                  {activeTab === "NFC" ? (
                    // NFC Payment Options
                    <div className="space-y-4">
                      <p className="text-gray-300 mb-4">Start contactless payment for current transaction</p>
                      {currentTransaction || activeTransaction ? (
                        <div className="space-y-3">
                          <div className="bg-gray-700 rounded-lg p-3 mb-4">
                            <p className="text-white text-sm font-medium">
                              {(currentTransaction || activeTransaction).itemName}
                            </p>
                            <p className="text-gray-300 text-lg font-bold">
                              ${(currentTransaction || activeTransaction).price}
                            </p>
                          </div>
                          <Button
                            onClick={() => {
                              createNFCPayment();
                              setActiveAction(null);
                            }}
                            disabled={nfcPaymentStatus === "creating"}
                            className="w-full text-black font-semibold rounded-lg"
                            style={{ backgroundColor: '#00FF66' }}
                          >
                            {nfcPaymentStatus === "creating" ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                Starting NFC...
                              </>
                            ) : (
                              "Start NFC Payment"
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">
                          Create a transaction first to enable NFC payment
                        </div>
                      )}
                    </div>
                  ) : (
                    // QR Payment Link Sharing
                    <div>
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
                </div>
              )}

              {activeAction === "more" && (
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">More Options</h3>
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                      onClick={() => window.location.href = '/dashboard'}
                    >
                      View Dashboard
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                      onClick={() => window.location.href = '/transactions'}
                    >
                      Transaction History
                    </Button>
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

        {/* Payment Status Box - Only shows and drops down when payment is created */}
        {(currentTransaction || activeTransaction) && activeTab === "QR" ? (
          <div className="px-6 mb-6">
            {/* Small indicator that drops down from above when transaction exists */}
            <div 
              className={`backdrop-blur-xl border rounded-2xl shadow-2xl transition-all duration-700 ease-out transform ${
                (currentTransaction || activeTransaction)
                  ? "translate-y-0 opacity-100 scale-100" 
                  : "translate-y-[-60px] opacity-0 scale-90"
              }`}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'rgba(255, 255, 255, 0.20)',
                boxShadow: '0 15px 35px rgba(0, 0, 0, 0.3)',
                animationDelay: '0.2s'
              }}
            >
              <div className="text-center p-4">
                <div className="text-xs text-white/60 mb-2 font-medium">
                  Transaction #{(currentTransaction || activeTransaction).id}
                </div>
                <div className="mb-3">
                  {getPaymentStatusIndicator((currentTransaction || activeTransaction).status)}
                </div>
                <div className="text-xs text-white/50">
                  {(currentTransaction || activeTransaction).status === "pending" && "Awaiting Payment"}
                  {(currentTransaction || activeTransaction).status === "processing" && "Processing Payment..."}
                  {(currentTransaction || activeTransaction).status === "completed" && "Payment Successful"}
                  {(currentTransaction || activeTransaction).status === "failed" && "Payment Failed"}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* QR Code Dropdown Section */}
        <div className="px-6">
          {activeTab === "QR" ? (
            <div className="space-y-4">
              {/* Tapt Stone Buttons - Always show when stones exist */}
              {taptStones.map((stone: any) => (
                <div key={stone.id}>
                  <button
                    onClick={() => {
                      if (selectedStoneId === stone.id) {
                        setSelectedStoneId(null);
                        setShowQrDropdown(false);
                      } else {
                        setSelectedStoneId(stone.id);
                        setShowQrDropdown(true);
                      }
                    }}
                    className="w-full p-4 rounded-2xl text-black font-semibold shadow-lg transition-all duration-300 hover:scale-[1.02]"
                    style={{ 
                      backgroundColor: '#00FF66',
                      boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)',
                      fontFamily: 'Outfit, sans-serif'
                    }}
                  >
                    <div className="flex items-center justify-center">
                      <span className="uppercase text-center flex-1">STONE #{stone.stoneNumber}</span>
                      <ChevronDown 
                        className={`h-5 w-5 transition-transform duration-300 ${selectedStoneId === stone.id && showQrDropdown ? 'rotate-180' : ''}`} 
                      />
                    </div>
                  </button>

                  {/* QR Code Dropdown Content for selected stone */}
                  {selectedStoneId === stone.id && showQrDropdown && (
                    <div 
                      className="mt-4 backdrop-blur-xl border rounded-2xl p-6 shadow-2xl transition-all duration-500 ease-out transform"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderColor: 'rgba(255, 255, 255, 0.20)',
                        boxShadow: '0 15px 35px rgba(0, 0, 0, 0.3)',
                        animation: 'fadeIn 0.5s ease-out'
                      }}
                    >
                      <div className="text-center">
                        <div className="w-48 h-48 mx-auto mb-4 bg-white rounded-xl p-4">
                          <QRCodeDisplay 
                            merchantId={merchantId} 
                            stoneId={stone.id}
                          />
                        </div>
                        <p className="text-white/80 text-sm font-medium">
                          Scan to pay with {stone.name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add Tapt Stone Button - Show when transaction exists and less than 10 stones */}
              {(currentTransaction || activeTransaction) && taptStones.length < 10 && (
                <button
                  onClick={() => createTaptStoneMutation.mutate()}
                  disabled={createTaptStoneMutation.isPending}
                  className="w-full p-4 rounded-2xl text-black font-medium shadow-lg transition-all duration-300 hover:scale-[1.02] disabled:opacity-50"
                  style={{ 
                    backgroundColor: 'rgba(200, 200, 200, 0.3)',
                    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)',
                    fontFamily: 'Outfit, sans-serif'
                  }}
                >
                  <div className="flex items-center justify-center space-x-2">
                    {createTaptStoneMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span>Add Tapt Stone</span>
                    )}
                  </div>
                </button>
              )}

              {/* Placeholder when no transaction */}
              {!(currentTransaction || activeTransaction) && (
                <div 
                  className="backdrop-blur-xl border rounded-3xl p-8 flex items-center justify-center shadow-2xl transition-all duration-300"
                  style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div className="text-center">
                    <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4">
                      <QrCode size={64} className="text-gray-400" />
                    </div>
                    <p className="text-gray-600 text-sm">
                      Create a transaction to show QR codes
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // NFC Interface - Include stone buttons here too
            <div className="space-y-4">
              {/* Tapt Stone Buttons - Always show when stones exist */}
              {taptStones.map((stone: any) => (
                <div key={stone.id}>
                  <button
                    onClick={() => {
                      if (selectedStoneId === stone.id) {
                        setSelectedStoneId(null);
                        setShowQrDropdown(false);
                      } else {
                        setSelectedStoneId(stone.id);
                        setShowQrDropdown(true);
                      }
                    }}
                    className="w-full p-4 rounded-2xl text-black font-semibold shadow-lg transition-all duration-300 hover:scale-[1.02]"
                    style={{ 
                      backgroundColor: '#00FF66',
                      boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)',
                      fontFamily: 'Outfit, sans-serif'
                    }}
                  >
                    <div className="flex items-center justify-center">
                      <span className="uppercase text-center flex-1">STONE #{stone.stoneNumber}</span>
                      <ChevronDown 
                        className={`h-5 w-5 transition-transform duration-300 ${selectedStoneId === stone.id && showQrDropdown ? 'rotate-180' : ''}`} 
                      />
                    </div>
                  </button>

                  {/* QR Code Dropdown Content for selected stone */}
                  {selectedStoneId === stone.id && showQrDropdown && (
                    <div 
                      className="mt-4 backdrop-blur-xl border rounded-2xl p-6 shadow-2xl transition-all duration-500 ease-out transform"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderColor: 'rgba(255, 255, 255, 0.20)',
                        boxShadow: '0 15px 35px rgba(0, 0, 0, 0.3)',
                        animation: 'fadeIn 0.5s ease-out'
                      }}
                    >
                      <div className="text-center">
                        <div className="w-48 h-48 mx-auto mb-4 bg-white rounded-xl p-4">
                          <QRCodeDisplay 
                            merchantId={merchantId} 
                            stoneId={stone.id}
                          />
                        </div>
                        <p className="text-white/80 text-sm font-medium">
                          Scan to pay with {stone.name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add Tapt Stone Button - Show when transaction exists and less than 10 stones */}
              {(currentTransaction || activeTransaction) && taptStones.length < 10 && (
                <button
                  onClick={() => createTaptStoneMutation.mutate()}
                  disabled={createTaptStoneMutation.isPending}
                  className="w-full p-4 rounded-2xl text-black font-medium shadow-lg transition-all duration-300 hover:scale-[1.02] disabled:opacity-50"
                  style={{ 
                    backgroundColor: 'rgba(200, 200, 200, 0.3)',
                    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)',
                    fontFamily: 'Outfit, sans-serif'
                  }}
                >
                  <div className="flex items-center justify-center space-x-2">
                    {createTaptStoneMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span>Add Tapt Stone</span>
                    )}
                  </div>
                </button>
              )}

              {/* Placeholder when no stones */}
              {taptStones.length === 0 && (
                <div 
                  className="backdrop-blur-xl border rounded-3xl p-8 flex items-center justify-center shadow-2xl transition-all duration-300"
                  style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div className="text-center">
                    <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4">
                      <Smartphone size={64} className="text-gray-400" />
                    </div>
                    <p className="text-gray-600 text-sm">
                      Create a stone to enable NFC payments
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* NFC Payment Overlay for Mobile */}
        {showNfcOverlay && (
          <div 
            className="fixed inset-0 z-50 min-h-screen flex items-center justify-center"
            style={{ backgroundColor: '#1a1a1a' }}
          >
            {/* Small X button in top right */}
            <button
              onClick={closeNfcOverlay}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            >
              <X className="h-4 w-4 text-white/70" />
            </button>

            {/* Green liquid glass box */}
            <div 
              className="backdrop-blur-xl rounded-3xl p-12 max-w-sm w-full mx-8 text-center shadow-2xl relative"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 255, 102, 0.15) 0%, rgba(0, 255, 102, 0.08) 100%)',
                border: '1px solid rgba(0, 255, 102, 0.3)',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(0, 255, 102, 0.2)'
              }}
            >
              {nfcPaymentStatus === "ready" && (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="text-6xl font-extralight text-white tracking-tight">
                      ${nfcSession?.amount}
                    </div>
                    <div className="text-white/70 text-lg font-light">
                      {nfcSession?.itemName}
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div 
                      className="text-2xl font-light tracking-wide"
                      style={{ color: '#00FF66' }}
                    >
                      TAP CARD HERE
                    </div>
                    <div className="text-white/60 text-base">
                      Present your card or device
                    </div>
                    
                    <button
                      onClick={simulateNFCTap}
                      className="w-full mt-8 py-4 px-6 rounded-2xl text-white/90 text-sm font-light transition-all duration-200"
                      style={{
                        background: 'rgba(0, 255, 102, 0.15)',
                        border: '1px solid rgba(0, 255, 102, 0.3)'
                      }}
                    >
                      Simulate Payment
                    </button>
                  </div>
                </div>
              )}
              
              {nfcPaymentStatus === "processing" && (
                <div className="space-y-8">
                  <div className="mx-auto w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-2xl font-light text-white">Processing Payment</div>
                    <div className="text-white/60 text-base">Please wait...</div>
                  </div>
                </div>
              )}

              {nfcPaymentStatus === "completed" && (
                <div className="space-y-8">
                  <div 
                    className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(0, 255, 102, 0.2)',
                      border: '1px solid rgba(0, 255, 102, 0.4)'
                    }}
                  >
                    <CheckCircle className="h-8 w-8" style={{ color: '#00FF66' }} />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-2xl font-light text-white">Payment Successful</div>
                    <div className="text-white/60 text-base">Transaction completed</div>
                  </div>
                </div>
              )}

              {nfcPaymentStatus === "failed" && (
                <div className="space-y-8">
                  <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-2xl font-light text-white">Payment Failed</div>
                    <div className="text-white/60 text-base">Please try again</div>
                  </div>
                  
                  <button
                    onClick={resetNfcPayment}
                    className="w-full mt-6 py-4 px-6 rounded-2xl text-white/90 text-sm font-light transition-all duration-200"
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}


          </div>
          </div>
        </div>
      </>
    );
  }

  // Desktop/Non-mobile version
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="relative z-10 p-4">{/* Main content container */}

        {/* Mode Switcher */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("QR")}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === "QR"
                  ? "bg-black text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              QR
            </button>
            <button
              onClick={() => setActiveTab("NFC")}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === "NFC"
                  ? "bg-black text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              NFC
            </button>
          </div>
        </div>

        {/* Amount Box - More Rounded */}
        <div className="px-6 mb-6">
          {currentTransaction || activeTransaction ? (
            <div 
              className="rounded-3xl p-6 text-center"
              style={{ backgroundColor: '#00FF66' }}
            >
              <div className="text-black text-lg font-medium mb-2">Total</div>
              <div className="text-black text-3xl font-bold">
                ${(currentTransaction || activeTransaction).price}
              </div>
              <div className="text-black text-sm font-medium mt-2">
                {(currentTransaction || activeTransaction).itemName}
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div 
                  className="rounded-3xl p-6 text-center space-y-4"
                  style={{ backgroundColor: '#00FF66' }}
                >
                  <div className="text-black text-lg font-medium">Create Transaction</div>
                  
                  <FormField
                    control={form.control}
                    name="itemName"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            placeholder="Item name"
                            {...field}
                            className="bg-white/90 border-0 text-black placeholder:text-gray-600 rounded-xl"
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
                        <FormControl>
                          <Input
                            placeholder="0.00"
                            {...field}
                            className="bg-white/90 border-0 text-black placeholder:text-gray-600 rounded-xl text-center text-2xl font-bold"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button 
                    type="submit" 
                    disabled={createTransactionMutation.isPending}
                    className="w-full bg-black text-white hover:bg-gray-800 rounded-xl py-3 font-medium"
                  >
                    {createTransactionMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Create Transaction
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>

        {/* Action Buttons - Connected Dark Grey */}
        <div className="px-6 mb-6">
          <div className="bg-gray-800 rounded-3xl overflow-hidden">
            <button
              onClick={() => setActiveAction(activeAction === "send" ? null : "send")}
              className="w-full p-4 text-left border-b border-gray-700 hover:bg-gray-700 transition-colors duration-200 flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <Send className="w-5 h-5 text-white" />
                <span className="text-white font-medium">
                  {activeTab === "NFC" ? "NFC Payment" : "Share Payment"}
                </span>
              </div>
              <span className="text-gray-400 text-sm">→</span>
            </button>
            
            <button
              onClick={() => setActiveAction(activeAction === "split" ? null : "split")}
              className="w-full p-4 text-left border-b border-gray-700 hover:bg-gray-700 transition-colors duration-200 flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <Split className="w-5 h-5 text-white" />
                <span className="text-white font-medium">Split Bill</span>
              </div>
              <span className="text-gray-400 text-sm">→</span>
            </button>
            
            <button
              onClick={() => setActiveAction(activeAction === "more" ? null : "more")}
              className="w-full p-4 text-left hover:bg-gray-700 transition-colors duration-200 flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <MoreHorizontal className="w-5 h-5 text-white" />
                <span className="text-white font-medium">More Options</span>
              </div>
              <span className="text-gray-400 text-sm">→</span>
            </button>
          </div>

          {/* Action Panel Dropdowns - Light Grey */}
          <div className="mt-2">
            <div 
              className="overflow-hidden transition-all duration-250 ease-in-out bg-gray-600 rounded-3xl"
              style={{
                maxHeight: activeAction ? '200px' : '0px',
                opacity: activeAction ? 1 : 0
              }}
            >
              {activeAction === "send" && (
                <div className="p-6 text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">
                    {activeTab === "NFC" ? "NFC Payment" : "Share Payment"}
                  </h3>
                  
                  {activeTab === "NFC" ? (
                    // NFC Payment Options
                    <div className="space-y-4">
                      <p className="text-gray-300 text-sm mb-4">Start contactless payment for current transaction</p>
                      {currentTransaction || activeTransaction ? (
                        <div className="space-y-3">
                          <div className="bg-gray-700 rounded-lg p-3 mb-4">
                            <p className="text-white text-sm font-medium">
                              {(currentTransaction || activeTransaction).itemName}
                            </p>
                            <p className="text-gray-300 text-lg font-bold">
                              ${(currentTransaction || activeTransaction).price}
                            </p>
                          </div>
                          <Button
                            onClick={() => {
                              createNFCPayment();
                              setActiveAction(null);
                            }}
                            disabled={nfcPaymentStatus === "creating"}
                            className="w-full text-black font-semibold rounded-lg"
                            style={{ backgroundColor: '#00FF66' }}
                          >
                            {nfcPaymentStatus === "creating" ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                Starting NFC...
                              </>
                            ) : (
                              "Start NFC Payment"
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">
                          Create a transaction first to enable NFC payment
                        </div>
                      )}
                    </div>
                  ) : (
                    // QR Payment Link Sharing
                    <div>
                      <p className="text-gray-300 text-sm mb-4">Copy the payment link to share with customers</p>
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
                </div>
              )}

              {activeAction === "split" && (
                <div className="p-6 text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">Split Bill</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    Divide the payment between multiple people
                  </p>
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full border-gray-500 text-gray-200 hover:bg-gray-500"
                    >
                      Split 2 Ways
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-gray-500 text-gray-200 hover:bg-gray-500"
                    >
                      Split 3 Ways
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-gray-500 text-gray-200 hover:bg-gray-500"
                    >
                      Custom Split
                    </Button>
                  </div>
                </div>
              )}

              {activeAction === "more" && (
                <div className="p-6 text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">More Options</h3>
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full border-gray-500 text-gray-200 hover:bg-gray-500"
                      onClick={() => window.location.href = '/dashboard'}
                    >
                      View Dashboard
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-gray-500 text-gray-200 hover:bg-gray-500"
                      onClick={() => window.location.href = '/transactions'}
                    >
                      Transaction History
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-gray-500 text-gray-200 hover:bg-gray-500"
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



        {/* QR Code Dropdown Section */}
        <div className="px-6">
          {activeTab === "QR" ? (
            <div className="space-y-4">
              {/* QR Dropdown Button - Always visible when transaction exists */}
              {(currentTransaction || activeTransaction) && (
                <button
                  onClick={() => setShowQrDropdown(!showQrDropdown)}
                  className="w-full p-4 rounded-2xl text-black font-semibold shadow-lg transition-all duration-300 hover:scale-[1.02]"
                  style={{ 
                    backgroundColor: '#00FF66',
                    boxShadow: '0 8px 25px rgba(0, 255, 102, 0.3)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span>tapt stone 1</span>
                    <ChevronDown 
                      className={`h-5 w-5 transition-transform duration-300 ${showQrDropdown ? 'rotate-180' : ''}`} 
                    />
                  </div>
                </button>
              )}

              {/* QR Code Dropdown Content */}
              {showQrDropdown && (currentTransaction || activeTransaction) && (
                <div 
                  className="backdrop-blur-xl border rounded-2xl p-6 shadow-2xl transition-all duration-500 ease-out transform"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0, 255, 102, 0.15) 0%, rgba(0, 255, 102, 0.08) 100%)',
                    borderColor: 'rgba(0, 255, 102, 0.3)',
                    boxShadow: '0 15px 35px rgba(0, 255, 102, 0.2)',
                    animation: 'fadeIn 0.5s ease-out'
                  }}
                >
                  <div className="text-center">
                    <div className="w-48 h-48 mx-auto mb-4 bg-white rounded-xl p-4">
                      <QRCodeDisplay 
                        merchantId={merchantId} 
                      />
                    </div>
                    <p className="text-white/80 text-sm font-medium">
                      Scan to pay with any device
                    </p>
                  </div>
                </div>
              )}

              {/* Placeholder when no transaction */}
              {!(currentTransaction || activeTransaction) && (
                <div 
                  className="backdrop-blur-xl border rounded-3xl p-8 flex items-center justify-center shadow-2xl transition-all duration-300"
                  style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  <div className="text-center">
                    <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4">
                      <QrCode size={64} className="text-gray-400" />
                    </div>
                    <p className="text-gray-600 text-sm">
                      Create a transaction to show QR code
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // NFC Interface - Completely empty, functionality moved to Send button
            <div className="h-48"></div>
          )}
        </div>

        {/* NFC Payment Overlay */}
        {showNfcOverlay && (
          <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm">
            <div className="min-h-screen flex items-center justify-center p-8">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-12 max-w-md w-full text-center backdrop-blur-xl shadow-2xl relative">
                
                {nfcPaymentStatus === "ready" && (
                  <div className="space-y-12">
                    <button
                      onClick={closeNfcOverlay}
                      className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                    >
                      <X className="h-5 w-5 text-white/70" />
                    </button>
                    
                    <div className="mx-auto w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Waves className="h-8 w-8 text-white/80" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-5xl font-extralight text-white tracking-tight">${nfcSession?.amount}</div>
                      <div className="text-white/60 text-lg font-light">{nfcSession?.itemName}</div>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="text-white/80 text-xl font-light">Tap to Pay</div>
                      <div className="text-white/50 text-sm">Present card or device to terminal</div>
                      
                      <button
                        onClick={simulateNFCTap}
                        className="w-full mt-8 py-4 px-6 bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl text-white/90 text-sm font-light transition-all duration-200 hover:border-white/30"
                      >
                        Simulate Payment
                      </button>
                    </div>
                  </div>
                )}
                
                {nfcPaymentStatus === "processing" && (
                  <div className="space-y-12">
                    <div className="mx-auto w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-2xl font-light text-white">Processing Payment</div>
                      <div className="text-white/60 text-sm">Please wait...</div>
                    </div>
                  </div>
                )}

                {nfcPaymentStatus === "completed" && (
                  <div className="space-y-12">
                    <div className="mx-auto w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                      <CheckCircle className="h-8 w-8 text-green-400" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-2xl font-light text-white">Payment Successful</div>
                      <div className="text-white/60 text-sm">Transaction completed</div>
                    </div>
                  </div>
                )}

                {nfcPaymentStatus === "failed" && (
                  <div className="space-y-12">
                    <div className="mx-auto w-20 h-20 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                      <XCircle className="h-8 w-8 text-red-400" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-2xl font-light text-white">Payment Failed</div>
                      <div className="text-white/60 text-sm">Please try again</div>
                    </div>
                    
                    <button
                      onClick={resetNfcPayment}
                      className="w-full py-4 px-6 bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl text-white/90 text-sm font-light transition-all duration-200 hover:border-white/30"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* NFC Payment Overlay for Desktop */}
        {showNfcOverlay && (
          <div 
            className="fixed inset-0 z-50 min-h-screen flex items-center justify-center"
            style={{ backgroundColor: '#1a1a1a' }}
          >
            {/* Small X button in top right */}
            <button
              onClick={closeNfcOverlay}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            >
              <X className="h-4 w-4 text-white/70" />
            </button>

            {/* Green liquid glass box */}
            <div 
              className="backdrop-blur-xl rounded-3xl p-16 max-w-lg w-full mx-8 text-center shadow-2xl relative"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 255, 102, 0.15) 0%, rgba(0, 255, 102, 0.08) 100%)',
                border: '1px solid rgba(0, 255, 102, 0.3)',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(0, 255, 102, 0.2)'
              }}
            >
              {nfcPaymentStatus === "ready" && (
                <div className="space-y-10">
                  <div className="space-y-4">
                    <div className="text-7xl font-extralight text-white tracking-tight">
                      ${nfcSession?.amount}
                    </div>
                    <div className="text-white/70 text-xl font-light">
                      {nfcSession?.itemName}
                    </div>
                  </div>
                  
                  <div className="space-y-8">
                    <div 
                      className="text-3xl font-light tracking-wide"
                      style={{ color: '#00FF66' }}
                    >
                      TAP CARD HERE
                    </div>
                    <div className="text-white/60 text-lg">
                      Present your card or device
                    </div>
                    
                    <button
                      onClick={simulateNFCTap}
                      className="w-full mt-8 py-4 px-8 rounded-2xl text-white/90 text-base font-light transition-all duration-200"
                      style={{
                        background: 'rgba(0, 255, 102, 0.15)',
                        border: '1px solid rgba(0, 255, 102, 0.3)'
                      }}
                    >
                      Simulate Payment
                    </button>
                  </div>
                </div>
              )}
              
              {nfcPaymentStatus === "processing" && (
                <div className="space-y-10">
                  <div className="mx-auto w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <Loader2 className="h-10 w-10 text-white/80 animate-spin" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-3xl font-light text-white">Processing Payment</div>
                    <div className="text-white/60 text-lg">Please wait...</div>
                  </div>
                </div>
              )}

              {nfcPaymentStatus === "completed" && (
                <div className="space-y-10">
                  <div 
                    className="mx-auto w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(0, 255, 102, 0.2)',
                      border: '1px solid rgba(0, 255, 102, 0.4)'
                    }}
                  >
                    <CheckCircle className="h-10 w-10" style={{ color: '#00FF66' }} />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-3xl font-light text-white">Payment Successful</div>
                    <div className="text-white/60 text-lg">Transaction completed</div>
                  </div>
                </div>
              )}

              {nfcPaymentStatus === "failed" && (
                <div className="space-y-10">
                  <div className="mx-auto w-20 h-20 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                    <XCircle className="h-10 w-10 text-red-400" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-3xl font-light text-white">Payment Failed</div>
                    <div className="text-white/60 text-lg">Please try again</div>
                  </div>
                  
                  <button
                    onClick={resetNfcPayment}
                    className="w-full mt-8 py-4 px-8 rounded-2xl text-white/90 text-base font-light transition-all duration-200"
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}