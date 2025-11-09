import { Home, Package, Receipt, BarChart3, SlidersHorizontal } from 'lucide-react';
import terminalIcon from 'figma:asset/334c2b7e95367d5970568548bd4fac0acb30be47.png';
import { LineChart, Line, ResponsiveContainer, Dot } from 'recharts';
import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface DashboardProps {
  user: any;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

interface Transaction {
  id: number;
  amount: number;
  type: 'sale' | 'refund';
  status: 'completed' | 'pending' | 'failed';
  customer: string;
  method: 'card' | 'cash' | 'nfc';
  timestamp: string;
  description?: string;
}

interface CircularProgressProps {
  percentage: number;
  size: number;
  strokeWidth: number;
  color: string;
  backgroundColor?: string;
  glow?: boolean;
}

function CircularProgress({ percentage, size, strokeWidth, color, backgroundColor = 'rgba(255,255,255,0.1)', glow = false }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90" style={glow ? { filter: `drop-shadow(0 0 12px ${color})` } : {}}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={backgroundColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

interface SemiCircularProgressProps {
  percentage: number;
  size: number;
  strokeWidth: number;
  color: string;
  backgroundColor?: string;
}

function SemiCircularProgress({ percentage, size, strokeWidth, color, backgroundColor = 'rgba(255,255,255,0.1)' }: SemiCircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI; // Half circle
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size / 2 + strokeWidth} className="overflow-visible">
      {/* Background semi-circle */}
      <path
        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
        stroke={backgroundColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />
      {/* Progress semi-circle */}
      <path
        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

// Initial transaction data with varied timestamps for chart display
const initialTransactions: Transaction[] = [
  // Today's transactions at different hours
  { id: 1, amount: 45.50, type: 'sale', status: 'completed', customer: 'John Smith', method: 'card', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), description: 'Wireless Earbuds' },
  { id: 2, amount: 23.75, type: 'sale', status: 'completed', customer: 'Sarah Johnson', method: 'nfc', timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), description: 'Phone Case' },
  { id: 3, amount: 67.00, type: 'sale', status: 'completed', customer: 'Mike Wilson', method: 'card', timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), description: 'Power Bank' },
  { id: 4, amount: 15.99, type: 'sale', status: 'completed', customer: 'Emma Davis', method: 'cash', timestamp: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(), description: 'Cable' },
  { id: 5, amount: 89.99, type: 'sale', status: 'completed', customer: 'Chris Brown', method: 'card', timestamp: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(), description: 'Bluetooth Speaker' },
  { id: 6, amount: 34.50, type: 'sale', status: 'completed', customer: 'Lisa Anderson', method: 'nfc', timestamp: new Date(Date.now() - 17 * 60 * 60 * 1000).toISOString(), description: 'Smartwatch Band' },
  { id: 7, amount: 12.25, type: 'sale', status: 'completed', customer: 'David Lee', method: 'cash', timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(), description: 'Screen Protector' },
  // Previous days transactions
  { id: 8, amount: 55.00, type: 'sale', status: 'completed', customer: 'Amy White', method: 'card', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), description: 'Headphones' },
  { id: 9, amount: 42.99, type: 'sale', status: 'completed', customer: 'Tom Green', method: 'nfc', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), description: 'Charger' },
  { id: 10, amount: 78.50, type: 'sale', status: 'completed', customer: 'Jane Doe', method: 'card', timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), description: 'Tablet Case' },
  { id: 11, amount: 31.25, type: 'sale', status: 'completed', customer: 'Bob Smith', method: 'cash', timestamp: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), description: 'USB Cable' },
  { id: 12, amount: 95.00, type: 'sale', status: 'completed', customer: 'Carol Jones', method: 'card', timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), description: 'Smart Watch' },
  { id: 13, amount: 28.75, type: 'sale', status: 'completed', customer: 'Dan Brown', method: 'nfc', timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), description: 'Phone Holder' },
  { id: 14, amount: 61.50, type: 'sale', status: 'completed', customer: 'Eve Wilson', method: 'card', timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(), description: 'Portable Charger' },
];

