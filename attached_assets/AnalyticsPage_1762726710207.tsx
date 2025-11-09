import { useState, useEffect } from 'react';
import { Home, Package, BarChart3, SlidersHorizontal, Download, Calendar, TrendingUp, TrendingDown, DollarSign, CreditCard, ArrowUpDown, ChevronDown } from 'lucide-react';
import terminalIcon from 'figma:asset/334c2b7e95367d5970568548bd4fac0acb30be47.png';
import { Button } from './ui/button';
import { Calendar as CalendarComponent } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface AnalyticsPageProps {
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

interface ChartData {
  month: string;
  value: number;
}

const monthlyData: ChartData[] = [
  { month: 'Jan', value: 45 },
  { month: 'Feb', value: 52 },
  { month: 'Mar', value: 48 },
  { month: 'Apr', value: 65 },
  { month: 'May', value: 55 },
  { month: 'Jun', value: 70 },
  { month: 'Jul', value: 75 },
  { month: 'Aug', value: 82 },
  { month: 'Sep', value: 68 },
  { month: 'Oct', value: 73 },
  { month: 'Nov', value: 78 },
  { month: 'Dec', value: 85 },
];

// Custom Tooltip Component
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1F1A5F] rounded-lg px-4 py-2 shadow-lg opacity-90">
        <p className="text-white text-sm font-medium">${payload[0].value}k</p>
      </div>
    );
  }
  return null;
};

const initialTransactions: Transaction[] = [
  { id: 1, amount: 145.99, type: 'sale', status: 'completed', customer: 'John Smith', method: 'card', timestamp: '2025-11-08T10:30:00', description: 'Wireless Earbuds' },
  { id: 2, amount: 89.50, type: 'sale', status: 'completed', customer: 'Sarah Johnson', method: 'nfc', timestamp: '2025-11-08T11:15:00', description: 'Phone Case Premium' },
  { id: 3, amount: 234.00, type: 'sale', status: 'completed', customer: 'Mike Wilson', method: 'card', timestamp: '2025-11-08T12:00:00', description: 'Power Bank + Cable' },
  { id: 4, amount: 45.99, type: 'refund', status: 'completed', customer: 'Emma Davis', method: 'card', timestamp: '2025-11-08T13:20:00', description: 'Screen Protector' },
  { id: 5, amount: 199.99, type: 'sale', status: 'completed', customer: 'Chris Brown', method: 'cash', timestamp: '2025-11-08T14:45:00', description: 'Bluetooth Speaker' },
  { id: 6, amount: 67.50, type: 'sale', status: 'pending', customer: 'Lisa Anderson', method: 'nfc', timestamp: '2025-11-08T15:30:00', description: 'Smartwatch Band' },
  { id: 7, amount: 299.00, type: 'sale', status: 'completed', customer: 'David Lee', method: 'card', timestamp: '2025-11-07T09:15:00', description: 'Premium Headphones' },
  { id: 8, amount: 55.00, type: 'sale', status: 'completed', customer: 'Amy Chen', method: 'cash', timestamp: '2025-11-07T11:30:00', description: 'Car Charger Set' },
  { id: 9, amount: 178.99, type: 'sale', status: 'completed', customer: 'Robert Taylor', method: 'nfc', timestamp: '2025-11-06T16:20:00', description: 'Tablet Case' },
  { id: 10, amount: 89.99, type: 'sale', status: 'failed', customer: 'Jennifer White', method: 'card', timestamp: '2025-11-06T10:00:00', description: 'USB Hub' },
];

// Custom Dot Component for active points
const CustomDot = (props: any) => {
  const { cx, cy } = props;
  
  return (
    <g>
      <circle 
        cx={cx} 
        cy={cy} 
        r={5} 
        fill="#6976EB" 
        stroke="#fff"
        strokeWidth={2}
      />
    </g>
  );
};

