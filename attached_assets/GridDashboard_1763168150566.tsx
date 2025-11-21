import { useState, useEffect, useRef } from 'react';
import { TrendingUp, Activity, DollarSign, Users, AlertCircle, CheckCircle, Plus, X, RotateCcw, ChevronRight, ChevronDown, ChevronUp, Clock, Calendar, Bell, Eye } from 'lucide-react';
import { BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import svgPaths from "../imports/svg-as6hoa5n05";
import wavySvgPaths from "../imports/svg-xmcchmd2au";

// Mock data
const mockStats = {
  totalRevenue: 287450,
  totalTransactions: 12847,
  activeMerchants: 42,
  subscriptionRevenue: 1284.70,
  merchantsOwing: 3,
  amountOwed: 2847.50,
  averageDaysLate: 12,
  apiHealthy: 38,
  apiDown: 4,
};

const generateMockRevenue = (days: number) => {
  const revenue = [];
  for (let i = 0; i < days; i++) {
    revenue.push(parseFloat((30 + Math.random() * 30).toFixed(2)));
  }
  return revenue;
};

const mockRecentTransactions = [
  { id: '1', merchant: 'Acme Corp', amount: 301.34, status: 'completed', time: '2 min ago' },
  { id: '2', merchant: 'TechStart Inc', amount: 657.14, status: 'completed', time: '12 min ago' },
  { id: '3', merchant: 'Global Trade', amount: 558.31, status: 'pending', time: '1 hour ago' },
  { id: '4', merchant: 'RetailPro', amount: 234.50, status: 'completed', time: '2 hours ago' },
  { id: '5', merchant: 'Digital Ventures', amount: 892.00, status: 'completed', time: '3 hours ago' },
];

const mockMonthlyRevenue = [
  { month: 'Jan', amount: 21500 },
  { month: 'Feb', amount: 13200 },
  { month: 'Mar', amount: 19000 },
  { month: 'Apr', amount: 20800 },
  { month: 'May', amount: 20600 },
  { month: 'Jun', amount: 12100 },
];

const mockTopMerchants = [
  { name: 'Acme Corp', revenue: 45600, transactions: 456 },
  { name: 'TechStart Inc', revenue: 38900, transactions: 389 },
  { name: 'Global Trade', revenue: 32100, transactions: 321 },
  { name: 'RetailPro', revenue: 28400, transactions: 284 },
];

const mockMerchantsOwing = [
  { name: 'Digital Ventures', amount: 1247.80, daysLate: 18 },
  { name: 'Sunset Retail', amount: 892.50, daysLate: 12 },
  { name: 'QuickMart LLC', amount: 707.20, daysLate: 8 },
  { name: 'BlueOcean Co', amount: 445.30, daysLate: 5 },
  { name: 'TechFlow Systems', amount: 254.70, daysLate: 3 },
];

const mockWebsiteAnalytics = {
  last7Days: {
    views: [1250, 1420, 1680, 1340, 1890, 2100, 1950],
    uniqueVisitors: [890, 1020, 1180, 950, 1340, 1520, 1410],
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  }
};

// Grid configuration
const GRID_CONFIG = {
  desktop: { columns: 12, gap: 16, padding: 24, cellHeight: 90, maxRows: 24 },
  tablet: { columns: 8, gap: 12, padding: 20, cellHeight: 85, maxRows: 30 },
  mobile: { columns: 4, gap: 8, padding: 16, cellHeight: 80, maxRows: 40 },
};

// Widget type definition
type WidgetType = 
  | 'revenue' 
  | 'transactions' 
  | 'merchants' 
  | 'subscription' 
  | 'owing' 
  | 'api-health' 
  | 'api-down'
  | 'recent-activity' 
  | 'notifications'
  | 'income-chart'
  | 'top-merchants'
  | 'commission-revenue'
  | 'web-analytics';

interface GridWidget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
}

type ScreenSize = 'desktop' | 'tablet' | 'mobile';

// Widget available types for adding
const availableWidgets: { 
  type: WidgetType; 
  name: string; 
  defaultW: { desktop: number; tablet: number; mobile: number };
  defaultH: { desktop: number; tablet: number; mobile: number };
}[] = [
  { type: 'revenue', name: 'Total Revenue', defaultW: { desktop: 3, tablet: 4, mobile: 2 }, defaultH: { desktop: 2, tablet: 2, mobile: 2 } },
  { type: 'transactions', name: 'Total Transactions', defaultW: { desktop: 3, tablet: 4, mobile: 2 }, defaultH: { desktop: 2, tablet: 2, mobile: 2 } },
  { type: 'merchants', name: 'Active Merchants', defaultW: { desktop: 3, tablet: 4, mobile: 2 }, defaultH: { desktop: 2, tablet: 2, mobile: 2 } },
  { type: 'subscription', name: 'Subscription Revenue', defaultW: { desktop: 3, tablet: 4, mobile: 2 }, defaultH: { desktop: 2, tablet: 2, mobile: 2 } },
  { type: 'owing', name: 'Merchants Owing', defaultW: { desktop: 4, tablet: 4, mobile: 4 }, defaultH: { desktop: 2, tablet: 2, mobile: 2 } },
  { type: 'api-health', name: 'API Health', defaultW: { desktop: 4, tablet: 4, mobile: 4 }, defaultH: { desktop: 2, tablet: 2, mobile: 2 } },
  { type: 'api-down', name: 'API Down', defaultW: { desktop: 3, tablet: 4, mobile: 2 }, defaultH: { desktop: 2, tablet: 2, mobile: 2 } },
  { type: 'recent-activity', name: 'Recent Activity', defaultW: { desktop: 4, tablet: 4, mobile: 4 }, defaultH: { desktop: 3, tablet: 3, mobile: 4 } },
  { type: 'notifications', name: 'Notifications', defaultW: { desktop: 3, tablet: 4, mobile: 4 }, defaultH: { desktop: 2, tablet: 2, mobile: 3 } },
  { type: 'income-chart', name: 'Income Chart', defaultW: { desktop: 6, tablet: 8, mobile: 4 }, defaultH: { desktop: 3, tablet: 3, mobile: 3 } },
  { type: 'top-merchants', name: 'Top Merchants', defaultW: { desktop: 4, tablet: 8, mobile: 4 }, defaultH: { desktop: 4, tablet: 4, mobile: 5 } },
  { type: 'commission-revenue', name: 'Commission Revenue ($0.10/txn)', defaultW: { desktop: 6, tablet: 8, mobile: 4 }, defaultH: { desktop: 5, tablet: 5, mobile: 5 } },
  { type: 'web-analytics', name: 'Web Analytics', defaultW: { desktop: 6, tablet: 8, mobile: 4 }, defaultH: { desktop: 5, tablet: 5, mobile: 5 } },
];

