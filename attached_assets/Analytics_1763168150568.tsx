import { useState } from 'react';
import { BarChart3, Download, FileText, Calendar, TrendingUp, DollarSign, Activity, Users } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar as CalendarComponent } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';

interface AnalyticsProps {
  onSwitchView?: () => void;
}

// Mock data for charts
const revenueData = [
  { date: 'Jan 1', revenue: 12500, transactions: 145, merchants: 28 },
  { date: 'Jan 8', revenue: 15800, transactions: 178, merchants: 29 },
  { date: 'Jan 15', revenue: 18200, transactions: 210, merchants: 31 },
  { date: 'Jan 22', revenue: 16900, transactions: 192, merchants: 30 },
  { date: 'Jan 29', revenue: 21300, transactions: 245, merchants: 33 },
  { date: 'Feb 5', revenue: 23800, transactions: 268, merchants: 35 },
  { date: 'Feb 12', revenue: 25600, transactions: 289, merchants: 36 },
  { date: 'Feb 19', revenue: 27900, transactions: 315, merchants: 38 },
  { date: 'Feb 26', revenue: 29200, transactions: 332, merchants: 40 },
  { date: 'Mar 5', revenue: 31500, transactions: 358, merchants: 42 },
];

const categoryData = [
  { category: 'Retail', revenue: 45600, percentage: 38 },
  { category: 'Food & Beverage', revenue: 32400, percentage: 27 },
  { category: 'Services', revenue: 24300, percentage: 20 },
  { category: 'Entertainment', revenue: 18000, percentage: 15 },
];

const transactionTrends = [
  { month: 'Sep', amount: 8200 },
  { month: 'Oct', amount: 9800 },
  { month: 'Nov', amount: 11500 },
  { month: 'Dec', amount: 13200 },
  { month: 'Jan', amount: 15800 },
  { month: 'Feb', amount: 18400 },
];

