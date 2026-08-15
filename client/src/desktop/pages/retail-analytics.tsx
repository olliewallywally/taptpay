import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  buildBuckets,
  collectedCents,
  growthPct,
  periodWindow,
  type Timeframe,
} from "@/lib/property-dashboard-data";
import { dollarsToCents, fmtNZD } from "@/lib/report-utils";
import { readDesktopPrefs } from "../data/desktop-prefs";
import {
  ANALYTICS_POINT_INSET,
  analyticsBucketLabel,
  buildAnalyticsAreaChart,
  clampAnalyticsChipCenter,
} from "../data/analytics-chart";
import { ReportModal } from "@/components/reports/ReportModal";
import { RETAIL_REPORT_OPTIONS } from "@/lib/report-pdf/reports/retail-options";
import {
  ALL_ITEMS,
  PERIOD_CHIPS,
  REPORT_BY_ID,
  RETAIL_DESKTOP_REPORTS,
  buildRetailReport,
  itemChips,
  type PeriodChip,
  type RetailBoard,
  type RetailReportId,
  type RetailTx,
} from "../data/retail-reports";
import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";
import { entranceProps, useListEntrance } from "../list-entrance";

/* ── palette ── */
const ACCENT = "#5E9EFF";
const ACCENT_SOFT = "#7FB2FF";
const NAV_DIM = "#4A86F0";
const ACTIVE = "#66A9FF";
const TEXT_SOFT = "#F4F6FF";
const NAVY = "#000F3F";
const INK = "#12162E";
const DEEP_BLUE = "#1D48C8";
const SHEET_BG = "#F4F5F8";
const SHEET_INK = "#04103A";
const SHEET_DIM = "#8A90A4";
const SHEET_LABEL = "#9AA0B2";
const DONUT_COLORS = ["#5E9EFF", "#93BAFF", "#DCE7FF", "rgba(94,158,255,0.35)", "rgba(94,158,255,0.18)"];

/* Sheet geometry, straight from the prototype. */
const SHEET_H = 664;
/* Rest the sheet 20px below Retail's plotted SVG (frame y ≈ 424). */
const CLOSED = 275;

const RANGES: { k: Timeframe; label: string }[] = [
  { k: "day", label: "Day" },
  { k: "week", label: "Week" },
  { k: "month", label: "Month" },
  { k: "year", label: "Year" },
];

type SheetMode = "history" | "tiles" | "filters";

interface Tx extends RetailTx {
  merchantId?: number;
  refundableAmount?: string | null;
}

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

const STATUS_LABEL: Record<string, string> = {
  completed: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  failed: "Failed",
  cancelled: "Cancelled",
  pending: "Awaiting",
  processing: "Processing",
};

/* The SVG still overscans the design canvas, but real bucket centres are mapped
   onto the visible inset plot domain by buildAnalyticsAreaChart. */
const SVG_LEFT = -51;
const SVG_TOP = -131;
const SVG_W = 1189;
const SVG_H = 301;
const CHART_PLACEMENT = {
  left: SVG_LEFT,
  top: SVG_TOP,
  width: SVG_W,
  height: SVG_H,
} as const;

