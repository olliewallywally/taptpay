import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { 
  Home, Package, BarChart3, SlidersHorizontal, Terminal,
  Upload, CheckCircle, XCircle, LogOut, CreditCard, AlertCircle
} from "lucide-react";

interface MerchantDetails {
  businessName: string;
  director: string;
  address: string;
  nzbn: string;
  phone: string;
  email: string;
  gstNumber: string;
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const merchantId = getCurrentMerchantId();

  const [businessDetails, setBusinessDetails] = useState<MerchantDetails>({
    businessName: '',
    director: '',
    address: '',
    nzbn: '',
    phone: '',
    email: '',
    gstNumber: '',
  });

  const [windcaveApi, setWindcaveApi] = useState('');
  const [apiActive, setApiActive] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [dailyGoal, setDailyGoal] = useState('500');
  
  // Subscription state
  const [billingFrequency, setBillingFrequency] = useState('monthly');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  if (!merchantId) {
    setLocation('/login');
    return null;
  }

  const { data: merchant, isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch merchant");
      const data = await response.json();
      setBusinessDetails({
        businessName: data.businessName || '',
        director: data.director || '',
        address: data.address || '',
        nzbn: data.nzbn || '',
        phone: data.phone || '',
        email: data.email || '',
        gstNumber: data.gstNumber || '',
      });
      setWindcaveApi(data.windcaveApiKey || '');
      setApiActive(!!data.windcaveApiKey);
      setDailyGoal(data.dailyGoal || '500.00');
      if (data.customLogoUrl) {
        setLogoPreview(data.customLogoUrl);
      }
      return data;
    },
  });

  const updateMerchantMutation = useMutation({
    mutationFn: async (details: MerchantDetails & { windcaveApiKey?: string }) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(details),
      });
      if (!response.ok) throw new Error("Failed to update merchant");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      toast({ title: "Business details saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save business details", variant: "destructive" });
    },
  });

  const updateDailyGoalMutation = useMutation({
    mutationFn: async (goalAmount: string) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/daily-goal`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ dailyGoal: goalAmount }),
      });
      if (!response.ok) throw new Error("Failed to update daily goal");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      toast({ title: "Daily goal updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update daily goal", variant: "destructive" });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = localStorage.getItem("authToken");
      const formData = new FormData();
      formData.append('logo', file);
      
      const response = await fetch(`/api/merchants/${merchantId}/logo`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to upload logo");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      setLogoFile(null);
      setLogoPreview(null);
      toast({ title: "Logo uploaded successfully" });
    },
    onError: () => {
      toast({ title: "Failed to upload logo", variant: "destructive" });
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/logo`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete logo");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      setLogoPreview(null);
      toast({ title: "Logo deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete logo", variant: "destructive" });
    },
  });

  // Fetch subscription data
  const { data: subscriptionData } = useQuery({
    queryKey: ["/api/subscription"],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription');
      if (!response.ok) throw new Error("Failed to fetch subscription");
      return response.json();
    },
  });

  useEffect(() => {
    if (subscriptionData?.subscription) {
      setBillingFrequency(subscriptionData.subscription.billingFrequency || 'monthly');
    }
  }, [subscriptionData]);

  const updateBillingFrequencyMutation = useMutation({
    mutationFn: async (frequency: string) => {
      const response = await apiRequest('PUT', '/api/subscription/billing-frequency', { frequency });
      if (!response.ok) throw new Error("Failed to update billing frequency");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: "Billing frequency updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update billing frequency", variant: "destructive" });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await apiRequest('POST', '/api/subscription/cancel', { reason });
      if (!response.ok) throw new Error("Failed to cancel subscription");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      setShowCancelDialog(false);
      setCancellationReason('');
      toast({ title: "Subscription cancellation requested. Will be effective in 30 days." });
    },
    onError: () => {
      toast({ title: "Failed to cancel subscription", variant: "destructive" });
    },
  });

  const handleBusinessChange = (field: keyof MerchantDetails, value: string) => {
    setBusinessDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveDetails = () => {
    updateMerchantMutation.mutate(businessDetails);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'image/png') {
        toast({ title: "Please upload a PNG file only", variant: "destructive" });
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: "File size must be less than 20MB", variant: "destructive" });
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApiSave = () => {
    if (windcaveApi.trim()) {
      updateMerchantMutation.mutate({ ...businessDetails, windcaveApiKey: windcaveApi });
      setApiActive(true);
    } else {
      toast({ title: "Please enter an API key", variant: "destructive" });
    }
  };

  const handleUploadLogo = () => {
    if (logoFile) {
      uploadLogoMutation.mutate(logoFile);
    }
  };

  const handleDeleteLogo = () => {
    deleteLogoMutation.mutate();
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setLocation('/login');
  };

  const handleBillingFrequencyChange = (frequency: string) => {
    setBillingFrequency(frequency);
    updateBillingFrequencyMutation.mutate(frequency);
  };

  const handleCancelSubscription = () => {
    if (!cancellationReason.trim()) {
      toast({ title: "Please provide a reason for cancellation", variant: "destructive" });
      return;
    }
    cancelSubscriptionMutation.mutate(cancellationReason);
  };

  const subscription = subscriptionData?.subscription;
  const transactionProgress = subscription ? Math.min((subscription.currentMonthTransactions / 1000) * 100, 100) : 0;
  const isFreeTier = subscription?.tier === 'free';
  const isCancelled = subscription?.status === 'cancelled';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header */}
      <div className="bg-[#0055FF] pt-8 pb-6 rounded-b-[60px] sm:rounded-b-[100px]">
        <div className="max-w-md mx-auto px-4 sm:px-6">
          <h1 className="text-[#00E5CC] text-center text-2xl sm:text-3xl">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 sm:px-6 mt-8">
        {/* Business Details Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">Business Details</h2>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="businessName" className="text-gray-700 text-sm mb-1.5 block">Company Name</Label>
              <Input
                id="businessName"
                value={businessDetails.businessName}
                onChange={(e) => handleBusinessChange('businessName', e.target.value)}
                className="border-2 border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-business-name"
              />
            </div>

            <div>
              <Label htmlFor="director" className="text-gray-700 text-sm mb-1.5 block">Director</Label>
              <Input
                id="director"
                value={businessDetails.director}
                onChange={(e) => handleBusinessChange('director', e.target.value)}
                className="border-2 border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-director"
              />
            </div>

            <div>
              <Label htmlFor="address" className="text-gray-700 text-sm mb-1.5 block">Address</Label>
              <Input
                id="address"
                value={businessDetails.address}
                onChange={(e) => handleBusinessChange('address', e.target.value)}
                className="border-2 border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-address"
              />
            </div>

            <div>
              <Label htmlFor="nzbn" className="text-gray-700 text-sm mb-1.5 block">NZBN</Label>
              <Input
                id="nzbn"
                value={businessDetails.nzbn}
                onChange={(e) => handleBusinessChange('nzbn', e.target.value)}
                className="border-2 border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-nzbn"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-gray-700 text-sm mb-1.5 block">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={businessDetails.phone}
                onChange={(e) => handleBusinessChange('phone', e.target.value)}
                className="border-2 border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-phone"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-gray-700 text-sm mb-1.5 block">Email</Label>
              <Input
                id="email"
                type="email"
                value={businessDetails.email}
                onChange={(e) => handleBusinessChange('email', e.target.value)}
                className="border-2 border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-email"
              />
            </div>

            <div>
              <Label htmlFor="gstNumber" className="text-gray-700 text-sm mb-1.5 block">GST Number</Label>
              <Input
                id="gstNumber"
                value={businessDetails.gstNumber}
                onChange={(e) => handleBusinessChange('gstNumber', e.target.value)}
                className="border-2 border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-gst-number"
              />
            </div>
          </div>

          <Button 
            className="w-full bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF] mt-5"
            onClick={handleSaveDetails}
            disabled={updateMerchantMutation.isPending}
            data-testid="button-save"
          >
            {updateMerchantMutation.isPending ? "Saving..." : "Save Business Details"}
          </Button>
        </div>

        {/* API Status Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">API Status</h2>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="windcaveApi" className="text-gray-700 text-sm">Windcave API Key</Label>
                {apiActive ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="text-green-500" size={20} />
                    <span className="text-green-500 text-sm">Active</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="text-gray-400" size={20} />
                    <span className="text-gray-400 text-sm">Inactive</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id="windcaveApi"
                  type="password"
                  value={windcaveApi}
                  onChange={(e) => setWindcaveApi(e.target.value)}
                  placeholder="Enter Windcave API key"
                  className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC] flex-1"
                  data-testid="input-windcave-api"
                />
                <Button 
                  onClick={handleApiSave}
                  className="bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF]"
                  data-testid="button-save-api"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Logo Upload Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">Customer Payment Page Logo</h2>
          
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">Upload Logo (PNG only, max 20MB)</Label>
              <div className="border-2 border-dashed border-[#0055FF] rounded-xl p-6 text-center">
                {logoPreview ? (
                  <div className="space-y-3">
                    <img src={logoPreview} alt="Logo preview" className="max-h-32 mx-auto" />
                    {logoFile && <p className="text-sm text-gray-600">{logoFile.name}</p>}
                    <div className="flex gap-2 justify-center">
                      {logoFile ? (
                        <>
                          <Button
                            onClick={handleUploadLogo}
                            disabled={uploadLogoMutation.isPending}
                            className="bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF]"
                          >
                            {uploadLogoMutation.isPending ? "Uploading..." : "Upload"}
                          </Button>
                          <Button
                            onClick={() => {
                              setLogoFile(null);
                              setLogoPreview(merchant?.customLogoUrl || null);
                            }}
                            variant="outline"
                            className="border-[#0055FF] text-[#0055FF]"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={handleDeleteLogo}
                          disabled={deleteLogoMutation.isPending}
                          variant="outline"
                          className="border-red-500 text-red-500 hover:bg-red-50"
                        >
                          {deleteLogoMutation.isPending ? "Deleting..." : "Delete Logo"}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="mx-auto text-[#0055FF]" size={48} />
                    <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                    <input
                      type="file"
                      accept=".png"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                    />
                    <Button
                      onClick={() => document.getElementById('logo-upload')?.click()}
                      variant="outline"
                      className="border-[#0055FF] text-[#0055FF]"
                    >
                      Choose File
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Preferences Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">Dashboard Preferences</h2>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="dailyGoal" className="text-gray-700 text-sm mb-1.5 block">
                Daily Revenue Goal ($)
              </Label>
              <p className="text-xs text-gray-500 mb-2">
                Set your daily revenue target. This is used in the "active transactions" section on your dashboard.
              </p>
              <div className="flex gap-3">
                <Input
                  id="dailyGoal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(e.target.value)}
                  className="flex-1"
                  placeholder="500.00"
                  data-testid="input-daily-goal"
                />
                <Button
                  onClick={() => updateDailyGoalMutation.mutate(dailyGoal)}
                  disabled={updateDailyGoalMutation.isPending}
                  className="bg-[#0055FF] hover:bg-[#0055FF]/90"
                  data-testid="button-save-daily-goal"
                >
                  {updateDailyGoalMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription & Billing Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">Subscription & Billing</h2>
          
          <div className="space-y-5">
            {/* Current Tier */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#0055FF]/10 to-[#00E5CC]/10 rounded-xl">
              <div>
                <p className="text-gray-700 font-medium">Current Plan</p>
                <p className="text-2xl font-bold text-[#0055FF] mt-1">
                  {isFreeTier ? 'Free Tier' : 'Paid ($19.99/month)'}
                </p>
              </div>
              {isCancelled && (
                <AlertCircle className="text-orange-500" size={24} />
              )}
            </div>

            {/* Transaction Counter */}
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-700 font-medium">Monthly Transaction Usage</p>
                <p className="text-sm font-medium text-gray-600">
                  {subscription?.currentMonthTransactions || 0} / 1000
                </p>
              </div>
              <Progress value={transactionProgress} className="h-3 mb-2" />
              <p className="text-xs text-gray-500">
                {isFreeTier 
                  ? 'Free tier includes up to 1,000 transactions per month. Additional charges apply after that.'
                  : 'You will be charged 10 cents per transaction at your selected billing frequency.'}
              </p>
              {isFreeTier && subscription && subscription.currentMonthTransactions >= 1000 && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600 font-medium">
                    ⚠️ You've reached your free tier limit. Your card will be charged 10 cents per additional transaction.
                  </p>
                </div>
              )}
            </div>

            {/* Billing Frequency */}
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">
                Transaction Fee Billing Frequency
              </Label>
              <p className="text-xs text-gray-500 mb-3">
                Choose how often you want to be charged for transaction fees (10 cents per transaction)
              </p>
              <Select value={billingFrequency} onValueChange={handleBillingFrequencyChange}>
                <SelectTrigger className="border-[#0055FF] focus:border-[#00E5CC]" data-testid="select-billing-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method */}
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <CreditCard className="text-[#0055FF]" size={20} />
                <p className="text-gray-700 font-medium">Payment Method</p>
              </div>
              {subscriptionData?.paymentMethod ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {subscriptionData.paymentMethod.brand} ending in {subscriptionData.paymentMethod.last4}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#0055FF] text-[#0055FF]"
                  >
                    Update
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500 mb-2">No payment method on file</p>
                  <Button
                    variant="outline"
                    className="border-[#0055FF] text-[#0055FF]"
                    data-testid="button-add-payment"
                  >
                    Add Credit Card
                  </Button>
                </div>
              )}
            </div>

            {/* Unbilled Transactions */}
            {subscription && subscription.unbilledTransactionCount > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Unbilled Transactions
                </p>
                <p className="text-xs text-blue-700">
                  {subscription.unbilledTransactionCount} transactions totaling ${Number(subscription.unbilledAmount).toFixed(2)} will be charged on your next billing date
                </p>
              </div>
            )}

            {/* Cancellation Section */}
            {!isCancelled ? (
              !showCancelDialog ? (
                <Button
                  variant="outline"
                  className="w-full border-red-500 text-red-500 hover:bg-red-50"
                  onClick={() => setShowCancelDialog(true)}
                  data-testid="button-cancel-subscription"
                >
                  Cancel Subscription
                </Button>
              ) : (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                  <p className="text-sm font-medium text-red-900">
                    Cancel Subscription (30-day notice required)
                  </p>
                  <p className="text-xs text-red-700">
                    Your subscription will remain active for 30 days after cancellation request. Please provide a reason:
                  </p>
                  <Textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="Please tell us why you're cancelling..."
                    className="border-red-300 focus:border-red-500"
                    data-testid="textarea-cancel-reason"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCancelDialog(false);
                        setCancellationReason('');
                      }}
                      className="flex-1"
                    >
                      Keep Subscription
                    </Button>
                    <Button
                      onClick={handleCancelSubscription}
                      disabled={cancelSubscriptionMutation.isPending || !cancellationReason.trim()}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                      data-testid="button-confirm-cancel"
                    >
                      {cancelSubscriptionMutation.isPending ? "Processing..." : "Confirm Cancellation"}
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <p className="text-sm font-medium text-orange-900 mb-1">
                  Subscription Cancelled
                </p>
                <p className="text-xs text-orange-700">
                  Your subscription will end on {subscription?.cancellationEffectiveDate ? new Date(subscription.cancellationEffectiveDate).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Account Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">Account</h2>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-gray-700 font-medium">Account Status</p>
                <p className="text-gray-500 text-sm">Your merchant account is active</p>
              </div>
              <CheckCircle className="text-green-500" size={24} />
            </div>
          </div>
        </div>

        {/* Customer Payment Page Button */}
        <div className="mb-5">
          <Button
            onClick={() => setLocation(`/pay/${merchantId}`)}
            className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] py-6 rounded-2xl text-lg"
            data-testid="button-customer-page"
          >
            Customer Payment Page
          </Button>
        </div>

        {/* Logout Button */}
        <div className="mb-8">
          <Button
            onClick={handleLogout}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-6 rounded-2xl text-lg flex items-center justify-center gap-2"
            data-testid="button-logout"
          >
            <LogOut size={20} />
            Log Out
          </Button>
        </div>
      </div>
    </div>
  );
}
