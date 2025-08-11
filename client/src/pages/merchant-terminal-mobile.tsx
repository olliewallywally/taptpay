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
import { Send, Loader2, CheckCircle, Clock, XCircle, QrCode, Smartphone, Edit, Split, MoreHorizontal } from "lucide-react";
import { Link } from "wouter";
import { MobileHeader } from "@/components/mobile-header";

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
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  
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

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {isMobile && <MobileHeader title="tapt" />}
      
      <div className="relative z-10" style={{ paddingTop: isMobile ? '80px' : '0px' }}>{/* Main content container */}

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
  );
}