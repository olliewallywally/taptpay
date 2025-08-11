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
import { Send, CheckCircle, Clock, XCircle, QrCode, Smartphone, Edit, Split, MoreHorizontal, Menu, X, Waves } from "lucide-react";
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
  
  // NFC-specific states (simplified - just for capability detection)
  const [nfcCapabilities, setNfcCapabilities] = useState<any>(null);
  
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
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
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
            googlePay: false,
            recommendations: ["Use simulation mode for testing"]
          });
          
          toast({
            title: "NFC Capabilities Detection Failed",
            description: "Using fallback simulation mode for testing.",
          });
        }
      };
      
      checkNfcCapabilities();
    }
  }, [activeTab, nfcCapabilities, toast]);

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      itemName: "",
      price: "",
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: (data: TransactionFormData) =>
      apiRequest(`/api/merchants/${merchantId}/transactions`, {
        method: "POST",
        body: {
          itemName: data.itemName,
          price: parseFloat(data.price),
        },
      }),
    onSuccess: (newTransaction) => {
      setCurrentTransaction(newTransaction);
      form.reset();
      toast({
        title: "Transaction Created",
        description: `Created ${newTransaction.itemName} for $${newTransaction.price}`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/transactions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create transaction",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Query for active transaction
  const { data: activeTransaction } = useQuery({
    queryKey: [`/api/merchants/${merchantId}/active-transaction`],
    refetchInterval: 3000,
    enabled: !!merchantId,
  });

  // Query for merchant data
  const { data: merchant } = useQuery({
    queryKey: [`/api/merchants/${merchantId}`],
    enabled: !!merchantId,
  });

  // Set up SSE connection for real-time updates
  useEffect(() => {
    if (!merchantId) return;

    const connectSSE = () => {
      sseClient.connect(merchantId, (data) => {
        if (data.type === 'transaction_updated' || data.type === 'transaction_completed') {
          queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
          queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/transactions`] });
          
          if (data.transaction) {
            setCurrentTransaction(data.transaction);
            
            if (data.transaction.status === 'completed') {
              toast({
                title: "Payment Received!",
                description: `Customer paid $${data.transaction.price} successfully`,
              });
            }
          }
        }
      });
    };

    connectSSE();

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
              <Smartphone className="w-5 h-5 text-orange-300 animate-pulse" />
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
              <a href="/nfc" className="block py-3 px-4 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                NFC Pay
              </a>
            </nav>
          </div>
        </div>

        {/* Main Mobile Interface */}
        <div 
          className="min-h-screen relative overflow-hidden"
          style={{
            background: 'linear-gradient(-45deg, #0a0a0a, #1a1a1a, #0f0f0f, #151515)',
            backgroundSize: '400% 400%',
            animation: 'gradientShift 15s ease infinite'
          }}
        >
          {/* Floating Menu Button */}
          <button 
            onClick={() => setMenuOpen(true)}
            className="fixed top-6 right-6 z-30 w-12 h-12 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center justify-center shadow-lg hover:bg-white/20 transition-all duration-300"
          >
            <Menu className="h-6 w-6 text-white" />
          </button>

          <div className="container mx-auto px-6 py-8 max-w-lg">
            {/* Business Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-white mb-2">
                {merchant?.businessName || 'Loading...'}
              </h1>
              <p className="text-white/60 text-sm">Payment Terminal</p>
            </div>

            {/* Tab Selection */}
            <div className="flex mb-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-1 shadow-2xl">
              <button
                onClick={() => setActiveTab("QR")}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                  activeTab === "QR"
                    ? 'bg-white/20 text-white shadow-lg border border-white/20'
                    : 'text-white/60 hover:text-white/80'
                }`}
              >
                <QrCode className="h-4 w-4 inline mr-2" />
                QR Code
              </button>
              <button
                onClick={() => setActiveTab("NFC")}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                  activeTab === "NFC"
                    ? 'bg-white/20 text-white shadow-lg border border-white/20'
                    : 'text-white/60 hover:text-white/80'
                }`}
              >
                <Waves className="h-4 w-4 inline mr-2" />
                NFC
              </button>
            </div>

            {/* Payment Status Indicator */}
            {currentTransaction && (
              <div className="mb-6">
                {getPaymentStatusIndicator(currentTransaction.status)}
              </div>
            )}

            {/* Create Transaction Form */}
            {activeAction === "create" && (
              <div className="mb-8 backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
                <h3 className="text-lg font-semibold text-white mb-4">Create New Transaction</h3>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="itemName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/80">Item Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Coffee, Lunch, Service" 
                              {...field} 
                              className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
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
                          <FormLabel className="text-white/80">Price</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., 4.50" 
                              {...field} 
                              className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex space-x-3 pt-2">
                      <Button 
                        type="submit" 
                        disabled={createTransactionMutation.isPending}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {createTransactionMutation.isPending ? 'Creating...' : 'Create Transaction'}
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setActiveAction(null)}
                        className="border-white/20 text-white/80 hover:bg-white/10"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}

            {/* Main Payment Interface */}
            <div className="space-y-6">
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
                // NFC Interface - Navigate to dedicated page
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
                      <Link href="/nfc" className="inline-block">
                        <button 
                          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors font-medium cursor-pointer"
                          type="button"
                        >
                          Start NFC Payment
                        </button>
                      </Link>
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

            {/* Floating Action Button */}
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2">
              <button
                onClick={() => handleActionClick("create")}
                className={`w-16 h-16 rounded-full backdrop-blur-xl border shadow-2xl transition-all duration-300 flex items-center justify-center ${
                  activeAction === "create"
                    ? 'bg-[#00FF66]/30 border-[#00FF66]/50 shadow-[0_0_30px_#00FF66] rotate-45'
                    : 'bg-white/10 border-white/20 hover:bg-white/20'
                }`}
              >
                <div className={`transition-transform duration-300 ${activeAction === "create" ? 'rotate-45' : ''}`}>
                  {activeAction === "create" ? (
                    <X className="h-8 w-8 text-[#00FF66]" />
                  ) : (
                    <span className="text-2xl font-light text-white">+</span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Desktop version remains the same as before but simplified
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Payment Terminal</h1>
          
          {/* Desktop interface would go here - simplified for now */}
          <div className="text-center py-20">
            <p className="text-gray-600 mb-4">This interface is optimized for mobile devices.</p>
            <p className="text-gray-500">Please access this page on a mobile device for the best experience.</p>
          </div>
        </div>
      </div>
    </div>
  );
}