import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Search, Plus, Upload, ShieldOff, X, Radar, Sparkles, PenLine, Send } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

const SEGMENTS = ['hospitality', 'retail', 'property', 'trades', 'other'] as const;
const STATUSES = [
  'new', 'enriching', 'enriched', 'ready', 'enrolled', 'contacted', 'replied', 'converted', 'suppressed', 'rejected',
] as const;

const STATUS_COLOR: Record<string, string> = {
  new: 'text-[#dbdfea]', enriching: 'text-[#fbbf24]', enriched: 'text-[#fbbf24]', ready: 'text-[#00E5CC]',
  enrolled: 'text-[#00E5CC]', contacted: 'text-[#0055FF]', replied: 'text-[#a78bfa]', converted: 'text-[#4ade80]',
  suppressed: 'text-[#f87171]', rejected: 'text-[#94a3b8]',
};

export function LeadsList() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [segmentFilter, setSegmentFilter] = useState<string>('');
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState('');

  const { data: leads, isLoading } = useQuery<any[]>({ queryKey: ['/api/admin/leads'] });
  const { data: stats } = useQuery<{ total: number; counts: Record<string, number> }>({
    queryKey: ['/api/admin/leads/stats'],
  });

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return (leads || []).filter((l: any) =>
      (!statusFilter || l.status === statusFilter) &&
      (!segmentFilter || l.segment === segmentFilter) &&
      (!q ||
        l.businessName?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.domain?.toLowerCase().includes(q) ||
        l.suburb?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q))
    );
  }, [leads, searchQuery, statusFilter, segmentFilter]);

  const counts = stats?.counts || {};

  const runEnrich = async () => {
    setEnriching(true); setEnrichMsg('');
    try {
      const res = await apiRequest('POST', '/api/admin/leads/enrich', { status: 'new', limit: 10 });
      const r = await res.json();
      setEnrichMsg(`Enriched ${r.processed} · ${r.withEmail} with email · ${r.failed} failed`);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads/stats'] });
    } catch (err: any) {
      setEnrichMsg(err?.message?.replace(/^\d+:\s*/, '') || 'Enrich failed');
    } finally { setEnriching(false); }
  };

  const runDraft = async () => {
    setDrafting(true); setDraftMsg('');
    try {
      const res = await apiRequest('POST', '/api/admin/leads/personalize', { status: 'ready', limit: 8 });
      const r = await res.json();
      setDraftMsg(`Drafted ${r.drafted}/${r.processed}${r.usedAi ? '' : ' (template — set ANTHROPIC_API_KEY for AI)'}`);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
    } catch (err: any) {
      setDraftMsg(err?.message?.replace(/^\d+:\s*/, '') || 'Draft failed');
    } finally { setDrafting(false); }
  };

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-[#dbdfea] text-xl md:text-2xl">Leads</h1>
          <p className="text-[#dbdfea] text-xs opacity-60 mt-1">
            {stats?.total ?? leads?.length ?? 0} in pipeline
          </p>
          {enrichMsg && <p className="text-[#00E5CC] text-xs mt-1" data-testid="text-enrich-msg">{enrichMsg}</p>}
          {draftMsg && <p className="text-[#00E5CC] text-xs mt-1" data-testid="text-draft-msg">{draftMsg}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setLocation('/suppression')}
            className="flex items-center gap-2 bg-[#24263a] text-[#dbdfea] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] transition-colors"
            data-testid="button-suppression-list"
          >
            <ShieldOff className="size-4" /> Suppression
          </button>
          <button
            onClick={() => setLocation('/campaigns')}
            className="flex items-center gap-2 bg-[#24263a] text-[#dbdfea] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] transition-colors"
            data-testid="button-campaigns"
          >
            <Send className="size-4" /> Campaigns
          </button>
          <button
            onClick={runEnrich}
            disabled={enriching}
            className="flex items-center gap-2 bg-[#24263a] text-[#00E5CC] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] transition-colors disabled:opacity-40"
            data-testid="button-enrich-new"
          >
            <Sparkles className="size-4" /> {enriching ? 'Enriching…' : 'Enrich new'}
          </button>
          <button
            onClick={runDraft}
            disabled={drafting}
            className="flex items-center gap-2 bg-[#24263a] text-[#00E5CC] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] transition-colors disabled:opacity-40"
            data-testid="button-draft-ready"
          >
            <PenLine className="size-4" /> {drafting ? 'Drafting…' : 'Draft ready'}
          </button>
          <button
            onClick={() => setShowSource(true)}
            className="flex items-center gap-2 bg-[#24263a] text-[#dbdfea] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] transition-colors"
            data-testid="button-find-leads"
          >
            <Radar className="size-4" /> Find leads
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-[#24263a] text-[#dbdfea] rounded-lg px-3 py-2 text-sm hover:bg-[#1d1e2c] transition-colors"
            data-testid="button-import-leads"
          >
            <Upload className="size-4" /> Import CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-[#0055FF] text-white rounded-lg px-3 py-2 text-sm hover:bg-[#0044cc] transition-colors"
            data-testid="button-add-lead"
          >
            <Plus className="size-4" /> Add lead
          </button>
        </div>
      </div>

      {/* Pipeline overview */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        {(['new', 'ready', 'contacted', 'replied', 'converted'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={`bg-[#24263a] rounded-lg p-3 text-left transition-colors ${statusFilter === s ? 'ring-2 ring-[#0055FF]' : 'hover:bg-[#1d1e2c]'}`}
            data-testid={`stat-${s}`}
          >
            <p className="text-[#dbdfea] text-[10px] opacity-60 capitalize mb-1">{s}</p>
            <p className={`text-xl ${STATUS_COLOR[s]}`}>{counts[s] || 0}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#dbdfea] opacity-60" />
          <input
            type="text"
            placeholder="Search business, email, domain, location…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#24263a] text-[#dbdfea] rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]"
            data-testid="input-search-leads"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#24263a] text-[#dbdfea] rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]"
          data-testid="select-status-filter"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          className="bg-[#24263a] text-[#dbdfea] rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]"
          data-testid="select-segment-filter"
        >
          <option value="">All segments</option>
          {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#24263a] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block size-8 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[#dbdfea] text-sm mt-4">Loading leads…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-[#dbdfea] opacity-60">
            <p>No leads yet. Import a CSV or add one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1d1e2c]">
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Business</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal hidden md:table-cell">Email</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal hidden lg:table-cell">Segment</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal hidden sm:table-cell">Location</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead: any) => (
                  <tr
                    key={lead.id}
                    onClick={() => setLocation(`/leads/${lead.id}`)}
                    className="border-b border-[#1d1e2c] hover:bg-[#1d1e2c] cursor-pointer transition-colors"
                    data-testid={`lead-row-${lead.id}`}
                  >
                    <td className="p-4">
                      <p className="text-[#dbdfea] text-sm">{lead.businessName}</p>
                      {lead.domain && <p className="text-[#dbdfea] text-xs opacity-50">{lead.domain}</p>}
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <p className="text-[#dbdfea] text-sm opacity-60">{lead.email || '—'}</p>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <p className="text-[#dbdfea] text-sm opacity-60 capitalize">{lead.segment || '—'}</p>
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <p className="text-[#dbdfea] text-sm opacity-60">{lead.suburb || lead.city || '—'}</p>
                    </td>
                    <td className="p-4">
                      <span className={`text-sm capitalize ${STATUS_COLOR[lead.status] || 'text-[#dbdfea]'}`}>{lead.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} />}
      {showSource && <SourceModal onClose={() => setShowSource(false)} />}
    </div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [segment, setSegment] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ found: number; imported: number; duplicates: number } | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(file);
  };

  const submit = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await apiRequest('POST', '/api/admin/leads/import', {
        csv,
        segment: segment || undefined,
        label: label || undefined,
      });
      const body = await res.json();
      setResult(body);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads/stats'] });
    } catch (err: any) {
      setError(err?.message?.replace(/^\d+:\s*/, '') || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Import leads from CSV" onClose={onClose}>
      <p className="text-[#dbdfea] text-xs opacity-60 mb-3">
        Include a header row. Recognised columns: business name, email, phone, website, category, contact, address, suburb, city, region, nzbn.
      </p>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm hover:bg-[#15161f]"
          data-testid="button-choose-csv-file"
        >
          <Upload className="size-4" /> Choose .csv file
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </div>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={'business name,email,suburb\nJoe\'s Cafe,hi@joescafe.co.nz,Newtown'}
        rows={8}
        className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0055FF] mb-3"
        data-testid="textarea-csv"
      />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-import-segment">
          <option value="">Segment (auto-detect)</option>
          {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Batch label (optional)" className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-import-label" />
      </div>

      {error && <p className="text-[#f87171] text-sm mb-3" data-testid="text-import-error">{error}</p>}
      {result && (
        <p className="text-[#4ade80] text-sm mb-3" data-testid="text-import-result">
          Imported {result.imported} · {result.duplicates} duplicate(s) skipped · {result.found} rows found.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-[#dbdfea] text-sm px-4 py-2 hover:opacity-70">
          {result ? 'Done' : 'Cancel'}
        </button>
        <button
          onClick={submit}
          disabled={busy || !csv.trim()}
          className="bg-[#0055FF] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#0044cc] disabled:opacity-40"
          data-testid="button-submit-import"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
    </ModalShell>
  );
}

function AddLeadModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ businessName: '', email: '', website: '', phone: '', suburb: '', segment: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await apiRequest('POST', '/api/admin/leads', {
        businessName: form.businessName,
        email: form.email || undefined,
        website: form.website || undefined,
        phone: form.phone || undefined,
        suburb: form.suburb || undefined,
        segment: form.segment || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads/stats'] });
      onClose();
    } catch (err: any) {
      setError(err?.message?.replace(/^\d+:\s*/, '') || 'Could not add lead');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Add a lead" onClose={onClose}>
      <div className="space-y-3 mb-4">
        <input value={form.businessName} onChange={set('businessName')} placeholder="Business name *" className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-lead-name" />
        <input value={form.email} onChange={set('email')} placeholder="Email" className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-lead-email" />
        <input value={form.website} onChange={set('website')} placeholder="Website" className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-lead-website" />
        <div className="grid grid-cols-2 gap-3">
          <input value={form.phone} onChange={set('phone')} placeholder="Phone" className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-lead-phone" />
          <input value={form.suburb} onChange={set('suburb')} placeholder="Suburb" className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-lead-suburb" />
        </div>
        <select value={form.segment} onChange={set('segment')} className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-lead-segment">
          <option value="">Segment (auto-detect)</option>
          {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <p className="text-[#f87171] text-sm mb-3" data-testid="text-add-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-[#dbdfea] text-sm px-4 py-2 hover:opacity-70">Cancel</button>
        <button onClick={submit} disabled={busy || !form.businessName.trim()} className="bg-[#0055FF] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#0044cc] disabled:opacity-40" data-testid="button-submit-lead">
          {busy ? 'Adding…' : 'Add lead'}
        </button>
      </div>
    </ModalShell>
  );
}

function SourceModal({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState('overpass');
  const [segment, setSegment] = useState<string>('hospitality');
  const [region, setRegion] = useState('');
  const [limit, setLimit] = useState('50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ found: number; imported: number; duplicates: number; message?: string } | null>(null);

  const { data: sources } = useQuery<any[]>({ queryKey: ['/api/admin/lead-sources'] });

  const submit = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await apiRequest('POST', '/api/admin/leads/source', {
        provider,
        segment: segment || undefined,
        region: provider === 'overpass' ? region || undefined : undefined,
        searchTerm: provider === 'nzbn' ? region || undefined : undefined,
        limit: Number(limit) || 50,
      });
      setResult(await res.json());
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/leads/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lead-sources'] });
    } catch (err: any) {
      setError(err?.message?.replace(/^\d+:\s*/, '') || 'Search failed');
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="Find leads" onClose={onClose}>
      <p className="text-[#dbdfea] text-xs opacity-60 mb-3">
        Pull businesses straight into the pipeline. Overpass (OpenStreetMap) is free, needs no key, and is strong for NZ cafés, retail and tradies. NZBN needs an API key.
      </p>
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-source-provider">
            <option value="overpass">Overpass (OpenStreetMap)</option>
            <option value="nzbn">NZBN register</option>
          </select>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className="bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="select-source-segment">
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder={provider === 'overpass' ? 'Region, e.g. Wellington' : 'Search term, e.g. café'}
          className="w-full bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]"
          data-testid="input-source-region"
        />
        <div>
          <label className="text-[#dbdfea] text-[10px] opacity-50 block mb-1">Max results</label>
          <input type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(e.target.value)} className="w-32 bg-[#1d1e2c] text-[#dbdfea] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]" data-testid="input-source-limit" />
        </div>
      </div>

      {error && <p className="text-[#f87171] text-sm mb-3" data-testid="text-source-error">{error}</p>}
      {result && (
        <p className="text-[#4ade80] text-sm mb-3" data-testid="text-source-result">
          {result.message ? result.message + ' ' : ''}Imported {result.imported} · {result.duplicates} duplicate(s) · {result.found} found.
        </p>
      )}

      <div className="flex justify-end gap-2 mb-4">
        <button onClick={onClose} className="text-[#dbdfea] text-sm px-4 py-2 hover:opacity-70">{result ? 'Done' : 'Cancel'}</button>
        <button onClick={submit} disabled={busy || !region.trim()} className="bg-[#0055FF] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#0044cc] disabled:opacity-40" data-testid="button-run-source">
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>

      {(sources || []).length > 0 && (
        <div className="border-t border-[#1d1e2c] pt-3">
          <p className="text-[#dbdfea] text-[10px] opacity-50 mb-2">Recent sources</p>
          <div className="space-y-1">
            {(sources || []).slice(0, 5).map((s: any) => (
              <div key={s.id} className="flex justify-between text-xs text-[#dbdfea] opacity-70" data-testid={`source-row-${s.id}`}>
                <span className="truncate mr-2">{s.label || s.provider}</span>
                <span className="whitespace-nowrap">{s.totalImported}/{s.totalFound}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#24263a] rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#dbdfea] text-lg">{title}</h2>
          <button onClick={onClose} className="text-[#dbdfea] opacity-60 hover:opacity-100" data-testid="button-close-modal"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
