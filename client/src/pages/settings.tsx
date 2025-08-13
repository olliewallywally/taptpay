import { useQuery, useMutation } from "@tanstack/react-query";
import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { updateMerchantDetailsSchema, updateBankAccountSchema } from "@shared/schema";
import { 
  Settings as SettingsIcon, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink,
  Key,
  Shield,
  Globe,
  Building,
  CreditCard,
  Edit,
  Save,
  X,
  QrCode,
  Plus,
  Trash2,
  Download,
  Loader2,
  Menu,
  Mail,
  Phone,
  MapPin
} from "lucide-react";
import { z } from "zod";



type MerchantDetailsFormData = z.infer<typeof updateMerchantDetailsSchema>;
type BankAccountFormData = z.infer<typeof updateBankAccountSchema>;


export default function Settings() {
  const { toast } = useToast();
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);


  // Get current user first to get their merchant ID
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const merchantId = (user as any)?.user?.merchantId;

  // Get current merchant data using the authenticated user's merchant ID
  const { data: merchant, isLoading: merchantLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      if (!merchantId) throw new Error("No merchant ID available");
      const response = await fetch(`/api/merchants/${merchantId}`);
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
    enabled: !!merchantId,
  });

  // Get tapt stones for this merchant
  const { data: taptStones = [], isLoading: stonesLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      if (!merchantId) throw new Error("No merchant ID available");
      const response = await fetch(`/api/merchants/${merchantId}/tapt-stones`);
      if (!response.ok) throw new Error("Failed to fetch tapt stones");
      return response.json();
    },
    enabled: !!merchantId,
  });

  // Get Windcave API status
  const { data: apiStatus, isLoading } = useQuery({
    queryKey: ["/api/windcave/status"],
    queryFn: async () => {
      const response = await fetch("/api/windcave/status");
      if (!response.ok) throw new Error("Failed to fetch API status");
      return response.json();
    },
  });

  // Forms for merchant details
  const merchantDetailsForm = useForm<MerchantDetailsFormData>({
    resolver: zodResolver(updateMerchantDetailsSchema),
    defaultValues: {
      businessName: merchant?.businessName || "",
      contactEmail: merchant?.contactEmail || "",
      contactPhone: merchant?.contactPhone || "",
      businessAddress: merchant?.businessAddress || "",
    },
  });

  const bankAccountForm = useForm<BankAccountFormData>({
    resolver: zodResolver(updateBankAccountSchema),
    defaultValues: {
      bankName: merchant?.bankName || "",
      bankAccountNumber: merchant?.bankAccountNumber || "",
      bankBranch: merchant?.bankBranch || "",
      accountHolderName: merchant?.accountHolderName || "",
    },
  });



  // Update form defaults when merchant data loads
  useEffect(() => {
    if (merchant) {
      merchantDetailsForm.reset({
        businessName: merchant.businessName || "",
        contactEmail: merchant.contactEmail || "",
        contactPhone: merchant.contactPhone || "",
        businessAddress: merchant.businessAddress || "",
      });
      bankAccountForm.reset({
        bankName: merchant.bankName || "",
        bankAccountNumber: merchant.bankAccountNumber || "",
        bankBranch: merchant.bankBranch || "",
        accountHolderName: merchant.accountHolderName || "",
      });

    }
  }, [merchant, merchantDetailsForm, bankAccountForm]);

  // Mutations for updating merchant data
  const updateDetailsMutation = useMutation({
    mutationFn: async (data: MerchantDetailsFormData) => {
      if (!merchantId) throw new Error("No merchant ID available");
      return apiRequest("PUT", `/api/merchants/${merchantId}/details`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      setEditingDetails(false);
      toast({
        title: "Business Details Updated",
        description: "Your business information has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update business details. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateBankAccountMutation = useMutation({
    mutationFn: async (data: BankAccountFormData) => {
      if (!merchantId) throw new Error("No merchant ID available");
      return apiRequest("PUT", `/api/merchants/${merchantId}/bank-account`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      setEditingBankAccount(false);
      toast({
        title: "Bank Account Updated",
        description: "Your bank account details have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update bank account details. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create tapt stone mutation
  const createTaptStoneMutation = useMutation({
    mutationFn: async () => {
      if (!merchantId) throw new Error("No merchant ID available");
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

  // Delete tapt stone mutation
  const deleteTaptStoneMutation = useMutation({
    mutationFn: async (stoneId: number) => {
      if (!merchantId) throw new Error("No merchant ID available");
      const response = await apiRequest("DELETE", `/api/merchants/${merchantId}/tapt-stones/${stoneId}`, {});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "tapt-stones"] });
      toast({
        title: "Success",
        description: "Tapt stone deleted successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete tapt stone",
        variant: "destructive",
      });
    },
  });

  // Download QR code function
  const downloadQRCode = async (stoneId: number, stoneNumber: number) => {
    try {
      const downloadUrl = `/api/merchants/${merchantId}/stone/${stoneId}/qr?size=800&download=true`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Failed to fetch QR code');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `tapt-stone-${stoneNumber}-qr.png`;
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "QR Code Downloaded",
        description: `Tapt Stone ${stoneNumber} QR code saved to downloads.`,
      });
    } catch (error) {
      console.error('Failed to download QR code:', error);
      toast({
        title: "Download Failed",
        description: "Could not download QR code. Please try again.",
        variant: "destructive",
      });
    }
  };

  const onSubmitDetails = (data: MerchantDetailsFormData) => {
    updateDetailsMutation.mutate(data);
  };

  const onSubmitBankAccount = (data: BankAccountFormData) => {
    updateBankAccountMutation.mutate(data);
  };

  return (
    <>
      {/* Menu Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Sliding Menu - Mobile Optimized */}
      <div 
        className={`fixed right-0 top-0 h-full ${isMobile ? 'w-full' : 'w-80'} bg-gray-800 border-l border-gray-700 z-50 transform transition-transform duration-300 ease-in-out ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className={`${isMobile ? 'p-4' : 'p-6'}`}>
          <div className={`flex justify-between items-center ${isMobile ? 'mb-6' : 'mb-8'}`}>
            <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-white`}>Menu</h2>
            <button onClick={() => setMenuOpen(false)} className="text-white/70 hover:text-white">
              <X className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6'}`} />
            </button>
          </div>
          <nav className="space-y-4">
            <a href="/dashboard" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
              Dashboard
            </a>
            <a href="/merchant" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
              Terminal
            </a>
            <a href="/transactions" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
              Transactions
            </a>
            <a href="/settings" className="block py-3 px-4 text-[#00CC52] rounded-xl font-medium">
              Settings
            </a>
            <div className="pt-4 mt-4 border-t border-gray-600">
              <button 
                onClick={() => {
                  localStorage.removeItem('auth-token');
                  window.location.href = '/login';
                }}
                className="block w-full text-left py-3 px-4 text-red-400 hover:text-red-300 rounded-xl transition-colors"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Main Content with Slide Animation */}
      <div 
        className={`min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 transform transition-transform duration-300 ease-in-out ${
          menuOpen ? (isMobile ? '-translate-x-full' : '-translate-x-80') : 'translate-x-0'
        }`}
      >
        {/* Menu Icon - Mobile Optimized */}
        <div className="fixed top-4 right-4 z-30">
          <button
            onClick={() => setMenuOpen(true)}
            className={`p-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors ${
              isMobile ? 'p-2' : 'p-3'
            }`}
          >
            <Menu className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6'}`} />
          </button>
        </div>

        <div className={`container mx-auto px-3 sm:px-4 pb-4 sm:pb-8 ${isMobile ? 'pt-16' : 'pt-20'}`}>
      <div className={`${isMobile ? 'mb-4' : 'mb-6 sm:mb-8'}`}>
        <h1 className={`font-bold text-white mb-2 ${isMobile ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>Settings & Configuration</h1>
        <p className={`text-white/70 ${isMobile ? 'text-xs' : 'text-sm sm:text-base'}`}>Manage your payment processing configuration and API connections</p>
      </div>



      {/* Merchant Business Details Card */}
      <div className={`backdrop-blur-xl bg-white/5 border border-white/20 rounded-3xl shadow-2xl mb-6 sm:mb-8 hover:bg-white/10 hover:border-white/30 transition-all duration-300 ${isMobile ? 'p-4 rounded-2xl' : 'p-6 rounded-3xl'}`}>
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building className="h-5 w-5 text-white" />
              <div>
                <h3 className="text-lg font-semibold text-white">Business Details</h3>
                <p className="text-white/70 text-sm">
                  Manage your business information and contact details
                </p>
              </div>
            </div>
            {!editingDetails && (
              <button
                onClick={() => setEditingDetails(true)}
                className={`backdrop-blur-sm bg-white/10 border border-white/20 text-white rounded-xl hover:bg-white/20 hover:border-white/30 transition-all duration-300 text-sm font-medium ${isMobile ? 'px-3 py-1.5' : 'px-4 py-2'}`}
              >
                <Edit className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'} inline`} />
                {isMobile ? 'Edit' : 'Edit'}
              </button>
            )}
          </div>
        </div>
        <div>
          {merchantLoading ? (
            <div className="animate-pulse space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : editingDetails ? (
            <Form {...merchantDetailsForm}>
              <form onSubmit={merchantDetailsForm.handleSubmit(onSubmitDetails)} className="space-y-4">
                <FormField
                  control={merchantDetailsForm.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your business name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={merchantDetailsForm.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="business@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={merchantDetailsForm.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+64 21 123 4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={merchantDetailsForm.control}
                  name="businessAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Address</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter your business address"
                          className="min-h-[80px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex space-x-2">
                  <Button 
                    type="submit" 
                    disabled={updateDetailsMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {updateDetailsMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setEditingDetails(false);
                      merchantDetailsForm.reset();
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-white/70">Business Name</label>
                  <p className="text-white">{merchant?.businessName || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/70">Contact Email</label>
                  <p className="text-white">{merchant?.contactEmail || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/70">Contact Phone</label>
                  <p className="text-white">{merchant?.contactPhone || "Not set"}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-white/70">Business Address</label>
                <p className="text-white whitespace-pre-line">{merchant?.businessAddress || "Not set"}</p>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Bank Account Details Card */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-3xl p-6 shadow-2xl mb-6 sm:mb-8 hover:bg-white/10 hover:border-white/30 transition-all duration-300">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-white" />
              <div>
                <h3 className="text-lg font-semibold text-white">Bank Account Details</h3>
                <p className="text-white/70 text-sm">
                  Manage your bank account information for payment settlements
                </p>
              </div>
            </div>
            {!editingBankAccount && (
              <button
                onClick={() => setEditingBankAccount(true)}
                className="backdrop-blur-sm bg-white/10 border border-white/20 text-white px-4 py-2 rounded-xl hover:bg-white/20 hover:border-white/30 transition-all duration-300 text-sm font-medium"
              >
                <Edit className="w-4 h-4 mr-2 inline" />
                Edit
              </button>
            )}
          </div>
        </div>
        <div>
          {merchantLoading ? (
            <div className="animate-pulse space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : editingBankAccount ? (
            <Form {...bankAccountForm}>
              <form onSubmit={bankAccountForm.handleSubmit(onSubmitBankAccount)} className="space-y-4">
                <FormField
                  control={bankAccountForm.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input placeholder="ANZ, ASB, BNZ, Westpac, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={bankAccountForm.control}
                  name="bankAccountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="12-3456-1234567-12" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={bankAccountForm.control}
                  name="bankBranch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Branch</FormLabel>
                      <FormControl>
                        <Input placeholder="Wellington Central, Auckland City, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={bankAccountForm.control}
                  name="accountHolderName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Holder Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter the name on the account" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex space-x-2">
                  <Button 
                    type="submit" 
                    disabled={updateBankAccountMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {updateBankAccountMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setEditingBankAccount(false);
                      bankAccountForm.reset();
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-white/70">Bank Name</label>
                  <p className="text-white">{merchant?.bankName || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/70">Account Number</label>
                  <p className="text-white font-mono">{merchant?.bankAccountNumber || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/70">Bank Branch</label>
                  <p className="text-white">{merchant?.bankBranch || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-white/70">Account Holder</label>
                  <p className="text-white">{merchant?.accountHolderName || "Not set"}</p>
                </div>
              </div>
              {(!merchant?.bankName || !merchant?.bankAccountNumber) && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Bank Details Required</AlertTitle>
                  <AlertDescription>
                    Please add your bank account details to receive payment settlements.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tapt Stone Management */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-3xl p-6 shadow-2xl mb-6 sm:mb-8 hover:bg-white/10 hover:border-white/30 transition-all duration-300">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <QrCode className="h-5 w-5 text-white" />
              <div>
                <h3 className="text-lg font-semibold text-white">Tapt Stone Management</h3>
                <p className="text-white/70 text-sm">
                  Manage your tapt stones and their QR codes (max 10 per merchant)
                </p>
              </div>
            </div>
            {taptStones.length < 10 && (
              <Button
                onClick={() => createTaptStoneMutation.mutate()}
                disabled={createTaptStoneMutation.isPending}
                className="backdrop-blur-sm bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-2 rounded-xl hover:bg-green-500/30 hover:border-green-500/40 transition-all duration-300 text-sm font-medium"
              >
                {createTaptStoneMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Stone
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {stonesLoading ? (
            <div className="animate-pulse space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white/10 rounded-xl p-4 h-16"></div>
              ))}
            </div>
          ) : taptStones.length === 0 ? (
            <div className="text-center py-8">
              <QrCode className="h-12 w-12 text-white/40 mx-auto mb-4" />
              <p className="text-white/70 text-sm">No tapt stones created yet</p>
              <p className="text-white/50 text-xs mt-1">Create your first tapt stone to start accepting payments</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {taptStones.map((stone: any) => (
                <div key={stone.id} className="bg-white/10 border border-white/20 rounded-xl p-4 hover:bg-white/15 transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center justify-center">
                        <span className="text-green-400 font-bold text-sm">{stone.stoneNumber}</span>
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{stone.name}</h4>
                        <p className="text-white/60 text-xs">Created {new Date(stone.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => downloadQRCode(stone.id, stone.stoneNumber)}
                        size="sm"
                        className="bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/40 transition-all duration-200"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => deleteTaptStoneMutation.mutate(stone.id)}
                        disabled={deleteTaptStoneMutation.isPending}
                        size="sm"
                        className="bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 hover:border-red-500/40 transition-all duration-200"
                      >
                        {deleteTaptStoneMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="text-xs text-white/50">
                      Payment URL: {stone.paymentUrl ? `${stone.paymentUrl.substring(0, 40)}...` : 'Generating...'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {taptStones.length >= 10 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
              <p className="text-yellow-400 text-sm">
                Maximum of 10 tapt stones reached. Delete a stone to create a new one.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* API Status Card */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-3xl p-6 shadow-2xl mb-6 sm:mb-8 hover:bg-white/10 hover:border-white/30 transition-all duration-300">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
            <Shield className="h-5 w-5 text-white" />
            <span>Payment Gateway Status</span>
          </h3>
          <p className="text-white/70 text-sm">
            Current status of your Windcave payment gateway integration
          </p>
        </div>
        <div>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-32 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-64"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {apiStatus?.configured ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-yellow-600" />
                  )}
                  <div>
                    <p className="font-medium text-white">
                      {apiStatus?.configured ? "API Configured" : "API Not Configured"}
                    </p>
                    <p className="text-sm text-white/70">{apiStatus?.message}</p>
                  </div>
                </div>
                <Badge variant={apiStatus?.configured ? "default" : "secondary"}>
                  {apiStatus?.mode || "Unknown"}
                </Badge>
              </div>
              
              {!apiStatus?.configured && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Setup Required</AlertTitle>
                  <AlertDescription>
                    Currently running in simulation mode. Configure your Windcave API credentials to process real payments.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-3xl p-6 shadow-2xl mb-8 hover:bg-white/10 hover:border-white/30 transition-all duration-300">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
            <Key className="h-5 w-5 text-white" />
            <span>Windcave API Setup</span>
          </h3>
          <p className="text-white/70 text-sm">
            Follow these steps to connect your Windcave payment gateway
          </p>
        </div>
        <div>
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">1. Get Windcave Account</h3>
              <p className="text-white/70">
                Contact Windcave to set up your merchant account and get API credentials.
              </p>
              <div className="flex items-center space-x-2">
                <Globe className="h-4 w-4 text-gray-400" />
                <a 
                  href="https://www.windcave.com/contact" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline flex items-center space-x-1"
                >
                  <span>Contact Windcave Sales</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">2. Configure Environment Variables</h3>
              <p className="text-white/70">
                Add your Windcave credentials to your environment variables:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                <div className="space-y-1">
                  <div>WINDCAVE_USERNAME=your_api_username</div>
                  <div>WINDCAVE_API_KEY=your_api_key</div>
                  <div>WINDCAVE_ENDPOINT=https://uat.windcave.com/api/v1  # Use sandbox for testing</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">3. Integration Options</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Hosted Payment Page (Recommended)</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Customers are redirected to Windcave's secure payment page. Lowest PCI compliance requirements.
                  </p>
                  <Badge variant="outline" className="text-green-600 border-green-600">PCI SAQ Level A</Badge>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">REST API Integration</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Full control over the payment flow with server-to-server API calls.
                  </p>
                  <Badge variant="outline" className="text-orange-600 border-orange-600">PCI SAQ Level D</Badge>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">4. Testing</h3>
              <p className="text-white/70">
                Use Windcave's UAT (User Acceptance Testing) environment for development and testing:
              </p>
              <ul className="list-disc list-inside text-sm text-white/70 space-y-1 ml-4">
                <li>Test card numbers available in Windcave documentation</li>
                <li>Sandbox environment for safe testing</li>
                <li>Real-time transaction monitoring</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">5. Go Live</h3>
              <p className="text-white/70">
                When ready for production:
              </p>
              <ul className="list-disc list-inside text-sm text-white/70 space-y-1 ml-4">
                <li>Update WINDCAVE_ENDPOINT to production URL</li>
                <li>Use production API credentials</li>
                <li>Complete Windcave's go-live process</li>
                <li>Implement proper error handling and monitoring</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </>
  );
}