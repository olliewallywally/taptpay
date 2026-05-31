import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

/* ── Design tokens ── */
const C = {
  navy:  '#040D6D',
  sky:   '#58ABFF',
  btn:   '#3F9BFF',
  white: '#FFFFFF',
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

/* ── Helpers ── */
function fmtCents(c: number) { return '$' + (c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function invoiceStatus(inv: any): string {
  if (inv.status === 'paid' || inv.status === 'paid_external') return 'paid';
  if (inv.status === 'overdue') return 'overdue';
  return 'upcoming';
}

/* ── Status badge ── */
function StatusBox({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.upcoming;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 8, background: s.bg, color: s.fg, fontWeight: 600, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flexShrink: 0 }} />
      {s.label}
    </div>
  );
}

/* ── Collection gauge ── */
function Ring({ pct }: { pct: number }) {
  const cx = 65, cy = 65, r = 48, diskR = 37;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0.01, Math.min(1, pct));
  const endAng = (135 + 360 * p) * Math.PI / 180;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" style={{ display: 'block' }}>
      <defs>
        <filter id="pg-disk" x="-90%" y="-90%" width="280%" height="280%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="7" floodColor="rgba(4,13,109,0.22)" />
        </filter>
        <filter id="pg-arc" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="4" floodColor="#040D6D" floodOpacity="0.32" />
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r={diskR} fill="#EAEAEA" filter="url(#pg-disk)" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={`${circ * p} ${circ}`} transform={`rotate(135 ${cx} ${cy})`} filter="url(#pg-arc)" />
      <circle cx={cx + r * Math.cos(endAng)} cy={cy + r * Math.sin(endAng)} r="5.5" fill={C.navy} filter="url(#pg-arc)" />
      <text x={cx} y={cy + 6} textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="400" fontSize="19" fill={C.navy}>
        {Math.round(p * 100)}%
      </text>
    </svg>
  );
}

/* ── Stat icon SVGs ── */
function IcoTenants() {
  return <svg width={17} height={17} viewBox="0 0 24 24" fill={C.navy}><circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="8.5" r="2.4"/><path d="M2.6 19c0-3.2 2.6-5.6 5.9-5.6s5.9 2.4 5.9 5.6z"/><path d="M15.4 13.6c2.6.2 4.9 2.3 4.9 5.1"/></svg>;
}
function IcoWarn() {
  return <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.8" strokeLinecap="round"><path d="M12 3.6 21 19H3z"/><path d="M12 10v4.1"/><circle cx="12" cy="16.6" r=".95" fill={C.navy} stroke="none"/></svg>;
}
function IcoPage() {
  return <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.8" strokeLinecap="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h6"/></svg>;
}
function IcoPause() {
  return <svg width={17} height={17} viewBox="0 0 24 24" fill={C.navy}><rect x="6.5" y="4.5" width="3.6" height="15" rx="1.3"/><rect x="13.9" y="4.5" width="3.6" height="15" rx="1.3"/></svg>;
}

const STAT_ICONS = [IcoTenants, IcoWarn, IcoPage, IcoPause];

