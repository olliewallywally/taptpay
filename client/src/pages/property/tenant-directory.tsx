import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

/* ── Design tokens ── */
const C = {
  navy:  '#040D6D',
  sky:   '#58ABFF',
  btn:   '#3F9BFF',
  white: '#FFFFFF',
  gray:  '#E7E6E5',
  mute:  '#8C8C8C',
};

const STATUS_MAP: Record<string, { dot: string; bg: string; fg: string; label: string }> = {
  paid:     { dot: '#13C29A', bg: 'rgba(19,194,154,0.14)',  fg: '#0B7D63', label: 'paid' },
  overdue:  { dot: '#FF3B4E', bg: 'rgba(255,59,78,0.12)',   fg: '#C71A2A', label: 'overdue' },
  dueSoon:  { dot: '#FFB02E', bg: 'rgba(255,176,46,0.18)',  fg: '#9A6A00', label: 'due soon' },
  upcoming: { dot: '#3F9BFF', bg: 'rgba(63,155,255,0.16)',  fg: '#1A5FCC', label: 'upcoming' },
};

const GLASS = {
  background: 'linear-gradient(140deg, rgba(255,255,255,0.92) 0%, rgba(234,238,244,0.72) 50%, rgba(220,227,240,0.62) 100%)',
  backdropFilter: 'blur(16px) saturate(130%)',
  WebkitBackdropFilter: 'blur(16px) saturate(130%)',
  border: '1px solid rgba(255,255,255,0.7)',
  boxShadow: '0 12px 32px rgba(4,13,109,0.10), inset 0 1px 0 rgba(255,255,255,0.95)',
} as React.CSSProperties;

function fmtCents(c: number) { return '$' + (c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function StatusBox({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.upcoming;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, background: s.bg, color: s.fg, fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flexShrink: 0 }} />
      {s.label}
    </div>
  );
}

/* ── Shared field input ── */
function Field({ label, value, onChange, placeholder, required, type = 'text' }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}{required ? ' *' : ''}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '14px 16px', borderRadius: 14, background: C.gray, border: 'none', outline: 'none', color: C.navy, fontSize: 15, fontWeight: 500, boxSizing: 'border-box', fontFamily: 'inherit' }}
      />
    </div>
  );
}

