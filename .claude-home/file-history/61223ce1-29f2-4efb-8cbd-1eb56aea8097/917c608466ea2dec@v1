import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useNotifications } from "@/components/notification-system";
import { usePropertyInvoices, usePropertySchedules, usePropertyTenants } from "@/lib/property-data";
import {
  type Timeframe,
  buildBuckets,
  periodWindow,
  collectedCents,
  growthPct,
  filterByProperty,
} from "@/lib/property-dashboard-data";
import { fmtNZD } from "@/lib/report-utils";
import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

/* ── palette ── */
const ACCENT = "#5E9EFF";
const ACCENT_SOFT = "#7FB2FF";
const NAV_DIM = "#4A86F0";
const ACTIVE = "#66A9FF";
const TEXT_SOFT = "#F4F6FF";
const NAVY = "#000F3F";
const CHIP = "#0F1747";
const BAR_DIM = "rgba(94,158,255,0.32)";
const GREEN = "#35D07F";
const RED = "#F0656C";
const AMBER = "#F0A34E";

const RANGES: Timeframe[] = ["day", "week", "month", "year"];
const RANGE_UNIT: Record<Timeframe, string> = {
  day: "hour",
  week: "day",
  month: "week",
  year: "month",
};

const fmtDollars = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-NZ");

function initials(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => /^[a-z0-9]/i.test(p));
  if (parts.length === 0) return "–";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* Rent invoices carry integer cents and a `dueAt`; tenants carry first/last name. */
const amountOf = (invoice: any) => invoice?.amountCents ?? 0;
const dueDateOf = (invoice: any) => invoice?.dueAt ?? invoice?.createdAt;
const tenantFullName = (t: any) =>
  `${t?.firstName ?? ""} ${t?.lastName ?? ""}`.trim() || "tenant";

const shortDate = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(String(v));
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-NZ", { day: "numeric", month: "short" }).toLowerCase();
};

interface HealthStat {
  k: string;
  v: string;
  n: string;
  label: string;
  col: string;
}
interface DetailRow {
  name: string;
  sub: string;
  amt: string;
  col: string;
}

/* Portfolio figures, chart buckets and the health strip — all derived from the
   shared property cache so the desktop and mobile dashboards can never
   disagree about a number. */
