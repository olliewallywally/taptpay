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
import { Send, Loader2, CheckCircle, Clock, XCircle, Eye, Copy, Check, QrCode, Smartphone, Waves, CreditCard, X, Menu, Edit, Split, MoreHorizontal, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [selectedStoneId, setSelectedStoneId] = useState<number | null>(null);
  const [qrCollapsed, setQrCollapsed] = useState(true);
  
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

  // Get tapt stones for this merchant
  const { data: taptStones = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/tapt-stones`);
      if (!response.ok) throw new Error("Failed to fetch tapt stones");
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
    console.log("Action clicked:", action);
    console.log("Current activeAction:", activeAction);
    console.log("Tapt stones:", taptStones);
    
    // Force send to work
    if (action === "send") {
      setActiveAction("send");
      console.log("FORCED SEND ACTION SET");
      return;
    }
    
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
          <div className="flex flex-col items-center space-y-1 sm:space-y-3 p-4 sm:p-6 bg-blue-500/10 backdrop-blur-sm rounded-2xl border border-blue-400/30">
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
          <div className="flex flex-col items-center space-y-1 sm:space-y-3 p-4 sm:p-6 bg-orange-500/10 backdrop-blur-sm rounded-2xl border border-orange-400/30">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Loader2 className="w-5 h-5 sm:w-7 sm:h-7 text-orange-300 animate-spin" />
              <span className="text-base sm:text-lg font-medium text-orange-200">Processing Payment</span>
            </div>
            <p className="text-xs sm:text-sm text-orange-300 text-center">Payment is being processed...</p>
          </div>
        );
      case "completed":
        return (
          <div className="flex flex-col items-center space-y-1 sm:space-y-3 p-4 sm:p-6 bg-green-500/10 backdrop-blur-sm rounded-2xl border border-green-400/30">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <CheckCircle className="w-5 h-5 sm:w-7 sm:h-7 text-green-300" />
              <span className="text-base sm:text-lg font-medium text-green-200">Payment Accepted</span>
            </div>
            <p className="text-xs sm:text-sm text-green-300 text-center">Transaction completed successfully!</p>
          </div>
        );
      case "failed":
        return (
          <div className="flex flex-col items-center space-y-1 sm:space-y-3 p-4 sm:p-6 bg-red-500/10 backdrop-blur-sm rounded-2xl border border-red-400/30">
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
    <div 
      className="min-h-screen text-white relative overflow-hidden"
      style={{
        background: 'linear-gradient(-45deg, #1a1a1a, #2d2d2d, #1e1e1e, #333333)',
        backgroundSize: '400% 400%',
        animation: 'gradient 15s ease infinite'
      }}
    >
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

        {/* Content Wrapper - Reduce width by 35% */}
        <div className="w-full max-w-lg mx-auto px-4">
          {/* Mode Switcher */}
          <div className="flex justify-center mb-8">
            <div className="flex bg-gray-900 rounded-lg p-1 transition-all duration-300 hover:bg-gray-800 hover:scale-105 hover:shadow-lg">
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
          <div className="mb-6">
          {currentTransaction || activeTransaction ? (
            <div 
              className="rounded-2xl p-6 text-center transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer"
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
              className="rounded-2xl p-6 text-center border-2 border-dashed transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer"
              style={{ borderColor: '#00FF66' }}
            >
              <div className="text-gray-400 text-lg font-medium mb-2">Total</div>
              <div className="text-gray-400 text-4xl font-bold">$0.00</div>
              <div className="text-gray-400 text-sm mt-2">No active transaction</div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={() => handleActionClick("send")}
            className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 hover:scale-110 hover:shadow-lg ${
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
            className="flex flex-col items-center p-4 rounded-full transition-all duration-200 hover:scale-110 hover:shadow-lg bg-gray-800 text-gray-300 hover:bg-gray-700"
            style={{
              backgroundColor: activeAction === "edit" ? '#00FF66' : '#374151'
            }}
          >
            <Edit size={24} />
            <span className="text-xs mt-1 font-medium">Edit</span>
          </button>
          
          <button
            onClick={() => handleActionClick("split")}
            className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 hover:scale-110 hover:shadow-lg ${
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
            className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 hover:scale-110 hover:shadow-lg ${
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
        <div>
          <div 
            className="overflow-hidden transition-all duration-250 ease-in-out"
            style={{
              maxHeight: activeAction ? '600px' : '0px',
              opacity: activeAction ? 1 : 0
            }}
          >
            <div className="bg-gray-800 rounded-2xl p-3 mb-2 transition-all duration-300 hover:bg-gray-700 hover:scale-105 hover:shadow-lg">
              {activeAction === "edit" && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-white">Edit Transaction</h3>
                  <Form {...form}>
                    <div className="space-y-2">
                      <FormField
                        control={form.control}
                        name="itemName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-gray-300">Item Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter item name"
                                {...field}
                                className="bg-gray-700 border-gray-600 text-white rounded-lg h-8"
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
                            <FormLabel className="text-xs text-gray-300">Price ($)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter price"
                                {...field}
                                className="bg-gray-700 border-gray-600 text-white rounded-lg h-8"
                              />
                            </FormControl>
                            <FormMessage className="text-red-300 text-xs" />
                          </FormItem>
                        )}
                      />
                      <Button
                        onClick={form.handleSubmit(onSubmit)}
                        className="w-full text-black font-semibold rounded-lg h-8 text-sm"
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
                  <h3 className="text-sm font-semibold mb-1 text-white">Split the Bill</h3>
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
                        className="w-12 h-8 rounded-full font-semibold transition-colors text-black"
                        style={{ backgroundColor: '#00FF66' }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeAction === "send" && (
                <div className="text-center space-y-1">
                  <h3 className="text-lg font-semibold text-white">Share Payment Link</h3>
                  <p className="text-gray-300 text-sm">Copy the payment link to share with customers</p>
                  
                  {/* Stone Selection */}
                  {taptStones && taptStones.length > 0 && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-300 text-center">
                        Select Tapt Stone:
                      </label>
                      <Select value={selectedStoneId?.toString()} onValueChange={(value) => setSelectedStoneId(value ? parseInt(value) : null)}>
                        <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                          <SelectValue placeholder="Choose a stone" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-700 border-gray-600">
                          {taptStones.map((stone: any) => (
                            <SelectItem key={stone.id} value={stone.id.toString()}>
                              Stone {stone.stoneNumber} - {stone.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button
                    onClick={() => {
                      if (!selectedStoneId) {
                        toast({
                          title: "Select a Stone",
                          description: "Please select a Tapt Stone to copy its payment link",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      const selectedStone = taptStones?.find((stone: any) => stone.id === selectedStoneId);
                      if (selectedStone) {
                        navigator.clipboard.writeText(selectedStone.paymentUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                        toast({
                          title: "Stone Link Copied",
                          description: `${selectedStone.name} payment link copied to clipboard`,
                        });
                      }
                      setActiveAction(null);
                    }}
                    className="w-full text-black font-semibold rounded-lg"
                    style={{ backgroundColor: '#00FF66' }}
                  >
                    {copiedLink ? "✓ Copied!" : "Copy Payment Link"}
                  </Button>
                </div>
              )}

              {activeAction === "more" && (
                <div className="text-center">
                  <h3 className="text-sm font-semibold mb-1 text-white">More Options</h3>
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
        <div>
          {currentTransaction || activeTransaction ? (
            <div className="text-center p-4">
            </div>
          ) : (
            <div
              className="rounded-2xl p-4 transition-all duration-300"
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
                className={`grid transition-all duration-300 overflow-hidden ${
                  qrCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100 mt-4'
                }`}
              >
                <div className="bg-white rounded-xl p-6">
                  <div className="text-center">
                    {activeTab === "qr" && (
                      <div className="space-y-1">
                        {/* Individual Stone QR Code Boxes */}
                        {taptStones && taptStones.length > 0 ? (
                          taptStones.map((stone: any) => (
                            <div 
                              key={stone.id}
                              className="bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-lg transition-all duration-300"
                            >
                              {/* Stone Header */}
                              <div className="w-full flex items-center justify-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-800">Stone #{stone.stoneNumber}</h3>
                              </div>

                              {/* QR Code - Always visible */}
                              <div className="text-center transition-all duration-300">
                                <div className="w-48 h-48 mx-auto mb-4 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                                  <QrCode size={64} className="text-gray-400" />
                                </div>
                                <p className="text-gray-600 text-xs font-medium">
                                  QR code removed from desktop
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center">
                            <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4 mx-auto">
                              <QrCode size={64} className="text-gray-400" />
                            </div>
                            <p className="text-gray-600 text-sm">No tapt stones available</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {activeTab === "nfc" && (
                      <>
                        <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4 mx-auto">
                          <Smartphone size={64} className="text-gray-400" />
                        </div>
                        <p className="text-gray-600 text-sm">Create a transaction for NFC payment</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>



        </div> {/* End Content Wrapper */}
      </div>

      {/* Slide-out Hamburger Menu */}
      <div 
        className="menu-container fixed top-0 right-0 h-full bg-gray-800 z-50 transition-transform duration-300 ease-in-out"
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
          
          <nav className="space-y-1">
            <Link href="/dashboard">
              <a className="block py-3 px-4 text-white rounded-xl transition-colors font-medium">
                Dashboard
              </a>
            </Link>
            <a href="/merchant" className="block py-3 px-4 text-[#00CC52] rounded-xl font-medium">
              Terminal
            </a>
            <Link href="/transactions">
              <a className="block py-3 px-4 text-white rounded-xl transition-colors font-medium">
                Transactions
              </a>
            </Link>
            <Link href="/settings">
              <a className="block py-3 px-4 text-white rounded-xl transition-colors font-medium">
                Settings
              </a>
            </Link>
            <div className="pt-4 mt-4 border-t border-gray-600">
              <button 
                onClick={() => {
                  localStorage.removeItem('auth-token');
                  window.location.href = '/login';
                }}
                className="block w-full text-left py-3 px-4 text-red-400 hover:text-red-300 rounded-xl transition-colors font-medium"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
