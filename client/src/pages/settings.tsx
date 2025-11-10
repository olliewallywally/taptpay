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
      setApiActive(true);
      toast({ title: "Windcave API key saved successfully" });
    }
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
              <Label htmlFor="businessName" className="text-gray-700 text-sm mb-1.5 block">Company Name</Label>
              <Input
                id="businessName"
                value={businessDetails.businessName}
                onChange={(e) => handleBusinessChange('businessName', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-business-name"
              />
            </div>

            <div>
              <Label htmlFor="director" className="text-gray-700 text-sm mb-1.5 block">Director</Label>
              <Input
                id="director"
                value={businessDetails.director}
                onChange={(e) => handleBusinessChange('director', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-director"
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

            <div>
              <Label htmlFor="nzbn" className="text-gray-700 text-sm mb-1.5 block">NZBN</Label>
              <Input
                id="nzbn"
                value={businessDetails.nzbn}
                onChange={(e) => handleBusinessChange('nzbn', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
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
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
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
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
                data-testid="input-email"
              />
            </div>

            <div>
              <Label htmlFor="gstNumber" className="text-gray-700 text-sm mb-1.5 block">GST Number</Label>
              <Input
                id="gstNumber"
                value={businessDetails.gstNumber}
                onChange={(e) => handleBusinessChange('gstNumber', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
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
                    <p className="text-sm text-gray-600">{logoFile?.name}</p>
                    <Button
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview(null);
                      }}
                      variant="outline"
                      className="border-[#0055FF] text-[#0055FF]"
                    >
                      Remove
                    </Button>
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
