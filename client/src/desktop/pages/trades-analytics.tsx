import { useCallback, useMemo, useRef, useState } from "react";
import { getCurrentMerchantId } from "@/lib/auth";
import { useMerchantProfile } from "@/lib/merchant";
import { fmtNZD } from "@/lib/report-utils";
import { ReportModal } from "@/components/reports/ReportModal";
import { TRADES_REPORT_OPTIONS } from "@/lib/report-pdf/reports/trades-options";
import type { TradesReportData } from "@/lib/report-pdf/reports/trades";
import { readDesktopPrefs } from "../data/desktop-prefs";
import {
  TRADES_HOME_RANGES,
  buildTradesRevenueBuckets,
  isTradesInvoiceOpen,
  scopeTradesData,
  tradesPaidRevenueCents,
  tradesPeriodWindow,
  useTradesClientsQuery,
  useTradesInvoicesQuery,
  useTradesQuotesQuery,
  type TradesClient,
  type TradesHomeRange,
  type TradesInvoice,
} from "../data/trades-data";
import {
  ALL_SITES,
  TRADES_DESKTOP_REPORTS,
  TRADES_PERIOD_CHIPS,
  TRADES_REPORT_BY_ID,
  buildTradesReport,
  tradesSiteChips,
  type TradesPeriodChip,
  type TradesReportId,
} from "../data/trades-reports";
import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

/* ── palette ── */
const ACCENT = "#5E9EFF";
const ACCENT_SOFT = "#7FB2FF";
const ACTIVE = "#66A9FF";
const TEXT_SOFT = "#F4F6FF";
const NAVY = "#000F3F";
const NAV_DIM = "#4A86F0";
const INK = "#12162E";
const DEEP_BLUE = "#1D48C8";
const SHEET_BG = "#F4F5F8";
const SHEET_INK = "#04103A";
const SHEET_DIM = "#8A90A4";
const SHEET_LABEL = "#9AA0B2";
const DONUT_COLORS = ["#5E9EFF", "#93BAFF", "#DCE7FF", "rgba(94,158,255,0.35)", "rgba(94,158,255,0.18)"];

/* Sheet geometry, straight from the prototype. */
const SHEET_H = 664;
const PEEK = 152;
const CLOSED = SHEET_H - PEEK;

const RANGES: { k: TradesHomeRange; label: string }[] = [
  { k: "day", label: "Day" },
  { k: "week", label: "Week" },
  { k: "month", label: "Month" },
  { k: "year", label: "Year" },
];

type SheetMode = "history" | "tiles" | "filters";

const money = (c: number) => fmtNZD(c);
const moneyWhole = (c: number) => "$" + Math.round(c / 100).toLocaleString("en-NZ");

function initials(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => /^[a-z0-9]/i.test(p));
  if (parts.length === 0) return "–";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* Job-invoice statuses, spelled the way the mobile trades screens spell them. */
const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  paid_external: "Paid externally",
  deposit_paid: "Deposit paid",
  balance_due: "Balance due",
  voided: "Cancelled",
  dispatch_failed: "Not delivered",
  pending_dispatch: "Queued",
  dispatched: "Sent",
  viewed: "Viewed",
};

const isPaidInvoice = (invoice: TradesInvoice) =>
  invoice.status === "paid" || invoice.status === "paid_external";
