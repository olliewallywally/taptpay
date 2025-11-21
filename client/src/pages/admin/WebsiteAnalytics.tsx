import { useLocation } from 'wouter';
import { Globe, ArrowLeft, Eye, Users, MousePointer, Clock } from 'lucide-react';

export function WebsiteAnalytics() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-[#dbdfea] mb-2">Website Analytics</h1>
            <p className="text-sm text-[#dbdfea]/60">Traffic and user behavior insights</p>
          </div>
          <button
            onClick={() => setLocation('/admin/analytics')}
            className="flex items-center gap-2 text-[#0055FF] hover:text-[#00E5CC] transition-colors"
            data-testid="button-switch-to-revenue"
          >
            <ArrowLeft className="size-4" />
            <span className="text-sm">Revenue Analytics</span>
          </button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC] flex items-center justify-center">
                <Eye className="size-5 text-white" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Page Views</p>
                <p className="text-[#dbdfea] text-xl">45,678</p>
              </div>
            </div>
            <p className="text-[#4ade80] text-xs">↑ 15.3% this week</p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <Users className="size-5 text-[#0055FF]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Unique Visitors</p>
                <p className="text-[#dbdfea] text-xl">12,345</p>
              </div>
            </div>
            <p className="text-[#4ade80] text-xs">↑ 8.7% this week</p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <MousePointer className="size-5 text-[#00E5CC]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Click Rate</p>
                <p className="text-[#dbdfea] text-xl">67.8%</p>
              </div>
            </div>
            <p className="text-[#fbbf24] text-xs">↓ 2.3% this week</p>
          </div>

          <div className="bg-[#24263a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
                <Clock className="size-5 text-[#0055FF]" />
              </div>
              <div>
                <p className="text-[#dbdfea]/60 text-xs">Avg Session</p>
                <p className="text-[#dbdfea] text-xl">4m 32s</p>
              </div>
            </div>
            <p className="text-[#4ade80] text-xs">↑ 12.1% this week</p>
          </div>
        </div>

        {/* Placeholder for charts */}
        <div className="bg-[#24263a] rounded-lg p-8 text-center">
          <Globe className="size-16 text-[#dbdfea]/20 mx-auto mb-4" />
          <h3 className="text-[#dbdfea] text-lg mb-2">Website Analytics Dashboard</h3>
          <p className="text-[#dbdfea]/60 text-sm">
            Detailed website analytics and visitor insights coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
