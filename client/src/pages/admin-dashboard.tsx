import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { 
  Users, 
  DollarSign, 
  CreditCard, 
  TrendingUp, 
  Building2,
  Activity,
  CheckCircle,
  Eye,
  Loader2,
  Settings,
  UserPlus,
  LogOut,
  Shield,
  BarChart3,
  PieChart as PieChartIcon,
  Clock,
  Zap,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

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

// Animated Counter Component
const AnimatedCounter = ({ value, duration = 2000, prefix = "", suffix = "" }: { 
  value: number; 
  duration?: number; 
  prefix?: string; 
  suffix?: string; 
}) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationId: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      setCount(Math.floor(progress * value));

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [value, duration]);

  return <span>{prefix}{count.toLocaleString()}{suffix}</span>;
};

// Progress Ring Component
const ProgressRing = ({ percentage, size = 120, strokeWidth = 8 }: { 
  percentage: number; 
  size?: number; 
  strokeWidth?: number; 
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;

  return (
    <div className="relative">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-white">{percentage}%</span>
      </div>
    </div>
  );
};

// Custom Tooltip Component for Charts
const GlassTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/20 rounded-2xl p-4 shadow-2xl">
        <p className="text-white font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Generate sample chart data based on analytics
const generateChartData = (analytics: AdminAnalytics | undefined) => {
  // Revenue trend data (last 7 days)
  const revenueTrend = [
    { day: 'Mon', revenue: Math.max(0, (analytics?.totalRevenue || 1000) * 0.1), transactions: Math.max(0, (analytics?.totalTransactions || 50) * 0.1) },
    { day: 'Tue', revenue: Math.max(0, (analytics?.totalRevenue || 1000) * 0.15), transactions: Math.max(0, (analytics?.totalTransactions || 50) * 0.15) },
    { day: 'Wed', revenue: Math.max(0, (analytics?.totalRevenue || 1000) * 0.12), transactions: Math.max(0, (analytics?.totalTransactions || 50) * 0.12) },
    { day: 'Thu', revenue: Math.max(0, (analytics?.totalRevenue || 1000) * 0.18), transactions: Math.max(0, (analytics?.totalTransactions || 50) * 0.18) },
    { day: 'Fri', revenue: Math.max(0, (analytics?.totalRevenue || 1000) * 0.22), transactions: Math.max(0, (analytics?.totalTransactions || 50) * 0.22) },
    { day: 'Sat', revenue: Math.max(0, (analytics?.totalRevenue || 1000) * 0.13), transactions: Math.max(0, (analytics?.totalTransactions || 50) * 0.13) },
    { day: 'Today', revenue: Math.max(0, (analytics?.totalRevenue || 1000) * 0.1), transactions: Math.max(0, (analytics?.totalTransactions || 50) * 0.1) },
  ];

  // Transaction status distribution
  const statusData = [
    { name: 'Completed', value: analytics?.completedTransactions || 0, color: '#10B981' },
    { name: 'Pending', value: (analytics?.totalTransactions || 0) - (analytics?.completedTransactions || 0), color: '#F59E0B' },
    { name: 'Failed', value: Math.max(0, Math.floor((analytics?.totalTransactions || 0) * 0.05)), color: '#EF4444' },
  ];

  // Payment method distribution
  const paymentMethods = [
    { name: 'QR Code', value: Math.floor((analytics?.totalTransactions || 0) * 0.6), color: '#10B981' },
    { name: 'NFC Tap', value: Math.floor((analytics?.totalTransactions || 0) * 0.3), color: '#22C55E' },
    { name: 'Manual', value: Math.floor((analytics?.totalTransactions || 0) * 0.1), color: '#16A34A' },
  ];

  return { revenueTrend, statusData, paymentMethods };
};

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
        {/* Liquid Background - Matching Merchant Site */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-800">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-0 w-96 h-96 bg-gray-500/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-gray-600/20 rounded-full blur-3xl animate-pulse animation-delay-700"></div>
            <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-gray-400/20 rounded-full blur-3xl animate-pulse animation-delay-1000"></div>
          </div>
        </div>
        
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="flex items-center space-x-4 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-green-400" />
            <span className="text-white text-lg">Loading admin portal...</span>
          </div>
        </div>
      </div>
    );
  }

  const successRate = analytics?.completedTransactions && analytics?.totalTransactions 
    ? Math.round((analytics.completedTransactions / analytics.totalTransactions) * 100)
    : 0;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Liquid Glass Background - Matching Merchant Site */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-800">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-gray-500/15 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-gray-600/15 rounded-full blur-3xl animate-pulse animation-delay-700"></div>
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-gray-400/15 rounded-full blur-3xl animate-pulse animation-delay-1000"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-gray-500/10 rounded-full blur-3xl animate-pulse animation-delay-500"></div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-8 pb-6 sm:pb-12">
        
        {/* Mobile-Optimized Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-12 space-y-3 sm:space-y-0">
          <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto">
            <div className="p-2 sm:p-3 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-lg sm:rounded-2xl flex-shrink-0">
              <Shield className="w-5 h-5 sm:w-8 sm:h-8 text-green-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-3xl font-light text-white truncate">Admin Portal</h1>
              <p className="text-white/60 text-xs sm:text-base truncate">Monitor and manage your platform</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            size="sm"
            className="backdrop-blur-2xl bg-white/[0.02] text-white/80 border-white/10 hover:bg-white/[0.05] hover:border-white/20 rounded-lg sm:rounded-2xl px-3 sm:px-6 py-2 sm:py-3 transition-all duration-300 w-full sm:w-auto text-sm"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-4 sm:space-y-8">
          
          {/* Mobile-First Navigation */}
          <div className="flex flex-col space-y-3">
            <TabsList className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl p-1 w-full">
              <div className={`grid ${isMobile ? 'grid-cols-3 gap-1' : 'grid-cols-3 gap-1'} w-full`}>
                <TabsTrigger 
                  value="overview" 
                  className={`data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/70 transition-all duration-300 hover:text-white rounded-lg ${isMobile ? 'px-2 py-2 text-xs' : 'px-6 py-3'}`}
                >
                  <BarChart3 className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
                  {isMobile ? 'Overview' : 'Overview'}
                </TabsTrigger>
                <TabsTrigger 
                  value="merchants" 
                  className={`data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/70 transition-all duration-300 hover:text-white rounded-lg ${isMobile ? 'px-2 py-2 text-xs' : 'px-6 py-3'}`}
                >
                  <Users className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
                  {isMobile ? 'Merchants' : 'Merchants'}
                </TabsTrigger>
                <TabsTrigger 
                  value="analytics" 
                  className={`data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/70 transition-all duration-300 hover:text-white rounded-lg ${isMobile ? 'px-2 py-2 text-xs' : 'px-6 py-3'}`}
                >
                  <PieChartIcon className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
                  {isMobile ? 'Analytics' : 'Analytics'}
                </TabsTrigger>
              </div>
            </TabsList>

            <div className="grid grid-cols-2 gap-2">
              <Link href="/admin/api" className="w-full">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="backdrop-blur-2xl bg-green-500/10 text-green-300 border-green-400/30 hover:bg-green-500/20 hover:border-green-300/50 rounded-lg transition-all duration-300 w-full px-3 py-2 text-xs"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  API
                </Button>
              </Link>
              <Link href="/admin/create-merchant" className="w-full">
                <Button 
                  size="sm"
                  className="backdrop-blur-2xl bg-gradient-to-r from-green-600/80 to-emerald-600/80 hover:from-green-500/90 hover:to-emerald-500/90 text-white border-0 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl w-full px-3 py-2 text-xs"
                >
                  <UserPlus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </Link>
            </div>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 sm:space-y-8">
            
            {/* Key Metrics - Mobile Optimized */}
            <div className={`grid gap-3 sm:gap-6 ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
              
              {/* Total Merchants */}
              <div className="group backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-3 sm:p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <Building2 className="w-5 h-5 sm:w-8 sm:h-8 text-green-400 group-hover:scale-110 transition-transform duration-300" />
                  <div className="text-right">
                    <p className="text-white/60 text-xs leading-tight">Total</p>
                    <p className="text-white/60 text-xs leading-tight">Merchants</p>
                  </div>
                </div>
                <div className="text-xl sm:text-4xl font-light text-white mb-1 sm:mb-2">
                  <AnimatedCounter value={analytics?.totalMerchants || 0} />
                </div>
                <div className="flex items-center text-green-400 text-xs">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  <span className="truncate">{analytics?.activeMerchants || 0} active</span>
                </div>
              </div>

              {/* Total Revenue */}
              <div className="group backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-3 sm:p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <DollarSign className="w-5 h-5 sm:w-8 sm:h-8 text-green-400 group-hover:scale-110 transition-transform duration-300" />
                  <div className="text-right">
                    <p className="text-white/60 text-xs leading-tight">Total</p>
                    <p className="text-white/60 text-xs leading-tight">Revenue</p>
                  </div>
                </div>
                <div className="text-xl sm:text-4xl font-light text-white mb-1 sm:mb-2">
                  $<AnimatedCounter value={analytics?.totalRevenue || 0} />
                </div>
                <div className="flex items-center text-green-400 text-xs">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  <span className="truncate">All merchants</span>
                </div>
              </div>

              {/* Transactions */}
              <div className="group backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-3 sm:p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <CreditCard className="w-5 h-5 sm:w-8 sm:h-8 text-gray-400 group-hover:scale-110 transition-transform duration-300" />
                  <div className="text-right">
                    <p className="text-white/60 text-xs leading-tight">Total</p>
                    <p className="text-white/60 text-xs leading-tight">Transactions</p>
                  </div>
                </div>
                <div className="text-xl sm:text-4xl font-light text-white mb-1 sm:mb-2">
                  <AnimatedCounter value={analytics?.totalTransactions || 0} />
                </div>
                <div className="flex items-center text-gray-400 text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  <span className="truncate">{analytics?.completedTransactions || 0} done</span>
                </div>
              </div>

              {/* Platform Revenue */}
              <div className="group backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-3 sm:p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <TrendingUp className="w-5 h-5 sm:w-8 sm:h-8 text-green-400 group-hover:scale-110 transition-transform duration-300" />
                  <div className="text-right">
                    <p className="text-white/60 text-xs leading-tight">Platform</p>
                    <p className="text-white/60 text-xs leading-tight">Revenue</p>
                  </div>
                </div>
                <div className="text-xl sm:text-4xl font-light text-white mb-1 sm:mb-2">
                  $<AnimatedCounter value={analytics?.transactionFeeRevenue || 0} />
                </div>
                <div className="flex items-center text-green-400 text-xs">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  <span className="truncate">Transaction fees</span>
                </div>
              </div>
            </div>

            {/* Performance Dashboard */}
            <div className="grid gap-4 sm:gap-8 grid-cols-1 lg:grid-cols-2">
              
              {/* Success Rate Circle */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <h3 className="text-base sm:text-xl font-light text-white mb-4 sm:mb-6">Transaction Success Rate</h3>
                <div className="flex items-center justify-center">
                  <ProgressRing percentage={successRate} size={isMobile ? 80 : 120} />
                </div>
                <div className="text-center mt-4 sm:mt-6">
                  <p className="text-white/60 text-xs sm:text-sm">
                    {analytics?.completedTransactions || 0} of {analytics?.totalTransactions || 0} successful
                  </p>
                </div>
              </div>

              {/* System Health */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <h3 className="text-base sm:text-xl font-light text-white mb-4 sm:mb-6">System Health</h3>
                <div className="space-y-4 sm:space-y-6">
                  
                  {/* Uptime */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                      <div className="p-1.5 sm:p-2 bg-green-500/20 rounded-lg flex-shrink-0">
                        <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium text-sm sm:text-base truncate">Platform Uptime</p>
                        <p className="text-white/60 text-xs sm:text-sm truncate">Last 30 days</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg sm:text-2xl font-light text-white">99.9%</p>
                      <div className="flex items-center text-green-400 text-xs sm:text-sm">
                        <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                        Online
                      </div>
                    </div>
                  </div>

                  {/* Response Time */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                      <div className="p-1.5 sm:p-2 bg-green-500/20 rounded-lg flex-shrink-0">
                        <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium text-sm sm:text-base truncate">Avg Response</p>
                        <p className="text-white/60 text-xs sm:text-sm truncate">API endpoints</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg sm:text-2xl font-light text-white">1.2s</p>
                      <div className="flex items-center text-green-400 text-xs sm:text-sm">
                        <ArrowDownRight className="w-3 h-3 mr-1" />
                        Fast
                      </div>
                    </div>
                  </div>

                  {/* Active Sessions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                      <div className="p-1.5 sm:p-2 bg-gray-500/20 rounded-lg flex-shrink-0">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium text-sm sm:text-base truncate">Active Sessions</p>
                        <p className="text-white/60 text-xs sm:text-sm truncate">Current users</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg sm:text-2xl font-light text-white">{analytics?.activeMerchants || 0}</p>
                      <div className="flex items-center text-gray-400 text-xs sm:text-sm">
                        <div className="w-2 h-2 bg-gray-400 rounded-full mr-2 animate-pulse"></div>
                        Live
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Merchants */}
            <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
              <div className="flex items-center justify-between mb-4 sm:mb-8">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-xl font-light text-white truncate">Recent Merchants</h3>
                  <p className="text-white/60 text-xs sm:text-sm mt-1 truncate">Latest merchant activity</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="backdrop-blur-xl bg-white/[0.02] text-white/70 border-white/10 hover:bg-white/[0.05] rounded-lg text-xs px-3 py-1 flex-shrink-0"
                >
                  View All
                </Button>
              </div>
              
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {analytics?.recentMerchants?.slice(0, isMobile ? 3 : 6).map((merchant) => (
                  <div 
                    key={merchant.id} 
                    className="group backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg sm:rounded-2xl p-3 sm:p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-300 hover:scale-105 cursor-pointer"
                    onClick={() => setLocation(`/admin/merchants/${merchant.id}`)}
                  >
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                      <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${merchant.status === 'active' ? 'bg-green-400' : 'bg-gray-400'} animate-pulse`}></div>
                      <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-white/40 group-hover:text-white/70 transition-colors" />
                    </div>
                    
                    <h4 className="text-white font-medium mb-1 sm:mb-2 truncate text-sm sm:text-base">{merchant.businessName}</h4>
                    <p className="text-white/60 text-xs sm:text-sm mb-3 sm:mb-4 font-mono truncate">{merchant.name}</p>
                    
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="min-w-0">
                        <p className="text-white/40 text-xs">Transactions</p>
                        <p className="text-white font-medium truncate">{merchant.totalTransactions}</p>
                      </div>
                      <div className="text-right min-w-0">
                        <p className="text-white/40 text-xs">Revenue</p>
                        <p className="text-white font-medium truncate">${merchant.totalRevenue.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Merchants Tab */}
          <TabsContent value="merchants" className="space-y-4 sm:space-y-8">
            <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8">
              <h3 className="text-base sm:text-xl font-light text-white mb-4 sm:mb-6">All Merchants</h3>
              <div className="text-center py-8 sm:py-12">
                <Users className="w-12 h-12 sm:w-16 sm:h-16 text-white/20 mx-auto mb-3 sm:mb-4" />
                <p className="text-white/60 text-sm sm:text-base">Merchant management features coming soon</p>
              </div>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4 sm:space-y-8">
            
            {/* Interactive Charts Section */}
            <div className="grid gap-4 sm:gap-8 grid-cols-1 lg:grid-cols-2">
              
              {/* Revenue Trend Chart */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base sm:text-xl font-light text-white mb-1 sm:mb-2">Revenue Trend</h3>
                  <p className="text-white/60 text-xs sm:text-sm">7-day revenue performance</p>
                </div>
                <div className="h-48 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={generateChartData(analytics).revenueTrend}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: isMobile ? 10 : 12 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: isMobile ? 10 : 12 }}
                      />
                      <Tooltip content={<GlassTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10B981"
                        strokeWidth={3}
                        fill="url(#revenueGradient)"
                        dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2, fill: 'white' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transaction Status Pie Chart */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base sm:text-xl font-light text-white mb-1 sm:mb-2">Transaction Status</h3>
                  <p className="text-white/60 text-xs sm:text-sm">Distribution of transaction outcomes</p>
                </div>
                <div className="h-48 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={generateChartData(analytics).statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={isMobile ? 40 : 60}
                        outerRadius={isMobile ? 80 : 120}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {generateChartData(analytics).statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<GlassTooltip />} />
                      <Legend 
                        wrapperStyle={{ color: 'white', fontSize: isMobile ? '12px' : '14px' }}
                        formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.8)' }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Payment Methods & Transaction Volume */}
            <div className="grid gap-4 sm:gap-8 grid-cols-1 lg:grid-cols-2">
              
              {/* Payment Methods Bar Chart */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base sm:text-xl font-light text-white mb-1 sm:mb-2">Payment Methods</h3>
                  <p className="text-white/60 text-xs sm:text-sm">Popular payment methods by volume</p>
                </div>
                <div className="h-48 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={generateChartData(analytics).paymentMethods}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: isMobile ? 10 : 12 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: isMobile ? 10 : 12 }}
                      />
                      <Tooltip content={<GlassTooltip />} />
                      <Bar 
                        dataKey="value" 
                        radius={[8, 8, 0, 0]}
                      >
                        {generateChartData(analytics).paymentMethods.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transaction Volume Line Chart */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base sm:text-xl font-light text-white mb-1 sm:mb-2">Transaction Volume</h3>
                  <p className="text-white/60 text-xs sm:text-sm">Daily transaction count trends</p>
                </div>
                <div className="h-48 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={generateChartData(analytics).revenueTrend}>
                      <defs>
                        <linearGradient id="transactionGradient" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#10B981" />
                          <stop offset="100%" stopColor="#22C55E" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: isMobile ? 10 : 12 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: isMobile ? 10 : 12 }}
                      />
                      <Tooltip content={<GlassTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="transactions"
                        stroke="url(#transactionGradient)"
                        strokeWidth={3}
                        dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2, fill: 'white' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Real-time Analytics */}
            <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-xl sm:rounded-3xl p-4 sm:p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
              <div className="mb-4 sm:mb-8">
                <h3 className="text-base sm:text-xl font-light text-white mb-1 sm:mb-2">Real-time Insights</h3>
                <p className="text-white/60 text-xs sm:text-sm">Live platform performance metrics</p>
              </div>
              
              <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-3">
                {/* Conversion Rate */}
                <div className="text-center">
                  <div className="mb-3 sm:mb-4">
                    <ProgressRing percentage={successRate} size={isMobile ? 60 : 100} strokeWidth={isMobile ? 4 : 6} />
                  </div>
                  <h4 className="text-white font-medium mb-1 text-sm sm:text-base">Conversion Rate</h4>
                  <p className="text-white/60 text-xs sm:text-sm">Payment success ratio</p>
                </div>
                
                {/* Average Transaction */}
                <div className="text-center">
                  <div className="mb-3 sm:mb-4 flex items-center justify-center">
                    <div className="backdrop-blur-xl bg-green-500/10 border border-green-400/30 rounded-xl sm:rounded-2xl p-3 sm:p-6">
                      <DollarSign className="w-8 h-8 sm:w-12 sm:h-12 text-green-400 mx-auto" />
                    </div>
                  </div>
                  <h4 className="text-white font-medium mb-1 text-sm sm:text-base">
                    ${analytics?.totalRevenue && analytics?.totalTransactions 
                      ? (analytics.totalRevenue / analytics.totalTransactions).toFixed(2) 
                      : '0.00'}
                  </h4>
                  <p className="text-white/60 text-xs sm:text-sm">Average transaction value</p>
                </div>
                
                {/* Active Merchants */}
                <div className="text-center">
                  <div className="mb-3 sm:mb-4 flex items-center justify-center">
                    <div className="backdrop-blur-xl bg-green-500/10 border border-green-400/30 rounded-xl sm:rounded-2xl p-3 sm:p-6">
                      <Users className="w-8 h-8 sm:w-12 sm:h-12 text-green-400 mx-auto" />
                    </div>
                  </div>
                  <h4 className="text-white font-medium mb-1 text-sm sm:text-base">
                    <AnimatedCounter value={analytics?.activeMerchants || 0} />
                  </h4>
                  <p className="text-white/60 text-xs sm:text-sm">Active merchants online</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}