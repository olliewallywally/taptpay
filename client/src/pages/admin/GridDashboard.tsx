import { useQuery } from '@tanstack/react-query';
import { DollarSign, Activity, Users, AlertCircle, TrendingUp } from 'lucide-react';
import { useLocation } from 'wouter';

/* The platform's totals, as the admin's own figures give them (GET /api/admin/analytics). */
interface PlatformTotals {
  totalRevenue: number;
  totalTransactions: number;
  pendingTransactions: number;
  businessesNotLoaded: number;
}

interface AdminBusiness {
  id: number;
  businessName?: string | null;
  email?: string | null;
  status?: string | null;
}

/* A reply that says OK and is not the figures must not be shown as figures (R1-T9). */
function readTotals(body: unknown): PlatformTotals {
  const totals = body as Partial<PlatformTotals> | null;
  const figures = [totals?.totalRevenue, totals?.totalTransactions, totals?.pendingTransactions, totals?.businessesNotLoaded];
  if (!totals || typeof totals !== 'object' || !figures.every((figure) => typeof figure === 'number' && Number.isFinite(figure))) {
    throw new Error('Invalid totals response');
  }
  return totals as PlatformTotals;
}

function readBusinesses(body: unknown): AdminBusiness[] {
  if (!Array.isArray(body) || !body.every((row) => row !== null && typeof row === 'object' && typeof row.id === 'number')) {
    throw new Error('Invalid businesses response');
  }
  return body as AdminBusiness[];
}

/* A business that can sign in: its email is confirmed, and it may have been activated since. */
const isVerified = (business: AdminBusiness) => business.status === 'verified' || business.status === 'active';

/* Owner decision 2026-09-30: the real totals from the admin's own data, and a plain "didn't load" when
   they don't, never a made-up $0. The page used to ask for GET /api/transactions, which the server does
   not serve, so every total read $0.00 or 0 whatever the platform held. */