export default function PropertyDashboard() {
  const [, setLocation] = useLocation();

  const { data: tenants = [] } = useQuery<any[]>({
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

  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ['/api/property/schedules'],
    queryFn: () => fetch('/api/property/schedules', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    staleTime: 60000,
    retry: false,
  });

  /* Derived stats */
  const activeTenants   = tenants.filter((t: any) => t.status !== 'archived').length;
  const overdueCount    = invoices.filter((i: any) => i.status === 'overdue').length;
  const queuedCount     = invoices.filter((i: any) => i.status === 'pending_dispatch').length;
  const activeCount     = invoices.filter((i: any) => ['pending_dispatch', 'dispatched', 'overdue'].includes(i.status)).length;
  const paidCount       = invoices.filter((i: any) => i.status === 'paid' || i.status === 'paid_external').length;
  const collectionPct   = invoices.length > 0 ? paidCount / invoices.length : 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyRevenue = invoices
    .filter((i: any) => (i.status === 'paid' || i.status === 'paid_external') && i.paidAt && new Date(i.paidAt) >= monthStart)
    .reduce((s: number, i: any) => s + (i.amountCents ?? 0), 0);

  const recent = [...invoices]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const stats = [
    { label: 'tenants',     v: activeTenants, Ico: STAT_ICONS[0] },
    { label: 'outstanding', v: overdueCount,  Ico: STAT_ICONS[1] },
    { label: 'queued',      v: queuedCount,   Ico: STAT_ICONS[2] },
    { label: 'paused',      v: schedules.filter((s: any) => s.status === 'paused').length, Ico: STAT_ICONS[3] },
  ];

  return (
    <div style={{ background: C.white, minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
    <div style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: '#F4F4F4', paddingBottom: 130, fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <div style={{ height: 54 }} />

      {/* 1 — Active transaction hero */}
      <div style={{ padding: '0 18px' }}>
        <div style={{ background: C.navy, borderRadius: 24, padding: '24px 26px 26px' }}>
          <div style={{ fontWeight: 900, fontSize: 62, color: C.sky, letterSpacing: '-0.04em', lineHeight: 0.92, fontVariantNumeric: 'tabular-nums' }}>
            {activeCount}
          </div>
          <div style={{ fontWeight: 500, fontSize: 12, color: C.sky, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 6 }}>
            active transaction{activeCount !== 1 ? 's' : ''}
          </div>
          <div style={{ marginTop: 18, height: 24, borderRadius: 999, border: `1.5px solid ${C.sky}`, padding: 3 }}>
            <div style={{ width: `${Math.max(4, collectionPct * 100)}%`, height: '100%', borderRadius: 999, background: C.sky, transition: 'width 0.8s ease' }} />
          </div>
        </div>
      </div>

      {/* 2 — Revenue + gauge row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.32fr 1fr', gap: 14, padding: '16px 18px 0' }}>
        <div style={{ background: C.sky, borderRadius: 22, padding: '24px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 36, color: C.navy, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {fmtCents(monthlyRevenue)}
          </div>
          <div style={{ fontWeight: 500, fontSize: 11, color: C.navy, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 12, lineHeight: 1.3 }}>
            monthly rent<br />revenue
          </div>
        </div>
        <div style={{ background: '#F2F0F0', borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ring pct={collectionPct} />
        </div>
      </div>

      {/* 3 — Stat strip */}
      <div style={{ padding: '16px 18px 0' }}>
        <div style={{ background: C.navy, borderRadius: 24, padding: '18px 16px' }}>
          <div style={{ border: '2px solid rgba(88,171,255,0.55)', borderRadius: 20, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13 }}>
            {stats.map(({ label, v, Ico }) => (
              <div key={label} style={{ borderRadius: 18, padding: '12px 11px', background: C.sky, minHeight: 92, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', boxSizing: 'border-box' }}>
                <div style={{ marginBottom: 8 }}><Ico /></div>
                <div style={{ fontWeight: 700, fontSize: 7.5, color: C.navy, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, whiteSpace: 'nowrap' }}>{label}</div>
                <div style={{ fontWeight: 800, fontSize: 28, color: C.white, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4 — Rent transactions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 20px 12px' }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: C.navy, letterSpacing: '0.12em', textTransform: 'uppercase' }}>rent transactions</div>
        <button onClick={() => setLocation('/property/tenants')} style={{ fontSize: 13, fontWeight: 600, color: C.btn, background: 'none', border: 'none', cursor: 'pointer' }}>view all →</button>
      </div>

      {recent.length === 0 ? (
        <div style={{ padding: '32px 18px', textAlign: 'center', color: C.mute, fontSize: 13 }}>
          no transactions yet — add tenants to get started
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 18px' }}>
          {recent.map((inv: any) => {
            const name     = inv.tenantName || '—';
            const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={inv.id} style={{ ...GLASS, borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 40, height: 40, borderRadius: 999, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 12, color: C.sky, letterSpacing: '0.03em' }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13.5, color: C.navy, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontWeight: 400, fontSize: 11, color: C.mute, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.propertyAddress || '—'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                  {(() => {
                    const isSplit = inv.splitEnabled && inv.splitCount > 1;
                    const paid = inv.splitPaidCount || 0;
                    const showOwing = isSplit && paid > 0 && invoiceStatus(inv) !== 'paid';
                    return (
                      <>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.navy, fontVariantNumeric: 'tabular-nums' }}>{fmtCents(showOwing ? (inv.owingCents ?? inv.amountCents) : (inv.amountCents ?? 0))}</div>
                        {isSplit && <div style={{ fontSize: 9.5, fontWeight: 700, color: '#0B7D63' }}>{paid}/{inv.splitCount} split</div>}
                      </>
                    );
                  })()}
                  <StatusBox status={invoiceStatus(inv)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
