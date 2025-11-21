import { useState } from 'react';
import { 
  TrendingUp, 
  Users, 
  Globe, 
  Monitor, 
  Smartphone, 
  Tablet, 
  MousePointer, 
  Clock, 
  Target, 
  ShoppingCart, 
  Activity,
  Eye,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Calendar,
  MapPin,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';
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
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from 'recharts';

interface WebsiteAnalyticsProps {
  onSwitchView?: () => void;
}

// Mock Data
const mockTrafficData = [
  { date: 'Nov 1', organic: 1240, social: 520, direct: 380, paid: 290, referral: 150 },
  { date: 'Nov 2', organic: 1380, social: 610, direct: 420, paid: 340, referral: 180 },
  { date: 'Nov 3', organic: 1520, social: 580, direct: 460, paid: 380, referral: 200 },
  { date: 'Nov 4', organic: 1680, social: 650, direct: 510, paid: 420, referral: 230 },
  { date: 'Nov 5', organic: 1450, social: 540, direct: 480, paid: 360, referral: 190 },
  { date: 'Nov 6', organic: 1890, social: 720, direct: 580, paid: 490, referral: 270 },
  { date: 'Nov 7', organic: 2100, social: 810, direct: 640, paid: 550, referral: 310 },
];

const mockDeviceData = [
  { name: 'Desktop', value: 4850, color: '#0055FF' },
  { name: 'Mobile', value: 3420, color: '#00E5CC' },
  { name: 'Tablet', value: 890, color: '#667eea' },
];

const mockGeographicData = [
  { country: 'United States', visitors: 12450, sessions: 18920, flag: '🇺🇸' },
  { country: 'United Kingdom', visitors: 6780, sessions: 10230, flag: '🇬🇧' },
  { country: 'Canada', visitors: 4320, sessions: 6540, flag: '🇨🇦' },
  { country: 'Australia', visitors: 3210, sessions: 4870, flag: '🇦🇺' },
  { country: 'Germany', visitors: 2890, sessions: 4120, flag: '🇩🇪' },
  { country: 'France', visitors: 2340, sessions: 3560, flag: '🇫🇷' },
];

const mockNavigationPaths = [
  { path: 'Home → Products → Checkout', users: 1240, conversions: 856 },
  { path: 'Home → About → Contact', users: 980, conversions: 490 },
  { path: 'Blog → Product → Checkout', users: 760, conversions: 532 },
  { path: 'Home → Pricing → Sign Up', users: 650, conversions: 455 },
  { path: 'Products → Cart → Checkout', users: 520, conversions: 416 },
];

const mockTopPages = [
  { page: '/products', views: 45230, uniqueViews: 38120, avgTime: '3:42', exitRate: '24%' },
  { page: '/home', views: 38920, uniqueViews: 35410, avgTime: '2:18', exitRate: '32%' },
  { page: '/blog/getting-started', views: 28450, uniqueViews: 26780, avgTime: '4:56', exitRate: '18%' },
  { page: '/pricing', views: 22340, uniqueViews: 20890, avgTime: '2:34', exitRate: '28%' },
  { page: '/about', views: 18670, uniqueViews: 17230, avgTime: '1:52', exitRate: '45%' },
];

const mockConversionFunnel = [
  { stage: 'Page Views', users: 10000, percentage: 100 },
  { stage: 'Add to Cart', users: 3500, percentage: 35 },
  { stage: 'Checkout Started', users: 2100, percentage: 21 },
  { stage: 'Payment Info', users: 1680, percentage: 16.8 },
  { stage: 'Order Complete', users: 1260, percentage: 12.6 },
];

const mockLoadingSpeed = [
  { page: '/home', loadTime: 1.2, status: 'excellent' },
  { page: '/products', loadTime: 1.8, status: 'good' },
  { page: '/blog', loadTime: 2.3, status: 'good' },
  { page: '/checkout', loadTime: 3.1, status: 'needs improvement' },
  { page: '/dashboard', loadTime: 2.7, status: 'good' },
];

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  subtitle?: string;
}

