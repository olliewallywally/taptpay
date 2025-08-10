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
import { Send, Loader2, CheckCircle, Clock, XCircle, QrCode, Smartphone, Menu, Edit, Split, MoreHorizontal, X } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  
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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuOpen && !(event.target as Element).closest('.menu-container')) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

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
                <div className="w-48 h-48 mx-auto mb-4">
                  <QRCodeDisplay 
                    merchantId={merchantId} 
                  />
                </div>
                <p className="text-gray-600 text-sm">
                  {activeTab === "QR" ? "Scan to pay with any device" : "Tap your phone to pay"}
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