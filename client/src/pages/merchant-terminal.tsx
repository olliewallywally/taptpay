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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeDisplay } from "@/components/qr-code-display";
import { MerchantUrlDisplay } from "@/components/merchant-url-display";
import { EnhancedPaymentStatus } from "@/components/enhanced-payment-status";
import { AnimatedBrandBackground } from "@/components/backgrounds/AnimatedBrandBackground";
import { apiRequest } from "@/lib/queryClient";
import { sseClient } from "@/lib/sse-client";
import { useToast } from "@/hooks/use-toast";
import { useDeviceStatusMonitoring, useSSEConnectionMonitoring } from "@/components/notification-system";
import { getCurrentMerchantId } from "@/lib/auth";
import { Send, Loader2, CheckCircle, Clock, XCircle, Eye, Copy, Check, QrCode, Smartphone, Waves, CreditCard, X, Edit, MoreHorizontal, ChevronDown, Tag, Share, Link2, Mail, MessageCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";
import { Link } from "wouter";

const transactionFormSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Please enter a valid price (e.g., 4.50)"),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

export default function MerchantTerminal() {
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [stonesCollapsed, setStonesCollapsed] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedStoneId, setSelectedStoneId] = useState<number | null>(null);
  const [qrCollapsed, setQrCollapsed] = useState(false);
  
  // Stock item tagging state
  const [selectedStockItems, setSelectedStockItems] = useState<any[]>([]);
  const [stockSearchInput, setStockSearchInput] = useState("");
  const [filteredStockItems, setFilteredStockItems] = useState<any[]>([]);
  
  // NFC-specific state
  const [nfcCapabilities, setNfcCapabilities] = useState<any>(null);
  const [nfcPaymentStatus, setNfcPaymentStatus] = useState<"idle" | "creating" | "ready" | "processing" | "completed" | "failed">("idle");
  const [nfcSession, setNfcSession] = useState<any>(null);
  const [showNfcOverlay, setShowNfcOverlay] = useState(false);
  
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [copiedPaymentLink, setCopiedPaymentLink] = useState(false);
  
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

  // Get stock items for this merchant
  const { data: stockItems = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) throw new Error("Failed to fetch stock items");
      return response.json();
    },
    enabled: !!merchantId,
  });

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
      const response = await apiRequest("POST", "/api/transactions", {
        merchantId,
        itemName: data.itemName,
        price: data.price,
        status: "pending",
        splitEnabled,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
      form.reset();
      setSplitEnabled(false);
      toast({
        title: "Transaction Created",
        description: splitEnabled
          ? "Split bill enabled — customer will choose how many ways to split"
          : "Customer can now proceed with payment",
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

  // Update splitEnabled on an existing pending transaction
  const updateSplitEnabledMutation = useMutation({
    mutationFn: async ({ id, splitEnabled }: { id: number; splitEnabled: boolean }) => {
      const response = await apiRequest("PATCH", `/api/transactions/${id}/split-enabled`, { splitEnabled });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "active-transaction"] });
    },
    onError: () => {
      toast({
        title: "Could not update split bill",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSplitToggle = (value: boolean) => {
    setSplitEnabled(value);
    if (activeTransaction?.id && activeTransaction?.status === "pending") {
      updateSplitEnabledMutation.mutate({ id: activeTransaction.id, splitEnabled: value });
    }
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

  // Add stock item as tag
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

  // Remove stock item tag
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

  // Helper function for efficient transaction change detection
  const hasTransactionChanged = (prev: any | null, current: any | null): boolean => {
    if (!prev || !current || prev.id !== current.id) return true;
    
    // Check only the fields that are likely to change
    return (
      prev.status !== current.status ||
      prev.completedSplits !== current.completedSplits ||
      prev.isSplit !== current.isSplit ||
      prev.totalSplits !== current.totalSplits ||
      prev.windcaveTransactionId !== current.windcaveTransactionId ||
      prev.paymentMethod !== current.paymentMethod
    );
  };

  // Set up SSE connection
  useEffect(() => {
    sseClient.connect(merchantId);
    
    sseClient.subscribe("transaction_updated", (message) => {
      // Update cache directly instead of invalidating to prevent feedback loop
      queryClient.setQueryData(["/api/merchants", merchantId, "active-transaction"], message.transaction);
      
      // Only update state if transaction actually changed (efficient comparison)
      setCurrentTransaction((prev: any) => 
        hasTransactionChanged(prev, message.transaction) ? message.transaction : prev
      );
    });

    // Add specific handler for split payment updates
    sseClient.subscribe("split_payment_updated", (message) => {
      // Handle split payment specific updates
      if (message.transactionId && message.splitPayments) {
        queryClient.setQueryData(
          ["/api/transactions", message.transactionId, "split-payments"], 
          message.splitPayments
        );
      }
    });

    return () => {
      sseClient.disconnect();
    };
  }, [merchantId, queryClient]);

  // Device status monitoring
  useDeviceStatusMonitoring();
  useSSEConnectionMonitoring(merchantId);

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
    if (activeTransaction && currentTransaction?.id !== activeTransaction.id) {
      setCurrentTransaction(activeTransaction);
      // Sync split toggle with what's stored in DB
      setSplitEnabled(!!activeTransaction.splitEnabled);
    }
  }, [activeTransaction]);

  const onSubmit = (data: TransactionFormData) => {
    createTransactionMutation.mutate(data);
  };

  const handleActionClick = (action: string) => {
    console.log("Action clicked:", action);
    console.log("Current activeAction:", activeAction);
    console.log("Tapt stones:", taptStones);
    
    // Force send to work with error boundary
    if (action === "send") {
      try {
        setActiveAction("send");
        console.log("FORCED SEND ACTION SET");
        return;
      } catch (error) {
        console.error("Error setting send action:", error);
        return;
      }
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

  // Share Payment Link Functions
  const copyPaymentLinkToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPaymentLink(true);
      toast({
        title: "Link Copied!",
        description: "Payment link has been copied to clipboard",
      });
      setTimeout(() => setCopiedPaymentLink(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast({
        title: "Copy Failed",
        description: "Unable to copy payment link to clipboard",
        variant: "destructive",
      });
    }
  };

  const sharePaymentLink = async (method: string, url: string) => {
    switch (method) {
      case 'email':
        const emailSubject = encodeURIComponent(`Payment Request - ${merchant?.businessName || 'Payment'}`);
        const emailBody = encodeURIComponent(`Please complete your payment using this link: ${url}`);
        window.open(`mailto:?subject=${emailSubject}&body=${emailBody}`, '_blank');
        break;
      case 'sms':
        const smsBody = encodeURIComponent(`Payment link: ${url}`);
        window.open(`sms:?body=${smsBody}`, '_blank');
        break;
      case 'copy':
        await copyPaymentLinkToClipboard(url);
        break;
      default:
        break;
    }
  };


// StonesSection Component
function StonesSection({ 
  stonesCollapsed, 
  setStonesCollapsed, 
  taptStones, 
  merchantId, 
  queryClient, 
  toast 
}: {
  stonesCollapsed: boolean;
  setStonesCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  taptStones: any[];
  merchantId: string;
  queryClient: any;
  toast: any;
}) {
  return (
    <div 
      className="rounded-2xl p-4 transition-all duration-300"
      style={{ backgroundColor: '#00FF66' }}
      data-testid="stones-section"
    >
      <div
        className="flex items-center justify-center text-black cursor-pointer relative"
        onClick={() => setStonesCollapsed(prev => !prev)}
        data-testid="stones-header"
      >
        <h3 className="text-lg font-semibold">Stones</h3>
        <ChevronDown
          className={`absolute right-0 transition-transform duration-300 ${
            stonesCollapsed ? '' : 'rotate-180'
          }`}
          size={20}
          data-testid="stones-chevron"
        />
      </div>

      <div
        className={`transition-all duration-300 overflow-hidden ${
          stonesCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100 mt-4'
        }`}
      >
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="text-center">
            {taptStones && Array.isArray(taptStones) && taptStones.length > 0 ? (
              taptStones.map((stone: any) => (
                <div key={stone.id} className="mb-6 last:mb-0" data-testid={`stone-item-${stone.id}`}>
                  <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4 mx-auto">
                    <QRCodeDisplay 
                      merchantId={parseInt(merchantId)}
                      stoneId={stone.id}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-white text-sm font-medium">
                      Stone {stone.stoneNumber} - {stone.name}
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          const canvas = document.querySelector(`canvas[data-stone-id="${stone.id}"]`) as HTMLCanvasElement;
                          if (canvas) {
                            const link = document.createElement('a');
                            link.download = `stone-${stone.stoneNumber}-qr.png`;
                            link.href = canvas.toDataURL();
                            link.click();
                          }
                        } catch (error) {
                          console.error('Download failed:', error);
                        }
                      }}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded-lg transition-colors font-medium"
                      data-testid={`download-qr-${stone.id}`}
                    >
                      Download QR Code
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center">
                <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4 mx-auto">
                  <QrCode size={64} className="text-gray-400" />
                </div>
                <p className="text-gray-300 text-sm">No tapt stones available</p>
              </div>
            )}
            
            <div className="text-center mt-6 pt-4 border-t border-gray-600">
              <button
                onClick={async () => {
                  try {
                    const stoneNumber = (taptStones?.length || 0) + 1;
                    const response = await apiRequest('POST', `/api/merchants/${merchantId}/tapt-stones`, {
                      name: `Stone ${stoneNumber}`,
                      stoneNumber: stoneNumber
                    });
                    
                    queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "tapt-stones"] });
                    
                    toast({
                      title: "Stone Created",
                      description: `Stone ${stoneNumber} has been created successfully`,
                    });
                  } catch (error) {
                    console.error("Failed to create stone:", error);
                    toast({
                      title: "Creation Failed",
                      description: "Could not create new stone",
                      variant: "destructive",
                    });
                  }
                }}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors font-medium"
                data-testid="create-stone-button"
              >
                + Create New Stone
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ActionsToolbar Component
function ActionsToolbar({ 
  activeAction, 
  handleActionClick, 
  stockTaggingComponent, 
  itemFormComponent,
  form,
  setActiveAction 
}: {
  activeAction: string | null;
  handleActionClick: (action: string) => void;
  stockTaggingComponent: React.ReactNode;
  itemFormComponent: React.ReactNode;
  form: any;
  setActiveAction: (action: string) => void;
}) {
  const actionButtons = [
    { id: "edit", icon: Edit, label: "New Payment", testId: "button-new-payment" },
    { id: "send", icon: Send, label: "Share Link", testId: "button-share-link" },
    { id: "quick", icon: Tag, label: "Quick Amounts", testId: "button-quick-amounts" }
  ];

  return (
    <div className="bg-gray-800/50 rounded-2xl p-4" data-testid="actions-toolbar">
      <div className="grid grid-cols-2 gap-3">
        {actionButtons.map(({ id, icon: IconComponent, label, testId }) => (
          <button
            key={id}
            onClick={() => handleActionClick(id)}
            className={`flex flex-col items-center p-4 rounded-xl transition-all duration-200 ${
              activeAction === id 
                ? 'text-black' 
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
            style={{
              backgroundColor: activeAction === id ? '#00FF66' : undefined
            }}
            data-testid={testId}
          >
            <IconComponent size={24} />
            <span className="text-xs mt-1 font-medium">{label}</span>
          </button>
        ))}
      </div>
      
      {/* Action Panel */}
      <div 
        className="overflow-hidden transition-all duration-250 ease-in-out"
        style={{
          maxHeight: activeAction ? '600px' : '0px',
          opacity: activeAction ? 1 : 0
        }}
      >
        <div className="bg-gray-800 rounded-2xl p-4 mt-3">
          {activeAction === "edit" && (
            <div className="space-y-2" data-testid="edit-panel">
              <h3 className="text-sm font-semibold text-white">Edit Transaction</h3>
              {stockTaggingComponent}
              {itemFormComponent}
            </div>
          )}

          {activeAction === "send" && (
            <div className="space-y-2" data-testid="send-panel">
              <h3 className="text-sm font-semibold text-white">Share Payment Link</h3>
              <p className="text-xs text-gray-400">Send payment link to customer via email or SMS</p>
              <div className="py-2">
                {merchant?.paymentUrl ? (
                  <div className="space-y-3">
                    {/* Payment URL Display */}
                    <div className="bg-gray-700 rounded-xl p-3">
                      <p className="text-xs text-gray-300 mb-2">Payment Link:</p>
                      <div className="bg-gray-800 rounded-lg p-2 text-xs text-white break-all">
                        {merchant.paymentUrl}
                      </div>
                    </div>

                    {/* Copy Link Button */}
                    <Button
                      onClick={() => copyPaymentLinkToClipboard(merchant.paymentUrl)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg h-10"
                      data-testid="copy-payment-link"
                    >
                      {copiedPaymentLink ? (
                        <>
                          <Check size={16} className="mr-2" />
                          Link Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={16} className="mr-2" />
                          Copy Link
                        </>
                      )}
                    </Button>

                    {/* Share Options */}
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => sharePaymentLink('email', merchant.paymentUrl)}
                        variant="outline"
                        className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 text-xs py-2"
                        data-testid="share-email"
                      >
                        <Mail size={14} className="mr-1" />
                        Email
                      </Button>
                      <Button
                        onClick={() => sharePaymentLink('sms', merchant.paymentUrl)}
                        variant="outline"
                        className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 text-xs py-2"
                        data-testid="share-sms"
                      >
                        <MessageCircle size={14} className="mr-1" />
                        SMS
                      </Button>
                      <Button
                        onClick={() => window.open(merchant.qrCodeUrl, '_blank')}
                        variant="outline"
                        className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 text-xs py-2"
                        data-testid="view-qr"
                      >
                        <QrCode size={14} className="mr-1" />
                        QR Code
                      </Button>
                    </div>

                    {/* Tapt Stone Links */}
                    {taptStones && taptStones.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-gray-300">Stone-Specific Links:</h4>
                        <div className="space-y-1">
                          {taptStones.map((stone: any) => (
                            <div key={stone.id} className="bg-gray-700 rounded-lg p-2 flex items-center justify-between">
                              <span className="text-xs text-white">Stone {stone.stoneNumber}</span>
                              <Button
                                onClick={() => copyPaymentLinkToClipboard(stone.paymentUrl)}
                                variant="ghost" 
                                size="sm"
                                className="text-gray-300 hover:text-white h-6 px-2"
                                data-testid={`copy-stone-link-${stone.id}`}
                              >
                                <Copy size={12} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-gray-400 text-xs">Payment URL not available</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeAction === "quick" && (
            <div className="space-y-2" data-testid="quick-panel">
              <h3 className="text-sm font-semibold text-white">Quick Amounts</h3>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 20, 25, 50, 100].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => {
                      form.setValue("price", amount.toString());
                      form.setValue("itemName", `$${amount} Item`);
                      setActiveAction("edit");
                    }}
                    className="p-2 sm:p-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm font-medium transition-colors"
                    data-testid={`quick-amount-${amount}`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ItemForm Component
function ItemForm({ 
  form, 
  onSubmit, 
  taptStones, 
  selectedStoneId, 
  setSelectedStoneId, 
  selectedStockItems, 
  isSubmitting,
  splitEnabled,
  setSplitEnabled,
}: {
  form: any;
  onSubmit: (data: any) => void;
  taptStones: any[];
  selectedStoneId: number | null;
  setSelectedStoneId: (id: number | null) => void;
  selectedStockItems: any[];
  isSubmitting: boolean;
  splitEnabled: boolean;
  setSplitEnabled: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2" data-testid="item-form-container">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-300">
          Select Tapt Stone:
        </label>
        {taptStones && Array.isArray(taptStones) && taptStones.length > 0 ? (
          <Select
            value={selectedStoneId?.toString() || ""}
            onValueChange={(value) => {
              setSelectedStoneId(value ? parseInt(value, 10) : null);
            }}
          >
            <SelectTrigger 
              className="w-full bg-gray-700 border-gray-600 text-white rounded-lg h-10 focus:ring-2 focus:ring-green-500 transition-all duration-200"
              data-testid="stone-selector"
            >
              <SelectValue placeholder="Choose a stone" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 rounded-lg">
              {taptStones.map((stone: any) => (
                <SelectItem 
                  key={`stone-${stone.id}`} 
                  value={stone.id.toString()}
                  className="text-white hover:bg-gray-700 focus:bg-gray-700 cursor-pointer transition-colors duration-150 rounded-md"
                >
                  Stone {stone.stoneNumber} - {stone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-center py-2">
            <p className="text-gray-400 text-xs">No Tapt Stones available</p>
          </div>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
          <FormField
            control={form.control}
            name="itemName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-gray-300">Item Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter item name or use stock items above"
                    {...field}
                    className="bg-gray-700 border-gray-600 text-white rounded-lg h-8"
                    readOnly={selectedStockItems.length > 0}
                    data-testid="input-item-name"
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
                    placeholder="0.00"
                    {...field}
                    className="bg-gray-700 border-gray-600 text-white rounded-lg h-8"
                    data-testid="input-price"
                  />
                </FormControl>
                <FormMessage className="text-red-300 text-xs" />
              </FormItem>
            )}
          />

          {/* Split Bill Toggle */}
          <div className="flex items-center justify-between bg-gray-700 rounded-lg px-3 py-2">
            <div>
              <p className="text-xs font-medium text-white">Split Bill</p>
              <p className="text-[10px] text-gray-400">Customer chooses how many ways to split</p>
            </div>
            <Switch
              checked={splitEnabled}
              onCheckedChange={handleSplitToggle}
              data-testid="toggle-split-bill"
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-green-600 hover:bg-green-700 text-white h-8 text-xs font-medium"
            data-testid="button-create-transaction"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Transaction"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}

// StockTagging Component
function StockTagging({ 
  stockSearchInput, 
  setStockSearchInput, 
  filteredStockItems, 
  selectedStockItems, 
  addStockItem, 
  removeStockItem 
}: {
  stockSearchInput: string;
  setStockSearchInput: (value: string) => void;
  filteredStockItems: any[];
  selectedStockItems: any[];
  addStockItem: (item: any) => void;
  removeStockItem: (id: number) => void;
}) {
  return (
    <div className="space-y-2" data-testid="stock-tagging-container">
      <div className="relative">
        <label className="text-xs text-gray-300">Search Stock Items</label>
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
          className="bg-gray-700 border-gray-600 text-white rounded-lg h-8 mb-2"
          data-testid="stock-search-input"
        />
        
        {filteredStockItems.length > 0 && (
          <div className="absolute z-10 w-full bg-gray-700 border border-gray-600 rounded-lg mt-1 max-h-32 overflow-y-auto" data-testid="stock-suggestions">
            {filteredStockItems.map((item: any) => (
              <div
                key={item.id}
                onClick={() => addStockItem(item)}
                className="p-2 cursor-pointer text-white text-xs border-b border-gray-600 last:border-b-0 hover:bg-gray-600"
                data-testid={`stock-suggestion-${item.id}`}
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-gray-400">${parseFloat(item.cost).toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedStockItems.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-gray-300">Selected Items</label>
          <div className="flex flex-wrap gap-1" data-testid="selected-stock-items">
            {selectedStockItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 bg-gray-600 rounded-full px-2 py-1 text-xs text-white"
                data-testid={`selected-stock-item-${item.id}`}
              >
                <Tag size={12} />
                <span>{item.name}</span>
                <span className="text-gray-300">${parseFloat(item.cost).toFixed(2)}</span>
                <button
                  onClick={() => removeStockItem(item.id)}
                  className="ml-1 text-gray-400 hover:text-white"
                  data-testid={`remove-stock-item-${item.id}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// PaymentStatus Component
function PaymentStatus({ transaction }: { transaction: any }) {
  if (!transaction?.status) return null;

  const statusConfig = {
    pending: {
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-400/30",
      iconColor: "text-blue-300",
      textColor: "text-blue-200",
      icon: Clock,
      title: "Awaiting Payment",
      description: "Customer can now scan QR code to pay"
    },
    processing: {
      bgColor: "bg-orange-500/10", 
      borderColor: "border-orange-400/30",
      iconColor: "text-orange-300",
      textColor: "text-orange-200",
      icon: Loader2,
      title: "Processing Payment",
      description: "Payment is being processed..."
    },
    completed: {
      bgColor: "bg-green-500/10",
      borderColor: "border-green-400/30", 
      iconColor: "text-green-300",
      textColor: "text-green-200",
      icon: CheckCircle,
      title: "Payment Accepted",
      description: "Transaction completed successfully!"
    },
    failed: {
      bgColor: "bg-red-500/10",
      borderColor: "border-red-400/30",
      iconColor: "text-red-300",
      textColor: "text-red-200", 
      icon: XCircle,
      title: "Payment Failed",
      description: "Please try again or contact support"
    }
  };

  const config = statusConfig[transaction.status as keyof typeof statusConfig];
  if (!config) return null;

  const IconComponent = config.icon;

  return (
    <div 
      className={`flex flex-col items-center space-y-1 sm:space-y-3 p-4 sm:p-6 backdrop-blur-sm rounded-2xl border ${config.bgColor} ${config.borderColor}`}
      data-testid={`payment-status-${transaction.status}`}
    >
      <div className="flex items-center space-x-2 sm:space-x-3">
        <IconComponent 
          className={`w-5 h-5 sm:w-6 sm:h-6 ${config.iconColor} ${transaction.status === 'processing' ? 'animate-spin' : ''}`} 
        />
        <span className={`text-base sm:text-lg font-medium ${config.textColor}`}>
          {config.title}
        </span>
      </div>
      
      {transaction.isSplit ? (
        <div className="text-center space-y-1">
          <p className={`text-xs sm:text-sm ${config.iconColor}`}>Split Bill Payment</p>
          <div className="flex items-center justify-center space-x-2">
            <span className={`text-sm font-bold ${config.textColor}`}>
              {transaction.completedSplits + 1} of {transaction.totalSplits}
            </span>
            <span className={`text-xs ${config.iconColor}`}>payments</span>
          </div>
          <p className={`text-xs ${config.iconColor}`}>
            ${parseFloat(transaction.splitAmount).toFixed(2)} per person
          </p>
        </div>
      ) : (
        <p className={`text-xs sm:text-sm ${config.iconColor} text-center`}>
          {config.description}
        </p>
      )}
    </div>
  );
}

  return (
    <AnimatedBrandBackground
      backgroundColor="#1a1a1a"
      circleColor="#2d2d2d"
      largeCirclePosition="top-[-120px] right-[-120px]"
      smallCirclePosition="top-[200px] right-[250px]"
      extraLargeCirclePosition="bottom-[-120px] right-[-120px]"
      extraSmallCirclePosition="bottom-[200px] right-[250px]"
    >
      <div className="relative z-10 min-h-screen text-white">

        {/* Two-Pane Layout Container */}
        <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
            
            {/* Left Pane: Amount & Actions */}
            <div className="space-y-4 sm:space-y-6 w-full max-w-2xl mx-auto lg:mx-0">
              {/* Amount Box */}
              <div>
                {currentTransaction || activeTransaction ? (
                  <div 
                    className="rounded-2xl p-4 sm:p-6 text-center"
                    style={{ backgroundColor: '#00FF66' }}
                    data-testid="active-transaction-display"
                  >
                    <div className="text-black text-base sm:text-lg font-medium mb-1 sm:mb-2">Total</div>
                    <div className="text-black text-3xl sm:text-4xl font-bold">
                      ${parseFloat((currentTransaction || activeTransaction).price).toFixed(2)}
                    </div>
                    <div className="text-black text-xs sm:text-sm mt-1 sm:mt-2">
                      {(currentTransaction || activeTransaction).itemName}
                    </div>
                  </div>
                ) : (
                  <div 
                    className="rounded-2xl p-4 sm:p-6 text-center border-2 border-dashed cursor-pointer"
                    style={{ borderColor: '#00FF66' }}
                    data-testid="no-transaction-placeholder"
                  >
                    <div className="text-gray-400 text-base sm:text-lg font-medium mb-1 sm:mb-2">Total</div>
                    <div className="text-gray-400 text-3xl sm:text-4xl font-bold">$0.00</div>
                    <div className="text-gray-400 text-xs sm:text-sm mt-1 sm:mt-2">
                      No active transaction
                    </div>
                    <div className="text-gray-500 text-xs mt-2 sm:mt-3">
                      Click "New Payment" below to get started
                    </div>
                  </div>
                )}
              </div>


              {/* Actions Toolbar */}
              <ActionsToolbar 
                activeAction={activeAction}
                handleActionClick={handleActionClick}
                stockTaggingComponent={
                  <StockTagging 
                    stockSearchInput={stockSearchInput}
                    setStockSearchInput={setStockSearchInput}
                    filteredStockItems={filteredStockItems}
                    selectedStockItems={selectedStockItems}
                    addStockItem={addStockItem}
                    removeStockItem={removeStockItem}
                  />
                }
                itemFormComponent={
                  <ItemForm 
                    form={form}
                    onSubmit={onSubmit}
                    taptStones={taptStones}
                    selectedStoneId={selectedStoneId}
                    setSelectedStoneId={setSelectedStoneId}
                    selectedStockItems={selectedStockItems}
                    isSubmitting={createTransactionMutation.isPending}
                    splitEnabled={splitEnabled}
                    setSplitEnabled={setSplitEnabled}
                  />
                }
                form={form}
                setActiveAction={setActiveAction}
              />
            </div>

            {/* Right Pane: QR Code & Payment Status */}
            <div className="space-y-4 sm:space-y-6 w-full max-w-2xl mx-auto lg:mx-0">
              {/* Payment Status */}
              {(currentTransaction || activeTransaction) && (
                <PaymentStatus transaction={currentTransaction || activeTransaction} />
              )}

              {/* Stones Section */}
              <StonesSection 
                stonesCollapsed={stonesCollapsed}
                setStonesCollapsed={setStonesCollapsed}
                taptStones={taptStones}
                merchantId={merchantId.toString()}
                queryClient={queryClient}
                toast={toast}
              />
            </div>
          </div>
        </div>
      </div>

    </AnimatedBrandBackground>
  );
}