import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentMerchantId } from "@/lib/auth";
import { Home, Package, Receipt, BarChart3, SlidersHorizontal, Terminal } from "lucide-react";

interface CircularProgressProps {
  percentage: number;
  size: number;
  strokeWidth: number;
  color: string;
  backgroundColor?: string;
}

function SemiCircularProgress({ percentage, size, strokeWidth, color, backgroundColor = 'rgba(255,255,255,0.1)' }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size / 2 + strokeWidth} className="overflow-visible">
      <path
        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
        stroke={backgroundColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />
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

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [chartSize, setChartSize] = useState(260);
  const merchantId = getCurrentMerchantId();
  
  if (!merchantId) {
    setLocation('/login');
    return null;
  }

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "analytics"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/analytics`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  useEffect(() => {
    const updateChartSize = () => {
      const width = window.innerWidth;
      if (width >= 1024) {
        setChartSize(340);
      } else if (width >= 640) {
        setChartSize(280);
      } else {
        setChartSize(Math.min(260, width - 80));
      }
    };

    updateChartSize();
    window.addEventListener('resize', updateChartSize);
    return () => window.removeEventListener('resize', updateChartSize);
  }, []);

  // Calculate today's transactions (resets at midnight)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  
  const todayTransactions = transactions.filter((tx: any) => {
    const txDate = new Date(tx.createdAt);
    return txDate >= todayStart && tx.status === 'completed';
  });

  const todayRevenue = todayTransactions.reduce((sum: number, tx: any) => sum + parseFloat(tx.price), 0);
  const todayTransactionCount = todayTransactions.length;
  
  // Use merchant's custom daily goal or default to $500
  const dailyGoal = merchant?.dailyGoal ? parseFloat(merchant.dailyGoal) : 500;
  const dailyPercentage = Math.min(100, (todayRevenue / dailyGoal) * 100);

  // Calculate last 7 days revenue (for the 7 Days Revenue card)
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  const last7DaysTransactions = transactions.filter((tx: any) => {
    const txDate = new Date(tx.createdAt);
    return txDate >= sevenDaysAgo && tx.status === 'completed';
  });

  const last7DaysRevenue = last7DaysTransactions.reduce((sum: number, tx: any) => sum + parseFloat(tx.price), 0);

  // Calculate monthly metrics
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  
  const monthlyTransactions = transactions.filter((tx: any) => {
    const txDate = new Date(tx.createdAt);
    return txDate >= thirtyDaysAgo && tx.status === 'completed';
  });
  
  const monthlyRevenue = monthlyTransactions.reduce((sum: number, tx: any) => sum + parseFloat(tx.price), 0);
  const monthlyTransactionCount = monthlyTransactions.length;

  // Calculate daily revenue for last 7 days
  const getLast7DaysRevenueData = () => {
    const days = [];
    const nowTime = Date.now();
    
    for (let i = 6; i >= 0; i--) {
      const startTime = nowTime - (i + 1) * 24 * 60 * 60 * 1000;
      const endTime = nowTime - i * 24 * 60 * 60 * 1000;
      
      const segmentTransactions = transactions.filter((tx: any) => {
        const txTime = new Date(tx.createdAt).getTime();
        return txTime >= startTime && txTime < endTime && tx.status === 'completed';
      });
      
      const revenue = segmentTransactions.reduce((sum: number, tx: any) => sum + parseFloat(tx.price), 0);
      days.push(revenue);
    }
    return days;
  };

  // Calculate last 30 days average transaction
  const getLast30DaysAvgData = () => {
    const segments = [];
    const now = Date.now();
    
    for (let i = 6; i >= 0; i--) {
      const daysBack = i * 4;
      const startTime = now - (daysBack + 4) * 24 * 60 * 60 * 1000;
      const endTime = now - daysBack * 24 * 60 * 60 * 1000;
      
      const segmentTransactions = transactions.filter((tx: any) => {
        const txTime = new Date(tx.createdAt).getTime();
        return txTime >= startTime && txTime < endTime && tx.status === 'completed';
      });
      
      const avgTrans = segmentTransactions.length > 0
        ? segmentTransactions.reduce((sum: number, tx: any) => sum + parseFloat(tx.price), 0) / segmentTransactions.length
        : 0;
      
      segments.push(avgTrans);
    }
    return segments;
  };

  const last7DaysRevenueData = getLast7DaysRevenueData();
  const last30DaysAvg = getLast30DaysAvgData();
  
  const maxLast7DaysRevenue = Math.max(...last7DaysRevenueData, 1);
  const maxAvgTrans = Math.max(...last30DaysAvg, 1);

  const averageTransaction = analytics?.averageTransaction || 0;
  const totalRevenue = analytics?.totalRevenue || 0;

  if (analyticsLoading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-[#0055FF] text-xl">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header Section with Active Transactions */}
      <div className="relative">
        <div className="absolute left-0 right-0 h-[80px] sm:h-[106px] md:h-[120px] bg-[#00E5CC] rounded-b-[60px] sm:rounded-b-[100px] md:rounded-b-[120px] z-0" style={{ bottom: '-20px' }}></div>
        
        <div className="bg-[#0055FF] pt-6 sm:pt-8 md:pt-10 pb-5 sm:pb-7 md:pb-9 rounded-b-[60px] sm:rounded-b-[100px] md:rounded-b-[120px] relative z-10">
          <div className="max-w-md md:max-w-2xl mx-auto px-4 sm:px-6 md:px-8">
            <h1 className="text-[#00E5CC] text-center text-xl sm:text-2xl md:text-3xl mb-8 sm:mb-12 md:mb-16">active transactions</h1>
            
            <div className="relative flex items-center justify-center mb-6 sm:mb-8 md:mb-10">
              <SemiCircularProgress 
                percentage={dailyPercentage} 
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
                  {todayTransactionCount} transaction{todayTransactionCount !== 1 ? 's' : ''} today
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-md md:max-w-2xl mx-auto px-3 sm:px-6 md:px-8 mt-[40px] sm:mt-[50px] md:mt-[60px] relative z-10">
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:gap-6 mb-4 sm:mb-6 md:mb-8">
          {/* Monthly Stats Widget with Circle Graph */}
          <div className="bg-white rounded-2xl sm:rounded-3xl md:rounded-[28px] p-3 sm:p-6 md:p-8 col-span-1 row-span-2 flex flex-col min-h-[320px] sm:min-h-[420px] md:min-h-[480px] shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] cursor-pointer" data-testid="card-monthly-stats">
            <div className="relative flex items-center justify-center mb-6 sm:mb-8 md:mb-10">
              <svg 
                width="174" 
                height="174" 
                viewBox="0 0 174 174" 
                className="transform -rotate-90 w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] md:w-[174px] md:h-[174px]"
              >
                <circle
                  cx="87"
                  cy="87"
                  r="78.87"
                  stroke="#E6E6EC"
                  strokeWidth="16.26"
                  fill="none"
                />
                <circle
                  cx="87"
                  cy="87"
                  r="78.87"
                  stroke="#0055FF"
                  strokeWidth="16.26"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 78.87}`}
                  strokeDashoffset={`${2 * Math.PI * 78.87 * 0.35}`}
                />
                
                <circle
                  cx="87"
                  cy="87"
                  r="55"
                  stroke="#E6E6EC"
                  strokeWidth="16"
                  fill="none"
                />
                <circle
                  cx="87"
                  cy="87"
                  r="55"
                  stroke="#00E5CC"
                  strokeWidth="16"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 55}`}
                  strokeDashoffset={`${2 * Math.PI * 55 * 0.35}`}
                />
              </svg>
            </div>

            <div className="w-full mb-6 sm:mb-8 md:mb-10">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <div className="text-[#3B3D53] text-xl sm:text-2xl md:text-3xl">${monthlyRevenue.toFixed(2)}</div>
              </div>
              <div className="text-[#161A41] opacity-44 text-xs sm:text-base md:text-lg mb-2 sm:mb-3">Monthly Revenue</div>
              <div className="w-20 sm:w-24 md:w-28 h-[3px] bg-[#0055FF]"></div>
            </div>

            <div className="w-full">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <div className="text-[#3B3D53] text-xl sm:text-2xl md:text-3xl">{monthlyTransactionCount}</div>
              </div>
              <div className="text-[#161A41] opacity-44 text-xs sm:text-base md:text-lg mb-2 sm:mb-3">Monthly Transactions</div>
              <div className="w-20 sm:w-24 md:w-28 h-[3px] bg-[#00E5CC]"></div>
            </div>
          </div>

          {/* Average Trans Card */}
          <div className="bg-[#0055FF] rounded-2xl sm:rounded-3xl md:rounded-[28px] p-3 sm:p-7 md:p-8 flex flex-col justify-between min-h-[90px] sm:min-h-[115px] md:min-h-[135px] transition-all duration-300 hover:shadow-2xl hover:scale-[1.05] cursor-pointer" data-testid="card-avg-transaction">
            <h3 className="text-[#00E5CC] text-[10px] sm:text-sm md:text-base">Average Transaction</h3>
            
            <div className="w-[100px] h-[45px] sm:w-[140px] sm:h-[60px] flex items-end justify-between gap-[4px] sm:gap-[6px] mx-auto my-1 sm:my-2">
              {last30DaysAvg.map((avg, index) => {
                const height = maxAvgTrans > 0 ? (avg / maxAvgTrans) * 100 : 15;
                const isMostRecent = index === 6;
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

          {/* Last 7 Days Revenue Card */}
          <div className="bg-[#00E5CC] rounded-2xl sm:rounded-3xl md:rounded-[28px] p-3 sm:p-7 md:p-8 flex flex-col justify-between min-h-[90px] sm:min-h-[115px] md:min-h-[135px] transition-all duration-300 hover:shadow-2xl hover:scale-[1.05] cursor-pointer" data-testid="card-weekly-revenue">
            <h3 className="text-[#0055FF] text-[10px] sm:text-sm md:text-base">7 Days Revenue</h3>
            
            <div className="w-[100px] h-[45px] sm:w-[140px] sm:h-[60px] flex items-end justify-between gap-[4px] sm:gap-[6px] mx-auto my-1 sm:my-2">
              {last7DaysRevenueData.map((revenue, index) => {
                const height = maxLast7DaysRevenue > 0 ? (revenue / maxLast7DaysRevenue) * 100 : 15;
                const isMostRecent = index === 6;
                return (
                  <div 
                    key={index}
                    className={`${isMostRecent ? 'bg-[#0055FF]' : 'bg-[#0055FF]/40'} rounded-[3px] sm:rounded-[4px] w-[10px] sm:w-[14px]`}
                    style={{ height: `${Math.max(height, 15)}%` }}
                  />
                );
              })}
            </div>
            
            <div className="text-[#0055FF] text-xl sm:text-3xl md:text-4xl">${last7DaysRevenue.toFixed(2)}</div>
          </div>
        </div>

        {/* Total Revenue Block */}
        <div className="bg-white rounded-2xl sm:rounded-3xl md:rounded-[28px] p-4 sm:p-8 md:p-10 flex items-center justify-between shadow-lg mb-4 sm:mb-6 transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] cursor-pointer" data-testid="card-total-revenue">
          <div className="flex-1">
            <div className="text-[#3B3D53] text-2xl sm:text-4xl md:text-5xl mb-1 sm:mb-2">${totalRevenue.toFixed(2)}</div>
            <div className="text-[#161A41] opacity-50 text-xs sm:text-base md:text-lg">Total Revenue</div>
          </div>
          
          <div className="text-right">
            <div className="text-[#3B3D53] text-xl sm:text-2xl md:text-3xl">{analytics?.completedTransactions || 0}</div>
            <div className="text-[#161A41] opacity-50 text-xs sm:text-base">Transactions</div>
          </div>
        </div>

      </div>
    </div>
  );
}
