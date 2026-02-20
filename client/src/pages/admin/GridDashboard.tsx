import { useQuery } from '@tanstack/react-query';
import { DollarSign, Activity, Users, AlertCircle, TrendingUp } from 'lucide-react';
import { useLocation } from 'wouter';

interface DashboardStats {
  totalRevenue: number;
  totalTransactions: number;
  activeMerchants: number;
  pendingTransactions: number;
}

export function GridDashboard() {
  const [, setLocation] = useLocation();

  const { data: merchants, isLoading: merchantsLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/merchants'],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<any[]>({
    queryKey: ['/api/transactions'],
  });

  // Calculate stats from real data
  const stats: DashboardStats = {
    totalRevenue: transactions?.reduce((sum: number, tx: any) => sum + parseFloat(tx.amount || 0), 0) || 0,
    totalTransactions: transactions?.length || 0,
    activeMerchants: merchants?.length || 0,
    pendingTransactions: transactions?.filter((tx: any) => tx.status === 'pending').length || 0,
  };

  const isLoading = merchantsLoading || transactionsLoading;

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-[#dbdfea] mb-2">Dashboard</h1>
          <p className="text-sm text-[#dbdfea]/60">Platform overview and key metrics</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Revenue */}
          <div className="bg-[#24263a] rounded-2xl p-4 md:p-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute bottom-0 right-0 w-full h-20 bg-gradient-to-tr from-[#0055FF] to-[#00E5CC]"></div>
            </div>
            <div className="flex items-center justify-between mb-2 relative z-10">
              <p className="text-[#dbdfea] text-xs opacity-70">Total Revenue</p>
              <DollarSign className="size-4 text-[#00E5CC]" />
            </div>
            <div className="relative z-10">
              {isLoading ? (
                <div className="h-8 bg-[#1d1e2c] animate-pulse rounded"></div>
              ) : (
                <>
                  <p className="text-[#dbdfea] text-2xl md:text-3xl mb-1">${stats.totalRevenue.toFixed(2)}</p>
                  <p className="text-[#4ade80] text-xs">All time</p>
                </>
              )}
            </div>
          </div>

          {/* Total Transactions */}
          <div className="bg-[#24263a] rounded-2xl p-4 md:p-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute bottom-0 right-0 w-full h-20 bg-gradient-to-tr from-[#00E5CC] to-[#0055FF]"></div>
            </div>
            <div className="flex items-center justify-between mb-2 relative z-10">
              <p className="text-[#dbdfea] text-xs opacity-70">Total Transactions</p>
              <Activity className="size-4 text-[#0055FF]" />
            </div>
            <div className="relative z-10">
              {isLoading ? (
                <div className="h-8 bg-[#1d1e2c] animate-pulse rounded"></div>
              ) : (
                <>
                  <p className="text-[#dbdfea] text-2xl md:text-3xl mb-1">{stats.totalTransactions.toLocaleString()}</p>
                  <p className="text-[#4ade80] text-xs">All time</p>
                </>
              )}
            </div>
          </div>

          {/* Active Merchants */}
          <div className="bg-[#24263a] rounded-2xl p-4 md:p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0055FF]/10 via-transparent to-[#0055FF]/5"></div>
            <div className="flex items-center justify-between mb-2 relative z-10">
              <p className="text-[#dbdfea] text-xs opacity-70">Active Merchants</p>
              <Users className="size-4 text-[#00E5CC]" />
            </div>
            <div className="relative z-10">
              {isLoading ? (
                <div className="h-8 bg-[#1d1e2c] animate-pulse rounded"></div>
              ) : (
                <>
                  <p className="text-[#dbdfea] text-2xl md:text-3xl mb-1">{stats.activeMerchants}</p>
                  <p className="text-[#dbdfea]/60 text-xs">Verified accounts</p>
                </>
              )}
            </div>
          </div>

          {/* Pending Transactions */}
          <div className="bg-[#24263a] rounded-2xl p-4 md:p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#00E5CC]/10 via-transparent to-[#00E5CC]/5"></div>
            <div className="flex items-center justify-between mb-2 relative z-10">
              <p className="text-[#dbdfea] text-xs opacity-70">Pending Transactions</p>
              <AlertCircle className="size-4 text-[#fbbf24]" />
            </div>
            <div className="relative z-10">
              {isLoading ? (
                <div className="h-8 bg-[#1d1e2c] animate-pulse rounded"></div>
              ) : (
                <>
                  <p className="text-[#dbdfea] text-2xl md:text-3xl mb-1">{stats.pendingTransactions}</p>
                  <p className="text-[#fbbf24] text-xs">Awaiting completion</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setLocation('/admin/merchants')}
            className="bg-[#24263a] hover:bg-[#2a2c3e] rounded-2xl p-6 text-left transition-all group"
            data-testid="quick-action-merchants"
          >
            <Users className="size-8 text-[#0055FF] mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-[#dbdfea] text-lg font-medium mb-1">Manage Merchants</h3>
            <p className="text-[#dbdfea]/60 text-sm">View and manage merchant accounts</p>
          </button>

          <button
            onClick={() => setLocation('/admin/api')}
            className="bg-[#24263a] hover:bg-[#2a2c3e] rounded-2xl p-6 text-left transition-all group"
            data-testid="quick-action-api"
          >
            <TrendingUp className="size-8 text-[#00E5CC] mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-[#dbdfea] text-lg font-medium mb-1">API Management</h3>
            <p className="text-[#dbdfea]/60 text-sm">Manage API keys and integrations</p>
          </button>

          <button
            onClick={() => setLocation('/admin/analytics')}
            className="bg-[#24263a] hover:bg-[#2a2c3e] rounded-2xl p-6 text-left transition-all group"
            data-testid="quick-action-analytics"
          >
            <Activity className="size-8 text-[#0055FF] mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-[#dbdfea] text-lg font-medium mb-1">View Analytics</h3>
            <p className="text-[#dbdfea]/60 text-sm">Platform performance and insights</p>
          </button>
        </div>

        {/* Recent Merchants */}
        {!merchantsLoading && merchants && merchants.length > 0 && (
          <div className="mt-8 bg-[#24263a] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#dbdfea] text-lg font-medium">Recent Merchants</h2>
              <button
                onClick={() => setLocation('/admin/merchants')}
                className="text-[#0055FF] text-sm hover:text-[#00E5CC] transition-colors"
                data-testid="link-view-all-merchants"
              >
                View All →
              </button>
            </div>
            <div className="space-y-2">
              {merchants.slice(0, 5).map((merchant: any) => (
                <button
                  key={merchant.id}
                  onClick={() => setLocation(`/admin/merchants/${merchant.id}`)}
                  className="w-full flex items-center justify-between p-3 bg-[#1d1e2c] hover:bg-[#2a2c3e] rounded-lg transition-all text-left"
                  data-testid={`merchant-item-${merchant.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[#dbdfea] text-sm truncate">{merchant.businessName}</p>
                    <p className="text-[#dbdfea]/60 text-xs">{merchant.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {merchant.status === 'verified' ? (
                      <span className="text-[#4ade80] text-xs">✓ Verified</span>
                    ) : (
                      <span className="text-[#fbbf24] text-xs">Pending</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
