import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentMerchantId } from "@/lib/auth";
import { 
  Home, Package, BarChart3, SlidersHorizontal, Terminal,
  Upload, CheckCircle, XCircle, LogOut
} from "lucide-react";

interface MerchantDetails {
  businessName: string;
  email: string;
  phone: string;
  address: string;
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const merchantId = getCurrentMerchantId();

  const [businessDetails, setBusinessDetails] = useState<MerchantDetails>({
    businessName: '',
    email: '',
    phone: '',
    address: '',
  });

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
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
      });
      return data;
    },
  });

  const updateMerchantMutation = useMutation({
    mutationFn: async (details: MerchantDetails) => {
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

  const handleBusinessChange = (field: keyof MerchantDetails, value: string) => {
    setBusinessDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveDetails = () => {
    updateMerchantMutation.mutate(businessDetails);
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setLocation('/login');
  };

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
              <Label htmlFor="businessName" className="text-gray-700 text-sm mb-1.5 block">Business Name</Label>
              <Input
                id="businessName"
                value={businessDetails.businessName}
                onChange={(e) => handleBusinessChange('businessName', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-business-name"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-gray-700 text-sm mb-1.5 block">Email</Label>
              <Input
                id="email"
                type="email"
                value={businessDetails.email}
                onChange={(e) => handleBusinessChange('email', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-email"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-gray-700 text-sm mb-1.5 block">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={businessDetails.phone}
                onChange={(e) => handleBusinessChange('phone', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-phone"
              />
            </div>

            <div>
              <Label htmlFor="address" className="text-gray-700 text-sm mb-1.5 block">Address</Label>
              <Input
                id="address"
                value={businessDetails.address}
                onChange={(e) => handleBusinessChange('address', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-address"
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
          <h2 className="text-[#0055FF] text-xl mb-5">Payment Integration</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="text-green-500" size={20} />
                  <span className="text-gray-700 font-medium">Windcave Payment Gateway</span>
                </div>
                <p className="text-gray-500 text-sm">Secure payment processing enabled</p>
              </div>
            </div>
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

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2C2C2E] rounded-t-[24px] sm:rounded-t-[32px] md:rounded-t-[40px] px-4 sm:px-8 md:px-12 py-4 sm:py-6 md:py-8 z-50">
        <div className="max-w-md md:max-w-2xl mx-auto flex items-center justify-between gap-2 md:gap-4">
          <button 
            onClick={() => setLocation('/dashboard')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
            data-testid="nav-dashboard"
          >
            <Home className="text-white" size={20} />
          </button>
          <button 
            onClick={() => setLocation('/stock')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
            data-testid="nav-inventory"
          >
            <Package className="text-white" size={20} />
          </button>
          <button 
            onClick={() => setLocation('/demo-terminal')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
            data-testid="nav-terminal"
          >
            <Terminal className="text-white" size={20} />
          </button>
          <button 
            onClick={() => setLocation('/transactions')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
            data-testid="nav-analytics"
          >
            <BarChart3 className="text-white" size={20} />
          </button>
          <button 
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-[#0055FF] rounded-xl sm:rounded-2xl md:rounded-3xl"
            data-testid="nav-settings"
          >
            <SlidersHorizontal className="text-white" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
