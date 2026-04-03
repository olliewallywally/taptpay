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
import { EnhancedPaymentStatus } from "@/components/enhanced-payment-status";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { useDeviceStatusMonitoring, useSSEConnectionMonitoring } from "@/components/notification-system";
import { getCurrentMerchantId } from "@/lib/auth";
import { Send, Loader2, CheckCircle, Clock, XCircle, QrCode, Smartphone, Edit, Split, MoreHorizontal, Menu, X, Waves, ChevronDown, Copy, CreditCard } from "lucide-react";
import { Link } from "wouter";
import { isNativeIOS, canTapToPay } from "@/lib/native";

const transactionFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Please enter a valid price (e.g., 4.50)"),
  selectedStoneId: z.number().optional(),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

export default function MerchantTerminalMobile() {
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<"QR" | "NFC" | "TAP">("QR");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [qrCollapsed, setQrCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  // NFC-specific states
  const [nfcCapabilities, setNfcCapabilities] = useState<any>(null);
  const [nfcPaymentStatus, setNfcPaymentStatus] = useState<"idle" | "creating" | "ready" | "processing" | "completed" | "failed">("idle");
  const [nfcSession, setNfcSession] = useState<any>(null);
  const [showNfcOverlay, setShowNfcOverlay] = useState(false);
  const [showQrDropdown, setShowQrDropdown] = useState(false);
  
  // Tap to Pay states
  const [tapToPayStatus, setTapToPayStatus] = useState<"idle" | "waiting" | "processing" | "completed" | "failed">("idle");
  const [tapToPayApproved, setTapToPayApproved] = useState<boolean | null>(null);
  const [showTapToPayOverlay, setShowTapToPayOverlay] = useState(false);
  
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
  const { data: taptStones = [], isLoading: taptStonesLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/tapt-stones`);
      if (!response.ok) throw new Error("Failed to fetch tapt stones");
      return response.json();
    },
  });

  // Debug logging
  useEffect(() => {
    console.log("Tapt Stones Debug:", { 
      taptStones, 
      taptStonesLoading, 
      activeTab,
      activeAction,
      showingStonesSection: !activeAction && activeTab === "QR"
    });
  }, [taptStones, taptStonesLoading, activeTab, activeAction]);

  // Set default selected stone when stones are loaded
  useEffect(() => {
    if (taptStones.length > 0 && selectedStoneId === null) {
      setSelectedStoneId(taptStones[0].id);
    }
  }, [taptStones, selectedStoneId]);

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

  // Device status monitoring
  useDeviceStatusMonitoring();
  useSSEConnectionMonitoring(merchantId);

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

  // Tap to Pay (Paywave) — iOS native bridge
  const startTapToPayPayment = async () => {
    const transaction = currentTransaction || activeTransaction;
    if (!transaction) {
      toast({ title: "No Transaction", description: "Create a transaction first.", variant: "destructive" });
      return;
    }

    setTapToPayStatus("waiting");
    setTapToPayApproved(null);
    setShowTapToPayOverlay(true);

    try {
      let bridgeResult: { approved: boolean; token?: string; cancelled?: boolean; error?: string };

      if (canTapToPay()) {
        bridgeResult = await window.TaptPay!.startTapToPay({
          amount: parseFloat(transaction.price),
          currency: "NZD",
          merchantName: merchant?.businessName || "TaptPay",
        });
      } else if (import.meta.env.DEV) {
        // Dev-only simulation fallback — native bridge not available in browser preview
        await new Promise(r => setTimeout(r, 2000));
        bridgeResult = { approved: true, token: `SIM_TOKEN_${Date.now()}` };
      } else {
        // Production: bridge is required — Paywave should only be accessible in the iOS app
        setTapToPayStatus("idle");
        setShowTapToPayOverlay(false);
        toast({ title: "Not available", description: "Tap to Pay requires the TaptPay iOS app.", variant: "destructive" });
        return;
      }

      if (bridgeResult.cancelled) {
        setTapToPayStatus("idle");
        setShowTapToPayOverlay(false);
        toast({ title: "Cancelled", description: "Tap to Pay was cancelled." });
        return;
      }

      setTapToPayStatus("processing");
      const authToken = localStorage.getItem("authToken");
      const response = await fetch("/api/transactions/tap-to-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          merchantId,
          transactionId: transaction.id,
          amount: parseFloat(transaction.price),
          windcaveToken: bridgeResult.token,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Processor error (${response.status})`);
      }

      const data = await response.json();
      setTapToPayApproved(data.approved);
      setTapToPayStatus(data.approved ? "completed" : "failed");
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });

      setTimeout(() => {
        setShowTapToPayOverlay(false);
        setTapToPayStatus("idle");
        setTapToPayApproved(null);
      }, 3500);
    } catch (err: any) {
      console.error("Tap to Pay error:", err);
      setTapToPayStatus("failed");
      setTapToPayApproved(false);
      toast({ title: "Payment error", description: err?.message || "Tap to Pay failed", variant: "destructive" });
    }
  };

  const closeTapToPayOverlay = () => {
    setShowTapToPayOverlay(false);
    setTapToPayStatus("idle");
    setTapToPayApproved(null);
  };

  const getPaymentStatusIndicator = (status: string) => {
    return (
      <div className="flex items-center justify-center">
        {status === "pending" && (
          <div className="relative w-12 h-10">
            {/* Static ring for pending */}
            <div className="absolute inset-0 rounded-full border-3 border-[#00FF66]/40"></div>
            <Clock className="absolute inset-2 w-8 h-8 text-[#00FF66]/70" />
          </div>
        )}
        
        {status === "processing" && (
          <div className="relative w-12 h-10">
            {/* Animated ring only when processing */}
            <div className="absolute inset-0 rounded-full border-3 border-[#00FF66]/30"></div>
            <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-[#00FF66] animate-spin duration-700"></div>
          </div>
        )}
        
        {status === "completed" && (
          <div className="relative w-12 h-10 flex items-center justify-center">
            {/* Success tick with smooth transition */}
            <div className="absolute inset-0 rounded-full border-3 border-[#00FF66] animate-[fadeIn_0.5s_ease-in-out]"></div>
            <CheckCircle className="w-6 h-6 text-[#00FF66] animate-[scaleIn_0.5s_ease-in-out]" />
          </div>
        )}
        
        {status === "failed" && (
          <div className="relative w-12 h-10 flex items-center justify-center">
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
          className={`fixed right-0 top-0 h-full w-80 bg-gray-800 border-l border-gray-700 z-50 transform transition-transform duration-300 ease-in-out ${
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="p-6">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-white">Menu</h2>
              <button onClick={() => setMenuOpen(false)} className="text-white/70 hover:text-white">
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="space-y-2">
              <a href="/dashboard" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
                Dashboard
              </a>
              <a href="/merchant" className="block py-3 px-4 text-[#00CC52] rounded-xl font-medium">
                Terminal
              </a>
              <a href="/transactions" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
                Transactions
              </a>
              <a href="/settings" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
                Settings
              </a>
              <div className="pt-4 mt-4 border-t border-gray-600">
                <button 
                  onClick={() => {
                    localStorage.removeItem('auth-token');
                    window.location.href = '/login';
                  }}
                  className="block w-full text-left py-3 px-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
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
          <div className="fixed top-4 left-4 z-30">
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
            {isNativeIOS() && (
              <button
                onClick={() => setActiveTab("TAP")}
                className={`px-4 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-1 ${
                  activeTab === "TAP"
                    ? "bg-black text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <Waves size={14} />
                Paywave
              </button>
            )}
          </div>
        </div>

        {/* Enhanced Payment Status */}
        <div className="px-6 mb-6">
          {currentTransaction || activeTransaction ? (
            <EnhancedPaymentStatus 
              transaction={currentTransaction || activeTransaction}
              className="border-2 border-green-400"
            />
          ) : (
            <div 
              className="rounded-3xl p-6 text-center border-2 border-dashed"
              style={{ borderColor: '#00FF66' }}
              data-testid="no-transaction-placeholder"
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
              maxHeight: activeAction ? '70vh' : '0px',
            }}
          >
            <div className="bg-gray-600 rounded-3xl p-6 mb-4">
              {activeAction === "edit" && (
                <div className="space-y-2">
                  <h3 className="text-base font-semibold mb-2 text-white">Create Transaction</h3>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
                      <FormField
                        control={form.control}
                        name="itemName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-gray-300">Item Name</FormLabel>
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
                            <FormLabel className="text-xs font-medium text-gray-300">Price ($)</FormLabel>
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
                            <FormLabel className="text-xs font-medium text-gray-300">Tapt Stone (Optional)</FormLabel>
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
                  <h3 className="text-base font-semibold mb-2 text-white">Split the Bill</h3>
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
                        className="w-12 h-10 rounded-full font-semibold transition-colors text-black"
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
                  <h3 className="text-base font-semibold mb-2 text-white">
                    {activeTab === "NFC" ? "NFC Payment" : "Share Payment"}
                  </h3>
                  
                  {activeTab === "NFC" ? (
                    // NFC Payment Options
                    <div className="space-y-2">
                      <p className="text-gray-300 mb-4">Start contactless payment for current transaction</p>
                      {currentTransaction || activeTransaction ? (
                        <div className="space-y-3">
                          <div className="bg-gray-700 rounded-lg p-3 mb-4">
                            <p className="text-white text-xs font-medium">
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
                    <div className="space-y-4">
                      <p className="text-gray-300 mb-4">Copy the payment link to share with customers</p>
                      
                      {/* Stone Selection */}
                      {taptStones && taptStones.length > 0 && (
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-gray-300 text-center">
                            Select Tapt Stone:
                          </label>
                          <div className="grid grid-cols-1 gap-2">
                            {taptStones.map((stone: any) => {
                              const universalUrl = stone.paymentUrl
                                ? stone.paymentUrl.replace(/\/pay\//, "/nfc/")
                                : stone.paymentUrl;
                              return (
                                <button
                                  key={stone.id}
                                  onClick={() => {
                                    navigator.clipboard.writeText(universalUrl);
                                    setCopiedLink(true);
                                    setTimeout(() => setCopiedLink(false), 2000);
                                    toast({
                                      title: "Link Copied",
                                      description: `${stone.name} link copied — use this for the NFC tag and sharing`,
                                    });
                                    setActiveAction(null);
                                  }}
                                  className="w-full p-3 rounded-lg text-sm font-medium transition-colors text-black"
                                  style={{ backgroundColor: '#00FF66' }}
                                >
                                  Copy {stone.name} Link
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Fallback for no stones */}
                      {(!taptStones || taptStones.length === 0) && (
                        <Button
                          onClick={() => {
                            if (merchant) {
                              const universalUrl = merchant.paymentUrl
                                ? merchant.paymentUrl.replace(/\/pay\//, "/nfc/")
                                : merchant.paymentUrl;
                              navigator.clipboard.writeText(universalUrl);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                              toast({
                                title: "Link Copied",
                                description: "Payment link copied — use this for NFC tag and sharing",
                              });
                            }
                            setActiveAction(null);
                          }}
                          className="w-full text-black font-semibold rounded-lg"
                          style={{ backgroundColor: '#00FF66' }}
                        >
                          {copiedLink ? "Copied!" : "Copy Payment Link"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeAction === "more" && (
                <div className="text-center">
                  <h3 className="text-base font-semibold mb-2 text-white">More Options</h3>
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

        {/* QR Code Stone Selection Section - Always visible on QR tab */}
        {activeTab === "QR" && (
          <div className="px-6 pb-32" style={{ minHeight: '400px' }}>
            <div
              className="rounded-2xl p-4 transition-all duration-300 mt-4"
              style={{ backgroundColor: '#00FF66' }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-center text-black cursor-pointer relative"
                onClick={() => setQrCollapsed(prev => !prev)}
              >
                <h3 className="text-lg font-semibold">QR Codes</h3>
                <ChevronDown
                  className={`absolute right-0 transition-transform duration-300 ${qrCollapsed ? '' : 'rotate-180'}`}
                  size={20}
                />
              </div>

              {/* Collapsible Content */}
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  qrCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100 mt-4'
                }`}
              >
                <div className="bg-white rounded-xl p-4 space-y-4">
                  {/* Individual Stone QR Code Boxes */}
                  {taptStones && taptStones.length > 0 && taptStones.map((stone: any) => (
                    <div 
                      key={stone.id}
                      className="bg-gray-100 rounded-xl p-6"
                    >
                      {/* Stone Header */}
                      <div className="text-center mb-6">
                        <h3 className="text-base font-semibold text-black">Stone #{stone.stoneNumber}</h3>
                      </div>

                      {/* QR Code Container */}
                      <div className="text-center mb-4">
                        <div className="w-40 h-40 mx-auto bg-white rounded-lg p-3 border shadow-sm">
                          <QRCodeDisplay 
                            merchantId={merchantId} 
                            stoneId={stone.id}
                          />
                        </div>
                      </div>

                      {/* Download Button - Separate line */}
                      <div className="text-center mb-4">
                        <button
                          onClick={async () => {
                            try {
                              const downloadUrl = `/api/merchants/${merchantId}/stone/${stone.id}/qr?size=800&download=true`;
                              const response = await fetch(downloadUrl);
                              if (!response.ok) throw new Error('Failed to fetch QR code');
                              
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `tapt-payment-qr-stone-${stone.stoneNumber}.png`;
                              document.body.appendChild(link);
                              link.click();
                              
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                              
                              toast({
                                title: "QR Code Downloaded",
                                description: `Stone ${stone.stoneNumber} QR code saved to downloads`,
                              });
                            } catch (error) {
                              toast({
                                title: "Download Failed",
                                description: "Could not download QR code. Please try again.",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
                        >
                          Download QR Code
                        </button>
                      </div>

                      {/* Description Text - Separate line */}
                      <div className="text-center">
                        <p className="text-gray-600 text-sm leading-relaxed">
                          Scan to pay with {stone.name}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Add Tapt Stone Button - Show when transaction exists and less than 10 stones */}
                  {(currentTransaction || activeTransaction) && taptStones.length < 10 && (
                    <button
                      onClick={() => createTaptStoneMutation.mutate()}
                      disabled={createTaptStoneMutation.isPending}
                      className="w-full p-3 rounded-xl text-black font-medium transition-all duration-300 hover:scale-[1.02] disabled:opacity-50"
                      style={{ 
                        backgroundColor: 'rgba(200, 200, 200, 0.5)',
                      }}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        {createTaptStoneMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <span className="text-sm">Add Tapt Stone</span>
                        )}
                      </div>
                    </button>
                  )}

                  {/* Placeholder when no stones */}
                  {taptStones.length === 0 && (
                    <div className="bg-gray-100 rounded-xl p-6 text-center">
                      <div className="w-24 h-24 bg-gray-200 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Smartphone size={32} className="text-gray-400" />
                      </div>
                      <p className="text-gray-600 text-xs">
                        Create a stone to enable NFC payments
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* NFC Section */}
        {activeTab === "NFC" && (
          <div className="px-6 pb-32" style={{ minHeight: '400px' }}>
            <div
              className="rounded-2xl p-4 transition-all duration-300 mt-4"
              style={{ backgroundColor: '#00FF66' }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between text-black cursor-pointer"
                onClick={() => setQrCollapsed(prev => !prev)}
              >
                <h3 className="text-lg font-semibold">NFC Stones</h3>
                <ChevronDown
                  className={`transition-transform duration-300 ${qrCollapsed ? '' : 'rotate-180'}`}
                  size={20}
                />
              </div>

              {/* Collapsible Content */}
              <div
                className={`grid transition-all duration-300 overflow-hidden ${
                  qrCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100 mt-4'
                }`}
              >
                <div className="bg-white rounded-xl p-4">
                    {/* Individual Stone Buttons for NFC */}
                    {taptStones.map((stone: any) => (
                      <div key={stone.id} className="space-y-3">
                        {/* Stone Button */}
                        <button
                          onClick={() => setSelectedStoneId(selectedStoneId === stone.id ? null : stone.id)}
                          className="w-full p-4 rounded-2xl text-black font-semibold shadow-lg transition-all duration-300 hover:scale-[1.02]"
                          style={{ 
                            backgroundColor: '#00FF66',
                            boxShadow: '0 8px 25px rgba(0, 255, 102, 0.3)'
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span>Stone #{stone.stoneNumber}</span>
                            <ChevronDown 
                              className={`h-5 w-5 transition-transform duration-300 ${selectedStoneId === stone.id ? 'rotate-180' : ''}`} 
                            />
                          </div>
                        </button>

                        {/* Stone NFC Interface */}
                        {selectedStoneId === stone.id && (
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
                              <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4 mx-auto">
                                <Smartphone size={64} className="text-gray-400" />
                              </div>
                              <p className="text-gray-600 text-sm">
                                Create a transaction for NFC payment
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Placeholder when no stones */}
                    {taptStones.length === 0 && (
                      <div className="text-center">
                        <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4 mx-auto">
                          <QrCode size={64} className="text-gray-400" />
                        </div>
                        <p className="text-gray-600 text-sm">
                          No tapt stones available
                        </p>
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tap to Pay (Paywave) Section — iOS only */}
        {activeTab === "TAP" && isNativeIOS() && (
          <div className="px-6 pb-32" style={{ minHeight: '400px' }}>
            <div
              className="rounded-2xl p-6 transition-all duration-300 mt-4"
              style={{ backgroundColor: '#00FF66' }}
            >
              <div className="flex items-center justify-center gap-2 text-black mb-4">
                <Waves size={22} />
                <h3 className="text-lg font-semibold">Paywave</h3>
              </div>

              <div className="bg-white rounded-xl p-6">
                {(currentTransaction || activeTransaction) ? (
                  <div className="text-center space-y-4">
                    <div className="text-gray-500 text-sm font-medium">
                      {(currentTransaction || activeTransaction).itemName}
                    </div>
                    <div className="text-4xl font-bold text-black">
                      ${parseFloat((currentTransaction || activeTransaction).price).toFixed(2)}
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      Hold your iPhone near the customer's card or device to collect payment.
                    </p>
                    <button
                      onClick={startTapToPayPayment}
                      className="w-full py-4 rounded-2xl text-black font-semibold text-base transition-all duration-200 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#00FF66', boxShadow: '0 4px 15px rgba(0,255,102,0.4)' }}
                    >
                      <CreditCard size={20} />
                      Start Paywave Payment
                    </button>
                  </div>
                ) : (
                  <div className="text-center space-y-3 py-4">
                    <CreditCard size={48} className="text-gray-300 mx-auto" />
                    <p className="text-gray-500 text-sm">Create a transaction to enable Paywave</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tap to Pay Overlay */}
        {showTapToPayOverlay && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: '#0a0a0a' }}
          >
            <button
              onClick={closeTapToPayOverlay}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            >
              <X className="h-4 w-4 text-white/70" />
            </button>

            <div
              className="backdrop-blur-xl rounded-3xl p-12 max-w-sm w-full mx-8 text-center shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 255, 102, 0.12) 0%, rgba(0, 255, 102, 0.05) 100%)',
                border: '1px solid rgba(0, 255, 102, 0.3)',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(0, 255, 102, 0.2)',
              }}
            >
              {tapToPayStatus === "waiting" && (
                <div className="space-y-8">
                  <div
                    className="mx-auto w-24 h-24 rounded-full flex items-center justify-center"
                    style={{ border: '2px solid rgba(0,255,102,0.4)', background: 'rgba(0,255,102,0.08)' }}
                  >
                    <Waves className="w-10 h-10 animate-pulse" style={{ color: '#00FF66' }} />
                  </div>
                  <div className="space-y-2">
                    <div className="text-2xl font-light text-white">Hold to Card</div>
                    <div className="text-white/60 text-base">Hold the top of your iPhone near the customer's card or device</div>
                  </div>
                </div>
              )}

              {tapToPayStatus === "processing" && (
                <div className="space-y-8">
                  <div className="mx-auto w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-2xl font-light text-white">Processing</div>
                    <div className="text-white/60 text-base">Please wait...</div>
                  </div>
                </div>
              )}

              {tapToPayStatus === "completed" && (
                <div className="space-y-8">
                  <div
                    className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0, 255, 102, 0.2)', border: '1px solid rgba(0, 255, 102, 0.4)' }}
                  >
                    <CheckCircle className="h-8 w-8" style={{ color: '#00FF66' }} />
                  </div>
                  <div className="space-y-2">
                    <div className="text-2xl font-light text-white">Payment Approved</div>
                    <div className="text-white/60 text-base">Transaction complete</div>
                  </div>
                </div>
              )}

              {tapToPayStatus === "failed" && (
                <div className="space-y-8">
                  <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-2xl font-light text-white">Payment Declined</div>
                    <div className="text-white/60 text-base">Please try again or use another method</div>
                  </div>
                  <button
                    onClick={closeTapToPayOverlay}
                    className="w-full py-4 px-6 rounded-2xl text-white/90 text-sm font-light"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

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
                  <div className="space-y-2">
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

        {/* Enhanced Payment Status - Mobile */}
        <div className="px-6 mb-6">
          {currentTransaction || activeTransaction ? (
            <EnhancedPaymentStatus 
              transaction={currentTransaction || activeTransaction}
              className="border-2 border-green-400"
            />
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div 
                  className="rounded-3xl p-6 text-center space-y-2"
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
            <div className="bg-gray-600 rounded-3xl p-4 mb-3">
              {activeAction === "edit" && (
                <div className="space-y-2">
                  <h3 className="text-base font-semibold mb-2 text-white">Create Transaction</h3>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
                      <FormField
                        control={form.control}
                        name="itemName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-gray-300">Item Name</FormLabel>
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
                            <FormLabel className="text-xs font-medium text-gray-300">Price ($)</FormLabel>
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
                            <FormLabel className="text-xs font-medium text-gray-300">Tapt Stone (Optional)</FormLabel>
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
                  <h3 className="text-base font-semibold mb-2 text-white">Split the Bill</h3>
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
                        className="w-12 h-10 rounded-full font-semibold transition-colors text-black"
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
                  <h3 className="text-base font-semibold mb-2 text-white">
                    {activeTab === "NFC" ? "NFC Payment" : "Share Payment"}
                  </h3>
                  
                  {activeTab === "NFC" ? (
                    // NFC Payment Options
                    <div className="space-y-2">
                      <p className="text-gray-300 text-sm mb-4">Start contactless payment for current transaction</p>
                      {currentTransaction || activeTransaction ? (
                        <div className="space-y-3">
                          <div className="bg-gray-700 rounded-lg p-3 mb-4">
                            <p className="text-white text-xs font-medium">
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
                    <div className="space-y-2">
                      <p className="text-gray-300 text-sm mb-4">Select a tapt stone and share its payment link</p>
                      
                      {/* Stone Selection */}
                      <div className="text-left">
                        <label className="text-xs font-medium text-gray-300 block mb-2">Select Tapt Stone</label>
                        <select
                          value={selectedStoneId || ''}
                          onChange={(e) => setSelectedStoneId(e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3"
                        >
                          <option value="">Select a stone</option>
                          {taptStones.map((stone: any) => (
                            <option key={stone.id} value={stone.id}>
                              {stone.name} (Stone {stone.stoneNumber})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Payment Link Display */}
                      {selectedStoneId && (
                        <div className="bg-gray-700 rounded-lg p-4 text-left">
                          <label className="text-xs font-medium text-gray-300 block mb-2">Payment Link</label>
                          <div className="bg-gray-800 rounded-lg p-3 mb-3">
                            <code className="text-green-400 text-sm break-all">
                              {(() => {
                                const selectedStone = taptStones.find((s: any) => s.id === selectedStoneId);
                                return selectedStone?.paymentUrl || `${window.location.origin}/pay/${merchantId}/stone/${selectedStoneId}`;
                              })()}
                            </code>
                          </div>
                          <Button
                            onClick={() => {
                              const selectedStone = taptStones.find((s: any) => s.id === selectedStoneId);
                              const paymentUrl = selectedStone?.paymentUrl || `${window.location.origin}/pay/${merchantId}/stone/${selectedStoneId}`;
                              navigator.clipboard.writeText(paymentUrl);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                              toast({
                                title: "Payment Link Copied",
                                description: `Link for ${selectedStone?.name} copied to clipboard`,
                              });
                            }}
                            className="w-full text-black font-semibold rounded-lg"
                            style={{ backgroundColor: '#00FF66' }}
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            {copiedLink ? "Copied!" : "Copy Payment Link"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeAction === "more" && (
                <div className="text-center">
                  <h3 className="text-base font-semibold mb-2 text-white">More Options</h3>
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
                      onClick={() => window.location.href = '/settings'}
                    >
                      Settings
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
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
                  <div className="space-y-2">
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