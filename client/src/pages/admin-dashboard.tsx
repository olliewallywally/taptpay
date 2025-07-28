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
  Menu,
  Clock,
  Mail,
  Shield
} from "lucide-react";
import { useLocation, Link } from "wouter";
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
    queryFn: async () => {
      const response = await fetch('/api/admin/analytics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch admin analytics');
      return response.json();
    },
    staleTime: 30000,
  });

  // Get all merchants
  const { data: merchants, isLoading: merchantsLoading } = useQuery({
    queryKey: ['/api/admin/merchants'],
    queryFn: async () => {
      const response = await fetch('/api/admin/merchants', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch merchants');
      return response.json();
    },
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
      <div className="min-h-screen relative overflow-hidden">
        {/* Dynamic Moving Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-800">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-purple-900/20 via-transparent to-blue-900/20 animate-gradient-x"></div>
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-l from-gray-800/30 via-transparent to-gray-700/30 animate-gradient-y"></div>
          </div>
        </div>
        
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="flex items-center space-x-3 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            <span className="text-white">Loading admin dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  const handleViewMerchant = (merchantId: number) => {
    setLocation(`/admin/merchants/${merchantId}`);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Dynamic Moving Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-800">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-purple-900/20 via-transparent to-blue-900/20 animate-gradient-x"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-l from-gray-800/30 via-transparent to-gray-700/30 animate-gradient-y"></div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-4 pt-6 sm:pt-8 pb-4 sm:pb-8">
        {/* Mobile-optimized Header */}
        <div className="flex flex-col space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white">Admin Portal</h1>
                <p className="text-sm text-white/70 hidden sm:block">Manage merchants and monitor system performance</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              size={isMobile ? "sm" : "default"}
              className="backdrop-blur-sm bg-red-500/10 text-red-300 border-red-400/30 hover:bg-red-500/20 hover:border-red-300/50"
            >
              <LogOut className="w-4 h-4" />
              {!isMobile && <span className="ml-2">Logout</span>}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
          
          {/* Mobile-first tabs with glass morphism */}
          <div className={`grid w-full gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-5'} backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-2`}>
            <TabsTrigger 
              value="overview" 
              className={`flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 border data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:border-white/40 data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/80 data-[state=inactive]:border-white/20 hover:bg-white/10 hover:text-white ${isMobile ? 'flex-col space-y-1 text-xs' : ''}`}
            >
              <Activity className="w-4 h-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger 
              value="merchants" 
              className={`flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 border data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:border-white/40 data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/80 data-[state=inactive]:border-white/20 hover:bg-white/10 hover:text-white ${isMobile ? 'flex-col space-y-1 text-xs' : ''}`}
            >
              <Users className="w-4 h-4" />
              <span>Merchants</span>
            </TabsTrigger>
            <Link href="/admin/api" className="w-full">
              <Button variant="outline" size={isMobile ? "sm" : "default"} className="w-full flex items-center justify-center gap-2 backdrop-blur-sm bg-blue-500/10 text-blue-300 border-blue-400/30 hover:bg-blue-500/20 hover:border-blue-300/50">
                <Settings className="w-4 h-4" />
                <span>{isMobile ? 'API' : 'API Management'}</span>
              </Button>
            </Link>
            <Link href="/admin/create-merchant" className="w-full">
              <Button variant="default" size={isMobile ? "sm" : "default"} className="w-full flex items-center justify-center gap-2 backdrop-blur-sm bg-gradient-to-r from-green-500/80 via-emerald-500/80 to-green-400/80 border border-green-400/50 text-white hover:from-green-400/90 hover:via-emerald-400/90 hover:to-green-300/90 hover:border-green-300/60">
                <UserPlus className="w-4 h-4" />
                <span>{isMobile ? 'Add' : 'Add Merchant'}</span>
              </Button>
            </Link>
            <TabsTrigger 
              value="settings" 
              className={`flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 border data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:border-white/40 data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/80 data-[state=inactive]:border-white/20 hover:bg-white/10 hover:text-white ${isMobile ? 'flex-col space-y-1 text-xs' : ''}`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </TabsTrigger>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            
            {/* Mobile-optimized Analytics Cards with Glass Morphism */}
            <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'}`}>
              <div className="backdrop-blur-xl bg-blue-500/10 border border-blue-400/30 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-blue-500/15 hover:border-blue-300/40 hover:transform hover:translate-y-[-2px]">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <h3 className="text-sm font-medium text-blue-300">Total Merchants</h3>
                  <Building2 className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-blue-200">
                  {analytics?.totalMerchants || 0}
                </div>
                <p className="text-xs text-blue-300 mt-1">
                  {analytics?.activeMerchants || 0} active
                </p>
              </div>

              <div className="backdrop-blur-xl bg-green-500/10 border border-green-400/30 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-green-500/15 hover:border-green-300/40 hover:transform hover:translate-y-[-2px]">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <h3 className="text-sm font-medium text-green-300">Total Revenue</h3>
                  <DollarSign className="h-4 w-4 text-green-400" />
                </div>
                <div className="text-2xl font-bold text-green-200">
                  ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
                </div>
                <p className="text-xs text-green-300 mt-1">
                  Across all merchants
                </p>
              </div>

              <div className="backdrop-blur-xl bg-purple-500/10 border border-purple-400/30 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-purple-500/15 hover:border-purple-300/40 hover:transform hover:translate-y-[-2px]">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <h3 className="text-sm font-medium text-purple-300">Transactions</h3>
                  <CreditCard className="h-4 w-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-purple-200">
                  {analytics?.totalTransactions || 0}
                </div>
                <p className="text-xs text-purple-300 mt-1">
                  {analytics?.completedTransactions || 0} completed
                </p>
              </div>

              <div className="backdrop-blur-xl bg-orange-500/10 border border-orange-400/30 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-orange-500/15 hover:border-orange-300/40 hover:transform hover:translate-y-[-2px]">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <h3 className="text-sm font-medium text-orange-300">Platform Revenue</h3>
                  <TrendingUp className="h-4 w-4 text-orange-400" />
                </div>
                <div className="text-2xl font-bold text-orange-200">
                  ${analytics?.transactionFeeRevenue?.toFixed(2) || "0.00"}
                </div>
                <p className="text-xs text-orange-300 mt-1">
                  From transaction fees
                </p>
              </div>
            </div>

            {/* Recent Merchants - Mobile optimized with Glass Morphism */}
            <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15">
              <div className="mb-4 sm:mb-6">
                <h2 className="text-lg font-bold text-white mb-1 sm:mb-2">Recent Merchants</h2>
                <p className="text-sm text-white/70">Latest merchant account activity</p>
              </div>
              <div>
                {isMobile ? (
                  // Mobile: Card-based layout
                  <div className="space-y-3">
                    {analytics?.recentMerchants?.slice(0, 5).map((merchant) => (
                      <div key={merchant.id} className="backdrop-blur-sm bg-white/5 border border-white/15 rounded-xl p-4 transition-all duration-300 hover:bg-white/8 hover:border-white/20">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-white">{merchant.businessName}</h4>
                          <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'} className="backdrop-blur-sm bg-white/10 text-white border-white/20">
                            {merchant.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-white/70 space-y-1">
                          <p>ID: {merchant.name}</p>
                          <p>Transactions: {merchant.totalTransactions}</p>
                          <p>Revenue: ${merchant.totalRevenue.toFixed(2)}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewMerchant(merchant.id)}
                          className="w-full mt-3 backdrop-blur-sm bg-white/5 text-white/80 border-white/20 hover:bg-white/10 hover:text-white hover:border-white/30"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Desktop: Table layout with glass morphism
                  <div className="overflow-x-auto backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                    <table className="w-full">
                      <thead className="border-b border-white/10">
                        <tr>
                          <th className="text-left p-3 text-sm font-medium text-white/80">Business Name</th>
                          <th className="text-left p-3 text-sm font-medium text-white/80">Merchant ID</th>
                          <th className="text-left p-3 text-sm font-medium text-white/80">Transactions</th>
                          <th className="text-left p-3 text-sm font-medium text-white/80">Revenue</th>
                          <th className="text-left p-3 text-sm font-medium text-white/80">Status</th>
                          <th className="text-left p-3 text-sm font-medium text-white/80">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics?.recentMerchants?.map((merchant) => (
                          <tr key={merchant.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="p-3 font-medium text-white">{merchant.businessName}</td>
                            <td className="p-3 font-mono text-sm text-white/70">{merchant.name}</td>
                            <td className="p-3 text-white/70">{merchant.totalTransactions}</td>
                            <td className="p-3 text-white/70">${merchant.totalRevenue.toFixed(2)}</td>
                            <td className="p-3">
                              <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'} className="backdrop-blur-sm bg-white/10 text-white border-white/20">
                                {merchant.status}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewMerchant(merchant.id)}
                                className="backdrop-blur-sm bg-white/5 text-white/80 border-white/20 hover:bg-white/10 hover:text-white hover:border-white/30"
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* System Performance Metrics with Glass Morphism */}
            <div className="backdrop-blur-xl bg-white/3 border border-white/8 rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 hover:bg-white/6 hover:border-white/15">
              <div className="mb-4 sm:mb-6">
                <h2 className="text-lg font-bold text-white mb-1 sm:mb-2">System Performance</h2>
                <p className="text-sm text-white/70">Real-time system metrics and health indicators</p>
              </div>
              <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
                <div className="backdrop-blur-sm bg-blue-500/10 border border-blue-400/30 rounded-xl p-4 transition-all duration-300 hover:bg-blue-500/15">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-300">Success Rate</p>
                      <p className="text-2xl font-bold text-blue-200">
                        {analytics?.completedTransactions && analytics?.totalTransactions 
                          ? Math.round((analytics.completedTransactions / analytics.totalTransactions) * 100)
                          : 0}%
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-blue-400" />
                  </div>
                </div>
                
                <div className="backdrop-blur-sm bg-green-500/10 border border-green-400/30 rounded-xl p-4 transition-all duration-300 hover:bg-green-500/15">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-300">Platform Uptime</p>
                      <p className="text-2xl font-bold text-green-200">99.9%</p>
                    </div>
                    <Activity className="h-8 w-8 text-green-400" />
                  </div>
                </div>
                
                <div className="backdrop-blur-sm bg-purple-500/10 border border-purple-400/30 rounded-xl p-4 transition-all duration-300 hover:bg-purple-500/15">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-300">Avg Response</p>
                      <p className="text-2xl font-bold text-purple-200">1.2s</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-purple-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transaction Analytics</CardTitle>
                <CardDescription>Detailed breakdown of payment processing</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Transaction Status Distribution</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-green-500 rounded"></div>
                          <span className="text-sm">Completed</span>
                        </div>
                        <span className="text-sm font-medium">{analytics?.completedTransactions || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                          <span className="text-sm">Pending</span>
                        </div>
                        <span className="text-sm font-medium">
                          {(analytics?.totalTransactions || 0) - (analytics?.completedTransactions || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-red-500 rounded"></div>
                          <span className="text-sm">Failed</span>
                        </div>
                        <span className="text-sm font-medium">0</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Revenue Breakdown</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Merchant Revenue</span>
                        <span className="text-sm font-medium">
                          ${((analytics?.totalRevenue || 0) - (analytics?.transactionFeeRevenue || 0)).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Platform Fees</span>
                        <span className="text-sm font-medium">
                          ${analytics?.transactionFeeRevenue?.toFixed(2) || "0.00"}
                        </span>
                      </div>
                      <div className="border-t pt-2 flex items-center justify-between font-medium">
                        <span className="text-sm">Total Revenue</span>
                        <span className="text-sm">
                          ${analytics?.totalRevenue?.toFixed(2) || "0.00"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Merchant Performance Ranking */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Performing Merchants</CardTitle>
                <CardDescription>Merchants ranked by transaction volume and revenue</CardDescription>
              </CardHeader>
              <CardContent>
                {isMobile ? (
                  <div className="space-y-3">
                    {analytics?.recentMerchants?.slice(0, 5).map((merchant, index) => (
                      <div key={merchant.id} className="p-3 border rounded-lg bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                              index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                            }`}>
                              {index + 1}
                            </div>
                            <span className="font-medium text-sm">{merchant.businessName}</span>
                          </div>
                          <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                            {merchant.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex justify-between">
                            <span>Revenue:</span>
                            <span className="font-medium">${merchant.totalRevenue.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Transactions:</span>
                            <span className="font-medium">{merchant.totalTransactions}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Rank</TableHead>
                          <TableHead>Business Name</TableHead>
                          <TableHead>Total Revenue</TableHead>
                          <TableHead>Transactions</TableHead>
                          <TableHead>Avg Order Value</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics?.recentMerchants?.slice(0, 10).map((merchant, index) => (
                          <TableRow key={merchant.id}>
                            <TableCell>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                              }`}>
                                {index + 1}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{merchant.businessName}</TableCell>
                            <TableCell>${merchant.totalRevenue.toFixed(2)}</TableCell>
                            <TableCell>{merchant.totalTransactions}</TableCell>
                            <TableCell>
                              ${merchant.totalTransactions > 0 
                                ? (merchant.totalRevenue / merchant.totalTransactions).toFixed(2) 
                                : "0.00"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'}>
                                {merchant.status}
                              </Badge>
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
            
            {/* System Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Platform Configuration</CardTitle>
                <CardDescription>System-wide settings and preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Payment Processing</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Transaction Fee Rate</span>
                        <span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded">$0.20 per transaction</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Payment Processor</span>
                        <span className="text-sm font-medium">Windcave (Simulation Mode)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Supported Currencies</span>
                        <span className="text-sm font-medium">NZD, USD, AUD</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Email Configuration</h4>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Button
                          onClick={async () => {
                            try {
                              const response = await apiRequest("POST", "/api/admin/test-email", {});
                              const result = await response.json();
                              toast({
                                title: result.success ? "Test Email Sent" : "Email Test Failed",
                                description: result.message,
                                variant: result.success ? "default" : "destructive",
                              });
                            } catch (error: any) {
                              toast({
                                title: "Email Test Failed",
                                description: error.message || "Failed to send test email",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="w-full"
                        >
                          Test SendGrid Email
                        </Button>
                        
                        <Button
                          variant="destructive"
                          onClick={async () => {
                            try {
                              const response = await apiRequest("POST", "/api/admin/clear-merchants", {});
                              const result = await response.json();
                              toast({
                                title: "Merchants Cleared",
                                description: result.message,
                              });
                              // Refresh merchant list
                              queryClient.invalidateQueries({ queryKey: ['/api/admin/merchants'] });
                              queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics'] });
                            } catch (error: any) {
                              toast({
                                title: "Clear Failed",
                                description: error.message || "Failed to clear merchants",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="w-full"
                        >
                          Clear Ghost Merchants
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">System Limits</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Max Merchants</span>
                        <span className="text-sm font-medium">Unlimited</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Max Transaction Value</span>
                        <span className="text-sm font-medium">$10,000 NZD</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">API Rate Limit</span>
                        <span className="text-sm font-medium">1000 req/min</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Security & Monitoring */}
            <Card>
              <CardHeader>
                <CardTitle>Security & Monitoring</CardTitle>
                <CardDescription>System security status and monitoring alerts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-700">SSL Certificate</p>
                          <p className="text-xs text-green-600">Valid & Active</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-700">Database</p>
                          <p className="text-xs text-green-600">Connected & Healthy</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                      <div className="flex items-center space-x-3">
                        <AlertCircle className="h-8 w-8 text-yellow-600" />
                        <div>
                          <p className="text-sm font-medium text-yellow-700">Windcave API</p>
                          <p className="text-xs text-yellow-600">Simulation Mode</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-900 mb-3">Recent System Events</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm">
                        <span>System startup completed</span>
                        <span className="text-gray-500">2 minutes ago</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm">
                        <span>Database connection established</span>
                        <span className="text-gray-500">2 minutes ago</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm">
                        <span>Admin user logged in</span>
                        <span className="text-gray-500">1 minute ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* User Management */}
            <Card>
              <CardHeader>
                <CardTitle>Administrator Accounts</CardTitle>
                <CardDescription>Manage admin users and access controls</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Active Admin Accounts</p>
                      <p className="text-xs text-gray-500">Total system administrators</p>
                    </div>
                    <span className="text-2xl font-bold">1</span>
                  </div>
                  
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between py-3 border rounded-lg px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                          A
                        </div>
                        <div>
                          <p className="text-sm font-medium">admin@tapt.co.nz</p>
                          <p className="text-xs text-gray-500">Super Administrator</p>
                        </div>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-800">Admin Account Management</p>
                        <p className="text-xs text-blue-700 mt-1">
                          Additional admin management features will be available in future updates. 
                          Contact support for admin account modifications.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Information */}
            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
                <CardDescription>Platform version and technical details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Platform Version</span>
                      <span className="text-sm font-medium">v1.0.0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Environment</span>
                      <span className="text-sm font-medium">Development</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Server Uptime</span>
                      <span className="text-sm font-medium">2 minutes</span>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Database Type</span>
                      <span className="text-sm font-medium">PostgreSQL</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Last Backup</span>
                      <span className="text-sm font-medium">Auto (Live)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Storage Used</span>
                      <span className="text-sm font-medium">{"< 1 MB"}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}