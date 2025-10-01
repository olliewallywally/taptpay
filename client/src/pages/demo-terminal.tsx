import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Minus, Users2, Share2, Calculator, Wifi, ChevronDown, Menu, X, LogOut, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedBrandBackground } from "@/components/backgrounds/AnimatedBrandBackground";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";

interface Merchant {
  id: number;
  name: string;
  businessName: string;
  email: string;
}

interface Transaction {
  id: number;
  merchantId: number;
  amount: string;
  price: string;
  currency: string;
  status: string;
  qrCodeUrl?: string;
  paymentUrl?: string;
  isSplit?: boolean;
  totalSplits?: number;
  completedSplits?: number;
  splitAmount?: string;
}

interface TaptStone {
  id: number;
  merchantId: number;
  name: string;
  stoneNumber: number;
  qrCodeUrl: string;
  paymentUrl: string;
  isActive: boolean;
}

const paymentFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().min(1, "Price is required").refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: "Price must be a positive number",
  }),
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

export default function DemoTerminal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("15.99");
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);
  const [showStones, setShowStones] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'new-payment' | 'split-bill' | 'share-link' | 'quick-amounts' | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [stockSearchInput, setStockSearchInput] = useState("");
  const [filteredStockItems, setFilteredStockItems] = useState<any[]>([]);
  const [selectedStockItems, setSelectedStockItems] = useState<any[]>([]);

  // Track last processed transaction to prevent infinite updates
  const lastProcessedTxRef = useRef<{ id?: number; status?: string }>({});

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      itemName: "",
      price: "",
    },
  });
  
  // Get current user/merchant
  const { data: user } = useQuery<{ user: { merchantId: number } }>({
    queryKey: ["/api/auth/me"],
  });

  const merchantId = user?.user?.merchantId;

  // Fetch merchant data
  const { data: merchant } = useQuery<Merchant>({
    queryKey: [`/api/merchants/${merchantId}`],
    enabled: !!merchantId,
  });

  // Fetch active transaction
  const { data: activeTransaction } = useQuery<Transaction>({
    queryKey: [`/api/merchants/${merchantId}/active-transaction`],
    enabled: !!merchantId,
    refetchInterval: 5000,
  });

  // Fetch tapt stones
  const { data: taptStones = [] } = useQuery<TaptStone[]>({
    queryKey: [`/api/merchants/${merchantId}/tapt-stones`],
    enabled: !!merchantId,
  });

  // Fetch stock items
  const { data: stockItems = [] } = useQuery<any[]>({
    queryKey: [`/api/merchants/${merchantId}/stock-items`],
    enabled: !!merchantId,
  });

  // Update current transaction when active transaction changes
  useEffect(() => {
    if (activeTransaction) {
      // Only process if this transaction hasn't been processed or if status changed
      const lastProcessed = lastProcessedTxRef.current;
      if (lastProcessed.id !== activeTransaction.id || lastProcessed.status !== activeTransaction.status) {
        lastProcessedTxRef.current = { id: activeTransaction.id, status: activeTransaction.status };
        setCurrentTransaction(activeTransaction);
      }
    } else if (lastProcessedTxRef.current.id !== undefined) {
      // Clear when activeTransaction becomes null
      lastProcessedTxRef.current = {};
      setCurrentTransaction(null);
    }
  }, [activeTransaction]);

  // SSE connection for real-time updates
  useEffect(() => {
    if (!merchantId) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    const eventSource = new EventSource(
      `/api/merchants/${merchantId}/events?token=${encodeURIComponent(token)}`
    );

    eventSource.onopen = () => {
      console.log(`SSE connected for merchant ${merchantId}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "transaction_update" && data.transaction) {
          setCurrentTransaction(data.transaction);
          queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
          
          // Clear transaction if it's completed/failed/cancelled
          if (['completed', 'failed', 'cancelled'].includes(data.transaction.status)) {
            setTimeout(() => {
              setCurrentTransaction(null);
            }, 3000);
          }
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [merchantId]);

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: async (data?: PaymentFormData) => {
      if (!merchantId) throw new Error("No merchant ID");
      
      const payload = data 
        ? {
            merchantId,
            itemName: data.itemName,
            price: parseFloat(data.price),
            status: "pending",
          }
        : {
            merchantId,
            amount: parseFloat(amount),
            currency: "NZD",
          };
      
      const response = await apiRequest("POST", "/api/transactions", payload);
      return response.json();
    },
    onSuccess: (transaction, data) => {
      setCurrentTransaction(transaction);
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
      
      if (data) {
        form.reset();
        setShowPaymentForm(false);
        setActiveDropdown(null);
        setSelectedStockItems([]);
        setStockSearchInput("");
      }
      
      toast({
        title: "Payment Created",
        description: data 
          ? `Awaiting payment for ${data.itemName} - $${data.price}`
          : `Awaiting payment of $${amount}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment",
        variant: "destructive",
      });
    },
  });

  // Create split bill mutation
  const createSplitBillMutation = useMutation({
    mutationFn: async () => {
      if (!currentTransaction?.id) throw new Error("No active transaction");
      
      const response = await apiRequest("POST", `/api/transactions/${currentTransaction.id}/split`, {
        totalSplits: splitCount,
      });
      return response.json();
    },
    onSuccess: (transaction) => {
      setCurrentTransaction(transaction);
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
      setActiveDropdown(null);
      setSplitCount(2);
      toast({
        title: "Bill Split Created",
        description: `Payment split ${splitCount} ways - $${(parseFloat(currentTransaction?.price || "0") / splitCount).toFixed(2)} each`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to split bill",
        variant: "destructive",
      });
    },
  });

  // Cancel transaction mutation
  const cancelTransactionMutation = useMutation({
    mutationFn: async () => {
      if (!currentTransaction) throw new Error("No transaction to cancel");
      const response = await apiRequest("POST", `/api/transactions/${currentTransaction.id}/cancel`, {});
      return response.json();
    },
    onSuccess: () => {
      setTimeout(() => {
        setCurrentTransaction(null);
      }, 2000);
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
      toast({
        title: "Payment Cancelled",
        description: "Transaction has been cancelled",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel payment",
        variant: "destructive",
      });
    },
  });

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '');
    setAmount(value);
  };

  const handleCreatePayment = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }
    createTransactionMutation.mutate();
  };

  const handleCancelPayment = () => {
    cancelTransactionMutation.mutate();
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setLocation("/login");
  };

  const onSubmitPaymentForm = (data: PaymentFormData) => {
    createTransactionMutation.mutate(data);
  };

  // Filter stock items based on search input
  useEffect(() => {
    if (stockSearchInput.trim() === "") {
      setFilteredStockItems([]);
    } else {
      const filtered = stockItems.filter((item: any) =>
        item.name.toLowerCase().includes(stockSearchInput.toLowerCase()) ||
        item.description?.toLowerCase().includes(stockSearchInput.toLowerCase())
      );
      setFilteredStockItems(filtered.slice(0, 5)); // Show max 5 suggestions
    }
  }, [stockSearchInput, stockItems]);

  // Calculate total price from selected stock items
  const calculateTotalPrice = () => {
    return selectedStockItems.reduce((total, item) => total + parseFloat(item.cost), 0).toFixed(2);
  };

  // Add stock item
  const addStockItem = (stockItem: any) => {
    if (!selectedStockItems.find(item => item.id === stockItem.id)) {
      setSelectedStockItems(prev => [...prev, stockItem]);
      setStockSearchInput("");
      setFilteredStockItems([]);
      
      // Update form values
      const newTotal = calculateTotalPrice();
      form.setValue("price", (parseFloat(newTotal) + parseFloat(stockItem.cost)).toFixed(2));
      
      // Update item name with all selected items
      const allItemNames = [...selectedStockItems, stockItem].map(item => item.name).join(", ");
      form.setValue("itemName", allItemNames);
    }
  };

  // Remove stock item
  const removeStockItem = (stockItemId: number) => {
    setSelectedStockItems(prev => {
      const newItems = prev.filter(item => item.id !== stockItemId);
      
      // Update form values
      const newTotal = newItems.reduce((total, item) => total + parseFloat(item.cost), 0).toFixed(2);
      form.setValue("price", newTotal);
      
      // Update item name
      const allItemNames = newItems.map(item => item.name).join(", ");
      form.setValue("itemName", allItemNames || "");
      
      return newItems;
    });
  };

  const getStatusDisplay = () => {
    if (!currentTransaction) return { text: "ready", color: "text-green-400" };
    
    switch (currentTransaction.status) {
      case "pending":
        return { text: "awaiting payment", color: "text-green-400" };
      case "processing":
        return { text: "processing", color: "text-yellow-400" };
      case "completed":
        return { text: "payment successful", color: "text-green-400" };
      case "failed":
        return { text: "payment failed", color: "text-red-400" };
      case "cancelled":
        return { text: "cancelled", color: "text-gray-400" };
      default:
        return { text: currentTransaction.status, color: "text-green-400" };
    }
  };

  const status = getStatusDisplay();

  return (
    <AnimatedBrandBackground
      backgroundColor="#1a1a1a"
      circleColor="#2d2d2d"
      largeCirclePosition="top-[-120px] right-[-120px]"
      smallCirclePosition="top-[200px] right-[250px]"
      extraLargeCirclePosition="bottom-[-120px] right-[-120px]"
      extraSmallCirclePosition="bottom-[200px] right-[250px]"
    >
      {/* Menu icon in top right corner - fixed position */}
      <div className="fixed top-6 right-6 z-50">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 shadow-lg"
          data-testid="button-menu"
        >
          {menuOpen ? <X className="w-6 h-6 text-gray-900" /> : <Menu className="w-6 h-6 text-gray-900" />}
        </button>
      </div>

      {/* Slide-over Menu */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-white/20 shadow-xl transform transition-transform duration-300 z-40 ${
        menuOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="p-6 pt-20">
          <nav className="space-y-4">
            <Link href="/merchant" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Terminal
            </Link>
            <Link href="/crypto-terminal" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-orange-400 rounded-xl hover:bg-orange-950/30 transition-colors font-medium">
              Crypto Terminal
            </Link>
            <Link href="/demo-terminal" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-green-400 rounded-xl hover:bg-green-950/30 transition-colors font-medium">
              Demo Terminal
            </Link>
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/transactions" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Transactions
            </Link>
            <Link href="/stock" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Stock
            </Link>
            <Link href="/settings" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Settings
            </Link>
            <div className="pt-4 mt-4 border-t border-white/20">
              <button 
                onClick={handleLogout}
                className="flex items-center w-full text-left py-3 px-4 text-red-400 hover:bg-red-950/30 rounded-xl transition-colors font-medium"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Content with slide-over effect */}
      <div className={`relative transition-transform duration-300 ${menuOpen ? '-translate-x-80' : 'translate-x-0'}`}>
        {/* Logo in top left corner - slides with content */}
        <div className="absolute top-6 left-6 z-30">
          <img 
            src={taptLogoPath} 
            alt="Tapt Logo" 
            className="h-8 w-auto filter brightness-0 invert"
          />
        </div>
        
        <div className="min-h-screen flex items-center justify-center p-3 sm:p-8 pt-24 sm:pt-32">
        <div className="w-full max-w-4xl space-y-4 sm:space-y-8">
        
        {/* Connected Amount Display and Action Buttons */}
        <div>
          {/* Amount Display */}
          <div className="relative z-20">
            <div className="bg-gradient-to-br from-green-400 to-green-500 rounded-[2rem] sm:rounded-[4rem] p-6 sm:p-12 shadow-2xl">
              <div className="flex flex-col items-center justify-center">
                <span className="text-4xl sm:text-7xl font-bold text-gray-900">
                  ${currentTransaction ? (
                    currentTransaction.isSplit && currentTransaction.splitAmount
                      ? parseFloat(currentTransaction.splitAmount).toFixed(2)
                      : parseFloat(currentTransaction.price).toFixed(2)
                  ) : amount}
                </span>
                {currentTransaction?.isSplit && (
                  <div className="mt-3 sm:mt-4 text-center">
                    <div className="text-lg sm:text-2xl font-semibold text-gray-900">
                      Split {(currentTransaction.completedSplits ?? 0) + 1} of {currentTransaction.totalSplits ?? 0}
                    </div>
                    <div className="text-sm sm:text-base text-gray-800 mt-1">
                      Total: ${parseFloat(currentTransaction.price).toFixed(2)} ({currentTransaction.totalSplits ?? 0} people)
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="relative z-10 bg-[#2a2a2a] rounded-b-2xl sm:rounded-b-3xl pt-16 sm:pt-28 pb-4 sm:pb-6 px-4 sm:px-8 -mt-6 shadow-xl">
            <div className="flex justify-around items-center gap-2 sm:gap-4">
              {/* New Payment Button */}
              <button
                onClick={() => {
                  if (activeDropdown === 'new-payment') {
                    setActiveDropdown(null);
                    setShowPaymentForm(false);
                    form.reset();
                    setSelectedStockItems([]);
                    setStockSearchInput("");
                  } else {
                    setActiveDropdown('new-payment');
                  }
                }}
                className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
                data-testid="button-new-payment"
              >
                <Plus className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
              </button>

              {/* Split Bill Button */}
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'split-bill' ? null : 'split-bill')}
                className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
                data-testid="button-split-bill"
              >
                <Users2 className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
              </button>

              {/* Share Link Button */}
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'share-link' ? null : 'share-link')}
                className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
                data-testid="button-share-link"
              >
                <Share2 className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
              </button>

              {/* Quick Amounts Button */}
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'quick-amounts' ? null : 'quick-amounts')}
                className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
                data-testid="button-quick-amounts"
              >
                <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
              </button>
            </div>
          </div>

          {/* Dropdowns */}
          <div className="relative z-5">
            {/* New Payment Dropdown */}
            <div className={`overflow-hidden transition-all duration-300 ${activeDropdown === 'new-payment' ? 'max-h-[600px]' : 'max-h-0'}`}>
              <div className="bg-[#353535] rounded-t-none rounded-b-2xl sm:rounded-b-3xl p-4 sm:p-8 space-y-3 sm:space-y-4 -mt-4">
                <h3 className="text-white font-semibold text-lg sm:text-xl mb-3">New Payment</h3>
                
                {!showPaymentForm ? (
                  <button
                    onClick={() => setShowPaymentForm(true)}
                    className="w-full bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500 rounded-xl py-3 px-4 text-green-400 font-medium transition-all"
                  >
                    Create Standard Payment
                  </button>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmitPaymentForm)} className="space-y-4">
                      {/* Stock Items Search */}
                      <div className="space-y-2">
                        <label className="text-green-400 font-medium text-sm">Search Stock Items</label>
                        <div className="relative">
                          <Input
                            placeholder="Type to search stock items..."
                            value={stockSearchInput}
                            onChange={(e) => setStockSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && filteredStockItems.length > 0) {
                                e.preventDefault();
                                addStockItem(filteredStockItems[0]);
                              }
                            }}
                            className="bg-[#1a1a1a] border-2 border-green-500 text-white rounded-xl h-12 focus:ring-2 focus:ring-green-400"
                            data-testid="stock-search-input"
                          />
                          
                          {filteredStockItems.length > 0 && (
                            <div className="absolute z-50 w-full bg-[#2a2a2a] border-2 border-green-500 rounded-xl mt-2 max-h-48 overflow-y-auto shadow-xl" data-testid="stock-suggestions">
                              {filteredStockItems.map((item: any) => (
                                <div
                                  key={item.id}
                                  onClick={() => addStockItem(item)}
                                  className="p-3 cursor-pointer text-white border-b border-gray-700 last:border-b-0 hover:bg-green-500/10 transition-colors"
                                  data-testid={`stock-suggestion-${item.id}`}
                                >
                                  <div className="font-semibold text-green-400">{item.name}</div>
                                  <div className="text-gray-400 text-sm">${parseFloat(item.cost).toFixed(2)}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {selectedStockItems.length > 0 && (
                          <div className="space-y-2">
                            <label className="text-green-400 font-medium text-sm">Selected Items</label>
                            <div className="flex flex-wrap gap-2" data-testid="selected-stock-items">
                              {selectedStockItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-2 bg-green-500/20 border-2 border-green-500 rounded-full px-3 py-2 text-sm text-white"
                                  data-testid={`selected-stock-item-${item.id}`}
                                >
                                  <Tag size={14} className="text-green-400" />
                                  <span className="font-medium">{item.name}</span>
                                  <span className="text-green-400">${parseFloat(item.cost).toFixed(2)}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeStockItem(item.id)}
                                    className="ml-1 text-gray-400 hover:text-white transition-colors"
                                    data-testid={`remove-stock-item-${item.id}`}
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <FormField
                        control={form.control}
                        name="itemName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-green-400 font-medium">Item Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter item name"
                                {...field}
                                readOnly={selectedStockItems.length > 0}
                                className="bg-[#1a1a1a] border-2 border-green-500 text-white rounded-xl h-12 focus:ring-2 focus:ring-green-400"
                                data-testid="input-item-name"
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-green-400 font-medium">Price ($)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="0.00"
                                {...field}
                                className="bg-[#1a1a1a] border-2 border-green-500 text-white rounded-xl h-12 focus:ring-2 focus:ring-green-400"
                                data-testid="input-price"
                              />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />

                      <div className="flex gap-3 pt-2">
                        <Button
                          type="submit"
                          disabled={createTransactionMutation.isPending}
                          className="flex-1 bg-green-500 hover:bg-green-600 text-gray-900 font-semibold rounded-xl h-12"
                        >
                          {createTransactionMutation.isPending ? "Creating..." : "Create Payment"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            setShowPaymentForm(false);
                            form.reset();
                            setSelectedStockItems([]);
                            setStockSearchInput("");
                          }}
                          variant="outline"
                          className="flex-1 border-2 border-green-500 text-green-400 hover:bg-green-500/10 rounded-xl h-12"
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </Form>
                )}
              </div>
            </div>

            {/* Split Bill Dropdown */}
            <div className={`overflow-hidden transition-all duration-300 ${activeDropdown === 'split-bill' ? 'max-h-96' : 'max-h-0'}`}>
              <div className="bg-[#353535] rounded-t-none rounded-b-2xl sm:rounded-b-3xl p-4 sm:p-8 space-y-4 -mt-4">
                <h3 className="text-white font-semibold text-lg sm:text-xl mb-3">Split Bill</h3>
                
                {currentTransaction ? (
                  <>
                    <div className="flex items-center justify-center gap-4 sm:gap-6">
                      <button
                        onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                        disabled={splitCount <= 2}
                        className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
                      >
                        <Minus className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
                      </button>
                      
                      <div className="text-center">
                        <div className="text-4xl sm:text-5xl font-bold text-green-400">{splitCount}</div>
                        <div className="text-sm sm:text-base text-gray-300 mt-1">people</div>
                        <div className="text-lg sm:text-xl font-semibold text-white mt-2">
                          ${(parseFloat(currentTransaction.price) / splitCount).toFixed(2)} each
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setSplitCount(Math.min(10, splitCount + 1))}
                        disabled={splitCount >= 10}
                        className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
                      >
                        <Plus className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900" />
                      </button>
                    </div>
                    
                    <div className="flex gap-3 pt-4">
                      <Button
                        onClick={() => createSplitBillMutation.mutate()}
                        disabled={createSplitBillMutation.isPending}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-gray-900 font-semibold rounded-xl h-12"
                        data-testid="button-confirm-split"
                      >
                        {createSplitBillMutation.isPending ? "Splitting..." : "Confirm Split"}
                      </Button>
                      <Button
                        onClick={() => {
                          setActiveDropdown(null);
                          setSplitCount(2);
                        }}
                        variant="outline"
                        className="flex-1 border-2 border-green-500 text-green-400 hover:bg-green-500/10 rounded-xl h-12"
                        data-testid="button-cancel-split"
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-300 py-4">
                    Create a payment first to split the bill
                  </div>
                )}
              </div>
            </div>

            {/* Share Link Dropdown */}
            <div className={`overflow-hidden transition-all duration-300 ${activeDropdown === 'share-link' ? 'max-h-96' : 'max-h-0'}`}>
              <div className="bg-[#353535] rounded-t-none rounded-b-2xl sm:rounded-b-3xl p-4 sm:p-8 space-y-3 sm:space-y-4 -mt-4">
                <h3 className="text-white font-semibold text-lg sm:text-xl mb-3">Share Link</h3>
                <button
                  onClick={() => {
                    if (currentTransaction?.paymentUrl) {
                      navigator.clipboard.writeText(currentTransaction.paymentUrl);
                      toast({ title: "Link Copied!", description: "Payment link copied to clipboard" });
                    } else {
                      toast({ title: "No Active Payment", description: "Create a payment first" });
                    }
                    setActiveDropdown(null);
                  }}
                  className="w-full bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500 rounded-xl py-3 px-4 text-green-400 font-medium transition-all"
                >
                  Copy Payment Link
                </button>
                <button
                  onClick={() => {
                    if (currentTransaction?.qrCodeUrl) {
                      window.open(currentTransaction.qrCodeUrl, '_blank');
                    } else {
                      toast({ title: "No Active Payment", description: "Create a payment first" });
                    }
                    setActiveDropdown(null);
                  }}
                  className="w-full bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500 rounded-xl py-3 px-4 text-green-400 font-medium transition-all"
                >
                  Download QR Code
                </button>
              </div>
            </div>

            {/* Quick Amounts Dropdown */}
            <div className={`overflow-hidden transition-all duration-300 ${activeDropdown === 'quick-amounts' ? 'max-h-96' : 'max-h-0'}`}>
              <div className="bg-[#353535] rounded-t-none rounded-b-2xl sm:rounded-b-3xl p-4 sm:p-8 -mt-4">
                <h3 className="text-white font-semibold text-lg sm:text-xl mb-3">Quick Amounts</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {['5.00', '10.00', '15.00', '20.00', '25.00', '50.00', '75.00', '100.00', '150.00'].map((quickAmount) => (
                    <button
                      key={quickAmount}
                      onClick={() => {
                        setAmount(quickAmount);
                        toast({ title: "Amount Set", description: `$${quickAmount}` });
                        setActiveDropdown(null);
                      }}
                      className="bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500 rounded-xl py-3 px-2 text-green-400 font-medium transition-all text-sm sm:text-base"
                    >
                      ${quickAmount}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Display */}
        <div className="bg-[#0f0f0f] rounded-2xl sm:rounded-3xl p-6 sm:p-12 shadow-xl">
          <div className="flex flex-col items-center space-y-3 sm:space-y-6">
            <span className={`text-lg sm:text-3xl font-semibold ${status.color}`}>
              {status.text}
            </span>
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-green-500/20 flex items-center justify-center">
              <Wifi className="w-7 h-7 sm:w-10 sm:h-10 text-green-400 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Payment Stones Section */}
        <div className="w-full">
          <button
            onClick={() => setShowStones(!showStones)}
            className="w-full bg-[#6b6b6b] border-3 border-green-500 sm:border-0 rounded-full py-4 sm:py-6 px-6 sm:px-8 flex items-center justify-between hover:bg-green-500/10 transition-all shadow-lg"
            data-testid="button-payment-stones"
          >
            <span className="text-white font-semibold text-lg sm:text-2xl flex-1 text-center">
              payment stones
            </span>
            <ChevronDown className={`w-5 h-5 sm:w-7 sm:h-7 text-green-500 transition-transform duration-300 ${showStones ? 'rotate-180' : ''}`} />
          </button>

          {/* Stones Dropdown */}
          <div className={`overflow-hidden transition-all duration-300 ${showStones ? 'max-h-96 mt-4 sm:mt-6' : 'max-h-0'}`}>
            {taptStones.length > 0 && (
              <div className="bg-[#2a2a2a] rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-3 sm:space-y-4 shadow-xl">
                {taptStones.map((stone) => (
                  <button
                    key={stone.id}
                    onClick={() => {
                      window.open(stone.paymentUrl, '_blank');
                      setShowStones(false);
                    }}
                    className="w-full bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500 rounded-xl sm:rounded-2xl py-3 sm:py-5 px-4 sm:px-6 text-green-400 font-medium text-base sm:text-lg transition-all"
                    data-testid={`button-stone-${stone.id}`}
                  >
                    {stone.name} - Stone {stone.stoneNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cancel Button */}
        <button
          onClick={handleCancelPayment}
          disabled={!currentTransaction || currentTransaction.status !== 'pending' || cancelTransactionMutation.isPending}
          className="w-full bg-[#6b6b6b] border-3 border-red-500 sm:border-0 rounded-full py-4 sm:py-6 px-6 sm:px-8 hover:bg-red-500/10 transition-all shadow-lg disabled:opacity-50"
          data-testid="button-cancel"
        >
          <span className="text-red-400 font-semibold text-lg sm:text-2xl">
            cancel payment
          </span>
        </button>

      </div>
    </div>
    </div>
    </AnimatedBrandBackground>
  );
}