export function AnalyticsPage({ user, onNavigate, onLogout }: AnalyticsPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('revenue');

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

  const filteredTransactions = transactions.filter(tx => {
    if (!dateRange.from && !dateRange.to) return true;
    
    const txDate = new Date(tx.timestamp);
    txDate.setHours(0, 0, 0, 0); // Reset time for accurate date comparison
    
    if (dateRange.from) {
      const fromDate = new Date(dateRange.from);
      fromDate.setHours(0, 0, 0, 0);
      if (txDate < fromDate) return false;
    }
    
    if (dateRange.to) {
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999); // Include entire day
      if (txDate > toDate) return false;
    }
    
    return true;
  });

  const totalRevenue = filteredTransactions
    .filter(tx => tx.status === 'completed')
    .reduce((sum, tx) => sum + (tx.type === 'refund' ? -tx.amount : tx.amount), 0);

  const totalTransactions = filteredTransactions.filter(tx => tx.status === 'completed').length;
  const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  const successRate = transactions.length > 0 
    ? (transactions.filter(tx => tx.status === 'completed').length / transactions.length) * 100 
    : 0;

  const handleDownloadReport = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const params = new URLSearchParams();
      if (dateRange.from) params.append('from', dateRange.from.toISOString());
      if (dateRange.to) params.append('to', dateRange.to.toISOString());

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/reports/business?${params}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken || publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `business-report-${new Date().toISOString().split('T')[0]}.pdf`;
        a.click();
        toast.success('Business report downloaded');
      } else {
        toast.error('Failed to download report');
      }
    } catch (error) {
      console.error('Error downloading report:', error);
      toast.error('Failed to download report');
    }
  };

  const handleDownloadCSV = () => {
    const headers = ['ID', 'Date', 'Time', 'Customer', 'Amount', 'Type', 'Method', 'Status', 'Description'];
    const rows = filteredTransactions.map(tx => {
      const date = new Date(tx.timestamp);
      return [
        tx.id,
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        tx.customer,
        tx.amount.toFixed(2),
        tx.type,
        tx.method,
        tx.status,
        tx.description || '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('CSV file downloaded');
  };

  const getStatusColor = (status: Transaction['status']) => {
    switch (status) {
      case 'completed':
        return 'text-[#00E5CC]';
      case 'pending':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
    }
  };

  const getStatusBg = (status: Transaction['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-[#00E5CC]/10';
      case 'pending':
        return 'bg-yellow-500/10';
      case 'failed':
        return 'bg-red-500/10';
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header Section */}
      <div className="relative">
        <div className="absolute left-0 right-0 h-[80px] sm:h-[106px] bg-[#00E5CC] rounded-b-[60px] sm:rounded-b-[100px] z-0" style={{ bottom: '-20px' }}></div>
        
        <div className="bg-[#0055FF] pt-6 sm:pt-8 pb-10 sm:pb-12 rounded-b-[60px] sm:rounded-b-[100px] relative z-10">
          <div className="max-w-4xl mx-auto px-3 sm:px-6">
            <h1 className="text-[#00E5CC] text-center text-xl sm:text-2xl mb-6 sm:mb-8">analytics & reports</h1>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 max-w-full">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <DollarSign className="text-[#00E5CC] flex-shrink-0" size={12} />
                  <div className="text-[#00E5CC]/70 text-[9px] sm:text-[10px] md:text-xs truncate">Revenue</div>
                </div>
                <div className="text-white text-xs sm:text-sm md:text-base truncate">${totalRevenue.toFixed(2)}</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <CreditCard className="text-[#00E5CC] flex-shrink-0" size={12} />
                  <div className="text-[#00E5CC]/70 text-[9px] sm:text-[10px] md:text-xs truncate">Transactions</div>
                </div>
                <div className="text-white text-xs sm:text-sm md:text-base truncate">{totalTransactions}</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <TrendingUp className="text-[#00E5CC] flex-shrink-0" size={12} />
                  <div className="text-[#00E5CC]/70 text-[9px] sm:text-[10px] md:text-xs truncate">Avg. Sale</div>
                </div>
                <div className="text-white text-xs sm:text-sm md:text-base truncate">${avgTransaction.toFixed(2)}</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <ArrowUpDown className="text-[#00E5CC] flex-shrink-0" size={12} />
                  <div className="text-[#00E5CC]/70 text-[9px] sm:text-[10px] md:text-xs truncate">Success Rate</div>
                </div>
                <div className="text-white text-xs sm:text-sm md:text-base truncate">{successRate.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 mt-[40px] sm:mt-[50px] relative z-10 space-y-4 sm:space-y-6">
        {/* Chart Section */}
        <div className="bg-white rounded-[15px] p-4 sm:p-8 shadow-[0px_23px_28.6px_rgba(0,0,0,0.03)]">
          {/* Filter Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mb-6 sm:mb-8">
            <h2 className="text-[#808080] text-base sm:text-lg">Item performance</h2>
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger className="w-full sm:w-[170px] border-b border-black/[0.11] rounded-none">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="profit">Profit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Graph Container */}
          <div className="w-full h-[300px] sm:h-[350px] md:h-[400px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-[#3B3D53]">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlyData}
                  margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
                >
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6976EB" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6976EB" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid 
                    strokeDasharray="0" 
                    stroke="rgba(0, 0, 0, 0.06)" 
                    vertical={false}
                  />
                  <XAxis 
                    dataKey="month" 
                    stroke="rgba(128, 128, 128, 0.69)"
                    tick={{ fill: 'rgba(128, 128, 128, 0.69)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="rgba(128, 128, 128, 0.69)"
                    tick={{ fill: 'rgba(128, 128, 128, 0.69)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 90]}
                    ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90]}
                    tickFormatter={(value) => value.toString().padStart(2, '0')}
                  />
                  <Tooltip 
                    content={<CustomTooltip />}
                    cursor={{ 
                      stroke: '#6976EB', 
                      strokeWidth: 1, 
                      strokeDasharray: '4 4' 
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#6976EB" 
                    strokeWidth={3}
                    fill="url(#colorValue)"
                    dot={<CustomDot />}
                    activeDot={{ 
                      r: 8, 
                      fill: '#6976EB',
                      stroke: '#fff',
                      strokeWidth: 2
                    }}
                    animationDuration={800}
                    animationEasing="ease-in-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Reports Section */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-md">
          <h2 className="text-[#3B3D53] text-base sm:text-lg mb-4">Download Reports</h2>
          
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 justify-start border-[#0055FF]/30 text-left">
                  <Calendar className="mr-2 h-4 w-4 text-[#0055FF] flex-shrink-0" />
                  <span className="truncate">
                    {dateRange.from ? (
                      dateRange.to ? (
                        `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
                      ) : (
                        dateRange.from.toLocaleDateString()
                      )
                    ) : (
                      'Select date range'
                    )}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                  onSelect={(range: any) => {
                    console.log('Date range selected:', range);
                    if (range?.from) {
                      setDateRange({ from: range.from, to: range.to });
                      if (range.to) {
                        setShowDatePicker(false);
                        toast.success(`Date range: ${range.from.toLocaleDateString()} - ${range.to.toLocaleDateString()}`);
                      }
                    } else {
                      setDateRange({});
                    }
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {dateRange.from && (
              <Button 
                variant="outline" 
                onClick={() => setDateRange({})}
                className="border-[#0055FF]/30 text-[#0055FF]"
              >
                Clear
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              onClick={handleDownloadReport}
              className="bg-[#0055FF] hover:bg-[#0044DD] text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              Business Report (PDF)
            </Button>
            <Button
              onClick={handleDownloadCSV}
              className="bg-[#00E5CC] hover:bg-[#00D4BC] text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              Raw Data (CSV)
            </Button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-md">
          <h2 className="text-[#3B3D53] text-base sm:text-lg mb-4">Transaction History</h2>
          
          {loading ? (
            <div className="text-center py-12 text-[#3B3D53]">Loading transactions...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-[#3B3D53]">No transactions found</div>
          ) : (
            <div className="space-y-2 sm:space-y-3 max-h-96 overflow-y-auto">
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:border-[#0055FF]/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-[#3B3D53] text-sm sm:text-base truncate">{tx.customer}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBg(tx.status)} ${getStatusColor(tx.status)}`}>
                          {tx.status}
                        </span>
                      </div>
                      {tx.description && (
                        <div className="text-[#161A41]/50 text-xs sm:text-sm mb-2">{tx.description}</div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs sm:text-sm">
                        <div className="text-[#161A41]/70">
                          {new Date(tx.timestamp).toLocaleString()}
                        </div>
                        <div className="text-[#161A41]/70 capitalize">
                          {tx.method}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className={`text-sm sm:text-base ${tx.type === 'refund' ? 'text-red-500' : 'text-[#0055FF]'}`}>
                        {tx.type === 'refund' ? '-' : ''}${tx.amount.toFixed(2)}
                      </div>
                      <div className="text-xs text-[#161A41]/50 capitalize">{tx.type}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2C2C2E] rounded-t-[24px] sm:rounded-t-[32px] px-4 sm:px-8 py-4 sm:py-6 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <Home className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('stock')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <Package className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('terminal')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <img src={terminalIcon} alt="Terminal" className="w-5 h-5 sm:w-6 sm:h-6 invert" />
          </button>
          <button className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-[#0055FF] rounded-xl sm:rounded-2xl">
            <BarChart3 className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('settings')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <SlidersHorizontal className="text-white" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
