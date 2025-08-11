import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QRCodeDisplay } from "@/components/qr-code-display";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { Send, Loader2, CheckCircle, Clock, XCircle, QrCode, Smartphone, Edit, Split, MoreHorizontal, Menu, X, Waves } from "lucide-react";
import { Link } from "wouter";

const transactionFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Please enter a valid price (e.g., 4.50)"),
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
    switch (status) {
      case "pending":
        return (
          <div className="relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-blue-500/10 animate-pulse rounded-2xl"></div>
            
            {/* Scanning Lines Effect */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent animate-[scan_2s_ease-in-out_infinite] transform -translate-x-full"></div>
            </div>
            
            <div className="relative flex flex-col items-center space-y-4 p-6 bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-blue-500/20 backdrop-blur-sm border border-cyan-400/30 rounded-2xl shadow-[0_0_30px_rgba(0,255,255,0.3)]">
              {/* Pulsing Icon */}
              <div className="relative">
                <div className="absolute inset-0 bg-cyan-400/30 rounded-full animate-ping"></div>
                <div className="relative p-3 bg-cyan-500/20 rounded-full border border-cyan-400/40">
                  <Waves className="w-6 h-6 text-cyan-300 animate-pulse" />
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-lg font-bold text-cyan-200 mb-1 animate-pulse">
                  PAYMENT READY
                </div>
                <div className="text-sm text-cyan-300/80 tracking-wide">
                  Waiting for customer...
                </div>
              </div>
              
              {/* Progress Dots */}
              <div className="flex space-x-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"
                    style={{ animationDelay: `${i * 0.3}s` }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        );
        
      case "processing":
        return (
          <div className="relative overflow-hidden">
            {/* Electric Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-yellow-500/20 to-orange-500/20 animate-pulse rounded-2xl"></div>
            
            {/* Lightning Effect */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-[lightning_1s_ease-in-out_infinite]"></div>
              <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-l from-transparent via-orange-400 to-transparent animate-[lightning_1s_ease-in-out_infinite] animation-delay-500"></div>
            </div>
            
            <div className="relative flex flex-col items-center space-y-4 p-6 bg-gradient-to-br from-orange-500/20 via-yellow-500/10 to-orange-500/20 backdrop-blur-sm border border-yellow-400/40 rounded-2xl shadow-[0_0_40px_rgba(255,165,0,0.4)]">
              {/* Spinning Processing Icon */}
              <div className="relative">
                <div className="absolute inset-0 bg-yellow-400/30 rounded-full animate-spin"></div>
                <div className="relative p-3 bg-orange-500/20 rounded-full border border-yellow-400/50">
                  <Loader2 className="w-6 h-6 text-yellow-300 animate-spin" />
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-lg font-bold text-yellow-200 mb-1 animate-bounce">
                  PROCESSING...
                </div>
                <div className="text-sm text-orange-300/80 tracking-wide">
                  Securing transaction
                </div>
              </div>
              
              {/* Loading Bar */}
              <div className="w-32 h-2 bg-black/30 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-orange-400 to-yellow-400 animate-[loading_2s_ease-in-out_infinite] rounded-full"></div>
              </div>
            </div>
          </div>
        );
        
      case "completed":
        return (
          <div className="relative overflow-hidden">
            {/* Success Burst */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/30 via-emerald-400/30 to-green-500/30 animate-pulse rounded-2xl"></div>
            
            {/* Celebration Particles */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 bg-emerald-400 rounded-full animate-[particle_2s_ease-out_infinite]"
                  style={{
                    left: `${20 + i * 10}%`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                ></div>
              ))}
            </div>
            
            <div className="relative flex flex-col items-center space-y-4 p-6 bg-gradient-to-br from-green-500/30 via-emerald-500/20 to-green-500/30 backdrop-blur-sm border border-emerald-400/50 rounded-2xl shadow-[0_0_50px_rgba(0,255,100,0.5)]">
              {/* Success Checkmark */}
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-400/40 rounded-full animate-ping"></div>
                <div className="relative p-3 bg-green-500/30 rounded-full border border-emerald-400/60">
                  <CheckCircle className="w-6 h-6 text-emerald-300 animate-bounce" />
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-200 mb-1 animate-pulse">
                  PAYMENT SUCCESS! 🎉
                </div>
                <div className="text-sm text-green-300/80 tracking-wide">
                  Transaction completed
                </div>
              </div>
              
              {/* Success Ripple */}
              <div className="relative">
                <div className="w-16 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-[ripple_1s_ease-out_infinite]"></div>
              </div>
            </div>
          </div>
        );
        
      case "failed":
        return (
          <div className="relative overflow-hidden">
            {/* Error Flash */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-pink-500/20 to-red-500/20 animate-pulse rounded-2xl"></div>
            
            {/* Warning Lines */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute top-2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-red-400 to-transparent animate-[warning_1.5s_ease-in-out_infinite]"></div>
              <div className="absolute bottom-2 right-0 w-full h-0.5 bg-gradient-to-l from-transparent via-red-400 to-transparent animate-[warning_1.5s_ease-in-out_infinite] animation-delay-750"></div>
            </div>
            
            <div className="relative flex flex-col items-center space-y-4 p-6 bg-gradient-to-br from-red-500/20 via-pink-500/10 to-red-500/20 backdrop-blur-sm border border-red-400/40 rounded-2xl shadow-[0_0_30px_rgba(255,0,0,0.3)]">
              {/* Error Icon */}
              <div className="relative">
                <div className="absolute inset-0 bg-red-400/30 rounded-full animate-pulse"></div>
                <div className="relative p-3 bg-red-500/20 rounded-full border border-red-400/50">
                  <XCircle className="w-6 h-6 text-red-300 animate-pulse" />
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-lg font-bold text-red-200 mb-1 animate-pulse">
                  PAYMENT FAILED
                </div>
                <div className="text-sm text-red-300/80 tracking-wide">
                  Please try again
                </div>
              </div>
              
              {/* Error indicator */}
              <div className="flex space-x-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-red-400 rounded-full animate-pulse"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        );
        
      default:
        return null;
    }
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
          className={`fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-700 z-50 transform transition-transform duration-300 ease-in-out ${
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
            <nav className="space-y-4">
              <a href="/dashboard" className="block py-3 px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                Dashboard
              </a>
              <a href="/merchant" className="block py-3 px-4 text-[#00FF66] bg-[#00FF66]/20 rounded-xl drop-shadow-[0_0_8px_#00FF66] font-medium">
                Terminal
              </a>
              <a href="/transactions" className="block py-3 px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                Transactions
              </a>
              <a href="/settings" className="block py-3 px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                Settings
              </a>
              <div className="pt-4 mt-4 border-t border-gray-700">
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
                        disabled={createTransactionMutation.isPending}
                        className="w-full text-black font-semibold rounded-lg"
                        style={{ backgroundColor: '#00FF66' }}
                      >
                        {createTransactionMutation.isPending ? "Creating..." : "Create Transaction"}
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

        {/* Payment Status Box - Above QR Code with Glass Effect - Only show for QR tab */}
        {(currentTransaction || activeTransaction) && activeTab === "QR" ? (
          <div className="px-6 mb-6">
            <div 
              className="backdrop-blur-xl border rounded-3xl p-6 shadow-2xl transition-all duration-300"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
              }}
            >
              <div className="text-center">
                <h3 className="text-lg font-bold text-white mb-2">
                  Transaction #{(currentTransaction || activeTransaction).id}
                </h3>
                <p className="text-sm text-white/70 mb-4">
                  {(currentTransaction || activeTransaction).itemName} - ${(currentTransaction || activeTransaction).price}
                </p>
                {getPaymentStatusIndicator((currentTransaction || activeTransaction).status)}
              </div>
            </div>
          </div>
        ) : null}

        {/* Payment Interface Section - QR or NFC */}
        <div className="px-6">
          {activeTab === "QR" ? (
            // QR Code Interface
            currentTransaction || activeTransaction ? (
              <div 
                className="backdrop-blur-xl border rounded-3xl p-8 flex items-center justify-center shadow-2xl transition-all duration-300"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)'
                }}
              >
                <div className="text-center">
                  <div className="w-48 h-48 mx-auto mb-4">
                    <QRCodeDisplay 
                      merchantId={merchantId} 
                    />
                  </div>
                  <p className="text-gray-600 text-sm">
                    Scan to pay with any device
                  </p>
                </div>
              </div>
            ) : (
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
            )
          ) : (
            // NFC Interface - Completely empty, functionality moved to Send button
            <div className="h-48"></div>
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

        {/* Payment Status Box - Above QR Code with Glass Effect - Only show for QR tab */}
        {(currentTransaction || activeTransaction) && activeTab === "QR" ? (
          <div className="px-6 mb-6">
            <div 
              className="backdrop-blur-xl border rounded-3xl p-6 shadow-2xl transition-all duration-300"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
              }}
            >
              <div className="text-center">
                <h3 className="text-lg font-bold text-white mb-2">
                  Transaction #{(currentTransaction || activeTransaction).id}
                </h3>
                <p className="text-sm text-white/70 mb-4">
                  {(currentTransaction || activeTransaction).itemName} - ${(currentTransaction || activeTransaction).price}
                </p>
                {getPaymentStatusIndicator((currentTransaction || activeTransaction).status)}
              </div>
            </div>
          </div>
        ) : null}

        {/* Payment Interface Section - QR or NFC */}
        <div className="px-6">
          {activeTab === "QR" ? (
            // QR Code Interface
            currentTransaction || activeTransaction ? (
              <div 
                className="backdrop-blur-xl border rounded-3xl p-8 flex items-center justify-center shadow-2xl transition-all duration-300"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)'
                }}
              >
                <div className="text-center">
                  <div className="w-48 h-48 mx-auto mb-4">
                    <QRCodeDisplay 
                      merchantId={merchantId} 
                    />
                  </div>
                  <p className="text-gray-600 text-sm">
                    Scan to pay with any device
                  </p>
                </div>
              </div>
            ) : (
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
            )
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