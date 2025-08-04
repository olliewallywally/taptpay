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
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#06B6D4" />
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
    { name: 'QR Code', value: Math.floor((analytics?.totalTransactions || 0) * 0.6), color: '#3B82F6' },
    { name: 'NFC Tap', value: Math.floor((analytics?.totalTransactions || 0) * 0.3), color: '#8B5CF6' },
    { name: 'Manual', value: Math.floor((analytics?.totalTransactions || 0) * 0.1), color: '#06B6D4' },
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
        {/* Liquid Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl animate-pulse animation-delay-700"></div>
            <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-cyan-500/30 rounded-full blur-3xl animate-pulse animation-delay-1000"></div>
          </div>
        </div>
        
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="flex items-center space-x-4 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 shadow-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
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
      {/* Liquid Glass Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse animation-delay-700"></div>
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse animation-delay-1000"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl animate-pulse animation-delay-500"></div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-8 pb-12">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center space-x-4">
            <div className="p-3 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-2xl">
              <Shield className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-light text-white">Admin Portal</h1>
              <p className="text-white/60 mt-1">Monitor and manage your platform</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="backdrop-blur-2xl bg-white/[0.02] text-white/80 border-white/10 hover:bg-white/[0.05] hover:border-white/20 rounded-2xl px-6 py-3 transition-all duration-300"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-8">
          
          {/* Navigation Tabs */}
          <div className="flex items-center justify-between">
            <TabsList className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-2xl p-2">
              <TabsTrigger 
                value="overview" 
                className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/70 px-6 py-3 rounded-xl transition-all duration-300 hover:text-white"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="merchants" 
                className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/70 px-6 py-3 rounded-xl transition-all duration-300 hover:text-white"
              >
                <Users className="w-4 h-4 mr-2" />
                Merchants
              </TabsTrigger>
              <TabsTrigger 
                value="analytics" 
                className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/70 px-6 py-3 rounded-xl transition-all duration-300 hover:text-white"
              >
                <PieChart className="w-4 h-4 mr-2" />
                Analytics
              </TabsTrigger>
            </TabsList>

            <div className="flex space-x-3">
              <Link href="/admin/api">
                <Button 
                  variant="outline" 
                  className="backdrop-blur-2xl bg-blue-500/10 text-blue-300 border-blue-400/30 hover:bg-blue-500/20 hover:border-blue-300/50 rounded-2xl px-6 py-3 transition-all duration-300"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  API
                </Button>
              </Link>
              <Link href="/admin/create-merchant">
                <Button 
                  className="backdrop-blur-2xl bg-gradient-to-r from-emerald-500/80 to-cyan-500/80 hover:from-emerald-400/90 hover:to-cyan-400/90 text-white border-0 rounded-2xl px-6 py-3 transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Merchant
                </Button>
              </Link>
            </div>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">
            
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Total Merchants */}
              <div className="group backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <Building2 className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform duration-300" />
                  <div className="text-right">
                    <p className="text-white/60 text-sm">Total</p>
                    <p className="text-white/60 text-sm">Merchants</p>
                  </div>
                </div>
                <div className="text-4xl font-light text-white mb-2">
                  <AnimatedCounter value={analytics?.totalMerchants || 0} />
                </div>
                <div className="flex items-center text-green-400 text-sm">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>{analytics?.activeMerchants || 0} active</span>
                </div>
              </div>

              {/* Total Revenue */}
              <div className="group backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <DollarSign className="w-8 h-8 text-emerald-400 group-hover:scale-110 transition-transform duration-300" />
                  <div className="text-right">
                    <p className="text-white/60 text-sm">Total</p>
                    <p className="text-white/60 text-sm">Revenue</p>
                  </div>
                </div>
                <div className="text-4xl font-light text-white mb-2">
                  $<AnimatedCounter value={analytics?.totalRevenue || 0} />
                </div>
                <div className="flex items-center text-emerald-400 text-sm">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>All merchants</span>
                </div>
              </div>

              {/* Transactions */}
              <div className="group backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <CreditCard className="w-8 h-8 text-purple-400 group-hover:scale-110 transition-transform duration-300" />
                  <div className="text-right">
                    <p className="text-white/60 text-sm">Total</p>
                    <p className="text-white/60 text-sm">Transactions</p>
                  </div>
                </div>
                <div className="text-4xl font-light text-white mb-2">
                  <AnimatedCounter value={analytics?.totalTransactions || 0} />
                </div>
                <div className="flex items-center text-purple-400 text-sm">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  <span>{analytics?.completedTransactions || 0} completed</span>
                </div>
              </div>

              {/* Platform Revenue */}
              <div className="group backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <TrendingUp className="w-8 h-8 text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
                  <div className="text-right">
                    <p className="text-white/60 text-sm">Platform</p>
                    <p className="text-white/60 text-sm">Revenue</p>
                  </div>
                </div>
                <div className="text-4xl font-light text-white mb-2">
                  $<AnimatedCounter value={analytics?.transactionFeeRevenue || 0} />
                </div>
                <div className="flex items-center text-cyan-400 text-sm">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>Transaction fees</span>
                </div>
              </div>
            </div>

            {/* Performance Dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Success Rate Circle */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <h3 className="text-xl font-light text-white mb-6">Transaction Success Rate</h3>
                <div className="flex items-center justify-center">
                  <ProgressRing percentage={successRate} />
                </div>
                <div className="text-center mt-6">
                  <p className="text-white/60 text-sm">
                    {analytics?.completedTransactions || 0} of {analytics?.totalTransactions || 0} transactions successful
                  </p>
                </div>
              </div>

              {/* System Health */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <h3 className="text-xl font-light text-white mb-6">System Health</h3>
                <div className="space-y-6">
                  
                  {/* Uptime */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-green-500/20 rounded-xl">
                        <Activity className="w-5 h-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Platform Uptime</p>
                        <p className="text-white/60 text-sm">Last 30 days</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-light text-white">99.9%</p>
                      <div className="flex items-center text-green-400 text-sm">
                        <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                        Online
                      </div>
                    </div>
                  </div>

                  {/* Response Time */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-500/20 rounded-xl">
                        <Zap className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Avg Response Time</p>
                        <p className="text-white/60 text-sm">API endpoints</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-light text-white">1.2s</p>
                      <div className="flex items-center text-blue-400 text-sm">
                        <ArrowDownRight className="w-4 h-4 mr-1" />
                        Fast
                      </div>
                    </div>
                  </div>

                  {/* Active Sessions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-purple-500/20 rounded-xl">
                        <Clock className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Active Sessions</p>
                        <p className="text-white/60 text-sm">Current users</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-light text-white">{analytics?.activeMerchants || 0}</p>
                      <div className="flex items-center text-purple-400 text-sm">
                        <div className="w-2 h-2 bg-purple-400 rounded-full mr-2 animate-pulse"></div>
                        Live
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Merchants */}
            <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-light text-white">Recent Merchants</h3>
                  <p className="text-white/60 text-sm mt-1">Latest merchant activity</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="backdrop-blur-xl bg-white/[0.02] text-white/70 border-white/10 hover:bg-white/[0.05] rounded-xl"
                >
                  View All
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics?.recentMerchants?.slice(0, 6).map((merchant) => (
                  <div 
                    key={merchant.id} 
                    className="group backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-300 hover:scale-105 cursor-pointer"
                    onClick={() => setLocation(`/admin/merchants/${merchant.id}`)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-3 h-3 rounded-full ${merchant.status === 'active' ? 'bg-green-400' : 'bg-gray-400'} animate-pulse`}></div>
                      <Eye className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />
                    </div>
                    
                    <h4 className="text-white font-medium mb-2 truncate">{merchant.businessName}</h4>
                    <p className="text-white/60 text-sm mb-4 font-mono">{merchant.name}</p>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-white/40">Transactions</p>
                        <p className="text-white font-medium">{merchant.totalTransactions}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/40">Revenue</p>
                        <p className="text-white font-medium">${merchant.totalRevenue.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Merchants Tab */}
          <TabsContent value="merchants" className="space-y-8">
            <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8">
              <h3 className="text-xl font-light text-white mb-6">All Merchants</h3>
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <p className="text-white/60">Merchant management features coming soon</p>
              </div>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-8">
            
            {/* Interactive Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Revenue Trend Chart */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <div className="mb-6">
                  <h3 className="text-xl font-light text-white mb-2">Revenue Trend</h3>
                  <p className="text-white/60 text-sm">7-day revenue performance</p>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={generateChartData(analytics).revenueTrend}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                      />
                      <Tooltip content={<GlassTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#3B82F6"
                        strokeWidth={3}
                        fill="url(#revenueGradient)"
                        dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2, fill: 'white' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transaction Status Pie Chart */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <div className="mb-6">
                  <h3 className="text-xl font-light text-white mb-2">Transaction Status</h3>
                  <p className="text-white/60 text-sm">Distribution of transaction outcomes</p>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={generateChartData(analytics).statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={120}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {generateChartData(analytics).statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<GlassTooltip />} />
                      <Legend 
                        wrapperStyle={{ color: 'white' }}
                        formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.8)' }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Payment Methods & Transaction Volume */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Payment Methods Bar Chart */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <div className="mb-6">
                  <h3 className="text-xl font-light text-white mb-2">Payment Methods</h3>
                  <p className="text-white/60 text-sm">Popular payment methods by volume</p>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={generateChartData(analytics).paymentMethods}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                      />
                      <Tooltip content={<GlassTooltip />} />
                      <Bar 
                        dataKey="value" 
                        radius={[8, 8, 0, 0]}
                        fill="url(#barGradient)"
                      >
                        {generateChartData(analytics).paymentMethods.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transaction Volume Line Chart */}
              <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
                <div className="mb-6">
                  <h3 className="text-xl font-light text-white mb-2">Transaction Volume</h3>
                  <p className="text-white/60 text-sm">Daily transaction count trends</p>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={generateChartData(analytics).revenueTrend}>
                      <defs>
                        <linearGradient id="transactionGradient" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#10B981" />
                          <stop offset="100%" stopColor="#06B6D4" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
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
            <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-500">
              <div className="mb-8">
                <h3 className="text-xl font-light text-white mb-2">Real-time Insights</h3>
                <p className="text-white/60 text-sm">Live platform performance metrics</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Conversion Rate */}
                <div className="text-center">
                  <div className="mb-4">
                    <ProgressRing percentage={successRate} size={100} strokeWidth={6} />
                  </div>
                  <h4 className="text-white font-medium mb-1">Conversion Rate</h4>
                  <p className="text-white/60 text-sm">Payment success ratio</p>
                </div>
                
                {/* Average Transaction */}
                <div className="text-center">
                  <div className="mb-4 flex items-center justify-center">
                    <div className="backdrop-blur-xl bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-6">
                      <DollarSign className="w-12 h-12 text-emerald-400 mx-auto" />
                    </div>
                  </div>
                  <h4 className="text-white font-medium mb-1">
                    ${analytics?.totalRevenue && analytics?.totalTransactions 
                      ? (analytics.totalRevenue / analytics.totalTransactions).toFixed(2) 
                      : '0.00'}
                  </h4>
                  <p className="text-white/60 text-sm">Average transaction value</p>
                </div>
                
                {/* Active Merchants */}
                <div className="text-center">
                  <div className="mb-4 flex items-center justify-center">
                    <div className="backdrop-blur-xl bg-blue-500/10 border border-blue-400/30 rounded-2xl p-6">
                      <Users className="w-12 h-12 text-blue-400 mx-auto" />
                    </div>
                  </div>
                  <h4 className="text-white font-medium mb-1">
                    <AnimatedCounter value={analytics?.activeMerchants || 0} />
                  </h4>
                  <p className="text-white/60 text-sm">Active merchants online</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}