export default function DesktopRetailAnalytics(props: DesktopRoutePageProps) {
  const merchantId = getCurrentMerchantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tf, setTf] = useState<Timeframe>("week");
  const [report, setReport] = useState<RetailReportId | null>(null);
  const [pendReport, setPendReport] = useState<RetailReportId>("sellers");
  const [sheetMode, setSheetMode] = useState<SheetMode>("history");
  /* "Payment history opens" preference, set in Settings → Dashboard Preferences. */
  const [sheetOpen, setSheetOpen] = useState(
    () => readDesktopPrefs(merchantId).historyStart === "expanded",
  );
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(CLOSED);
  const [fPeriod, setFPeriod] = useState<PeriodChip>("This week");
  const [fItem, setFItem] = useState<string>(ALL_ITEMS);
  const [fExtra, setFExtra] = useState<string>(REPORT_BY_ID.sellers.extra[0]);
  const [openTxId, setOpenTxId] = useState<number | null>(null);
  const [refundFor, setRefundFor] = useState<number | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [busyTx, setBusyTx] = useState<number | null>(null);
  const [chipLeft, setChipLeft] = useState(ANALYTICS_POINT_INSET);

  const drag = useRef({ startY: 0, startT: CLOSED, moved: false, scale: 1 });
  const chartRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);

  const authFetch = async (path: string) => {
    const token = localStorage.getItem("authToken");
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(path);
    return res.json();
  };

  const merchantQuery = useQuery<any>({
    queryKey: ["/api/merchants", merchantId, "profile"],
    queryFn: () => authFetch(`/api/merchants/${merchantId}/profile`),
    enabled: !!merchantId,
  });

  const txQuery = useQuery<Tx[]>({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: () => authFetch(`/api/merchants/${merchantId}/transactions`),
    refetchInterval: 15000,
    enabled: !!merchantId,
  });

  const stockQuery = useQuery<{ id: number; name: string; cost: string }[]>({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    queryFn: () => authFetch(`/api/merchants/${merchantId}/stock-items`),
    enabled: !!merchantId,
  });

  const boardsQuery = useQuery<RetailBoard[]>({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: () => authFetch(`/api/merchants/${merchantId}/tapt-stones`),
    enabled: !!merchantId,
  });

  const transactions = txQuery.data ?? [];
  const stockItems = stockQuery.data ?? [];
  const boards = boardsQuery.data ?? [];
  const merchant = merchantQuery.data;

  /* ── overview model: the same invoice-shaped adapter 4a uses ── */
  const overview = useMemo(() => {
    const sales = transactions.map((tx) => ({
      status: tx.status === "completed" ? "paid" : tx.status,
      createdAt: tx.createdAt,
      paidAt: tx.createdAt,
      amountCents: dollarsToCents(tx.price),
    }));
    const win = periodWindow(tf);
    const total = collectedCents(sales, win.start, win.end);
    const growth = growthPct(total, collectedCents(sales, win.prevStart, win.prevEnd));
    const count = transactions.filter(
      (t) =>
        t.status === "completed" &&
        new Date(t.createdAt) >= win.start &&
        new Date(t.createdAt) <= win.end,
    ).length;

    const buckets = buildBuckets(sales, tf);
    const chart = buildAnalyticsAreaChart(
      buckets.map((bucket) => bucket.valueCents),
      CHART_PLACEMENT,
    );
    const peakBucket = buckets[chart.peakIndex];
    return {
      total,
      growth,
      count,
      lineD: chart.lineD,
      areaD: chart.areaD,
      markerLeft: chart.marker.x,
      markerTop: chart.marker.y,
      peakIndex: chart.peakIndex,
      peakLabel: analyticsBucketLabel(
        tf,
        chart.peakIndex,
        peakBucket?.label ?? "unknown",
      ),
      peakValue: peakBucket?.valueCents ?? 0,
    };
  }, [transactions, tf]);

  const measureChip = useCallback(() => {
    const chart = chartRef.current;
    const chip = chipRef.current;
    if (!chart || !chip) return;
    setChipLeft(
      clampAnalyticsChipCenter(
        overview.markerLeft,
        chart.clientWidth,
        chip.offsetWidth,
      ),
    );
  }, [overview.markerLeft]);

  useLayoutEffect(() => {
    if (report || overview.peakValue <= 0) return;
    measureChip();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureChip);
    if (chartRef.current) observer.observe(chartRef.current);
    if (chipRef.current) observer.observe(chipRef.current);
    return () => observer.disconnect();
  }, [measureChip, overview.peakValue, report]);

  const selectedPeriod = RANGES.find((range) => range.k === tf)?.label ?? tf;

  /* ── payment history, grouped like the design ── */
  const historyGroups = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const yStart = new Date(dayStart.getTime() - 86_400_000);
    const today: Tx[] = [];
    const yesterday: Tx[] = [];
    const earlier: Tx[] = [];
    for (const t of [...transactions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )) {
      const at = new Date(t.createdAt);
      if (at >= dayStart) today.push(t);
      else if (at >= yStart) yesterday.push(t);
      else earlier.push(t);
    }
    return [
      { label: "TODAY", rows: today },
      { label: "YESTERDAY", rows: yesterday },
      { label: "EARLIER", rows: earlier },
    ].filter((g) => g.rows.length > 0);
  }, [transactions]);

  /* Row entrance: seeded from the whole transaction dataset, so switching the
     sheet or re-rendering a group never replays a sale already seen. Visible
     order is the flattened group order, which is what the stagger follows. */
  const entrance = useListEntrance(
    useMemo(() => transactions.map((t) => String(t.id)), [transactions]),
    useMemo(
      () => historyGroups.flatMap((g) => g.rows.map((t) => String(t.id))),
      [historyGroups],
    ),
  );

  const itemOptions = useMemo(() => itemChips(stockItems, transactions), [stockItems, transactions]);

  const reportResult = useMemo(
    () =>
      report
        ? buildRetailReport(report, {
            transactions,
            stockItems,
            boards,
            period: fPeriod,
            item: fItem,
            extra: fExtra,
            gstRegistered: merchant?.gstRegistered,
          })
        : null,
    [report, transactions, stockItems, boards, fPeriod, fItem, fExtra, merchant],
  );

  /* ── mutations ── */
  const refundMutation = useMutation({
    mutationFn: async (v: { txId: number; amount: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/transactions/${v.txId}/refunds`, {
        refundAmount: v.amount,
        refundReason: v.reason,
        refundMethod: "original_payment_method",
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "transactions"] });
      toast({ title: "Refund successful", description: data?.message || "The refund has been processed." });
      setRefundFor(null);
      setRefundAmount("");
      setRefundReason("");
    },
    onError: (err: any) =>
      toast({
        title: "Refund failed",
        description: err?.message || "Could not process refund.",
        variant: "destructive",
      }),
  });

  const downloadReceipt = async (tx: Tx) => {
    setBusyTx(tx.id);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/transactions/${tx.id}/receipt-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("receipt");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${tx.id}-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not generate receipt PDF.", variant: "destructive" });
    } finally {
      setBusyTx(null);
    }
  };

  const copyReceiptLink = async (tx: Tx) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/receipt/${tx.id}`);
      toast({ title: "Receipt link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const submitRefund = (tx: Tx) => {
    const amount = parseFloat(refundAmount);
    const maxRefundable = parseFloat(String(tx.refundableAmount ?? tx.price ?? "0"));
    if (!refundAmount || isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid refund amount.", variant: "destructive" });
      return;
    }
    if (amount > maxRefundable) {
      toast({
        title: "Amount too high",
        description: `Maximum refundable amount is $${maxRefundable.toFixed(2)}.`,
        variant: "destructive",
      });
      return;
    }
    if (!refundReason.trim()) {
      toast({ title: "Reason required", description: "Please enter a reason for the refund.", variant: "destructive" });
      return;
    }
    refundMutation.mutate({ txId: tx.id, amount: amount.toFixed(2), reason: refundReason.trim() });
  };

  /* ── sheet drag: the prototype's physics, corrected for the scaled canvas ── */
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

  const pickTile = (id: RetailReportId) => {
    setPendReport(id);
    setFPeriod("This week");
    setFItem(ALL_ITEMS);
    setFExtra(REPORT_BY_ID[id].extra[0]);
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
        : REPORT_BY_ID[pendReport].title;

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
    <DesktopPageScaffold {...props} vertical="retail" page="analytics" showScope={false}>
      <style>{RA_CSS}</style>
      <div className="ra-body">
        {/* ── OVERVIEW ── */}
        {!report && (
          <>
            {/* entry cascade step 0 */}
            <button type="button" className="ra-scope dt-rise" style={{ "--dt-i": 0 } as CSSProperties} aria-label="my store scope" aria-haspopup="listbox">
              <span>my store</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>

            <div className="ra-hero-row dt-rise" style={{ "--dt-i": 1 } as CSSProperties}>
              <div className="ra-hero-col">
                <div className="ra-hero-amt-row">
                  <span className="ra-hero">{txQuery.isLoading ? "—" : money(overview.total)}</span>
                  {overview.growth !== null && (
                    <span className="ra-hero-pill">
                      {overview.growth >= 0 ? "+" : ""}
                      {overview.growth}%
                    </span>
                  )}
                </div>
                <span className="ra-hero-sub">total revenue</span>
                <span className="ra-hero-tx">
                  {txQuery.isLoading ? "—" : overview.count.toLocaleString("en-NZ")}
                </span>
                <span className="ra-hero-sub ra-hero-sub-dim">transactions</span>
              </div>

              <div className="ra-segs" role="tablist" aria-label="revenue range" data-tutorial-id="retail-analytics-period">
                {RANGES.map((r) => {
                  const on = r.k === tf;
                  return (
                    <button
                      key={r.k}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className="ra-seg"
                      style={{
                        background: on ? ACTIVE : "transparent",
                        color: on ? NAVY : "#6B7BB8",
                        fontWeight: on ? 700 : 600,
                      }}
                      onClick={() => setTf(r.k)}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ra-chart dt-rise" style={{ "--dt-i": 2 } as CSSProperties} ref={chartRef}>
              <svg className="ra-chart-svg" viewBox="0 0 1076 240" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="rtrevfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={ACCENT} stopOpacity="0.34" />
                    <stop offset="1" stopColor={ACCENT} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={overview.areaD} fill="url(#rtrevfill)" />
                <path d={overview.lineD} fill="none" stroke="#8CBBFF" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {overview.peakValue > 0 && (
                <>
                  <div
                    aria-hidden="true"
                    className="ra-dot"
                    data-peak-index={overview.peakIndex}
                    style={{
                      left: `${overview.markerLeft}px`,
                      top: `${overview.markerTop}px`,
                    }}
                  />
                  <div
                    ref={chipRef}
                    aria-hidden="true"
                    className="ra-chip"
                    style={{ left: `${chipLeft}px` }}
                  >
                    {moneyWhole(overview.peakValue)}
                  </div>
                </>
              )}
              <p
                className="ra-chart-summary"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {selectedPeriod} selected. Peak bucket {overview.peakLabel}:{" "}
                {money(overview.peakValue)}.
              </p>
            </div>
          </>
        )}

        {/* ── GENERATED REPORT ── */}
        {report && reportResult && (
          <div className="ra-report">
            <div className="ra-rep-head">
              <button type="button" className="ra-back" onClick={() => setReport(null)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT_SOFT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                <span>analytics</span>
              </button>
              <span className="ra-rep-title">{reportResult.title}</span>
              <span className="ra-rep-filter">{`${fPeriod} · ${fItem} · ${fExtra}`.toLowerCase()}</span>
            </div>

            <div className="ra-rep-body">
              <div className="ra-rep-left">
                <span className="ra-rep-hero">{reportResult.heroV}</span>
                <span className="ra-rep-hero-l">{reportResult.heroL}</span>
                {reportResult.h2V && (
                  <div className="ra-rep-h2">
                    <span className="ra-rep-h2-v">{reportResult.h2V}</span>
                    <span className="ra-rep-h2-l">{reportResult.h2L}</span>
                  </div>
                )}

                {reportResult.chart === "donut" && reportResult.segs.length > 0 && (
                  <div className="ra-donut-row">
                    <div className="ra-donut" style={{ background: donutBg(reportResult.segs) }}>
                      <div className="ra-donut-hole" />
                    </div>
                    <div className="ra-legend">
                      {reportResult.segs.map((sg, i) => (
                        <div key={sg.label} className="ra-legend-row">
                          <span className="ra-legend-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="ra-legend-label">{sg.label}</span>
                          <span className="ra-legend-val">{sg.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reportResult.chart === "bars" && reportResult.bars.length > 0 && (
                  <div className="ra-bars">
                    {reportResult.bars.map((b, i) => (
                      <div key={`${b.label}-${i}`} className="ra-bar-col">
                        <div className="ra-bar" style={{ height: `${Math.max(2, Math.round(b.v * 138))}px` }} />
                        <span className="ra-bar-label">{b.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ra-rep-right">
                <span className="ra-rep-detail-title">{reportResult.detailTitle}</span>
                <div className="ra-rep-rows">
                  {reportResult.rows.length === 0 ? (
                    <div className="ra-rep-empty">nothing in this period yet</div>
                  ) : (
                    reportResult.rows.map((row, i) => (
                      <div key={`${row.name}-${i}`} className="ra-rep-row">
                        <span className="ra-rep-row-l">
                          <span className="ra-rep-row-name">{row.name}</span>
                          {row.sub && <span className="ra-rep-row-sub">{row.sub}</span>}
                        </span>
                        <span className="ra-rep-row-r">
                          <span className="ra-rep-row-val">{row.val}</span>
                          {row.sub2 && <span className="ra-rep-row-sub2">{row.sub2}</span>}
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
          className="ra-sheet"
          data-tutorial-id="retail-analytics-history"
          style={{
            transform: `translateY(${sheetY}px)`,
            transition: dragging ? "none" : "transform .5s cubic-bezier(.22,.9,.3,1)",
          }}
        >
          {/* The sheet shell itself carries a live inline transform for the drag,
              so the entry cascade runs on its contents instead. */}
          <div
            className="ra-grab dt-rise"
            style={{ "--dt-i": 3 } as CSSProperties}
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
            <span className="ra-grab-bar" />
          </div>

          <div className="ra-sheet-head dt-rise" style={{ "--dt-i": 4 } as CSSProperties}>
            <span className="ra-sheet-title">{sheetTitle}</span>
            <div className="ra-sheet-actions">
              {sheetMode === "history" && (
                <>
                  <button type="button" className="ra-btn-reports" onClick={openReports}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={DEEP_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>
                    <span>Reports</span>
                  </button>
                  <button type="button" className="ra-btn-white" data-tutorial-id="retail-analytics-export" onClick={() => setExportOpen(true)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v10M8 10l4 4 4-4" /><path d="M5 19h14" /></svg>
                    <span>Export</span>
                  </button>
                </>
              )}
              {sheetMode === "tiles" && (
                <button type="button" className="ra-btn-white" onClick={() => setSheetMode("history")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                  <span>Payment History</span>
                </button>
              )}
              {sheetMode === "filters" && (
                <button type="button" className="ra-btn-white" onClick={() => setSheetMode("tiles")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
                  <span>All Reports</span>
                </button>
              )}
            </div>
          </div>

          <div className="ra-sheet-body dt-rise" style={{ "--dt-i": 5 } as CSSProperties}>
            {sheetMode === "history" &&
              (txQuery.isLoading ? (
                <div className="ra-sheet-empty">loading sales…</div>
              ) : historyGroups.length === 0 ? (
                <div className="ra-sheet-empty">no sales yet — take your first payment from the Terminal</div>
              ) : (
                historyGroups.map((group) => (
                  <div key={group.label}>
                    <div className="ra-group-label">{group.label}</div>
                    {group.rows.map((tx) => {
                      const open = openTxId === tx.id;
                      const refunded = dollarsToCents(tx.totalRefunded);
                      const refundable = parseFloat(String(tx.refundableAmount ?? tx.price ?? "0"));
                      const canRefund = tx.status === "completed" || tx.status === "partially_refunded";
                      return (
                        <div key={tx.id}>
                          <button
                            type="button"
                            {...entranceProps(entrance, String(tx.id), "ra-tx-row")}
                            aria-expanded={open}
                            onClick={() => {
                              setOpenTxId(open ? null : tx.id);
                              setRefundFor(null);
                            }}
                          >
                            <span className="ra-tx-initials">{initials(tx.itemName || "sale")}</span>
                            <span className="ra-tx-mid">
                              <span className="ra-tx-name">{tx.itemName || "sale"}</span>
                              <span className="ra-tx-sub">
                                {(tx.paymentMethod ?? "qr code").replace(/_/g, " ")} ·{" "}
                                {new Date(tx.createdAt)
                                  .toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })
                                  .toLowerCase()}
                              </span>
                            </span>
                            <span className="ra-tx-right">
                              <span className="ra-tx-amt">{money(dollarsToCents(tx.price))}</span>
                              <span className="ra-tx-status">
                                {STATUS_LABEL[tx.status] ?? tx.status}
                                {refunded > 0 ? ` · ${money(refunded)} back` : ""}
                              </span>
                            </span>
                          </button>

                          {open && (
                            <div className="ra-tx-detail">
                              <div className="ra-tx-acts">
                                <button
                                  type="button"
                                  className="ra-btn-white ra-btn-sm"
                                  disabled={busyTx === tx.id}
                                  onClick={() => downloadReceipt(tx)}
                                >
                                  {busyTx === tx.id ? "preparing…" : "Receipt PDF"}
                                </button>
                                <button type="button" className="ra-btn-white ra-btn-sm" onClick={() => copyReceiptLink(tx)}>
                                  Copy receipt link
                                </button>
                                {canRefund && refundable > 0 && (
                                  <button
                                    type="button"
                                    className="ra-btn-white ra-btn-sm ra-btn-danger"
                                    onClick={() => {
                                      setRefundFor(refundFor === tx.id ? null : tx.id);
                                      setRefundAmount(refundable.toFixed(2));
                                      setRefundReason("");
                                    }}
                                  >
                                    Refund
                                  </button>
                                )}
                              </div>

                              {refundFor === tx.id && (
                                <div className="ra-refund">
                                  <label className="ra-refund-field">
                                    <span>AMOUNT</span>
                                    <input
                                      value={refundAmount}
                                      onChange={(e) => setRefundAmount(e.target.value)}
                                      inputMode="decimal"
                                      aria-label="refund amount"
                                    />
                                  </label>
                                  <label className="ra-refund-field ra-refund-grow">
                                    <span>REASON</span>
                                    <input
                                      value={refundReason}
                                      onChange={(e) => setRefundReason(e.target.value)}
                                      placeholder="why is this being refunded?"
                                      aria-label="refund reason"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="ra-generate ra-generate-sm"
                                    disabled={refundMutation.isPending}
                                    onClick={() => submitRefund(tx)}
                                  >
                                    {refundMutation.isPending
                                      ? "refunding…"
                                      : `Refund ${money(dollarsToCents(refundAmount))}`}
                                  </button>
                                  <span className="ra-refund-note">max {money(dollarsToCents(refundable))}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              ))}

            {sheetMode === "tiles" && (
              <div className="ra-tiles-wrap">
                <div className="ra-tiles-hint">Pick a report to generate — filters come next.</div>
                <div className="ra-tiles">
                  {RETAIL_DESKTOP_REPORTS.map((r) => (
                    <button key={r.id} type="button" className="ra-tile" onClick={() => pickTile(r.id)}>
                      <span className="ra-tile-ico">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={DEEP_BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={r.icon} /></svg>
                      </span>
                      <span className="ra-tile-text">
                        <span className="ra-tile-title">{r.title}</span>
                        <span className="ra-tile-desc">{r.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sheetMode === "filters" && (
              <div className="ra-filters">
                <div className="ra-filter-group">
                  <span className="ra-filter-label">PERIOD</span>
                  <div className="ra-filter-chips">
                    {PERIOD_CHIPS.map((p) => (
                      <button key={p} type="button" className="ra-fchip" style={lightChip(p === fPeriod)} onClick={() => setFPeriod(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ra-filter-group">
                  <span className="ra-filter-label">ITEM</span>
                  <div className="ra-filter-chips">
                    {itemOptions.map((v) => (
                      <button key={v} type="button" className="ra-fchip" style={lightChip(v === fItem)} onClick={() => setFItem(v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ra-filter-group">
                  <span className="ra-filter-label">{REPORT_BY_ID[pendReport].extraLabel}</span>
                  <div className="ra-filter-chips">
                    {REPORT_BY_ID[pendReport].extra.map((v) => (
                      <button key={v} type="button" className="ra-fchip" style={lightChip(v === fExtra)} onClick={() => setFExtra(v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ra-generate-row">
                  <button type="button" className="ra-generate" onClick={generate}>Generate Report</button>
                  <span className="ra-generate-note">
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
          title="Sales Reports"
          options={
            transactions.some((t) => dollarsToCents(t.totalRefunded) > 0)
              ? RETAIL_REPORT_OPTIONS
              : RETAIL_REPORT_OPTIONS.filter((o) => o.id !== "refunds")
          }
          onClose={() => setExportOpen(false)}
          onGenerate={async (id, format, args) => {
            const { runRetailReport } = await import("@/lib/report-pdf/reports/retail");
            await runRetailReport(id, format, { merchant: merchant ?? {}, transactions }, args.range);
          }}
        />
      )}
    </DesktopPageScaffold>
  );
}

const RA_CSS = `
.ra-body { position:relative; height:100%; box-sizing:border-box; padding:26px 52px 0; overflow:hidden; }

/* ── overview ── */
.ra-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:400; font-size:13.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .18s ease; }
.ra-scope:hover { background:rgba(94,158,255,0.08); }
/* The chart's gradient is offset up behind the headline figures, so the hero
   column and range control stay above it (the design paints them clear too). */
.ra-scope, .ra-hero-row { position:relative; z-index:1; }
.ra-hero-row { margin-top:22px; display:flex; align-items:flex-start; justify-content:space-between; }
.ra-hero-col { display:flex; flex-direction:column; gap:6px; }
.ra-hero-amt-row { display:flex; align-items:flex-start; gap:18px; }
.ra-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:88px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; font-variant-numeric:tabular-nums; }
.ra-hero-pill { margin-top:10px; padding:7px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:14px; color:${ACCENT_SOFT}; white-space:nowrap; }
.ra-hero-sub { font-weight:300; font-size:17px; color:${NAV_DIM}; }
.ra-hero-tx { margin-top:22px; font-family:'Outfit',sans-serif; font-weight:700; font-size:56px; line-height:0.92; letter-spacing:-0.015em; color:${ACCENT}; opacity:0.61; font-variant-numeric:tabular-nums; }
.ra-hero-sub-dim { margin-top:4px; opacity:0.61; }
.ra-segs { display:flex; align-items:center; padding:5px; border-radius:9999px; background:#0F1747; }
.ra-seg { padding:10px 0; width:92px; border-radius:9999px; font-size:13.5px; cursor:pointer; transition:background .18s ease, color .18s ease; }

.ra-chart { position:relative; margin-top:44px; height:266px; }
.ra-chart-svg { display:block; position:absolute; left:${SVG_LEFT}px; top:${SVG_TOP}px; width:${SVG_W}px; height:${SVG_H}px; }
.ra-dot { position:absolute; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:0 0 0 4px rgba(255,255,255,0.18); transform:translate(-50%,-50%); transition:left .3s ease, top .3s ease; }
.ra-chip { position:absolute; top:170px; transform:translateX(-50%); padding:7px 14px; border-radius:10px; background:${ACTIVE}; font-weight:700; font-size:13.5px; color:${NAVY}; white-space:nowrap; transition:left .3s ease; }
.ra-chart-summary { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

/* ── generated report ── */
.ra-report { animation:reportIn var(--m-dur-ui) var(--m-ease-out) both; display:flex; flex-direction:column; height:408px; }
.ra-rep-head { display:flex; align-items:center; gap:14px; }
.ra-back { display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:600; font-size:12.5px; color:${ACCENT_SOFT}; cursor:pointer; transition:background .15s ease; }
.ra-back:hover { background:rgba(94,158,255,0.08); }
.ra-rep-title { font-family:'Outfit',sans-serif; font-weight:700; font-size:24px; color:${TEXT_SOFT}; }
.ra-rep-filter { padding:7px 14px; border-radius:9999px; background:#0F1747; font-weight:600; font-size:11.5px; color:${ACCENT_SOFT}; }
.ra-rep-body { display:flex; gap:56px; margin-top:24px; flex:1; min-height:0; }
.ra-rep-left { flex:0 0 400px; display:flex; flex-direction:column; }
.ra-rep-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:62px; line-height:0.95; letter-spacing:-0.015em; color:${ACCENT}; }
.ra-rep-hero-l { margin-top:9px; font-weight:300; font-size:14px; color:${NAV_DIM}; }
.ra-rep-h2 { margin-top:14px; display:flex; align-items:baseline; gap:10px; }
.ra-rep-h2-v { font-family:'Outfit',sans-serif; font-weight:700; font-size:27px; color:${ACCENT}; opacity:0.61; }
.ra-rep-h2-l { font-weight:600; font-size:12.5px; color:${NAV_DIM}; opacity:0.61; }
.ra-donut-row { margin-top:26px; display:flex; align-items:center; gap:26px; }
.ra-donut { width:162px; height:162px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.ra-donut-hole { width:96px; height:96px; border-radius:50%; background:${NAVY}; }
.ra-legend { display:flex; flex-direction:column; gap:9px; min-width:0; }
.ra-legend-row { display:flex; align-items:center; gap:9px; }
.ra-legend-dot { width:9px; height:9px; border-radius:3px; flex:0 0 auto; }
.ra-legend-label { font-weight:600; font-size:12px; color:rgba(244,246,255,0.7); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px; }
.ra-legend-val { font-weight:700; font-size:12px; color:${TEXT_SOFT}; }
.ra-bars { margin-top:26px; display:flex; align-items:flex-end; gap:12px; height:162px; }
.ra-bar-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:8px; height:100%; }
.ra-bar { width:100%; max-width:44px; border-radius:8px; background:${ACCENT}; animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; }
.ra-bar-label { font-weight:700; font-size:11.5px; color:${ACCENT_SOFT}; }
.ra-rep-right { flex:1; display:flex; flex-direction:column; min-width:0; }
.ra-rep-detail-title { font-weight:700; font-size:11px; letter-spacing:0.18em; color:${NAV_DIM}; }
.ra-rep-rows { margin-top:4px; display:flex; flex-direction:column; overflow-y:auto; flex:1; scrollbar-width:none; }
.ra-rep-rows::-webkit-scrollbar { display:none; }
.ra-rep-row { display:flex; align-items:center; gap:16px; padding:13px 0; border-bottom:1px solid rgba(94,158,255,0.14); }
.ra-rep-row-l { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.ra-rep-row-name { font-weight:600; font-size:14px; color:${TEXT_SOFT}; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ra-rep-row-sub { font-weight:500; font-size:11.5px; color:rgba(244,246,255,0.45); }
.ra-rep-row-r { display:flex; flex-direction:column; align-items:flex-end; gap:2px; flex:0 0 auto; }
.ra-rep-row-val { font-family:'Outfit',sans-serif; font-weight:700; font-size:15px; color:${ACCENT}; }
.ra-rep-row-sub2 { font-weight:500; font-size:11px; color:rgba(244,246,255,0.4); }
.ra-rep-empty { padding:20px 0; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

/* ── payment-history sheet ── */
.ra-sheet { position:absolute; left:0; right:0; bottom:0; height:${SHEET_H}px; border-radius:30px 30px 0 0; background:${SHEET_BG}; box-shadow:0 -18px 50px rgba(3,6,20,0.5); z-index:10; display:flex; flex-direction:column; box-sizing:border-box; }
.ra-grab { flex:0 0 auto; display:flex; align-items:center; justify-content:center; padding:16px 0 8px; cursor:grab; touch-action:none; }
.ra-grab:active { cursor:grabbing; }
.ra-grab-bar { width:66px; height:6px; border-radius:3px; background:#C7CBD8; }
.ra-sheet-head { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; padding:10px 46px 18px; }
.ra-sheet-title { font-weight:700; font-size:24px; color:${INK}; }
.ra-sheet-actions { display:flex; align-items:center; gap:10px; }
.ra-btn-reports { display:inline-flex; align-items:center; gap:9px; padding:11px 22px; border-radius:9999px; background:transparent; border:1.5px solid ${DEEP_BLUE}; font-weight:700; font-size:14px; color:${DEEP_BLUE}; cursor:pointer; transition:background .15s ease; }
.ra-btn-reports:hover { background:rgba(29,72,200,0.06); }
.ra-btn-white { display:inline-flex; align-items:center; gap:9px; padding:11px 22px; border-radius:9999px; background:#fff; border:1px solid #E2E5EE; font-weight:700; font-size:14px; color:${INK}; cursor:pointer; transition:background .15s ease; }
.ra-btn-white:hover:not(:disabled) { background:#FAFBFD; }
.ra-btn-white:disabled { opacity:0.55; cursor:default; }
.ra-btn-sm { padding:8px 16px; font-size:12.5px; }
.ra-btn-danger { color:#C0343C; border-color:#F0C9CC; }
.ra-sheet-body { flex:1 1 auto; overflow-y:auto; padding:0 46px 26px; }
.ra-sheet-empty { padding:28px 0; font-weight:600; font-size:13px; color:${SHEET_DIM}; }

.ra-group-label { margin-top:24px; font-weight:700; font-size:12px; letter-spacing:0.16em; color:${SHEET_LABEL}; }
.ra-sheet-body > div:first-child > .ra-group-label { margin-top:0; }
.ra-tx-row { width:100%; display:flex; align-items:center; gap:20px; padding:16px 0; border-bottom:1px solid #E6E8F0; background:transparent; cursor:pointer; text-align:left; transition:background .12s ease; }
.ra-tx-row:hover { background:rgba(4,16,58,0.03); }
.ra-tx-initials { width:42px; font-weight:700; font-size:13.5px; color:${SHEET_INK}; flex:0 0 auto; text-transform:uppercase; }
.ra-tx-mid { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
.ra-tx-name { font-weight:700; font-size:15.5px; color:${INK}; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ra-tx-sub { font-weight:500; font-size:12.5px; color:${SHEET_DIM}; }
.ra-tx-right { display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex:0 0 auto; }
.ra-tx-amt { font-weight:700; font-size:15.5px; color:${INK}; font-variant-numeric:tabular-nums; }
.ra-tx-status { font-weight:500; font-size:11.5px; color:${SHEET_LABEL}; }
.ra-tx-detail { padding:14px 0 18px 62px; border-bottom:1px solid #E6E8F0; animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; }
.ra-tx-acts { display:flex; flex-wrap:wrap; gap:10px; }
.ra-refund { margin-top:14px; display:flex; align-items:flex-end; flex-wrap:wrap; gap:12px; }
.ra-refund-field { display:flex; flex-direction:column; gap:6px; }
.ra-refund-field > span { font-weight:700; font-size:10px; letter-spacing:0.14em; color:${SHEET_LABEL}; }
.ra-refund-field input { height:42px; width:130px; box-sizing:border-box; border-radius:10px; border:1px solid #DCE0EC; background:#fff; padding:0 14px; font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; color:${INK}; outline:none; }
.ra-refund-field input:focus { border-color:${DEEP_BLUE}; }
.ra-refund-grow { flex:1; min-width:220px; }
.ra-refund-grow input { width:100%; }
.ra-refund-note { font-weight:500; font-size:11.5px; color:${SHEET_LABEL}; padding-bottom:12px; }

.ra-tiles-wrap { animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; }
.ra-tiles-hint { font-weight:600; font-size:13px; color:${SHEET_DIM}; }
.ra-tiles { margin-top:16px; display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
.ra-tile { display:flex; flex-direction:column; align-items:flex-start; gap:11px; padding:16px; border-radius:14px; background:#fff; border:1px solid #E6E8F0; cursor:pointer; text-align:left; transition:background .15s ease, transform .15s ease; }
.ra-tile:hover { background:#F7F9FD; transform:translateY(-1px); }
.ra-tile-ico { width:34px; height:34px; border-radius:10px; background:${SHEET_BG}; display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.ra-tile-text { display:flex; flex-direction:column; gap:3px; }
.ra-tile-title { font-weight:700; font-size:13.5px; color:${SHEET_INK}; }
.ra-tile-desc { font-weight:500; font-size:11px; line-height:1.35; color:${SHEET_DIM}; }

.ra-filters { animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; display:flex; flex-direction:column; gap:22px; }
.ra-filter-group { display:flex; flex-direction:column; gap:10px; }
.ra-filter-label { font-weight:700; font-size:11px; letter-spacing:0.16em; color:${SHEET_LABEL}; }
.ra-filter-chips { display:flex; flex-wrap:wrap; gap:8px; }
.ra-fchip { padding:10px 18px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; text-transform:lowercase; }
.ra-generate-row { display:flex; align-items:center; gap:14px; margin-top:4px; }
.ra-generate { height:52px; padding:0 34px; border-radius:9999px; background:${DEEP_BLUE}; color:#fff; font-weight:700; font-size:14.5px; cursor:pointer; transition:opacity .15s ease; }
.ra-generate:hover:not(:disabled) { opacity:0.9; }
.ra-generate:disabled { opacity:0.6; cursor:default; }
.ra-generate-sm { height:42px; padding:0 20px; font-size:13px; }
.ra-generate-note { font-weight:500; font-size:12px; color:#9AA0B4; }
`;