export function Dashboard({ user, onNavigate, onLogout }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartSize, setChartSize] = useState(260);
  
  // Revenue category data for pie chart
  const revenueData = {
    online: 65,      // Online sales percentage
    inStore: 35      // In-store sales percentage
  };

  // Customer growth data for the mini chart
  const customerGrowthData = [
    { month: 'Jan', customers: 3200 },
    { month: 'Feb', customers: 3500 },
    { month: 'Mar', customers: 3400 },
    { month: 'Apr', customers: 3900 },
    { month: 'May', customers: 4200 },
    { month: 'Jun', customers: 4500 },
    { month: 'Jul', customers: 4800 },
    { month: 'Aug', customers: 5000 },
  ];

  // Handle responsive chart sizing
  useEffect(() => {
    const updateChartSize = () => {
      const width = window.innerWidth;
      if (width >= 1024) {
        // Desktop - larger size
        setChartSize(340);
      } else if (width >= 640) {
        // Tablet - medium size
        setChartSize(280);
      } else {
        // Mobile - smaller size
        setChartSize(Math.min(260, width - 80));
      }
    };

    updateChartSize();
    window.addEventListener('resize', updateChartSize);
    return () => window.removeEventListener('resize', updateChartSize);
  }, []);

  // Load transactions on mount
  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/transactions`,
        {
          headers: {
            Authorization: `Bearer ${accessToken || publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || initialTransactions);
      } else {
        setTransactions(initialTransactions);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactions(initialTransactions);
    } finally {
      setLoading(false);
    }
  };

  // Filter transactions for today only
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.timestamp);
    txDate.setHours(0, 0, 0, 0);
    return txDate.getTime() === today.getTime() && tx.status === 'completed';
  });

  // Calculate today's metrics
  const todayRevenue = todayTransactions.reduce((sum, tx) => 
    sum + (tx.type === 'refund' ? -tx.amount : tx.amount), 0
  );
  const todayTransactionCount = todayTransactions.length;
  
  // Calculate percentage based on daily goal of $500
  const dailyGoal = 500;
  const todayPercentage = Math.min(100, (todayRevenue / dailyGoal) * 100);

  // Calculate average transaction amount (all time)
  const completedTransactions = transactions.filter(tx => tx.status === 'completed');
  const averageTransaction = completedTransactions.length > 0
    ? completedTransactions.reduce((sum, tx) => sum + (tx.type === 'refund' ? -tx.amount : tx.amount), 0) / completedTransactions.length
    : 0;

  // Calculate hourly revenue for today (7 time segments representing last 21 hours)
  const getHourlyRevenueData = () => {
    const hours = [];
    const now = Date.now();
    
    // Create 7 segments, each representing 3 hours going back 21 hours total
    for (let i = 6; i >= 0; i--) {
      const hoursAgo = i * 3;
      const startTime = now - (hoursAgo + 3) * 60 * 60 * 1000;
      const endTime = now - hoursAgo * 60 * 60 * 1000;
      
      const segmentTransactions = transactions.filter(tx => {
        const txTime = new Date(tx.timestamp).getTime();
        return txTime >= startTime && txTime < endTime && tx.status === 'completed';
      });
      
      const revenue = segmentTransactions.reduce((sum, tx) => 
        sum + (tx.type === 'refund' ? -tx.amount : tx.amount), 0
      );
      
      hours.push(revenue);
    }
    return hours;
  };

  // Calculate last 30 days average transaction (7 segments representing ~4 days each)
  const getLast30DaysAvgData = () => {
    const segments = [];
    const now = Date.now();
    
    // Create 7 segments, each representing 4 days going back 28 days
    for (let i = 6; i >= 0; i--) {
      const daysBack = i * 4;
      const startTime = now - (daysBack + 4) * 24 * 60 * 60 * 1000;
      const endTime = now - daysBack * 24 * 60 * 60 * 1000;
      
      const segmentTransactions = transactions.filter(tx => {
        const txTime = new Date(tx.timestamp).getTime();
        return txTime >= startTime && txTime < endTime && tx.status === 'completed';
      });
      
      const avgTrans = segmentTransactions.length > 0
        ? segmentTransactions.reduce((sum, tx) => sum + (tx.type === 'refund' ? -tx.amount : tx.amount), 0) / segmentTransactions.length
        : 0;
      
      segments.push(avgTrans);
    }
    return segments;
  };

  const hourlyRevenue = getHourlyRevenueData();
  const last30DaysAvg = getLast30DaysAvgData();
  
  // Calculate max values for normalization (for column heights)
  const maxHourlyRevenue = Math.max(...hourlyRevenue, 1);
  const maxAvgTrans = Math.max(...last30DaysAvg, 1);

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header Section with Active Transactions */}
      <div className="relative">
        {/* Cyan bottom accent - positioned behind with overlap */}
        <div className="absolute left-0 right-0 h-[80px] sm:h-[106px] md:h-[120px] bg-[#00E5CC] rounded-b-[60px] sm:rounded-b-[100px] md:rounded-b-[120px] z-0" style={{ bottom: '-20px' }}></div>
        
        {/* Blue box on top */}
        <div className="bg-[#0055FF] pt-6 sm:pt-8 md:pt-10 pb-5 sm:pb-7 md:pb-9 rounded-b-[60px] sm:rounded-b-[100px] md:rounded-b-[120px] relative z-10">
          <div className="max-w-md md:max-w-2xl mx-auto px-4 sm:px-6 md:px-8">
            <h1 className="text-[#00E5CC] text-center text-xl sm:text-2xl md:text-3xl mb-8 sm:mb-12 md:mb-16">active transactions</h1>
            
            {/* Semi-Circular Chart */}
            <div className="relative flex items-center justify-center mb-6 sm:mb-8 md:mb-10">
              <SemiCircularProgress 
                percentage={todayPercentage} 
                size={chartSize} 
                strokeWidth={16} 
                color="#00E5CC"
                backgroundColor="rgba(0, 229, 204, 0.2)"
              />
              <div className="absolute text-center" style={{ bottom: '10px' }}>
                <div className="text-[#00E5CC] text-4xl sm:text-5xl md:text-6xl mb-1">
                  ${todayRevenue.toFixed(2)}
                </div>
                <div className="text-[#00E5CC] text-sm sm:text-lg md:text-xl">
                  {todayTransactionCount} transaction{todayTransactionCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-md md:max-w-2xl mx-auto px-3 sm:px-6 md:px-8 mt-[40px] sm:mt-[50px] md:mt-[60px] relative z-10">
        {/* Top Row */}
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:gap-6 mb-4 sm:mb-6 md:mb-8">
          {/* Revenue Progress Widget - Pie Chart */}
          <div className="bg-white rounded-2xl sm:rounded-3xl md:rounded-[28px] p-3 sm:p-6 md:p-8 col-span-1 row-span-2 flex flex-col min-h-[320px] sm:min-h-[420px] md:min-h-[480px] shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] cursor-pointer">
            {/* Concentric Pie Chart */}
            <div className="relative flex items-center justify-center mb-6 sm:mb-8 md:mb-10">
              <svg 
                width="174" 
                height="174" 
                viewBox="0 0 174 174" 
                className="transform -rotate-90 w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] md:w-[174px] md:h-[174px]"
              >
                {/* Outer ring - Online Sales */}
                {/* Background groove outer ring */}
                <circle
                  cx="87"
                  cy="87"
                  r="78.87"
                  stroke="#E6E6EC"
                  strokeWidth="16.26"
                  fill="none"
                />
                {/* Progress outer ring (Online Sales %) */}
                <circle
                  cx="87"
                  cy="87"
                  r="78.87"
                  stroke="#0055FF"
                  strokeWidth="16.26"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 78.87}`}
                  strokeDashoffset={`${2 * Math.PI * 78.87 * (1 - revenueData.online / 100)}`}
                />
                
                {/* Inner ring - In-Store Sales */}
                {/* Background groove inner ring */}
                <circle
                  cx="87"
                  cy="87"
                  r="55"
                  stroke="#E6E6EC"
                  strokeWidth="16"
                  fill="none"
                />
                {/* Progress inner ring (In-Store Sales %) */}
                <circle
                  cx="87"
                  cy="87"
                  r="55"
                  stroke="#00E5CC"
                  strokeWidth="16"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 55}`}
                  strokeDashoffset={`${2 * Math.PI * 55 * (1 - revenueData.inStore / 100)}`}
                />
              </svg>
            </div>

            {/* Series 1 - Online Sales */}
            <div className="w-full mb-6 sm:mb-8 md:mb-10">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <div className="text-[#3B3D53] text-xl sm:text-2xl md:text-3xl">{revenueData.online}%</div>
              </div>
              <div className="text-[#161A41] opacity-44 text-xs sm:text-base md:text-lg mb-2 sm:mb-3">Online Sales</div>
              <div className="w-20 sm:w-24 md:w-28 h-[3px] bg-[#0055FF]"></div>
            </div>

            {/* Series 2 - In-Store Sales */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <div className="text-[#3B3D53] text-xl sm:text-2xl md:text-3xl">{revenueData.inStore}%</div>
              </div>
              <div className="text-[#161A41] opacity-44 text-xs sm:text-base md:text-lg mb-2 sm:mb-3">In-Store Sales</div>
              <div className="w-20 sm:w-24 md:w-28 h-[3px] bg-[#00E5CC]"></div>
            </div>
          </div>

          {/* Average Trans Card */}
          <div className="bg-[#0055FF] rounded-2xl sm:rounded-3xl md:rounded-[28px] p-3 sm:p-7 md:p-8 flex flex-col justify-between min-h-[90px] sm:min-h-[115px] md:min-h-[135px] transition-all duration-300 hover:shadow-2xl hover:scale-[1.05] cursor-pointer">
            <h3 className="text-[#00E5CC] text-[10px] sm:text-sm md:text-base">Average Trans</h3>
            
            {/* Small Column Chart - Last 30 days */}
            <div className="w-[100px] h-[45px] sm:w-[140px] sm:h-[60px] flex items-end justify-between gap-[4px] sm:gap-[6px] mx-auto my-1 sm:my-2">
              {last30DaysAvg.map((avg, index) => {
                const height = maxAvgTrans > 0 ? (avg / maxAvgTrans) * 100 : 15;
                const isMostRecent = index === 6; // Last segment is most recent
                return (
                  <div 
                    key={index}
                    className={`${isMostRecent ? 'bg-[#00E5CC]' : 'bg-[#00E5CC]/40'} rounded-[3px] sm:rounded-[4px] w-[10px] sm:w-[14px]`}
                    style={{ height: `${Math.max(height, 15)}%` }}
                  />
                );
              })}
            </div>
            
            <div className="text-[#00E5CC] text-xl sm:text-3xl md:text-4xl">${averageTransaction.toFixed(2)}</div>
          </div>

          {/* Daily Revenue Card */}
          <div className="bg-[#00E5CC] rounded-2xl sm:rounded-3xl md:rounded-[28px] p-3 sm:p-7 md:p-8 flex flex-col justify-between min-h-[90px] sm:min-h-[115px] md:min-h-[135px] transition-all duration-300 hover:shadow-2xl hover:scale-[1.05] cursor-pointer">
            <h3 className="text-[#0055FF] text-[10px] sm:text-sm md:text-base">Daily Revenue</h3>
            
            {/* Small Column Chart - Hourly Revenue */}
            <div className="w-[100px] h-[45px] sm:w-[140px] sm:h-[60px] flex items-end justify-between gap-[4px] sm:gap-[6px] mx-auto my-1 sm:my-2">
              {hourlyRevenue.map((revenue, index) => {
                const height = maxHourlyRevenue > 0 ? (revenue / maxHourlyRevenue) * 100 : 15;
                const isMostRecent = index === 6; // Last segment is most recent
                return (
                  <div 
                    key={index}
                    className={`${isMostRecent ? 'bg-[#0055FF]' : 'bg-[#0055FF]/40'} rounded-[3px] sm:rounded-[4px] w-[10px] sm:w-[14px]`}
                    style={{ height: `${Math.max(height, 15)}%` }}
                  />
                );
              })}
            </div>
            
            <div className="text-[#0055FF] text-xl sm:text-3xl md:text-4xl">${todayRevenue.toFixed(2)}</div>
          </div>
        </div>

        {/* Detail Stat Block */}
        <div className="bg-white rounded-2xl sm:rounded-3xl md:rounded-[28px] p-4 sm:p-8 md:p-10 flex items-center justify-between shadow-lg mb-12 md:mb-16 transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] cursor-pointer">
          <div className="flex-1">
            <div className="text-[#3B3D53] text-2xl sm:text-4xl md:text-5xl mb-1 sm:mb-2">5,000</div>
            <div className="text-[#161A41] opacity-50 text-xs sm:text-base md:text-lg">Total Customers</div>
          </div>
          
          {/* Small Line Chart Widget */}
          <div className="relative w-32 h-14 flex-shrink-0 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={customerGrowthData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <Line 
                  type="monotone" 
                  dataKey="customers" 
                  stroke="#0055FF" 
                  strokeWidth={3}
                  dot={(props: any) => {
                    const { cx, cy, index } = props;
                    if (index === customerGrowthData.length - 1) {
                      return (
                        <g key={`dot-${index}`}>
                          <circle cx={cx} cy={cy} r={10} fill="#0055FF" fillOpacity={0.16} />
                          <circle cx={cx} cy={cy} r={7} fill="#0055FF" />
                        </g>
                      );
                    }
                    return null;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
            {/* Vertical dashed line */}
            <div 
              className="absolute border-l border-dashed border-[#0055FF]"
              style={{ 
                left: '85%', 
                top: '12px', 
                height: '30px'
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2C2C2E] rounded-t-[24px] sm:rounded-t-[32px] md:rounded-t-[40px] px-4 sm:px-8 md:px-12 py-4 sm:py-6 md:py-8 z-50">
        <div className="max-w-md md:max-w-2xl mx-auto flex items-center justify-between gap-2 md:gap-4">
          <button className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-[#0055FF] rounded-xl sm:rounded-2xl md:rounded-3xl">
            <Home className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('stock')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
          >
            <Package className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('terminal')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
          >
            <img src={terminalIcon} alt="Terminal" className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 invert" />
          </button>
          <button 
            onClick={() => onNavigate('analytics')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
          >
            <BarChart3 className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('settings')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
          >
            <SlidersHorizontal className="text-white" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