export default function Analytics({ onSwitchView }: AnalyticsProps) {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGeneratePDF = () => {
    setIsGenerating(true);
    // Simulate PDF generation
    setTimeout(() => {
      setIsGenerating(false);
      // In a real app, this would generate and download a PDF
      const blob = new Blob(['Mock PDF Report Content'], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-report-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }, 1500);
  };

  const handleDownloadCSV = () => {
    // Generate CSV content
    const csvContent = [
      ['Date', 'Revenue', 'Transactions', 'Active Merchants'],
      ...revenueData.map(item => [item.date, item.revenue, item.transactions, item.merchants])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-data-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        {/* Tab Switcher */}
        {onSwitchView && (
          <div className="flex items-center gap-2 mb-4 p-1 bg-[#24263a] rounded-lg w-fit">
            <button 
              className="px-4 py-2 bg-gradient-to-r from-[#0055FF] to-[#00E5CC] text-white text-sm rounded-md"
            >
              Revenue Analytics
            </button>
            <button 
              onClick={onSwitchView}
              className="px-4 py-2 text-[#dbdfea] text-sm rounded-md hover:bg-[#1d1e2c] transition-all"
            >
              Web Analytics
            </button>
          </div>
        )}
        
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="size-6 md:size-8 text-[#0055FF]" />
          <h1 className="text-[#dbdfea] text-2xl md:text-3xl">Revenue Analytics</h1>
        </div>
        <p className="text-[#dbdfea] text-sm md:text-base opacity-70">
          Comprehensive insights into your business performance
        </p>
      </div>

      {/* Main Revenue Chart */}
      <div className="bg-[#24263a] rounded-[10px] p-4 md:p-6 mb-6 transition-all duration-300 hover:shadow-lg hover:shadow-[#0055FF]/10 hover:scale-[1.01]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h2 className="text-[#dbdfea] text-lg md:text-xl mb-1">Revenue Overview</h2>
            <p className="text-[#dbdfea] text-xs md:text-sm opacity-60">Weekly revenue trends over time</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs md:text-sm">
              <div className="size-3 rounded-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC]"></div>
              <span className="text-[#dbdfea]">Revenue</span>
            </div>
          </div>
        </div>
        
        <div className="h-[250px] md:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0055FF" stopOpacity={0.8}/>
                  <stop offset="50%" stopColor="#0080DD" stopOpacity={0.4}/>
                  <stop offset="100%" stopColor="#00E5CC" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1d1e2c" />
              <XAxis 
                dataKey="date" 
                stroke="#dbdfea" 
                style={{ fontSize: '12px' }}
                tick={{ fill: '#dbdfea' }}
              />
              <YAxis 
                stroke="#dbdfea" 
                style={{ fontSize: '12px' }}
                tick={{ fill: '#dbdfea' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#24263a', 
                  border: '1px solid #1d1e2c',
                  borderRadius: '8px',
                  color: '#dbdfea'
                }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#0055FF" 
                strokeWidth={3}
                fill="url(#colorRevenue)" 
                activeDot={{ r: 6, fill: '#00E5CC' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Simplified Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Revenue */}
        <div className="bg-[#24263a] rounded-[10px] p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:shadow-[#0055FF]/20 hover:scale-105 cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 md:size-12 rounded-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC] flex items-center justify-center">
              <DollarSign className="size-5 md:size-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[#dbdfea] text-xs md:text-sm opacity-70">Total Revenue</p>
              <p className="text-[#dbdfea] text-xl md:text-2xl">$287,450</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#4ade80] text-xs md:text-sm">
            <TrendingUp className="size-3.5 md:size-4" />
            <span>+12.5% from last period</span>
          </div>
        </div>

        {/* Total Transactions */}
        <div className="bg-[#24263a] rounded-[10px] p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:shadow-[#00E5CC]/20 hover:scale-105 cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 md:size-12 rounded-full bg-[#1d1e2c] flex items-center justify-center">
              <Activity className="size-5 md:size-6 text-[#00E5CC]" />
            </div>
            <div className="flex-1">
              <p className="text-[#dbdfea] text-xs md:text-sm opacity-70">Transactions</p>
              <p className="text-[#dbdfea] text-xl md:text-2xl">12,847</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#4ade80] text-xs md:text-sm">
            <TrendingUp className="size-3.5 md:size-4" />
            <span>+8.2% from last period</span>
          </div>
        </div>

        {/* Active Merchants */}
        <div className="bg-[#24263a] rounded-[10px] p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:shadow-[#0055FF]/20 hover:scale-105 cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 md:size-12 rounded-full bg-[#1d1e2c] flex items-center justify-center">
              <Users className="size-5 md:size-6 text-[#0055FF]" />
            </div>
            <div className="flex-1">
              <p className="text-[#dbdfea] text-xs md:text-sm opacity-70">Active Merchants</p>
              <p className="text-[#dbdfea] text-xl md:text-2xl">42</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#4ade80] text-xs md:text-sm">
            <TrendingUp className="size-3.5 md:size-4" />
            <span>+5 new this month</span>
          </div>
        </div>

        {/* Avg Transaction */}
        <div className="bg-[#24263a] rounded-[10px] p-4 md:p-5 transition-all duration-300 hover:shadow-lg hover:shadow-[#00E5CC]/20 hover:scale-105 cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 md:size-12 rounded-full bg-[#1d1e2c] flex items-center justify-center">
              <BarChart3 className="size-5 md:size-6 text-[#00E5CC]" />
            </div>
            <div className="flex-1">
              <p className="text-[#dbdfea] text-xs md:text-sm opacity-70">Avg Transaction</p>
              <p className="text-[#dbdfea] text-xl md:text-2xl">$22.37</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#4ade80] text-xs md:text-sm">
            <TrendingUp className="size-3.5 md:size-4" />
            <span>+3.8% from last period</span>
          </div>
        </div>
      </div>

      {/* Secondary Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Category Breakdown */}
        <div className="bg-[#24263a] rounded-[10px] p-4 md:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-[#0055FF]/10 hover:scale-[1.01]">
          <h2 className="text-[#dbdfea] text-lg md:text-xl mb-1">Revenue by Category</h2>
          <p className="text-[#dbdfea] text-xs md:text-sm opacity-60 mb-6">Distribution across merchant types</p>
          
          <div className="h-[250px] md:h-[300px] flex items-center justify-center">
            <div className="relative w-full max-w-[280px] md:max-w-[320px] aspect-square">
              {/* Center Circle with Total */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[#dbdfea] text-xs md:text-sm opacity-60">Total Revenue</p>
                <p className="text-[#dbdfea] text-2xl md:text-3xl">$120.3k</p>
              </div>
              
              {/* SVG Rings */}
              <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                {categoryData.map((item, index) => {
                  const colors = ['#0055FF', '#00E5CC', '#0080DD', '#00B8E6'];
                  const radius = 95 - (index * 18);
                  const circumference = 2 * Math.PI * radius;
                  const offset = circumference - (circumference * item.percentage) / 100;
                  
                  return (
                    <g key={item.category}>
                      {/* Background circle */}
                      <circle
                        cx="100"
                        cy="100"
                        r={radius}
                        fill="none"
                        stroke="#1d1e2c"
                        strokeWidth="14"
                      />
                      {/* Progress circle */}
                      <circle
                        cx="100"
                        cy="100"
                        r={radius}
                        fill="none"
                        stroke={colors[index]}
                        strokeWidth="14"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                        style={{
                          filter: `drop-shadow(0 0 8px ${colors[index]}40)`
                        }}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
          
          {/* Legend */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            {categoryData.map((item, index) => {
              const colors = ['#0055FF', '#00E5CC', '#0080DD', '#00B8E6'];
              return (
                <div key={item.category} className="flex items-center gap-2">
                  <div 
                    className="size-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: colors[index] }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#dbdfea] text-xs truncate">{item.category}</p>
                    <p className="text-[#dbdfea] text-xs opacity-60">${(item.revenue / 1000).toFixed(1)}k ({item.percentage}%)</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transaction Trends */}
        <div className="bg-[#24263a] rounded-[10px] p-4 md:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-[#00E5CC]/10 hover:scale-[1.01]">
          <h2 className="text-[#dbdfea] text-lg md:text-xl mb-1">Transaction Trends</h2>
          <p className="text-[#dbdfea] text-xs md:text-sm opacity-60 mb-6">Monthly transaction volume</p>
          
          <div className="h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={transactionTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1d1e2c" />
                <XAxis 
                  dataKey="month" 
                  stroke="#dbdfea" 
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#dbdfea' }}
                />
                <YAxis 
                  stroke="#dbdfea" 
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#dbdfea' }}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#24263a', 
                    border: '1px solid #1d1e2c',
                    borderRadius: '8px',
                    color: '#dbdfea'
                  }}
                  formatter={(value: number) => [value.toLocaleString(), 'Transactions']}
                />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#00E5CC" 
                  strokeWidth={3}
                  dot={{ fill: '#00E5CC', r: 5 }}
                  activeDot={{ r: 7, fill: '#0055FF' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Report Generation Section */}
      <div className="bg-[#24263a] rounded-[10px] p-4 md:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-[#0055FF]/10">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="size-6 text-[#0055FF]" />
          <div>
            <h2 className="text-[#dbdfea] text-lg md:text-xl">Generate Report</h2>
            <p className="text-[#dbdfea] text-xs md:text-sm opacity-60">Export your analytics data</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Date Range Selector */}
          <div>
            <label className="text-[#dbdfea] text-sm mb-3 block">Select Date Range</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left bg-[#1d1e2c] border-[#1d1e2c] hover:bg-[#2a2c3e] hover:border-[#0055FF] text-[#dbdfea]"
                  >
                    <Calendar className="mr-2 size-4" />
                    {formatDate(dateRange.from)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#24263a] border-[#1d1e2c]" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => setDateRange({ ...dateRange, from: date })}
                    className="rounded-md"
                  />
                </PopoverContent>
              </Popover>

              <span className="text-[#dbdfea] self-center hidden sm:block">to</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left bg-[#1d1e2c] border-[#1d1e2c] hover:bg-[#2a2c3e] hover:border-[#00E5CC] text-[#dbdfea]"
                  >
                    <Calendar className="mr-2 size-4" />
                    {formatDate(dateRange.to)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#24263a] border-[#1d1e2c]" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => setDateRange({ ...dateRange, to: date })}
                    className="rounded-md"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Export Options */}
          <div>
            <label className="text-[#dbdfea] text-sm mb-3 block">Export Options</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleGeneratePDF}
                disabled={isGenerating}
                className="flex-1 bg-gradient-to-r from-[#0055FF] to-[#00E5CC] hover:from-[#0044CC] hover:to-[#00CCB3] text-white border-0"
              >
                {isGenerating ? (
                  <>
                    <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 size-4" />
                    Generate PDF
                  </>
                )}
              </Button>

              <Button
                onClick={handleDownloadCSV}
                variant="outline"
                className="flex-1 bg-[#1d1e2c] border-[#1d1e2c] hover:bg-[#2a2c3e] hover:border-[#0055FF] text-[#dbdfea]"
              >
                <Download className="mr-2 size-4" />
                Download CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Info Text */}
        <div className="mt-6 p-4 bg-[#1d1e2c] rounded-lg">
          <p className="text-[#dbdfea] text-xs md:text-sm opacity-70">
            📊 <span className="font-semibold">PDF Report</span> includes all charts, graphs, and detailed breakdowns. 
            <span className="mx-2">•</span>
            📁 <span className="font-semibold">CSV File</span> contains raw data for further analysis.
          </p>
        </div>
      </div>
    </div>
  );
}