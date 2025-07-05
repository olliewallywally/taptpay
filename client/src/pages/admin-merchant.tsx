import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { updateMerchantDetailsSchema, updateBankAccountSchema } from "@shared/schema";
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
  Loader2,
  LogOut,
  Trash2
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

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
  price: string | number;
  status: string;
  createdAt: string;
  windcaveTransactionId?: string;
}

interface MerchantAnalytics {
  totalTransactions: number;
  completedTransactions: number;
  totalRevenue: number;
}

// Helper function to safely format price
const formatPrice = (price: string | number): string => {
  return parseFloat(price.toString()).toFixed(2);
};

export default function AdminMerchantDetail() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isMobile = useIsMobile();

  // Forms for editing
  const detailsForm = useForm({
    resolver: zodResolver(updateMerchantDetailsSchema),
    defaultValues: {
      businessName: "",
      contactEmail: "",
      contactPhone: "",
      businessAddress: "",
    },
  });

  const bankForm = useForm({
    resolver: zodResolver(updateBankAccountSchema),
    defaultValues: {
      bankName: "",
      bankAccountNumber: "",
      bankBranch: "",
      accountHolderName: "",
    },
  });

  // Update merchant details mutation
  const updateDetailsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/merchants/${merchantId}/details`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        },
      });
      if (!response.ok) throw new Error('Failed to update merchant details');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', merchantId] });
      setIsEditingDetails(false);
      toast({
        title: "Success",
        description: "Merchant details updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update merchant details",
        variant: "destructive",
      });
    },
  });

  // Update bank account mutation
  const updateBankMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/merchants/${merchantId}/bank-account`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        },
      });
      if (!response.ok) throw new Error('Failed to update bank account');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', merchantId] });
      setIsEditingBank(false);
      toast({
        title: "Success",
        description: "Bank account updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update bank account",
        variant: "destructive",
      });
    },
  });

  // Delete merchant mutation
  const deleteMerchantMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/merchants/${merchantId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        },
      });
      if (!response.ok) throw new Error('Failed to delete merchant');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Merchant deleted successfully",
      });
      setLocation('/admin/dashboard');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete merchant",
        variant: "destructive",
      });
    },
  });

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

  const handleLogout = () => {
    localStorage.removeItem("adminAuthToken");
    localStorage.removeItem("adminUser");
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
    setLocation("/");
  };

  // Populate forms with merchant data when loaded
  useEffect(() => {
    if (merchant) {
      detailsForm.reset({
        businessName: merchant.businessName || "",
        contactEmail: merchant.contactEmail || "",
        contactPhone: merchant.contactPhone || "",
        businessAddress: merchant.businessAddress || "",
      });
      
      bankForm.reset({
        bankName: merchant.bankName || "",
        bankAccountNumber: merchant.bankAccountNumber || "",
        bankBranch: merchant.bankBranch || "",
        accountHolderName: merchant.accountHolderName || "",
      });
    }
  }, [merchant, detailsForm, bankForm]);

  // Form submission handlers
  const onDetailsSubmit = (data: any) => {
    updateDetailsMutation.mutate(data);
  };

  const onBankSubmit = (data: any) => {
    updateBankMutation.mutate(data);
  };

  const handleDelete = () => {
    deleteMerchantMutation.mutate();
    setShowDeleteDialog(false);
  };

  if (merchantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="text-slate-600">Loading merchant details...</span>
        </div>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
    <div className="min-h-screen bg-gray-50">
      <div className={`${isMobile ? 'px-4 py-4' : 'px-6 py-6'} max-w-7xl mx-auto space-y-6`}>
        
        {/* Mobile-optimized Header */}
        <div className={`${isMobile ? 'space-y-4' : 'flex items-center justify-between'}`}>
          <div className={`${isMobile ? 'space-y-3' : 'flex items-center space-x-4'}`}>
            <Button 
              variant="outline" 
              onClick={() => setLocation('/admin/dashboard')}
              size={isMobile ? "sm" : "default"}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isMobile ? "Back" : "Back to Dashboard"}</span>
            </Button>
            <div>
              <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-bold text-gray-900`}>
                {merchant.businessName || merchant.name}
              </h1>
              <p className={`text-gray-600 ${isMobile ? 'text-sm' : ''}`}>
                Merchant ID: {merchant.id}
              </p>
            </div>
          </div>
          
          <div className={`flex items-center ${isMobile ? 'flex-wrap gap-2' : 'space-x-2'}`}>
            <div className="flex items-center space-x-2">
              <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'}>
                {merchant.status === 'active' ? (
                  <CheckCircle className="w-3 h-3 mr-1" />
                ) : (
                  <AlertCircle className="w-3 h-3 mr-1" />
                )}
                {merchant.status}
              </Badge>
            </div>
            
            {/* Management Actions */}
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size={isMobile ? "sm" : "default"}
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4" />
                {!isMobile && <span className="ml-2">Delete</span>}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleLogout}
                size={isMobile ? "sm" : "default"}
                className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
              >
                <LogOut className="w-4 h-4" />
                {!isMobile && <span className="ml-2">Logout</span>}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile-optimized Analytics Cards */}
        <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
              <CreditCard className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">
                {analytics?.totalTransactions || 0}
              </div>
              <p className="text-xs text-blue-600 mt-1">
                {analytics?.completedTransactions || 0} completed
              </p>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-green-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">
                ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
              </div>
              <p className="text-xs text-green-600 mt-1">
                All transactions
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-purple-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Building2 className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${merchant.status === 'active' ? 'text-green-700' : 'text-gray-700'}`}>
                {merchant.status === 'active' ? 'Active' : 'Inactive'}
              </div>
              <p className="text-xs text-purple-600 mt-1">
                Account status
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Mobile-optimized Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className={`grid w-full h-auto p-1 ${isMobile ? 'grid-cols-2 gap-1' : 'grid-cols-4'}`}>
            <TabsTrigger 
              value="overview" 
              className={`flex items-center space-x-2 p-3 ${isMobile ? 'flex-col space-y-1 space-x-0 text-xs' : 'text-sm'}`}
            >
              <Building2 className="w-4 h-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger 
              value="transactions" 
              className={`flex items-center space-x-2 p-3 ${isMobile ? 'flex-col space-y-1 space-x-0 text-xs' : 'text-sm'}`}
            >
              <CreditCard className="w-4 h-4" />
              <span>{isMobile ? 'Payments' : 'Transactions'}</span>
            </TabsTrigger>
            <TabsTrigger 
              value="links" 
              className={`flex items-center space-x-2 p-3 ${isMobile ? 'flex-col space-y-1 space-x-0 text-xs' : 'text-sm'}`}
            >
              <LinkIcon className="w-4 h-4" />
              <span>Links</span>
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className={`flex items-center space-x-2 p-3 ${isMobile ? 'flex-col space-y-1 space-x-0 text-xs' : 'text-sm'}`}
            >
              <Edit className="w-4 h-4" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Merchant Details</CardTitle>
                <CardDescription>Business information and contact details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div>
                    <Label className="text-sm font-medium">Business Name</Label>
                    <p className="text-gray-900 mt-1">{merchant.businessName}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Contact Email</Label>
                    <p className="text-gray-900 mt-1">{merchant.contactEmail}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Contact Phone</Label>
                    <p className="text-gray-900 mt-1">{merchant.contactPhone}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Current Provider Rate</Label>
                    <p className="text-gray-900 mt-1">{merchant.currentProviderRate}%</p>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Business Address</Label>
                  <p className="text-gray-900 mt-1">{merchant.businessAddress}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Latest payment activity for this merchant</CardDescription>
              </CardHeader>
              <CardContent>
                {isMobile ? (
                  // Mobile: Card-based layout
                  <div className="space-y-3">
                    {transactions?.slice(0, 10).map((transaction) => (
                      <div key={transaction.id} className="p-4 border rounded-lg bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{transaction.itemName}</h4>
                          <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'}>
                            {transaction.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Amount: ${formatPrice(transaction.price)}</p>
                          <p>Date: {new Date(transaction.createdAt).toLocaleDateString()}</p>
                          {transaction.windcaveTransactionId && (
                            <p className="font-mono text-xs">ID: {transaction.windcaveTransactionId}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Desktop: Table layout
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Transaction ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions?.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell className="font-medium">{transaction.itemName}</TableCell>
                            <TableCell>${formatPrice(transaction.price)}</TableCell>
                            <TableCell>
                              <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'}>
                                {transaction.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(transaction.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="font-mono text-sm">
                              {transaction.windcaveTransactionId || 'N/A'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Links Tab */}
          <TabsContent value="links" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Links</CardTitle>
                <CardDescription>QR codes and payment URLs for this merchant</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">QR Code URL</Label>
                  <div className={`flex ${isMobile ? 'flex-col space-y-2' : 'items-center space-x-2'} mt-1`}>
                    <Input value={merchant.qrCodeUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(merchant.qrCodeUrl, '_blank')}
                      className={isMobile ? 'w-full' : ''}
                    >
                      View QR
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Payment URL</Label>
                  <div className={`flex ${isMobile ? 'flex-col space-y-2' : 'items-center space-x-2'} mt-1`}>
                    <Input value={merchant.paymentUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(merchant.paymentUrl, '_blank')}
                      className={isMobile ? 'w-full' : ''}
                    >
                      Visit Page
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Merchant Settings</CardTitle>
                <CardDescription>Configuration and management options</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Edit className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Settings Coming Soon</h3>
                  <p className="text-gray-500 text-sm">Merchant configuration options will be available here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Delete Confirmation Dialog */}
        {showDeleteDialog && (
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Merchant</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{merchant.businessName || merchant.name}"? 
                  This action cannot be undone and will permanently remove all merchant data and transactions.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={deleteMerchantMutation.isPending}
                >
                  {deleteMerchantMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete Merchant"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}