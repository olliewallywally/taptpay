import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

const SEGMENTS = ['hospitality', 'retail', 'property', 'trades', 'other'] as const;
const STATUS_COLOR: Record<string, string> = {
  draft: 'text-[#dbdfea]', active: 'text-[#4ade80]', paused: 'text-[#fbbf24]', archived: 'text-[#94a3b8]',
};

export function Campaigns() {
  const [, setLocation] = useLocation();
  const [showNew, setShowNew] = useState(false);
  const { data: campaigns, isLoading } = useQuery<any[]>({ queryKey: ['/api/admin/campaigns'] });

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <button onClick={() => setLocation('/leads')} className="flex items-center gap-2 text-[#dbdfea] text-sm opacity-70 hover:opacity-100 mb-2" data-testid="button-campaigns-to-leads">
            <ArrowLeft className="size-4" /> Leads
          </button>
          <h1 className="text-[#dbdfea] text-xl md:text-2xl">Campaigns</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-[#0055FF] text-white rounded-lg px-3 py-2 text-sm hover:bg-[#0044cc]" data-testid="button-new-campaign">
          <Plus className="size-4" /> New campaign
        </button>
      </div>

      <div className="bg-[#24263a] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><div className="inline-block size-8 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div></div>
        ) : (campaigns || []).length === 0 ? (
          <div className="p-8 text-center text-[#dbdfea] opacity-60"><p>No campaigns yet. Create one to start a sequence.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1d1e2c]">
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Name</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Status</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal hidden sm:table-cell">Segment</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal hidden md:table-cell">Daily cap</th>
                </tr>
              </thead>
              <tbody>
                {(campaigns || []).map((c: any) => (
                  <tr key={c.id} onClick={() => setLocation(`/campaigns/${c.id}`)} className="border-b border-[#1d1e2c] hover:bg-[#1d1e2c] cursor-pointer transition-colors" data-testid={`campaign-row-${c.id}`}>
                    <td className="p-4 text-[#dbdfea] text-sm">{c.name}</td>
                    <td className={`p-4 text-sm capitalize ${STATUS_COLOR[c.status] || 'text-[#dbdfea]'}`}>{c.status}</td>
                    <td className="p-4 text-[#dbdfea] text-sm opacity-60 capitalize hidden sm:table-cell">{c.segment || '—'}</td>
                    <td className="p-4 text-[#dbdfea] text-sm opacity-60 hidden md:table-cell">{c.dailyCap}/day</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); setLocation(`/campaigns/${id}`); }} />}
    </div>
  );
}

function NewCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('');
  const [dailyCap, setDailyCap] = useState('50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await apiRequest('POST', '/api/admin/campaigns', { name, segment: segment || undefined, dailyCap: Number(dailyCap) || 50 });
      const c = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/campaigns'] });
      onCreated(c.id);
    } catch (err: any) {
      setError(err?.message?.replace(/^\d+:\s*/, '') || 'Could not create campaign');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#24263a] rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#dbdfea] text-lg">New campaign</h2>
          <button onClick={onClose} className="text-[#dbdfea] opacity-60 hover:opacity-100"><X className="size-5" /></button>
        </div>
        <div className="space-y-3 mb-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name *" className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-campaign-name" />
          <div className="grid grid-cols-2 gap-3">
            <select value={segment} onChange={(e) => setSegment(e.target.value)} className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-campaign-segment">
              <option value="">Any segment</option>
              {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="number" min={1} max={1000} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="Daily cap" className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-campaign-cap" />
          </div>
        </div>
        {error && <p className="text-[#f87171] text-sm mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[#dbdfea] text-sm px-4 py-2 hover:opacity-70">Cancel</button>
          <button onClick={submit} disabled={busy || !name.trim()} className="bg-[#0055FF] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#0044cc] disabled:opacity-40" data-testid="button-create-campaign">{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
