import { useMemo, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useNotifications } from "@/components/notification-system";
import {
  TRADES_HOME_RANGES,
  buildTradesHomeModel,
  scopeTradesData,
  tradesPeriodWindow,
  useTradesHomeQueries,
  type TradesHealthId,
  type TradesClientRow,
  type TradesHomeRange,
} from "../data/trades-data";
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

const RANGES = TRADES_HOME_RANGES;
const RANGE_UNIT: Record<TradesHomeRange, string> = {
  day: "hour",
  week: "day",
  month: "week",
  year: "month",
};

const fmtDollars = (cents: number) => "$" + Math.round(cents / 100).toLocaleString("en-NZ");
const money2 = (cents: number) =>
  "$" +
  (cents / 100).toLocaleString("en-NZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function numericDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "2-digit",
  });
}

function clientName(client: { firstName?: string; lastName?: string } | undefined) {
  return `${client?.firstName ?? ""} ${client?.lastName ?? ""}`.trim() || "client";
}

function bucketName(
  timeframe: TradesHomeRange,
  start: Date,
  index: number,
): string {
  if (timeframe === "day") {
    return start
      .toLocaleTimeString("en-NZ", { hour: "numeric", hour12: true })
      .replace(/\s/g, "")
      .toLowerCase();
  }
  if (timeframe === "week") {
    return start.toLocaleDateString("en-NZ", { weekday: "long" }).toLowerCase();
  }
  if (timeframe === "month") return `week ${index + 1}`;
  return start.toLocaleDateString("en-NZ", { month: "short" }).toLowerCase();
}

interface DetailRow {
  id: string;
  name: string;
  sub: string;
  amt: string;
  col: string;
}
function clientStatusLabel(row: TradesClientRow): string {
  if (row.status === "delivery failed") return "not delivered";
  if (row.status === "overdue") return "overdue";
  if (row.status === "awaiting deposit") return "awaiting deposit";
  if (row.status === "paid") return "paid";
  if (row.status === "no invoice") return "no invoice";
  if (row.invoiceStatus === "pending_dispatch") return "queued";
  if (row.invoiceStatus === "viewed") return "viewed";
  return "invoice sent";
}

function clientDueLabel(row: TradesClientRow): string {
  if (!row.invoice) return "";
  const paid = row.status === "paid";
  const date = numericDate(paid ? row.invoice.paidAt : row.dueAt);
  return date ? `${paid ? "paid" : "due"} ${date}` : "";
}