/* ── Add Tenant Sheet ── */
function AddTenantSheet({ onClose, onSave, saving, saveError }: {
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
  saveError: string | null;
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    propertyAddress: '', preferredChannel: 'email' as 'email' | 'sms',
  });
  const [subtenants, setSubtenants] = useState<{ name: string; email: string; phone: string }[]>([]);
  const [subForm, setSubForm]       = useState({ name: '', email: '', phone: '' });
  const [subOpen, setSubOpen]       = useState(false);
  const [closing, setClosing]       = useState(false);

  const set    = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const setSub = (k: string) => (v: string) => setSubForm(f => ({ ...f, [k]: v }));

  const valid = form.firstName.trim() && form.lastName.trim() && form.propertyAddress.trim();

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 320);
  };

  const confirmSubtenant = () => {
    if (!subForm.name.trim()) return;
    setSubtenants(p => [...p, { ...subForm }]);
    setSubForm({ name: '', email: '', phone: '' });
    setSubOpen(false);
  };

  const handleSave = () => {
    if (!valid || saving) return;
    const coTenantsText = subtenants.length > 0
      ? subtenants.map(s => {
          const detail = [s.email, s.phone].filter(Boolean).join(', ');
          return detail ? `${s.name} (${detail})` : s.name;
        }).join('\n')
      : '';
    onSave({ ...form, coTenantsText });
  };

  const ANIM_IN  = 'atSlideUp 0.38s cubic-bezier(0.16,1,0.3,1) both';
  const ANIM_OUT = 'atSlideDown 0.32s cubic-bezier(0.4,0,0.2,1) both';
  const FD_IN    = 'atFdIn 0.28s ease both';
  const FD_OUT   = 'atFdOut 0.28s ease both';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <style>{`
        @keyframes atSlideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes atSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes atFdIn      { from { opacity: 0; } to { opacity: 1; } }
        @keyframes atFdOut     { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(4,13,109,0.55)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: closing ? FD_OUT : FD_IN,
        }}
      />

      {/* Centering wrapper — keeps sheet at 390px on desktop */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      {/* Sheet — slides up from bottom */}
      <div style={{
        width: '100%', maxWidth: 390,
        background: '#F4F4F4',
        borderRadius: '28px 28px 0 0',
        maxHeight: '92vh',
        overflowY: 'auto',
        animation: closing ? ANIM_OUT : ANIM_IN,
      }}>
        {/* Pull handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 2px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.1)' }} />
        </div>

        <div style={{ padding: '12px 24px 52px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <span style={{ fontWeight: 700, fontSize: 20, color: C.navy, letterSpacing: '-0.3px' }}>add tenant</span>
            <button onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 999, background: C.gray, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
            </button>
          </div>

          {/* Main tenant fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Field label="first name" value={form.firstName} onChange={set('firstName')} required />
            <Field label="last name"  value={form.lastName}  onChange={set('lastName')}  required />
          </div>
          <Field label="property address" value={form.propertyAddress} onChange={set('propertyAddress')} required />
          <Field label="email" value={form.email} onChange={set('email')} type="email" />
          <Field label="phone" value={form.phone} onChange={set('phone')} type="tel" />

          {/* Preferred channel */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>send rent link via</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['email', 'sms'] as const).map(ch => (
                <button key={ch} onClick={() => setForm(f => ({ ...f, preferredChannel: ch }))}
                  style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: 'none', background: form.preferredChannel === ch ? C.navy : C.gray, color: form.preferredChannel === ch ? C.white : C.navy, fontWeight: 600, fontSize: 14, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'background 0.18s, color 0.18s' }}>
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* ── Subtenants ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>subtenants</div>

            {/* Added subtenants list */}
            {subtenants.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 8, borderRadius: 14, background: C.gray }}>
                <div style={{ width: 30, height: 30, borderRadius: 999, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.sky }}>
                  {s.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.navy }}>{s.name}</div>
                  {(s.email || s.phone) && (
                    <div style={{ fontWeight: 400, fontSize: 12, color: C.mute, marginTop: 1 }}>
                      {[s.email, s.phone].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <button onClick={() => setSubtenants(p => p.filter((_, j) => j !== i))}
                  style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(4,13,109,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
                </button>
              </div>
            ))}

            {/* Add subtenant toggle button */}
            <button
              onClick={() => setSubOpen(o => !o)}
              style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: `1.5px dashed ${subOpen ? C.sky : 'rgba(4,13,109,0.18)'}`, background: subOpen ? 'rgba(88,171,255,0.06)' : 'transparent', color: C.navy, fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.22s ease' }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.sky} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              <span style={{ color: C.navy }}>add subtenant</span>
            </button>

            {/* Expandable subtenant form — smooth slide */}
            <div style={{
              overflow: 'hidden',
              maxHeight: subOpen ? '320px' : '0px',
              transition: 'max-height 0.38s cubic-bezier(0.16,1,0.3,1)',
            }}>
              <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="name" value={subForm.name} onChange={setSub('name')} required />
                <Field label="email" value={subForm.email} onChange={setSub('email')} type="email" />
                <Field label="phone" value={subForm.phone} onChange={setSub('phone')} type="tel" />
                <button
                  onClick={confirmSubtenant}
                  disabled={!subForm.name.trim()}
                  style={{ padding: '13px 0', borderRadius: 14, background: subForm.name.trim() ? C.navy : C.gray, color: subForm.name.trim() ? C.white : C.mute, fontWeight: 600, fontSize: 14, border: 'none', cursor: subForm.name.trim() ? 'pointer' : 'default', transition: 'background 0.18s' }}>
                  confirm subtenant
                </button>
              </div>
            </div>
          </div>

          {/* Error */}
          {saveError && (
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,59,78,0.07)', border: '1px solid rgba(255,59,78,0.18)' }}>
              <p style={{ color: '#C71A2A', fontSize: 13, fontWeight: 500, margin: 0 }}>{saveError}</p>
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!valid || saving}
            style={{ width: '100%', padding: '18px 0', borderRadius: 999, background: valid && !saving ? C.navy : C.gray, color: valid && !saving ? C.white : C.mute, fontWeight: 700, fontSize: 16, border: 'none', cursor: valid && !saving ? 'pointer' : 'default', transition: 'background 0.2s, color 0.2s' }}>
            {saving ? 'adding…' : 'add tenant'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ── Tenant card pair ── */
function TenantRow({ tenant, nextInvoice, onClick }: { tenant: any; nextInvoice: any; onClick: () => void }) {
  const fullName = `${tenant.firstName} ${tenant.lastName}`;
  const status   = nextInvoice ? (nextInvoice.status === 'paid' || nextInvoice.status === 'paid_external' ? 'paid' : nextInvoice.status === 'overdue' ? 'overdue' : 'upcoming') : 'upcoming';
  const dueDate  = nextInvoice?.dueAt ? new Date(nextInvoice.dueAt).toLocaleDateString('en-NZ', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 12 }}>
      {/* Info card */}
      <div style={{ ...GLASS, borderRadius: 18, padding: '16px 16px 14px', position: 'relative', display: 'flex', flexDirection: 'column', cursor: 'pointer' }} onClick={onClick}>
        <button
          onClick={e => { e.stopPropagation(); onClick(); }}
          style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 999, background: C.white, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 3px rgba(4,13,109,0.12)' }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <div style={{ fontWeight: 500, fontSize: 14, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.02em', paddingRight: 30, lineHeight: 1.25 }}>{fullName}</div>
        <div style={{ fontWeight: 400, fontSize: 12.5, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.02em', marginTop: 5, lineHeight: 1.35 }}>{tenant.propertyAddress}</div>
        <div style={{ marginTop: 12 }}><StatusBox status={status} /></div>
      </div>
      {/* Payment card */}
      <div style={{ ...GLASS, borderRadius: 18, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 27, color: C.navy, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {nextInvoice ? fmtCents(nextInvoice.amountCents) : '—'}
        </div>
        <div style={{ fontWeight: 400, fontSize: 11, color: C.mute, marginTop: 8 }}>next payment</div>
        <div style={{ fontWeight: 500, fontSize: 11, color: C.mute, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{dueDate}</div>
      </div>
    </div>
  );
}

export default function TenantDirectory() {
  const [, setLocation] = useLocation();
  const [search,    setSearch]    = useState('');
  const [showAdd,   setShowAdd]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/property/tenants'],
    queryFn: () => fetch('/api/property/tenants', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    staleTime: 60000,
    retry: false,
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ['/api/property/invoices'],
    queryFn: () => fetch('/api/property/invoices', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    staleTime: 30000,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch('/api/property/tenants', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const msg = await r.json().then(d => d.message).catch(() => `Error ${r.status}`);
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/property/tenants'] });
      setSaveError(null);
      setShowAdd(false);
    },
    onError: (err: any) => {
      setSaveError(err?.message || 'Failed to add tenant. The backend may not be connected yet.');
    },
  });

  /* Helpers */
  const activeTenants = tenants.filter((t: any) => t.status !== 'archived');
  const term = search.trim().toLowerCase();
  const filtered = activeTenants.filter((t: any) =>
    !term || `${t.firstName} ${t.lastName}`.toLowerCase().includes(term) || t.propertyAddress.toLowerCase().includes(term)
  );

  const invoiceByTenant = (tenantId: string) =>
    invoices.filter((i: any) => i.tenantProfileId === tenantId && i.status !== 'voided')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <div style={{ background: C.white, minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
    <div style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: '#F4F4F4', paddingBottom: 130, fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <div style={{ height: 54 }} />

      {/* Hero */}
      <div style={{ padding: '0 18px' }}>
        <div style={{ background: C.navy, borderRadius: 24, padding: '26px 26px 30px', position: 'relative' }}>
          <div style={{ fontWeight: 900, fontSize: 64, color: C.sky, letterSpacing: '-0.04em', lineHeight: 0.92, fontVariantNumeric: 'tabular-nums' }}>
            {activeTenants.length}
          </div>
          <div style={{ fontWeight: 500, fontSize: 12, color: C.sky, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 6 }}>
            active tenant{activeTenants.length !== 1 ? 's' : ''}
          </div>
          {/* Floating + button */}
          <button
            onClick={() => setShowAdd(true)}
            style={{ position: 'absolute', right: 24, bottom: -20, width: 46, height: 46, borderRadius: 999, background: C.btn, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(63,155,255,0.45)' }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>

      {/* Search row */}
      <div style={{ padding: '38px 18px 0', display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: C.gray, borderRadius: 14, padding: '0 14px', height: 46 }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.5-3.5"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search tenants or address"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontWeight: 500, fontSize: 14, color: C.navy }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.mute} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          )}
        </div>
        <div style={{ width: 46, height: 46, borderRadius: 14, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={20} height={20} viewBox="0 0 20 20" fill={C.sky}><rect x="1" y="1" width="7" height="7" rx="2"/><rect x="12" y="1" width="7" height="7" rx="2"/><rect x="1" y="12" width="7" height="7" rx="2"/><rect x="12" y="12" width="7" height="7" rx="2"/></svg>
        </div>
      </div>

      {/* Tenant list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 18px 0' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.mute, fontSize: 13 }}>loading tenants…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.mute, fontSize: 13 }}>
            {search ? `no tenants match "${search}"` : 'no tenants yet — tap + to add your first'}
          </div>
        ) : (
          filtered.map((t: any) => (
            <TenantRow
              key={t.id}
              tenant={t}
              nextInvoice={invoiceByTenant(t.id)}
              onClick={() => setLocation(`/property/tenants/${t.id}`)}
            />
          ))
        )}
      </div>

      {/* Add tenant sheet */}
      {showAdd && (
        <AddTenantSheet
          onClose={() => { setShowAdd(false); setSaveError(null); }}
          onSave={data => { setSaveError(null); createMutation.mutate(data); }}
          saving={createMutation.isPending}
          saveError={saveError}
        />
      )}
    </div>
    </div>
  );
}
