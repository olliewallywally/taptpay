import { useState, useEffect } from 'react';
import { Resizable } from 're-resizable';
import { TrendingUp, Activity, DollarSign, Users, AlertCircle, CheckCircle, Edit3, Plus, X, GripVertical, Save, Maximize2, Eye, MousePointer, Clock, Calendar, ChevronRight, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import NotificationPanel from './NotificationPanel';
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

const mockMonthlyRevenue = [
  { month: 'Jan', amount: 21500 },
  { month: 'Feb', amount: 13200 },
  { month: 'Mar', amount: 19000 },
  { month: 'Apr', amount: 20800 },
  { month: 'May', amount: 20600 },
  { month: 'Jun', amount: 12100 },
  { month: 'Jul', amount: 16500 },
  { month: 'Aug', amount: 20800 },
  { month: 'Sep', amount: 12100 },
  { month: 'Oct', amount: 21400 },
  { month: 'Nov', amount: 16500 },
  { month: 'Dec', amount: 14000 },
];

// Commission Revenue Data generator - $0.10 per transaction
const generateMockRevenue = (days: number) => {
  const revenue = [];
  for (let i = 0; i < days; i++) {
    // Generate random daily commission between $30-$60
    revenue.push(parseFloat((30 + Math.random() * 30).toFixed(2)));
  }
  return revenue;
};

const mockRecentTransactions = [
  { id: '1', merchant: 'Acme Corp', amount: 301.34, status: 'completed', time: '2 min ago', commission: 0.10 },
  { id: '2', merchant: 'TechStart Inc', amount: 657.14, status: 'completed', time: '12 min ago', commission: 0.10 },
  { id: '3', merchant: 'Global Trade', amount: 558.31, status: 'pending', time: '1 hour ago', commission: 0.10 },
  { id: '4', merchant: 'RetailPro', amount: 234.50, status: 'completed', time: '2 hours ago', commission: 0.10 },
  { id: '5', merchant: 'Digital Ventures', amount: 892.00, status: 'completed', time: '3 hours ago', commission: 0.10 },
  { id: '6', merchant: 'E-Commerce Hub', amount: 125.75, status: 'failed', time: '4 hours ago', commission: 0.00 },
];

const mockMerchants = [
  { name: 'Acme Corp', health: 'healthy', revenue: 24500, transactions: 245 },
  { name: 'TechStart Inc', health: 'healthy', revenue: 18900, transactions: 189 },
  { name: 'Global Trade', health: 'down', revenue: 32100, transactions: 321 },
  { name: 'RetailPro', health: 'healthy', revenue: 15600, transactions: 156 },
  { name: 'Digital Ventures', health: 'healthy', revenue: 41200, transactions: 412 },
  { name: 'E-Commerce Hub', health: 'healthy', revenue: 28900, transactions: 289 },
  { name: 'Payment Gateway Pro', health: 'healthy', revenue: 22300, transactions: 223 },
  { name: 'ShopFlow Systems', health: 'down', revenue: 19800, transactions: 198 },
];

// Website Analytics Data
const mockWebsiteAnalytics = {
  last7Days: {
    views: [1250, 1420, 1680, 1340, 1890, 2100, 1950],
    uniqueVisitors: [890, 1020, 1180, 950, 1340, 1520, 1410],
    sessions: [1100, 1280, 1450, 1150, 1620, 1820, 1680],
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  last30Days: {
    views: [
      1250, 1420, 1680, 1340, 1890, 2100, 1950, 1720, 1560, 1890,
      2050, 1780, 1920, 2200, 2100, 1950, 1720, 1990, 2150, 2080,
      1890, 1950, 2100, 2250, 2080, 1920, 2050, 2200, 2350, 2180
    ],
    uniqueVisitors: [
      890, 1020, 1180, 950, 1340, 1520, 1410, 1240, 1120, 1360,
      1480, 1280, 1390, 1580, 1520, 1410, 1240, 1430, 1550, 1500,
      1360, 1410, 1520, 1620, 1500, 1390, 1480, 1580, 1700, 1570
    ],
    sessions: [
      1100, 1280, 1450, 1150, 1620, 1820, 1680, 1480, 1340, 1630,
      1760, 1540, 1650, 1890, 1820, 1680, 1480, 1710, 1850, 1790,
      1630, 1680, 1820, 1930, 1790, 1650, 1760, 1890, 2020, 1870
    ],
    labels: Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`)
  },
  last90Days: {
    views: Array.from({ length: 90 }, (_, i) => 1500 + Math.sin(i / 10) * 500 + Math.random() * 300),
    uniqueVisitors: Array.from({ length: 90 }, (_, i) => 1100 + Math.sin(i / 10) * 350 + Math.random() * 200),
    sessions: Array.from({ length: 90 }, (_, i) => 1300 + Math.sin(i / 10) * 400 + Math.random() * 250),
    labels: Array.from({ length: 90 }, (_, i) => `Day ${i + 1}`)
  }
};

// Widget type definitions
type WidgetType = 
  | 'totalRevenue'
  | 'totalTransactions'
  | 'activeMerchants'
  | 'subscriptionRevenue'
  | 'merchantsOwing'
  | 'apiHealthy'
  | 'apiDown'
  | 'outlayChart'
  | 'apiStatus'
  | 'incomeChart'
  | 'topMerchants'
  | 'latestTransactions'
  | 'websiteAnalytics';

interface Widget {
  id: string;
  type: WidgetType;
  width: number;
  height: number;
  x: number;
  y: number;
  collapsed?: boolean;
  originalHeight?: number;
}

const widgetDefinitions: Record<WidgetType, { name: string; description: string; defaultWidth: number; defaultHeight: number }> = {
  totalRevenue: { name: 'Total Revenue', description: 'Overview of total revenue', defaultWidth: 280, defaultHeight: 160 },
  totalTransactions: { name: 'Total Transactions', description: 'Count of all transactions', defaultWidth: 280, defaultHeight: 160 },
  activeMerchants: { name: 'Active Merchants', description: 'Number of active merchants', defaultWidth: 280, defaultHeight: 160 },
  subscriptionRevenue: { name: 'Subscription Revenue', description: 'Revenue from subscriptions', defaultWidth: 280, defaultHeight: 100 },
  merchantsOwing: { name: 'Merchants Owing', description: 'Merchants with outstanding payments', defaultWidth: 280, defaultHeight: 100 },
  apiHealthy: { name: 'API Healthy', description: 'Number of healthy APIs', defaultWidth: 280, defaultHeight: 100 },
  apiDown: { name: 'API Down', description: 'Number of down APIs', defaultWidth: 280, defaultHeight: 100 },
  outlayChart: { name: 'Commission Revenue', description: 'Daily commission from $0.10 transaction fees', defaultWidth: 600, defaultHeight: 420 },
  apiStatus: { name: 'API Health Status', description: 'Overall API health metrics', defaultWidth: 600, defaultHeight: 120 },
  incomeChart: { name: 'Income Chart', description: 'Monthly income bar chart', defaultWidth: 350, defaultHeight: 200 },
  websiteAnalytics: { name: 'Website Analytics', description: 'Track views, visitors, and sessions', defaultWidth: 650, defaultHeight: 480 },
  topMerchants: { name: 'Top Merchants', description: 'Best performing merchants', defaultWidth: 380, defaultHeight: 320 },
  latestTransactions: { name: 'Latest Transactions', description: 'Recent transaction list', defaultWidth: 800, defaultHeight: 400 },
};

// Default widget layout with x,y coordinates for DESKTOP
const defaultWidgets: Widget[] = [
  { id: 'widget-1', type: 'totalRevenue', width: 280, height: 160, x: 20, y: 20 },
  { id: 'widget-2', type: 'totalTransactions', width: 280, height: 160, x: 320, y: 20 },
  { id: 'widget-3', type: 'activeMerchants', width: 280, height: 160, x: 620, y: 20 },
  { id: 'widget-4', type: 'subscriptionRevenue', width: 280, height: 100, x: 20, y: 200 },
  { id: 'widget-5', type: 'merchantsOwing', width: 280, height: 100, x: 320, y: 200 },
  { id: 'widget-6', type: 'apiHealthy', width: 280, height: 100, x: 620, y: 200 },
  { id: 'widget-7', type: 'apiDown', width: 280, height: 100, x: 920, y: 200 },
  { id: 'widget-8', type: 'outlayChart', width: 600, height: 420, x: 20, y: 320 },
  { id: 'widget-9', type: 'apiStatus', width: 320, height: 280, x: 640, y: 320 },
  { id: 'widget-10', type: 'incomeChart', width: 350, height: 200, x: 980, y: 320 },
  { id: 'widget-11', type: 'topMerchants', width: 380, height: 320, x: 20, y: 620 },
  { id: 'widget-12', type: 'latestTransactions', width: 800, height: 400, x: 420, y: 620 },
];

// Default widget layout for TABLET
const defaultTabletWidgets: Widget[] = [
  { id: 'widget-1', type: 'totalRevenue', width: 280, height: 160, x: 20, y: 20 },
  { id: 'widget-2', type: 'totalTransactions', width: 280, height: 160, x: 320, y: 20 },
  { id: 'widget-3', type: 'activeMerchants', width: 280, height: 160, x: 20, y: 200 },
  { id: 'widget-4', type: 'subscriptionRevenue', width: 280, height: 100, x: 320, y: 200 },
  { id: 'widget-5', type: 'merchantsOwing', width: 280, height: 100, x: 20, y: 380 },
  { id: 'widget-6', type: 'apiHealthy', width: 280, height: 100, x: 320, y: 380 },
  { id: 'widget-7', type: 'apiDown', width: 280, height: 100, x: 20, y: 500 },
  { id: 'widget-8', type: 'outlayChart', width: 600, height: 420, x: 20, y: 620 },
  { id: 'widget-9', type: 'apiStatus', width: 320, height: 280, x: 20, y: 920 },
  { id: 'widget-10', type: 'incomeChart', width: 600, height: 200, x: 20, y: 1220 },
  { id: 'widget-11', type: 'topMerchants', width: 600, height: 320, x: 20, y: 1440 },
  { id: 'widget-12', type: 'latestTransactions', width: 600, height: 400, x: 20, y: 1780 },
];

// Default widget layout for MOBILE
const defaultMobileWidgets: Widget[] = [
  { id: 'widget-1', type: 'totalRevenue', width: 280, height: 160, x: 10, y: 10 },
  { id: 'widget-2', type: 'totalTransactions', width: 280, height: 160, x: 10, y: 180 },
  { id: 'widget-3', type: 'activeMerchants', width: 280, height: 160, x: 10, y: 350 },
  { id: 'widget-4', type: 'subscriptionRevenue', width: 280, height: 100, x: 10, y: 520 },
  { id: 'widget-5', type: 'merchantsOwing', width: 280, height: 100, x: 10, y: 630 },
  { id: 'widget-6', type: 'apiHealthy', width: 280, height: 100, x: 10, y: 740 },
  { id: 'widget-7', type: 'apiDown', width: 280, height: 100, x: 10, y: 850 },
  { id: 'widget-8', type: 'outlayChart', width: 280, height: 280, x: 10, y: 960 },
  { id: 'widget-9', type: 'apiStatus', width: 280, height: 280, x: 10, y: 1250 },
  { id: 'widget-10', type: 'incomeChart', width: 280, height: 200, x: 10, y: 1540 },
  { id: 'widget-11', type: 'topMerchants', width: 280, height: 320, x: 10, y: 1750 },
  { id: 'widget-12', type: 'latestTransactions', width: 280, height: 400, x: 10, y: 2080 },
];

// Screen size type
type ScreenSize = 'mobile' | 'tablet' | 'desktop';

// Widget Content Components
function TotalRevenueWidget() {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-2 sm:p-3 md:p-4 relative overflow-hidden h-full transition-all duration-300 hover:shadow-lg hover:shadow-[#0055FF]/20 hover:scale-105 cursor-pointer">
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
      <div className="absolute inset-0 opacity-40">
        <svg className="absolute bottom-0 left-0 w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 119 31">
          <path d={wavySvgPaths.p1a0a1900} stroke="#0055FF" strokeWidth="0.5" />
        </svg>
      </div>
      <div className="relative">
        <div className="flex items-center justify-between mb-0.5 sm:mb-1 md:mb-2">
          <p className="text-[#dbdfea] text-[10px] sm:text-xs md:text-sm">Total Revenue</p>
          <TrendingUp className="size-2.5 sm:size-3 md:size-4 text-[#4ade80]" />
        </div>
        <p className="text-[#dbdfea] text-xl sm:text-2xl md:text-3xl mb-0.5">${mockStats.totalRevenue.toLocaleString()}</p>
        <p className="text-[#4ade80] text-[9px] sm:text-[10px] md:text-xs">↑ 12.5%</p>
      </div>
    </div>
  );
}

function TotalTransactionsWidget() {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-2 sm:p-3 md:p-4 relative overflow-hidden h-full transition-all duration-300 hover:shadow-lg hover:shadow-[#00E5CC]/20 hover:scale-105 cursor-pointer">
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
      <div className="absolute inset-0 opacity-40">
        <svg className="absolute bottom-0 left-0 w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 119 31">
          <path d={wavySvgPaths.p1a0a1900} stroke="#00E5CC" strokeWidth="0.5" />
        </svg>
      </div>
      <div className="relative">
        <div className="flex items-center justify-between mb-0.5 sm:mb-1 md:mb-2">
          <p className="text-[#dbdfea] text-[10px] sm:text-xs md:text-sm">Total Transactions</p>
          <Activity className="size-2.5 sm:size-3 md:size-4 text-[#00E5CC]" />
        </div>
        <p className="text-[#dbdfea] text-xl sm:text-2xl md:text-3xl mb-0.5">{mockStats.totalTransactions.toLocaleString()}</p>
        <p className="text-[#4ade80] text-[9px] sm:text-[10px] md:text-xs">↑ 8.2%</p>
      </div>
    </div>
  );
}

function ActiveMerchantsWidget() {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-2 sm:p-3 md:p-4 relative overflow-hidden h-full transition-all duration-300 hover:shadow-lg hover:shadow-[#0055FF]/20 hover:scale-105 cursor-pointer">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0055FF]/10 via-transparent to-[#0055FF]/5"></div>
      <div className="relative">
        <div className="flex items-center justify-between mb-0.5 sm:mb-1 md:mb-2">
          <p className="text-[#dbdfea] text-[10px] sm:text-xs md:text-sm">Active Merchants</p>
          <Users className="size-2.5 sm:size-3 md:size-4 text-[#0055FF]" />
        </div>
        <p className="text-[#dbdfea] text-xl sm:text-2xl md:text-3xl mb-0.5">{mockStats.activeMerchants}</p>
        <p className="text-[#4ade80] text-[9px] sm:text-[10px] md:text-xs">↑ 3 new this month</p>
      </div>
    </div>
  );
}

function SubscriptionRevenueWidget() {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-2 sm:p-3 md:p-4 relative overflow-hidden h-full transition-all duration-300 hover:shadow-lg hover:shadow-[#00E5CC]/20 hover:scale-105 cursor-pointer">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#00E5CC]/10 via-transparent to-[#00E5CC]/5"></div>
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 relative min-w-0">
        <div className="size-6 sm:size-7 md:size-8 lg:size-10 rounded-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC] flex items-center justify-center flex-shrink-0">
          <DollarSign className="size-3 sm:size-3.5 md:size-4 lg:size-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[#dbdfea] text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs truncate">Subscription Revenue</p>
          <p className="text-[#dbdfea] text-xs sm:text-sm md:text-base lg:text-lg truncate">${mockStats.subscriptionRevenue}</p>
        </div>
      </div>
    </div>
  );
}

function MerchantsOwingWidget({ onNavigate }: { onNavigate?: (page: 'merchants') => void }) {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-2 sm:p-3 md:p-4 relative overflow-hidden h-full transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/30 cursor-pointer group">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/15 via-[#f59e0b]/5 to-transparent"></div>
      
      {/* Wavy line accent in orange */}
      <div className="absolute inset-0 opacity-30">
        <svg className="absolute bottom-0 left-0 w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 119 31">
          <path d={wavySvgPaths.p1a0a1900} stroke="#f59e0b" strokeWidth="0.5" />
        </svg>
      </div>
      
      {/* Pulsing glow effect */}
      <div className="absolute top-2 right-2 size-2 rounded-full bg-[#f59e0b] animate-pulse shadow-lg shadow-[#f59e0b]/50"></div>
      
      {/* More Info Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate?.('merchants');
        }}
        className="absolute top-2 right-6 sm:right-8 p-1 rounded-full bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 border border-[#f59e0b]/30 hover:border-[#f59e0b]/60 transition-all duration-300 z-10 group/btn"
      >
        <ChevronRight className="size-2.5 sm:size-3 text-[#f59e0b] group-hover/btn:translate-x-0.5 transition-transform duration-300" />
      </button>
      
      <div className="flex flex-col gap-1.5 sm:gap-2 relative">
        {/* Header with icon and count */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 min-w-0">
          <div className="size-6 sm:size-7 md:size-8 lg:size-10 rounded-full bg-gradient-to-br from-[#f59e0b]/20 to-[#ea580c]/20 flex items-center justify-center flex-shrink-0 border border-[#f59e0b]/30 group-hover:border-[#f59e0b]/60 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-[#f59e0b]/30">
            <AlertCircle className="size-3 sm:size-3.5 md:size-4 lg:size-5 text-[#f59e0b] group-hover:scale-110 transition-transform duration-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[#dbdfea] text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs truncate">Merchants Owing</p>
            <p className="text-[#f59e0b] text-xs sm:text-sm md:text-base lg:text-lg font-semibold flex-shrink-0">{mockStats.merchantsOwing}</p>
          </div>
        </div>
        
        {/* Details section */}
        <div className="flex gap-2 sm:gap-3 md:gap-4 relative">
          {/* Amount Owed */}
          <div className="flex-1 min-w-0">
            <p className="text-[#dbdfea]/60 text-[7px] sm:text-[8px] md:text-[9px] truncate">Total Owed</p>
            <p className="text-[#f59e0b] text-[10px] sm:text-xs md:text-sm font-semibold truncate">${mockStats.amountOwed.toLocaleString()}</p>
          </div>
          
          {/* Days Late */}
          <div className="flex-1 min-w-0">
            <p className="text-[#dbdfea]/60 text-[7px] sm:text-[8px] md:text-[9px] truncate">Avg Days Late</p>
            <p className="text-[#f59e0b] text-[10px] sm:text-xs md:text-sm font-semibold truncate">{mockStats.averageDaysLate} days</p>
          </div>
        </div>
        
        {/* Action hint */}
        <p className="text-[#f59e0b]/50 text-[7px] sm:text-[8px] md:text-[9px] truncate">Click to view details</p>
      </div>
    </div>
  );
}

function ApiHealthyWidget() {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-2 sm:p-3 md:p-4 h-full transition-all duration-300 hover:shadow-lg hover:shadow-[#4ade80]/20 hover:scale-105 cursor-pointer">
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
        <div className="size-7 sm:size-8 md:size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center flex-shrink-0">
          <CheckCircle className="size-3.5 sm:size-4 md:size-5 text-[#4ade80]" />
        </div>
        <div>
          <p className="text-[#dbdfea] text-[9px] sm:text-[10px] md:text-xs">API Healthy</p>
          <p className="text-[#dbdfea] text-sm sm:text-base md:text-lg">{mockStats.apiHealthy}</p>
        </div>
      </div>
    </div>
  );
}

function ApiDownWidget() {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-2 sm:p-3 md:p-4 h-full transition-all duration-300 hover:shadow-lg hover:shadow-[#ef4444]/20 hover:scale-105 cursor-pointer">
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
        <div className="size-7 sm:size-8 md:size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center flex-shrink-0">
          <AlertCircle className="size-3.5 sm:size-4 md:size-5 text-[#ef4444]" />
        </div>
        <div>
          <p className="text-[#dbdfea] text-[9px] sm:text-[10px] md:text-xs">API Down</p>
          <p className="text-[#dbdfea] text-sm sm:text-base md:text-lg">{mockStats.apiDown}</p>
        </div>
      </div>
    </div>
  );
}

function OutlayChartWidget({ isCollapsed, onToggleCollapse }: { isCollapsed?: boolean; onToggleCollapse?: () => void }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ day: number; value: number } | null>(null);
  const [showData, setShowData] = useState(false);
  const [startDate, setStartDate] = useState('2024-11-01');
  const [endDate, setEndDate] = useState('2024-11-30');
  
  // Calculate days between dates
  const calculateDays = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(Math.max(diffDays, 1), 365); // Between 1 and 365 days
  };
  
  const days = calculateDays();
  const [revenueData, setRevenueData] = useState(() => generateMockRevenue(days));
  
  // Update revenue data when date range changes
  const handleDateChange = () => {
    const newDays = calculateDays();
    setRevenueData(generateMockRevenue(newDays));
  };
  
  // Generate smooth SVG path from data using cubic bezier curves
  const generateSmoothPath = (data: number[], maxValue: number, width: number, height: number) => {
    if (data.length === 0) return '';
    
    const points = data.map((value, index) => ({
      x: (index / (data.length - 1)) * width,
      y: height - (value / maxValue) * height
    }));
    
    // Create smooth curve using cubic bezier
    let path = `M ${points[0].x},${points[0].y}`;
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const controlPointX = current.x + (next.x - current.x) / 2;
      
      path += ` C ${controlPointX},${current.y} ${controlPointX},${next.y} ${next.x},${next.y}`;
    }
    
    // Close the path for area fill
    path += ` L ${points[points.length - 1].x},${height}`;
    path += ` L ${points[0].x},${height}`;
    path += ` Z`;
    
    return path;
  };
  
  // Generate line path without fill
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
  
  const maxValue = 60;
  const chartWidth = 543;
  const chartHeight = 137;
  
  const areaPath = generateSmoothPath(revenueData, maxValue, chartWidth, chartHeight);
  const linePath = generateLinePath(revenueData, maxValue, chartWidth, chartHeight);
  
  // Calculate totals and averages
  const total = revenueData.reduce((sum, val) => sum + val, 0);
  const average = total / revenueData.length;
  const maxDaily = Math.max(...revenueData);
  const minDaily = Math.min(...revenueData);
  
  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  return (
    <div className="bg-[#24263a] rounded-[10px] p-4 md:p-6 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-[#dbdfea] text-sm md:text-base">Commission Revenue ($0.10/txn)</h3>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="size-6 rounded bg-[#1d1e2c] flex items-center justify-center hover:bg-[#2d2f45] transition-colors"
            >
              {isCollapsed ? <ChevronDown className="size-4 text-[#dbdfea]" /> : <ChevronUp className="size-4 text-[#dbdfea]" />}
            </button>
          )}
        </div>
        {!isCollapsed && <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-[#1d1e2c] rounded-lg px-3 py-1.5">
            <Calendar className="size-3.5 md:size-4 text-[#dbdfea] opacity-60" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                handleDateChange();
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
                handleDateChange();
              }}
              className="bg-transparent text-[#dbdfea] text-xs md:text-sm border-none outline-none cursor-pointer"
            />
          </div>
        </div>}
      </div>
      
      {!isCollapsed && <div className="flex-1 overflow-auto min-h-0">
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
              <path 
                d={areaPath}
                fill="url(#gradient_blue_commission)"
              />
              <path 
                d={linePath}
                fill="none"
                stroke="#0055FF"
                strokeWidth="2.5"
              />
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
        
        {/* Summary Stats */}
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
        
        <button
          onClick={() => setShowData(!showData)}
          className="w-full bg-[#1d1e2c] hover:bg-[#2d2f45] rounded-lg px-4 py-2.5 text-[#dbdfea] text-sm transition-colors flex items-center justify-center gap-2"
        >
          <span>{showData ? 'Hide' : 'Show'} Daily Data</span>
          <svg 
            className={`size-4 transition-transform ${showData ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
          {showData && (
            <div className="mt-4 bg-[#1d1e2c] rounded-lg p-3 md:p-4 max-h-[300px] overflow-auto">
              <div className="overflow-x-auto">
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
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}

function ApiStatusWidget() {
  const healthPercentage = Math.round((mockStats.apiHealthy / (mockStats.apiHealthy + mockStats.apiDown)) * 100);
  
  return (
    <div className="bg-[#24263a] rounded-[10px] p-2 sm:p-3 md:p-4 h-full flex flex-col justify-center overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[#4ade80]/20 hover:scale-105 cursor-pointer">
      {/* Responsive layout - stacks on small screens, horizontal on larger */}
      <div className="flex flex-col gap-2 sm:gap-3">
        {/* Title Row */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[#dbdfea] text-xs sm:text-sm md:text-base whitespace-nowrap">API Health Status</h3>
          <span className="text-[#4ade80] text-xs sm:text-sm md:text-base whitespace-nowrap flex-shrink-0 lg:hidden">
            {healthPercentage}%
          </span>
        </div>
        
        {/* Content Row - Responsive Layout */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 md:gap-4">
          {/* Stats - Side by side on all screens */}
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="size-1.5 sm:size-2 md:size-2.5 rounded-full bg-[#4ade80]" />
              <span className="text-[#dbdfea] text-[10px] sm:text-xs md:text-sm">Healthy</span>
              <span className="text-[#dbdfea] text-xs sm:text-sm md:text-base">{mockStats.apiHealthy}</span>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="size-1.5 sm:size-2 md:size-2.5 rounded-full bg-[#ef4444]" />
              <span className="text-[#dbdfea] text-[10px] sm:text-xs md:text-sm">Down</span>
              <span className="text-[#dbdfea] text-xs sm:text-sm md:text-base">{mockStats.apiDown}</span>
            </div>
          </div>
          
          {/* Progress Bar - Full width on mobile, flex on larger */}
          <div className="w-full sm:flex-1 flex items-center gap-2 min-w-0">
            <div className="flex-1 h-1.5 sm:h-2 md:h-2.5 bg-[#1d1e2c] rounded-full overflow-hidden min-w-[60px]">
              <div
                className="h-full bg-gradient-to-r from-[#4ade80] to-[#22c55e] rounded-full transition-all duration-300"
                style={{ width: `${healthPercentage}%` }}
              />
            </div>
            <span className="text-[#4ade80] text-xs sm:text-sm md:text-base whitespace-nowrap flex-shrink-0 hidden lg:block">
              {healthPercentage}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IncomeChartWidget({ isCollapsed, onToggleCollapse }: { isCollapsed?: boolean; onToggleCollapse?: () => void }) {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-4 md:p-5 h-full overflow-auto flex flex-col">
      <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[#dbdfea] text-sm md:text-base">Income</h3>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="size-6 rounded bg-[#1d1e2c] flex items-center justify-center hover:bg-[#2d2f45] transition-colors"
            >
              {isCollapsed ? <ChevronDown className="size-4 text-[#dbdfea]" /> : <ChevronUp className="size-4 text-[#dbdfea]" />}
            </button>
          )}
        </div>
        {!isCollapsed && <div className="bg-[#1d1e2c] rounded-[20px] px-2.5 md:px-3 py-1 md:py-1.5">
          <span className="text-[#dbdfea] text-xs md:text-sm">Last Year</span>
        </div>}
      </div>
      
      {!isCollapsed && <div className="flex gap-2 md:gap-3 flex-1 min-h-0">
        <div className="flex flex-col justify-between text-right w-12 md:w-16 flex-shrink-0">
          <span className="text-[#dbdfea] text-xs md:text-sm whitespace-nowrap">$30k</span>
          <span className="text-[#dbdfea] text-xs md:text-sm whitespace-nowrap">$20k</span>
          <span className="text-[#dbdfea] text-xs md:text-sm whitespace-nowrap">$10k</span>
          <span className="text-[#dbdfea] text-xs md:text-sm">$0</span>
        </div>
        
        <div className="flex-1 flex items-end justify-between min-w-0 gap-1 md:gap-1.5">
          {mockMonthlyRevenue.map((item) => {
            const heightPercent = (item.amount / 30000) * 100;
            return (
              <div key={item.month} className="flex flex-col items-center flex-1 min-w-0">
                <div className="w-full flex flex-col justify-end relative mb-2 flex-1">
                  <div className="absolute bottom-0 w-full h-full bg-[#1d1e2c] rounded-[100px]" />
                  <div
                    className="relative w-full rounded-[100px] bg-gradient-to-t from-[#0055FF] via-[#0080DD] to-[#00E5CC] transition-all"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <span className="text-[#dbdfea] text-[10px] md:text-xs">{item.month}</span>
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

function TopMerchantsWidget({ isCollapsed, onToggleCollapse }: { isCollapsed?: boolean; onToggleCollapse?: () => void }) {
  // Sort merchants by revenue and get top performers
  const topMerchants = [...mockMerchants]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  
  const totalRevenue = topMerchants.reduce((sum, merchant) => sum + merchant.revenue, 0);
  const maxRevenue = Math.max(...topMerchants.map(merchant => merchant.revenue));
  
  return (
    <div className="bg-[#24263a] rounded-[10px] p-4 md:p-5 w-full h-full max-h-full overflow-auto flex flex-col">
      {/* Header with dropdown */}
      <div className="flex items-center justify-between mb-4 md:mb-6 flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-[#dbdfea] text-sm md:text-base">Top Performing Merchants</h3>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="size-6 rounded bg-[#1d1e2c] flex items-center justify-center hover:bg-[#2d2f45] transition-colors"
            >
              {isCollapsed ? <ChevronDown className="size-4 text-[#dbdfea]" /> : <ChevronUp className="size-4 text-[#dbdfea]" />}
            </button>
          )}
        </div>
        {!isCollapsed && <select className="bg-[#1d1e2c] text-[#dbdfea] text-xs md:text-sm px-2.5 md:px-3 py-1.5 rounded border border-[#3a3c50] outline-none">
          <option>Last Month</option>
          <option>This Month</option>
          <option>Last 3 Months</option>
          <option>Last 6 Months</option>
        </select>}
      </div>
      
      {/* Merchant bars */}
      {!isCollapsed && <div className="space-y-3 md:space-y-4 flex-shrink-0">
        {topMerchants.map((merchant, index) => {
          const widthPercent = (merchant.revenue / maxRevenue) * 100;
          return (
            <div key={merchant.name} className="flex items-center gap-2 md:gap-3">
              <span className="text-[#dbdfea] text-xs md:text-sm w-28 md:w-36 flex-shrink-0 truncate">{merchant.name}</span>
              <div className="flex-1 h-2.5 md:h-3 bg-[#1d1e2c] rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC] transition-all"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <span className="text-[#dbdfea] text-xs md:text-sm w-14 md:w-16 text-right flex-shrink-0">
                ${(merchant.revenue / 1000).toFixed(1)}k
              </span>
            </div>
          );
        })}
      </div>}
      
      {!isCollapsed && <>
      {/* Total at bottom */}
      <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-[#1d1e2c] flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[#dbdfea] text-sm md:text-base">Total Revenue</span>
          <span className="text-[#dbdfea] text-base md:text-lg">${totalRevenue.toLocaleString()}</span>
        </div>
      </div>
      </>}
    </div>
  );
}

function LatestTransactionsWidget() {
  return (
    <div className="bg-[#24263a] rounded-[10px] p-4 md:p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-2 flex-wrap">
        <h3 className="text-[#dbdfea] text-sm md:text-base">Latest Transactions</h3>
        <span className="text-[#dbdfea] text-xs md:text-sm opacity-60">Last 24 hours</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1d1e2c]">
              <th className="text-left text-[#dbdfea] text-xs md:text-sm opacity-60 pb-3 whitespace-nowrap pr-4">Merchant</th>
              <th className="text-left text-[#dbdfea] text-xs md:text-sm opacity-60 pb-3 whitespace-nowrap pr-4">Amount</th>
              <th className="text-left text-[#dbdfea] text-xs md:text-sm opacity-60 pb-3 whitespace-nowrap pr-4">Commission</th>
              <th className="text-left text-[#dbdfea] text-xs md:text-sm opacity-60 pb-3 whitespace-nowrap pr-4">Status</th>
              <th className="text-left text-[#dbdfea] text-xs md:text-sm opacity-60 pb-3 whitespace-nowrap">Time</th>
            </tr>
          </thead>
          <tbody>
            {mockRecentTransactions.map((transaction) => (
              <tr key={transaction.id} className="border-b border-[#1d1e2c] last:border-0">
                <td className="py-3 md:py-4 pr-4">
                  <p className="text-[#dbdfea] text-sm md:text-base whitespace-nowrap">{transaction.merchant}</p>
                </td>
                <td className="py-3 md:py-4 pr-4">
                  <p className="text-[#dbdfea] text-sm md:text-base whitespace-nowrap">${transaction.amount.toFixed(2)}</p>
                </td>
                <td className="py-3 md:py-4 pr-4">
                  <p className="text-[#4ade80] text-sm md:text-base whitespace-nowrap">${transaction.commission.toFixed(2)}</p>
                </td>
                <td className="py-3 md:py-4 pr-4">
                  <span
                    className={`text-xs md:text-sm px-2 md:px-2.5 py-1 md:py-1.5 rounded whitespace-nowrap ${
                      transaction.status === 'completed'
                        ? 'bg-[#4ade80]/20 text-[#4ade80]'
                        : transaction.status === 'pending'
                        ? 'bg-[#f59e0b]/20 text-[#f59e0b]'
                        : 'bg-[#ef4444]/20 text-[#ef4444]'
                    }`}
                  >
                    {transaction.status}
                  </span>
                </td>
                <td className="py-3 md:py-4">
                  <p className="text-[#dbdfea] text-xs md:text-sm opacity-60 whitespace-nowrap">{transaction.time}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WebsiteAnalyticsWidget({ isCollapsed, onToggleCollapse }: { isCollapsed?: boolean; onToggleCollapse?: () => void }) {
  const [dateRange, setDateRange] = useState<'last7Days' | 'last30Days' | 'last90Days'>('last7Days');
  
  const data = mockWebsiteAnalytics[dateRange];
  const totalViews = data.views.reduce((sum, val) => sum + val, 0);
  const totalUniqueVisitors = data.uniqueVisitors.reduce((sum, val) => sum + val, 0);
  const totalSessions = data.sessions.reduce((sum, val) => sum + val, 0);
  const avgSessionDuration = '3m 24s';
  const bounceRate = '42.3%';
  
  // Calculate max value for chart scaling
  const maxValue = Math.max(...data.views);
  const chartWidth = 543;
  const chartHeight = 137;
  
  // Generate smooth SVG path
  const generateSmoothPath = (values: number[], max: number) => {
    if (values.length === 0) return '';
    
    const points = values.map((value, index) => ({
      x: (index / (values.length - 1)) * chartWidth,
      y: chartHeight - (value / max) * chartHeight
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
  
  const generateAreaPath = (values: number[], max: number) => {
    const linePath = generateSmoothPath(values, max);
    return `${linePath} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`;
  };
  
  const viewsLinePath = generateSmoothPath(data.views, maxValue);
  const viewsAreaPath = generateAreaPath(data.views, maxValue);
  
  return (
    <div className="bg-[#24263a] rounded-[10px] p-4 md:p-6 h-full overflow-auto flex flex-col">
      <div className="flex items-center justify-between mb-4 md:mb-6 flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-[#dbdfea] text-sm md:text-base">Website Analytics</h3>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="size-6 rounded bg-[#1d1e2c] flex items-center justify-center hover:bg-[#2d2f45] transition-colors"
            >
              {isCollapsed ? <ChevronDown className="size-4 text-[#dbdfea]" /> : <ChevronUp className="size-4 text-[#dbdfea]" />}
            </button>
          )}
        </div>
        {!isCollapsed && <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as any)}
          className="bg-[#1d1e2c] text-[#dbdfea] text-xs md:text-sm px-2.5 md:px-3 py-1.5 md:py-2 rounded border border-[#3a3c50] outline-none cursor-pointer"
        >
          <option value="last7Days">Last 7 Days</option>
          <option value="last30Days">Last 30 Days</option>
          <option value="last90Days">Last 90 Days</option>
        </select>}
      </div>
      
      {/* Key Metrics */}
      {!isCollapsed && <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6 flex-shrink-0">
        <div className="bg-[#1d1e2c] rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="size-4 md:size-5 text-[#0055FF]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Total Views</p>
          </div>
          <p className="text-[#dbdfea] text-lg md:text-xl">{totalViews.toLocaleString()}</p>
        </div>
        
        <div className="bg-[#1d1e2c] rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="size-4 md:size-5 text-[#00E5CC]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Unique Visitors</p>
          </div>
          <p className="text-[#dbdfea] text-lg md:text-xl">{totalUniqueVisitors.toLocaleString()}</p>
        </div>
        
        <div className="bg-[#1d1e2c] rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2">
            <MousePointer className="size-4 md:size-5 text-[#4ade80]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Sessions</p>
          </div>
          <p className="text-[#dbdfea] text-lg md:text-xl">{totalSessions.toLocaleString()}</p>
        </div>
        
        <div className="bg-[#1d1e2c] rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="size-4 md:size-5 text-[#f59e0b]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Avg Duration</p>
          </div>
          <p className="text-[#dbdfea] text-lg md:text-xl">{avgSessionDuration}</p>
        </div>
        
        <div className="bg-[#1d1e2c] rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="size-4 md:size-5 text-[#ef4444]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Bounce Rate</p>
          </div>
          <p className="text-[#dbdfea] text-lg md:text-xl">{bounceRate}</p>
        </div>
        
        <div className="bg-[#1d1e2c] rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="size-4 md:size-5 text-[#4ade80]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Growth</p>
          </div>
          <p className="text-[#4ade80] text-lg md:text-xl">+12.8%</p>
        </div>
      </div>}
      
      {!isCollapsed && <div className="flex-1 min-h-0 flex flex-col">
        <h4 className="text-[#dbdfea] text-xs md:text-sm mb-3 flex-shrink-0">Page Views Over Time</h4>
        <div className="flex gap-2 md:gap-3 flex-1 min-h-[150px]">
          <div className="flex flex-col justify-between text-right w-12 md:w-16 flex-shrink-0">
            <span className="text-[#dbdfea] text-xs md:text-sm">{Math.round(maxValue / 1000)}k</span>
            <span className="text-[#dbdfea] text-xs md:text-sm">{Math.round(maxValue * 0.75 / 1000)}k</span>
            <span className="text-[#dbdfea] text-xs md:text-sm">{Math.round(maxValue * 0.5 / 1000)}k</span>
            <span className="text-[#dbdfea] text-xs md:text-sm">{Math.round(maxValue * 0.25 / 1000)}k</span>
            <span className="text-[#dbdfea] text-xs md:text-sm">0</span>
          </div>
          
          <div className="flex-1 flex flex-col min-w-0">
            <div className="relative flex-1 min-h-[120px]">
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 543 139">
                <defs>
                  <linearGradient id="gradient_views" x1="271.5" y1="0" x2="271.5" y2="139" gradientUnits="userSpaceOnUse">
                    <stop offset="0.1" stopColor="#0055FF" stopOpacity="0.8" />
                    <stop offset="1" stopColor="#0055FF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                
                {/* Grid lines */}
                <line x1="0" y1="137" x2="543" y2="137" stroke="#1D1E2C" strokeWidth="1" />
                <line x1="0" y1="103" x2="543" y2="103" stroke="#1D1E2C" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="0" y1="69" x2="543" y2="69" stroke="#1D1E2C" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="0" y1="35" x2="543" y2="35" stroke="#1D1E2C" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="0" y1="1" x2="543" y2="1" stroke="#1D1E2C" strokeWidth="1" strokeDasharray="2 2" />
                
                {/* Area fill */}
                <path d={viewsAreaPath} fill="url(#gradient_views)" />
                
                {/* Line */}
                <path d={viewsLinePath} fill="none" stroke="#0055FF" strokeWidth="2.5" />
              </svg>
            </div>
            
            <div className="flex justify-between px-1 mt-2 md:mt-3 flex-shrink-0">
              {dateRange === 'last7Days' ? (
                <>
                  <span className="text-[#dbdfea] text-xs md:text-sm">Mon</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">Tue</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">Wed</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">Thu</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">Fri</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">Sat</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">Sun</span>
                </>
              ) : dateRange === 'last30Days' ? (
                <>
                  <span className="text-[#dbdfea] text-xs md:text-sm">1</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">10</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">20</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">30</span>
                </>
              ) : (
                <>
                  <span className="text-[#dbdfea] text-xs md:text-sm">1</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">30</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">60</span>
                  <span className="text-[#dbdfea] text-xs md:text-sm">90</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}

// Widget renderer
function renderWidget(type: WidgetType, isCollapsed: boolean, onToggleCollapse?: () => void, onNavigate?: (page: 'merchants') => void) {
  const collapsibleTypes: WidgetType[] = ['outlayChart', 'incomeChart', 'websiteAnalytics', 'topMerchants'];
  const isCollapsible = collapsibleTypes.includes(type);
  
  switch (type) {
    case 'totalRevenue':
      return <TotalRevenueWidget />;
    case 'totalTransactions':
      return <TotalTransactionsWidget />;
    case 'activeMerchants':
      return <ActiveMerchantsWidget />;
    case 'subscriptionRevenue':
      return <SubscriptionRevenueWidget />;
    case 'merchantsOwing':
      return <MerchantsOwingWidget onNavigate={onNavigate} />;
    case 'apiHealthy':
      return <ApiHealthyWidget />;
    case 'apiDown':
      return <ApiDownWidget />;
    case 'outlayChart':
      return <OutlayChartWidget isCollapsed={isCollapsed} onToggleCollapse={onToggleCollapse} />;
    case 'apiStatus':
      return <ApiStatusWidget />;
    case 'incomeChart':
      return <IncomeChartWidget isCollapsed={isCollapsed} onToggleCollapse={onToggleCollapse} />;
    case 'topMerchants':
      return <TopMerchantsWidget isCollapsed={isCollapsed} onToggleCollapse={onToggleCollapse} />;
    case 'latestTransactions':
      return <LatestTransactionsWidget />;
    case 'websiteAnalytics':
      return <WebsiteAnalyticsWidget isCollapsed={isCollapsed} onToggleCollapse={onToggleCollapse} />;
  }
}

// Draggable widget wrapper component with free positioning
function DraggableWidget({ widget, isEditMode, onRemove, onResize, onMove, onCollapse, allWidgets, onNavigate }: {
  widget: Widget;
  isEditMode: boolean;
  onRemove: (id: string) => void;
  onResize: (id: string, width: number, height: number) => void;
  onMove: (id: string, x: number, y: number) => void;
  onCollapse: (id: string) => void;
  allWidgets: Widget[];
  onNavigate?: (page: 'merchants') => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const width = typeof widget.width === 'number' && widget.width > 0 ? widget.width : 240;
  const height = typeof widget.height === 'number' && widget.height > 0 ? widget.height : 140;
  const x = typeof widget.x === 'number' ? widget.x : 20;
  const y = typeof widget.y === 'number' ? widget.y : 20;
  
  const displayHeight = widget.collapsed ? 60 : height;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX - x, y: e.clientY - y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const newX = Math.max(0, e.clientX - dragStart.x);
    const newY = Math.max(0, e.clientY - dragStart.y);
    
    // Get container bounds to prevent dragging off screen
    const container = document.getElementById('dashboard-container');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const maxX = containerRect.width - width;
      const maxY = containerRect.height - height;
      
      const boundedX = Math.min(Math.max(0, newX), maxX);
      const boundedY = Math.min(Math.max(0, newY), maxY);
      
      onMove(widget.id, boundedX, boundedY);
    } else {
      onMove(widget.id, newX, newY);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  return (
    <div
      className="absolute transition-all duration-300 ease-in-out"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: isEditMode ? 'auto' : `${width}px`,
        height: isEditMode ? 'auto' : `${displayHeight}px`,
        zIndex: isDragging ? 1000 : 1,
      }}
    >
      {isEditMode ? (
        <Resizable
          size={{ width, height }}
          onResizeStop={(e, direction, ref, d) => {
            onResize(widget.id, width + d.width, height + d.height);
          }}
          minWidth={150}
          minHeight={80}
          maxWidth={2000}
          maxHeight={1200}
          grid={[1, 1]}
          className="transition-all duration-200 ease-out"
          style={{ opacity: isDragging ? 0.8 : 1 }}
        >
          <div className="relative w-full h-full">
            {isEditMode && (
              <>
                <div 
                  className="absolute -top-2 -right-2 z-10 flex gap-1"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div 
                    className="size-7 rounded-full bg-[#0055FF] flex items-center justify-center cursor-move shadow-lg"
                    onMouseDown={handleMouseDown}
                  >
                    <GripVertical className="size-4 text-white" />
                  </div>
                  <button
                    onClick={() => onRemove(widget.id)}
                    className="size-7 rounded-full bg-[#ef4444] flex items-center justify-center hover:bg-[#dc2626] transition-colors shadow-lg"
                  >
                    <X className="size-4 text-white" />
                  </button>
                </div>
                <div className="absolute inset-0 border-2 border-dashed border-[#0055FF] rounded-[10px] pointer-events-none" />
              </>
            )}
            {renderWidget(widget.type, widget.collapsed || false, () => onCollapse(widget.id), onNavigate)}
          </div>
        </Resizable>
      ) : (
        <div 
          className="w-full h-full transition-all duration-200 ease-out" 
          style={{ opacity: isDragging ? 0.8 : 1 }}
        >
          {renderWidget(widget.type, widget.collapsed || false, () => onCollapse(widget.id), onNavigate)}
        </div>
      )}
    </div>
  );
}

interface DashboardProps {
  onNavigate?: (page: 'merchants') => void;
}

export default function Dashboard({ onNavigate }: DashboardProps = {}) {
  const [screenSize, setScreenSize] = useState<ScreenSize>('desktop');
  
  // FORCE RESET - Clear all saved layouts on mount
  const [desktopWidgets, setDesktopWidgets] = useState<Widget[]>(() => {
    localStorage.removeItem('dashboard-widgets-desktop');
    localStorage.removeItem('dashboard-widgets-tablet');
    localStorage.removeItem('dashboard-widgets-mobile');
    return defaultWidgets;
  });
  const [tabletWidgets, setTabletWidgets] = useState<Widget[]>(defaultTabletWidgets);
  const [mobileWidgets, setMobileWidgets] = useState<Widget[]>(defaultMobileWidgets);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Detect screen size and update accordingly
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

  // Get current widgets based on screen size
  const getCurrentWidgets = (): Widget[] => {
    switch (screenSize) {
      case 'mobile':
        return mobileWidgets;
      case 'tablet':
        return tabletWidgets;
      case 'desktop':
        return desktopWidgets;
    }
  };

  // Update widgets for current screen size
  const updateCurrentWidgets = (updater: (prev: Widget[]) => Widget[]) => {
    switch (screenSize) {
      case 'mobile':
        setMobileWidgets(updater);
        break;
      case 'tablet':
        setTabletWidgets(updater);
        break;
      case 'desktop':
        setDesktopWidgets(updater);
        break;
    }
  };

  // Save to localStorage for current screen size
  const saveToLocalStorage = (widgets: Widget[]) => {
    const key = `dashboard-widgets-${screenSize}`;
    localStorage.setItem(key, JSON.stringify(widgets));
  };

  const widgets = getCurrentWidgets();

  const handleRemoveWidget = (id: string) => {
    updateCurrentWidgets((prev) => {
      const updated = prev.filter((w) => w.id !== id);
      saveToLocalStorage(updated);
      return updated;
    });
  };

  const handleAddWidget = (type: WidgetType) => {
    const definition = widgetDefinitions[type];
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type,
      width: definition.defaultWidth,
      height: definition.defaultHeight,
      x: 20,
      y: 20,
    };
    updateCurrentWidgets((prev) => {
      const updated = [...prev, newWidget];
      saveToLocalStorage(updated);
      return updated;
    });
    setShowAddModal(false);
  };

  const handleResize = (id: string, width: number, height: number) => {
    updateCurrentWidgets((prev) => {
      const updated = prev.map((w) =>
        w.id === id ? { ...w, width, height } : w
      );
      saveToLocalStorage(updated);
      return updated;
    });
  };

  const handleSaveLayout = () => {
    setIsEditMode(false);
    saveToLocalStorage(widgets);
  };

  const handleResetLayout = () => {
    const defaultLayout = screenSize === 'mobile' 
      ? defaultMobileWidgets 
      : screenSize === 'tablet' 
      ? defaultTabletWidgets 
      : defaultWidgets;
    
    updateCurrentWidgets(() => {
      saveToLocalStorage(defaultLayout);
      return defaultLayout;
    });
  };

  const moveWidget = (id: string, x: number, y: number) => {
    updateCurrentWidgets((prev) => {
      const updated = prev.map((w) =>
        w.id === id ? { ...w, x, y } : w
      );
      saveToLocalStorage(updated);
      return updated;
    });
  };

  const handleCollapse = (id: string) => {
    updateCurrentWidgets((prev) => {
      const widget = prev.find(w => w.id === id);
      if (!widget) return prev;
      
      const collapsedHeight = 60;
      const isCurrentlyCollapsed = widget.collapsed;
      
      // Store original height if collapsing for the first time
      const originalHeight = widget.originalHeight || widget.height;
      
      // Update only the collapsed widget - don't move other widgets
      const updatedWidgets = prev.map((w) => {
        if (w.id === id) {
          return {
            ...w,
            collapsed: !isCurrentlyCollapsed,
            originalHeight: originalHeight,
            height: isCurrentlyCollapsed ? originalHeight : collapsedHeight
          };
        }
        return w;
      });
      
      saveToLocalStorage(updatedWidgets);
      return updatedWidgets;
    });
  };

  // Calculate container height
  const getContainerHeight = () => {
    if (widgets.length === 0) return '1200px';
    const maxY = Math.max(...widgets.map(w => (w.y || 0) + (w.height || 160)));
    return `${Math.max(maxY + 100, 1200)}px`;
  };

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-2 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-[#dbdfea] text-lg sm:text-xl md:text-2xl">Hello, Admin</h1>
          <p className="text-[#dbdfea] text-xs opacity-60 mt-1">
            {screenSize === 'mobile' ? '📱 Mobile View' : screenSize === 'tablet' ? '📱 Tablet View' : '🖥️ Desktop View'}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {isEditMode ? (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-2 sm:px-4 py-2 rounded-lg bg-[#00E5CC] text-[#1a1b2e] flex items-center gap-1 sm:gap-2 hover:bg-[#00d4bb] transition-colors text-xs sm:text-sm"
              >
                <Plus className="size-3 sm:size-4" />
                <span className="hidden sm:inline">Add Widget</span>
              </button>
              <button
                onClick={handleResetLayout}
                className="px-2 sm:px-4 py-2 rounded-lg bg-[#f59e0b] text-white flex items-center gap-1 sm:gap-2 hover:bg-[#ea580c] transition-colors text-xs sm:text-sm"
              >
                <RotateCcw className="size-3 sm:size-4" />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                onClick={handleSaveLayout}
                className="px-2 sm:px-4 py-2 rounded-lg bg-[#0055FF] text-white flex items-center gap-1 sm:gap-2 hover:bg-[#0044DD] transition-colors text-xs sm:text-sm"
              >
                <Save className="size-3 sm:size-4" />
                <span className="hidden sm:inline">Save</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditMode(true)}
              className="px-2 sm:px-4 py-2 rounded-lg bg-[#24263a] text-[#dbdfea] flex items-center gap-1 sm:gap-2 hover:bg-[#2d2f45] transition-colors text-xs sm:text-sm"
            >
              <Edit3 className="size-3 sm:size-4" />
              <span className="hidden sm:inline">Edit</span>
            </button>
          )}
          <button className="size-8 sm:size-9 rounded-full bg-[#24263a] flex items-center justify-center">
            <svg className="size-3 sm:size-4" fill="none" viewBox="0 0 18 18">
              <path d="M8.25 14.25C11.5637 14.25 14.25 11.5637 14.25 8.25C14.25 4.93629 11.5637 2.25 8.25 2.25C4.93629 2.25 2.25 4.93629 2.25 8.25C2.25 11.5637 4.93629 14.25 8.25 14.25Z" stroke="#DBDFEA" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.8" />
              <path d="M15.75 15.75L12.4875 12.4875" stroke="#DBDFEA" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.8" />
            </svg>
          </button>
          <NotificationPanel />
          <div className="size-8 sm:size-9 rounded-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC] flex items-center justify-center">
            <span className="text-white text-xs">DA</span>
          </div>
        </div>
      </div>

      {/* Widgets Container with Padding */}
      <div 
        id="dashboard-container"
        className="relative bg-[#1a1b2e] rounded-lg" 
        style={{ 
          minHeight: getContainerHeight(),
          paddingLeft: screenSize === 'mobile' ? '0' : '20px',
          paddingRight: screenSize === 'mobile' ? '0' : '20px',
        }}
      >
        {widgets.map((widget) => (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            isEditMode={isEditMode}
            onRemove={handleRemoveWidget}
            onResize={handleResize}
            onMove={moveWidget}
            onCollapse={handleCollapse}
            allWidgets={widgets}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Add Widget Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#24263a] rounded-[10px] p-4 sm:p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#dbdfea] text-lg sm:text-xl">Add Widget</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="size-8 rounded-full bg-[#1d1e2c] flex items-center justify-center hover:bg-[#2d2f45] transition-colors"
              >
                <X className="size-4 text-[#dbdfea]" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(widgetDefinitions).map(([type, definition]) => {
                const isAdded = widgets.some(w => w.type === type);
                return (
                  <button
                    key={type}
                    onClick={() => !isAdded && handleAddWidget(type as WidgetType)}
                    disabled={isAdded}
                    className={`p-3 sm:p-4 rounded-lg text-left transition-all ${
                      isAdded
                        ? 'bg-[#1d1e2c] opacity-50 cursor-not-allowed'
                        : 'bg-[#1d1e2c] hover:bg-[#2d2f45] border-2 border-transparent hover:border-[#0055FF]'
                    }`}
                  >
                    <h3 className="text-[#dbdfea] text-xs sm:text-sm mb-1">{definition.name}</h3>
                    <p className="text-[#dbdfea] text-[10px] sm:text-xs opacity-60">{definition.description}</p>
                    {isAdded && (
                      <span className="text-[#00E5CC] text-[10px] sm:text-xs mt-2 block">Already added</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}