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
          
          // Allow NFC testing even if device doesn't natively support it
          if (!capabilities.nfcSupported) {
            toast({
              title: "NFC Simulation Mode",
              description: "Using simulation mode for NFC payments on this device.",
            });
          }
        } catch (error) {
          console.error('Failed to check NFC capabilities:', error);
          // Set fallback capabilities for testing
          setNfcCapabilities({
            nfcSupported: false,
            contactlessCard: true,
            applePay: false,
            googlePay: false
          });
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
          nfcCapabilities: nfcCapabilities || { nfcSupported: false, contactlessCard: true }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create NFC payment session');
      }

      const result = await response.json();
      console.log('NFC payment created:', result);
      setNfcSession(result.nfcSession);
      setNfcPaymentStatus("ready");
      setShowNfcOverlay(true);
      
      toast({
        title: "NFC Terminal Ready",
        description: "Ready to accept contactless payments.",
      });
    } catch (error) {
      console.error('NFC payment creation failed:', error);
      setNfcPaymentStatus("failed");
      toast({
        title: "Payment Failed",
        description: (error as Error)?.message || "Could not create NFC payment session.",
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
          <div className="flex flex-col items-center space-y-2 p-4 bg-blue-500/20 rounded-xl">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-blue-300" />
              <span className="text-sm font-medium text-blue-200">Awaiting Payment</span>
            </div>
          </div>
        );
      case "processing":
        return (
          <div className="flex flex-col items-center space-y-2 p-4 bg-orange-500/20 rounded-xl">
            <div className="flex items-center space-x-2">
              <Loader2 className="w-5 h-5 text-orange-300 animate-spin" />
              <span className="text-sm font-medium text-orange-200">Processing Payment</span>
            </div>
          </div>
        );
      case "completed":
        return (
          <div className="flex flex-col items-center space-y-2 p-4 bg-green-500/20 rounded-xl">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-300" />
              <span className="text-sm font-medium text-green-200">Payment Accepted</span>
            </div>
          </div>
        );
      case "failed":
        return (
          <div className="flex flex-col items-center space-y-2 p-4 bg-red-500/20 rounded-xl">
            <div className="flex items-center space-x-2">
              <XCircle className="w-5 h-5 text-red-300" />
              <span className="text-sm font-medium text-red-200">Payment Failed</span>
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

        {/* Payment Status Box - Above QR Code with Glass Effect */}
        {currentTransaction || activeTransaction ? (
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

        {/* QR Code Section - With Glass Effect */}
        <div className="px-6">
          {currentTransaction || activeTransaction ? (
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
                  {activeTab === "QR" ? "Scan to pay with any device" : "Tap your phone to pay"}
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
                  {activeTab === "QR" ? (
                    <QrCode size={64} className="text-gray-400" />
                  ) : (
                    <Smartphone size={64} className="text-gray-400" />
                  )}
                </div>
                <p className="text-gray-600 text-sm">
                  {activeTab === "QR" ? "Create a transaction to show QR code" : "Create a transaction for NFC payment"}
                </p>
              </div>
            </div>
          )}
        </div>
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

        {/* Payment Status Box - Above QR Code with Glass Effect */}
        {currentTransaction || activeTransaction ? (
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
            // NFC Interface
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
                  <div className="w-48 h-48 bg-gradient-to-br from-blue-100 to-purple-100 border-2 border-blue-300 rounded-lg flex items-center justify-center mb-4">
                    <Waves size={64} className="text-blue-600" />
                  </div>
                  <p className="text-gray-600 text-sm mb-4">
                    {nfcCapabilities?.nfcSupported 
                      ? "Ready for contactless payment" 
                      : "NFC Simulation Mode - Testing Available"}
                  </p>
                  <button 
                    onClick={createNFCPayment}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors font-medium"
                    disabled={nfcPaymentStatus === "creating"}
                  >
                    {nfcPaymentStatus === "creating" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                        Starting NFC Terminal...
                      </>
                    ) : (
                      "Start NFC Payment"
                    )}
                  </button>
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
                    <Smartphone size={64} className="text-gray-400" />
                  </div>
                  <p className="text-gray-600 text-sm">
                    Create a transaction for NFC payment
                  </p>
                </div>
              </div>
            )
          )}
        </div>

        {/* NFC Payment Overlay - Full Screen */}
        {showNfcOverlay && (
          <div className="fixed inset-0 z-50 bg-black">
            {/* Close Button - Top Right */}
            <button
              onClick={closeNfcOverlay}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors z-10"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            
            <div className="min-h-screen flex items-center justify-center p-8">
              {nfcPaymentStatus === "ready" && (
                <div className="text-center">
                  <div 
                    className="mx-auto w-80 h-80 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 animate-pulse"
                    style={{
                      backgroundColor: '#00FF66',
                      boxShadow: '0 0 40px rgba(0, 255, 102, 0.4), 0 0 80px rgba(0, 255, 102, 0.2)',
                      animation: 'pulse 2s ease-in-out infinite'
                    }}
                  >
                    <div className="text-black text-2xl font-bold">TAP HERE</div>
                    <div className="text-black text-4xl font-bold">${nfcSession?.amount}</div>
                    <div className="text-black text-lg font-medium">{nfcSession?.itemName}</div>
                  </div>
                  
                  {/* Simulation Button (for testing) */}
                  <button
                    onClick={simulateNFCTap}
                    className="mt-8 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
                  >
                    Simulate Tap (Testing)
                  </button>
                </div>
              )}
              
              {nfcPaymentStatus === "processing" && (
                <div className="text-center">
                  <div 
                    className="mx-auto w-80 h-80 rounded-3xl flex flex-col items-center justify-center text-center space-y-4"
                    style={{ backgroundColor: '#FFB800' }}
                  >
                    <Loader2 className="h-16 w-16 text-black animate-spin" />
                    <div className="text-black text-2xl font-bold">Processing...</div>
                    <div className="text-black text-lg">${nfcSession?.amount}</div>
                  </div>
                </div>
              )}

              {nfcPaymentStatus === "completed" && (
                <div className="text-center">
                  <div 
                    className="mx-auto w-80 h-80 rounded-3xl flex flex-col items-center justify-center text-center space-y-4"
                    style={{ backgroundColor: '#00FF66' }}
                  >
                    <CheckCircle className="h-16 w-16 text-black" />
                    <div className="text-black text-2xl font-bold">Payment Complete!</div>
                    <div className="text-black text-lg">${nfcSession?.amount}</div>
                  </div>
                </div>
              )}

              {nfcPaymentStatus === "failed" && (
                <div className="text-center">
                  <div 
                    className="mx-auto w-80 h-80 rounded-3xl flex flex-col items-center justify-center text-center space-y-4"
                    style={{ backgroundColor: '#FF4444' }}
                  >
                    <XCircle className="h-16 w-16 text-white" />
                    <div className="text-white text-2xl font-bold">Payment Failed</div>
                    <div className="text-white text-lg">Try Again</div>
                  </div>
                  
                  <button
                    onClick={resetNfcPayment}
                    className="mt-8 px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
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