function usePropertyHomeModel(tf: Timeframe, selBar: number, propFilter: string | null) {
  const tenantsQuery = usePropertyTenants();
  const invoicesQuery = usePropertyInvoices();
  const schedulesQuery = usePropertySchedules();

  const tenants = tenantsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const schedules = schedulesQuery.data ?? [];

  return useMemo(() => {
    const { invoices: fInv, tenants: fTen } = filterByProperty(invoices, tenants, propFilter);

    const win = periodWindow(tf);
    const total = collectedCents(fInv, win.start, win.end);
    const growth = growthPct(total, collectedCents(fInv, win.prevStart, win.prevEnd));

    const buckets = buildBuckets(fInv, tf);
    const chartTotal = buckets.reduce((a, b) => a + b.valueCents, 0);
    const max = Math.max(...buckets.map((b) => b.valueCents), 1);
    let peak = 0;
    buckets.forEach((b, i) => {
      if (b.valueCents > buckets[peak].valueCents) peak = i;
    });
    const selectedIdx = selBar >= 0 && selBar < buckets.length ? selBar : peak;
    const selected = buckets[selectedIdx];

    /* Portfolio health: what needs the landlord's attention right now. */
    const failed = fInv.filter((i: any) => i.status === "failed");
    const overdue = fInv.filter((i: any) => i.status === "overdue");
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const now = new Date();
    const dueSoon = fInv.filter((i: any) => {
      if (i.status === "paid" || i.status === "paid_external" || i.status === "voided") return false;
      const due = new Date(dueDateOf(i));
      return !isNaN(due.getTime()) && due >= now && due <= weekEnd;
    });

    const sum = (rows: any[]) => rows.reduce((s, i) => s + amountOf(i), 0);
    const tenantName = (invoice: any) => {
      const t = fTen.find((x: any) => x.id === invoice.tenantProfileId);
      return t ? tenantFullName(t) : "tenant";
    };
    const tenantAddress = (invoice: any) => {
      const t = fTen.find((x: any) => x.id === invoice.tenantProfileId);
      return t?.propertyAddress || invoice.propertyAddress || "";
    };

    const health: HealthStat[] = [
      { k: "failed", v: fmtDollars(sum(failed)), n: String(failed.length), label: "failed", col: failed.length ? RED : TEXT_SOFT },
      { k: "overdue", v: fmtDollars(sum(overdue)), n: String(overdue.length), label: "overdue", col: overdue.length ? AMBER : TEXT_SOFT },
      { k: "due", v: fmtDollars(sum(dueSoon)), n: String(dueSoon.length), label: "due this week", col: TEXT_SOFT },
    ];

    const toRows = (rows: any[], col: string): DetailRow[] =>
      rows.slice(0, 8).map((i: any) => ({
        name: tenantName(i),
        sub: `${tenantAddress(i) || "no address"} · ${shortDate(dueDateOf(i))}`,
        amt: fmtNZD(amountOf(i)),
        col,
      }));

    const detail: Record<string, { title: string; rows: DetailRow[] }> = {
      failed: { title: "FAILED — RETRY OR RE-SEND", rows: toRows(failed, RED) },
      overdue: { title: "OVERDUE — CHASE THESE", rows: toRows(overdue, AMBER) },
      due: { title: "DUE IN THE NEXT 7 DAYS", rows: toRows(dueSoon, TEXT_SOFT) },
    };

    /* Tenant list with each tenant's next unpaid invoice. */
    const recentTenants = fTen
      .filter((t: any) => t.status !== "archived")
      .map((t: any) => {
        const open = fInv
          .filter(
            (i: any) =>
              i.tenantProfileId === t.id &&
              i.status !== "paid" &&
              i.status !== "paid_external" &&
              i.status !== "voided",
          )
          .sort(
            (a: any, b: any) =>
              new Date(dueDateOf(a)).getTime() - new Date(dueDateOf(b)).getTime(),
          );
        const next = open[0];
        const schedule = schedules.find((s: any) => s.tenantProfileId === t.id);
        return {
          id: t.id,
          name: tenantFullName(t),
          address: t.propertyAddress || "no address",
          amt: next
            ? fmtNZD(amountOf(next))
            : schedule
              ? fmtNZD(schedule.amountCents ?? 0)
              : "—",
          due: next ? shortDate(dueDateOf(next)) : schedule ? "scheduled" : "nothing due",
          sortKey: next ? new Date(dueDateOf(next)).getTime() : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey);

    const addresses = Array.from(
      new Set(tenants.map((t: any) => t.propertyAddress).filter(Boolean)),
    ) as string[];

    return {
      total,
      growth,
      buckets,
      chartTotal,
      max,
      peak,
      selectedIdx,
      selected,
      health,
      detail,
      tenants: recentTenants,
      addresses,
      activeTenants: fTen.filter((t: any) => t.status !== "archived").length,
      isLoading: invoicesQuery.isLoading || tenantsQuery.isLoading,
      isError: invoicesQuery.isError || tenantsQuery.isError,
      refetch: () => {
        invoicesQuery.refetch();
        tenantsQuery.refetch();
      },
    };
  }, [invoices, tenants, schedules, tf, selBar, propFilter, invoicesQuery.isLoading, invoicesQuery.isError, tenantsQuery.isLoading, tenantsQuery.isError]);
}

export default function DesktopPropertyHome(props: DesktopRoutePageProps) {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<Timeframe>("week");
  const [selBar, setSelBar] = useState(-1);
  const [healthBox, setHealthBox] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [propFilter, setPropFilter] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);

  const m = usePropertyHomeModel(tf, selBar, propFilter);
  const { notifications } = useNotifications();

  const breakdownAmt = m.selected ? fmtDollars(m.selected.valueCents) : "$0";
  const avgCents = m.buckets.length ? Math.round(m.chartTotal / m.buckets.length) : 0;
  const sharePct =
    m.chartTotal > 0 && m.selected ? Math.round((m.selected.valueCents / m.chartTotal) * 100) : 0;
  const bestLabel = m.selected && m.selectedIdx === m.peak ? ` · best ${RANGE_UNIT[tf]}` : "";

  const filteredTenants = m.tenants.filter((t) =>
    `${t.name} ${t.address}`.toLowerCase().includes(search.toLowerCase()),
  );

  const notifDot = (type: string) =>
    type === "success" ? GREEN : type === "error" ? RED : type === "warning" ? AMBER : ACCENT;

  const go = (path: string) => () => setLocation(path);

  return (
    <DesktopPageScaffold {...props} vertical="property" page="home" showScope={false}>
      <style>{PH_CSS}</style>

      {/* ── LEFT COLUMN ── */}
      <div className="ph-left dt-cascade">
        <div className="ph-scope-wrap">
          <button
            type="button"
            className="ph-scope"
            aria-haspopup="listbox"
            aria-expanded={scopeOpen}
            aria-label={`${propFilter ?? "all properties"} scope`}
            onClick={() => setScopeOpen((o) => !o)}
          >
            <span>{propFilter ?? "all properties"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {scopeOpen && (
            <div className="ph-scope-menu" role="listbox">
              <button
                type="button"
                className="ph-scope-opt"
                role="option"
                aria-selected={propFilter === null}
                onClick={() => {
                  setPropFilter(null);
                  setScopeOpen(false);
                  setSelBar(-1);
                }}
              >
                all properties
              </button>
              {m.addresses.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="ph-scope-opt"
                  role="option"
                  aria-selected={propFilter === a}
                  onClick={() => {
                    setPropFilter(a);
                    setScopeOpen(false);
                    setSelBar(-1);
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* hero */}
        <div className="ph-hero">
          {m.isError ? (
            <div className="ph-error">
              <span>couldn't load your portfolio</span>
              <button type="button" onClick={() => m.refetch()}>retry</button>
            </div>
          ) : (
            <>
              <div className="ph-hero-row">
                <span className="ph-amount">{m.isLoading ? "—" : fmtDollars(m.total)}</span>
                {m.growth !== null && !m.isLoading && (
                  <span className="ph-pct">
                    {m.growth >= 0 ? "+" : ""}
                    {m.growth}%
                  </span>
                )}
              </div>
              <span className="ph-hero-sub">rent collected</span>
            </>
          )}
        </div>

        {/* bar chart */}
        <div className="ph-chart-wrap">
          <div className="ph-bars">
            {m.buckets.map((b, i) => (
              <button
                key={`${b.label}-${i}`}
                type="button"
                className="ph-bar-btn"
                aria-label={`${b.label} ${fmtDollars(b.valueCents)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelBar((p) => (p === i ? -1 : i));
                }}
              >
                <span
                  className="ph-bar"
                  style={{
                    height: `${Math.max(4, Math.round((b.valueCents / m.max) * 262))}px`,
                    background: selBar < 0 || i === m.selectedIdx ? ACCENT : BAR_DIM,
                  }}
                />
                <span className="ph-bar-label">{b.label}</span>
              </button>
            ))}
          </div>

          {/* range chips */}
          <div className="ph-segs-row">
            <div className="ph-segs">
              {RANGES.map((r) => {
                const on = r === tf;
                return (
                  <button
                    key={r}
                    type="button"
                    className="ph-seg"
                    aria-pressed={on}
                    style={{
                      background: on ? ACTIVE : "transparent",
                      color: on ? NAVY : "#6B7BB8",
                      fontWeight: on ? 700 : 600,
                    }}
                    onClick={() => {
                      setTf(r);
                      setSelBar(-1);
                    }}
                  >
                    {r[0].toUpperCase() + r.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* breakdown */}
        <div className="ph-breakdown">
          <div className="ph-bd-head">
            <span className="ph-bd-title">{tf.toUpperCase()} BREAKDOWN</span>
            <span className="ph-bd-hint">tap a bar</span>
          </div>
          <div className="ph-bd-body">
            <span className="ph-bd-col">
              <span className="ph-bd-amt">{m.isLoading ? "—" : breakdownAmt}</span>
              <span className="ph-bd-label">
                {m.selected?.label ?? "—"}
                {bestLabel}
              </span>
            </span>
            <span className="ph-bd-col">
              <span className="ph-bd-avg">{fmtDollars(avgCents)}</span>
              <span className="ph-bd-muted">average</span>
            </span>
            <span className="ph-bd-share">
              <span className="ph-bd-share-top">
                <span className="ph-bd-pct">{sharePct}%</span>
                <span className="ph-bd-muted">of the {tf}</span>
              </span>
              <span className="ph-bd-track">
                <span className="ph-bd-fill" style={{ width: `${sharePct}%` }} />
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="ph-right dt-cascade">
        {/* portfolio health */}
        <div className="ph-health" data-tutorial-id="property-home-health">
          {healthBox && m.detail[healthBox] ? (
            <div className="ph-hdet">
              <div className="ph-hdet-head">
                <span className="ph-bd-title">{m.detail[healthBox].title}</span>
                <button type="button" className="ph-hdet-back" aria-label="close" onClick={() => setHealthBox(null)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <div className="ph-hdet-rows">
                {m.detail[healthBox].rows.length === 0 ? (
                  <div className="ph-empty">nothing here right now</div>
                ) : (
                  m.detail[healthBox].rows.map((r, i) => (
                    <div key={i} className="ph-hdet-row">
                      <span className="ph-hdet-name">{r.name}</span>
                      <span className="ph-hdet-sub">{r.sub}</span>
                      <span className="ph-hdet-amt" style={{ color: r.col }}>{r.amt}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="ph-health-head">
                <span className="ph-bd-title">PORTFOLIO HEALTH</span>
                <span className="ph-bd-hint">tap a number</span>
              </div>
              <div className="ph-health-body">
                {m.health.map((st, i) => (
                  <button
                    key={st.k}
                    type="button"
                    className="ph-stat"
                    style={{
                      borderLeft: i ? "1px solid rgba(94,158,255,0.2)" : "none",
                      paddingLeft: i ? 22 : 0,
                    }}
                    onClick={() => setHealthBox(st.k)}
                  >
                    <span className="ph-stat-top">
                      <span className="ph-stat-v" style={{ color: st.col }}>{m.isLoading ? "—" : st.v}</span>
                      <span className="ph-stat-n">{m.isLoading ? "" : st.n}</span>
                    </span>
                    <span className="ph-stat-label">{st.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* notifications */}
        <div className="ph-notif" data-tutorial-id="property-home-notifications" style={{ height: notifOpen ? 194 : 108 }}>
          <span className="ph-notif-glow" />
          <button
            type="button"
            className="ph-notif-prev"
            style={{ opacity: notifOpen ? 0 : 1, pointerEvents: notifOpen ? "none" : "auto" }}
            onClick={() => setNotifOpen(true)}
          >
            <span className="ph-slot">
              <span className="ph-slot-a" />
              <span className="ph-slot-b" />
              <span className="ph-slot-c">
                <span className="ph-slot-dot" />
                <span className="ph-slot-line" />
                <span className="ph-slot-tag" />
              </span>
            </span>
            <span className="ph-notif-foot">
              <span className="ph-notif-count">
                <span className="ph-notif-badge">{notifications.length}</span>
                <span>notifications</span>
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(191,209,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </span>
          </button>
          <div
            className="ph-notif-list"
            style={{ opacity: notifOpen ? 1 : 0, pointerEvents: notifOpen ? "auto" : "none" }}
          >
            <button type="button" className="ph-notif-listhead" onClick={() => setNotifOpen(false)}>
              <span className="ph-notif-count">
                <span className="ph-notif-badge">{notifications.length}</span>
                <span>notifications</span>
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(191,209,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <div className="ph-notif-rows">
              {notifications.length === 0 ? (
                <div className="ph-empty">you're all caught up</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="ph-notif-item">
                    <span className="ph-notif-dot" style={{ background: notifDot(n.type) }} />
                    <span className="ph-notif-text">{n.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* search + view all */}
        <div className="ph-search-row">
          <div className="ph-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search tenants"
              aria-label="search tenants"
            />
          </div>
          <button type="button" className="ph-viewall" aria-label="view all tenants" onClick={go("/property/tenants")}>
            view all
          </button>
        </div>

        {/* tenants */}
        <div className="ph-tenants">
          {m.isLoading ? (
            <div className="ph-empty">loading…</div>
          ) : filteredTenants.length === 0 ? (
            <div className="ph-empty">{search ? "no matching tenants" : "no tenants yet"}</div>
          ) : (
            filteredTenants.slice(0, 3).map((t) => (
              <button
                key={t.id}
                type="button"
                className="ph-tenant"
                onClick={go(`/property/tenants/${t.id}`)}
              >
                <span className="ph-tenant-avatar">{initials(t.name)}</span>
                <span className="ph-tenant-mid">
                  <span className="ph-tenant-name">{t.name}</span>
                  <span className="ph-tenant-sub">{t.address}</span>
                </span>
                <span className="ph-tenant-right">
                  <span className="ph-tenant-amt">{t.amt}</span>
                  <span className="ph-tenant-label">next payment</span>
                  <span className="ph-tenant-due">{t.due}</span>
                </span>
              </button>
            ))
          )}
        </div>

        {/* quick actions */}
        <div className="ph-actions">
          <button type="button" className="ph-action ph-action-primary" data-tutorial-id="property-home-rent" aria-label="set up rent payment" onClick={go("/property/terminal")}>
            <span className="ph-action-glow" />
            <svg className="ph-action-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span className="ph-action-label" style={{ color: NAVY }}>set up<br />rent payment</span>
          </button>
          <button type="button" className="ph-action" data-tutorial-id="property-home-reminder" aria-label="send reminder" onClick={go("/property/terminal?mode=reminder")}>
            <span className="ph-action-glow" />
            <svg className="ph-action-ico" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="7" /><path d="M12 10v3l2 2" /><path d="M5 4 3 6M19 4l2 2" /></svg>
            <span className="ph-action-label">send<br />reminder</span>
          </button>
          <button type="button" className="ph-action" data-tutorial-id="property-home-expense" aria-label="send expense" onClick={go("/property/terminal?mode=expense")}>
            <span className="ph-action-glow" />
            <svg className="ph-action-ico" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9.5 8h5M9.5 12h5" /></svg>
            <span className="ph-action-label">send<br />expense</span>
          </button>
        </div>
      </div>
    </DesktopPageScaffold>
  );
}

const PH_CSS = `
.ph-left { position:absolute; left:52px; top:26px; width:440px; display:flex; flex-direction:column; }
/* The right column continues the left column's cascade rather than restarting
   it: four blocks on the left (steps 0–3), so the right picks up at step 4. */
.ph-right { position:absolute; left:588px; top:53px; width:481px; height:688px; display:flex; flex-direction:column; --dt-d:208ms; }

.ph-scope-wrap { position:relative; align-self:flex-start; z-index:5; }
.ph-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; text-transform:lowercase; }
.ph-scope:hover { background:rgba(94,158,255,0.08); }
.ph-scope-menu { position:absolute; top:calc(100% + 6px); left:0; min-width:220px; max-height:260px; overflow-y:auto; padding:6px; border-radius:14px; background:#0B1436; border:1px solid rgba(94,158,255,0.3); box-shadow:0 18px 40px rgba(0,4,24,0.5); display:flex; flex-direction:column; gap:2px; }
.ph-scope-opt { padding:9px 12px; border-radius:9px; background:transparent; font-weight:500; font-size:12.5px; color:${TEXT_SOFT}; text-align:left; cursor:pointer; transition:background .15s ease; text-transform:lowercase; }
.ph-scope-opt:hover { background:rgba(94,158,255,0.14); }
.ph-scope-opt[aria-selected="true"] { background:rgba(94,158,255,0.22); }

.ph-hero { margin-top:22px; }
.ph-hero-row { display:flex; align-items:flex-start; gap:16px; }
.ph-amount { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.ph-pct { margin-top:8px; padding:7px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:13.5px; color:${ACCENT_SOFT}; white-space:nowrap; }
.ph-hero-sub { display:block; margin-top:8px; font-weight:300; font-size:16px; color:${NAV_DIM}; }
.ph-error { display:flex; align-items:center; justify-content:space-between; gap:12px; height:78px; padding:0 18px; border-radius:14px; background:rgba(240,101,108,0.14); border:1px solid rgba(240,101,108,0.32); }
.ph-error span { color:#FFB3B8; font-size:13.5px; }
.ph-error button { background:${ACCENT}; color:${NAVY}; border-radius:10px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; }

.ph-chart-wrap { margin-top:36px; }
.ph-bars { display:flex; align-items:flex-end; gap:16px; height:298px; }
.ph-bar-btn { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:12px; height:100%; cursor:pointer; background:transparent; }
.ph-bar { width:100%; max-width:36px; border-radius:10px; transition:height .3s ease, background .2s ease; }
.ph-bar-label { font-weight:400; font-size:21px; color:${ACCENT}; }
.ph-segs-row { margin-top:16px; display:flex; justify-content:center; }
.ph-segs { display:flex; align-items:center; padding:4px; border-radius:9999px; background:${CHIP}; }
.ph-seg { padding:9px 0; width:76px; border-radius:9999px; font-size:12px; cursor:pointer; transition:background .18s ease, color .18s ease; }

.ph-breakdown { margin-top:24px; height:138px; border-radius:12px; border:1.5px solid rgba(94,158,255,0.5); box-sizing:border-box; padding:18px 22px; display:flex; flex-direction:column; justify-content:space-between; }
.ph-bd-head { display:flex; align-items:center; justify-content:space-between; }
.ph-bd-title { font-weight:300; font-size:11px; letter-spacing:0.22em; color:${ACCENT_SOFT}; }
.ph-bd-hint { font-weight:300; font-size:11px; color:rgba(244,246,255,0.4); }
.ph-bd-body { display:flex; align-items:flex-end; gap:26px; }
.ph-bd-col { display:flex; flex-direction:column; gap:3px; }
.ph-bd-amt { font-family:'Outfit',sans-serif; font-weight:800; font-size:30px; line-height:1; color:${TEXT_SOFT}; }
.ph-bd-label { font-weight:300; font-size:12px; color:${ACCENT_SOFT}; text-transform:capitalize; }
.ph-bd-avg { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; line-height:1; color:rgba(244,246,255,0.75); }
.ph-bd-muted { font-weight:300; font-size:11px; color:rgba(244,246,255,0.45); }
.ph-bd-share { flex:1; display:flex; flex-direction:column; gap:7px; }
.ph-bd-share-top { display:flex; align-items:baseline; justify-content:space-between; }
.ph-bd-pct { font-weight:800; font-size:13px; color:${ACCENT}; }
.ph-bd-track { display:block; height:5px; border-radius:3px; background:rgba(94,158,255,0.18); overflow:hidden; }
.ph-bd-fill { display:block; height:100%; border-radius:3px; background:${ACCENT}; transition:width .3s ease; }

.ph-health { flex:0 0 auto; height:182px; border-radius:16px; border:1.5px solid rgba(94,158,255,0.5); box-sizing:border-box; padding:18px 24px; display:flex; flex-direction:column; overflow:hidden; }
.ph-health-head { display:flex; align-items:center; justify-content:space-between; }
.ph-health-body { flex:1; display:flex; align-items:center; }
.ph-stat { flex:1; display:flex; flex-direction:column; align-items:flex-start; gap:4px; cursor:pointer; background:transparent; }
.ph-stat-top { display:flex; align-items:baseline; gap:7px; }
.ph-stat-v { font-family:'Outfit',sans-serif; font-weight:800; font-size:34px; line-height:1; }
.ph-stat-n { font-weight:400; font-size:13px; color:rgba(244,246,255,0.55); }
.ph-stat-label { font-weight:300; font-size:12.5px; color:${ACCENT_SOFT}; }
.ph-hdet { animation:tileIn .3s cubic-bezier(.22,.9,.3,1) both; display:flex; flex-direction:column; flex:1; min-height:0; }
.ph-hdet-head { display:flex; align-items:center; justify-content:space-between; }
.ph-hdet-back { width:26px; height:26px; border-radius:50%; border:1px solid rgba(94,158,255,0.5); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.ph-hdet-back:hover { background:rgba(94,158,255,0.1); }
.ph-hdet-rows { margin-top:8px; display:flex; flex-direction:column; flex:1; min-height:0; overflow-y:auto; }
.ph-hdet-row { display:flex; align-items:center; gap:12px; padding:7px 0; border-bottom:1px solid rgba(94,158,255,0.12); }
.ph-hdet-name { font-weight:600; font-size:12.5px; color:${TEXT_SOFT}; flex:1; min-width:0; text-transform:capitalize; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ph-hdet-sub { font-weight:300; font-size:11.5px; color:rgba(244,246,255,0.5); white-space:nowrap; }
.ph-hdet-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:13.5px; }

.ph-notif { position:relative; flex:0 0 auto; margin-top:26px; border-radius:16px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); overflow:hidden; transition:height .42s cubic-bezier(.22,.9,.3,1); }
.ph-notif-glow { position:absolute; left:-20%; top:-70%; width:140%; height:240%; border-radius:50%; background:radial-gradient(closest-side,rgba(102,169,255,0.18),transparent 70%); animation:glowDrift 10s ease-in-out -5s infinite; pointer-events:none; }
.ph-notif-prev { position:absolute; inset:0; padding:14px 18px; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; transition:opacity .26s ease; text-align:left; background:transparent; }
.ph-slot { position:relative; height:46px; display:block; }
.ph-slot-a { position:absolute; left:26px; right:26px; top:0; height:22px; border-radius:8px; background:rgba(255,255,255,0.10); }
.ph-slot-b { position:absolute; left:14px; right:14px; top:6px; height:26px; border-radius:9px; background:rgba(255,255,255,0.18); box-shadow:0 4px 10px rgba(0,4,20,0.28); }
.ph-slot-c { position:absolute; left:4px; right:4px; top:12px; height:32px; border-radius:10px; background:rgba(238,243,255,0.92); box-shadow:0 8px 16px rgba(0,4,20,0.34); display:flex; align-items:center; gap:8px; padding:0 12px; box-sizing:border-box; }
.ph-slot-dot { width:6px; height:6px; border-radius:50%; background:${GREEN}; flex:0 0 auto; }
.ph-slot-line { flex:1; height:6px; border-radius:3px; background:rgba(20,30,60,0.16); }
.ph-slot-tag { width:26px; height:6px; border-radius:3px; background:rgba(20,30,60,0.10); flex:0 0 auto; }
.ph-notif-foot { display:flex; align-items:center; justify-content:space-between; }
.ph-notif-count { display:flex; align-items:center; gap:7px; font-weight:300; font-size:11.5px; color:rgba(191,209,255,0.85); }
.ph-notif-badge { width:16px; height:16px; border-radius:50%; background:rgba(255,255,255,0.16); color:#fff; font-weight:700; font-size:9px; display:flex; align-items:center; justify-content:center; }
.ph-notif-list { position:absolute; inset:0; padding:14px 16px 10px; display:flex; flex-direction:column; transition:opacity .3s ease .05s; }
.ph-notif-listhead { display:flex; align-items:center; justify-content:space-between; flex:0 0 auto; padding:0 2px 8px; cursor:pointer; background:transparent; }
.ph-notif-rows { flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding-right:4px; }
.ph-notif-item { flex:0 0 auto; display:flex; align-items:center; gap:9px; padding:11px 12px; border-radius:9px; background:rgba(255,255,255,0.07); box-shadow:inset 0 1px 0 rgba(255,255,255,0.08); }
.ph-notif-dot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
.ph-notif-text { flex:1; font-weight:300; font-size:11.5px; color:#E8F0FF; min-width:0; }

.ph-search-row { flex:0 0 auto; margin-top:24px; display:flex; align-items:center; gap:14px; }
.ph-search { flex:1; display:flex; align-items:center; gap:10px; height:44px; padding:0 18px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); box-sizing:border-box; }
.ph-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:13px; }
.ph-viewall { display:inline-flex; align-items:center; height:44px; padding:0 22px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13px; color:${TEXT_SOFT}; cursor:pointer; transition:background .18s ease; box-sizing:border-box; }
.ph-viewall:hover { background:rgba(94,158,255,0.08); }

.ph-tenants { margin-top:20px; display:flex; flex-direction:column; gap:18px; flex:0 1 auto; min-height:0; overflow:hidden; }
.ph-tenant { display:flex; align-items:center; gap:14px; background:transparent; cursor:pointer; text-align:left; }
.ph-tenant:hover .ph-tenant-name { color:#fff; }
.ph-tenant-avatar { width:44px; height:44px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; color:#fff; flex:0 0 auto; box-sizing:border-box; }
.ph-tenant-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.ph-tenant-name { font-weight:300; font-size:14.5px; color:${TEXT_SOFT}; text-transform:capitalize; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:color .15s ease; }
.ph-tenant-sub { font-weight:500; font-size:12px; color:rgba(244,246,255,0.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ph-tenant-right { display:flex; flex-direction:column; align-items:flex-end; gap:1px; flex:0 0 auto; }
.ph-tenant-amt { font-weight:800; font-size:15.5px; color:#fff; }
.ph-tenant-label { font-weight:600; font-size:9px; color:rgba(244,246,255,0.5); }
.ph-tenant-due { font-weight:600; font-size:10px; color:rgba(244,246,255,0.5); }

.ph-actions { flex:0 0 auto; margin-top:26px; display:flex; gap:14px; }
.ph-action { position:relative; flex:1; height:88px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); overflow:hidden; cursor:pointer; text-align:left; transition:background .18s ease; }
.ph-action:hover { background:rgba(255,255,255,0.1); }
.ph-action-primary { background:${ACTIVE}; border:none; box-shadow:inset 0 1px 0 rgba(255,255,255,0.3); }
.ph-action-primary:hover { background:#79B4FF; }
.ph-action-glow { position:absolute; left:-22%; top:-58%; width:144%; height:216%; border-radius:50%; background:radial-gradient(closest-side,rgba(102,169,255,0.18),transparent 70%); animation:glowDrift 11s ease-in-out infinite; pointer-events:none; }
.ph-action-primary .ph-action-glow { background:radial-gradient(closest-side,rgba(255,255,255,0.22),transparent 70%); }
.ph-action-ico { position:absolute; top:12px; right:12px; }
.ph-action-label { position:absolute; left:14px; bottom:12px; font-weight:500; font-size:13.5px; line-height:1.25; color:#E8F0FF; }

.ph-empty { display:flex; align-items:center; justify-content:center; flex:1; min-height:64px; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }
`;
