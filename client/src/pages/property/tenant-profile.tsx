import { useState, useMemo, useLayoutEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { consumeSnap, startPropertyBack, signalPropertyReady } from "@/lib/property-transition";
import { propFetch } from "@/lib/property-api";

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
  paid:     { dot: '#13C29A', bg: 'rgba(19,194,154,0.20)', fg: '#0BD4A0', label: 'paid'     },
  overdue:  { dot: '#FF3B4E', bg: 'rgba(255,59,78,0.20)',  fg: '#FF3B4E', label: 'overdue'  },
  upcoming: { dot: C.btn,    bg: 'rgba(63,155,255,0.22)', fg: C.sky,    label: 'upcoming' },
};

function propHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const EVENT_KINDS: Record<string, { color: string; icon: string; fg: string }> = {
  Payment_Success:   { color: '#13C29A', icon: 'cash',     fg: '#0B7D63' },
  Invoice_Sent:      { color: C.btn,    icon: 'send',     fg: '#1A5FCC' },
  Reminder_Sent:     { color: '#FFB02E', icon: 'bell',     fg: '#9A6A00' },
  Payment_Declined:  { color: '#FF3B4E', icon: 'x',       fg: '#C71A2A' },
  Invoice_Generated: { color: C.btn,    icon: 'page',     fg: '#1A5FCC' },
  Schedule_Created:  { color: '#13C29A', icon: 'check',   fg: '#0B7D63' },
  Tenant_Created:    { color: C.sky,    icon: 'user',     fg: '#1A5FCC' },
  Payment_External:  { color: '#13C29A', icon: 'cash',    fg: '#0B7D63' },
};

function fmtCents(c: number) { return '$' + (c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
}

function eventLabel(type: string) {
  const map: Record<string, string> = {
    Payment_Success:   'rent paid',
    Invoice_Sent:      'rent link sent',
    Reminder_Sent:     'reminder notice sent',
    Payment_Declined:  'payment failed',
    Invoice_Generated: 'invoice generated',
    Schedule_Created:  'schedule created',
    Tenant_Created:    'tenant added',
    Payment_External:  'marked paid externally',
  };
  return map[type] ?? type.replace(/_/g, ' ').toLowerCase();
}

function EventIcon({ type }: { type: string }) {
  const k = EVENT_KINDS[type];
  const c = k?.fg ?? C.mute;
  switch (k?.icon) {
    case 'cash':   return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/></svg>;
    case 'send':   return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4 3 11l6 2.5L12 20l3-7z"/><path d="m9 13.5 6-6.5"/></svg>;
    case 'bell':   return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round"><path d="M18 8a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 14 18 8z"/><path d="M10.5 20.5a2 2 0 0 0 3 0"/></svg>;
    case 'x':      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case 'check':  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>;
    default:       return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round"><path d="M6 3h8l4 4v14H6z"/></svg>;
  }
}

/* ── Editable field block ── */
function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 12px', gridColumn: wide ? '1 / -1' : 'auto', minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 8.5, color: C.sky, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 500, fontSize: 14, color: C.white, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 5 }}>{value || '—'}</div>
    </div>
  );
}

/* ── Timeline rail ── */
function Rail({ color, first, last }: { color: string; first: boolean; last: boolean }) {
  return (
    <div style={{ position: 'relative', width: 30, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: first ? 14 : 0, bottom: last ? 'calc(100% - 14px)' : 0, width: 2, background: 'rgba(4,13,109,0.14)' }} />
      <div style={{ position: 'absolute', top: 8, width: 13, height: 13, borderRadius: 999, background: C.white, border: `3px solid ${color}`, boxShadow: '0 0 0 3px rgba(255,255,255,0.9)' }} />
    </div>
  );
}

