import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  ArrowLeft, DollarSign, Activity, MapPin, Mail, User, Phone, Building,
  CreditCard, CheckCircle, Send, Shield, AlertTriangle, Download, Share2,
  Receipt, Search, Edit2, Check, X, ExternalLink, Hash, Landmark,
  FileText, CalendarDays, TrendingUp, BadgeCheck, BadgeX
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ADMIN_TOKEN = () => localStorage.getItem('adminAuthToken') || '';
const ADMIN_HEADERS = () => ({ Authorization: `Bearer ${ADMIN_TOKEN()}` });

interface MerchantDetailProps { merchantId: string; }

export function MerchantDetail({ merchantId }: MerchantDetailProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // UI state
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [editingWindcaveId, setEditingWindcaveId] = useState(false);
  const [windcaveIdValue, setWindcaveIdValue] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: merchant, isLoading } = useQuery({
    queryKey: ['/api/admin/merchants', merchantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}`, { headers: ADMIN_HEADERS() });
      if (!res.ok) throw new Error('Failed to fetch merchant');
      return res.json();
    },
  });

  const { data: transactions = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/merchants', merchantId, 'transactions'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}/transactions`, { headers: ADMIN_HEADERS() });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Derived data ────────────────────────────────────────────────────────────
  const totalRevenue = transactions.reduce((s, t) => s + parseFloat(t.price || 0), 0);
  const completedTx = transactions.filter((t) => t.status === 'completed');
  const avgTransaction = transactions.length ? totalRevenue / transactions.length : 0;

  // 30-day revenue chart built from transactions
  const revenueChart = useMemo(() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days[d.toISOString().split('T')[0]] = 0;
    }
    transactions.forEach((t) => {
      if (t.status !== 'completed' || !t.createdAt) return;
      const key = new Date(t.createdAt).toISOString().split('T')[0];
      if (key in days) days[key] += parseFloat(t.price || 0);
    });
    return Object.entries(days).map(([date, revenue]) => ({
      label: new Date(date).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' }),
      revenue: parseFloat(revenue.toFixed(2)),
    }));
  }, [transactions]);

  // Filtered transaction list
  const filteredTx = useMemo(() => {
    if (!txSearch.trim()) return transactions;
    const q = txSearch.toLowerCase();
    return transactions.filter(
      (t) =>
        (t.itemName || '').toLowerCase().includes(q) ||
        (t.status || '').toLowerCase().includes(q) ||
        String(t.id).includes(q) ||
        (t.paymentMethod || '').toLowerCase().includes(q) ||
        String(parseFloat(t.price || t.amount || 0).toFixed(2)).includes(q),
    );
  }, [transactions, txSearch]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ADMIN_HEADERS() },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Merchant Verified', description: 'Account verified successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/merchants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/merchants', merchantId] });
      setShowConfirm(false);
    },
    onError: (e: any) => toast({ title: 'Verification Failed', description: e.message, variant: 'destructive' }),
  });

  const resendEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ADMIN_HEADERS() },
        body: JSON.stringify({ email: merchant.email }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => toast({ title: 'Email Sent', description: 'Verification email resent.' }),
    onError: (e: any) => toast({ title: 'Email Failed', description: e.message, variant: 'destructive' }),
  });

  const saveWindcaveIdMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}/windcave-merchant-id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...ADMIN_HEADERS() },
        body: JSON.stringify({ windcaveMerchantId: windcaveIdValue }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Windcave Merchant ID updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/merchants', merchantId] });
      setEditingWindcaveId(false);
    },
    onError: (e: any) => toast({ title: 'Save Failed', description: e.message, variant: 'destructive' }),
  });

  // ── Receipt helpers ────────────────────────────────────────────────────────
  const fetchPdfBlob = async (txId: number) => {
    const r = await fetch(`/api/transactions/${txId}/receipt-pdf`, { method: 'POST' });
    if (!r.ok) throw new Error('Failed to generate PDF');
    return r.blob();
  };

  const handleDownload = async (tx: any) => {
    setIsActioning(true);
    try {
      const blob = await fetchPdfBlob(tx.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `receipt-${tx.id}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { toast({ title: 'Download failed', variant: 'destructive' }); }
    finally { setIsActioning(false); }
  };

  const handleShare = async (tx: any) => {
    setIsActioning(true);
    try {
      const blob = await fetchPdfBlob(tx.id);
      const file = new File([blob], `receipt-${tx.id}.pdf`, { type: 'application/pdf' });
      const amount = `$${parseFloat(tx.price || tx.amount || 0).toFixed(2)}`;
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: `Receipt from ${merchant?.businessName}`, text: amount, files: [file] });
      } else { await handleDownload(tx); }
    } catch (e: any) { if (e.name !== 'AbortError') toast({ title: 'Share failed', variant: 'destructive' }); }
    finally { setIsActioning(false); }
  };

  // ── Status badge ───────────────────────────────────────────────────────────
  const statusColor = (s: string) =>
    s === 'verified' || s === 'active' ? 'bg-[#4ade80]/20 text-[#4ade80]' :
    s === 'pending' ? 'bg-[#fbbf24]/20 text-[#fbbf24]' :
    'bg-[#ef4444]/20 text-[#ef4444]';

  // ── Loading / not found ────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center">
      <div className="size-12 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!merchant) return (
    <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[#dbdfea]">Merchant not found</p>
        <button onClick={() => setLocation('/merchants')} className="mt-4 text-[#0055FF] hover:text-[#00E5CC]">Back to Merchants</button>
      </div>
    </div>
  );

  const isVerified = merchant.status === 'verified';

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6 space-y-5">

      {/* ── Back + header ── */}
      <div>
        <button onClick={() => setLocation('/merchants')} className="flex items-center gap-2 text-[#dbdfea]/60 hover:text-[#0055FF] transition-colors mb-4 text-sm">
          <ArrowLeft className="size-4" /> Back to Merchants
        </button>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[#dbdfea] text-2xl font-semibold">{merchant.businessName}</h1>
            <p className="text-[#dbdfea]/50 text-sm">{merchant.email} · ID #{merchant.id}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor(merchant.status)}`}>
            {merchant.status}
          </span>
        </div>
      </div>

      {/* ── Pending verification alert ── */}
      {!isVerified && (
        <div className="bg-[#24263a] border border-[#fbbf24]/30 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="size-5 text-[#fbbf24] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-[#dbdfea] text-sm font-medium">Pending Verification</h3>
              <p className="text-[#dbdfea]/50 text-xs mt-0.5">This merchant has not been verified. Verify them directly or resend the verification email.</p>
            </div>
          </div>
          {showConfirm ? (
            <div className="bg-[#1a1b2e] rounded-lg p-4">
              <p className="text-[#dbdfea] text-sm mb-3">Confirm verifying this merchant?</p>
              <div className="flex gap-3">
                <button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending} className="flex items-center gap-2 bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1b2e] px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  <CheckCircle className="size-4" /> {verifyMutation.isPending ? 'Verifying...' : 'Yes, Verify'}
                </button>
                <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-[#dbdfea] bg-[#24263a] hover:bg-[#2a2c42]">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setShowConfirm(true)} className="flex items-center gap-2 bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1b2e] px-4 py-2 rounded-lg text-sm font-medium">
                <Shield className="size-4" /> Verify Merchant
              </button>
              <button onClick={() => resendEmailMutation.mutate()} disabled={resendEmailMutation.isPending} className="flex items-center gap-2 bg-[#0055FF] hover:bg-[#0044cc] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                <Send className="size-4" /> {resendEmailMutation.isPending ? 'Sending...' : 'Resend Verification Email'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'from-[#0055FF] to-[#00E5CC]', text: 'text-white' },
          { label: 'Transactions', value: String(transactions.length), icon: Activity, color: 'bg-[#0055FF]/20', text: 'text-[#0055FF]' },
          { label: 'Completed', value: String(completedTx.length), icon: CheckCircle, color: 'bg-[#4ade80]/20', text: 'text-[#4ade80]' },
          { label: 'Avg Transaction', value: `$${avgTransaction.toFixed(2)}`, icon: TrendingUp, color: 'bg-[#00E5CC]/20', text: 'text-[#00E5CC]' },
        ].map(({ label, value, icon: Icon, color, text }) => (
          <div key={label} className="bg-[#24263a] rounded-xl p-4 flex items-center gap-3">
            <div className={`size-10 rounded-full ${color.includes('from') ? `bg-gradient-to-br ${color}` : color} flex items-center justify-center shrink-0`}>
              <Icon className={`size-5 ${color.includes('from') ? 'text-white' : text}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[#dbdfea]/50 text-xs truncate">{label}</p>
              <p className="text-[#dbdfea] text-lg font-semibold leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Account & Windcave integration (2-col) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Account information */}
        <div className="bg-[#24263a] rounded-xl p-5 space-y-1">
          <h2 className="text-[#dbdfea] text-base font-semibold mb-4">Account Information</h2>
          {[
            { icon: Building, label: 'Business Name', value: merchant.businessName },
            { icon: User, label: 'Account Holder', value: merchant.name },
            { icon: User, label: 'Director', value: merchant.director },
            { icon: Mail, label: 'Login Email', value: merchant.email },
            { icon: Mail, label: 'Contact Email', value: merchant.contactEmail },
            { icon: Phone, label: 'Phone', value: merchant.contactPhone || merchant.phone },
            { icon: MapPin, label: 'Business Address', value: merchant.businessAddress || merchant.address },
            { icon: Hash, label: 'GST Number', value: merchant.gstNumber },
            { icon: FileText, label: 'NZBN', value: merchant.nzbn },
            { icon: CalendarDays, label: 'Registered', value: merchant.createdAt ? new Date(merchant.createdAt).toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' }) : null },
            { icon: Activity, label: 'Business Type', value: merchant.businessType },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3 py-2 border-b border-[#1a1b2e] last:border-0">
              <Icon className="size-4 text-[#0055FF] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[#dbdfea]/50 text-xs">{label}</p>
                <p className="text-[#dbdfea] text-sm truncate">{value || '—'}</p>
              </div>
            </div>
          ))}
          {/* Email verified badge — treat active/verified merchants as email-verified */}
          {(() => {
            const isEmailVerified = merchant.emailVerified === true ||
              merchant.status === 'verified' ||
              merchant.status === 'active';
            return (
              <div className="flex items-start gap-3 py-2">
                {isEmailVerified ? (
                  <BadgeCheck className="size-4 text-[#4ade80] mt-0.5 shrink-0" />
                ) : (
                  <BadgeX className="size-4 text-[#fbbf24] mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[#dbdfea]/50 text-xs">Email Verified</p>
                  <p className={`text-sm font-medium ${isEmailVerified ? 'text-[#4ade80]' : 'text-[#fbbf24]'}`}>
                    {isEmailVerified ? 'Verified' : 'Not verified'}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Windcave integration */}
        <div className="flex flex-col gap-5">
          <div className="bg-[#24263a] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Landmark className="size-5 text-[#00E5CC]" />
              <h2 className="text-[#dbdfea] text-base font-semibold">Windcave Integration</h2>
            </div>

            {/* Windcave Merchant ID */}
            <div className="bg-[#1a1b2e] rounded-xl p-4 mb-3">
              <p className="text-[#dbdfea]/50 text-xs mb-2 uppercase tracking-wide">Windcave Merchant ID</p>
              {editingWindcaveId ? (
                <div className="flex gap-2">
                  <input
                    value={windcaveIdValue}
                    onChange={(e) => setWindcaveIdValue(e.target.value)}
                    placeholder="e.g. TaptPay_Dev"
                    className="flex-1 bg-[#24263a] text-[#dbdfea] text-sm px-3 py-2 rounded-lg border border-[#0055FF]/50 focus:outline-none focus:border-[#0055FF]"
                  />
                  <button onClick={() => saveWindcaveIdMutation.mutate()} disabled={saveWindcaveIdMutation.isPending} className="bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1b2e] px-3 py-2 rounded-lg">
                    <Check className="size-4" />
                  </button>
                  <button onClick={() => setEditingWindcaveId(false)} className="bg-[#24263a] hover:bg-[#2a2c42] text-[#dbdfea] px-3 py-2 rounded-lg">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[#dbdfea] text-sm font-mono">{merchant.windcaveMerchantId || <span className="text-[#dbdfea]/30 italic text-xs">Not set — enter after Windcave provides it</span>}</p>
                  <button
                    onClick={() => { setWindcaveIdValue(merchant.windcaveMerchantId || ''); setEditingWindcaveId(true); }}
                    className="text-[#0055FF] hover:text-[#00E5CC] transition-colors"
                  >
                    <Edit2 className="size-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Payment URL */}
            <div className="bg-[#1a1b2e] rounded-xl p-4 mb-3">
              <p className="text-[#dbdfea]/50 text-xs mb-1 uppercase tracking-wide">Payment URL</p>
              <div className="flex items-center gap-2">
                <p className="text-[#00E5CC] text-xs font-mono truncate flex-1">{merchant.paymentUrl || '—'}</p>
                {merchant.paymentUrl && (
                  <a href={merchant.paymentUrl} target="_blank" rel="noopener noreferrer" className="text-[#dbdfea]/40 hover:text-[#00E5CC]">
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Windcave API Key */}
            <div className="bg-[#1a1b2e] rounded-xl p-4">
              <p className="text-[#dbdfea]/50 text-xs mb-1 uppercase tracking-wide">Windcave API Key</p>
              <p className="text-[#dbdfea] text-sm font-mono">
                {merchant.windcaveApiKey ? '••••••••' + merchant.windcaveApiKey.slice(-4) : <span className="text-[#dbdfea]/30 italic text-xs">Not configured</span>}
              </p>
            </div>
          </div>

          {/* Quick account stats */}
          <div className="bg-[#24263a] rounded-xl p-5">
            <h2 className="text-[#dbdfea] text-base font-semibold mb-4">Platform Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Success Rate', value: transactions.length ? `${Math.round((completedTx.length / transactions.length) * 100)}%` : '—' },
                { label: 'Failed Tx', value: String(transactions.filter((t) => t.status === 'failed').length) },
                { label: 'Pending Tx', value: String(transactions.filter((t) => t.status === 'pending').length) },
                { label: 'Refunded Tx', value: String(transactions.filter((t) => t.status === 'refunded').length) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#1a1b2e] rounded-xl p-3 text-center">
                  <p className="text-[#dbdfea]/50 text-xs">{label}</p>
                  <p className="text-[#dbdfea] text-xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Revenue chart ── */}
      <div className="bg-[#24263a] rounded-xl p-5">
        <h2 className="text-[#dbdfea] text-base font-semibold mb-1">Revenue — Last 30 Days</h2>
        <p className="text-[#dbdfea]/40 text-xs mb-5">Completed transactions only</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={revenueChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0055FF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0055FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1b2e" />
            <XAxis dataKey="label" tick={{ fill: '#dbdfea', fontSize: 10, opacity: 0.4 }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fill: '#dbdfea', fontSize: 10, opacity: 0.4 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ background: '#1a1b2e', border: '1px solid #24263a', borderRadius: 8, color: '#dbdfea', fontSize: 12 }}
              formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Revenue']}
              labelStyle={{ color: '#dbdfea', opacity: 0.6 }}
            />
            <Area type="monotone" dataKey="revenue" stroke="#0055FF" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: '#00E5CC' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Full transaction history ── */}
      <div className="bg-[#24263a] rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-[#dbdfea] text-base font-semibold">Transaction History</h2>
            <p className="text-[#dbdfea]/40 text-xs mt-0.5">{transactions.length} total · {filteredTx.length} shown</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#dbdfea]/40" />
            <input
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder="Search transactions..."
              className="bg-[#1a1b2e] text-[#dbdfea] text-sm pl-9 pr-4 py-2 rounded-xl border border-[#1a1b2e] focus:border-[#0055FF] focus:outline-none w-52"
            />
          </div>
        </div>

        {filteredTx.length === 0 ? (
          <div className="text-center py-12 text-[#dbdfea]/30 text-sm">No transactions found</div>
        ) : (
          <div className="overflow-y-auto max-h-[520px] rounded-xl border border-[#1a1b2e]">
            <table className="w-full min-w-[600px]">
              <thead className="sticky top-0 bg-[#1a1b2e]">
                <tr>
                  {['#ID', 'Amount', 'Item', 'Method', 'Status', 'Date', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[#dbdfea]/40 text-xs font-normal uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTx.map((tx: any, i: number) => {
                  const amount = parseFloat(tx.price || tx.amount || 0);
                  const statusCls =
                    tx.status === 'completed' ? 'text-[#4ade80]' :
                    tx.status === 'pending' ? 'text-[#fbbf24]' :
                    tx.status === 'refunded' ? 'text-[#a78bfa]' :
                    'text-[#ef4444]';
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className={`border-t border-[#1a1b2e] cursor-pointer hover:bg-[#1a1b2e]/60 transition-colors ${i % 2 === 0 ? '' : 'bg-[#1a1b2e]/20'}`}
                    >
                      <td className="px-4 py-3 text-[#dbdfea]/40 text-xs font-mono">#{tx.id}</td>
                      <td className="px-4 py-3 text-[#dbdfea] text-sm font-semibold">${amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-[#dbdfea]/70 text-sm max-w-[160px] truncate">{tx.itemName || '—'}</td>
                      <td className="px-4 py-3 text-[#dbdfea]/50 text-xs capitalize">{(tx.paymentMethod || 'card').replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${statusCls}`}>{tx.status}</span>
                      </td>
                      <td className="px-4 py-3 text-[#dbdfea]/40 text-xs whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-[#00E5CC]/60 text-xs">View →</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Receipt modal ── */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => { if (!open) setSelectedTx(null); }}>
        <DialogContent className="bg-[#1a1b2e] border border-[#24263a] text-[#dbdfea] max-w-md w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-[#00E5CC]" /> Transaction Receipt
            </DialogTitle>
          </DialogHeader>

          {selectedTx && (() => {
            const effectiveAmount = parseFloat(selectedTx.price || selectedTx.amount || 0);
            const gst = (effectiveAmount * 0.15) / 1.15;
            const net = effectiveAmount - gst;
            return (
              <div className="space-y-4">
                {/* Details */}
                <div className="bg-[#24263a] rounded-xl p-4 space-y-2">
                  {[
                    ['Transaction ID', `#${selectedTx.id}`],
                    ['Date', new Date(selectedTx.createdAt).toLocaleString('en-NZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })],
                    ['Payment Method', (selectedTx.paymentMethod || 'card').replace(/_/g, ' ')],
                    ['Windcave Tx ID', selectedTx.windcaveTransactionId || '—'],
                    ['Status', selectedTx.status],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-[#dbdfea]/50">{k}</span>
                      <span className={k === 'Status' ? (selectedTx.status === 'completed' ? 'text-[#4ade80]' : selectedTx.status === 'pending' ? 'text-[#fbbf24]' : 'text-[#ef4444]') : 'font-mono text-xs'}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Paper receipt */}
                <div className="bg-white rounded-xl p-5 text-gray-800">
                  <div className="text-center border-b border-gray-200 pb-3 mb-3">
                    <h3 className="font-bold text-base">{merchant?.businessName}</h3>
                    {merchant?.businessAddress && <p className="text-xs text-gray-400 mt-1">{merchant.businessAddress}</p>}
                    {merchant?.contactPhone && <p className="text-xs text-gray-400">{merchant.contactPhone}</p>}
                    {merchant?.contactEmail && <p className="text-xs text-gray-400">{merchant.contactEmail}</p>}
                    {merchant?.gstNumber && <p className="text-xs text-gray-500 mt-1 font-medium">GST No: {merchant.gstNumber}</p>}
                    {merchant?.nzbn && <p className="text-xs text-gray-400">NZBN: {merchant.nzbn}</p>}
                  </div>
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Items</p>
                    <div className="flex justify-between text-sm">
                      <span>{selectedTx.itemName || 'Payment'}</span>
                      <span className="font-medium">${effectiveAmount.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-2 space-y-1">
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal (excl. GST)</span><span>${net.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">GST (15%)</span><span>${gst.toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1 mt-1"><span>Total</span><span>${effectiveAmount.toFixed(2)}</span></div>
                  </div>
                  <p className="text-center text-xs text-gray-300 mt-3">Powered by TaptPay</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button onClick={() => handleDownload(selectedTx)} disabled={isActioning} className="flex-1 bg-[#0055FF] hover:bg-[#0044dd] text-white gap-2">
                    <Download className="size-4" /> Download PDF
                  </Button>
                  <Button onClick={() => handleShare(selectedTx)} disabled={isActioning} variant="outline" className="flex-1 border-[#24263a] text-[#dbdfea] hover:bg-[#24263a] gap-2">
                    <Share2 className="size-4" /> Share
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
