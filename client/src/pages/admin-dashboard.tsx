import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { 
  Users, 
  DollarSign, 
  CreditCard, 
  TrendingUp, 
  Building2,
  Activity,
  AlertCircle,
  CheckCircle,
  Eye,
  Loader2,
  Plus,
  Settings,
  UserPlus,
  LogOut
} from "lucide-react";
import { useLocation } from "wouter";

interface AdminAnalytics {
  totalMerchants: number;
  activeMerchants: number;
  totalRevenue: number;
  totalTransactions: number;
  completedTransactions: number;
  transactionFeeRevenue: number;
  recentMerchants: Array<{
    id: number;
    name: string;
    businessName: string;
    totalTransactions: number;
    totalRevenue: number;
    status: 'active' | 'inactive';
    lastTransactionDate: string | null;
  }>;
}

const createMerchantSchema = z.object({
  name: z.string().min(1, "Merchant name is required"),
  businessName: z.string().min(1, "Business name is required"),
  contactEmail: z.string().email("Valid email is required"),
  contactPhone: z.string().min(1, "Contact phone is required"),
  businessAddress: z.string().min(1, "Business address is required"),
  currentProviderRate: z.string().regex(/^\d+(\.\d{1,4})?$/, "Rate must be a valid percentage"),
  bankName: z.string().min(1, "Bank name is required"),
  bankAccountNumber: z.string().min(1, "Bank account number is required"),
  bankBranch: z.string().min(1, "Bank branch is required"),
  accountHolderName: z.string().min(1, "Account holder name is required"),
  loginEmail: z.string().email("Valid login email is required"),
  loginPassword: z.string().min(6, "Password must be at least 6 characters"),
});

