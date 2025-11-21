import { useLocation } from 'wouter';
import { TrendingUp, DollarSign, Activity, Users, ArrowRight } from 'lucide-react';

export function Analytics() {
  const [, setLocation] = useLocation();

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
                <p className="text-[#dbdfea] text-xl">$287,450</p>
              </div>
            </div>
            <p className="text-[#4ade80] text-xs">↑ 12.5% from last month</p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <Activity className="size-5 text-[#0055FF]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Transactions</p>
                <p className="text-[#dbdfea] text-xl">12,847</p>
              </div>
            </div>
            <p className="text-[#4ade80] text-xs">↑ 8.2% from last month</p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <Users className="size-5 text-[#00E5CC]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Active Merchants</p>
                <p className="text-[#dbdfea] text-xl">42</p>
              </div>
            </div>
            <p className="text-[#4ade80] text-xs">+3 new this month</p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <TrendingUp className="size-5 text-[#0055FF]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Avg Transaction</p>
                <p className="text-[#dbdfea] text-xl">$22.37</p>
              </div>
            </div>
            <p className="text-[#fbbf24] text-xs">↓ 2.1% from last month</p>
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