// Default layouts for each screen size
const defaultLayouts: Record<ScreenSize, GridWidget[]> = {
  desktop: [
    { id: '1', type: 'revenue', x: 0, y: 0, w: 3, h: 2 },
    { id: '2', type: 'transactions', x: 3, y: 0, w: 3, h: 2 },
    { id: '3', type: 'merchants', x: 6, y: 0, w: 3, h: 2 },
    { id: '4', type: 'subscription', x: 9, y: 0, w: 3, h: 2 },
    { id: '5', type: 'owing', x: 0, y: 2, w: 4, h: 2 },
    { id: '6', type: 'api-health', x: 4, y: 2, w: 4, h: 2 },
    { id: '7', type: 'api-down', x: 8, y: 2, w: 4, h: 2 },
    { id: '8', type: 'commission-revenue', x: 0, y: 4, w: 12, h: 5 },
    { id: '9', type: 'recent-activity', x: 0, y: 9, w: 6, h: 3 },
    { id: '10', type: 'income-chart', x: 6, y: 9, w: 6, h: 3 },
    { id: '11', type: 'top-merchants', x: 0, y: 12, w: 6, h: 4 },
  ],
  tablet: [
    { id: '1', type: 'revenue', x: 0, y: 0, w: 4, h: 2 },
    { id: '2', type: 'transactions', x: 4, y: 0, w: 4, h: 2 },
    { id: '3', type: 'merchants', x: 0, y: 2, w: 4, h: 2 },
    { id: '4', type: 'subscription', x: 4, y: 2, w: 4, h: 2 },
    { id: '5', type: 'owing', x: 0, y: 4, w: 4, h: 2 },
    { id: '6', type: 'api-health', x: 4, y: 4, w: 4, h: 2 },
    { id: '7', type: 'commission-revenue', x: 0, y: 6, w: 8, h: 5 },
    { id: '8', type: 'recent-activity', x: 0, y: 11, w: 4, h: 3 },
    { id: '9', type: 'income-chart', x: 4, y: 11, w: 4, h: 3 },
    { id: '10', type: 'top-merchants', x: 0, y: 14, w: 8, h: 4 },
  ],
  mobile: [
    { id: '1', type: 'revenue', x: 0, y: 0, w: 2, h: 2 },
    { id: '2', type: 'transactions', x: 2, y: 0, w: 2, h: 2 },
    { id: '3', type: 'merchants', x: 0, y: 2, w: 2, h: 2 },
    { id: '4', type: 'subscription', x: 2, y: 2, w: 2, h: 2 },
    { id: '5', type: 'owing', x: 0, y: 4, w: 4, h: 2 },
    { id: '6', type: 'api-health', x: 0, y: 6, w: 4, h: 2 },
    { id: '7', type: 'commission-revenue', x: 0, y: 8, w: 4, h: 6 },
    { id: '8', type: 'recent-activity', x: 0, y: 14, w: 4, h: 3 },
  ],
};

// Widget Components
function TotalRevenueWidget({ h }: { h: number }) {
  const isCompact = h === 1;
  return (
    <div className={`h-full flex flex-col justify-between p-3 md:p-4 relative overflow-hidden ${isCompact ? 'gap-0' : ''}`}>
      <div className="absolute inset-0 opacity-20">
        <svg className="absolute bottom-0 right-0 w-full h-20" fill="none" preserveAspectRatio="none" viewBox="0 0 132 50">
          <path d={svgPaths.p3662c700} fill="url(#paint_revenue)" />
          <defs>
            <linearGradient id="paint_revenue" x1="0" x2="132" y1="25" y2="25" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0055FF" />
              <stop offset="1" stopColor="#00E5CC" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className={`flex items-center justify-between ${isCompact ? 'mb-0' : 'mb-2'} relative z-10`}>
        <p className="text-[#dbdfea] text-xs opacity-70">Total Revenue</p>
        <DollarSign className="size-4 text-[#00E5CC]" />
      </div>
      <div className="flex-1 flex flex-col justify-end relative z-10 min-h-0">
        <p className={`text-[#dbdfea] ${isCompact ? 'text-xl' : 'text-2xl md:text-3xl'} ${isCompact ? 'mb-0' : 'mb-1'}`}>${mockStats.totalRevenue.toLocaleString()}</p>
        {!isCompact && <p className="text-[#4ade80] text-xs">↑ 12.5%</p>}
      </div>
    </div>
  );
}

function TotalTransactionsWidget({ h }: { h: number }) {
  const isCompact = h === 1;
  return (
    <div className={`h-full flex flex-col justify-between p-3 md:p-4 relative overflow-hidden ${isCompact ? 'gap-0' : ''}`}>
      <div className="absolute inset-0 opacity-20">
        <svg className="absolute bottom-0 right-0 w-full h-20" fill="none" preserveAspectRatio="none" viewBox="0 0 132 50">
          <path d={svgPaths.p2d7bb600} fill="url(#paint_transactions)" />
          <defs>
            <linearGradient id="paint_transactions" x1="0" x2="132" y1="25" y2="25" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00E5CC" />
              <stop offset="1" stopColor="#0055FF" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className={`flex items-center justify-between ${isCompact ? 'mb-0' : 'mb-2'} relative z-10`}>
        <p className="text-[#dbdfea] text-xs opacity-70">Total Transactions</p>
        <Activity className="size-4 text-[#0055FF]" />
      </div>
      <div className="flex-1 flex flex-col justify-end relative z-10 min-h-0">
        <p className={`text-[#dbdfea] ${isCompact ? 'text-xl' : 'text-2xl md:text-3xl'} ${isCompact ? 'mb-0' : 'mb-1'}`}>{mockStats.totalTransactions.toLocaleString()}</p>
        {!isCompact && <p className="text-[#4ade80] text-xs">↑ 8.2%</p>}
      </div>
    </div>
  );
}

