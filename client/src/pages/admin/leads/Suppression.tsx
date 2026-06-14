import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

const REASON_COLOR: Record<string, string> = {
  unsubscribed: 'text-[#a78bfa]', bounced: 'text-[#fbbf24]', complained: 'text-[#f87171]',
  manual: 'text-[#dbdfea]', converted: 'text-[#4ade80]',
};

export function Suppression() {
  const [, setLocation] = useLocation();
  const { data: rows, isLoading } = useQuery<any[]>({ queryKey: ['/api/admin/suppressions'] });
  const [type, setType] = useState('email');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('manual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/api/admin/suppressions'] });

  const add = async () => {
    if (!value.trim()) return;
    setBusy(true); setError('');
    try {
      await apiRequest('POST', '/api/admin/suppressions', { type, value, reason });
      setValue('');
      invalidate();
    } catch (err: any) {
      setError(err?.message?.replace(/^\d+:\s*/, '') || 'Could not add');
    } finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Remove from the suppression list? They become contactable again.')) return;
    await apiRequest('DELETE', `/api/admin/suppressions/${id}`);
    invalidate();
  };

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <button onClick={() => setLocation('/leads')} className="flex items-center gap-2 text-[#dbdfea] text-sm opacity-70 hover:opacity-100 mb-4" data-testid="button-back-from-suppression">
        <ArrowLeft className="size-4" /> Back to leads
      </button>

      <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-1">Suppression list</h1>
      <p className="text-[#dbdfea] text-xs opacity-60 mb-6">
        Do-not-contact list. Every outreach send is checked against this — unsubscribes, bounces and complaints land here automatically.
      </p>

      {/* Add */}
      <div className="bg-[#24263a] rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <select value={type} onChange={(e) => setType(e.target.value)} className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-suppression-type">
            <option value="email">Email</option>
            <option value="domain">Domain</option>
            <option value="phone">Phone</option>
          </select>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value to suppress" className="flex-1 bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-suppression-value" />
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-suppression-reason">
            <option value="manual">Manual</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
            <option value="complained">Complained</option>
            <option value="converted">Converted</option>
          </select>
          <button onClick={add} disabled={busy || !value.trim()} className="flex items-center gap-2 bg-[#0055FF] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#0044cc] disabled:opacity-40" data-testid="button-add-suppression">
            <Plus className="size-4" /> Add
          </button>
        </div>
        {error && <p className="text-[#f87171] text-sm mt-3" data-testid="text-suppression-error">{error}</p>}
      </div>

      {/* List */}
      <div className="bg-[#24263a] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block size-8 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (rows || []).length === 0 ? (
          <div className="p-8 text-center text-[#dbdfea] opacity-60"><p>Nothing suppressed yet.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1d1e2c]">
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Value</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Type</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Reason</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {(rows || []).map((r: any) => (
                  <tr key={r.id} className="border-b border-[#1d1e2c]" data-testid={`suppression-row-${r.id}`}>
                    <td className="p-4 text-[#dbdfea] text-sm">{r.value}</td>
                    <td className="p-4 text-[#dbdfea] text-sm opacity-60 capitalize">{r.type}</td>
                    <td className={`p-4 text-sm capitalize ${REASON_COLOR[r.reason] || 'text-[#dbdfea]'}`}>{r.reason}</td>
                    <td className="p-4 text-right">
                      <button onClick={() => remove(r.id)} className="text-[#dbdfea] opacity-50 hover:opacity-100 hover:text-[#f87171]" data-testid={`button-remove-suppression-${r.id}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