const clientName = (client: TradesClient | undefined) =>
  [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim();

/** Catmull-Rom → cubic bezier: the prototype's curve, same geometry. */
function curve(vals: number[]) {
  const W = 1076;
  const H = 240;
  const TOP = 16;
  const BOT = 24;
  const pts = vals.length < 2 ? [vals[0] ?? 0, vals[0] ?? 0] : vals;
  const m = pts.length;
  const P = pts.map((v, i) => [i * (W / (m - 1)), H - BOT - v * (H - TOP - BOT)] as const);
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 1; i < m; i++) {
    const p0 = P[i - 1];
    const p1 = P[i];
    const pm = P[i - 2] ?? p0;
    const pn = P[i + 1] ?? p1;
    const c1x = p0[0] + (p1[0] - pm[0]) / 6;
    const c1y = p0[1] + (p1[1] - pm[1]) / 6;
    const c2x = p1[0] - (pn[0] - p0[0]) / 6;
    const c2y = p1[1] - (pn[1] - p0[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
  }
  return { d, P, W, H };
}

export default function DesktopTradesAnalytics(props: DesktopRoutePageProps) {
  const merchantId = getCurrentMerchantId();
  const merchantQuery = useMerchantProfile();
  const clientsQuery = useTradesClientsQuery();
  const invoicesQuery = useTradesInvoicesQuery();
  const quotesQuery = useTradesQuotesQuery();

  const [tf, setTf] = useState<TradesHomeRange>("year");
  const [scope, setScope] = useState<string>(ALL_SITES);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [report, setReport] = useState<TradesReportId | null>(null);
  const [pendReport, setPendReport] = useState<TradesReportId>("invoice-summary");
  const [sheetMode, setSheetMode] = useState<SheetMode>("history");
  const [sheetOpen, setSheetOpen] = useState(
    () => readDesktopPrefs(merchantId).historyStart === "expanded",
  );
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(CLOSED);
  const [fPeriod, setFPeriod] = useState<TradesPeriodChip>("This month");
  const [fSite, setFSite] = useState<string>(ALL_SITES);
  const [fExtra, setFExtra] = useState<string>(
    TRADES_REPORT_BY_ID["invoice-summary"].extra[0],
  );
  const [exportOpen, setExportOpen] = useState(false);

  const drag = useRef({ startY: 0, startT: CLOSED, moved: false, scale: 1 });

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);
  const quotes = useMemo(() => quotesQuery.data ?? [], [quotesQuery.data]);
  const merchant = merchantQuery.data;
  const siteOptions = useMemo(() => tradesSiteChips(clients), [clients]);

  /* Hidden prospect profiles never appear in a picker but must stay joinable,
     so the name lookup deliberately uses every client row. */
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );
  const scoped = useMemo(
    () => scopeTradesData(clients, invoices, quotes, scope === ALL_SITES ? null : scope),
    [clients, invoices, quotes, scope],
  );

  /* One scoped model drives every overview number and point. */
  const overview = useMemo(() => {
    const win = tradesPeriodWindow(tf);
    const total = tradesPaidRevenueCents(scoped.invoices, win.start, win.end);
    const previous = tradesPaidRevenueCents(
      scoped.invoices,
      win.previousStart,
      win.previousEnd,
    );
    const growth =
      previous > 0 ? Math.round(((total - previous) / previous) * 100) : null;
    /* Outstanding is a live figure, not a period one: everything still open. */
    const outstanding = scoped.invoices
      .filter(isTradesInvoiceOpen)
      .reduce((sum, invoice) => sum + invoice.amountCents, 0);
    const buckets = buildTradesRevenueBuckets(scoped.invoices, tf);
    const max = Math.max(...buckets.map((bucket) => bucket.valueCents), 1);
    let peak = 0;
    buckets.forEach((bucket, index) => {
      if (bucket.valueCents > buckets[peak].valueCents) peak = index;
    });
    const { d, P, W } = curve(buckets.map((bucket) => bucket.valueCents / max));
    const peakPoint = P[Math.min(peak, P.length - 1)];
    return {
      total,
      growth,
      outstanding,
      buckets,
      lineD: d,
      areaD: d + " L" + W + ",240 L0,240 Z",
      dotLeft: (-86 + (peakPoint[0] / W) * 1214).toFixed(1) + "px",
      floatingDotLeft: (52 - 86 + (peakPoint[0] / W) * 1214).toFixed(1) + "px",
      peakValue: buckets[peak]?.valueCents ?? 0,
    };
  }, [scoped.invoices, tf]);

  /* Payment history follows the selected scope and period, grouped by day. */
  const historyGroups = useMemo(() => {
    const win = tradesPeriodWindow(tf);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
    const today: TradesInvoice[] = [];
    const yesterday: TradesInvoice[] = [];
    const earlier: TradesInvoice[] = [];
    for (const invoice of [...scoped.invoices]
      .filter((row) => row.status !== "voided")
      .filter((row) => {
        const at = new Date(row.createdAt ?? 0);
        return at >= win.start && at < win.end;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      )) {
      const at = new Date(invoice.createdAt ?? 0);
      if (at >= dayStart) today.push(invoice);
      else if (at >= yesterdayStart) yesterday.push(invoice);
      else earlier.push(invoice);
    }
    return [
      { label: "TODAY", rows: today },
      { label: "YESTERDAY", rows: yesterday },
      { label: "EARLIER", rows: earlier },
    ].filter((group) => group.rows.length > 0);
  }, [scoped.invoices, tf]);

  const reportResult = useMemo(
    () =>
      report
        ? buildTradesReport(report, {
            clients,
            invoices,
            quotes,
            period: fPeriod,
            site: fSite,
            extra: fExtra,
          })
        : null,
    [report, clients, invoices, quotes, fPeriod, fSite, fExtra],
  );

  /* The export PDF runs on the same scoped rows the page is showing. */
  const exportData: TradesReportData = {
    merchant: merchant ?? {},
    clients: scoped.clients,
    invoices: scoped.invoices,
    quotes: scoped.quotes,
    gstMode: merchant?.tradeGstMode ?? undefined,
    scope: scope === ALL_SITES ? undefined : scope,
  };
  const exportClients = useMemo(
    () =>
      scoped.clients
        .filter((client) => client.status !== "archived")
        .map((client) => ({
          id: client.id,
          label: clientName(client) || client.siteAddress || "client",
        })),
    [scoped.clients],
  );

  /* ── sheet drag: the prototype physics, corrected for the scaled canvas ── */
  const sheetY = dragging ? dragY : sheetOpen ? 0 : CLOSED;

  const onSheetDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const canvas = e.currentTarget.closest("[data-desktop-scale]") as HTMLElement | null;
      const scale = Number(canvas?.dataset.desktopScale) || 1;
      const from = sheetOpen ? 0 : CLOSED;
      drag.current = { startY: e.clientY, startT: from, moved: false, scale };
      setDragY(from);
      setDragging(true);
    },
    [sheetOpen],
  );

  const onSheetMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      /* Pointer deltas are viewport px; the sheet moves in canvas px. */
      const dy = (e.clientY - drag.current.startY) / (drag.current.scale || 1);
      drag.current.moved = drag.current.moved || Math.abs(dy) > 6;
      setDragY(Math.max(0, Math.min(CLOSED, drag.current.startT + dy)));
    },
    [dragging],
  );

  const onSheetUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    setSheetOpen(drag.current.moved ? dragY < CLOSED / 2 : !sheetOpen);
  }, [dragging, dragY, sheetOpen]);

  /* ── actions ── */
  const openReports = () => {
    setSheetMode("tiles");
    setSheetOpen(true);
  };

  const pickTile = (id: TradesReportId) => {
    setPendReport(id);
    setFPeriod("This month");
    setFSite(scope);
    setFExtra(TRADES_REPORT_BY_ID[id].extra[0]);
    setSheetMode("filters");
  };

  const generate = () => {
    setReport(pendReport);
    setSheetOpen(false);
    setSheetMode("tiles");
  };

  const sheetTitle =
    sheetMode === "history"
      ? "Payment History"
      : sheetMode === "tiles"
        ? "Reports"
        : TRADES_REPORT_BY_ID[pendReport].title;

  const lightChip = (on: boolean) => ({
    border: `1.5px solid ${on ? ACTIVE : "#D6DAE6"}`,
    background: on ? ACTIVE : "transparent",
    color: on ? NAVY : "#5A6480",
    fontWeight: on ? 700 : 600,
  });

  const donutBg = (segs: { pct: number }[]) => {
    let acc = 0;
    const stops = segs.map((s, i) => {
      const part = `${DONUT_COLORS[i % DONUT_COLORS.length]} ${acc}% ${acc + s.pct}%`;
      acc += s.pct;
      return part;
    });
    return `conic-gradient(${stops.join(", ")})`;
  };

  return (
    <DesktopPageScaffold {...props} vertical="trades" page="analytics" showScope={false}>
      <style>{TA_CSS}</style>
      <div className="ta-body">
        {/* ── OVERVIEW ── */}
        {!report && (
          <>
            <div className="ta-overview-head">
              <div className="ta-scope-wrap">
                <button
                  type="button"
                  className="ta-scope"
                  aria-label={(scope === ALL_SITES ? "all sites" : scope) + " scope"}
                  aria-haspopup="listbox"
                  aria-expanded={scopeOpen}
                  onClick={() => setScopeOpen((open) => !open)}
                >
                  <span>{scope === ALL_SITES ? "all sites" : scope}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {scopeOpen && (
                  <div className="ta-scope-menu" role="listbox" aria-label="site scope">
                    {siteOptions.map((site) => (
                      <button
                        key={site}
                        type="button"
                        role="option"
                        aria-selected={scope === site}
                        className="ta-scope-option"
                        onClick={() => {
                          setScope(site);
                          setScopeOpen(false);
                        }}
                      >
                        {site === ALL_SITES ? "all sites" : site}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="ta-segs" role="tablist" aria-label="revenue range" data-tutorial-id="ta-period">
                {RANGES.map((range) => {
                  const on = range.k === tf;
                  return (
                    <button
                      key={range.k}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className="ta-seg"
                      style={{
                        background: on ? ACTIVE : "transparent",
                        color: on ? NAVY : "#6B7BB8",
                        fontWeight: on ? 700 : 600,
                      }}
                      onClick={() => setTf(range.k)}
                    >
                      {range.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ta-hero-row" data-tutorial-id="ta-total">
              <div className="ta-hero-col">
                <div className="ta-hero-amt-row">
                  <span className="ta-hero">{invoicesQuery.isLoading ? "—" : money(overview.total)}</span>
                  {overview.growth !== null && (
                    <span className="ta-hero-pill">
                      {overview.growth >= 0 ? "+" : ""}
                      {overview.growth}%
                    </span>
                  )}
                </div>
                <span className="ta-hero-sub">total revenue</span>
                <span className="ta-hero-out">
                  {invoicesQuery.isLoading ? "—" : money(overview.outstanding)}
                </span>
                <span className="ta-hero-sub ta-hero-sub-dim">outstanding invoices</span>
              </div>
            </div>

            <div className="ta-chart">
              <svg className="ta-chart-svg" viewBox="0 0 1076 240" preserveAspectRatio="none" aria-label="collected revenue chart">
                <defs>
                  <linearGradient id="traderevfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={ACCENT} stopOpacity="0.34" />
                    <stop offset="1" stopColor={ACCENT} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={overview.areaD} fill="url(#traderevfill)" />
                <path d={overview.lineD} fill="none" stroke="#8CBBFF" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {overview.peakValue > 0 && (
                <div className="ta-chip" style={{ left: overview.dotLeft }}>
                  {moneyWhole(overview.peakValue)}
                </div>
              )}
            </div>
            {overview.peakValue > 0 && (
              <div
                className="ta-dot"
                style={{ left: overview.floatingDotLeft }}
              />
            )}
          </>
        )}

        {/* ── GENERATED REPORT ── */}
        {report && reportResult && (
          <div className="ta-report">
            <div className="ta-rep-head">
              <button type="button" className="ta-back" onClick={() => setReport(null)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                <span>analytics</span>
              </button>
              <span className="ta-rep-title">{reportResult.title}</span>
              <span className="ta-rep-filter">{((TRADES_REPORT_BY_ID[report].periodFiltered ? fPeriod : "Current snapshot") + " · " + fSite + " · " + fExtra).toLowerCase()}</span>
            </div>

            <div className="ta-rep-body">
              <div className="ta-rep-left">
                <span className="ta-rep-hero">{reportResult.heroV}</span>
                <span className="ta-rep-hero-l">{reportResult.heroL}</span>
                {reportResult.h2V && (
                  <div className="ta-rep-h2">
                    <span className="ta-rep-h2-v">{reportResult.h2V}</span>
                    <span className="ta-rep-h2-l">{reportResult.h2L}</span>
                  </div>
                )}

                {reportResult.chart === "donut" && reportResult.segs.length > 0 && (
                  <div className="ta-donut-row">
                    <div className="ta-donut" style={{ background: donutBg(reportResult.segs) }}>
                      <div className="ta-donut-hole" />
                    </div>
                    <div className="ta-legend">
                      {reportResult.segs.map((sg, i) => (
                        <div key={sg.label} className="ta-legend-row">
                          <span className="ta-legend-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="ta-legend-label">{sg.label}</span>
                          <span className="ta-legend-val">{sg.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reportResult.chart === "bars" && reportResult.bars.length > 0 && (
                  <div className="ta-bars">
                    {reportResult.bars.map((b, i) => (
                      <div key={`${b.label}-${i}`} className="ta-bar-col">
                        <div className="ta-bar" style={{ height: `${Math.max(2, Math.round(b.v * 138))}px` }} />
                        <span className="ta-bar-label">{b.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ta-rep-right">
                <span className="ta-rep-detail-title">{reportResult.detailTitle}</span>
                <div className="ta-rep-rows">
                  {reportResult.rows.length === 0 ? (
                    <div className="ta-rep-empty">nothing to report yet</div>
                  ) : (
                    reportResult.rows.map((row, i) => (
                      <div key={`${row.name}-${i}`} className="ta-rep-row">
                        <span className="ta-rep-row-l">
                          <span className="ta-rep-row-name">{row.name}</span>
                          {row.sub && <span className="ta-rep-row-sub">{row.sub}</span>}
                        </span>
                        <span className="ta-rep-row-r">
                          <span className="ta-rep-row-val">{row.val}</span>
                          {row.sub2 && <span className="ta-rep-row-sub2">{row.sub2}</span>}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SHEET ── */}
        <div
          className="ta-sheet"
          style={{
            transform: `translateY(${sheetY}px)`,
            transition: dragging ? "none" : "transform .5s cubic-bezier(.22,.9,.3,1)",
          }}
        >
          <div
            className="ta-grab"
            role="button"
            tabIndex={0}
            aria-label={sheetOpen ? "collapse payment history" : "expand payment history"}
            aria-expanded={sheetOpen}
            onPointerDown={onSheetDown}
            onPointerMove={onSheetMove}
            onPointerUp={onSheetUp}
            onPointerCancel={onSheetUp}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSheetOpen((o) => !o);
              }
            }}
          >
            <span className="ta-grab-bar" />
          </div>

          <div className="ta-sheet-head">
            <span className="ta-sheet-title" data-tutorial-id="ta-history">{sheetTitle}</span>
            <div className="ta-sheet-actions">
              {sheetMode === "history" && (
                <>
                  <button type="button" className="ta-btn-reports" data-tutorial-id="ta-reports" onClick={openReports}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={DEEP_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>
                    <span>Reports</span>
                  </button>
                  <button type="button" className="ta-btn-white" onClick={() => setExportOpen(true)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v10M8 10l4 4 4-4" /><path d="M5 19h14" /></svg>
                    <span>Export</span>
                  </button>
                </>
              )}
              {sheetMode === "tiles" && (
                <button type="button" className="ta-btn-white" onClick={() => setSheetMode("history")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                  <span>Payment History</span>
                </button>
              )}
              {sheetMode === "filters" && (
                <button type="button" className="ta-btn-white" onClick={() => setSheetMode("tiles")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                  <span>All Reports</span>
                </button>
              )}
            </div>
          </div>

          <div className="ta-sheet-body">
            {sheetMode === "history" &&
              (invoicesQuery.isLoading || clientsQuery.isLoading ? (
                <div className="ta-sheet-empty">loading payments…</div>
              ) : historyGroups.length === 0 ? (
                <div className="ta-sheet-empty">no payments in this period</div>
              ) : (
                historyGroups.map((group) => (
                  <div key={group.label}>
                    <div className="ta-group-label">{group.label}</div>
                    {group.rows.map((invoice) => {
                      const client = clientById.get(invoice.clientProfileId);
                      const name = clientName(client) || "Job payment";
                      const address =
                        client?.siteAddress?.trim() ||
                        invoice.jobDetails?.trim() ||
                        "site address unavailable";
                      const splitStatus =
                        invoice.splitCount && invoice.splitCount > 1
                          ? " · " + String(invoice.splitPaidCount ?? 0) + " of " + String(invoice.splitCount) + " shares paid"
                          : "";
                      return (
                        <div key={invoice.id} className="ta-tx-row">
                          <span className="ta-tx-initials">{initials(name)}</span>
                          <span className="ta-tx-mid">
                            <span className="ta-tx-name">{name}</span>
                            <span className="ta-tx-sub">{address}</span>
                          </span>
                          <span className="ta-tx-right">
                            <span className="ta-tx-amt">
                              {money(invoice.amountCents)}
                            </span>
                            <span className="ta-tx-status">
                              {STATUS_LABEL[invoice.status] ?? invoice.status.replace(/_/g, " ")}
                              {splitStatus}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))
              ))}

            {sheetMode === "tiles" && (
              <div className="ta-tiles-wrap">
                <div className="ta-tiles-hint">Pick a report to generate — filters come next.</div>
                <div className="ta-tiles">
                  {TRADES_DESKTOP_REPORTS.map((r) => (
                    <button key={r.id} type="button" className="ta-tile" onClick={() => pickTile(r.id)}>
                      <span className="ta-tile-ico">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={DEEP_BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={r.icon} /></svg>
                      </span>
                      <span className="ta-tile-text">
                        <span className="ta-tile-title">{r.title}</span>
                        <span className="ta-tile-desc">{r.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sheetMode === "filters" && (
              <div className="ta-filters">
                {TRADES_REPORT_BY_ID[pendReport].periodFiltered ? (
                  <div className="ta-filter-group">
                    <span className="ta-filter-label">PERIOD</span>
                    <div className="ta-filter-chips">
                      {TRADES_PERIOD_CHIPS.map((period) => (
                        <button key={period} type="button" className="ta-fchip" style={lightChip(period === fPeriod)} onClick={() => setFPeriod(period)}>
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="ta-filter-group">
                    <span className="ta-filter-label">SNAPSHOT</span>
                    <div className="ta-snapshot-note">This report is a snapshot of your current data.</div>
                  </div>
                )}

                <div className="ta-filter-group">
                  <span className="ta-filter-label">SITE</span>
                  <div className="ta-filter-chips">
                    {siteOptions.map((v) => (
                      <button key={v} type="button" className="ta-fchip" style={lightChip(v === fSite)} onClick={() => setFSite(v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ta-filter-group">
                  <span className="ta-filter-label">{TRADES_REPORT_BY_ID[pendReport].extraLabel}</span>
                  <div className="ta-filter-chips">
                    {TRADES_REPORT_BY_ID[pendReport].extra.map((v) => (
                      <button key={v} type="button" className="ta-fchip" style={lightChip(v === fExtra)} onClick={() => setFExtra(v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ta-generate-row">
                  <button type="button" className="ta-generate" onClick={generate}>Generate Report</button>
                  <span className="ta-generate-note">
                    the top section becomes your report — jump back with the analytics button
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {exportOpen && (
        <ReportModal
          title="Trades Reports"
          options={TRADES_REPORT_OPTIONS}
          clients={exportClients}
          onClose={() => setExportOpen(false)}
          onGenerate={async (id, format, args) => {
            const { runTradesReport } = await import(
              "@/lib/report-pdf/reports/trades"
            );
            await runTradesReport(id, format, exportData, args.range, args.clientId);
          }}
        />
      )}
    </DesktopPageScaffold>
  );
}

const TA_CSS = `
.ta-body { position:relative; height:100%; box-sizing:border-box; padding:26px 52px 0; overflow:hidden; }

/* ── overview ── */
.ta-overview-head { position:relative; z-index:3; display:flex; align-items:center; justify-content:space-between; }
.ta-scope-wrap { position:relative; }
.ta-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:#7FB2FF; cursor:pointer; transition:background .18s ease; }
.ta-scope:hover { background:rgba(94,158,255,0.08); }
.ta-scope-menu { position:absolute; left:0; top:48px; width:280px; box-sizing:border-box; padding:8px; border-radius:16px; border:1px solid rgba(94,158,255,0.3); background:#0F1747; box-shadow:0 18px 45px rgba(0,5,28,0.5); display:flex; flex-direction:column; gap:3px; }
.ta-scope-option { width:100%; padding:10px 12px; border-radius:10px; background:transparent; color:#9DBCFF; text-align:left; font-weight:600; font-size:12.5px; cursor:pointer; }
.ta-scope-option:hover, .ta-scope-option[aria-selected=true] { background:rgba(94,158,255,0.16); color:#FFFFFF; }
.ta-hero-row { position:relative; z-index:1; margin-top:22px; display:flex; align-items:flex-start; justify-content:space-between; }
.ta-hero-col { display:flex; flex-direction:column; gap:6px; }
.ta-hero-amt-row { display:flex; align-items:flex-start; gap:18px; }
.ta-hero { font-family:Outfit,sans-serif; font-weight:700; font-size:63px; line-height:0.92; letter-spacing:-0.015em; color:#5E9EFF; font-variant-numeric:tabular-nums; }
.ta-hero-pill { margin-top:10px; padding:7px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:14px; color:#7FB2FF; white-space:nowrap; }
.ta-hero-sub { font-weight:600; font-size:14px; color:#4A86F0; }
.ta-hero-out { margin-top:26px; font-family:Outfit,sans-serif; font-weight:700; font-size:47px; line-height:0.92; letter-spacing:-0.015em; color:#5E9EFF; opacity:0.61; font-variant-numeric:tabular-nums; }
.ta-hero-sub-dim { font-weight:300; opacity:0.61; }
.ta-segs { display:flex; align-items:center; padding:4px; border-radius:9999px; background:#0F1747; }
.ta-seg { padding:8px 0; width:70px; border-radius:9999px; font-size:12px; cursor:pointer; transition:background .18s ease, color .18s ease; }

.ta-chart { position:relative; margin-top:44px; height:266px; }
.ta-chart-svg { display:block; position:absolute; left:-86px; top:-47px; width:1214px; height:221px; }
.ta-dot { position:absolute; top:185px; width:14px; height:14px; border-radius:50%; background:#FFFFFF; box-shadow:0 0 0 4px rgba(255,255,255,0.18); transform:translate(-50%,-50%); transition:left .3s ease; }
.ta-chip { position:absolute; top:174px; transform:translateX(-50%); padding:7px 14px; border-radius:10px; background:#66A9FF; font-weight:700; font-size:13.5px; color:#000F3F; white-space:nowrap; transition:left .3s ease; }

/* ── generated report ── */
.ta-report { animation:reportIn .55s cubic-bezier(.22,.9,.3,1) both; display:flex; flex-direction:column; height:408px; }
.ta-rep-head { display:flex; align-items:center; gap:14px; }
.ta-back { display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:600; font-size:12.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.ta-back:hover { background:rgba(94,158,255,0.08); }
.ta-rep-title { font-family:'Outfit',sans-serif; font-weight:700; font-size:24px; color:${TEXT_SOFT}; }
.ta-rep-filter { padding:7px 14px; border-radius:9999px; background:#0F1747; font-weight:600; font-size:11.5px; color:${ACCENT_SOFT}; }
.ta-rep-body { display:flex; gap:56px; margin-top:24px; flex:1; min-height:0; }
.ta-rep-left { flex:0 0 400px; display:flex; flex-direction:column; }
.ta-rep-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:62px; line-height:0.95; letter-spacing:-0.015em; color:${ACCENT}; }
.ta-rep-hero-l { margin-top:9px; font-weight:300; font-size:14px; color:${NAV_DIM}; }
.ta-rep-h2 { margin-top:14px; display:flex; align-items:baseline; gap:10px; }
.ta-rep-h2-v { font-family:'Outfit',sans-serif; font-weight:700; font-size:27px; color:${ACCENT}; opacity:0.61; }
.ta-rep-h2-l { font-weight:600; font-size:12.5px; color:${NAV_DIM}; opacity:0.61; }
.ta-donut-row { margin-top:26px; display:flex; align-items:center; gap:26px; }
.ta-donut { width:162px; height:162px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.ta-donut-hole { width:96px; height:96px; border-radius:50%; background:${NAVY}; }
.ta-legend { display:flex; flex-direction:column; gap:9px; min-width:0; }
.ta-legend-row { display:flex; align-items:center; gap:9px; }
.ta-legend-dot { width:9px; height:9px; border-radius:3px; flex:0 0 auto; }
.ta-legend-label { font-weight:600; font-size:12px; color:rgba(244,246,255,0.7); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px; }
.ta-legend-val { font-weight:700; font-size:12px; color:${TEXT_SOFT}; }
.ta-bars { margin-top:26px; display:flex; align-items:flex-end; gap:12px; height:162px; }
.ta-bar-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:8px; height:100%; }
.ta-bar { width:100%; max-width:44px; border-radius:8px; background:${ACCENT}; animation:tileIn .45s cubic-bezier(.22,.9,.3,1) both; }
.ta-bar-label { font-weight:700; font-size:11.5px; color:${ACCENT_SOFT}; }
.ta-rep-right { flex:1; display:flex; flex-direction:column; min-width:0; }
.ta-rep-detail-title { font-weight:700; font-size:11px; letter-spacing:0.18em; color:${NAV_DIM}; }
.ta-rep-rows { margin-top:4px; display:flex; flex-direction:column; overflow-y:auto; flex:1; scrollbar-width:none; }
.ta-rep-rows::-webkit-scrollbar { display:none; }
.ta-rep-row { display:flex; align-items:center; gap:16px; padding:13px 0; border-bottom:1px solid rgba(94,158,255,0.14); }
.ta-rep-row-l { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.ta-rep-row-name { font-weight:600; font-size:14px; color:${TEXT_SOFT}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ta-rep-row-sub { font-weight:500; font-size:11.5px; color:rgba(244,246,255,0.45); }
.ta-rep-row-r { display:flex; flex-direction:column; align-items:flex-end; gap:2px; flex:0 0 auto; }
.ta-rep-row-val { font-family:'Outfit',sans-serif; font-weight:700; font-size:15px; color:${ACCENT}; }
.ta-rep-row-sub2 { font-weight:500; font-size:11px; color:rgba(244,246,255,0.4); }
.ta-rep-empty { padding:20px 0; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

/* ── payment-history sheet ── */
.ta-sheet { position:absolute; left:0; right:0; bottom:0; height:${SHEET_H}px; border-radius:30px 30px 0 0; background:${SHEET_BG}; box-shadow:0 -18px 50px rgba(3,6,20,0.5); z-index:10; display:flex; flex-direction:column; box-sizing:border-box; }
.ta-grab { flex:0 0 auto; display:flex; align-items:center; justify-content:center; padding:16px 0 8px; cursor:grab; touch-action:none; }
.ta-grab:active { cursor:grabbing; }
.ta-grab-bar { width:66px; height:6px; border-radius:3px; background:#C7CBD8; }
.ta-sheet-head { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; padding:10px 46px 18px; }
.ta-sheet-title { font-weight:700; font-size:24px; color:${INK}; }
.ta-sheet-actions { display:flex; align-items:center; gap:10px; }
.ta-btn-reports { display:inline-flex; align-items:center; gap:9px; padding:11px 22px; border-radius:9999px; background:transparent; border:1.5px solid ${DEEP_BLUE}; font-weight:700; font-size:14px; color:${DEEP_BLUE}; cursor:pointer; transition:background .15s ease; }
.ta-btn-reports:hover { background:rgba(29,72,200,0.06); }
.ta-btn-white { display:inline-flex; align-items:center; gap:9px; padding:11px 22px; border-radius:9999px; background:#fff; border:1px solid #E2E5EE; font-weight:700; font-size:14px; color:${INK}; cursor:pointer; transition:background .15s ease; }
.ta-btn-white:hover:not(:disabled) { background:#FAFBFD; }
.ta-btn-white:disabled { opacity:0.55; cursor:default; }
.ta-btn-sm { padding:8px 16px; font-size:12.5px; }
.ta-btn-danger { color:#C0343C; border-color:#F0C9CC; }
.ta-sheet-body { flex:1 1 auto; overflow-y:auto; padding:0 46px 26px; }
.ta-sheet-empty { padding:28px 0; font-weight:600; font-size:13px; color:${SHEET_DIM}; }

.ta-group-label { margin-top:24px; font-weight:700; font-size:12px; letter-spacing:0.16em; color:${SHEET_LABEL}; }
.ta-sheet-body > div:first-child > .ta-group-label { margin-top:0; }
.ta-tx-row { width:100%; display:flex; align-items:center; gap:20px; padding:16px 0; border-bottom:1px solid #E6E8F0; background:transparent; cursor:default; text-align:left; }
.ta-tx-initials { width:42px; font-weight:700; font-size:13.5px; color:${SHEET_INK}; flex:0 0 auto; text-transform:uppercase; }
.ta-tx-mid { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
.ta-tx-name { font-weight:700; font-size:15.5px; color:${INK}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ta-tx-sub { font-weight:500; font-size:12.5px; color:${SHEET_DIM}; }
.ta-tx-right { display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex:0 0 auto; }
.ta-tx-amt { font-weight:700; font-size:15.5px; color:${INK}; font-variant-numeric:tabular-nums; }
.ta-tx-status { font-weight:500; font-size:11.5px; color:${SHEET_LABEL}; }
.ta-tiles-wrap { animation:tileIn .4s cubic-bezier(.22,.9,.3,1) both; }
.ta-tiles-hint { font-weight:600; font-size:13px; color:${SHEET_DIM}; }
.ta-tiles { margin-top:16px; display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
.ta-tile { display:flex; flex-direction:column; align-items:flex-start; gap:11px; padding:16px; border-radius:14px; background:${SHEET_BG}; border:0; cursor:pointer; text-align:left; transition:background .15s ease; }
.ta-tile:hover { background:#E9EDF6; }
.ta-tile-ico { width:34px; height:34px; border-radius:10px; background:#FFFFFF; box-shadow:0 1px 2px rgba(10,17,40,0.08); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.ta-tile-text { display:flex; flex-direction:column; gap:3px; }
.ta-tile-title { font-weight:700; font-size:13.5px; color:${SHEET_INK}; }
.ta-tile-desc { font-weight:500; font-size:11px; line-height:1.35; color:${SHEET_DIM}; }

.ta-filters { animation:tileIn .4s cubic-bezier(.22,.9,.3,1) both; display:flex; flex-direction:column; gap:22px; }
.ta-filter-group { display:flex; flex-direction:column; gap:10px; }
.ta-filter-label { font-weight:700; font-size:11px; letter-spacing:0.16em; color:${SHEET_LABEL}; }
.ta-filter-chips { display:flex; flex-wrap:wrap; gap:8px; }
.ta-fchip { padding:10px 18px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.ta-snapshot-note { width:max-content; max-width:440px; padding:12px 14px; border-radius:12px; background:#FFFFFF; color:${SHEET_DIM}; font-weight:500; font-size:12.5px; }
.ta-generate-row { display:flex; align-items:center; gap:14px; margin-top:4px; }
.ta-generate { height:52px; padding:0 34px; border-radius:9999px; background:${DEEP_BLUE}; color:#fff; font-weight:700; font-size:14.5px; cursor:pointer; transition:opacity .15s ease; }
.ta-generate:hover:not(:disabled) { opacity:0.9; }
.ta-generate:disabled { opacity:0.6; cursor:default; }
.ta-generate-sm { height:42px; padding:0 20px; font-size:13px; }
.ta-generate-note { font-weight:500; font-size:12px; color:#9AA0B4; }
`;
