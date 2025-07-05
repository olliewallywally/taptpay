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
  X
} from "lucide-react";
import { z } from "zod";

type MerchantDetailsFormData = z.infer<typeof updateMerchantDetailsSchema>;
type BankAccountFormData = z.infer<typeof updateBankAccountSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState(false);

  // Get current merchant data
  const { data: merchant, isLoading: merchantLoading } = useQuery({
    queryKey: ["/api/merchants/1"],
    queryFn: async () => {
      const response = await fetch("/api/merchants/1");
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
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
      return apiRequest("PUT", "/api/merchants/1/details", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/1"] });
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
      return apiRequest("PUT", "/api/merchants/1/bank-account", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/1"] });
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

  const onSubmitDetails = (data: MerchantDetailsFormData) => {
    updateDetailsMutation.mutate(data);
  };

  const onSubmitBankAccount = (data: BankAccountFormData) => {
    updateBankAccountMutation.mutate(data);
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Settings & Configuration</h1>
        <p className="text-sm sm:text-base text-gray-600">Manage your payment processing configuration and API connections</p>
      </div>

      {/* Merchant Business Details Card */}
      <Card className="mb-6 sm:mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building className="h-5 w-5" />
              <div>
                <CardTitle>Business Details</CardTitle>
                <CardDescription>
                  Manage your business information and contact details
                </CardDescription>
              </div>
            </div>
            {!editingDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingDetails(true)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
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
                  <label className="text-sm font-medium text-gray-700">Business Name</label>
                  <p className="text-gray-900">{merchant?.businessName || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Contact Email</label>
                  <p className="text-gray-900">{merchant?.contactEmail || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Contact Phone</label>
                  <p className="text-gray-900">{merchant?.contactPhone || "Not set"}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Business Address</label>
                <p className="text-gray-900 whitespace-pre-line">{merchant?.businessAddress || "Not set"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank Account Details Card */}
      <Card className="mb-6 sm:mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <div>
                <CardTitle>Bank Account Details</CardTitle>
                <CardDescription>
                  Manage your bank account information for payment settlements
                </CardDescription>
              </div>
            </div>
            {!editingBankAccount && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingBankAccount(true)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
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
                  <label className="text-sm font-medium text-gray-700">Bank Name</label>
                  <p className="text-gray-900">{merchant?.bankName || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Account Number</label>
                  <p className="text-gray-900 font-mono">{merchant?.bankAccountNumber || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Bank Branch</label>
                  <p className="text-gray-900">{merchant?.bankBranch || "Not set"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Account Holder</label>
                  <p className="text-gray-900">{merchant?.accountHolderName || "Not set"}</p>
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
        </CardContent>
      </Card>

      {/* API Status Card */}
      <Card className="mb-6 sm:mb-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Payment Gateway Status</span>
          </CardTitle>
          <CardDescription>
            Current status of your Windcave payment gateway integration
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                    <p className="font-medium text-gray-900">
                      {apiStatus?.configured ? "API Configured" : "API Not Configured"}
                    </p>
                    <p className="text-sm text-gray-500">{apiStatus?.message}</p>
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
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5" />
            <span>Windcave API Setup</span>
          </CardTitle>
          <CardDescription>
            Follow these steps to connect your Windcave payment gateway
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">1. Get Windcave Account</h3>
              <p className="text-gray-600">
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
              <h3 className="text-lg font-semibold text-gray-900">2. Configure Environment Variables</h3>
              <p className="text-gray-600">
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
              <h3 className="text-lg font-semibold text-gray-900">3. Integration Options</h3>
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
              <h3 className="text-lg font-semibold text-gray-900">4. Testing</h3>
              <p className="text-gray-600">
                Use Windcave's UAT (User Acceptance Testing) environment for development and testing:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
                <li>Test card numbers available in Windcave documentation</li>
                <li>Sandbox environment for safe testing</li>
                <li>Real-time transaction monitoring</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">5. Go Live</h3>
              <p className="text-gray-600">
                When ready for production:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
                <li>Update WINDCAVE_ENDPOINT to production URL</li>
                <li>Use production API credentials</li>
                <li>Complete Windcave's go-live process</li>
                <li>Implement proper error handling and monitoring</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <SettingsIcon className="h-5 w-5" />
            <span>Current Configuration</span>
          </CardTitle>
          <CardDescription>
            Review your current payment processing setup
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Payment Provider</label>
                <p className="text-gray-900">Windcave (formerly Payment Express)</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Processing Rate</label>
                <p className="text-gray-900 font-semibold text-green-600">$0.20 flat fee per transaction</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Currency</label>
                <p className="text-gray-900">NZD (New Zealand Dollar)</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Integration Method</label>
                <p className="text-gray-900">REST API with Hosted Payment Page</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}