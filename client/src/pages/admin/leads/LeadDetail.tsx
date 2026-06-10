import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Trash2, ShieldOff, Save, Sparkles } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

const CONF_COLOR: Record<string, string> = {
  high: 'text-[#4ade80]', medium: 'text-[#fbbf24]', low: 'text-[#f59e0b]', none: 'text-[#94a3b8]',
};

const STATUSES = [
  'new', 'enriching', 'enriched', 'ready', 'enrolled', 'contacted', 'replied', 'converted', 'suppressed', 'rejected',
] as const;
const SEGMENTS = ['hospitality', 'retail', 'property', 'trades', 'other'] as const;

const FIELDS: Array<{ key: string; label: string }> = [
  { key: 'businessName', label: 'Business name' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'category', label: 'Category' },
  { key: 'address', label: 'Address' },
  { key: 'suburb', label: 'Suburb' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'Region' },
  { key: 'nzbn', label: 'NZBN' },
];

export function LeadDetail({ leadId }: { leadId: string }) {
  const [, setLocation] = useLocation();
  const { data: lead, isLoading } = useQuery<any>({ queryKey: [`/api/admin/leads/${leadId}`] });
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('new');
  const [segment, setSegment] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!lead) return;
    const f: Record<string, string> = {};
    for (const { key } of FIELDS) f[key] = lead[key] ?? '';
    setForm(f);
    setStatus(lead.status || 'new');
    setSegment(lead.segment || '');
    setNotes(lead.notes ?? '');
  }, [lead]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/leads/${leadId}`] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/leads/stats'] });
  };

  const save = async () => {
    setBusy(true);
    try {
      await apiRequest('PATCH', `/api/admin/leads/${leadId}`, { ...form, status, segment: segment || undefined, notes });
      invalidate();
      flash('Saved');
    } catch (err: any) {
      flash(err?.message?.replace(/^\d+:\s*/, '') || 'Save failed');
    } finally { setBusy(false); }
  };

  const suppress = async () => {
    if (!lead?.email) { flash('No email to suppress'); return; }
    if (!confirm(`Add ${lead.email} to the do-not-contact list?`)) return;
    setBusy(true);
    try {
      await apiRequest('POST', '/api/admin/suppressions', { type: 'email', value: lead.email, reason: 'manual' });
      await apiRequest('PATCH', `/api/admin/leads/${leadId}`, { status: 'suppressed' });
      setStatus('suppressed');
      invalidate();
      flash('Suppressed');
    } catch (err: any) {
      flash(err?.message?.replace(/^\d+:\s*/, '') || 'Suppress failed');
    } finally { setBusy(false); }
  };

  const enrich = async () => {
    setBusy(true);
    try {
      await apiRequest('POST', `/api/admin/leads/${leadId}/enrich`);
      invalidate();
      flash('Enriched');
    } catch (err: any) {
      flash(err?.message?.replace(/^\d+:\s*/, '') || 'Enrich failed');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm('Delete this lead permanently?')) return;
    setBusy(true);
    try {
      await apiRequest('DELETE', `/api/admin/leads/${leadId}`);
      invalidate();
      setLocation('/leads');
    } catch (err: any) {
      flash(err?.message?.replace(/^\d+:\s*/, '') || 'Delete failed');
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center">
        <div className="size-8 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  if (!lead) {
    return (
      <div className="min-h-screen bg-[#1a1b2e] p-6 text-[#dbdfea]">
        <button onClick={() => setLocation('/leads')} className="flex items-center gap-2 text-sm opacity-70 mb-4"><ArrowLeft className="size-4" /> Back</button>
        Lead not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <button onClick={() => setLocation('/leads')} className="flex items-center gap-2 text-[#dbdfea] text-sm opacity-70 hover:opacity-100" data-testid="button-back-leads">
          <ArrowLeft className="size-4" /> Back to leads
        </button>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[#4ade80] text-sm" data-testid="text-detail-msg">{msg}</span>}
          <button onClick={enrich} disabled={busy} className="flex items-center gap-2 bg-[#24263a] text-[#00E5CC] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] disabled:opacity-40" data-testid="button-enrich-lead">
            <Sparkles className="size-4" /> Enrich
          </button>
          <button onClick={suppress} disabled={busy} className="flex items-center gap-2 bg-[#24263a] text-[#f87171] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] disabled:opacity-40" data-testid="button-suppress-lead">
            <ShieldOff className="size-4" /> Suppress
          </button>
          <button onClick={remove} disabled={busy} className="flex items-center gap-2 bg-[#24263a] text-[#dbdfea] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] disabled:opacity-40" data-testid="button-delete-lead">
            <Trash2 className="size-4" /> Delete
          </button>
          <button onClick={save} disabled={busy} className="flex items-center gap-2 bg-[#0055FF] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#0044cc] disabled:opacity-40" data-testid="button-save-lead">
            <Save className="size-4" /> {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-1">{lead.businessName}</h1>
      <p className="text-[#dbdfea] text-xs opacity-50 mb-6">
        Lead #{lead.id}{lead.consentBasis ? ` · consent: ${lead.consentBasis}` : ''}
      </p>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Pipeline status */}
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-2">Status</p>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF] mb-4" data-testid="select-lead-status">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <p className="text-[#dbdfea] text-xs opacity-60 mb-2">Segment</p>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-lead-detail-segment">
            <option value="">—</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Details */}
        <div className="bg-[#24263a] rounded-lg p-4 md:col-span-2">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-3">Details</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="text-[#dbdfea] text-[10px] opacity-50 block mb-1">{label}</label>
                <input value={form[key] ?? ''} onChange={set(key)} className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid={`input-detail-${key}`} />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <label className="text-[#dbdfea] text-[10px] opacity-50 block mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="textarea-detail-notes" />
          </div>
        </div>
      </div>

      {/* Enrichment */}
      <div className="bg-[#24263a] rounded-lg p-4 mt-4" data-testid="card-enrichment">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[#dbdfea] text-xs opacity-60">Enrichment</p>
          <span className="text-[#dbdfea] text-[10px] opacity-40">
            {lead.enrichedAt ? `last run ${new Date(lead.enrichedAt).toLocaleString('en-NZ')}` : 'not enriched yet'}
          </span>
        </div>
        <div className="grid sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[#dbdfea] text-[10px] opacity-50 mb-1">Score</p>
            <p className="text-2xl text-[#0055FF]" data-testid="text-lead-score">{lead.score ?? 0}</p>
          </div>
          <div>
            <p className="text-[#dbdfea] text-[10px] opacity-50 mb-1">Email confidence</p>
            <p className={`text-sm capitalize ${CONF_COLOR[lead.emailConfidence] || 'text-[#dbdfea]'}`} data-testid="text-email-confidence">{lead.emailConfidence || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[#dbdfea] text-[10px] opacity-50 mb-1">Socials</p>
            <div className="flex gap-3 flex-wrap">
              {lead.facebookUrl && <a href={lead.facebookUrl} target="_blank" rel="noreferrer" className="text-[#0055FF] text-sm hover:underline">Facebook</a>}
              {lead.instagramUrl && <a href={lead.instagramUrl} target="_blank" rel="noreferrer" className="text-[#0055FF] text-sm hover:underline">Instagram</a>}
              {lead.linkedinUrl && <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="text-[#0055FF] text-sm hover:underline">LinkedIn</a>}
              {!lead.facebookUrl && !lead.instagramUrl && !lead.linkedinUrl && <span className="text-[#dbdfea] text-sm opacity-40">—</span>}
            </div>
          </div>
        </div>
        {lead.signals && (
          <div className="mt-3">
            <p className="text-[#dbdfea] text-[10px] opacity-50 mb-1">Signals</p>
            <p className="text-[#dbdfea] text-sm opacity-80" data-testid="text-signals">{lead.signals}</p>
          </div>
        )}
        {lead.consentBasis && (
          <p className="text-[#dbdfea] text-[10px] opacity-40 mt-3">
            Consent basis: {lead.consentBasis}{lead.consentSourceUrl ? ` · ${lead.consentSourceUrl}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
