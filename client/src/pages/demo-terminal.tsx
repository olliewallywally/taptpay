import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Minus, Users2, Share2, Calculator, QrCode, Grid3x3, ChevronDown, Menu, X, LogOut, Tag, Copy, Check, Loader2, CheckCircle2, Smartphone, Pencil, Trash2 } from "lucide-react";
import waveIconPath from "@assets/wave_1762733987203.png";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
  taptStoneId: z.string().min(1, "Please select a stone"),
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
  const [selectedStockItems, setSelectedStockItems] = useState<any[]>([]);
  const [copiedPaymentLink, setCopiedPaymentLink] = useState(false);
  const [selectedStoneId, setSelectedStoneId] = useState<number | undefined>();
  const [isNfcMode, setIsNfcMode] = useState(false);
  const [isNfcOverlayActive, setIsNfcOverlayActive] = useState(false);
  const [editingStoneId, setEditingStoneId] = useState<number | null>(null);
  const [editStoneName, setEditStoneName] = useState("");
  const [splitEnabled, setSplitEnabled] = useState<boolean>(
    () => localStorage.getItem('taptpay_split_enabled') === 'true'
  );

  useEffect(() => {
    localStorage.setItem('taptpay_split_enabled', String(splitEnabled));
  }, [splitEnabled]);

  // Track last processed transaction to prevent infinite updates
  const lastProcessedTxRef = useRef<{ id?: number; status?: string }>({});

  // Activate NFC payment when overlay is active
  useEffect(() => {
    if (isNfcOverlayActive && currentTransaction) {
      activateNfcPayment();
    }
  }, [isNfcOverlayActive, currentTransaction]);

  const activateNfcPayment = async () => {
    if (!currentTransaction) return;

    // Check if Payment Request API is supported
    if (!window.PaymentRequest) {
      toast({
        title: "NFC Not Supported",
        description: "Contactless payments are not supported on this device",
        variant: "destructive"
      });
      return;
    }

    try {
      const supportedInstruments = [
        {
          supportedMethods: 'basic-card',
          data: {
            supportedNetworks: ['visa', 'mastercard', 'amex'],
            supportedTypes: ['debit', 'credit']
          }
        }
      ];

      const details = {
        total: {
          label: 'Total',
          amount: {
            currency: 'USD',
            value: currentTransaction.price
          }
        }
      };

      const request = new PaymentRequest(supportedInstruments, details);

      // Show the payment UI
      const paymentResponse = await request.show();

      // Process the payment
      await paymentResponse.complete('success');

      // Update transaction status
      toast({
        title: "Payment Accepted",
        description: "Contactless payment successful",
      });

      setIsNfcOverlayActive(false);
    } catch (error: any) {
      console.error('NFC Payment error:', error);
      if (error.name !== 'AbortError') {
        toast({
          title: "Payment Failed",
          description: "Please try again or use another payment method",
          variant: "destructive"
        });
      }
    }
  };

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      itemName: "",
      price: "",
      taptStoneId: "",
    },
  });

  // Auto-populate stone in form when selected stone changes
  useEffect(() => {
    if (selectedStoneId) {
      form.setValue("taptStoneId", selectedStoneId.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoneId]);
  
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

  // Fetch active transaction (filtered by selected stone)
  const { data: activeTransaction } = useQuery<Transaction>({
    queryKey: [`/api/merchants/${merchantId}/active-transaction`, { stoneId: selectedStoneId }],
    queryFn: async () => {
      const url = selectedStoneId 
        ? `/api/merchants/${merchantId}/active-transaction?stoneId=${selectedStoneId}`
        : `/api/merchants/${merchantId}/active-transaction`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch active transaction');
      return response.json();
    },
    enabled: !!merchantId,
    refetchInterval: 5000,
  });

  // Fetch tapt stones
  const { data: taptStones = [] } = useQuery<TaptStone[]>({
    queryKey: [`/api/merchants/${merchantId}/tapt-stones`],
    enabled: !!merchantId,
  });

  // Auto-select first stone when stones load
  useEffect(() => {
    if (taptStones.length > 0 && !selectedStoneId) {
      setSelectedStoneId(taptStones[0].id);
    }
  }, [taptStones, selectedStoneId]);

  // Fetch stock items
  const { data: stockItems = [] } = useQuery<any[]>({
    queryKey: [`/api/merchants/${merchantId}/stock-items`],
    enabled: !!merchantId,
  });

  // Update current transaction when active transaction changes
  useEffect(() => {
    const txId = activeTransaction?.id;
    const txStatus = activeTransaction?.status;
    const lastProcessed = lastProcessedTxRef.current;
    
    if (txId !== undefined && txStatus) {
      // Only update if this is a new transaction or status changed
      if (lastProcessed.id !== txId || lastProcessed.status !== txStatus) {
        lastProcessedTxRef.current = { id: txId, status: txStatus };
        if (activeTransaction) {
          setCurrentTransaction(activeTransaction);
        }
      }
    } else if (txId === undefined && lastProcessed.id !== undefined) {
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

    const stoneParam = selectedStoneId ? `&stoneId=${selectedStoneId}` : '';
    const eventSource = new EventSource(
      `/api/merchants/${merchantId}/events?token=${encodeURIComponent(token)}${stoneParam}`
    );

    eventSource.onopen = () => {
      console.log(`SSE connected for merchant ${merchantId}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "transaction_update" && data.transaction) {
          // Only update if transaction belongs to the currently selected stone
          if (!selectedStoneId || data.transaction.taptStoneId === selectedStoneId) {
            setCurrentTransaction(data.transaction);
            queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/active-transaction`] });
            
            // Clear transaction if it's completed/failed/cancelled
            if (['completed', 'failed', 'cancelled'].includes(data.transaction.status)) {
              setTimeout(() => {
                setCurrentTransaction(null);
              }, 3000);
            }
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
  }, [merchantId, selectedStoneId]);

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: async (data?: PaymentFormData) => {
      if (!merchantId) throw new Error("No merchant ID");
      
      const payload = data 
        ? {
            merchantId,
            itemName: data.itemName,
            price: data.price,
            taptStoneId: parseInt(data.taptStoneId),
            status: "pending",
            splitEnabled,
          }
        : {
            merchantId,
            itemName: `$${amount} Payment`,
            price: amount,
            status: "pending",
            splitEnabled,
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
      
      // If NFC mode is active, show the overlay
      if (isNfcMode) {
        setIsNfcOverlayActive(true);
      }
      
      toast({
        title: "Payment Created",
        description: data 
          ? `Awaiting payment for ${data.itemName} - $${data.price}`
          : `Payment created`,
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
      setIsNfcOverlayActive(false);
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

  // Update stone mutation
  const updateStoneMutation = useMutation({
    mutationFn: async ({ stoneId, name }: { stoneId: number; name: string }) => {
      const response = await apiRequest("PUT", `/api/merchants/${merchantId}/tapt-stones/${stoneId}`, { name });
      return response.json();
    },
    onSuccess: () => {
      setEditingStoneId(null);
      setEditStoneName("");
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/tapt-stones`] });
      toast({
        title: "Stone Updated",
        description: "The stone name has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update stone",
        variant: "destructive",
      });
    },
  });

  // Delete stone mutation
  const deleteStoneMutation = useMutation({
    mutationFn: async (stoneId: number) => {
      const response = await apiRequest("DELETE", `/api/merchants/${merchantId}/tapt-stones/${stoneId}`, {});
      return response.json();
    },
    onSuccess: (_, deletedStoneId) => {
      // If deleted stone was selected, clear selection (auto-select will pick first)
      if (selectedStoneId === deletedStoneId) {
        setSelectedStoneId(undefined);
      }
      setEditingStoneId(null);
      setEditStoneName("");
      queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/tapt-stones`] });
      toast({
        title: "Stone Deleted",
        description: "The stone has been deleted successfully",
      });
    },
  });

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setLocation("/login");
  };

  const onSubmitPaymentForm = (data: PaymentFormData) => {
    createTransactionMutation.mutate(data);
  };

  // Derive filtered stock items without setState (avoids infinite re-render)
  const filteredStockItems = useMemo(() => {
    if (!stockSearchInput.trim()) return [];
    return stockItems.filter((item: any) =>
      item.name.toLowerCase().includes(stockSearchInput.toLowerCase()) ||
      item.description?.toLowerCase().includes(stockSearchInput.toLowerCase())
    ).slice(0, 5);
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
    if (!currentTransaction) return { 
      text: "ready", 
      color: "bg-[#00E5CC] text-[#0055FF]",
      icon: <CheckCircle2 size={28} />
    };
    
    switch (currentTransaction.status) {
      case "pending":
      case "processing":
        return { 
          text: "processing payment", 
          color: "bg-[#00E5CC] text-[#0055FF]",
          icon: <Loader2 size={28} className="animate-spin" />
        };
      case "completed":
        return { 
          text: "payment accepted", 
          color: "bg-green-400 text-white",
          icon: <Check size={28} />
        };
      case "failed":
      case "declined":
        return { 
          text: currentTransaction.status === "failed" ? "payment failed" : "payment declined",
          color: "bg-red-400 text-white",
          icon: <X size={28} />
        };
      case "cancelled":
        return { 
          text: "payment cancelled", 
          color: "bg-gray-400 text-white",
          icon: <X size={28} />
        };
      default:
        return { 
          text: "ready", 
          color: "bg-[#00E5CC] text-[#0055FF]",
          icon: <CheckCircle2 size={28} />
        };
    }
  };

  const status = getStatusDisplay();

  return (
    <div className="min-h-screen bg-[#0055FF] pb-24 md:pb-32 lg:pb-36 px-6 md:px-10 relative">
      <div className="max-w-md md:max-w-2xl mx-auto pt-24 md:pt-32">
        
        {/* NFC Toggle */}
        <div className="flex justify-center mb-12 md:mb-16">
          <button 
            onClick={() => setIsNfcMode(!isNfcMode)}
            className="bg-[#00E5CC] rounded-full px-6 md:px-8 py-3 md:py-4 flex items-center gap-3 md:gap-4 hover:opacity-90 transition-opacity"
          >
            <span className="text-[#0055FF] text-lg md:text-xl">nfc</span>
            <div className={`rounded-lg md:rounded-xl p-2 md:p-3 transition-colors ${isNfcMode ? 'bg-[#0055FF]' : 'bg-white'}`}>
              <Smartphone className={`w-5 h-5 md:w-6 md:h-6 ${isNfcMode ? 'text-white' : 'text-[#0055FF]'}`} />
            </div>
          </button>
        </div>

        {/* Payment Card */}
        <div className="bg-[#00E5CC] rounded-[48px] md:rounded-[60px] mb-8 md:mb-12 overflow-visible">
          {/* Amount Display */}
          <div className="px-12 md:px-16 py-16 md:py-24 flex flex-col items-center justify-center">
            <div className="text-[#0055FF] text-7xl md:text-8xl font-bold">
              ${currentTransaction ? (
                currentTransaction.isSplit && currentTransaction.splitAmount
                  ? parseFloat(currentTransaction.splitAmount).toFixed(2)
                  : parseFloat(currentTransaction.price).toFixed(2)
              ) : "0.00"}
            </div>
            {currentTransaction?.isSplit && (
              <div className="mt-4 text-center">
                <div className="text-xl md:text-2xl font-semibold text-[#0055FF]">
                  Split {(currentTransaction.completedSplits ?? 0) + 1} of {currentTransaction.totalSplits ?? 0}
                </div>
                <div className="text-base md:text-lg text-[#0055FF]/80 mt-1">
                  Total: ${parseFloat(currentTransaction.price).toFixed(2)}
                </div>
              </div>
            )}
          </div>
          
          {/* Action Buttons Section */}
          <div className="bg-[#E8E5E0] rounded-t-[48px] md:rounded-t-[60px] rounded-b-[48px] md:rounded-b-[60px] px-8 md:px-12 pt-8 md:pt-12 pb-6 md:pb-10 relative transition-all duration-500">
            <div className="flex items-center justify-between gap-4 md:gap-6 relative z-20">
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
                className="w-16 h-16 md:w-20 md:h-20 bg-[#0055FF] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity relative z-30"
                data-testid="button-new-payment"
              >
                <Plus className="text-white" size={28} />
              </button>
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'split-bill' ? null : 'split-bill')}
                className="w-16 h-16 md:w-20 md:h-20 bg-[#0055FF] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity"
                data-testid="button-split-bill"
              >
                <Users2 className="text-white" size={28} />
              </button>
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'share-link' ? null : 'share-link')}
                className="w-16 h-16 md:w-20 md:h-20 bg-[#0055FF] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity"
                data-testid="button-share-link"
              >
                <QrCode className="text-white" size={28} />
              </button>
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'quick-amounts' ? null : 'quick-amounts')}
                className="w-16 h-16 md:w-20 md:h-20 bg-[#0055FF] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity"
                data-testid="button-quick-amounts"
              >
                <Grid3x3 className="text-white" size={28} />
              </button>
            </div>

            {/* New Payment Dropdown */}
            <div 
              className="transition-all duration-500 ease-in-out overflow-hidden"
              style={{
                maxHeight: activeDropdown === 'new-payment' ? '800px' : '0px',
                opacity: activeDropdown === 'new-payment' ? 1 : 0,
              }}
            >
              <div className="bg-white rounded-[32px] mt-4 px-6 md:px-8 pt-8 pb-6 md:pb-8 shadow-lg relative overflow-y-auto max-h-[700px]">
                <h3 className="text-[#0055FF] font-semibold text-xl md:text-2xl mb-6">New Payment</h3>
                
                {!showPaymentForm ? (
                  <button
                    onClick={() => setShowPaymentForm(true)}
                    className="w-full bg-[#00E5CC] text-[#0055FF] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center font-medium"
                  >
                    Create Payment
                  </button>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmitPaymentForm)} className="space-y-3 md:space-y-4">
                      {/* Stock Items Search */}
                      <div className="space-y-2">
                        <label className="text-[#0055FF] font-medium text-sm">Search Stock Items</label>
                        <div className="relative">
                          <Input
                            placeholder="Type to search..."
                            value={stockSearchInput}
                            onChange={(e) => setStockSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && filteredStockItems.length > 0) {
                                e.preventDefault();
                                addStockItem(filteredStockItems[0]);
                              }
                            }}
                            className="bg-[#0055FF] text-white placeholder:text-white/70 border-0 rounded-full h-12 md:h-14 px-6 md:px-8"
                            data-testid="stock-search-input"
                          />
                          
                          {filteredStockItems.length > 0 && (
                            <div className="absolute z-50 w-full bg-white border-2 border-[#0055FF] rounded-2xl mt-2 max-h-48 overflow-y-auto shadow-xl" data-testid="stock-suggestions">
                              {filteredStockItems.map((item: any) => (
                                <div
                                  key={item.id}
                                  onClick={() => addStockItem(item)}
                                  className="p-3 cursor-pointer text-[#0055FF] border-b border-gray-200 last:border-b-0 hover:bg-[#00E5CC]/10 transition-colors"
                                  data-testid={`stock-suggestion-${item.id}`}
                                >
                                  <div className="font-semibold">{item.name}</div>
                                  <div className="text-sm opacity-70">${parseFloat(item.cost).toFixed(2)}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {selectedStockItems.length > 0 && (
                          <div className="space-y-2">
                            <label className="text-[#0055FF] font-medium text-sm">Selected Items</label>
                            <div className="flex flex-wrap gap-2" data-testid="selected-stock-items">
                              {selectedStockItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-2 bg-[#00E5CC]/20 border-2 border-[#00E5CC] rounded-full px-3 py-2 text-sm text-[#0055FF]"
                                  data-testid={`selected-stock-item-${item.id}`}
                                >
                                  <Tag size={14} />
                                  <span className="font-medium">{item.name}</span>
                                  <span>${parseFloat(item.cost).toFixed(2)}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeStockItem(item.id)}
                                    className="ml-1 hover:opacity-70 transition-opacity"
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
                            <FormControl>
                              <Input
                                placeholder="item name"
                                {...field}
                                readOnly={selectedStockItems.length > 0}
                                className="bg-[#0055FF] text-white placeholder:text-white/70 border-0 rounded-full h-12 md:h-14 px-6 md:px-8"
                                data-testid="input-item-name"
                              />
                            </FormControl>
                            <FormMessage className="text-red-500" />
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
                                placeholder="price"
                                type="number"
                                step="0.01"
                                {...field}
                                className="bg-[#0055FF] text-white placeholder:text-white/70 border-0 rounded-full h-12 md:h-14 px-6 md:px-8"
                                data-testid="input-price"
                              />
                            </FormControl>
                            <FormMessage className="text-red-500" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="taptStoneId"
                        render={({ field }) => (
                          <FormItem>
                            {isNfcMode ? (
                              <FormControl>
                                <Input
                                  value="paywave"
                                  readOnly
                                  disabled
                                  className="bg-[#0055FF] text-white border-0 rounded-full h-12 md:h-14 px-6 md:px-8 opacity-100"
                                  data-testid="input-paywave"
                                />
                              </FormControl>
                            ) : (
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-[#0055FF] text-white border-0 rounded-full h-12 md:h-14 px-6 md:px-8" data-testid="select-stone">
                                    <SelectValue placeholder="select stone" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-white border-[#0055FF]">
                                  {taptStones.map((stone) => (
                                    <SelectItem key={stone.id} value={stone.id.toString()} className="text-[#0055FF] hover:bg-[#00E5CC]/20" data-testid={`stone-option-${stone.id}`}>
                                      {stone.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <FormMessage className="text-red-500" />
                          </FormItem>
                        )}
                      />

                      <div className="flex gap-3 md:gap-4 pt-2 md:pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPaymentForm(false);
                            form.reset();
                            setSelectedStockItems([]);
                            setStockSearchInput("");
                          }}
                          className="flex-1 bg-[#E8E5E0] text-[#0055FF] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center text-sm"
                        >
                          cancel payment
                        </button>
                        <button
                          type="submit"
                          disabled={createTransactionMutation.isPending}
                          className="flex-1 bg-[#00E5CC] text-[#0055FF] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center text-sm"
                        >
                          {createTransactionMutation.isPending ? "creating..." : "create"}
                        </button>
                      </div>
                    </form>
                  </Form>
                )}
              </div>
            </div>

            {/* Split Bill Dropdown */}
            <div 
              className="transition-all duration-500 ease-in-out overflow-hidden"
              style={{
                maxHeight: activeDropdown === 'split-bill' ? '500px' : '0px',
                opacity: activeDropdown === 'split-bill' ? 1 : 0,
              }}
            >
              <div className="bg-white rounded-[32px] mt-4 px-6 md:px-8 pt-8 pb-6 md:pb-8 shadow-lg relative">
                <h3 className="text-[#0055FF] font-semibold text-xl md:text-2xl mb-6">Split Bill</h3>
                
                {currentTransaction ? (
                  <>
                    <div className="flex items-center justify-center gap-6 md:gap-8 mb-6">
                      <button
                        onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                        disabled={splitCount <= 2}
                        className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#0055FF] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-opacity"
                      >
                        <Minus className="text-white" size={24} />
                      </button>
                      
                      <div className="text-center">
                        <div className="text-5xl md:text-6xl font-bold text-[#0055FF]">{splitCount}</div>
                        <div className="text-sm md:text-base text-[#0055FF]/70 mt-1">people</div>
                        <div className="text-lg md:text-xl font-semibold text-[#0055FF] mt-2">
                          ${(parseFloat(currentTransaction.price) / splitCount).toFixed(2)} each
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setSplitCount(Math.min(10, splitCount + 1))}
                        disabled={splitCount >= 10}
                        className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#0055FF] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-opacity"
                      >
                        <Plus className="text-white" size={24} />
                      </button>
                    </div>
                    
                    <div className="flex gap-3 md:gap-4">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setSplitCount(2);
                        }}
                        className="flex-1 bg-[#E8E5E0] text-[#0055FF] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center text-sm"
                        data-testid="button-cancel-split"
                      >
                        cancel
                      </button>
                      <button
                        onClick={() => createSplitBillMutation.mutate()}
                        disabled={createSplitBillMutation.isPending}
                        className="flex-1 bg-[#00E5CC] text-[#0055FF] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center text-sm"
                        data-testid="button-confirm-split"
                      >
                        {createSplitBillMutation.isPending ? "splitting..." : "confirm split"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-[#0055FF]/60 py-4">
                    Create a payment first to split the bill
                  </div>
                )}
              </div>
            </div>

            {/* Share Link / QR Code Dropdown */}
            <div 
              className="transition-all duration-500 ease-in-out overflow-hidden"
              style={{
                maxHeight: activeDropdown === 'share-link' ? '600px' : '0px',
                opacity: activeDropdown === 'share-link' ? 1 : 0,
              }}
            >
              <div className="bg-white rounded-[32px] mt-4 px-6 md:px-8 pt-8 pb-6 md:pb-8 shadow-lg relative">
                <h3 className="text-[#0055FF] font-semibold text-xl md:text-2xl mb-6">Share Payment</h3>
                
                {currentTransaction?.paymentUrl ? (
                  <div className="space-y-4">
                    {/* Copy Link Button */}
                    <Button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(currentTransaction.paymentUrl!);
                          setCopiedPaymentLink(true);
                          toast({ title: "Link Copied!", description: "Payment link copied to clipboard" });
                          setTimeout(() => setCopiedPaymentLink(false), 2000);
                        } catch (error) {
                          toast({ 
                            title: "Copy Failed", 
                            description: "Unable to copy payment link",
                            variant: "destructive"
                          });
                        }
                      }}
                      className="w-full bg-[#00E5CC] hover:opacity-90 text-[#0055FF] rounded-full h-12 md:h-14 flex items-center justify-center gap-2 font-medium"
                    >
                      {copiedPaymentLink ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Link
                        </>
                      )}
                    </Button>

                    {/* Share Options */}
                    <div className="grid grid-cols-3 gap-3 md:gap-4">
                      <button
                        onClick={() => {
                          const emailSubject = encodeURIComponent('Payment Request');
                          const emailBody = encodeURIComponent(`Please complete your payment: ${currentTransaction.paymentUrl}`);
                          window.open(`mailto:?subject=${emailSubject}&body=${emailBody}`, '_blank');
                        }}
                        className="bg-[#0055FF] hover:opacity-90 rounded-2xl md:rounded-3xl py-4 md:py-6 text-white font-medium transition-opacity text-xs md:text-sm flex flex-col items-center gap-1 md:gap-2"
                      >
                        <span className="text-2xl md:text-3xl">📧</span>
                        <span>Email</span>
                      </button>
                      <button
                        onClick={() => {
                          const smsBody = encodeURIComponent(`Payment link: ${currentTransaction.paymentUrl}`);
                          window.open(`sms:?body=${smsBody}`, '_blank');
                        }}
                        className="bg-[#0055FF] hover:opacity-90 rounded-2xl md:rounded-3xl py-4 md:py-6 text-white font-medium transition-opacity text-xs md:text-sm flex flex-col items-center gap-1 md:gap-2"
                      >
                        <span className="text-2xl md:text-3xl">💬</span>
                        <span>SMS</span>
                      </button>
                      <button
                        onClick={() => {
                          if (currentTransaction.qrCodeUrl) {
                            window.open(currentTransaction.qrCodeUrl, '_blank');
                          } else {
                            toast({
                              title: "QR Code Unavailable",
                              description: "QR code not generated yet",
                              variant: "destructive"
                            });
                          }
                        }}
                        className="bg-[#0055FF] hover:opacity-90 rounded-2xl md:rounded-3xl py-4 md:py-6 text-white font-medium transition-opacity text-xs md:text-sm flex flex-col items-center gap-1 md:gap-2"
                      >
                        <span className="text-2xl md:text-3xl">📱</span>
                        <span>QR Code</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-[#0055FF]/60 py-4">
                    Create a payment first to share the link
                  </div>
                )}
              </div>
            </div>

            {/* Quick Amounts Dropdown */}
            <div 
              className="transition-all duration-500 ease-in-out overflow-hidden"
              style={{
                maxHeight: activeDropdown === 'quick-amounts' ? '500px' : '0px',
                opacity: activeDropdown === 'quick-amounts' ? 1 : 0,
              }}
            >
              <div className="bg-white rounded-[32px] mt-4 px-6 md:px-8 pt-8 pb-6 md:pb-8 shadow-lg relative">
                <h3 className="text-[#0055FF] font-semibold text-xl md:text-2xl mb-6">Quick Amounts</h3>
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {['5.00', '10.00', '15.00', '20.00', '25.00', '50.00', '75.00', '100.00', '150.00'].map((quickAmount) => (
                    <button
                      key={quickAmount}
                      onClick={() => {
                        setAmount(quickAmount);
                        form.setValue("price", quickAmount);
                        form.setValue("itemName", `$${quickAmount} Payment`);
                        toast({ title: "Amount Set", description: `$${quickAmount}` });
                        setActiveDropdown(null);
                      }}
                      className="bg-[#0055FF] hover:opacity-90 rounded-2xl py-3 md:py-4 text-white font-medium transition-opacity text-sm md:text-base"
                    >
                      ${quickAmount}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Processing Payment Button */}
        <button className={`w-full rounded-full py-6 mb-4 flex items-center justify-center gap-3 hover:opacity-90 transition-all duration-300 ${status.color}`}>
          <span className="text-xl">{status.text}</span>
          {status.icon}
        </button>

        {/* Split Bill Toggle Pill */}
        <div className="w-full bg-[#00E5CC] text-[#0055FF] rounded-full py-5 md:py-6 mb-4 flex items-center justify-between px-8 md:px-10">
          <span className="text-xl">split bill</span>
          <button
            onClick={() => setSplitEnabled(prev => !prev)}
            data-testid="toggle-split-bill"
            aria-label="Toggle split bill"
            className={`relative w-16 h-9 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${
              splitEnabled ? 'bg-[#0055FF]' : 'bg-red-500'
            }`}
          >
            <span
              className={`absolute top-1 w-7 h-7 bg-white rounded-full shadow transition-transform duration-200 ${
                splitEnabled ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Payment Stones Button */}
        <button 
          onClick={() => setShowStones(!showStones)}
          className="w-full bg-[#00E5CC] text-[#0055FF] rounded-full py-6 mb-4 flex items-center justify-center gap-3 hover:opacity-90 transition-opacity"
          data-testid="button-payment-stones"
        >
          <span className="text-xl">payment stones</span>
          <ChevronDown size={28} className={`transition-transform duration-300 ${showStones ? 'rotate-180' : ''}`} />
        </button>

        {/* Stones Dropdown */}
        <div className={`overflow-hidden transition-all duration-300 ${showStones ? 'max-h-[600px] mb-4' : 'max-h-0'}`}>
          <div className="bg-white rounded-3xl p-6 md:p-8 space-y-3 shadow-xl overflow-y-auto max-h-[550px]">
            {taptStones.length > 0 && taptStones.map((stone) => (
              <div key={stone.id} className="relative">
                {editingStoneId === stone.id ? (
                  <div className="space-y-3 p-4 border-2 border-[#0055FF] rounded-2xl bg-[#0055FF]/5">
                    <Input
                      value={editStoneName}
                      onChange={(e) => setEditStoneName(e.target.value)}
                      placeholder="Stone name"
                      className="bg-white text-[#0055FF] border-2 border-[#00E5CC] rounded-xl h-12 px-4"
                      data-testid={`input-edit-stone-${stone.id}`}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (editStoneName.trim()) {
                            updateStoneMutation.mutate({ stoneId: stone.id, name: editStoneName.trim() });
                          }
                        }}
                        disabled={!editStoneName.trim() || updateStoneMutation.isPending}
                        className="flex-1 bg-[#00E5CC] text-[#0055FF] rounded-xl py-2 px-4 hover:opacity-90 transition-opacity disabled:opacity-50 font-medium text-sm"
                        data-testid={`button-save-stone-${stone.id}`}
                      >
                        {updateStoneMutation.isPending ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete ${stone.name}?`)) {
                            deleteStoneMutation.mutate(stone.id);
                          }
                        }}
                        disabled={deleteStoneMutation.isPending}
                        className="flex-1 bg-red-500/20 text-red-500 rounded-xl py-2 px-4 hover:bg-red-500/30 transition-colors disabled:opacity-50 font-medium text-sm flex items-center justify-center gap-2"
                        data-testid={`button-delete-stone-${stone.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                      <button
                        onClick={() => {
                          setEditingStoneId(null);
                          setEditStoneName("");
                        }}
                        className="bg-[#E8E5E0] text-[#0055FF] rounded-xl py-2 px-4 hover:opacity-90 transition-opacity font-medium text-sm"
                        data-testid={`button-cancel-edit-stone-${stone.id}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setSelectedStoneId(stone.id);
                        setShowStones(false);
                        toast({
                          title: "Stone Selected",
                          description: `Now viewing ${stone.name}`,
                        });
                      }}
                      className={`w-full border-2 rounded-2xl py-4 md:py-5 pl-4 md:pl-6 pr-12 md:pr-16 font-medium text-base md:text-lg transition-all ${
                        selectedStoneId === stone.id
                          ? 'bg-[#0055FF] text-white border-[#0055FF]'
                          : 'bg-[#00E5CC]/20 hover:bg-[#00E5CC]/30 border-[#00E5CC] text-[#0055FF]'
                      }`}
                      data-testid={`button-stone-${stone.id}`}
                    >
                      {stone.name} - Stone {stone.stoneNumber}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingStoneId(stone.id);
                        setEditStoneName(stone.name);
                      }}
                      className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#0055FF]/20 hover:bg-[#0055FF]/40 flex items-center justify-center transition-all"
                      data-testid={`button-edit-stone-${stone.id}`}
                    >
                      <Pencil className="w-4 h-4 md:w-5 md:h-5 text-[#0055FF]" />
                    </button>
                  </>
                )}
              </div>
            ))}
            
            {/* Create Stone Button */}
            <button
              onClick={async () => {
                try {
                  const stoneNumber = (taptStones?.length || 0) + 1;
                  const response = await apiRequest('POST', `/api/merchants/${merchantId}/tapt-stones`, {
                    name: `Stone ${stoneNumber}`,
                    stoneNumber: stoneNumber
                  });
                  
                  if (response.ok) {
                    const newStone = await response.json();
                    queryClient.invalidateQueries({ queryKey: [`/api/merchants/${merchantId}/tapt-stones`] });
                    setShowStones(false);
                    toast({
                      title: "Stone Created",
                      description: `Stone ${stoneNumber} has been created successfully`,
                    });
                  } else {
                    throw new Error('Failed to create stone');
                  }
                } catch (error) {
                  console.error("Failed to create stone:", error);
                  toast({
                    title: "Creation Failed",
                    description: "Could not create new stone",
                    variant: "destructive",
                  });
                }
              }}
              className="w-full bg-[#0055FF]/10 hover:bg-[#0055FF]/20 border-2 border-dashed border-[#0055FF] rounded-2xl py-4 md:py-5 px-4 md:px-6 text-[#0055FF] font-medium text-base md:text-lg transition-all flex items-center justify-center gap-2"
              data-testid="button-create-stone"
            >
              <Plus className="w-5 h-5" />
              Create Stone
            </button>
          </div>
        </div>

        {/* Cancel Payment Button */}
        <button
          onClick={() => {
            setIsNfcOverlayActive(false);
            if (currentTransaction) {
              cancelTransactionMutation.mutate();
            }
          }}
          disabled={!currentTransaction || currentTransaction.status !== 'pending' || cancelTransactionMutation.isPending}
          className="w-full bg-[#E8E5E0] text-[#0055FF] rounded-full py-6 flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50 relative z-50"
          data-testid="button-cancel"
        >
          <span className="text-xl">cancel payment</span>
        </button>
      </div>

      {/* NFC Overlay */}
      <div 
        className="fixed left-0 right-0 bg-[#00E5CC] z-40 transition-all duration-700 ease-in-out overflow-hidden rounded-b-[85px]"
        style={{
          top: isNfcOverlayActive ? '0' : '-100%',
          bottom: isNfcOverlayActive ? '180px' : '100%',
        }}
      >
        <div className="h-full flex flex-col items-center justify-center px-6">
          <div className="flex flex-col items-center gap-12 md:gap-16">
            <h2 className="text-[#0055FF] text-3xl md:text-4xl font-semibold">tap card</h2>
            <img src={waveIconPath} alt="NFC" className="w-64 h-64 md:w-80 md:h-80 object-contain" />
          </div>
        </div>
      </div>
    </div>
  );
}
