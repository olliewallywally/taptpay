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
  LogOut,
  Menu
} from "lucide-react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";

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
  contactPhone: z.string().min(1, "Phone number is required"),
  businessAddress: z.string().min(1, "Business address is required"),
  loginEmail: z.string().email("Valid login email is required"),
  loginPassword: z.string().min(6, "Password must be at least 6 characters"),
});

type CreateMerchantFormData = z.infer<typeof createMerchantSchema>;

export default function AdminDashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // Get admin analytics
  const { data: analytics, isLoading } = useQuery<AdminAnalytics>({
    queryKey: ['/api/admin/analytics'],
    staleTime: 30000,
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="text-slate-600">Loading admin dashboard...</span>
        </div>
      </div>
    );
  }

  const handleViewMerchant = (merchantId: number) => {
    setLocation(`/admin/merchants/${merchantId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        
        {/* Mobile-optimized Header */}
        <div className="flex flex-col space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Admin Portal</h1>
              <p className="text-sm text-gray-600 hidden sm:block">Manage merchants and monitor system performance</p>
            </div>
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

        <Tabs defaultValue="overview" className="space-y-4">
          
          {/* Mobile-first tabs */}
          <TabsList className={`grid w-full h-auto p-1 ${isMobile ? 'grid-cols-2 gap-1' : 'grid-cols-4'}`}>
            <TabsTrigger 
              value="overview" 
              className={`flex items-center space-x-2 p-3 ${isMobile ? 'flex-col space-y-1 space-x-0 text-xs' : 'text-sm'}`}
            >
              <Activity className="w-4 h-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger 
              value="merchants" 
              className={`flex items-center space-x-2 p-3 ${isMobile ? 'flex-col space-y-1 space-x-0 text-xs' : 'text-sm'}`}
            >
              <Users className="w-4 h-4" />
              <span>Merchants</span>
            </TabsTrigger>
            <TabsTrigger 
              value="create" 
              className={`flex items-center space-x-2 p-3 ${isMobile ? 'flex-col space-y-1 space-x-0 text-xs' : 'text-sm'}`}
            >
              <UserPlus className="w-4 h-4" />
              <span>{isMobile ? 'Add' : 'Add New'}</span>
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className={`flex items-center space-x-2 p-3 ${isMobile ? 'flex-col space-y-1 space-x-0 text-xs' : 'text-sm'}`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            
            {/* Mobile-optimized Analytics Cards */}
            <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'}`}>
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Merchants</CardTitle>
                  <Building2 className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-700">
                    {analytics?.totalMerchants || 0}
                  </div>
                  <p className="text-xs text-blue-600 mt-1">
                    {analytics?.activeMerchants || 0} active
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
                    Across all merchants
                  </p>
                </CardContent>
              </Card>

              <Card className="border-purple-200 bg-purple-50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                  <CreditCard className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-700">
                    {analytics?.totalTransactions || 0}
                  </div>
                  <p className="text-xs text-purple-600 mt-1">
                    {analytics?.completedTransactions || 0} completed
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Platform Revenue</CardTitle>
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-700">
                    ${analytics?.transactionFeeRevenue?.toFixed(2) || "0.00"}
                  </div>
                  <p className="text-xs text-orange-600 mt-1">
                    From transaction fees
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Merchants - Mobile optimized */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Merchants</CardTitle>
                <CardDescription>Latest merchant account activity</CardDescription>
              </CardHeader>
              <CardContent>
                {isMobile ? (
                  // Mobile: Card-based layout
                  <div className="space-y-3">
                    {analytics?.recentMerchants?.slice(0, 5).map((merchant) => (
                      <div key={merchant.id} className="p-4 border rounded-lg bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{merchant.businessName}</h4>
                          <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'}>
                            {merchant.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>ID: {merchant.name}</p>
                          <p>Transactions: {merchant.totalTransactions}</p>
                          <p>Revenue: ${merchant.totalRevenue.toFixed(2)}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewMerchant(merchant.id)}
                          className="w-full mt-3"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Desktop: Table layout
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Business Name</TableHead>
                          <TableHead>Merchant ID</TableHead>
                          <TableHead>Transactions</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics?.recentMerchants?.map((merchant) => (
                          <TableRow key={merchant.id}>
                            <TableCell className="font-medium">{merchant.businessName}</TableCell>
                            <TableCell className="font-mono text-sm">{merchant.name}</TableCell>
                            <TableCell>{merchant.totalTransactions}</TableCell>
                            <TableCell>${merchant.totalRevenue.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'}>
                                {merchant.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewMerchant(merchant.id)}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </Button>
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

          {/* Merchants Tab */}
          <TabsContent value="merchants" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Merchants</CardTitle>
                <CardDescription>Complete list of merchant accounts</CardDescription>
              </CardHeader>
              <CardContent>
                {isMobile ? (
                  // Mobile: Simplified card view
                  <div className="space-y-3">
                    {analytics?.recentMerchants?.map((merchant) => (
                      <div key={merchant.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{merchant.businessName}</h4>
                          <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'}>
                            {merchant.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 mb-3">
                          <p>ID: {merchant.name}</p>
                          <p>{merchant.totalTransactions} transactions</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewMerchant(merchant.id)}
                          className="w-full"
                        >
                          Manage
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Desktop: Full table
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Business Name</TableHead>
                          <TableHead>Merchant ID</TableHead>
                          <TableHead>Transactions</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Transaction</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics?.recentMerchants?.map((merchant) => (
                          <TableRow key={merchant.id}>
                            <TableCell className="font-medium">{merchant.businessName}</TableCell>
                            <TableCell className="font-mono text-sm">{merchant.name}</TableCell>
                            <TableCell>{merchant.totalTransactions}</TableCell>
                            <TableCell>${merchant.totalRevenue.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'}>
                                {merchant.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {merchant.lastTransactionDate || 'Never'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewMerchant(merchant.id)}
                              >
                                Manage
                              </Button>
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

          {/* Create Merchant Tab */}
          <TabsContent value="create" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create New Merchant</CardTitle>
                <CardDescription>Add a new merchant account to the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...createMerchantForm}>
                  <form onSubmit={createMerchantForm.handleSubmit(onCreateMerchant)} className="space-y-4">
                    
                    {/* Mobile-optimized form layout */}
                    <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      <FormField
                        control={createMerchantForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Merchant ID</FormLabel>
                            <FormControl>
                              <Input placeholder="unique-merchant-id" {...field} />
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
                              <Input placeholder="Business Display Name" {...field} />
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
                              <Input type="email" placeholder="contact@business.com" {...field} />
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
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <Input placeholder="+64 21 123 4567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createMerchantForm.control}
                        name="loginEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Login Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="login@business.com" {...field} />
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
                              <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={createMerchantForm.control}
                      name="businessAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Address</FormLabel>
                          <FormControl>
                            <Input placeholder="123 Business Street, City, Country" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={createMerchantMutation.isPending}
                      className={`${isMobile ? 'w-full' : 'w-auto'} bg-blue-600 hover:bg-blue-700`}
                    >
                      {createMerchantMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Create Merchant
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Platform Settings</CardTitle>
                <CardDescription>Configure platform settings and preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Settings className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Settings Coming Soon</h3>
                  <p className="text-gray-500 text-sm">System configuration options will be available here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}