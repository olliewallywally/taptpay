import { useLocation } from 'wouter';
import { Globe, ArrowLeft, Users, Eye, MousePointer, Clock, ExternalLink, Smartphone, Monitor, Tablet, AlertCircle, TrendingUp, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface GA4Metrics {
  configured: boolean;
  error?: string;
  activeUsers?: number;
  metrics?: {
    sessions: number;
    totalUsers: number;
    pageViews: number;
    bounceRate: number;
    avgSessionDuration: number;
  };
  topPages?: { path: string; views: number }[];
  devices?: { name: string; sessions: number }[];
}

const formatDuration = (seconds: number) => {
  if (!seconds || seconds === 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const formatNumber = (n: number) =>
  new Intl.NumberFormat('en-NZ').format(n || 0);

const deviceIcon = (name: string) => {
  const n = (name || '').toLowerCase();
  if (n === 'mobile') return <Smartphone className="size-4" />;
  if (n === 'tablet') return <Tablet className="size-4" />;
  return <Monitor className="size-4" />;
};

const DEVICE_COLORS = ['#0055FF', '#00E5CC', '#10B981'];

export function WebsiteAnalytics() {
  const [, setLocation] = useLocation();
  const adminToken = localStorage.getItem('adminAuthToken');

  const { data, isLoading } = useQuery<GA4Metrics>({
    queryKey: ['/api/admin/ga4-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/admin/ga4-metrics', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error('Failed to fetch GA4 metrics');
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0055FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-[#dbdfea] mb-2">Google Analytics</h1>
            <p className="text-sm text-[#dbdfea]/60">Real-time traffic and user behaviour — last 7 days</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://analytics.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-[#0055FF] hover:bg-[#0044CC] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <ExternalLink className="size-4" />
              Open Google Analytics
            </a>
            <button
              onClick={() => setLocation('/analytics')}
              className="flex items-center gap-2 text-[#0055FF] hover:text-[#00E5CC] transition-colors"
              data-testid="button-switch-to-revenue"
            >
              <ArrowLeft className="size-4" />
              <span className="text-sm">Revenue Analytics</span>
            </button>
          </div>
        </div>

        {/* Not configured — setup guide */}
        {!data?.configured && (
          <div className="space-y-6">
            <div className="bg-[#24263a] border border-[#0055FF]/30 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="size-10 rounded-full bg-[#0055FF]/20 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="size-5 text-[#0055FF]" />
                </div>
                <div>
                  <h3 className="text-[#dbdfea] font-semibold mb-2">Connect Google Analytics Data API</h3>
                  <p className="text-[#dbdfea]/60 text-sm mb-4">
                    Your GA4 tracking is already live and collecting data (Measurement ID: G-VBGBY5E8HW). 
                    To display real-time metrics in this panel, complete the steps below.
                  </p>
                  <div className="space-y-4">
                    {[
                      {
                        step: '1',
                        title: 'Get your GA4 Property ID',
                        desc: 'In Google Analytics → Admin → Property Settings. Copy the numeric Property ID (e.g. 123456789).',
                      },
                      {
                        step: '2',
                        title: 'Create a Service Account',
                        desc: 'In Google Cloud Console → IAM & Admin → Service Accounts → Create. Download the JSON key file.',
                      },
                      {
                        step: '3',
                        title: 'Grant access to your GA4 property',
                        desc: 'In Google Analytics → Admin → Property Access Management → Add the service account email as a Viewer.',
                      },
                      {
                        step: '4',
                        title: 'Add secrets to TaptPay',
                        desc: 'Add GOOGLE_ANALYTICS_PROPERTY_ID (numeric) and GOOGLE_ANALYTICS_SERVICE_ACCOUNT (JSON key contents) to your Replit secrets.',
                      },
                    ].map(({ step, title, desc }) => (
                      <div key={step} className="flex items-start gap-3">
                        <div className="size-7 rounded-full bg-[#0055FF] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {step}
                        </div>
                        <div>
                          <p className="text-[#dbdfea] text-sm font-medium">{title}</p>
                          <p className="text-[#dbdfea]/50 text-xs mt-0.5">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tracking confirmed */}
            <div className="bg-[#24263a] border border-[#00E5CC]/20 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="size-3 rounded-full bg-[#00E5CC] animate-pulse" />
                <p className="text-[#dbdfea] text-sm">
                  <span className="font-medium text-[#00E5CC]">Tracking active</span> — GA4 tag G-VBGBY5E8HW is installed and sending data to Google Analytics right now.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {data?.configured && data?.error && (
          <div className="bg-[#24263a] border border-red-500/30 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 text-red-400" />
              <div>
                <p className="text-[#dbdfea] font-medium">GA4 API Error</p>
                <p className="text-[#dbdfea]/60 text-sm mt-1">{data.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* GA4 data display */}
        {data?.configured && !data?.error && data?.metrics && (
          <div className="space-y-6">

            {/* Active users badge */}
            <div className="bg-[#24263a] border border-[#00E5CC]/20 rounded-xl p-4 flex items-center gap-3">
              <div className="size-3 rounded-full bg-[#00E5CC] animate-pulse" />
              <p className="text-[#dbdfea] text-sm">
                <span className="font-semibold text-[#00E5CC]">{data.activeUsers ?? 0} active users</span> right now on TaptPay
              </p>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: <Users className="size-5 text-white" />, label: 'Users (7d)', value: formatNumber(data.metrics.totalUsers), sub: 'Unique visitors', gradient: true },
                { icon: <Eye className="size-5 text-[#0055FF]" />, label: 'Page Views (7d)', value: formatNumber(data.metrics.pageViews), sub: 'Total screen views' },
                { icon: <Activity className="size-5 text-[#00E5CC]" />, label: 'Sessions (7d)', value: formatNumber(data.metrics.sessions), sub: 'Browsing sessions' },
                { icon: <Clock className="size-5 text-[#0055FF]" />, label: 'Avg Session', value: formatDuration(data.metrics.avgSessionDuration), sub: `${(data.metrics.bounceRate * 100).toFixed(1)}% bounce rate` },
              ].map((m, i) => (
                <div key={i} className="bg-[#24263a] rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`size-10 rounded-full flex items-center justify-center ${m.gradient ? 'bg-gradient-to-r from-[#0055FF] to-[#00E5CC]' : 'bg-[#1d1e2c]'}`}>
                      {m.icon}
                    </div>
                    <div>
                      <p className="text-[#dbdfea]/60 text-xs">{m.label}</p>
                      <p className="text-[#dbdfea] text-xl font-semibold">{m.value}</p>
                    </div>
                  </div>
                  <p className="text-[#dbdfea]/40 text-xs">{m.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top pages table */}
              <div className="bg-[#24263a] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp className="size-4 text-[#0055FF]" />
                  <h3 className="text-[#dbdfea] font-semibold">Top Pages</h3>
                  <span className="text-[#dbdfea]/40 text-xs ml-1">last 7 days</span>
                </div>
                {(data.topPages || []).length === 0 ? (
                  <p className="text-[#dbdfea]/40 text-sm">No page data yet</p>
                ) : (
                  <div className="space-y-3">
                    {(data.topPages || []).map((page, i) => {
                      const maxViews = data.topPages![0].views;
                      const pct = maxViews > 0 ? (page.views / maxViews) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[#dbdfea]/80 text-sm truncate max-w-[200px]">{page.path}</span>
                            <span className="text-[#dbdfea] text-sm font-medium ml-2">{formatNumber(page.views)}</span>
                          </div>
                          <div className="h-1.5 bg-[#1d1e2c] rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Device breakdown */}
              <div className="bg-[#24263a] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Monitor className="size-4 text-[#00E5CC]" />
                  <h3 className="text-[#dbdfea] font-semibold">Devices</h3>
                  <span className="text-[#dbdfea]/40 text-xs ml-1">sessions by device</span>
                </div>
                {(data.devices || []).length === 0 ? (
                  <p className="text-[#dbdfea]/40 text-sm">No device data yet</p>
                ) : (
                  <>
                    <div className="h-40 mb-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.devices} barSize={40}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: '#1d1e2c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#dbdfea' }} />
                          <Bar dataKey="sessions" radius={[6, 6, 0, 0]}>
                            {(data.devices || []).map((_, idx) => (
                              <Cell key={idx} fill={DEVICE_COLORS[idx % DEVICE_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {(data.devices || []).map((d, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-[#dbdfea]/60">
                          <div className="size-2.5 rounded-full" style={{ background: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
                          <span className="capitalize">{d.name}</span>
                          <span className="text-[#dbdfea]/40">({formatNumber(d.sessions)})</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Link to full GA4 */}
            <div className="bg-[#24263a] border border-[#0055FF]/20 rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="size-5 text-[#0055FF]" />
                <div>
                  <p className="text-[#dbdfea] text-sm font-medium">Full Analytics Dashboard</p>
                  <p className="text-[#dbdfea]/50 text-xs">Audience segments, funnels, acquisition, and more</p>
                </div>
              </div>
              <a
                href="https://analytics.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[#0055FF] hover:text-[#00E5CC] text-sm transition-colors"
              >
                Open GA4 <ExternalLink className="size-4" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
