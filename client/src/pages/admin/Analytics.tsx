import { useLocation } from 'wouter';
import { TrendingUp, DollarSign, Activity, Users, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface AnalyticsData {
  totalMerchants: number;
  activeMerchants: number;
  totalRevenue: number;
  totalTransactions: number;
  completedTransactions: number;
  transactionFeeRevenue: number;
}

export function Analytics() {
  const [, setLocation] = useLocation();

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/admin/analytics'],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-NZ').format(num);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const avgTransaction = analytics?.totalRevenue && analytics?.completedTransactions 
    ? analytics.totalRevenue / analytics.completedTransactions 
    : 0;

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-[#dbdfea] mb-2">Analytics</h1>
            <p className="text-sm text-[#dbdfea]/60">Platform performance and revenue insights</p>
          </div>
          <button
            onClick={() => setLocation('/admin/web-analytics')}
            className="flex items-center gap-2 text-[#0055FF] hover:text-[#00E5CC] transition-colors"
            data-testid="button-switch-to-web"
          >
            <span className="text-sm">Website Analytics</span>
            <ArrowRight className="size-4" />
          </button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC] flex items-center justify-center">
                <DollarSign className="size-5 text-white" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Total Revenue</p>
                <p className="text-[#dbdfea] text-xl" data-testid="text-total-revenue">
                  {analytics ? formatCurrency(analytics.totalRevenue) : '$0.00'}
                </p>
              </div>
            </div>
            <p className="text-[#dbdfea]/40 text-xs">All completed transactions</p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <Activity className="size-5 text-[#0055FF]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Transactions</p>
                <p className="text-[#dbdfea] text-xl" data-testid="text-total-transactions">
                  {analytics ? formatNumber(analytics.totalTransactions) : '0'}
                </p>
              </div>
            </div>
            <p className="text-[#dbdfea]/40 text-xs">
              {analytics ? formatNumber(analytics.completedTransactions) : '0'} completed
            </p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <Users className="size-5 text-[#00E5CC]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Active Merchants</p>
                <p className="text-[#dbdfea] text-xl" data-testid="text-active-merchants">
                  {analytics ? formatNumber(analytics.activeMerchants) : '0'}
                </p>
              </div>
            </div>
            <p className="text-[#dbdfea]/40 text-xs">
              of {analytics ? formatNumber(analytics.totalMerchants) : '0'} total merchants
            </p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <TrendingUp className="size-5 text-[#0055FF]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Avg Transaction</p>
                <p className="text-[#dbdfea] text-xl" data-testid="text-avg-transaction">
                  {formatCurrency(avgTransaction)}
                </p>
              </div>
            </div>
            <p className="text-[#dbdfea]/40 text-xs">Platform average</p>
          </div>
        </div>

        {/* Platform Fee Revenue */}
        <div className="bg-[#24263a] rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#dbdfea]/60 text-sm mb-1">Transaction Fee Revenue</p>
              <p className="text-[#dbdfea] text-2xl font-semibold" data-testid="text-fee-revenue">
                {analytics ? formatCurrency(analytics.transactionFeeRevenue) : '$0.00'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[#dbdfea]/60 text-xs">
                {analytics ? formatNumber(analytics.completedTransactions) : '0'} transactions × $0.20
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder for charts */}
        <div className="bg-[#24263a] rounded-lg p-8 text-center">
          <TrendingUp className="size-16 text-[#dbdfea]/20 mx-auto mb-4" />
          <h3 className="text-[#dbdfea] text-lg mb-2">Analytics Dashboard</h3>
          <p className="text-[#dbdfea]/60 text-sm">
            Detailed analytics charts and insights coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
