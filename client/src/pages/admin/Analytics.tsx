import { useState } from 'react';
import {
  TrendingUp, DollarSign, Activity, Users, Monitor, Smartphone,
  Tablet, AlertCircle, Clock, Eye, Globe, BarChart2, Map
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  ComposableMap, Geographies, Geography, ZoomableGroup
} from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO 3166-1 alpha-2 → numeric mapping (top countries)
const ISO2_TO_NUM: Record<string, number> = {
  AF:4,AL:8,DZ:12,AD:20,AO:24,AG:28,AR:32,AM:51,AU:36,AT:40,AZ:31,BS:44,BH:48,BD:50,
  BB:52,BY:112,BE:56,BZ:84,BJ:204,BT:64,BO:68,BA:70,BW:72,BR:76,BN:96,BG:100,BF:854,
  BI:108,CV:132,KH:116,CM:120,CA:124,CF:140,TD:148,CL:152,CN:156,CO:170,KM:174,CG:178,
  CD:180,CR:188,HR:191,CU:192,CY:196,CZ:203,DK:208,DJ:262,DM:212,DO:214,EC:218,EG:818,
  SV:222,GQ:226,ER:232,EE:233,SZ:748,ET:231,FJ:242,FI:246,FR:250,GA:266,GM:270,GE:268,
  DE:276,GH:288,GR:300,GD:308,GT:320,GN:324,GW:624,GY:328,HT:332,HN:340,HU:348,IS:352,
  IN:356,ID:360,IR:364,IQ:368,IE:372,IL:376,IT:380,JM:388,JP:392,JO:400,KZ:398,KE:404,
  KI:296,KW:414,KG:417,LA:418,LV:428,LB:422,LS:426,LR:430,LY:434,LI:438,LT:440,LU:442,
  MG:450,MW:454,MY:458,MV:462,ML:466,MT:470,MH:584,MR:478,MU:480,MX:484,FM:583,MD:498,
  MC:492,MN:496,ME:499,MA:504,MZ:508,MM:104,NA:516,NR:520,NP:524,NL:528,NZ:554,NI:558,
  NE:562,NG:566,MK:807,NO:578,OM:512,PK:586,PW:585,PA:591,PG:598,PY:600,PE:604,PH:608,
  PL:616,PT:620,QA:634,RO:642,RU:643,RW:646,KN:659,LC:662,VC:670,WS:882,SM:674,ST:678,
  SA:682,SN:686,RS:688,SC:690,SL:694,SG:702,SK:703,SI:705,SB:90,SO:706,ZA:710,SS:728,
  ES:724,LK:144,SD:729,SR:740,SE:752,CH:756,SY:760,TW:158,TJ:762,TZ:834,TH:764,TL:626,
  TG:768,TO:776,TT:780,TN:788,TR:792,TM:795,TV:798,UG:800,UA:804,AE:784,GB:826,US:840,
  UY:858,UZ:860,VU:548,VE:862,VN:704,YE:887,ZM:894,ZW:716
};

const RANGE_OPTIONS = [
  { label: '7 Days', value: '7d' },
  { label: '14 Days', value: '14d' },
  { label: '30 Days', value: '30d' },
  { label: 'All Time', value: 'all' },
];

const BLUE = '#0055FF';
const TEAL = '#00E5CC';
const GREEN = '#10B981';
const PURPLE = '#8B5CF6';
const AMBER = '#F59E0B';