function StatCard({ title, value, change, icon, subtitle }: StatCardProps) {
  return (
    <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6 hover:shadow-lg hover:shadow-[#0055FF]/10 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-[#dbdfea] text-xs md:text-sm opacity-70 mb-1">{title}</p>
          <p className="text-[#dbdfea] text-2xl md:text-3xl mb-1">{value}</p>
          {subtitle && <p className="text-[#dbdfea] text-xs opacity-60">{subtitle}</p>}
        </div>
        <div className="size-10 md:size-12 rounded-full bg-[#0055FF]/20 flex items-center justify-center" style={{ boxShadow: '0 0 20px rgba(0, 85, 255, 0.3)' }}>
          {icon}
        </div>
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1">
          {change >= 0 ? (
            <>
              <ArrowUpRight className="size-4 text-[#4ade80]" />
              <span className="text-[#4ade80] text-sm">{change}%</span>
            </>
          ) : (
            <>
              <ArrowDownRight className="size-4 text-[#ef4444]" />
              <span className="text-[#ef4444] text-sm">{Math.abs(change)}%</span>
            </>
          )}
          <span className="text-[#dbdfea] text-xs opacity-60 ml-1">vs last period</span>
        </div>
      )}
    </div>
  );
}

export default function WebsiteAnalytics({ onSwitchView }: WebsiteAnalyticsProps) {
  const [dateRange, setDateRange] = useState('7d');
  const [startDate, setStartDate] = useState('2024-11-01');
  const [endDate, setEndDate] = useState('2024-11-07');

  return (
    <div className="min-h-screen bg-[#1a1b2e] pb-20 md:pb-6">
      {/* Header with Tab Switcher */}
      <div className="sticky top-0 z-40 bg-[#1a1b2e]/80 backdrop-blur-lg border-b border-[#24263a] px-4 py-4 md:px-6 md:py-5">
        {/* Tab Switcher */}
        {onSwitchView && (
          <div className="flex items-center gap-2 mb-4 p-1 bg-[#24263a] rounded-lg w-fit">
            <button 
              onClick={onSwitchView}
              className="px-4 py-2 text-[#dbdfea] text-sm rounded-md hover:bg-[#1d1e2c] transition-all"
            >
              Revenue Analytics
            </button>
            <button 
              className="px-4 py-2 bg-[#0055FF]/80 text-white text-sm rounded-md"
              style={{ boxShadow: '0 0 20px rgba(0, 85, 255, 0.4)' }}
            >
              Web Analytics
            </button>
          </div>
        )}
        
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-1 flex items-center gap-2">
              <Activity className="size-6 md:size-7 text-[#00E5CC]" />
              Website Analytics
            </h1>
            <p className="text-[#dbdfea] text-sm opacity-60">Real-time insights and performance metrics</p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-[#24263a] text-[#dbdfea] text-sm border border-white/10 rounded-lg px-3 py-2 outline-none cursor-pointer hover:border-[#0055FF]/50 transition-all"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="custom">Custom Range</option>
            </select>
            
            {dateRange === 'custom' && (
              <>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#24263a] text-[#dbdfea] text-sm border border-white/10 rounded-lg px-3 py-2 outline-none"
                />
                <span className="text-[#dbdfea] opacity-60">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-[#24263a] text-[#dbdfea] text-sm border border-white/10 rounded-lg px-3 py-2 outline-none"
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-6 md:px-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Page Views"
            value="153.2K"
            change={12.5}
            icon={<Eye className="size-5 md:size-6 text-[#00E5CC]" />}
          />
          <StatCard
            title="Unique Visitors"
            value="42.8K"
            change={8.3}
            icon={<Users className="size-5 md:size-6 text-[#0055FF]" />}
          />
          <StatCard
            title="Avg Session Duration"
            value="4:32"
            change={-2.1}
            icon={<Clock className="size-5 md:size-6 text-[#00E5CC]" />}
            subtitle="minutes"
          />
          <StatCard
            title="Bounce Rate"
            value="32.4%"
            change={-5.2}
            icon={<Activity className="size-5 md:size-6 text-[#0055FF]" />}
          />
        </div>

        {/* Website Performance Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-[#0055FF]" />
            <h2 className="text-[#dbdfea] text-lg md:text-xl">Website Performance</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Page Load Speed */}
            <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
              <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
                <Zap className="size-4 text-[#00E5CC]" />
                Page Loading Speed
              </h3>
              <div className="space-y-3">
                {mockLoadingSpeed.map((page, idx) => (
                  <div key={idx} className="p-3 bg-[#1d1e2c] rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[#dbdfea] text-sm">{page.page}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${
                          page.status === 'excellent' ? 'text-[#4ade80]' :
                          page.status === 'good' ? 'text-[#00E5CC]' :
                          'text-[#f59e0b]'
                        }`}>{page.loadTime}s</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          page.status === 'excellent' ? 'bg-[#4ade80]/20 text-[#4ade80]' :
                          page.status === 'good' ? 'bg-[#00E5CC]/20 text-[#00E5CC]' :
                          'bg-[#f59e0b]/20 text-[#f59e0b]'
                        }`}>{page.status}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-[#24263a] rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          page.status === 'excellent' ? 'bg-[#4ade80]' :
                          page.status === 'good' ? 'bg-[#00E5CC]' :
                          'bg-[#f59e0b]'
                        }`}
                        style={{ width: `${Math.min((page.loadTime / 5) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-[#1d1e2c] rounded-lg">
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Overall Avg Load Time</p>
                <p className="text-[#00E5CC] text-2xl">2.22s</p>
              </div>
            </div>

            {/* Real-time Metrics */}
            <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
              <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
                <Activity className="size-4 text-[#0055FF]" />
                Real-time Metrics
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-gradient-to-br from-[#0055FF]/10 to-[#00E5CC]/5 rounded-lg border border-[#0055FF]/20">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="size-3 rounded-full bg-[#4ade80] animate-pulse"></div>
                    <span className="text-[#dbdfea] text-sm opacity-70">Active Users Right Now</span>
                  </div>
                  <p className="text-[#dbdfea] text-3xl">342</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#1d1e2c] rounded-lg">
                    <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Pageviews/min</p>
                    <p className="text-[#0055FF] text-xl">127</p>
                  </div>
                  <div className="p-3 bg-[#1d1e2c] rounded-lg">
                    <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Events/min</p>
                    <p className="text-[#00E5CC] text-xl">84</p>
                  </div>
                </div>

                <div className="p-4 bg-[#1d1e2c] rounded-lg">
                  <p className="text-[#dbdfea] text-sm mb-3">Top Active Pages</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#dbdfea] opacity-70">/products</span>
                      <span className="text-[#00E5CC]">89 users</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#dbdfea] opacity-70">/checkout</span>
                      <span className="text-[#00E5CC]">56 users</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#dbdfea] opacity-70">/home</span>
                      <span className="text-[#00E5CC]">43 users</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* User Behavior Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MousePointer className="size-5 text-[#00E5CC]" />
            <h2 className="text-[#dbdfea] text-lg md:text-xl">User Behavior</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Session Metrics */}
            <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
              <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
                <BarChart3 className="size-4 text-[#0055FF]" />
                Session Metrics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-[#1d1e2c] rounded-lg">
                  <div>
                    <p className="text-[#dbdfea] text-sm opacity-70">Pages per Session</p>
                    <p className="text-[#dbdfea] text-2xl">4.8</p>
                  </div>
                  <div className="size-12 rounded-full bg-[#0055FF]/20 flex items-center justify-center">
                    <span className="text-[#0055FF] text-sm">+12%</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-[#1d1e2c] rounded-lg">
                  <div>
                    <p className="text-[#dbdfea] text-sm opacity-70">Avg Session Duration</p>
                    <p className="text-[#dbdfea] text-2xl">4m 32s</p>
                  </div>
                  <div className="size-12 rounded-full bg-[#00E5CC]/20 flex items-center justify-center">
                    <span className="text-[#00E5CC] text-sm">-2%</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-[#1d1e2c] rounded-lg">
                  <div>
                    <p className="text-[#dbdfea] text-sm opacity-70">Exit Rate</p>
                    <p className="text-[#dbdfea] text-2xl">28.6%</p>
                  </div>
                  <div className="size-12 rounded-full bg-[#667eea]/20 flex items-center justify-center">
                    <span className="text-[#667eea] text-sm">-8%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Paths */}
            <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
              <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
                <Target className="size-4 text-[#00E5CC]" />
                Top Navigation Paths
              </h3>
              <div className="space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar">
                {mockNavigationPaths.map((item, idx) => (
                  <div key={idx} className="p-3 bg-[#1d1e2c] rounded-lg hover:bg-[#2a2c3e] transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-[#dbdfea] text-sm flex-1">{item.path}</p>
                      <span className="text-[#00E5CC] text-xs ml-2">{((item.conversions / item.users) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-[#dbdfea] opacity-60">{item.users.toLocaleString()} users</span>
                      <span className="text-[#4ade80]">{item.conversions} conversions</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Pages Performance */}
          <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
            <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
              <Eye className="size-4 text-[#0055FF]" />
              Top Pages Performance
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1d1e2c]">
                    <th className="text-left text-[#dbdfea] text-sm opacity-60 pb-3 pr-4">Page</th>
                    <th className="text-right text-[#dbdfea] text-sm opacity-60 pb-3 pr-4">Views</th>
                    <th className="text-right text-[#dbdfea] text-sm opacity-60 pb-3 pr-4">Unique Views</th>
                    <th className="text-right text-[#dbdfea] text-sm opacity-60 pb-3 pr-4">Avg Time</th>
                    <th className="text-right text-[#dbdfea] text-sm opacity-60 pb-3">Exit Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {mockTopPages.map((page, idx) => (
                    <tr key={idx} className="border-b border-[#1d1e2c]/50 hover:bg-[#1d1e2c]/50 transition-all">
                      <td className="py-3 pr-4">
                        <span className="text-[#dbdfea] text-sm flex items-center gap-2">
                          {page.page}
                          <ExternalLink className="size-3 opacity-40" />
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right text-[#0055FF] text-sm">{page.views.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-[#00E5CC] text-sm">{page.uniqueViews.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-[#dbdfea] text-sm">{page.avgTime}</td>
                      <td className="py-3 text-right text-[#dbdfea] text-sm opacity-70">{page.exitRate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Traffic Analysis Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-[#0055FF]" />
            <h2 className="text-[#dbdfea] text-lg md:text-xl">Traffic Analysis</h2>
          </div>

          {/* Traffic Sources Chart */}
          <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
            <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
              <TrendingUp className="size-4 text-[#00E5CC]" />
              Traffic Sources Over Time
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockTrafficData}>
                  <defs>
                    <linearGradient id="organicGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0055FF" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0055FF" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="socialGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00E5CC" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00E5CC" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="directGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#667eea" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#667eea" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1d1e2c" />
                  <XAxis dataKey="date" stroke="#dbdfea" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#dbdfea" style={{ fontSize: '12px' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#24263a', border: '1px solid #1d1e2c', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="organic" stackId="1" stroke="#0055FF" fill="url(#organicGradient)" />
                  <Area type="monotone" dataKey="social" stackId="1" stroke="#00E5CC" fill="url(#socialGradient)" />
                  <Area type="monotone" dataKey="direct" stackId="1" stroke="#667eea" fill="url(#directGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Device Distribution */}
            <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
              <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
                <Monitor className="size-4 text-[#0055FF]" />
                Device Distribution
              </h3>
              <div className="flex items-center justify-center">
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mockDeviceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {mockDeviceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#24263a', border: '1px solid #1d1e2c', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="text-center p-2 bg-[#1d1e2c] rounded-lg">
                  <Monitor className="size-5 text-[#0055FF] mx-auto mb-1" />
                  <p className="text-[#dbdfea] text-sm">{mockDeviceData[0].value.toLocaleString()}</p>
                  <p className="text-[#dbdfea] text-xs opacity-60">Desktop</p>
                </div>
                <div className="text-center p-2 bg-[#1d1e2c] rounded-lg">
                  <Smartphone className="size-5 text-[#00E5CC] mx-auto mb-1" />
                  <p className="text-[#dbdfea] text-sm">{mockDeviceData[1].value.toLocaleString()}</p>
                  <p className="text-[#dbdfea] text-xs opacity-60">Mobile</p>
                </div>
                <div className="text-center p-2 bg-[#1d1e2c] rounded-lg">
                  <Tablet className="size-5 text-[#667eea] mx-auto mb-1" />
                  <p className="text-[#dbdfea] text-sm">{mockDeviceData[2].value.toLocaleString()}</p>
                  <p className="text-[#dbdfea] text-xs opacity-60">Tablet</p>
                </div>
              </div>
            </div>

            {/* New vs Returning */}
            <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
              <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
                <Users className="size-4 text-[#00E5CC]" />
                Visitor Types
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#dbdfea] text-sm">New Visitors</span>
                    <span className="text-[#0055FF]">62.4%</span>
                  </div>
                  <div className="w-full h-3 bg-[#1d1e2c] rounded-full overflow-hidden">
                    <div className="h-full bg-[#0055FF]/80" style={{ width: '62.4%', boxShadow: '0 0 10px rgba(0, 85, 255, 0.4)' }}></div>
                  </div>
                  <p className="text-[#dbdfea] text-xs opacity-60 mt-1">26,720 visitors</p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#dbdfea] text-sm">Returning Visitors</span>
                    <span className="text-[#00E5CC]">37.6%</span>
                  </div>
                  <div className="w-full h-3 bg-[#1d1e2c] rounded-full overflow-hidden">
                    <div className="h-full bg-[#00E5CC]/80" style={{ width: '37.6%', boxShadow: '0 0 10px rgba(0, 229, 204, 0.4)' }}></div>
                  </div>
                  <p className="text-[#dbdfea] text-xs opacity-60 mt-1">16,080 visitors</p>
                </div>

                <div className="mt-6 p-4 bg-[#1d1e2c] rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[#dbdfea] text-sm opacity-70">Avg Pages/Session</p>
                      <div className="flex items-baseline gap-4 mt-1">
                        <div>
                          <span className="text-[#0055FF] text-xl">3.2</span>
                          <span className="text-[#dbdfea] text-xs opacity-60 ml-1">new</span>
                        </div>
                        <div>
                          <span className="text-[#00E5CC] text-xl">6.8</span>
                          <span className="text-[#dbdfea] text-xs opacity-60 ml-1">returning</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Geographic Distribution */}
          <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
            <h3 className="text-[#dbdfea] mb-4 flex items-center gap-2">
              <MapPin className="size-4 text-[#0055FF]" />
              Geographic Distribution
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {mockGeographicData.map((item, idx) => (
                <div key={idx} className="p-4 bg-[#1d1e2c] rounded-lg hover:bg-[#2a2c3e] transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{item.flag}</span>
                    <div className="flex-1">
                      <p className="text-[#dbdfea] text-sm">{item.country}</p>
                      <p className="text-[#dbdfea] text-xs opacity-60">{item.visitors.toLocaleString()} visitors</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#dbdfea] opacity-60">Sessions:</span>
                    <span className="text-[#00E5CC]">{item.sessions.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Conversions & Goals Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Target className="size-5 text-[#00E5CC]" />
            <h2 className="text-[#dbdfea] text-lg md:text-xl">Conversions & Goals</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Conversion Rate"
              value="12.6%"
              change={3.2}
              icon={<Target className="size-5 md:size-6 text-[#00E5CC]" />}
            />
            <StatCard
              title="Abandonment Rate"
              value="21.2%"
              change={-4.5}
              icon={<Activity className="size-5 md:size-6 text-[#0055FF]" />}
            />
            <StatCard
              title="Average Order Value"
              value="$127.50"
              change={8.7}
              icon={<ShoppingCart className="size-5 md:size-6 text-[#00E5CC]" />}
            />
            <StatCard
              title="Goal Completions"
              value="5,432"
              change={15.3}
              icon={<TrendingUp className="size-5 md:size-6 text-[#0055FF]" />}
            />
          </div>

          {/* Conversion Funnel */}
          <div className="bg-[#24263a]/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 md:p-6">
            <h3 className="text-[#dbdfea] mb-6 flex items-center gap-2">
              <Target className="size-4 text-[#00E5CC]" />
              Conversion Funnel
            </h3>
            <div className="space-y-3">
              {mockConversionFunnel.map((stage, idx) => (
                <div key={idx} className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#dbdfea] text-sm">{stage.stage}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[#00E5CC] text-sm">{stage.users.toLocaleString()}</span>
                      <span className="text-[#dbdfea] text-xs opacity-60 w-12 text-right">{stage.percentage}%</span>
                    </div>
                  </div>
                  <div className="relative w-full h-10 bg-[#1d1e2c] rounded-lg overflow-hidden">
                    <div 
                      className="h-full bg-[#0055FF]/80 flex items-center justify-center transition-all duration-500"
                      style={{ width: `${stage.percentage}%`, boxShadow: '0 0 15px rgba(0, 85, 255, 0.4)' }}
                    >
                      {stage.percentage > 15 && (
                        <span className="text-white text-xs">{stage.users.toLocaleString()} users</span>
                      )}
                    </div>
                  </div>
                  {idx < mockConversionFunnel.length - 1 && (
                    <div className="absolute -bottom-1 left-0 text-[#ef4444] text-xs">
                      Drop: {((mockConversionFunnel[idx].users - mockConversionFunnel[idx + 1].users) / mockConversionFunnel[idx].users * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}