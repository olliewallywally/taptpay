import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getCurrentMerchantId } from "@/lib/auth";
import { z } from "zod";
import QRCode from 'qrcode';
import { 
  Building, 
  CreditCard, 
  Cog, 
  CheckCircle, 
  AlertCircle, 
  Shield, 
  Key, 
  Download, 
  QrCode,
  Copy,
  Check,
  Smartphone,
  Users,
  Tag,
  Settings as SettingsIcon,
  Edit,
  Save,
  X,
  Coins,
  UserCheck,
  Star,
  Crown,
  Zap,
  DollarSign,
  TrendingUp,
  Mail,
  Phone,
  MapPin
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Settings() {
  const { toast } = useToast();
  const [editingDetails, setEditingDetails] = useState(false);
  const merchantId = getCurrentMerchantId();

  // Get current user
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  // Get merchant data
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

  if (merchantLoading || userLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center space-x-3 mb-8">
        <SettingsIcon className="h-8 w-8 text-green-500" />
        <h1 className="text-3xl font-bold text-white">Settings</h1>
      </div>

      <div className="space-y-6">
        {/* Business Details Section */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Building className="h-5 w-5" />
              <span>Business Details</span>
            </h2>
            {!editingDetails && (
              <Button
                onClick={() => setEditingDetails(true)}
                variant="outline"
                size="sm"
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>

          {merchant && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Business Name</Label>
                <div className="bg-gray-700 p-3 rounded-md text-white">
                  {merchant.businessName || "Not set"}
                </div>
              </div>
              <div>
                <Label className="text-gray-300">Email</Label>
                <div className="bg-gray-700 p-3 rounded-md text-white">
                  {merchant.email || "Not set"}
                </div>
              </div>
              <div>
                <Label className="text-gray-300">Phone</Label>
                <div className="bg-gray-700 p-3 rounded-md text-white">
                  {merchant.phone || "Not set"}
                </div>
              </div>
              <div>
                <Label className="text-gray-300">Address</Label>
                <div className="bg-gray-700 p-3 rounded-md text-white">
                  {merchant.address || "Not set"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Payment Information */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center space-x-2 mb-4">
            <CreditCard className="h-5 w-5" />
            <span>Payment Information</span>
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
              <div className="flex items-center space-x-3">
                <Shield className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-white font-medium">Windcave Integration</p>
                  <p className="text-gray-400 text-sm">Secure payment processing</p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-green-900 text-green-300">
                Simulation Mode
              </Badge>
            </div>
          </div>
        </div>

        {/* Account Status */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center space-x-2 mb-4">
            <UserCheck className="h-5 w-5" />
            <span>Account Status</span>
          </h2>
          
          <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-white font-medium">Account Verified</p>
                <p className="text-gray-400 text-sm">Your merchant account is active</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-green-900 text-green-300">
              Active
            </Badge>
          </div>
        </div>

        {/* Crypto Payment Settings */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center space-x-2 mb-4">
            <Coins className="h-5 w-5 text-orange-500" />
            <span>Crypto Payment Settings</span>
          </h2>
          
          <Alert className="bg-blue-900/30 border-blue-700 mb-4">
            <AlertCircle className="h-4 w-4 text-blue-400" />
            <AlertTitle className="text-blue-300">Enable Crypto Payments</AlertTitle>
            <AlertDescription className="text-blue-200">
              Configure your Coinbase Commerce account to accept Bitcoin, Ethereum, and other cryptocurrencies. Platform fee: 0.5% per transaction.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Coinbase Commerce API Key</Label>
              <Input
                type="password"
                placeholder="Enter your Coinbase Commerce API key"
                className="bg-gray-700 border-gray-600 text-white"
                defaultValue={merchant?.coinbaseCommerceApiKey ? "••••••••••••••••" : ""}
              />
              <p className="text-xs text-gray-400 mt-1">
                Get your API key from <a href="https://commerce.coinbase.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Coinbase Commerce Dashboard</a>
              </p>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
              <span className="text-white">Crypto Payments Enabled</span>
              <Badge variant={merchant?.cryptoEnabled ? "default" : "secondary"} className={merchant?.cryptoEnabled ? "bg-green-600" : "bg-gray-600"}>
                {merchant?.cryptoEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Payment Method for Platform Fees */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center space-x-2 mb-4">
            <CreditCard className="h-5 w-5 text-blue-500" />
            <span>Payment Method</span>
          </h2>
          
          <Alert className="bg-purple-900/30 border-purple-700 mb-4">
            <AlertCircle className="h-4 w-4 text-purple-400" />
            <AlertTitle className="text-purple-300">Platform Fee Payment</AlertTitle>
            <AlertDescription className="text-purple-200">
              Add a payment method to automatically pay platform fees (0.5%) on transactions. Crypto payments go directly to your Coinbase wallet.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-4">
            {merchant?.stripePaymentMethodId ? (
              <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <CreditCard className="h-5 w-5 text-blue-400" />
                  <div>
                    <p className="text-white font-medium">{merchant.paymentMethodBrand?.toUpperCase()} •••• {merchant.paymentMethodLast4}</p>
                    <p className="text-gray-400 text-sm">Default payment method</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="border-gray-600 text-gray-300">
                  Update
                </Button>
              </div>
            ) : (
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                <CreditCard className="h-4 w-4 mr-2" />
                Add Payment Method
              </Button>
            )}
          </div>
        </div>

        {/* Debug Information */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center space-x-2 mb-4">
            <Cog className="h-5 w-5" />
            <span>Debug Information</span>
          </h2>
          
          <div className="space-y-2 text-sm">
            <p className="text-gray-300">
              <span className="font-medium">User ID:</span> {(user as any)?.user?.id || "Not available"}
            </p>
            <p className="text-gray-300">
              <span className="font-medium">Merchant ID:</span> {merchantId || "Not available"}
            </p>
            <p className="text-gray-300">
              <span className="font-medium">User Loading:</span> {userLoading ? "Yes" : "No"}
            </p>
            <p className="text-gray-300">
              <span className="font-medium">Merchant Loading:</span> {merchantLoading ? "Yes" : "No"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}