export default function DesktopTradesHome(props: DesktopRoutePageProps) {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<TradesHomeRange>("week");
  const [selBar, setSelBar] = useState(-1);
  const [healthBox, setHealthBox] = useState<TradesHealthId | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [modelNow] = useState(() => new Date());

  const { clientsQuery, invoicesQuery, quotesQuery } = useTradesHomeQueries();
  const clients = clientsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const quotes = quotesQuery.data ?? [];
  const m = useMemo(
    () =>
      buildTradesHomeModel({
        clients,
        invoices,
        quotes,
        timeframe: tf,
        selectedBar: selBar,
        siteFilter,
        now: modelNow,
      }),
    [clients, invoices, quotes, tf, selBar, siteFilter, modelNow],
  );
  const quoted = useMemo(() => {
    const scoped = scopeTradesData(clients, invoices, quotes, siteFilter);
    const { start, end } = tradesPeriodWindow(tf, modelNow);
    const rows = scoped.quotes.filter((quote) => {
      const created = quote.createdAt ? new Date(quote.createdAt).getTime() : NaN;
      return Number.isFinite(created) && created >= start.getTime() && created < end.getTime();
    });
    return { count: rows.length, cents: rows.reduce((sum, quote) => sum + quote.totalCents, 0) };
  }, [clients, invoices, quotes, siteFilter, tf, modelNow]);
  const { notifications } = useNotifications();

  const isLoading =
    clientsQuery.isLoading || invoicesQuery.isLoading || quotesQuery.isLoading;
  const isError =
    clientsQuery.isError || invoicesQuery.isError || quotesQuery.isError;
  const refetch = () => {
    void clientsQuery.refetch();
    void invoicesQuery.refetch();
    void quotesQuery.refetch();
  };

  const chartTotal = m.revenue.buckets.reduce(
    (sum, bucket) => sum + bucket.valueCents,
    0,
  );
  const selected = m.revenue.selected;
  const breakdownAmt = selected ? fmtDollars(selected.valueCents) : "$0";
  const avgCents = m.revenue.buckets.length
    ? Math.round(chartTotal / m.revenue.buckets.length)
    : 0;
  const sharePct =
    chartTotal > 0 && selected
      ? Math.round((selected.valueCents / chartTotal) * 100)
      : 0;
  const bestLabel =
    selected && selected.valueCents > 0 && selected.valueCents === m.revenue.maxCents
      ? ` · best ${RANGE_UNIT[tf]}`
      : "";
  const selectedLabel = selected
    ? bucketName(tf, selected.start, m.revenue.selectedIdx)
    : "—";

  const detail = useMemo(() => {
    const toRows = (id: TradesHealthId): DetailRow[] =>
      m.healthRowsById[id].map((row) => {
        const client = m.clientById.get(row.clientProfileId);
        const site = client?.siteAddress.trim() || "no site address";
        let context = row.status.replace(/_/g, " ");
        if (id === "overdue") {
          const due = row.dueAt ? new Date(row.dueAt).getTime() : NaN;
          const days = Number.isFinite(due)
            ? Math.max(1, Math.ceil((modelNow.getTime() - due) / 86_400_000))
            : null;
          context = days ? `${days} day${days === 1 ? "" : "s"}` : "overdue";
        } else if (id === "awaiting-deposit") {
          const due = numericDate(row.dueAt);
          context = due ? `due ${due}` : "awaiting deposit";
        } else {
          const eventAt = row.quote?.viewedAt || row.quote?.sentAt || row.createdAt;
          const eventDate = numericDate(eventAt);
          context = `${row.status.replace(/_/g, " ")}${eventDate ? ` ${eventDate}` : ""}`;
        }
        return {
          id: `${row.sourceType}-${row.id}`,
          name: clientName(client),
          sub: `${site} · ${context}`,
          amt: money2(row.amountCents),
          col: id === "overdue" ? ACCENT : TEXT_SOFT,
        };
      });

    return {
      overdue: {
        title: "OVERDUE — CHASE THESE UP",
        rows: toRows("overdue"),
      },
      "awaiting-deposit": {
        title: "AWAITING DEPOSIT ON ACCEPTANCE",
        rows: toRows("awaiting-deposit"),
      },
      "awaiting-reply": {
        title: `QUOTES AWAITING REPLY — ${fmtDollars(
          m.healthById["awaiting-reply"].amountCents,
        )}`,
        rows: toRows("awaiting-reply"),
      },
    } satisfies Record<TradesHealthId, { title: string; rows: DetailRow[] }>;
  }, [m.healthRowsById, m.healthById, m.clientById, modelNow]);

  const query = search.trim().toLowerCase();
  const filteredClients = m.clientRows.filter((row) =>
    `${row.name} ${row.siteAddress}`.toLowerCase().includes(query),
  );

  const notifDot = (type: string) =>
    type === "success"
      ? GREEN
      : type === "error"
        ? RED
        : type === "warning"
          ? AMBER
          : ACCENT;

  const go = (path: string) => () => setLocation(path);

  return (
    <DesktopPageScaffold {...props} vertical="trades" page="home" showScope={false}>
      <style>{TH_CSS}</style>

      {/* ── LEFT COLUMN ── */}
      {/* Entry cascade: the left column runs steps 0–3, the right column picks
          up at step 4 via `--dt-d` so the screen reads as one sequence. */}
      <div className="th-left dt-cascade">
        <div className="th-scope-wrap">
          <button
            type="button"
            className="th-scope"
            aria-haspopup="listbox"
            aria-expanded={scopeOpen}
            aria-label={`${siteFilter ?? "all sites"} scope`}
            onClick={() => setScopeOpen((o) => !o)}
          >
            <span>{siteFilter ?? "all sites"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {scopeOpen && (
            <div className="th-scope-menu" role="listbox">
              <button
                type="button"
                className="th-scope-opt"
                role="option"
                aria-selected={siteFilter === null}
                onClick={() => {
                  setSiteFilter(null);
                  setScopeOpen(false);
                  setSelBar(-1);
                }}
              >
                all sites
              </button>
              {m.sites.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="th-scope-opt"
                  role="option"
                  aria-selected={siteFilter === a}
                  onClick={() => {
                    setSiteFilter(a);
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
        <div className="th-hero">
          {isError ? (
            <div className="th-error">
              <span>couldn't load your business</span>
              <button type="button" onClick={() => refetch()}>retry</button>
            </div>
          ) : (
            <>
              <div className="th-hero-row">
                <span className="th-amount">{isLoading ? "—" : fmtDollars(m.revenue.totalCents)}</span>
                {m.revenue.growthPct !== null && !isLoading && (
                  <span className="th-pct">
                    {m.revenue.growthPct >= 0 ? "+" : ""}
                    {m.revenue.growthPct}%
                  </span>
                )}
              </div>
              <span className="th-hero-sub">revenue collected</span>
              <span className="th-hero-sub2">{isLoading ? "—" : fmtDollars(quoted.cents) + " quoted · " + quoted.count + " job" + (quoted.count === 1 ? "" : "s")}</span>
            </>
          )}
        </div>

        {/* bar chart */}
        <div className="th-chart-wrap">
          <div className="th-bars">
            {m.revenue.buckets.map((b, i) => (
              <button
                key={`${b.label}-${i}`}
                type="button"
                className="th-bar-btn"
                aria-label={`${b.label} ${fmtDollars(b.valueCents)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelBar((p) => (p === i ? -1 : i));
                }}
              >
                <span
                  className="th-bar"
                  style={{
                    height: `${Math.max(4, Math.round((b.valueCents / Math.max(m.revenue.maxCents, 1)) * 262))}px`,
                    background: selBar < 0 || i === m.revenue.selectedIdx ? ACCENT : BAR_DIM,
                  }}
                />
                <span className="th-bar-label">{b.label}</span>
              </button>
            ))}
          </div>

          {/* range chips */}
          <div className="th-segs-row">
            <div className="th-segs">
              {RANGES.map((r) => {
                const on = r === tf;
                return (
                  <button
                    key={r}
                    type="button"
                    className="th-seg"
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
        <div className="th-breakdown">
          <div className="th-bd-head">
            <span className="th-bd-title">{tf.toUpperCase()} BREAKDOWN</span>
            <span className="th-bd-hint">tap a bar</span>
          </div>
          <div className="th-bd-body">
            <span className="th-bd-col">
              <span className="th-bd-amt">{isLoading ? "—" : breakdownAmt}</span>
              <span className="th-bd-label">
                {selectedLabel ?? "—"}
                {bestLabel}
              </span>
            </span>
            <span className="th-bd-col">
              <span className="th-bd-avg">{fmtDollars(avgCents)}</span>
              <span className="th-bd-muted">average</span>
            </span>
            <span className="th-bd-share">
              <span className="th-bd-share-top">
                <span className="th-bd-pct">{sharePct}%</span>
                <span className="th-bd-muted">of the {tf}</span>
              </span>
              <span className="th-bd-track">
                <span className="th-bd-fill" style={{ width: `${sharePct}%` }} />
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="th-right dt-cascade" style={{ "--dt-d": "208ms" } as CSSProperties}>
        {/* business health */}
        <div className="th-health" data-tutorial-id="trades-home-health">
          {healthBox && detail[healthBox] ? (
            <div className="th-hdet">
              <div className="th-hdet-head">
                <span className="th-bd-title">{detail[healthBox].title}</span>
                <button type="button" className="th-hdet-back" aria-label="close business health detail" onClick={() => setHealthBox(null)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <div className="th-hdet-rows">
                {detail[healthBox].rows.length === 0 ? (
                  <div className="th-empty">nothing here right now</div>
                ) : (
                  detail[healthBox].rows.map((r) => (
                    <div key={r.id} className="th-hdet-row">
                      <span className="th-hdet-name">{r.name}</span>
                      <span className="th-hdet-sub">{r.sub}</span>
                      <span className="th-hdet-amt" style={{ color: r.col }}>{r.amt}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="th-health-head">
                <span className="th-bd-title">BUSINESS HEALTH</span>
                <span className="th-bd-hint">tap a number</span>
              </div>
              <div className="th-health-body">
                {m.health.map((st, i) => (
                  <button
                    key={st.id}
                    type="button"
                    className="th-stat"
                    aria-label={`view ${st.label}`}
                    style={{
                      borderLeft: i ? "1px solid rgba(94,158,255,0.2)" : "none",
                      paddingLeft: i ? 22 : 0,
                    }}
                    onClick={() => setHealthBox(st.id)}
                  >
                    <span className="th-stat-top">
                      <span className="th-stat-v" style={{ color: st.id === "overdue" ? ACCENT : TEXT_SOFT }}>{isLoading ? "—" : st.id === "awaiting-reply" ? String(st.count) : fmtDollars(st.amountCents)}</span>
                      <span className="th-stat-n">{isLoading ? "" : st.id === "awaiting-reply" ? fmtDollars(st.amountCents) : String(st.count)}</span>
                    </span>
                    <span className="th-stat-label">{st.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* notifications */}
        <div className="th-notif" data-tutorial-id="trades-home-notifications" style={{ height: notifOpen ? 194 : 108 }}>
          <span className="th-notif-glow" />
          <button
            type="button"
            className="th-notif-prev"
            aria-label="open notifications"
            style={{ opacity: notifOpen ? 0 : 1, pointerEvents: notifOpen ? "none" : "auto" }}
            onClick={() => setNotifOpen(true)}
          >
            <span className="th-slot">
              <span className="th-slot-a" />
              <span className="th-slot-b" />
              <span className="th-slot-c">
                <span className="th-slot-dot" />
                <span className="th-slot-line" />
                <span className="th-slot-tag" />
              </span>
            </span>
            <span className="th-notif-foot">
              <span className="th-notif-count">
                <span className="th-notif-badge">{notifications.length}</span>
                <span>notifications</span>
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(191,209,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </span>
          </button>
          <div
            className="th-notif-list"
            style={{ opacity: notifOpen ? 1 : 0, pointerEvents: notifOpen ? "auto" : "none" }}
          >
            <button type="button" className="th-notif-listhead" aria-label="close notifications" onClick={() => setNotifOpen(false)}>
              <span className="th-notif-count">
                <span className="th-notif-badge">{notifications.length}</span>
                <span>notifications</span>
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(191,209,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <div className="th-notif-rows">
              {notifications.length === 0 ? (
                <div className="th-empty">you're all caught up</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="th-notif-item">
                    <span className="th-notif-dot" style={{ background: notifDot(n.type) }} />
                    <span className="th-notif-text">{n.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* search + view all */}
        <div className="th-search-row">
          <div className="th-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search clients or site"
              aria-label="search clients or site"
            />
          </div>
          <button type="button" className="th-viewall" aria-label="view all clients" onClick={go("/trades/clients")}>
            view all
          </button>
        </div>

        {/* clients */}
        <div className="th-clients">
          {isLoading ? (
            <div className="th-empty">loading…</div>
          ) : filteredClients.length === 0 ? (
            <div className="th-empty">{query ? "no matching clients" : "no clients yet"}</div>
          ) : (
            filteredClients.slice(0, 3).map((t) => (
              <button
                key={t.id}
                type="button"
                className="th-client"
                aria-label={`view ${t.name}`}
                onClick={go(`/trades/clients/${t.id}`)}
              >
                <span className="th-client-avatar">{t.initials}</span>
                <span className="th-client-mid">
                  <span className="th-client-name">{t.name}</span>
                  <span className="th-client-sub">{t.siteAddress || "no site address"}</span>
                </span>
                <span className="th-client-right">
                  <span className="th-client-amt">{t.amountCents === null ? "—" : money2(t.amountCents)}</span>
                  <span className="th-client-label">{clientStatusLabel(t)}</span>
                  <span className="th-client-due">{clientDueLabel(t)}</span>
                </span>
              </button>
            ))
          )}
        </div>

        {/* quick actions */}
        <div className="th-actions" data-tutorial-id="trades-home-actions">
          <button type="button" className="th-action th-action-primary" aria-label="new quote" onClick={go("/trades/quote")}>
            <span className="th-action-glow" />
            <svg className="th-action-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span className="th-action-label" style={{ color: NAVY }}>new<br />quote</span>
          </button>
          <button type="button" className="th-action" aria-label="quick invoice" onClick={go("/trades/terminal?quick=1")}>
            <span className="th-action-glow" />
            <svg className="th-action-ico" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9.5 8h5M9.5 12h5" /></svg>
            <span className="th-action-label">quick<br />invoice</span>
          </button>
          <button type="button" className="th-action" aria-label="recurring jobs" onClick={go("/trades/recurring")}>
            <span className="th-action-glow" />
            <svg className="th-action-ico" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
            <span className="th-action-label">recurring<br />jobs</span>
          </button>
        </div>
      </div>
    </DesktopPageScaffold>
  );
}

const TH_CSS = `
.th-left { position:absolute; left:52px; top:26px; width:440px; display:flex; flex-direction:column; }
.th-right { position:absolute; left:588px; top:53px; width:481px; height:688px; display:flex; flex-direction:column; }

.th-scope-wrap { position:relative; align-self:flex-start; z-index:5; }
.th-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; text-transform:lowercase; }
.th-scope:hover { background:rgba(94,158,255,0.08); }
.th-scope-menu { position:absolute; top:calc(100% + 6px); left:0; min-width:220px; max-height:260px; overflow-y:auto; padding:6px; border-radius:14px; background:#0B1436; border:1px solid rgba(94,158,255,0.3); box-shadow:0 18px 40px rgba(0,4,24,0.5); display:flex; flex-direction:column; gap:2px; }
.th-scope-opt { padding:9px 12px; border-radius:9px; background:transparent; font-weight:500; font-size:12.5px; color:${TEXT_SOFT}; text-align:left; cursor:pointer; transition:background .15s ease; text-transform:lowercase; }
.th-scope-opt:hover { background:rgba(94,158,255,0.14); }
.th-scope-opt[aria-selected="true"] { background:rgba(94,158,255,0.22); }

.th-hero { margin-top:22px; }
.th-hero-row { display:flex; align-items:flex-start; gap:16px; }
.th-amount { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.th-pct { margin-top:8px; padding:7px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:13.5px; color:${ACCENT_SOFT}; white-space:nowrap; }
.th-hero-sub { display:block; margin-top:8px; font-weight:300; font-size:16px; color:; }
.th-hero-sub2 { display:block; margin-top:4px; font-weight:300; font-size:13px; color:rgba(74,134,240,.78); }
.th-error { display:flex; align-items:center; justify-content:space-between; gap:12px; height:78px; padding:0 18px; border-radius:14px; background:rgba(240,101,108,0.14); border:1px solid rgba(240,101,108,0.32); }
.th-error span { color:#FFB3B8; font-size:13.5px; }
.th-error button { background:${ACCENT}; color:${NAVY}; border-radius:10px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; }

.th-chart-wrap { margin-top:36px; }
.th-bars { display:flex; align-items:flex-end; gap:16px; height:298px; }
.th-bar-btn { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:12px; height:100%; cursor:pointer; background:transparent; }
.th-bar { width:100%; max-width:36px; border-radius:10px; transition:height .3s ease, background .2s ease; }
.th-bar-label { font-weight:400; font-size:21px; color:${ACCENT}; }
.th-segs-row { margin-top:16px; display:flex; justify-content:center; }
.th-segs { display:flex; align-items:center; padding:4px; border-radius:9999px; background:${CHIP}; }
.th-seg { padding:9px 0; width:76px; border-radius:9999px; font-size:12px; cursor:pointer; transition:background .18s ease, color .18s ease; }

.th-breakdown { margin-top:24px; height:138px; border-radius:12px; border:1.5px solid rgba(94,158,255,0.5); box-sizing:border-box; padding:18px 22px; display:flex; flex-direction:column; justify-content:space-between; }
.th-bd-head { display:flex; align-items:center; justify-content:space-between; }
.th-bd-title { font-weight:300; font-size:11px; letter-spacing:0.22em; color:${ACCENT_SOFT}; }
.th-bd-hint { font-weight:300; font-size:11px; color:rgba(244,246,255,0.4); }
.th-bd-body { display:flex; align-items:flex-end; gap:26px; }
.th-bd-col { display:flex; flex-direction:column; gap:3px; }
.th-bd-amt { font-family:'Outfit',sans-serif; font-weight:800; font-size:30px; line-height:1; color:${TEXT_SOFT}; }
.th-bd-label { font-weight:300; font-size:12px; color:${ACCENT_SOFT}; text-transform:capitalize; }
.th-bd-avg { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; line-height:1; color:rgba(244,246,255,0.75); }
.th-bd-muted { font-weight:300; font-size:11px; color:rgba(244,246,255,0.45); }
.th-bd-share { flex:1; display:flex; flex-direction:column; gap:7px; }
.th-bd-share-top { display:flex; align-items:baseline; justify-content:space-between; }
.th-bd-pct { font-weight:800; font-size:13px; color:${ACCENT}; }
.th-bd-track { display:block; height:5px; border-radius:3px; background:rgba(94,158,255,0.18); overflow:hidden; }
.th-bd-fill { display:block; height:100%; border-radius:3px; background:${ACCENT}; transition:width .3s ease; }

.th-health { flex:0 0 auto; height:182px; border-radius:16px; border:1.5px solid rgba(94,158,255,0.5); box-sizing:border-box; padding:18px 24px; display:flex; flex-direction:column; overflow:hidden; }
.th-health-head { display:flex; align-items:center; justify-content:space-between; }
.th-health-body { flex:1; display:flex; align-items:center; }
.th-stat { flex:1; display:flex; flex-direction:column; align-items:flex-start; gap:4px; cursor:pointer; background:transparent; }
.th-stat-top { display:flex; align-items:baseline; gap:7px; }
.th-stat-v { font-family:'Outfit',sans-serif; font-weight:800; font-size:34px; line-height:1; }
.th-stat-n { font-weight:400; font-size:13px; color:rgba(244,246,255,0.55); }
.th-stat-label { font-weight:300; font-size:12.5px; color:${ACCENT_SOFT}; }
.th-hdet { animation:tileIn .3s cubic-bezier(.22,.9,.3,1) both; display:flex; flex-direction:column; flex:1; min-height:0; }
.th-hdet-head { display:flex; align-items:center; justify-content:space-between; }
.th-hdet-back { width:26px; height:26px; border-radius:50%; border:1px solid rgba(94,158,255,0.5); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.th-hdet-back:hover { background:rgba(94,158,255,0.1); }
.th-hdet-rows { margin-top:8px; display:flex; flex-direction:column; flex:1; min-height:0; overflow-y:auto; }
.th-hdet-row { display:flex; align-items:center; gap:12px; padding:7px 0; border-bottom:1px solid rgba(94,158,255,0.12); }
.th-hdet-name { font-weight:600; font-size:12.5px; color:${TEXT_SOFT}; flex:1; min-width:0; text-transform:capitalize; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.th-hdet-sub { font-weight:300; font-size:11.5px; color:rgba(244,246,255,0.5); white-space:nowrap; }
.th-hdet-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:13.5px; }

.th-notif { position:relative; flex:0 0 auto; margin-top:26px; border-radius:16px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); overflow:hidden; transition:height .42s cubic-bezier(.22,.9,.3,1); }
.th-notif-glow { position:absolute; left:-20%; top:-70%; width:140%; height:240%; border-radius:50%; background:radial-gradient(closest-side,rgba(102,169,255,0.18),transparent 70%); animation:glowDrift 10s ease-in-out -5s infinite; pointer-events:none; }
.th-notif-prev { position:absolute; inset:0; padding:14px 18px; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; transition:opacity .26s ease; text-align:left; background:transparent; }
.th-slot { position:relative; width:100%; height:46px; display:block; }
.th-slot-a { position:absolute; left:26px; right:26px; top:0; height:22px; border-radius:8px; background:rgba(255,255,255,0.10); }
.th-slot-b { position:absolute; left:14px; right:14px; top:6px; height:26px; border-radius:9px; background:rgba(255,255,255,0.18); box-shadow:0 4px 10px rgba(0,4,20,0.28); }
.th-slot-c { position:absolute; left:4px; right:4px; top:12px; height:32px; border-radius:10px; background:rgba(238,243,255,0.92); box-shadow:0 8px 16px rgba(0,4,20,0.34); display:flex; align-items:center; gap:8px; padding:0 12px; box-sizing:border-box; }
.th-slot-dot { width:6px; height:6px; border-radius:50%; background:${GREEN}; flex:0 0 auto; }
.th-slot-line { flex:1; height:6px; border-radius:3px; background:rgba(20,30,60,0.16); }
.th-slot-tag { width:26px; height:6px; border-radius:3px; background:rgba(20,30,60,0.10); flex:0 0 auto; }
.th-notif-foot { display:flex; align-items:center; justify-content:space-between; }
.th-notif-count { display:flex; align-items:center; gap:7px; font-weight:300; font-size:11.5px; color:rgba(191,209,255,0.85); }
.th-notif-badge { width:16px; height:16px; border-radius:50%; background:rgba(255,255,255,0.16); color:#fff; font-weight:700; font-size:9px; display:flex; align-items:center; justify-content:center; }
.th-notif-list { position:absolute; inset:0; padding:14px 16px 10px; display:flex; flex-direction:column; transition:opacity .3s ease .05s; }
.th-notif-listhead { display:flex; align-items:center; justify-content:space-between; flex:0 0 auto; padding:0 2px 8px; cursor:pointer; background:transparent; }
.th-notif-rows { flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding-right:4px; }
.th-notif-item { flex:0 0 auto; display:flex; align-items:center; gap:9px; padding:11px 12px; border-radius:9px; background:rgba(255,255,255,0.07); box-shadow:inset 0 1px 0 rgba(255,255,255,0.08); }
.th-notif-dot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
.th-notif-text { flex:1; font-weight:300; font-size:11.5px; color:#E8F0FF; min-width:0; }

.th-search-row { flex:0 0 auto; margin-top:24px; display:flex; align-items:center; gap:14px; }
.th-search { flex:1; display:flex; align-items:center; gap:10px; height:44px; padding:0 18px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); box-sizing:border-box; }
.th-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:13px; }
.th-viewall { display:inline-flex; align-items:center; height:44px; padding:0 22px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13px; color:${TEXT_SOFT}; cursor:pointer; transition:background .18s ease; box-sizing:border-box; }
.th-viewall:hover { background:rgba(94,158,255,0.08); }

.th-clients { margin-top:20px; display:flex; flex-direction:column; gap:18px; flex:0 1 auto; min-height:0; overflow:hidden; }
.th-client { display:flex; align-items:center; gap:14px; background:transparent; cursor:pointer; text-align:left; }
.th-client:hover .th-client-name { color:#fff; }
.th-client-avatar { width:44px; height:44px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; color:#fff; flex:0 0 auto; box-sizing:border-box; }
.th-client-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.th-client-name { font-weight:300; font-size:14.5px; color:${TEXT_SOFT}; text-transform:capitalize; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:color .15s ease; }
.th-client-sub { font-weight:500; font-size:12px; color:rgba(244,246,255,0.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.th-client-right { display:flex; flex-direction:column; align-items:flex-end; gap:1px; flex:0 0 auto; }
.th-client-amt { font-weight:800; font-size:15.5px; color:#fff; }
.th-client-label { font-weight:600; font-size:9px; color:rgba(244,246,255,0.5); }
.th-client-due { font-weight:600; font-size:10px; color:rgba(244,246,255,0.5); }

.th-actions { flex:0 0 auto; margin-top:26px; display:flex; gap:14px; }
.th-action { position:relative; flex:1; height:88px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); overflow:hidden; cursor:pointer; text-align:left; transition:background .18s ease; }
.th-action:hover { background:rgba(255,255,255,0.1); }
.th-action-primary { background:${ACTIVE}; border:none; box-shadow:inset 0 1px 0 rgba(255,255,255,0.3); }
.th-action-primary:hover { background:#79B4FF; }
.th-action-glow { position:absolute; left:-22%; top:-58%; width:144%; height:216%; border-radius:50%; background:radial-gradient(closest-side,rgba(102,169,255,0.18),transparent 70%); animation:glowDrift 11s ease-in-out infinite; pointer-events:none; }
.th-action-primary .th-action-glow { background:radial-gradient(closest-side,rgba(255,255,255,0.22),transparent 70%); }
.th-action-ico { position:absolute; top:12px; right:12px; }
.th-action-label { position:absolute; left:14px; bottom:12px; font-weight:500; font-size:13.5px; line-height:1.25; color:#E8F0FF; }

.th-empty { display:flex; align-items:center; justify-content:center; flex:1; min-height:64px; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }
`;