const fmt = (n: number) => new Intl.NumberFormat('en-NZ').format(n || 0);
const fmtNZD = (n: number) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(n || 0);
const fmtDur = (s: number) => {
  if (!s) return '0s';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

interface GA4Summary {
  configured: boolean;
  error?: string;
  activeUsers?: number;
  metrics?: {
    sessions: number; totalUsers: number; pageViews: number;
    bounceRate: number; avgSessionDuration: number;
  };
  topPages?: { path: string; views: number }[];
  devices?: { name: string; sessions: number }[];
}

interface GA4Detailed {
  configured: boolean;
  error?: string;
  daily?: { date: string; users: number; sessions: number; pageViews: number }[];
  countries?: { code: string; users: number }[];
  newUsers?: number;
  returningUsers?: number;
}

interface RevenuePoint { day: string; revenue: number; transactions: number }
interface PaymentMethod { name: string; value: number; color: string }
interface AnalyticsData {
  totalMerchants: number; activeMerchants: number; totalRevenue: number;
  totalTransactions: number; completedTransactions: number; transactionFeeRevenue: number;
}

const deviceIcon = (name: string) => {
  const n = (name || '').toLowerCase();
  if (n === 'mobile') return <Smartphone className="size-4" />;
  if (n === 'tablet') return <Tablet className="size-4" />;
  return <Monitor className="size-4" />;
};

const DEVICE_COLORS = [BLUE, TEAL, GREEN];

function WorldMap({ countries }: { countries: { code: string; users: number }[] }) {
  const [tooltip, setTooltip] = useState<{ name: string; users: number } | null>(null);
  const countryMap = new Map<number, number>();
  let maxUsers = 0;
  for (const c of countries) {
    const num = ISO2_TO_NUM[c.code];
    if (num) { countryMap.set(num, c.users); if (c.users > maxUsers) maxUsers = c.users; }
  }
  const getColor = (num: number) => {
    const users = countryMap.get(num);
    if (!users) return '#1d1e2c';
    const intensity = maxUsers > 0 ? users / maxUsers : 0;
    const r = Math.round(0 + intensity * 0);
    const g = Math.round(85 + intensity * (229 - 85));
    const b = Math.round(255 + intensity * (204 - 255));
    return `rgb(${Math.round(intensity * 0)},${Math.round(85 + intensity * 144)},${Math.round(255 - intensity * 51)})`;
  };

  return (
    <div className="relative">
      <ComposableMap
        projection="geoMercator"
        style={{ width: '100%', height: 'auto' }}
        projectionConfig={{ scale: 130, center: [0, 20] }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const num = parseInt(geo.id);
                const users = countryMap.get(num) || 0;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={getColor(num)}
                    stroke="#0a0b14"
                    strokeWidth={0.5}
                    onMouseEnter={() => setTooltip({ name: geo.properties.name, users })}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      default: { outline: 'none' },
                      hover: { fill: TEAL, outline: 'none', cursor: 'pointer' },
                      pressed: { outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      {tooltip && (
        <div className="absolute top-3 left-3 bg-[#0a0b14] border border-white/10 rounded-lg px-3 py-2 text-xs pointer-events-none">
          <p className="text-[#dbdfea] font-medium">{tooltip.name}</p>
          <p className="text-[#dbdfea]/60">{fmt(tooltip.users)} users</p>
        </div>
      )}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[#dbdfea]/40 text-xs">0</span>
        <div className="flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(to right, #1d1e2c, #0055FF, #00E5CC)' }} />
        <span className="text-[#dbdfea]/40 text-xs">{fmt(maxUsers)}</span>
      </div>
    </div>
  );
}

export function Analytics() {
  const adminToken = localStorage.getItem('adminAuthToken');
  const [range, setRange] = useState('7d');
  const [trafficView, setTrafficView] = useState<'chart' | 'map'>('chart');
  const [chartMetric, setChartMetric] = useState<'users' | 'sessions' | 'pageViews'>('users');

  const headers = { Authorization: `Bearer ${adminToken}` };

  const { data: summary, isLoading: summaryLoading } = useQuery<GA4Summary>({
    queryKey: ['/api/admin/ga4-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/admin/ga4-metrics', { headers });
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 30000,
  });

  const { data: detailed, isLoading: detailedLoading } = useQuery<GA4Detailed>({
    queryKey: ['/api/admin/ga4-detailed', range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ga4-detailed?range=${range}`, { headers });
      return res.json();
    },
    staleTime: 120000,
  });

  const { data: revenueData } = useQuery<RevenuePoint[]>({
    queryKey: ['/api/admin/revenue-over-time'],
  });

  const { data: paymentMethods } = useQuery<PaymentMethod[]>({
    queryKey: ['/api/admin/payment-method-breakdown'],
  });

  const { data: platformStats } = useQuery<AnalyticsData>({
    queryKey: ['/api/admin/analytics'],
  });

  const ga4Ok = summary?.configured && !summary?.error;
  const avgTransaction = platformStats?.totalRevenue && platformStats?.completedTransactions
    ? platformStats.totalRevenue / platformStats.completedTransactions : 0;

  const chartData = (detailed?.daily || []).map(d => ({
    ...d,
    label: d.date,
  }));

  const newVsReturn = detailed?.newUsers !== undefined ? [
    { name: 'New', value: detailed.newUsers, color: BLUE },
    { name: 'Returning', value: detailed.returningUsers || 0, color: TEAL },
  ] : [];

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6 space-y-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── SECTION 1: WEBSITE TRAFFIC ─────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-[#dbdfea]">Analytics</h1>
              <p className="text-sm text-[#dbdfea]/60 mt-1">Website traffic &amp; revenue — live data</p>
            </div>
            {/* Range selector */}
            <div className="flex items-center gap-1 bg-[#24263a] rounded-lg p-1">
              {RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRange(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    range === opt.value
                      ? 'bg-[#0055FF] text-white'
                      : 'text-[#dbdfea]/60 hover:text-[#dbdfea]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active users live badge */}
          {ga4Ok && (
            <div className="bg-[#24263a] border border-[#00E5CC]/20 rounded-xl p-4 flex items-center gap-3 mb-6">
              <div className="size-3 rounded-full bg-[#00E5CC] animate-pulse flex-shrink-0" />
              <p className="text-[#dbdfea] text-sm">
                <span className="font-semibold text-[#00E5CC]">{summary?.activeUsers ?? 0} active users</span>
                {' '}right now on TaptPay · Measurement ID: <span className="text-[#dbdfea]/50 font-mono text-xs">G-0MBNS0C2L5</span>
              </p>
            </div>
          )}

          {/* Error state */}
          {summary?.configured && summary?.error && (
            <div className="bg-[#24263a] border border-red-500/30 rounded-xl p-5 mb-6 flex items-center gap-3">
              <AlertCircle className="size-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-[#dbdfea] font-medium text-sm">GA4 Connection Error</p>
                <p className="text-[#dbdfea]/60 text-xs mt-1">{summary.error}</p>
              </div>
            </div>
          )}

          {/* Not configured */}
          {!summary?.configured && !summaryLoading && (
            <div className="bg-[#24263a] border border-[#0055FF]/30 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <AlertCircle className="size-5 text-[#0055FF] flex-shrink-0 mt-0.5" />
                <p className="text-[#dbdfea]/60 text-sm">Google Analytics service account not configured. Add <code className="text-[#00E5CC] text-xs">GOOGLE_ANALYTICS_PROPERTY_ID</code> and <code className="text-[#00E5CC] text-xs">GOOGLE_ANALYTICS_SERVICE_ACCOUNT</code> to secrets.</p>
              </div>
            </div>
          )}

          {/* Key metrics row */}
          {(summaryLoading || ga4Ok) && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[
                { icon: <Users className="size-5 text-white" />, label: `Users (${RANGE_OPTIONS.find(r=>r.value===range)?.label})`, value: summaryLoading ? '—' : fmt(summary?.metrics?.totalUsers || 0), sub: 'Unique visitors', grad: true },
                { icon: <Eye className="size-5 text-[#0055FF]" />, label: 'Page Views', value: summaryLoading ? '—' : fmt(summary?.metrics?.pageViews || 0), sub: 'Total screen views', grad: false },
                { icon: <Activity className="size-5 text-[#00E5CC]" />, label: 'Sessions', value: summaryLoading ? '—' : fmt(summary?.metrics?.sessions || 0), sub: 'Browsing sessions', grad: false },
                { icon: <Clock className="size-5 text-[#0055FF]" />, label: 'Avg Session', value: summaryLoading ? '—' : fmtDur(summary?.metrics?.avgSessionDuration || 0), sub: `${((summary?.metrics?.bounceRate || 0) * 100).toFixed(1)}% bounce rate`, grad: false },
                { icon: <TrendingUp className="size-5 text-[#00E5CC]" />, label: 'New Users', value: detailedLoading ? '—' : fmt(detailed?.newUsers || 0), sub: `${fmt(detailed?.returningUsers || 0)} returning`, grad: false },
              ].map((m, i) => (
                <div key={i} className="bg-[#24263a] rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`size-9 rounded-full flex items-center justify-center flex-shrink-0 ${m.grad ? 'bg-gradient-to-r from-[#0055FF] to-[#00E5CC]' : 'bg-[#1d1e2c]'}`}>
                      {m.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#dbdfea]/50 text-xs truncate">{m.label}</p>
                      <p className="text-[#dbdfea] text-lg font-semibold leading-tight">{m.value}</p>
                    </div>
                  </div>
                  <p className="text-[#dbdfea]/40 text-xs">{m.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* Traffic chart + view toggle */}
          {ga4Ok && (
            <div className="bg-[#24263a] rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <h3 className="text-[#dbdfea] font-semibold">Traffic Over Time</h3>
                  {trafficView === 'chart' && (
                    <div className="flex items-center gap-1 bg-[#1d1e2c] rounded-lg p-0.5">
                      {(['users','sessions','pageViews'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setChartMetric(m)}
                          className={`px-2.5 py-1 rounded-md text-xs transition-colors ${chartMetric === m ? 'bg-[#0055FF] text-white' : 'text-[#dbdfea]/50 hover:text-[#dbdfea]'}`}
                        >
                          {m === 'users' ? 'Users' : m === 'sessions' ? 'Sessions' : 'Views'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 bg-[#1d1e2c] rounded-lg p-0.5">
                  <button
                    onClick={() => setTrafficView('chart')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${trafficView === 'chart' ? 'bg-[#0055FF] text-white' : 'text-[#dbdfea]/50 hover:text-[#dbdfea]'}`}
                  >
                    <BarChart2 className="size-3.5" /> Chart
                  </button>
                  <button
                    onClick={() => setTrafficView('map')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${trafficView === 'map' ? 'bg-[#0055FF] text-white' : 'text-[#dbdfea]/50 hover:text-[#dbdfea]'}`}
                  >
                    <Map className="size-3.5" /> World Map
                  </button>
                </div>
              </div>

              {trafficView === 'chart' ? (
                detailedLoading ? (
                  <div className="h-56 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-[#0055FF] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center">
                    <p className="text-[#dbdfea]/40 text-sm">No data yet — check back in 24–48 hours as GA4 processes new traffic</p>
                  </div>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={BLUE} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: '#0a0b14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#dbdfea', fontSize: 12 }}
                          labelStyle={{ color: '#dbdfea', marginBottom: 4 }}
                        />
                        <Area type="monotone" dataKey={chartMetric} stroke={BLUE} strokeWidth={2} fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: TEAL }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )
              ) : (
                <div>
                  {detailedLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-[#0055FF] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      <WorldMap countries={detailed?.countries || []} />
                      {(detailed?.countries || []).length > 0 && (
                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {(detailed?.countries || []).slice(0, 6).map((c, i) => (
                            <div key={i} className="flex items-center justify-between bg-[#1d1e2c] rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Globe className="size-3.5 text-[#0055FF]" />
                                <span className="text-[#dbdfea]/70 text-xs">{c.code}</span>
                              </div>
                              <span className="text-[#dbdfea] text-xs font-medium">{fmt(c.users)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Top Pages + Devices + New vs Returning */}
          {ga4Ok && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-2">
              {/* Top Pages */}
              <div className="bg-[#24263a] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="size-4 text-[#0055FF]" />
                  <h3 className="text-[#dbdfea] font-semibold text-sm">Top Pages</h3>
                </div>
                {(summary?.topPages || []).length === 0 ? (
                  <p className="text-[#dbdfea]/40 text-sm">No page data yet</p>
                ) : (
                  <div className="space-y-3">
                    {(summary?.topPages || []).map((page, i) => {
                      const max = summary!.topPages![0].views;
                      const pct = max > 0 ? (page.views / max) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[#dbdfea]/70 text-xs truncate max-w-[150px]">{page.path}</span>
                            <span className="text-[#dbdfea] text-xs font-medium ml-2">{fmt(page.views)}</span>
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

              {/* Devices */}
              <div className="bg-[#24263a] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Monitor className="size-4 text-[#00E5CC]" />
                  <h3 className="text-[#dbdfea] font-semibold text-sm">Devices</h3>
                </div>
                {(summary?.devices || []).length === 0 ? (
                  <p className="text-[#dbdfea]/40 text-sm">No device data yet</p>
                ) : (
                  <>
                    <div className="h-36 mb-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={summary?.devices} barSize={32}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: '#0a0b14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#dbdfea', fontSize: 12 }} />
                          <Bar dataKey="sessions" radius={[5, 5, 0, 0]}>
                            {(summary?.devices || []).map((_, idx) => (
                              <Cell key={idx} fill={DEVICE_COLORS[idx % DEVICE_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(summary?.devices || []).map((d, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-[#dbdfea]/60">
                          <div className="size-2 rounded-full" style={{ background: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
                          <span className="capitalize">{d.name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* New vs Returning */}
              <div className="bg-[#24263a] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="size-4 text-[#0055FF]" />
                  <h3 className="text-[#dbdfea] font-semibold text-sm">New vs Returning</h3>
                </div>
                {newVsReturn.length === 0 || (newVsReturn[0].value === 0 && newVsReturn[1].value === 0) ? (
                  <p className="text-[#dbdfea]/40 text-sm">No data yet</p>
                ) : (
                  <>
                    <div className="h-36 mb-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={newVsReturn} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={3}>
                            {newVsReturn.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: '#0a0b14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#dbdfea', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4">
                      {newVsReturn.map((e, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-[#dbdfea]/60">
                          <div className="size-2 rounded-full" style={{ background: e.color }} />
                          <span>{e.name}: {fmt(e.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── DIVIDER ─────────────────────────────────────────── */}
        <div className="border-t border-white/10" />

        {/* ── SECTION 2: REVENUE & PLATFORM ───────────────────── */}
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[#dbdfea]">Revenue &amp; Platform</h2>
            <p className="text-sm text-[#dbdfea]/60 mt-1">Transaction data and platform performance</p>
          </div>

          {/* Revenue key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { icon: <DollarSign className="size-5 text-white" />, label: 'Total Revenue', value: fmtNZD(platformStats?.totalRevenue || 0), sub: 'All completed transactions', grad: true },
              { icon: <Activity className="size-5 text-[#0055FF]" />, label: 'Transactions', value: fmt(platformStats?.totalTransactions || 0), sub: `${fmt(platformStats?.completedTransactions || 0)} completed`, grad: false },
              { icon: <Users className="size-5 text-[#00E5CC]" />, label: 'Active Merchants', value: fmt(platformStats?.activeMerchants || 0), sub: `of ${fmt(platformStats?.totalMerchants || 0)} total`, grad: false },
              { icon: <TrendingUp className="size-5 text-[#0055FF]" />, label: 'Avg Transaction', value: fmtNZD(avgTransaction), sub: 'Platform average', grad: false },
              { icon: <DollarSign className="size-5 text-[#00E5CC]" />, label: 'Fee Revenue', value: fmtNZD(platformStats?.transactionFeeRevenue || 0), sub: `${fmt(platformStats?.completedTransactions || 0)} × $0.20`, grad: false },
            ].map((m, i) => (
              <div key={i} className="bg-[#24263a] rounded-xl p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`size-9 rounded-full flex items-center justify-center flex-shrink-0 ${m.grad ? 'bg-gradient-to-r from-[#0055FF] to-[#00E5CC]' : 'bg-[#1d1e2c]'}`}>
                    {m.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#dbdfea]/50 text-xs truncate">{m.label}</p>
                    <p className="text-[#dbdfea] text-lg font-semibold leading-tight">{m.value}</p>
                  </div>
                </div>
                <p className="text-[#dbdfea]/40 text-xs">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue chart + payment methods */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue over time */}
            <div className="bg-[#24263a] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="size-4 text-[#0055FF]" />
                <h3 className="text-[#dbdfea] font-semibold">Revenue — Last 7 Days</h3>
              </div>
              {!revenueData || revenueData.length === 0 ? (
                <div className="h-48 flex items-center justify-center">
                  <p className="text-[#dbdfea]/40 text-sm">No revenue data yet</p>
                </div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={TEAL} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} tickFormatter={v => `$${v}`} />
                      <Tooltip
                        contentStyle={{ background: '#0a0b14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#dbdfea', fontSize: 12 }}
                        formatter={(v: number) => [fmtNZD(v), 'Revenue']}
                      />
                      <Area type="monotone" dataKey="revenue" stroke={TEAL} strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: BLUE }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Payment methods */}
            <div className="bg-[#24263a] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart2 className="size-4 text-[#00E5CC]" />
                <h3 className="text-[#dbdfea] font-semibold">Payment Methods</h3>
              </div>
              {!paymentMethods || paymentMethods.length === 0 ? (
                <div className="h-48 flex items-center justify-center">
                  <p className="text-[#dbdfea]/40 text-sm">No transaction data yet</p>
                </div>
              ) : (
                <>
                  <div className="h-40 mb-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={paymentMethods} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }} barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} width={80} />
                        <Tooltip contentStyle={{ background: '#0a0b14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#dbdfea', fontSize: 12 }} />
                        <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                          {paymentMethods.map((pm, i) => <Cell key={i} fill={pm.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {paymentMethods.map((pm, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-[#dbdfea]/60">
                        <div className="size-2 rounded-full" style={{ background: pm.color }} />
                        <span>{pm.name}: {pm.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