type CreateMerchantFormData = z.infer<typeof createMerchantSchema>;

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch overall admin analytics
  const { data: analytics, isLoading } = useQuery<AdminAnalytics>({
    queryKey: ['/api/admin/analytics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/analytics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch admin analytics');
      return response.json();
    },
  });

  // Create merchant form
  const createMerchantForm = useForm<CreateMerchantFormData>({
    resolver: zodResolver(createMerchantSchema),
    defaultValues: {
      name: "",
      businessName: "",
      contactEmail: "",
      contactPhone: "",
      businessAddress: "",
      currentProviderRate: "2.5",
      bankName: "",
      bankAccountNumber: "",
      bankBranch: "",
      accountHolderName: "",
      loginEmail: "",
      loginPassword: "",
    },
  });

  // Create merchant mutation
  const createMerchantMutation = useMutation({
    mutationFn: async (data: CreateMerchantFormData) => {
      const response = await apiRequest("POST", "/api/admin/merchants", data);
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics'] });
      createMerchantForm.reset();
      toast({
        title: "Merchant Created",
        description: `Successfully created merchant account for ${result.businessName}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create merchant account",
        variant: "destructive",
      });
    },
  });

  const onCreateMerchant = (data: CreateMerchantFormData) => {
    createMerchantMutation.mutate(data);
  };

  const handleLogout = () => {
    localStorage.removeItem("adminAuthToken");
    localStorage.removeItem("adminUser");
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
    setLocation("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
          <span className="text-slate-600">Loading admin dashboard...</span>
        </div>
      </div>
    );
  }

  const handleViewMerchant = (merchantId: number) => {
    setLocation(`/admin/merchants/${merchantId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600">System-wide performance and merchant management</p>
        </div>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="flex items-center space-x-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center space-x-2">
            <Activity className="w-4 h-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="merchants" className="flex items-center space-x-2">
            <Users className="w-4 h-4" />
            <span>Merchants</span>
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center space-x-2">
            <UserPlus className="w-4 h-4" />
            <span>Create Merchant</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center space-x-2">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Merchants</CardTitle>
                <Building2 className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {analytics?.totalMerchants || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {analytics?.activeMerchants || 0} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Merchant Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Across all merchants
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                <CreditCard className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {analytics?.totalTransactions || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {analytics?.completedTransactions || 0} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue from Fees</CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  ${analytics?.transactionFeeRevenue?.toFixed(2) || "0.00"}
                </div>
                <p className="text-xs text-muted-foreground">
                  From $0.20 per transaction
                </p>
              </CardContent>
            </Card>
          </div>

          {/* System Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Merchant Performance</span>
                </CardTitle>
                <CardDescription>
                  Overview of all merchants and their activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics?.recentMerchants && analytics.recentMerchants.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Transactions</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Last Activity</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.recentMerchants.map((merchant) => (
                        <TableRow key={merchant.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{merchant.businessName || merchant.name}</p>
                              <p className="text-sm text-gray-500">ID: {merchant.id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={merchant.status === 'active' ? 'default' : 'secondary'}
                              className={merchant.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                            >
                              <div className="flex items-center space-x-1">
                                {merchant.status === 'active' ? (
                                  <CheckCircle className="w-3 h-3" />
                                ) : (
                                  <AlertCircle className="w-3 h-3" />
                                )}
                                <span>{merchant.status}</span>
                              </div>
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{merchant.totalTransactions}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">${merchant.totalRevenue.toFixed(2)}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-gray-600">
                              {merchant.lastTransactionDate 
                                ? new Date(merchant.lastTransactionDate).toLocaleDateString('en-NZ')
                                : 'No transactions'
                              }
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewMerchant(merchant.id)}
                              className="flex items-center space-x-1"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Manage</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No merchants found</h3>
                    <p className="text-gray-500">No merchant accounts have been created yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>System Health</span>
                </CardTitle>
                <CardDescription>
                  Real-time system status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Payment Processing</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-sm text-green-600">Online</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Database</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-sm text-green-600">Connected</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">QR Code Generation</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-sm text-green-600">Active</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Payment Links</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-sm text-green-600">Monitoring</span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setLocation('/admin/system')}
                  >
                    View System Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="merchants" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>All Merchants</span>
              </CardTitle>
              <CardDescription>
                Manage and monitor all merchant accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analytics?.recentMerchants && analytics.recentMerchants.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.recentMerchants.map((merchant) => (
                      <TableRow key={merchant.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{merchant.businessName || merchant.name}</p>
                            <p className="text-sm text-gray-500">ID: {merchant.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={merchant.status === 'active' ? 'default' : 'secondary'}
                            className={merchant.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                          >
                            <div className="flex items-center space-x-1">
                              {merchant.status === 'active' ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <AlertCircle className="w-3 h-3" />
                              )}
                              <span>{merchant.status}</span>
                            </div>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{merchant.totalTransactions}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">${merchant.totalRevenue.toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600">
                            {merchant.lastTransactionDate 
                              ? new Date(merchant.lastTransactionDate).toLocaleDateString('en-NZ')
                              : 'No transactions'
                            }
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewMerchant(merchant.id)}
                            className="flex items-center space-x-1"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Manage</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No merchants found</h3>
                  <p className="text-gray-500">No merchant accounts have been created yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5" />
                <span>Create New Merchant</span>
              </CardTitle>
              <CardDescription>
                Set up a new merchant account with login credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...createMerchantForm}>
                <form onSubmit={createMerchantForm.handleSubmit(onCreateMerchant)} className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Business Information */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Business Information</h3>
                      
                      <FormField
                        control={createMerchantForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Merchant ID Name</FormLabel>
                            <FormControl>
                              <Input placeholder="merchant-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="businessName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Coffee Corner Ltd" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="contactEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="info@business.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="contactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="+64 9 123 4567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="businessAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Address</FormLabel>
                            <FormControl>
                              <Input placeholder="123 Queen St, Auckland" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="currentProviderRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Current Provider Rate (%)</FormLabel>
                            <FormControl>
                              <Input placeholder="2.5" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Banking & Login Information */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Banking Information</h3>
                      
                      <FormField
                        control={createMerchantForm.control}
                        name="bankName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bank Name</FormLabel>
                            <FormControl>
                              <Input placeholder="ASB Bank" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="accountHolderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Account Holder Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Coffee Corner Ltd" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="bankAccountNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Account Number</FormLabel>
                            <FormControl>
                              <Input placeholder="12-3456-7890123-00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="bankBranch"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bank Branch</FormLabel>
                            <FormControl>
                              <Input placeholder="Queen Street" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="pt-4 border-t">
                        <h3 className="text-lg font-medium mb-4">Login Credentials</h3>
                        
                        <FormField
                          control={createMerchantForm.control}
                          name="loginEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Login Email</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="merchant@business.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={createMerchantForm.control}
                          name="loginPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Login Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="Secure password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-6 border-t">
                    <Button
                      type="submit"
                      disabled={createMerchantMutation.isPending}
                      className="flex items-center space-x-2"
                    >
                      {createMerchantMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>Create Merchant Account</span>
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>System Settings</span>
              </CardTitle>
              <CardDescription>
                Configure platform settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Settings className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Settings Coming Soon</h3>
                <p className="text-gray-500">System configuration options will be available here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}