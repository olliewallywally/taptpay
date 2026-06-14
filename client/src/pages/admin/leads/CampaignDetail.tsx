import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Plus, Trash2, Play, Pause } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

const ENR_COLOR: Record<string, string> = {
  active: 'text-[#4ade80]', paused: 'text-[#fbbf24]', replied: 'text-[#a78bfa]', completed: 'text-[#00E5CC]',
  unsubscribed: 'text-[#f87171]', bounced: 'text-[#f87171]', failed: 'text-[#f87171]',
};

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const [, setLocation] = useLocation();
  const { data: c, isLoading } = useQuery<any>({ queryKey: [`/api/admin/campaigns/${campaignId}`] });
  const { data: leads } = useQuery<any[]>({ queryKey: ['/api/admin/leads'] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/campaigns/${campaignId}`] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
  };
  const leadName = (id: number) => (leads || []).find((l: any) => l.id === id)?.businessName || `Lead #${id}`;

  const setStatus = async (status: string) => {
    setBusy(true);
    try { await apiRequest('PATCH', `/api/admin/campaigns/${campaignId}`, { status }); invalidate(); flash(status === 'active' ? 'Activated' : status === 'paused' ? 'Paused' : 'Updated'); }
    catch (e: any) { flash(e?.message?.replace(/^\d+:\s*/, '') || 'Failed'); } finally { setBusy(false); }
  };
  const enroll = async () => {
    setBusy(true);
    try {
      const res = await apiRequest('POST', `/api/admin/campaigns/${campaignId}/enroll`, { status: 'ready' });
      const r = await res.json();
      const reasons = Object.entries(r.reasons || {}).map(([k, v]) => `${v} ${k}`).join(', ');
      flash(`Enrolled ${r.enrolled} · skipped ${r.skipped}${reasons ? ` (${reasons})` : ''}`);
      invalidate();
    } catch (e: any) { flash(e?.message?.replace(/^\d+:\s*/, '') || 'Enroll failed'); } finally { setBusy(false); }
  };
  const markReplied = async (id: number) => { await apiRequest('POST', `/api/admin/enrollments/${id}/replied`); invalidate(); };
  const delStep = async (id: number) => { if (!confirm('Remove this step?')) return; await apiRequest('DELETE', `/api/admin/campaigns/${campaignId}/steps/${id}`); invalidate(); };

  if (isLoading) {
    return <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center"><div className="size-8 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div></div>;
  }
  if (!c) {
    return <div className="min-h-screen bg-[#1a1b2e] p-6 text-[#dbdfea]"><button onClick={() => setLocation('/campaigns')} className="flex items-center gap-2 text-sm opacity-70 mb-4"><ArrowLeft className="size-4" /> Back</button>Campaign not found.</div>;
  }

  const steps = c.steps || [];
  const enrollments = c.enrollments || [];

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <button onClick={() => setLocation('/campaigns')} className="flex items-center gap-2 text-[#dbdfea] text-sm opacity-70 hover:opacity-100" data-testid="button-back-campaigns"><ArrowLeft className="size-4" /> Campaigns</button>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[#4ade80] text-sm" data-testid="text-campaign-msg">{msg}</span>}
          {c.status === 'active'
            ? <button onClick={() => setStatus('paused')} disabled={busy} className="flex items-center gap-2 bg-[#24263a] text-[#fbbf24] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] disabled:opacity-40" data-testid="button-pause-campaign"><Pause className="size-4" /> Pause</button>
            : <button onClick={() => setStatus('active')} disabled={busy || steps.length === 0} className="flex items-center gap-2 bg-[#0055FF] text-white rounded-lg px-3 py-2 text-sm hover:bg-[#0044cc] disabled:opacity-40" data-testid="button-activate-campaign"><Play className="size-4" /> Activate</button>}
        </div>
      </div>

      <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-1">{c.name}</h1>
      <p className="text-[#dbdfea] text-xs opacity-50 mb-6 capitalize">{c.status} · {c.segment || 'any segment'} · cap {c.dailyCap}/day{c.fromIdentity ? ` · from ${c.fromIdentity}` : ''}</p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Sequence */}
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-3">Sequence ({steps.length} {steps.length === 1 ? 'step' : 'steps'})</p>
          <div className="space-y-2 mb-4">
            {steps.length === 0 && <p className="text-[#dbdfea] text-sm opacity-40">No steps yet. Add the first touch below.</p>}
            {steps.map((s: any, i: number) => (
              <div key={s.id} className="bg-[#1d1e2c] rounded-lg p-3 flex items-start justify-between gap-2" data-testid={`step-${s.id}`}>
                <div className="min-w-0">
                  <p className="text-[#dbdfea] text-sm">Step {i + 1} · day {s.dayOffset} · {s.channel} · {s.source === 'lead_draft' ? 'AI draft' : 'template'}</p>
                  {s.subject && <p className="text-[#dbdfea] text-xs opacity-60 mt-1 truncate">{s.subject}</p>}
                  {s.body && <p className="text-[#dbdfea] text-xs opacity-40 mt-1 line-clamp-2">{s.body}</p>}
                </div>
                <button onClick={() => delStep(s.id)} className="text-[#dbdfea] opacity-50 hover:opacity-100 hover:text-[#f87171] shrink-0" data-testid={`button-delete-step-${s.id}`}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
          <AddStepForm campaignId={campaignId} onAdded={invalidate} />
        </div>

        {/* Enrollments */}
        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <p className="text-[#dbdfea] text-xs opacity-60">Enrollments ({enrollments.length})</p>
            <button onClick={enroll} disabled={busy || steps.length === 0} className="flex items-center gap-2 bg-[#1d1e2c] text-[#00E5CC] rounded-lg px-3 py-1.5 text-sm hover:bg-[#15161f] disabled:opacity-40" data-testid="button-enroll-ready"><Plus className="size-4" /> Enroll ready leads</button>
          </div>
          <p className="text-[#dbdfea] text-[10px] opacity-40 mb-3">Only leads with a contact, a consent basis, not suppressed (and an approved draft if step 1 uses the AI draft) are enrolled. Activate the campaign to start sending on the cron.</p>
          <div className="max-h-[420px] overflow-y-auto">
            {enrollments.length === 0 ? (
              <p className="text-[#dbdfea] text-sm opacity-40">No one enrolled yet.</p>
            ) : (
              <table className="w-full">
                <tbody>
                  {enrollments.map((e: any) => (
                    <tr key={e.id} className="border-b border-[#1d1e2c]" data-testid={`enrollment-${e.id}`}>
                      <td className="py-2 pr-2 text-[#dbdfea] text-sm">{leadName(e.leadId)}</td>
                      <td className={`py-2 px-2 text-xs capitalize whitespace-nowrap ${ENR_COLOR[e.status] || 'text-[#dbdfea]'}`}>{e.status} · s{e.currentStep}</td>
                      <td className="py-2 pl-2 text-right">{['active', 'paused'].includes(e.status) && <button onClick={() => markReplied(e.id)} className="text-[#a78bfa] text-xs hover:underline" data-testid={`button-replied-${e.id}`}>mark replied</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddStepForm({ campaignId, onAdded }: { campaignId: string; onAdded: () => void }) {
  const [dayOffset, setDayOffset] = useState('0');
  const [channel, setChannel] = useState('email');
  const [source, setSource] = useState('lead_draft');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await apiRequest('POST', `/api/admin/campaigns/${campaignId}/steps`, { dayOffset: Number(dayOffset) || 0, channel, source, subject: subject || undefined, body: body || undefined });
      setSubject(''); setBody('');
      onAdded();
    } catch (err: any) {
      setError(err?.message?.replace(/^\d+:\s*/, '') || 'Could not add step');
    } finally { setBusy(false); }
  };

  return (
    <div className="border-t border-[#1d1e2c] pt-3">
      <p className="text-[#dbdfea] text-[10px] opacity-50 mb-2">Add step</p>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <input type="number" min={0} value={dayOffset} onChange={(e) => setDayOffset(e.target.value)} title="Days after enrollment" className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-step-day" />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-step-channel"><option value="email">email</option><option value="whatsapp">whatsapp</option></select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-step-source"><option value="lead_draft">AI draft</option><option value="template">template</option></select>
      </div>
      {source === 'template' ? (
        <>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (email) — {{businessName}} ok" className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF] mb-2" data-testid="input-step-subject" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Body — use {{businessName}}, {{firstName}}, {{suburb}}…" className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF] mb-2" data-testid="textarea-step-body" />
        </>
      ) : (
        <p className="text-[#dbdfea] text-[10px] opacity-40 mb-2">Uses each lead's approved draft (from the lead's page).</p>
      )}
      {error && <p className="text-[#f87171] text-sm mb-2">{error}</p>}
      <button onClick={submit} disabled={busy} className="bg-[#0055FF] text-white rounded-lg px-3 py-1.5 text-sm hover:bg-[#0044cc] disabled:opacity-40" data-testid="button-add-step">{busy ? 'Adding…' : 'Add step'}</button>
    </div>
  );
}
