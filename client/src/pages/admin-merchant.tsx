import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Building2, 
  DollarSign, 
  CreditCard, 
  Users, 
  Link as LinkIcon,
  Edit,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  Loader2
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

interface MerchantDetails {
  id: number;
  name: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: string;
  currentProviderRate: string;
  bankName: string;
  bankAccountNumber: string;
  bankBranch: string;
  accountHolderName: string;
  qrCodeUrl: string;
  paymentUrl: string;
  status: 'active' | 'inactive';
}

interface Transaction {
  id: number;
  itemName: string;
  price: number;
  status: string;
  createdAt: string;
  windcaveTransactionId?: string;
}

interface MerchantAnalytics {
  totalTransactions: number;
  completedTransactions: number;
  totalRevenue: number;
}

export default function AdminMerchantDetail() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedMerchant, setEditedMerchant] = useState<Partial<MerchantDetails>>({});

  // Fetch merchant details
  const { data: merchant, isLoading: merchantLoading } = useQuery<MerchantDetails>({
    queryKey: ['/api/merchants', merchantId],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch merchant details');
      return response.json();
    },
  });

  // Fetch merchant analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<MerchantAnalytics>({
    queryKey: ['/api/merchants', merchantId, 'analytics'],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/analytics`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch merchant analytics');
      return response.json();
    },
  });

  // Fetch merchant transactions
  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ['/api/merchants', merchantId, 'transactions'],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch merchant transactions');
      return response.json();
    },
  });

  // Update merchant mutation
  const updateMerchantMutation = useMutation({
    mutationFn: async (updates: Partial<MerchantDetails>) => {
      const response = await apiRequest("PUT", `/api/admin/merchants/${merchantId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', merchantId] });
      setIsEditing(false);
      setEditedMerchant({});
      toast({
        title: "Merchant Updated",
        description: "Merchant details have been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update merchant details.",
        variant: "destructive",
      });
    },
  });

  // Test payment link mutation
  const testPaymentLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/test-payment-link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        }
      });
      if (!response.ok) throw new Error('Payment link test failed');
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Payment Link Test",
        description: result.status === 'active' ? "Payment link is working correctly" : "Payment link has issues",
        variant: result.status === 'active' ? "default" : "destructive",
      });
    },
  });

  const handleEdit = () => {
    setIsEditing(true);
    setEditedMerchant(merchant || {});
  };

  const handleSave = () => {
    updateMerchantMutation.mutate(editedMerchant);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedMerchant({});
  };

  const handleInputChange = (field: keyof MerchantDetails, value: string) => {
    setEditedMerchant(prev => ({ ...prev, [field]: value }));
  };

  if (merchantLoading || analyticsLoading || transactionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
          <span className="text-slate-600">Loading merchant details...</span>
        </div>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Merchant Not Found</h2>
          <p className="text-gray-600 mb-4">The requested merchant could not be found.</p>
          <Button onClick={() => setLocation('/admin/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            onClick={() => setLocation('/admin/dashboard')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{merchant.businessName || merchant.name}</h1>
            <p className="text-gray-600">Merchant ID: {merchant.id}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'}>
            {merchant.status === 'active' ? (
              <CheckCircle className="w-3 h-3 mr-1" />
            ) : (
              <AlertCircle className="w-3 h-3 mr-1" />
            )}
            {merchant.status}
          </Badge>
          {!isEditing ? (
            <Button onClick={handleEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Merchant
            </Button>
          ) : (
            <div className="flex space-x-2">
              <Button onClick={handleSave} disabled={updateMerchantMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {analytics?.totalTransactions || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics?.completedTransactions || 0} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Links</CardTitle>
            <LinkIcon className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testPaymentLinkMutation.mutate()}
                disabled={testPaymentLinkMutation.isPending}
                className="w-full"
              >
                {testPaymentLinkMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Test Payment Link
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Information Tabs */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Merchant Details</TabsTrigger>
          <TabsTrigger value="transactions">Transaction History</TabsTrigger>
          <TabsTrigger value="links">Payment Links</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Business Information */}
            <Card>
              <CardHeader>
                <CardTitle>Business Information</CardTitle>
                <CardDescription>Basic business details and contact information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="businessName">Business Name</Label>
                    {isEditing ? (
                      <Input
                        id="businessName"
                        value={editedMerchant.businessName || ''}
                        onChange={(e) => handleInputChange('businessName', e.target.value)}
                      />
                    ) : (
                      <p className="text-sm text-gray-900 mt-1">{merchant.businessName}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="merchantName">Merchant ID Name</Label>
                    {isEditing ? (
                      <Input
                        id="merchantName"
                        value={editedMerchant.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                      />
                    ) : (
                      <p className="text-sm text-gray-900 mt-1">{merchant.name}</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  {isEditing ? (
                    <Input
                      id="contactEmail"
                      type="email"
                      value={editedMerchant.contactEmail || ''}
                      onChange={(e) => handleInputChange('contactEmail', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{merchant.contactEmail}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  {isEditing ? (
                    <Input
                      id="contactPhone"
                      value={editedMerchant.contactPhone || ''}
                      onChange={(e) => handleInputChange('contactPhone', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{merchant.contactPhone}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="businessAddress">Business Address</Label>
                  {isEditing ? (
                    <Input
                      id="businessAddress"
                      value={editedMerchant.businessAddress || ''}
                      onChange={(e) => handleInputChange('businessAddress', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{merchant.businessAddress}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="currentProviderRate">Current Provider Rate (%)</Label>
                  {isEditing ? (
                    <Input
                      id="currentProviderRate"
                      value={editedMerchant.currentProviderRate || ''}
                      onChange={(e) => handleInputChange('currentProviderRate', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{merchant.currentProviderRate}%</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bank Account Details */}
            <Card>
              <CardHeader>
                <CardTitle>Bank Account Details</CardTitle>
                <CardDescription>Banking information for settlements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="bankName">Bank Name</Label>
                  {isEditing ? (
                    <Input
                      id="bankName"
                      value={editedMerchant.bankName || ''}
                      onChange={(e) => handleInputChange('bankName', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{merchant.bankName}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="accountHolderName">Account Holder Name</Label>
                  {isEditing ? (
                    <Input
                      id="accountHolderName"
                      value={editedMerchant.accountHolderName || ''}
                      onChange={(e) => handleInputChange('accountHolderName', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{merchant.accountHolderName}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="bankAccountNumber">Account Number</Label>
                  {isEditing ? (
                    <Input
                      id="bankAccountNumber"
                      value={editedMerchant.bankAccountNumber || ''}
                      onChange={(e) => handleInputChange('bankAccountNumber', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{merchant.bankAccountNumber}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="bankBranch">Bank Branch</Label>
                  {isEditing ? (
                    <Input
                      id="bankBranch"
                      value={editedMerchant.bankBranch || ''}
                      onChange={(e) => handleInputChange('bankBranch', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{merchant.bankBranch}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Latest transaction activity for this merchant</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions && transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{transaction.id}</TableCell>
                        <TableCell>{transaction.itemName}</TableCell>
                        <TableCell>${transaction.price}</TableCell>
                        <TableCell>
                          <Badge variant={
                            transaction.status === 'completed' ? 'default' :
                            transaction.status === 'failed' ? 'destructive' : 
                            'secondary'
                          }>
                            {transaction.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(transaction.createdAt).toLocaleDateString('en-NZ')}
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {transaction.windcaveTransactionId || 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
                  <p className="text-gray-500">This merchant hasn't processed any transactions yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="links">
          <Card>
            <CardHeader>
              <CardTitle>Payment Links</CardTitle>
              <CardDescription>Manage and monitor payment links for this merchant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label>QR Code URL</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <Input value={merchant.qrCodeUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(merchant.qrCodeUrl, '_blank')}
                    >
                      View
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label>Payment URL</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <Input value={merchant.paymentUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(merchant.paymentUrl, '_blank')}
                    >
                      Visit
                    </Button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  onClick={() => testPaymentLinkMutation.mutate()}
                  disabled={testPaymentLinkMutation.isPending}
                  className="w-full"
                >
                  {testPaymentLinkMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Test All Payment Links
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}