export function GridDashboard() {
  const [, setLocation] = useLocation();

  const businessesQuery = useQuery<unknown, Error, AdminBusiness[]>({
    queryKey: ['/api/admin/merchants'],
    select: readBusinesses,
  });
  const totalsQuery = useQuery<unknown, Error, PlatformTotals>({
    queryKey: ['/api/admin/analytics'],
    select: readTotals,
  });

  const totals = totalsQuery.data;
  const businesses = businessesQuery.data;
  /* Failed with nothing to show. A failed background refresh keeps the figures already shown. */
  const totalsFailed = totalsQuery.isError && totals === undefined;
  const businessesFailed = businessesQuery.isError && businesses === undefined;

  /* One card's figure: a skeleton while loading, "didn't load" when it failed, else the figure and its caption. */
  const figure = (failed: boolean, value: string | undefined, caption: React.ReactNode) => {
    if (failed) return <p className="text-[#dbdfea]/60 text-sm mb-1">didn't load</p>;
    if (value === undefined) return <div className="h-8 bg-[#1d1e2c] animate-pulse rounded"></div>;
    return (
      <>
        <p className="text-[#dbdfea] text-2xl md:text-3xl mb-1">{value}</p>
        {caption}
      </>
    );
  };

  const failure = (message: string, retry: () => void) => (
    <div role="alert" className="mb-4 flex items-center justify-between gap-4 bg-[#24263a] rounded-2xl p-4 text-sm text-[#dbdfea]">
      <span>{message}</span>
      <button
        type="button"
        onClick={retry}
        className="shrink-0 rounded-lg bg-[#1d1e2c] hover:bg-[#2a2c3e] px-3 py-1.5 text-[#dbdfea] transition-colors"
      >
        Try again
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-[#dbdfea] mb-2">Dashboard</h1>
          <p className="text-sm text-[#dbdfea]/60">Platform overview and key metrics</p>
        </div>

        {totalsFailed && failure("The platform's totals didn't load.", () => { void totalsQuery.refetch(); })}
        {businessesFailed && failure("The businesses didn't load.", () => { void businessesQuery.refetch(); })}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Revenue */}
          <div className="bg-[#24263a] rounded-2xl p-4 md:p-6 relative overflow-hidden" data-testid="stat-total-revenue">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute bottom-0 right-0 w-full h-20 bg-gradient-to-tr from-[#0055FF] to-[#00E5CC]"></div>
            </div>
            <div className="flex items-center justify-between mb-2 relative z-10">
              <p className="text-[#dbdfea] text-xs opacity-70">Total Revenue</p>
              <DollarSign className="size-4 text-[#00E5CC]" />
            </div>
            <div className="relative z-10">
              {figure(totalsFailed, totals && `$${totals.totalRevenue.toFixed(2)}`, <p className="text-[#4ade80] text-xs">All time</p>)}
            </div>
          </div>

          {/* Total Transactions */}
          <div className="bg-[#24263a] rounded-2xl p-4 md:p-6 relative overflow-hidden" data-testid="stat-total-transactions">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute bottom-0 right-0 w-full h-20 bg-gradient-to-tr from-[#00E5CC] to-[#0055FF]"></div>
            </div>
            <div className="flex items-center justify-between mb-2 relative z-10">
              <p className="text-[#dbdfea] text-xs opacity-70">Total Transactions</p>
              <Activity className="size-4 text-[#0055FF]" />
            </div>
            <div className="relative z-10">
              {figure(totalsFailed, totals && totals.totalTransactions.toLocaleString(), <p className="text-[#4ade80] text-xs">All time</p>)}
            </div>
          </div>

          {/* Active Merchants */}
          <div className="bg-[#24263a] rounded-2xl p-4 md:p-6 relative overflow-hidden" data-testid="stat-active-merchants">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0055FF]/10 via-transparent to-[#0055FF]/5"></div>
            <div className="flex items-center justify-between mb-2 relative z-10">
              <p className="text-[#dbdfea] text-xs opacity-70">Active Merchants</p>
              <Users className="size-4 text-[#00E5CC]" />
            </div>
            <div className="relative z-10">
              {figure(businessesFailed, businesses && String(businesses.filter(isVerified).length), <p className="text-[#dbdfea]/60 text-xs">Verified accounts</p>)}
            </div>
          </div>

          {/* Pending Transactions */}
          <div className="bg-[#24263a] rounded-2xl p-4 md:p-6 relative overflow-hidden" data-testid="stat-pending-transactions">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#00E5CC]/10 via-transparent to-[#00E5CC]/5"></div>
            <div className="flex items-center justify-between mb-2 relative z-10">
              <p className="text-[#dbdfea] text-xs opacity-70">Pending Transactions</p>
              <AlertCircle className="size-4 text-[#fbbf24]" />
            </div>
            <div className="relative z-10">
              {figure(totalsFailed, totals && String(totals.pendingTransactions), <p className="text-[#fbbf24] text-xs">Awaiting completion</p>)}
            </div>
          </div>
        </div>

        {totals && totals.businessesNotLoaded > 0 && (
          <p role="status" className="-mt-4 mb-8 text-xs text-[#dbdfea]/60">
            Not counting {totals.businessesNotLoaded} {totals.businessesNotLoaded === 1 ? 'business' : 'businesses'} whose figures didn't load.
          </p>
        )}

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setLocation('/merchants')}
            className="bg-[#24263a] hover:bg-[#2a2c3e] rounded-2xl p-6 text-left transition-all group"
            data-testid="quick-action-merchants"
          >
            <Users className="size-8 text-[#0055FF] mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-[#dbdfea] text-lg font-medium mb-1">Manage Merchants</h3>
            <p className="text-[#dbdfea]/60 text-sm">View and manage merchant accounts</p>
          </button>

          <button
            onClick={() => setLocation('/api')}
            className="bg-[#24263a] hover:bg-[#2a2c3e] rounded-2xl p-6 text-left transition-all group"
            data-testid="quick-action-api"
          >
            <TrendingUp className="size-8 text-[#00E5CC] mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-[#dbdfea] text-lg font-medium mb-1">API Management</h3>
            <p className="text-[#dbdfea]/60 text-sm">Manage API keys and integrations</p>
          </button>

          <button
            onClick={() => setLocation('/analytics')}
            className="bg-[#24263a] hover:bg-[#2a2c3e] rounded-2xl p-6 text-left transition-all group"
            data-testid="quick-action-analytics"
          >
            <Activity className="size-8 text-[#0055FF] mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-[#dbdfea] text-lg font-medium mb-1">View Analytics</h3>
            <p className="text-[#dbdfea]/60 text-sm">Platform performance and insights</p>
          </button>
        </div>

        {/* Recent Merchants */}
        {businesses && businesses.length > 0 && (
          <div className="mt-8 bg-[#24263a] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#dbdfea] text-lg font-medium">Recent Merchants</h2>
              <button
                onClick={() => setLocation('/merchants')}
                className="text-[#0055FF] text-sm hover:text-[#00E5CC] transition-colors"
                data-testid="link-view-all-merchants"
              >
                View All →
              </button>
            </div>
            <div className="space-y-2">
              {businesses.slice(0, 5).map((merchant) => (
                <button
                  key={merchant.id}
                  onClick={() => setLocation(`/merchants/${merchant.id}`)}
                  className="w-full flex items-center justify-between p-3 bg-[#1d1e2c] hover:bg-[#2a2c3e] rounded-lg transition-all text-left"
                  data-testid={`merchant-item-${merchant.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[#dbdfea] text-sm truncate">{merchant.businessName}</p>
                    <p className="text-[#dbdfea]/60 text-xs">{merchant.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isVerified(merchant) ? (
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