function ActiveMerchantsWidget({ h }: { h: number }) {
  const isCompact = h === 1;
  return (
    <div className={`h-full flex flex-col justify-between p-3 md:p-4 relative overflow-hidden ${isCompact ? 'gap-0' : ''}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#0055FF]/10 via-transparent to-[#0055FF]/5"></div>
      <div className={`flex items-center justify-between ${isCompact ? 'mb-0' : 'mb-2'} relative z-10`}>
        <p className="text-[#dbdfea] text-xs opacity-70">Active Merchants</p>
        <Users className="size-4 text-[#00E5CC]" />
      </div>
      <div className="flex-1 flex flex-col justify-end relative z-10 min-h-0">
        <p className={`text-[#dbdfea] ${isCompact ? 'text-xl' : 'text-2xl md:text-3xl'} ${isCompact ? 'mb-0' : 'mb-1'}`}>{mockStats.activeMerchants}</p>
        {!isCompact && <p className="text-[#4ade80] text-xs">↑ 3 new this month</p>}
      </div>
    </div>
  );
}

function SubscriptionRevenueWidget({ h }: { h: number }) {
  const isCompact = h === 1;
  return (
    <div className={`h-full flex flex-col justify-between p-3 md:p-4 relative overflow-hidden ${isCompact ? 'gap-0' : ''}`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-[#00E5CC]/10 via-transparent to-[#00E5CC]/5"></div>
      <div className={`flex items-center justify-between ${isCompact ? 'mb-0' : 'mb-2'} relative z-10`}>
        <p className="text-[#dbdfea] text-xs opacity-70">Subscription Revenue</p>
        <DollarSign className="size-4 text-[#0055FF]" />
      </div>
      <div className="flex-1 flex flex-col justify-end relative z-10 min-h-0">
        <p className={`text-[#dbdfea] ${isCompact ? 'text-xl' : 'text-2xl md:text-3xl'} ${isCompact ? 'mb-0' : 'mb-1'}`}>${mockStats.subscriptionRevenue.toFixed(2)}</p>
        {!isCompact && <p className="text-[#4ade80] text-xs">This month</p>}
      </div>
    </div>
  );
}

function MerchantsOwingWidget({ h }: { h: number }) {
  const isCompact = h === 1;
  return (
    <div className="h-full flex flex-col p-3 md:p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/15 via-[#f59e0b]/5 to-transparent"></div>
      <div className="absolute inset-0 opacity-30">
        <svg className="absolute bottom-0 left-0 w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 119 31">
          <path d={wavySvgPaths.p1a0a1900} stroke="#f59e0b" strokeWidth="0.5" />
        </svg>
      </div>
      
      <div className="flex items-center justify-between mb-2 md:mb-3 relative z-10 flex-shrink-0">
        <div>
          <p className="text-[#dbdfea] text-xs opacity-70">Merchants Owing</p>
          {!isCompact && (
            <p className="text-[#f59e0b] text-xs mt-0.5">${mockStats.amountOwed.toFixed(2)} total</p>
          )}
        </div>
        <AlertCircle className="size-4 text-[#f59e0b]" />
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2 relative z-10 custom-scrollbar min-h-0">
        {mockMerchantsOwing.map((merchant, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 bg-[#1d1e2c]/80 rounded-lg hover:bg-[#2a2c3e]/80 transition-all">
            <div className="flex-1 min-w-0">
              <p className="text-[#dbdfea] text-xs truncate">{merchant.name}</p>
              <p className="text-[#dbdfea] text-xs opacity-60">{merchant.daysLate} days late</p>
            </div>
            <p className="text-[#f59e0b] text-sm ml-2">${merchant.amount.toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiHealthWidget({ h }: { h: number }) {
  const isCompact = h === 1;
  return (
    <div className={`h-full flex flex-col justify-between p-3 md:p-4 relative z-10 ${isCompact ? 'gap-0' : ''}`}>
      <div className={`flex items-center justify-between ${isCompact ? 'mb-0' : 'mb-2'}`}>
        <p className="text-[#dbdfea] text-xs opacity-70">API Health Status</p>
        <Activity className="size-4 text-[#4ade80]" />
      </div>
      <div className="flex-1 flex flex-col justify-end min-h-0">
        <div className={`flex items-baseline gap-3 ${isCompact ? 'mb-0' : 'mb-2'}`}>
          <div className="flex items-center gap-1.5">
            <CheckCircle className={`${isCompact ? 'size-4' : 'size-5'} text-[#4ade80]`} />
            <p className={`text-[#dbdfea] ${isCompact ? 'text-lg' : 'text-2xl'}`}>{mockStats.apiHealthy}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertCircle className={`${isCompact ? 'size-4' : 'size-5'} text-[#ef4444]`} />
            <p className={`text-[#dbdfea] ${isCompact ? 'text-lg' : 'text-2xl'}`}>{mockStats.apiDown}</p>
          </div>
        </div>
        {!isCompact && <p className="text-[#dbdfea] text-xs opacity-60">{mockStats.apiHealthy} healthy • {mockStats.apiDown} down</p>}
      </div>
    </div>
  );
}

function ApiDownWidget({ h }: { h: number }) {
  const isCompact = h === 1;
  return (
    <div className={`h-full flex flex-col justify-between p-3 md:p-4 relative z-10 ${isCompact ? 'gap-0' : ''}`}>
      <div className={`flex items-center justify-between ${isCompact ? 'mb-0' : 'mb-2'}`}>
        <p className="text-[#dbdfea] text-xs opacity-70">API Down</p>
        <AlertCircle className="size-4 text-[#ef4444]" />
      </div>
      <div className="flex-1 flex flex-col justify-end min-h-0">
        <p className={`text-[#dbdfea] ${isCompact ? 'text-xl' : 'text-2xl md:text-3xl'} ${isCompact ? 'mb-0' : 'mb-1'}`}>{mockStats.apiDown}</p>
        {!isCompact && <p className="text-[#ef4444] text-xs">Needs attention</p>}
      </div>
    </div>
  );
}

function RecentActivityWidget({ h }: { h: number }) {
  return (
    <div className="h-full flex flex-col p-3 md:p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#dbdfea] text-sm">Recent Activity</p>
        <Clock className="size-4 text-[#0055FF]" />
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
        {mockRecentTransactions.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between p-2 bg-[#1d1e2c] rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-[#dbdfea] text-xs truncate">{tx.merchant}</p>
              <p className="text-[#dbdfea] text-xs opacity-60">{tx.time}</p>
            </div>
            <div className="text-right">
              <p className="text-[#dbdfea] text-xs">${tx.amount.toFixed(2)}</p>
              <p className={`text-xs ${tx.status === 'completed' ? 'text-[#4ade80]' : tx.status === 'pending' ? 'text-[#fbbf24]' : 'text-[#ef4444]'}`}>
                {tx.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationsWidget({ h }: { h: number }) {
  return (
    <div className="h-full flex flex-col justify-between p-3 md:p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[#dbdfea] text-xs opacity-70">Notifications</p>
        <Bell className="size-4 text-[#fbbf24]" />
      </div>
      <div className="flex-1 flex flex-col justify-end">
        <p className="text-[#dbdfea] text-2xl md:text-3xl mb-1">5</p>
        <p className="text-[#fbbf24] text-xs">New alerts</p>
      </div>
    </div>
  );
}

function IncomeChartWidget({ h }: { h: number }) {
  return (
    <div className="h-full flex flex-col p-3 md:p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[#dbdfea] text-sm">Monthly Income</p>
          <p className="text-[#dbdfea] text-xs opacity-60">Last 6 months</p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ReBarChart data={mockMonthlyRevenue}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1d1e2c" />
            <XAxis dataKey="month" stroke="#dbdfea" style={{ fontSize: '10px' }} />
            <YAxis stroke="#dbdfea" style={{ fontSize: '10px' }} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#24263a', border: '1px solid #1d1e2c', borderRadius: '8px' }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
            />
            <Bar dataKey="amount" fill="#0055FF" radius={[4, 4, 0, 0]} />
          </ReBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TopMerchantsWidget({ h }: { h: number }) {
  return (
    <div className="h-full flex flex-col p-3 md:p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#dbdfea] text-sm">Top Merchants</p>
        <Users className="size-4 text-[#00E5CC]" />
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {mockTopMerchants.map((merchant, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 bg-[#1d1e2c] rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-[#dbdfea] text-xs truncate">{merchant.name}</p>
              <p className="text-[#dbdfea] text-xs opacity-60">{merchant.transactions} transactions</p>
            </div>
            <p className="text-[#00E5CC] text-sm">${(merchant.revenue / 1000).toFixed(1)}k</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Commission Revenue Widget - THE CORE VISUAL
function CommissionRevenueWidget({ h }: { h: number }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ day: number; value: number } | null>(null);
  const [showData, setShowData] = useState(false);
  const [startDate, setStartDate] = useState('2024-11-01');
  const [endDate, setEndDate] = useState('2024-11-30');
  
  const calculateDays = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diffDays, 1), 365);
  };
  
  const days = calculateDays();
  const [revenueData, setRevenueData] = useState(() => generateMockRevenue(days));
  
  const handleDateChange = () => {
    const newDays = calculateDays();
    setRevenueData(generateMockRevenue(newDays));
  };
  
  const generateLinePath = (data: number[], maxValue: number, width: number, height: number) => {
    if (data.length === 0) return '';
    
    const points = data.map((value, index) => ({
      x: (index / (data.length - 1)) * width,
      y: height - (value / maxValue) * height
    }));
    
    let path = `M ${points[0].x},${points[0].y}`;
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const controlPointX = current.x + (next.x - current.x) / 2;
      path += ` C ${controlPointX},${current.y} ${controlPointX},${next.y} ${next.x},${next.y}`;
    }
    
    return path;
  };

  const generateSmoothPath = (data: number[], maxValue: number, width: number, height: number) => {
    const linePath = generateLinePath(data, maxValue, width, height);
    if (!linePath) return '';
    return `${linePath} L ${width},${height} L 0,${height} Z`;
  };
  
  const maxValue = 60;
  const chartWidth = 543;
  const chartHeight = 137;
  
  const areaPath = generateSmoothPath(revenueData, maxValue, chartWidth, chartHeight);
  const linePath = generateLinePath(revenueData, maxValue, chartWidth, chartHeight);
  
  const total = revenueData.reduce((sum, val) => sum + val, 0);
  const average = total / revenueData.length;
  const maxDaily = Math.max(...revenueData);
  const minDaily = Math.min(...revenueData);
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  return (
    <div className="h-full p-4 md:p-6 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-2 flex-wrap">
        <h3 className="text-[#dbdfea] text-sm md:text-base">Commission Revenue ($0.10/txn)</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-[#1d1e2c] rounded-lg px-3 py-1.5">
            <Calendar className="size-3.5 md:size-4 text-[#dbdfea] opacity-60" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setTimeout(handleDateChange, 0);
              }}
              className="bg-transparent text-[#dbdfea] text-xs md:text-sm border-none outline-none cursor-pointer"
            />
          </div>
          <span className="text-[#dbdfea] opacity-60">to</span>
          <div className="flex items-center gap-2 bg-[#1d1e2c] rounded-lg px-3 py-1.5">
            <Calendar className="size-3.5 md:size-4 text-[#dbdfea] opacity-60" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setTimeout(handleDateChange, 0);
              }}
              className="bg-transparent text-[#dbdfea] text-xs md:text-sm border-none outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto min-h-0">
        <div className="flex gap-2 md:gap-3 mb-4 md:mb-6">
          <div className="flex flex-col justify-between text-right w-12 md:w-16 flex-shrink-0 pt-3 pb-1">
            <span className="text-[#dbdfea] text-xs md:text-sm">$60</span>
            <span className="text-[#dbdfea] text-xs md:text-sm">$45</span>
            <span className="text-[#dbdfea] text-xs md:text-sm">$30</span>
            <span className="text-[#dbdfea] text-xs md:text-sm">$15</span>
            <span className="text-[#dbdfea] text-xs md:text-sm">$0</span>
          </div>
          
          <div className="flex-1 flex flex-col min-w-0">
            <div 
              className="relative min-h-[200px] md:min-h-[240px] h-[200px] md:h-[240px] pt-3 pb-1"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const dayIndex = Math.round((x / rect.width) * (revenueData.length - 1));
                if (dayIndex >= 0 && dayIndex < revenueData.length) {
                  setHoveredPoint({
                    day: dayIndex + 1,
                    value: revenueData[dayIndex]
                  });
                }
              }}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 543 139">
                <defs>
                  <linearGradient id="gradient_blue_commission" x1="271.5" y1="0" x2="271.5" y2="139" gradientUnits="userSpaceOnUse">
                    <stop offset="0.0736" stopColor="#0055FF" stopOpacity="0.6" />
                    <stop offset="0.9962" stopColor="#0055FF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                
                {/* Grid lines */}
                <line x1="0" y1="137" x2="543" y2="137" stroke="#1D1E2C" strokeWidth="1" />
                <line x1="0" y1="103" x2="543" y2="103" stroke="#1D1E2C" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="0" y1="69" x2="543" y2="69" stroke="#1D1E2C" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="0" y1="35" x2="543" y2="35" stroke="#1D1E2C" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="0" y1="1" x2="543" y2="1" stroke="#1D1E2C" strokeWidth="1" strokeDasharray="2 2" />
                
                {/* Revenue data */}
                <path d={areaPath} fill="url(#gradient_blue_commission)" />
                <path d={linePath} fill="none" stroke="#0055FF" strokeWidth="2.5" />
              </svg>
              
              {hoveredPoint && (
                <div 
                  className="absolute pointer-events-none z-10" 
                  style={{ 
                    left: `${(hoveredPoint.day - 1) / (revenueData.length - 1) * 100}%`,
                    top: `${100 - (hoveredPoint.value / maxValue) * 100}%`
                  }}
                >
                  <div className="relative -translate-x-1/2 -translate-y-full mb-2">
                    <div className="bg-[#1d1e2c] rounded px-2 md:px-3 py-1 md:py-1.5 whitespace-nowrap shadow-lg border border-[#3a3c50]">
                      <span className="text-[#dbdfea] text-xs md:text-sm">Day {hoveredPoint.day}: ${hoveredPoint.value.toFixed(2)}</span>
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0" style={{
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: '4px solid #1d1e2c'
                    }} />
                  </div>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-2.5 md:size-3 rounded-full bg-[#0055FF] border-2 border-white" />
                </div>
              )}
            </div>
            
            <div className="flex justify-between px-1 mt-2 md:mt-3">
              <span className="text-[#dbdfea] text-xs md:text-sm">{formatDate(startDate)}</span>
              {days > 7 && <span className="text-[#dbdfea] text-xs md:text-sm opacity-60">•••</span>}
              <span className="text-[#dbdfea] text-xs md:text-sm">{formatDate(endDate)}</span>
            </div>
          </div>
        </div>
        
        {/* Summary Stats - 4 Boxes */}
        <div className="mt-4 md:mt-6 pt-4 md:pt-5 border-t border-[#1d1e2c]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
            <div className="bg-[#1d1e2c] rounded-lg p-3">
              <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Total Revenue</p>
              <p className="text-[#dbdfea] text-base md:text-lg">${total.toFixed(2)}</p>
            </div>
            <div className="bg-[#1d1e2c] rounded-lg p-3">
              <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Daily Average</p>
              <p className="text-[#dbdfea] text-base md:text-lg">${average.toFixed(2)}</p>
            </div>
            <div className="bg-[#1d1e2c] rounded-lg p-3">
              <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Peak Day</p>
              <p className="text-[#dbdfea] text-base md:text-lg">${maxDaily.toFixed(2)}</p>
            </div>
            <div className="bg-[#1d1e2c] rounded-lg p-3">
              <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Lowest Day</p>
              <p className="text-[#dbdfea] text-base md:text-lg">${minDaily.toFixed(2)}</p>
            </div>
          </div>
          
          {/* Show/Hide Daily Data Button */}
          <button
            onClick={() => setShowData(!showData)}
            className="w-full bg-[#1d1e2c] hover:bg-[#2d2f45] rounded-lg px-4 py-2.5 text-[#dbdfea] text-sm transition-colors flex items-center justify-center gap-2"
          >
            <span>{showData ? 'Hide' : 'Show'} Daily Data</span>
            {showData ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          
          {/* Detailed Transaction Table */}
          {showData && (
            <div className="mt-4 bg-[#1d1e2c] rounded-lg p-3 md:p-4 max-h-[300px] overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-[#1d1e2c]">
                  <tr className="border-b border-[#24263a]">
                    <th className="text-left text-[#dbdfea] text-xs md:text-sm opacity-60 pb-2 pr-4">Day</th>
                    <th className="text-right text-[#dbdfea] text-xs md:text-sm opacity-60 pb-2 pr-4">Date</th>
                    <th className="text-right text-[#dbdfea] text-xs md:text-sm opacity-60 pb-2 pr-4">Commission</th>
                    <th className="text-right text-[#dbdfea] text-xs md:text-sm opacity-60 pb-2">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData.map((value, index) => {
                    const currentDate = new Date(startDate);
                    currentDate.setDate(currentDate.getDate() + index);
                    const transactions = Math.round(value / 0.10);
                    
                    return (
                      <tr key={index} className="border-b border-[#24263a]/50 last:border-0">
                        <td className="py-2 pr-4">
                          <span className="text-[#dbdfea] text-xs md:text-sm">Day {index + 1}</span>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <span className="text-[#dbdfea] text-xs md:text-sm opacity-60">
                            {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <span className="text-[#0055FF] text-xs md:text-sm">${value.toFixed(2)}</span>
                        </td>
                        <td className="py-2 text-right">
                          <span className="text-[#00E5CC] text-xs md:text-sm">{transactions}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Web Analytics Widget
function WebAnalyticsWidget({ h }: { h: number }) {
  const [startDate, setStartDate] = useState('2024-11-07');
  const [endDate, setEndDate] = useState('2024-11-13');
  
  const calculateDays = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diffDays, 1), 365);
  };
  
  const days = calculateDays();
  
  const generateChartData = () => {
    const data = [];
    const start = new Date(startDate);
    
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      const dayLabel = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      data.push({
        day: dayLabel,
        views: Math.floor(1200 + Math.random() * 900),
        visitors: Math.floor(800 + Math.random() * 600),
      });
    }
    
    return data;
  };
  
  const [chartData, setChartData] = useState(generateChartData);
  
  const handleDateChange = () => {
    setChartData(generateChartData());
  };

  const totalViews = chartData.reduce((sum, item) => sum + item.views, 0);
  const totalVisitors = chartData.reduce((sum, item) => sum + item.visitors, 0);

  return (
    <div className="h-full flex flex-col p-3 md:p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-[#dbdfea] text-sm">Web Analytics</p>
            <p className="text-[#dbdfea] text-xs opacity-60">{days} days</p>
          </div>
          <Eye className="size-4 text-[#00E5CC]" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-[#1d1e2c] rounded-lg px-2 py-1">
            <Calendar className="size-3 text-[#dbdfea] opacity-60" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setTimeout(handleDateChange, 0);
              }}
              className="bg-transparent text-[#dbdfea] text-xs border-none outline-none cursor-pointer"
            />
          </div>
          <span className="text-[#dbdfea] opacity-60 text-xs">to</span>
          <div className="flex items-center gap-2 bg-[#1d1e2c] rounded-lg px-2 py-1">
            <Calendar className="size-3 text-[#dbdfea] opacity-60" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setTimeout(handleDateChange, 0);
              }}
              className="bg-transparent text-[#dbdfea] text-xs border-none outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 flex-shrink-0">
        <div className="bg-[#1d1e2c] rounded-lg p-2 md:p-3">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Total Views</p>
          <p className="text-[#0055FF] text-lg md:text-xl">{totalViews.toLocaleString()}</p>
        </div>
        <div className="bg-[#1d1e2c] rounded-lg p-2 md:p-3">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Unique Visitors</p>
          <p className="text-[#00E5CC] text-lg md:text-xl">{totalVisitors.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1d1e2c" />
            <XAxis 
              dataKey="day" 
              stroke="#dbdfea" 
              style={{ fontSize: '10px' }}
              interval={days > 15 ? Math.floor(days / 7) : 0}
            />
            <YAxis stroke="#dbdfea" style={{ fontSize: '10px' }} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#24263a', border: '1px solid #1d1e2c', borderRadius: '8px' }}
            />
            <Line type="monotone" dataKey="views" stroke="#0055FF" strokeWidth={2} dot={{ fill: '#0055FF', r: days > 30 ? 0 : 3 }} />
            <Line type="monotone" dataKey="visitors" stroke="#00E5CC" strokeWidth={2} dot={{ fill: '#00E5CC', r: days > 30 ? 0 : 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Render widget content based on type
function WidgetContent({ type, h }: { type: WidgetType; h: number }) {
  switch (type) {
    case 'revenue':
      return <TotalRevenueWidget h={h} />;
    case 'transactions':
      return <TotalTransactionsWidget h={h} />;
    case 'merchants':
      return <ActiveMerchantsWidget h={h} />;
    case 'subscription':
      return <SubscriptionRevenueWidget h={h} />;
    case 'owing':
      return <MerchantsOwingWidget h={h} />;
    case 'api-health':
      return <ApiHealthWidget h={h} />;
    case 'api-down':
      return <ApiDownWidget h={h} />;
    case 'recent-activity':
      return <RecentActivityWidget h={h} />;
    case 'notifications':
      return <NotificationsWidget h={h} />;
    case 'income-chart':
      return <IncomeChartWidget h={h} />;
    case 'top-merchants':
      return <TopMerchantsWidget h={h} />;
    case 'commission-revenue':
      return <CommissionRevenueWidget h={h} />;
    case 'web-analytics':
      return <WebAnalyticsWidget />;
    default:
      return null;
  }
}

interface DashboardProps {
  onNavigate?: (page: 'merchants') => void;
}

export default function GridDashboard({ onNavigate }: DashboardProps = {}) {
  const [screenSize, setScreenSize] = useState<ScreenSize>('desktop');
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  
  const [layouts, setLayouts] = useState<Record<ScreenSize, GridWidget[]>>(defaultLayouts);
  const isInitialMount = useRef(true);
  
  const [draggingWidget, setDraggingWidget] = useState<GridWidget | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [resizingWidget, setResizingWidget] = useState<{ widget: GridWidget; startW: number; startH: number; startX: number; startY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nextId, setNextId] = useState(1000);

  // Load from localStorage on mount
  useEffect(() => {
    const savedLayouts = localStorage.getItem('grid-dashboard-layouts');
    if (savedLayouts) {
      try {
        const parsedLayouts = JSON.parse(savedLayouts);
        setLayouts(parsedLayouts);
        
        // Find the highest ID number to avoid conflicts
        let maxId = 1000;
        Object.values(parsedLayouts).forEach((layout: any) => {
          layout.forEach((widget: GridWidget) => {
            const match = widget.id.match(/widget-(\d+)/);
            if (match) {
              const idNum = parseInt(match[1], 10);
              if (idNum > maxId) {
                maxId = idNum;
              }
            }
          });
        });
        setNextId(maxId + 1);
      } catch (e) {
        console.error('Failed to parse saved layouts:', e);
      }
    }
  }, []);

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
      } else if (width < 1024) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Save to localStorage whenever layouts change (but skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem('grid-dashboard-layouts', JSON.stringify(layouts));
  }, [layouts]);

  const currentLayout = layouts[screenSize];
  const gridConfig = GRID_CONFIG[screenSize];

  const getPixelPosition = (widget: GridWidget) => {
    const containerWidth = containerRef.current?.clientWidth || 0;
    const columnWidth = (containerWidth - gridConfig.padding * 2 - gridConfig.gap * (gridConfig.columns - 1)) / gridConfig.columns;
    
    const x = gridConfig.padding + widget.x * (columnWidth + gridConfig.gap);
    const y = gridConfig.padding + widget.y * (gridConfig.cellHeight + gridConfig.gap);
    const width = widget.w * columnWidth + (widget.w - 1) * gridConfig.gap;
    const height = widget.h * gridConfig.cellHeight + (widget.h - 1) * gridConfig.gap;
    
    return { x, y, width, height, columnWidth };
  };

  const hasCollision = (widget: GridWidget, testWidget: GridWidget) => {
    if (widget.id === testWidget.id) return false;
    return !(
      widget.x + widget.w <= testWidget.x ||
      widget.x >= testWidget.x + testWidget.w ||
      widget.y + widget.h <= testWidget.y ||
      widget.y >= testWidget.y + testWidget.h
    );
  };

  const reflow = (widgets: GridWidget[], movedWidget: GridWidget) => {
    const result = [...widgets];
    const sorted = result.sort((a, b) => a.y - b.y || a.x - b.x);
    
    for (let i = 0; i < sorted.length; i++) {
      const widget = sorted[i];
      let hasCollisionAbove = true;
      
      while (hasCollisionAbove) {
        hasCollisionAbove = false;
        for (let j = 0; j < sorted.length; j++) {
          if (i !== j && hasCollision(widget, sorted[j])) {
            if (sorted[j].y <= widget.y) {
              widget.y = sorted[j].y + sorted[j].h;
              hasCollisionAbove = true;
            }
          }
        }
      }
    }
    
    return result;
  };

  const handleDragStart = (widget: GridWidget, e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.preventDefault();
    
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDraggingWidget(widget);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!draggingWidget || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const columnWidth = (containerWidth - gridConfig.padding * 2 - gridConfig.gap * (gridConfig.columns - 1)) / gridConfig.columns;

    const currentPos = getPixelPosition(draggingWidget);
    const deltaX = e.clientX - dragStartPos.x;
    const deltaY = e.clientY - dragStartPos.y;

    const newPixelX = currentPos.x + deltaX;
    const newPixelY = currentPos.y + deltaY;

    const newX = Math.round((newPixelX - gridConfig.padding) / (columnWidth + gridConfig.gap));
    const newY = Math.round((newPixelY - gridConfig.padding) / (gridConfig.cellHeight + gridConfig.gap));

    const constrainedX = Math.max(0, Math.min(newX, gridConfig.columns - draggingWidget.w));
    const constrainedY = Math.max(0, newY);

    if (constrainedX !== draggingWidget.x || constrainedY !== draggingWidget.y) {
      const updatedWidget = { ...draggingWidget, x: constrainedX, y: constrainedY };
      let updatedWidgets = currentLayout.map(w => w.id === updatedWidget.id ? updatedWidget : w);
      updatedWidgets = reflow(updatedWidgets, updatedWidget);
      
      setLayouts(prev => ({
        ...prev,
        [screenSize]: updatedWidgets,
      }));
      setDraggingWidget(updatedWidget);
      setDragStartPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleDragEnd = () => {
    setDraggingWidget(null);
  };

  const handleResizeStart = (widget: GridWidget, e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setResizingWidget({
      widget,
      startW: widget.w,
      startH: widget.h,
      startX: e.clientX,
      startY: e.clientY,
    });
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingWidget || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const columnWidth = (containerWidth - gridConfig.padding * 2 - gridConfig.gap * (gridConfig.columns - 1)) / gridConfig.columns;

    const deltaX = e.clientX - resizingWidget.startX;
    const deltaY = e.clientY - resizingWidget.startY;

    const deltaW = Math.round(deltaX / (columnWidth + gridConfig.gap));
    const deltaH = Math.round(deltaY / (gridConfig.cellHeight + gridConfig.gap));

    const newW = Math.max(1, Math.min(resizingWidget.startW + deltaW, gridConfig.columns - resizingWidget.widget.x));
    const newH = Math.max(1, resizingWidget.startH + deltaH);

    if (newW !== resizingWidget.widget.w || newH !== resizingWidget.widget.h) {
      const updatedWidget = { ...resizingWidget.widget, w: newW, h: newH };
      let updatedWidgets = currentLayout.map(w => w.id === updatedWidget.id ? updatedWidget : w);
      updatedWidgets = reflow(updatedWidgets, updatedWidget);
      
      setLayouts(prev => ({
        ...prev,
        [screenSize]: updatedWidgets,
      }));
      setResizingWidget({ ...resizingWidget, widget: updatedWidget });
    }
  };

  const handleResizeEnd = () => {
    setResizingWidget(null);
  };

  // Delete widget function
  const handleDelete = (widgetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLayouts(prev => ({
      ...prev,
      [screenSize]: prev[screenSize].filter(w => w.id !== widgetId),
    }));
  };

  const handleResetLayout = () => {
    setLayouts(prev => ({
      ...prev,
      [screenSize]: defaultLayouts[screenSize],
    }));
  };

  const handleAddWidget = (type: WidgetType) => {
    const widgetDef = availableWidgets.find(w => w.type === type);
    if (!widgetDef) return;

    let x = 0, y = 0;
    let found = false;

    for (let row = 0; row < gridConfig.maxRows && !found; row++) {
      for (let col = 0; col <= gridConfig.columns - widgetDef.defaultW[screenSize] && !found; col++) {
        const testWidget: GridWidget = {
          id: `temp`,
          type,
          x: col,
          y: row,
          w: widgetDef.defaultW[screenSize],
          h: widgetDef.defaultH[screenSize],
        };
        
        const hasCollisionHere = currentLayout.some(w => hasCollision(testWidget, w));
        if (!hasCollisionHere) {
          x = col;
          y = row;
          found = true;
        }
      }
    }

    const newWidget: GridWidget = {
      id: `widget-${nextId}`,
      type,
      x,
      y,
      w: widgetDef.defaultW[screenSize],
      h: widgetDef.defaultH[screenSize],
    };

    setNextId(nextId + 1);
    setLayouts(prev => ({
      ...prev,
      [screenSize]: [...prev[screenSize], newWidget],
    }));
    setShowAddWidget(false);
  };

  useEffect(() => {
    if (draggingWidget) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [draggingWidget, dragStartPos]);

  useEffect(() => {
    if (resizingWidget) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingWidget]);

  const maxY = Math.max(...currentLayout.map(w => w.y + w.h), 0);
  const gridHeight = gridConfig.padding * 2 + maxY * gridConfig.cellHeight + (maxY - 1) * gridConfig.gap;

  return (
    <div className="min-h-screen bg-[#1a1b2e] relative">
      <div className="sticky top-0 z-50 bg-[#1a1b2e]/80 backdrop-blur-lg border-b border-[#24263a] px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[#dbdfea] text-xl md:text-2xl">Dashboard</h1>
          <div className="flex items-center gap-2">
            {isEditMode && (
              <>
                <button
                  onClick={handleResetLayout}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#24263a] text-[#dbdfea] text-sm hover:bg-[#2a2c3e] transition-all"
                >
                  <RotateCcw className="size-4" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
                <button
                  onClick={() => setShowAddWidget(!showAddWidget)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#0055FF] to-[#00E5CC] text-white text-sm hover:opacity-90 transition-all"
                >
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Add Widget</span>
                </button>
              </>
            )}
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                isEditMode
                  ? 'bg-[#0055FF] text-white hover:bg-[#0044CC]'
                  : 'bg-[#24263a] text-[#dbdfea] hover:bg-[#2a2c3e]'
              }`}
            >
              {isEditMode ? 'Done' : 'Edit'}
            </button>
          </div>
        </div>
      </div>

      {showAddWidget && isEditMode && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setShowAddWidget(false)}>
          <div className="bg-[#24263a] rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#dbdfea] text-xl">Add Widget</h2>
              <button onClick={() => setShowAddWidget(false)} className="text-[#dbdfea] hover:text-white">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableWidgets.map((widget) => (
                <button
                  key={widget.type}
                  onClick={() => handleAddWidget(widget.type)}
                  className="flex items-center gap-3 p-4 bg-[#1d1e2c] rounded-lg hover:bg-[#2a2c3e] transition-all text-left"
                >
                  <div className="size-10 rounded-full bg-[#0055FF]/20 flex items-center justify-center">
                    <Plus className="size-5 text-[#0055FF]" />
                  </div>
                  <div>
                    <p className="text-[#dbdfea] text-sm">{widget.name}</p>
                    <p className="text-[#dbdfea] text-xs opacity-60">{widget.defaultW[screenSize]}x{widget.defaultH[screenSize]} cells</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative transition-all duration-300"
        style={{
          minHeight: `${gridHeight}px`,
          padding: `${gridConfig.padding}px`,
        }}
      >
        {isEditMode && (
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: `
                repeating-linear-gradient(0deg, #0055FF 0px, #0055FF 1px, transparent 1px, transparent ${gridConfig.cellHeight + gridConfig.gap}px),
                repeating-linear-gradient(90deg, #0055FF 0px, #0055FF 1px, transparent 1px, transparent calc((100% - ${gridConfig.padding * 2 + gridConfig.gap * (gridConfig.columns - 1)}px) / ${gridConfig.columns} + ${gridConfig.gap}px))
              `,
              backgroundPosition: `${gridConfig.padding}px ${gridConfig.padding}px`,
            }}
          />
        )}

        {currentLayout.map((widget) => {
          const pos = getPixelPosition(widget);
          const isDragging = draggingWidget?.id === widget.id;
          const isResizing = resizingWidget?.widget.id === widget.id;

          return (
            <div
              key={widget.id}
              className={`absolute transition-all ease-out ${
                isDragging || isResizing ? 'z-[100] scale-105 opacity-90 duration-0' : 'z-10 duration-400'
              } ${
                isEditMode ? 'cursor-move' : ''
              }`}
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${pos.width}px`,
                height: `${pos.height}px`,
              }}
              onMouseDown={(e) => handleDragStart(widget, e)}
            >
              <div
                className={`h-full rounded-lg md:rounded-xl bg-[#24263a]/80 backdrop-blur-xl border border-white/10 shadow-lg transition-all duration-300 ${
                  isEditMode ? 'hover:scale-[1.02] hover:shadow-2xl' : 'hover:shadow-xl hover:shadow-[#0055FF]/10'
                } ${
                  isDragging || isResizing ? 'shadow-2xl shadow-[#0055FF]/30' : ''
                }`}
              >
                {isEditMode && (
                  <>
                    <button
                      onClick={(e) => handleDelete(widget.id, e)}
                      className="absolute -top-2 -right-2 z-20 size-6 md:size-7 rounded-full bg-[#ef4444] hover:bg-[#dc2626] text-white flex items-center justify-center shadow-lg transition-all hover:scale-110"
                    >
                      <X className="size-3 md:size-4" />
                    </button>

                    <div
                      className="absolute -bottom-1 -right-1 size-5 md:size-6 rounded-full bg-[#0055FF] cursor-se-resize z-20 hover:scale-125 transition-transform"
                      onMouseDown={(e) => handleResizeStart(widget, e)}
                    />
                  </>
                )}

                <WidgetContent type={widget.type} h={widget.h} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}