export default function TenantProfile() {
  const [, params] = useRoute('/property/tenants/:id');
  const [, setLocation] = useLocation();
  const tenantId = params?.id ?? '';
  const queryClient = useQueryClient();

  const [subOpen,  setSubOpen]  = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Consume the snapshot captured on the directory tap — available before the API resolves.
  // Using empty deps means we read it exactly once on mount, which is correct.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => consumeSnap(), []);

  // Tell any in-flight View Transition the hero is now in the DOM so it can
  // capture the new snapshot and play the morph (see property-transition.ts).
  useLayoutEffect(() => { signalPropertyReady(); }, []);

  const { data: tenant, isLoading } = useQuery<any>({
    queryKey: ['/api/property/tenants', tenantId],
    queryFn: () => propFetch(`/api/property/tenants/${tenantId}`).then(r => r.ok ? r.json() : null),
    enabled: !!tenantId,
    retry: false,
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ['/api/property/tenants', tenantId, 'events'],
    queryFn: () => propFetch(`/api/property/tenants/${tenantId}/events`).then(r => r.ok ? r.json() : []),
    enabled: !!tenantId,
    staleTime: 30000,
    retry: false,
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ['/api/property/invoices', { tenantProfileId: tenantId }],
    queryFn: () => propFetch(`/api/property/invoices?tenantProfileId=${tenantId}`).then(r => r.ok ? r.json() : []),
    enabled: !!tenantId,
    staleTime: 30000,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/property/tenants/${tenantId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...propHeaders() }, body: JSON.stringify(data) });
      if (!r.ok) {
        const msg = await r.json().then((d: any) => d.message).catch(() => `Error ${r.status}`);
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/property/tenants', tenantId] });
      setEditError(null);
      setEditing(false);
    },
    onError: (err: any) => { setEditError(err?.message || 'Failed to update tenant'); },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/property/tenants/${tenantId}/archive`, { method: 'POST', headers: propHeaders() });
      if (!r.ok) throw new Error('Failed to archive');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/property/tenants'] });
      startPropertyBack(() => setLocation('/property/tenants'));
    },
  });

  // Not found: no snap (direct URL), not loading, and no data → show error screen.
  if (!isLoading && !tenant && !snap) {
    return (
      <div style={{ minHeight: '100svh', background: C.white, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 430, background: '#F4F4F4', paddingTop: 100, textAlign: 'center' }}>
          <p style={{ color: C.mute }}>tenant not found</p>
          <button onClick={() => startPropertyBack(() => setLocation('/property/tenants'))} style={{ marginTop: 16, color: C.btn, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← back to tenants</button>
        </div>
      </div>
    );
  }

  // Hero data: use real tenant once loaded, snapshot during the morph animation.
  const heroInitials = tenant
    ? `${tenant.firstName?.[0] ?? ''}${tenant.lastName?.[0] ?? ''}`.toUpperCase()
    : snap
    ? `${snap.firstName?.[0] ?? ''}${snap.lastName?.[0] ?? ''}`.toUpperCase()
    : '…';

  const heroName = tenant
    ? `${tenant.firstName} ${tenant.lastName}`
    : snap
    ? `${snap.firstName} ${snap.lastName}`
    : '';

  const latestInvoice = [...invoices]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const heroStatus = tenant
    ? (latestInvoice?.status === 'paid' || latestInvoice?.status === 'paid_external' ? 'paid'
      : latestInvoice?.status === 'overdue' ? 'overdue' : 'upcoming')
    : snap?.invoiceStatus === 'overdue' ? 'overdue'
    : (snap?.invoiceStatus === 'paid' || snap?.invoiceStatus === 'paid_external') ? 'paid'
    : 'upcoming';

  const heroAddress    = tenant?.propertyAddress  || snap?.propertyAddress  || '';
  const heroChannel    = tenant?.preferredChannel || snap?.preferredChannel || '';

  const coTenants = tenant?.coTenantsText
    ? tenant.coTenantsText.split('\n').filter(Boolean)
    : [];

  const startEdit = () => {
    if (!tenant) return;
    setEditError(null);
    setEditForm({ firstName: tenant.firstName, lastName: tenant.lastName, propertyAddress: tenant.propertyAddress, email: tenant.email ?? '', phone: tenant.phone ?? '', preferredChannel: tenant.preferredChannel });
    setEditing(true);
  };

  // The chosen channel must have a matching contact, else the link can't be sent.
  const editContactOk = editForm
    ? (editForm.preferredChannel === 'email' ? !!String(editForm.email ?? '').trim() : !!String(editForm.phone ?? '').trim())
    : true;

  return (
    <div style={{ background: C.white, minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
    <div style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: '#F4F4F4', paddingBottom: 130, fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <div style={{ height: 56 }} />

      {/* Top bar — slides down from above as the hero morphs into place */}
      <div className="pt-slide-top" style={{ '--pt-d': '0ms' } as any}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 18px 14px' }}>
          <button onClick={() => startPropertyBack(() => setLocation('/property/tenants'))} style={{ width: 34, height: 34, borderRadius: 999, background: C.gray, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6"/></svg>
          </button>
          <div style={{ fontWeight: 600, fontSize: 11, color: C.navy, letterSpacing: '0.16em', textTransform: 'uppercase' }}>tenant profile</div>
          <button onClick={startEdit} disabled={!tenant} style={{ width: 34, height: 34, borderRadius: 999, background: C.gray, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: tenant ? 'pointer' : 'default', opacity: tenant ? 1 : 0.35 }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        </div>
      </div>

      {/* Navy hero panel — same view-transition-name as the directory hero so the browser morphs between them */}
      <div style={{ padding: '0 18px' }}>
        <div className="pt-hero" style={{ background: C.navy, borderRadius: 24, padding: '20px 20px 22px' }}>
          {/* Head */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 50, height: 50, borderRadius: 999, background: C.sky, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 16, color: C.navy, letterSpacing: '0.03em' }}>
              {heroInitials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 8.5, color: C.sky, letterSpacing: '0.12em', textTransform: 'uppercase' }}>head tenant</div>
              <div style={{ fontWeight: 600, fontSize: 21, color: C.white, letterSpacing: '-0.02em', marginTop: 2 }}>{heroName}</div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'rgba(63,155,255,0.22)', color: C.sky, fontWeight: 700, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.btn }} />
              {heroStatus}
            </div>
          </div>

          {/* Subtenants dropdown */}
          {coTenants.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => setSubOpen(o => !o)}
                style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 12px', border: 'none', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 8.5, color: C.sky, letterSpacing: '0.12em', textTransform: 'uppercase' }}>co-tenants</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, color: C.white }}>{coTenants.length} co-tenant{coTenants.length !== 1 ? 's' : ''}</div>
                  <div style={{ transform: subOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', display: 'flex' }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.sky} strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </button>
              {subOpen && (
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, marginTop: 6, overflow: 'hidden' }}>
                  {coTenants.map((n: string, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                      <div style={{ width: 26, height: 26, borderRadius: 999, background: 'rgba(91,174,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9, color: C.sky }}>
                        {n.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 400, fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>{n}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fields grid — shows snap data instantly, real data once loaded */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <Field label="address"          value={heroAddress}  wide />
            <Field label="payment link via" value={heroChannel}  wide />
          </div>
        </div>
      </div>

      {/* Activity Timeline — header bounces in after hero settles */}
      <div data-tutorial-id="tenant-activity" className="pt-bounce" style={{ '--pt-d': '170ms', display: 'flex', alignItems: 'center', padding: '24px 20px 4px' } as any}>
        <div style={{ fontWeight: 600, fontSize: 12, color: C.navy, letterSpacing: '0.12em', textTransform: 'uppercase' }}>activity timeline</div>
      </div>

      {!tenant && isLoading ? (
        <div style={{ padding: '24px 18px', textAlign: 'center', color: C.mute, fontSize: 13 }}>loading activity…</div>
      ) : events.length === 0 ? (
        <div className="pt-bounce" style={{ '--pt-d': '215ms', padding: '24px 18px', textAlign: 'center', color: C.mute, fontSize: 13 } as any}>no activity yet</div>
      ) : (
        <div style={{ padding: '8px 18px 0' }}>
          {events.slice(0, 10).map((ev: any, i: number) => {
            const k   = EVENT_KINDS[ev.eventType] ?? { color: C.mute, fg: C.mute };
            const isFirst = i === 0;
            const isLast  = i === Math.min(events.length, 10) - 1;
            const isPaid  = ev.eventType === 'Payment_Success' || ev.eventType === 'Payment_External';
            const amtCents = ev.payload?.amountCents ?? (latestInvoice?.amountCents && isFirst ? latestInvoice.amountCents : null);

            return (
              <div
                key={ev.id}
                className="pt-bounce"
                style={{ '--pt-d': `${215 + i * 45}ms`, display: 'flex', gap: 10, minHeight: isPaid && isFirst ? 0 : 64 } as any}
              >
                <Rail color={k.color} first={isFirst} last={isLast} />
                <div style={{ flex: 1, paddingBottom: 14, paddingTop: 2 }}>
                  {isPaid && isFirst && amtCents ? (
                    <div style={{ background: C.sky, borderRadius: 16, padding: '14px 15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16, color: C.navy }}>{eventLabel(ev.eventType)}</div>
                          <div style={{ fontWeight: 500, fontSize: 12, color: 'rgba(4,13,109,0.7)', marginTop: 3 }}>{fmtCents(amtCents)} received</div>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 11, color: 'rgba(4,13,109,0.7)', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(ev.createdAt)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                        <div style={{ fontWeight: 800, fontSize: 24, color: C.navy, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{fmtCents(amtCents)}</div>
                        <div style={{ width: 30, height: 30, borderRadius: 999, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.sky} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <EventIcon type={ev.eventType} />
                          <div style={{ fontWeight: 600, fontSize: 14, color: C.navy }}>{eventLabel(ev.eventType)}</div>
                        </div>
                        <div style={{ fontWeight: 500, fontSize: 11, color: C.mute, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDate(ev.createdAt)}</div>
                      </div>
                      {ev.payload && Object.keys(ev.payload).length > 0 && (
                        <div style={{ fontWeight: 400, fontSize: 11.5, color: C.mute, marginTop: 3 }}>
                          {ev.payload.channel ? `via ${ev.payload.channel}` : ev.payload.frequency ? `${ev.payload.frequency} · ${fmtCents(ev.payload.amountCents ?? 0)}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit sheet */}
      {editing && editForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,13,109,0.55)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', maxWidth: 430, margin: '0 auto', background: '#F4F4F4', borderRadius: '28px 28px 0 0', padding: '24px 24px 48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 18, color: C.navy }}>edit tenant</span>
              <button onClick={() => setEditing(false)} style={{ width: 32, height: 32, borderRadius: 999, background: C.gray, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
              </button>
            </div>
            {[
              { k: 'firstName', label: 'first name', type: 'text' },
              { k: 'lastName',  label: 'last name', type: 'text' },
              { k: 'propertyAddress', label: 'property address', type: 'text' },
              { k: 'email', label: 'email', type: 'email' },
              { k: 'phone', label: 'phone', type: 'tel' },
            ].map(({ k, label, type }) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                <input
                  type={type}
                  value={editForm[k] ?? ''}
                  onChange={e => setEditForm((f: any) => ({ ...f, [k]: e.target.value }))}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 14, background: C.gray, border: 'none', outline: 'none', color: C.navy, fontSize: 15, fontWeight: 500, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            {/* Preferred notification channel */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.sky, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>send rent link via</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['email', 'whatsapp', 'sms'] as const).map(ch => (
                  <button key={ch} onClick={() => setEditForm((f: any) => ({ ...f, preferredChannel: ch }))}
                    style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: 'none', background: editForm.preferredChannel === ch ? C.navy : C.gray, color: editForm.preferredChannel === ch ? C.white : C.navy, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'background 0.18s, color 0.18s' }}>
                    {ch}
                  </button>
                ))}
              </div>
              {!editContactOk && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#FF3B4E', fontWeight: 500 }}>
                  add {editForm.preferredChannel === 'email' ? 'an email address' : 'a phone number'} above to send via {editForm.preferredChannel}
                </div>
              )}
            </div>
            {editError && (
              <div style={{ marginBottom: 12, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,59,78,0.07)', border: '1px solid rgba(255,59,78,0.18)' }}>
                <p style={{ color: '#FF3B4E', fontSize: 13, fontWeight: 500, margin: 0 }}>{editError}</p>
              </div>
            )}
            <button
              onClick={() => updateMutation.mutate(editForm)}
              disabled={updateMutation.isPending || !editContactOk}
              style={{ width: '100%', padding: '18px 0', borderRadius: 999, background: editContactOk ? C.navy : C.gray, color: editContactOk ? C.white : C.mute, fontWeight: 700, fontSize: 16, border: 'none', cursor: editContactOk && !updateMutation.isPending ? 'pointer' : 'default', marginTop: 8 }}>
              {updateMutation.isPending ? 'saving…' : 'save changes'}
            </button>
            <button
              onClick={() => {
                if (window.confirm('Archive this tenant? They will be removed from active lists. This cannot be undone easily.')) {
                  archiveMutation.mutate();
                }
              }}
              disabled={archiveMutation.isPending}
              style={{ width: '100%', padding: '14px 0', borderRadius: 999, background: 'transparent', color: '#FF3B4E', fontWeight: 600, fontSize: 14, border: '1.5px solid rgba(255,59,78,0.3)', cursor: 'pointer', marginTop: 10 }}>
              {archiveMutation.isPending ? 'archiving…' : 'archive tenant'}
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
