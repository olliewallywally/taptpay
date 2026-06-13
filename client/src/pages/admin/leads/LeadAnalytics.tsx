import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  new: 'bg-[#3a3c52]', enriching: 'bg-[#fbbf24]', enriched: 'bg-[#fbbf24]', ready: 'bg-[#00E5CC]',
  enrolled: 'bg-[#00E5CC]', contacted: 'bg-[#0055FF]', replied: 'bg-[#a78bfa]', converted: 'bg-[#4ade80]',
};

export function LeadAnalytics() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<any>({ queryKey: ['/api/admin/leads/analytics'] });

  if (isLoading) {
    return <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center"><div className="size-8 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div></div>;
  }
  const a = data || {};
  const funnel: any[] = a.funnel || [];
  const maxCount = Math.max(1, ...funnel.map((f) => f.count));

  const card = (label: string, value: any, color = 'text-[#dbdfea]') => (
    <div className="bg-[#24263a] rounded-lg p-4">
      <p className="text-[#dbdfea] text-xs opacity-60 mb-1">{label}</p>
      <p className={`text-2xl ${color}`}>{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <button onClick={() => setLocation('/leads')} className="flex items-center gap-2 text-[#dbdfea] text-sm opacity-70 hover:opacity-100 mb-4" data-testid="button-insights-to-leads">
        <ArrowLeft className="size-4" /> Leads
      </button>
      <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-6">Insights</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {card('Total leads', a.total ?? 0)}
        {card('Converted', a.converted ?? 0, 'text-[#4ade80]')}
        {card('Conversion rate', `${((a.conversionRate ?? 0) * 100).toFixed(1)}%`, 'text-[#0055FF]')}
        {card('Sent (7d)', a.outreach?.last7dSent ?? 0, 'text-[#00E5CC]')}
      </div>

      {/* Funnel */}
      <div className="bg-[#24263a] rounded-lg p-4 mb-6">
        <p className="text-[#dbdfea] text-xs opacity-60 mb-4">Pipeline funnel</p>
        <div className="space-y-2">
          {funnel.map((f) => (
            <div key={f.status} className="flex items-center gap-3" data-testid={`funnel-${f.status}`}>
              <span className="text-[#dbdfea] text-xs w-20 capitalize shrink-0">{f.status}</span>
              <div className="flex-1 bg-[#1d1e2c] rounded h-5 overflow-hidden">
                <div className={`h-full ${STATUS_COLOR[f.status] || 'bg-[#3a3c52]'}`} style={{ width: `${Math.round((f.count / maxCount) * 100)}%` }} />
              </div>
              <span className="text-[#dbdfea] text-sm w-10 text-right shrink-0">{f.count}</span>
            </div>
          ))}
        </div>
        <p className="text-[#dbdfea] text-[10px] opacity-40 mt-3">
          Suppressed {a.other?.suppressed ?? 0} · rejected {a.other?.rejected ?? 0}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* By segment */}
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-3">By segment</p>
          <table className="w-full">
            <thead><tr className="border-b border-[#1d1e2c]">
              <th className="text-left py-2 text-[#dbdfea] text-[10px] opacity-50 font-normal">Segment</th>
              <th className="text-right py-2 text-[#dbdfea] text-[10px] opacity-50 font-normal">Total</th>
              <th className="text-right py-2 text-[#dbdfea] text-[10px] opacity-50 font-normal">Contacted</th>
              <th className="text-right py-2 text-[#dbdfea] text-[10px] opacity-50 font-normal">Converted</th>
            </tr></thead>
            <tbody>
              {(a.bySegment || []).length === 0 ? (
                <tr><td colSpan={4} className="py-3 text-[#dbdfea] text-sm opacity-40">No leads yet.</td></tr>
              ) : (a.bySegment || []).map((s: any) => (
                <tr key={s.segment} className="border-b border-[#1d1e2c]" data-testid={`segment-${s.segment}`}>
                  <td className="py-2 text-[#dbdfea] text-sm capitalize">{s.segment}</td>
                  <td className="py-2 text-right text-[#dbdfea] text-sm opacity-70">{s.total}</td>
                  <td className="py-2 text-right text-[#0055FF] text-sm">{s.contacted}</td>
                  <td className="py-2 text-right text-[#4ade80] text-sm">{s.converted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sending */}
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-3">Sending & drafts</p>
          <div className="grid grid-cols-2 gap-3">
            {card('Total sent', a.outreach?.sent ?? 0)}
            {card('Failed', a.outreach?.failed ?? 0, 'text-[#f87171]')}
            {card('Email', a.outreach?.emailSent ?? 0)}
            {card('WhatsApp', a.outreach?.whatsappSent ?? 0)}
            {card('AI drafts', a.aiDrafts?.drafted ?? 0)}
            {card('Approved', a.aiDrafts?.approved ?? 0, 'text-[#4ade80]')}
          </div>
        </div>
      </div>

      {/* Campaigns */}
      <div className="bg-[#24263a] rounded-lg p-4">
        <p className="text-[#dbdfea] text-xs opacity-60 mb-3">Campaign performance</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-[#1d1e2c]">
              {['Campaign', 'Status', 'Enrolled', 'Sent', 'Active', 'Replied', 'Completed', 'Unsub'].map((h, i) => (
                <th key={h} className={`py-2 text-[#dbdfea] text-[10px] opacity-50 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(a.campaigns || []).length === 0 ? (
                <tr><td colSpan={8} className="py-3 text-[#dbdfea] text-sm opacity-40">No campaigns yet.</td></tr>
              ) : (a.campaigns || []).map((c: any) => (
                <tr key={c.id} onClick={() => setLocation(`/campaigns/${c.id}`)} className="border-b border-[#1d1e2c] hover:bg-[#1d1e2c] cursor-pointer" data-testid={`campaign-stat-${c.id}`}>
                  <td className="py-2 text-[#dbdfea] text-sm">{c.name}</td>
                  <td className="py-2 text-right text-[#dbdfea] text-sm opacity-70 capitalize">{c.status}</td>
                  <td className="py-2 text-right text-[#dbdfea] text-sm opacity-70">{c.enrolled}</td>
                  <td className="py-2 text-right text-[#dbdfea] text-sm opacity-70">{c.sent}</td>
                  <td className="py-2 text-right text-[#4ade80] text-sm">{c.active}</td>
                  <td className="py-2 text-right text-[#a78bfa] text-sm">{c.replied}</td>
                  <td className="py-2 text-right text-[#00E5CC] text-sm">{c.completed}</td>
                  <td className="py-2 text-right text-[#f87171] text-sm">{c.unsubscribed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
