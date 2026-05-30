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

/* ── Add Tenant Sheet ── */
function AddTenantSheet({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', propertyAddress: '', coTenantsText: '', preferredChannel: 'email' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.firstName && form.lastName && form.propertyAddress;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,13,109,0.55)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', background: C.white, borderRadius: '28px 28px 0 0', padding: '24px 24px 48px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: C.navy }}>add tenant</span>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 999, background: C.gray, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
          </button>
        </div>
        {[
          { k: 'firstName', label: 'first name', required: true },
          { k: 'lastName',  label: 'last name',  required: true },
          { k: 'propertyAddress', label: 'property address', required: true },
          { k: 'email',    label: 'email' },
          { k: 'phone',    label: 'phone' },
          { k: 'coTenantsText', label: 'co-tenants (optional)' },
        ].map(({ k, label, required }) => (
          <div key={k} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}{required ? ' *' : ''}</div>
            <input
              value={(form as any)[k]}
              onChange={e => set(k, e.target.value)}
              style={{ width: '100%', padding: '14px 16px', borderRadius: 14, background: C.gray, border: 'none', outline: 'none', color: C.navy, fontSize: 15, fontWeight: 500, boxSizing: 'border-box' }}
            />
          </div>
        ))}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>send rent link via</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['email', 'sms'] as const).map(ch => (
              <button key={ch} onClick={() => set('preferredChannel', ch)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 14, border: `2px solid ${form.preferredChannel === ch ? C.navy : 'transparent'}`, background: form.preferredChannel === ch ? C.navy : C.gray, color: form.preferredChannel === ch ? C.white : C.navy, fontWeight: 600, fontSize: 14, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {ch}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => valid && onSave(form)}
          disabled={!valid}
          style={{ width: '100%', padding: '18px 0', borderRadius: 999, background: valid ? C.navy : C.gray, color: valid ? C.white : C.mute, fontWeight: 700, fontSize: 16, border: 'none', cursor: valid ? 'pointer' : 'default', transition: 'background 0.2s' }}>
          add tenant
        </button>
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
  const [search,   setSearch]   = useState('');
  const [showAdd,  setShowAdd]  = useState(false);
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
      const r = await fetch('/api/property/tenants', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error('Failed to create tenant');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/property/tenants'] });
      setShowAdd(false);
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
    <div style={{ width: '100%', maxWidth: 390, minHeight: '100svh', background: C.white, paddingBottom: 120, fontFamily: "'Outfit', system-ui, sans-serif" }}>
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
          onClose={() => setShowAdd(false)}
          onSave={data => createMutation.mutate(data)}
        />
      )}
    </div>
    </div>
  );
}
