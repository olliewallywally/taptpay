/* Retail desktop analytics (design screen 4d) — the ten reports behind the
   Reports tile grid, computed from the merchant's own transactions and stock
   items. Pure functions: no React, no network, no mock rows. The prototype's
   hard-coded figures are placeholders; every number here comes from the data.

   Two honest departures from the prototype: stock items have no category
   column, so the second filter row selects a product instead of a category;
   and the Fees report drops the prototype's "vs eftpos" comparison, which has
   no data behind it. */
import {
  dollarsToCents,
  fmtNZD,
  inRange,
  timeframeWindow,
  calcGST,
  type Timeframe,
} from "@/lib/report-utils";

/* ── inputs ── */

export interface RetailTx {
  id: number;
  itemName?: string;
  price?: string;
  status: string;
  paymentMethod?: string | null;
  isSplit?: boolean | null;
  totalSplits?: number | null;
  completedSplits?: number | null;
  totalRefunded?: string | null;
  createdAt: string;
}

export interface RetailStockItem {
  id: number;
  name: string;
  cost: string | number;
}

export const PERIOD_CHIPS = ["Today", "This week", "This month", "This year"] as const;
export type PeriodChip = (typeof PERIOD_CHIPS)[number];

const PERIOD_TF: Record<PeriodChip, Timeframe> = {
  Today: "day",
  "This week": "week",
  "This month": "month",
  "This year": "year",
};

export const ALL_ITEMS = "All items";

export type RetailReportId =
  | "sellers"
  | "hours"
  | "methods"
  | "avgsale"
  | "gst"
  | "fees"
  | "splits"
  | "failed"
  | "days"
  | "stockrep";

export interface RetailReportMeta {
  id: RetailReportId;
  title: string;
  desc: string;
  icon: string;
  extraLabel: string;
  extra: string[];
}

/* Titles, copy and icon paths are the design's; the extra-filter options are
   the design's wherever they map onto real fields. */
export const RETAIL_DESKTOP_REPORTS: RetailReportMeta[] = [
  {
    id: "sellers",
    title: "Best Sellers",
    desc: "top products by units & revenue",
    icon: "M8 21l4-7 4 7 M12 3l2.4 4.8 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z",
    extraLabel: "RANK BY",
    extra: ["Units", "Revenue"],
  },
  {
    id: "hours",
    title: "Sales by Hour",
    desc: "find your rush and your lull",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 8v4l3 3",
    extraLabel: "DAYS",
    extra: ["All days", "Weekdays", "Weekends"],
  },
  {
    id: "methods",
    title: "Payment Methods",
    desc: "how your customers pay",
    icon: "M3 7h18v10H3z M3 11h18",
    extraLabel: "TYPE",
    extra: ["All", "Digital", "Card", "Cash"],
  },
  {
    id: "avgsale",
    title: "Average Sale",
    desc: "basket size over time",
    icon: "M6 8h12l-1 13H7L6 8z M9 8a3 3 0 0 1 6 0",
    extraLabel: "VIEW",
    extra: ["Average", "Median", "Largest"],
  },
  {
    id: "gst",
    title: "GST & Tax Summary",
    desc: "collected for the ird by quarter",
    icon: "M19 5 5 19 M7.5 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5 M16.5 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5",
    extraLabel: "SHOW",
    extra: ["GST collected", "Gross sales"],
  },
  {
    id: "fees",
    title: "TaptPay Fees",
    desc: "10¢ flat per payment",
    icon: "M12 3v18 M17 8a5 5 0 0 0-10 0c0 5 10 3 10 8a5 5 0 0 1-10 0",
    extraLabel: "GROUP BY",
    extra: ["Monthly", "Weekly"],
  },
  {
    id: "splits",
    title: "Split Bills",
    desc: "group payments & completion",
    icon: "M12 3v7 M12 10l-6 8 M12 10l6 8",
    extraLabel: "STATUS",
    extra: ["All", "Completed", "Partial"],
  },
  {
    id: "failed",
    title: "Failed & Refunded",
    desc: "declines, retries & refunds",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9l6 6 M15 9l-6 6",
    extraLabel: "TYPE",
    extra: ["All", "Declined", "Refunds"],
  },
  {
    id: "days",
    title: "Busiest Days",
    desc: "traffic patterns by weekday",
    icon: "M8 3v4 M16 3v4 M4 9h16 M4 5h16v16H4z",
    extraLabel: "METRIC",
    extra: ["Sales", "Revenue"],
  },
  {
    id: "stockrep",
    title: "Stock Performance",
    desc: "movers & shelf-warmers",
    icon: "M21 8l-9-5-9 5v8l9 5 9-5V8z M3 8l9 5 9-5 M12 13v8",
    extraLabel: "PRODUCTS",
    extra: ["All", "Selling", "Not selling"],
  },
];

export const REPORT_BY_ID: Record<RetailReportId, RetailReportMeta> = Object.fromEntries(
  RETAIL_DESKTOP_REPORTS.map((r) => [r.id, r]),
) as Record<RetailReportId, RetailReportMeta>;

/* ── outputs ── */

export interface ReportRow {
  name: string;
  sub: string;
  val: string;
  sub2: string;
}
export interface ReportSeg {
  label: string;
  pct: number;
  val: string;
}
export interface ReportBar {
  v: number; // 0..1 of the tallest bar
  label: string;
}
export interface ReportResult {
  title: string;
  chart: "donut" | "bars";
  heroV: string;
  heroL: string;
  h2V: string;
  h2L: string;
  segs: ReportSeg[];
  bars: ReportBar[];
  detailTitle: string;
  rows: ReportRow[];
}

export interface ReportContext {
  transactions: RetailTx[];
  stockItems: RetailStockItem[];
  period: PeriodChip;
  item: string;
  extra: string;
  gstRegistered?: boolean;
  now?: Date;
}

/* ── shared helpers ── */

const REVENUE_STATUSES = new Set(["completed", "partially_refunded"]);
const isRevenue = (t: RetailTx) => REVENUE_STATUSES.has(t.status);
const cents = (t: RetailTx) => dollarsToCents(t.price);
const when = (t: RetailTx) => new Date(t.createdAt);

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTER_MONTHS = ["jan — mar", "apr — jun", "jul — sep", "oct — dec"];

/** Monday-indexed weekday (0 = Monday) so charts read Mon→Sun like the design. */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

function initials(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => /^[a-z0-9]/i.test(p));
  if (parts.length === 0) return "–";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function hourLabel(h: number): string {
  const bare = (x: number) => (x % 12 === 0 ? 12 : x % 12);
  const suffix = (x: number) => (x % 24 < 12 ? "am" : "pm");
  return `${bare(h)}–${bare(h + 1)}${suffix(h + 1)}`;
}

function toBars(values: { v: number; label: string }[]): ReportBar[] {
  const max = values.reduce((m, b) => Math.max(m, b.v), 0);
  return values.map((b) => ({ v: max > 0 ? b.v / max : 0, label: b.label }));
}

/** Donut segments, each labelled with its share of the whole. */
function toSegs(entries: { label: string; value: number }[]): ReportSeg[] {
  const total = entries.reduce((s, e) => s + e.value, 0);
  return entries.map((e) => ({
    label: e.label,
    pct: pct(e.value, total),
    val: `${pct(e.value, total)}%`,
  }));
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const EMPTY: Omit<ReportResult, "title" | "detailTitle" | "chart"> = {
  heroV: "—",
  heroL: "no sales in this period",
  h2V: "",
  h2L: "",
  segs: [],
  bars: [],
  rows: [],
};

/** Item filter chips: "All items" plus the products the merchant actually has. */
export function itemChips(stockItems: RetailStockItem[], transactions: RetailTx[]): string[] {
  const names = new Set<string>();
  for (const s of stockItems) if (s.name) names.add(s.name.toLowerCase());
  if (names.size === 0) {
    for (const t of transactions) if (t.itemName) names.add(t.itemName.toLowerCase());
  }
  return [ALL_ITEMS, ...[...names].sort().slice(0, 8)];
}

/* ── the engine ── */

export function buildRetailReport(id: RetailReportId, ctx: ReportContext): ReportResult {
  const meta = REPORT_BY_ID[id];
  const now = ctx.now ?? new Date();
  const { start, end } = timeframeWindow(PERIOD_TF[ctx.period], now);

  const itemFilter = ctx.item && ctx.item !== ALL_ITEMS ? ctx.item.toLowerCase() : null;
  const scoped = ctx.transactions.filter(
    (t) =>
      inRange(t.createdAt, start, end) &&
      (!itemFilter || (t.itemName ?? "").toLowerCase() === itemFilter),
  );
  const paid = scoped.filter(isRevenue);

  const base = { title: meta.title, chart: "bars" as const, detailTitle: "" };

  switch (id) {
    /* ── best sellers ── */
    case "sellers": {
      const byName = new Map<string, { name: string; units: number; revenue: number }>();
      for (const t of paid) {
        const key = (t.itemName || "unnamed").toLowerCase();
        const e = byName.get(key) ?? { name: t.itemName || "unnamed", units: 0, revenue: 0 };
        e.units += 1;
        e.revenue += cents(t);
        byName.set(key, e);
      }
      const byRevenue = ctx.extra === "Revenue";
      const list = [...byName.values()].sort((a, b) =>
        byRevenue ? b.revenue - a.revenue : b.units - a.units,
      );
      if (list.length === 0) return { ...base, ...EMPTY, detailTitle: "BY PRODUCT" };
      const top = list[0];
      return {
        ...base,
        detailTitle: "BY PRODUCT",
        heroV: byRevenue ? fmtNZD(top.revenue) : String(top.units),
        heroL: byRevenue ? `${top.name} revenue` : `${top.name} sold`,
        h2V: byRevenue ? String(top.units) : fmtNZD(top.revenue),
        h2L: byRevenue ? "units sold" : "top product revenue",
        segs: [],
        bars: toBars(
          list.slice(0, 5).map((e) => ({ v: byRevenue ? e.revenue : e.units, label: initials(e.name) })),
        ),
        rows: list.slice(0, 8).map((e) => ({
          name: e.name,
          sub: `${fmtNZD(Math.round(e.revenue / e.units))} each`,
          val: byRevenue ? fmtNZD(e.revenue) : String(e.units),
          sub2: byRevenue ? `${e.units} sold` : fmtNZD(e.revenue),
        })),
      };
    }

    /* ── sales by hour ── */
    case "hours": {
      const dayFilter = ctx.extra;
      const rows = paid.filter((t) => {
        if (dayFilter === "Weekdays") return mondayIndex(when(t)) < 5;
        if (dayFilter === "Weekends") return mondayIndex(when(t)) >= 5;
        return true;
      });
      const buckets = new Map<number, { n: number; revenue: number }>();
      for (const t of rows) {
        const h = when(t).getHours();
        const e = buckets.get(h) ?? { n: 0, revenue: 0 };
        e.n += 1;
        e.revenue += cents(t);
        buckets.set(h, e);
      }
      const list = [...buckets.entries()].map(([h, e]) => ({ h, ...e }));
      if (list.length === 0) return { ...base, ...EMPTY, detailTitle: "BY HOUR" };
      const best = [...list].sort((a, b) => b.revenue - a.revenue)[0];
      const busiest = [...list].sort((a, b) => b.revenue - a.revenue).slice(0, 8).sort((a, b) => a.h - b.h);
      return {
        ...base,
        detailTitle: "BY HOUR",
        heroV: hourLabel(best.h),
        heroL: "busiest hour",
        h2V: String(best.n),
        h2L: "sales in the rush",
        segs: [],
        bars: toBars(busiest.map((e) => ({ v: e.revenue, label: hourLabel(e.h).replace(/[ap]m$/, "") }))),
        rows: [...list]
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 8)
          .map((e) => ({
            name: hourLabel(e.h),
            sub: "",
            val: fmtNZD(e.revenue),
            sub2: `${e.n} ${e.n === 1 ? "sale" : "sales"}`,
          })),
      };
    }

    /* ── payment methods ── */
    case "methods": {
      /* Real payment_method values, grouped the way a merchant thinks about them. */
      const DIGITAL = new Set(["qr_code", "nfc_tap", "tap_to_pay", "api"]);
      const CARD = new Set(["card_reader"]);
      const CASH = new Set(["cash", "manual"]);
      const rows = paid.filter((t) => {
        const m = t.paymentMethod ?? "qr_code";
        if (ctx.extra === "Digital") return DIGITAL.has(m);
        if (ctx.extra === "Card") return CARD.has(m);
        if (ctx.extra === "Cash") return CASH.has(m);
        return true;
      });
      const byMethod = new Map<string, { n: number; revenue: number }>();
      for (const t of rows) {
        const m = (t.paymentMethod ?? "qr_code").replace(/_/g, " ");
        const e = byMethod.get(m) ?? { n: 0, revenue: 0 };
        e.n += 1;
        e.revenue += cents(t);
        byMethod.set(m, e);
      }
      const list = [...byMethod.entries()]
        .map(([label, e]) => ({ label, ...e }))
        .sort((a, b) => b.n - a.n);
      if (list.length === 0) return { ...base, chart: "donut", ...EMPTY, detailTitle: "BY METHOD" };
      const total = list.reduce((s, e) => s + e.n, 0);
      return {
        ...base,
        chart: "donut",
        detailTitle: "BY METHOD",
        heroV: String(total),
        heroL: total === 1 ? "payment this period" : "payments this period",
        h2V: fmtNZD(total * 10),
        h2L: "total fees · 10¢ each",
        segs: toSegs(list.slice(0, 4).map((e) => ({ label: e.label, value: e.n }))),
        bars: [],
        rows: list.map((e) => ({
          name: e.label,
          sub: `${e.n} ${e.n === 1 ? "payment" : "payments"}`,
          val: `${pct(e.n, total)}%`,
          sub2: fmtNZD(e.revenue),
        })),
      };
    }

    /* ── average sale ── */
    case "avgsale": {
      const statOf = (xs: number[]) => {
        if (xs.length === 0) return 0;
        if (ctx.extra === "Median") return median(xs);
        if (ctx.extra === "Largest") return Math.max(...xs);
        return Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
      };
      const all = paid.map(cents);
      if (all.length === 0) return { ...base, ...EMPTY, detailTitle: "BY DAY" };

      const span = end.getTime() - start.getTime();
      const prevStart = new Date(start.getTime() - span);
      const prev = ctx.transactions
        .filter((t) => isRevenue(t) && inRange(t.createdAt, prevStart, start))
        .map(cents);
      const delta = statOf(all) - statOf(prev);

      const byDay = WEEKDAYS.map((label, i) => {
        const xs = paid.filter((t) => mondayIndex(when(t)) === i).map(cents);
        return { label, i, stat: statOf(xs), n: xs.length };
      });
      return {
        ...base,
        detailTitle: "BY DAY",
        heroV: fmtNZD(statOf(all)),
        heroL: `${ctx.extra.toLowerCase()} sale`,
        h2V: prev.length > 0 ? `${delta >= 0 ? "+" : "−"}${fmtNZD(Math.abs(delta))}` : "—",
        h2L: prev.length > 0 ? "vs previous period" : "no previous period",
        segs: [],
        bars: toBars(byDay.map((d) => ({ v: d.stat, label: WEEKDAY_INITIALS[d.i] }))),
        rows: byDay
          .filter((d) => d.n > 0)
          .sort((a, b) => b.stat - a.stat)
          .map((d) => ({
            name: d.label.toLowerCase(),
            sub: "",
            val: fmtNZD(d.stat),
            sub2: `${d.n} ${d.n === 1 ? "sale" : "sales"}`,
          })),
      };
    }

    /* ── gst ── */
    case "gst": {
      if (paid.length === 0) return { ...base, ...EMPTY, detailTitle: "BY QUARTER" };
      const showGross = ctx.extra === "Gross sales";
      const byQuarter = new Map<string, { year: number; q: number; gross: number; gst: number }>();
      for (const t of paid) {
        const d = when(t);
        const q = Math.floor(d.getMonth() / 3);
        const key = `${d.getFullYear()}-${q}`;
        const e = byQuarter.get(key) ?? { year: d.getFullYear(), q, gross: 0, gst: 0 };
        e.gross += cents(t);
        e.gst += calcGST(cents(t)).gst;
        byQuarter.set(key, e);
      }
      const list = [...byQuarter.values()].sort((a, b) => b.year - a.year || b.q - a.q);
      const latest = list[0];
      const qLabel = (e: { year: number; q: number }) => `Q${e.q + 1} ${e.year}`;
      return {
        ...base,
        detailTitle: "BY QUARTER",
        heroV: fmtNZD(showGross ? latest.gross : latest.gst),
        heroL: ctx.gstRegistered === false
          ? `gst content · ${qLabel(latest).toLowerCase()} · not registered`
          : `${showGross ? "gross sales" : "gst collected"} · ${qLabel(latest).toLowerCase()}`,
        h2V: fmtNZD(showGross ? latest.gst : latest.gross),
        h2L: showGross ? "gst content" : "gross sales",
        segs: [],
        bars: toBars(
          [...list]
            .slice(0, 6)
            .reverse()
            .map((e) => ({ v: showGross ? e.gross : e.gst, label: `Q${e.q + 1}` })),
        ),
        rows: list.map((e) => ({
          name: qLabel(e),
          sub: QUARTER_MONTHS[e.q],
          val: fmtNZD(showGross ? e.gross : e.gst),
          sub2: showGross ? `${fmtNZD(e.gst)} gst` : `${fmtNZD(e.gross)} gross`,
        })),
      };
    }

    /* ── taptpay fees ── */
    case "fees": {
      if (paid.length === 0) return { ...base, ...EMPTY, detailTitle: "BY PERIOD" };
      const weekly = ctx.extra === "Weekly";
      const keyOf = (d: Date) => {
        if (!weekly) return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
        const monday = new Date(d);
        monday.setDate(d.getDate() - mondayIndex(d));
        monday.setHours(0, 0, 0, 0);
        return monday.toISOString().slice(0, 10);
      };
      const labelOf = (d: Date) =>
        weekly ? `week of ${d.getDate()} ${MONTHS[d.getMonth()]}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

      const buckets = new Map<string, { label: string; short: string; n: number }>();
      for (const t of paid) {
        const d = when(t);
        const k = keyOf(d);
        const e = buckets.get(k) ?? {
          label: labelOf(d),
          short: weekly ? String(d.getDate()) : MONTHS[d.getMonth()][0],
          n: 0,
        };
        e.n += 1;
        buckets.set(k, e);
      }
      const list = [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, e]) => e);
      return {
        ...base,
        detailTitle: weekly ? "BY WEEK" : "BY MONTH",
        heroV: fmtNZD(paid.length * 10),
        heroL: "fees this period · 10¢ each",
        h2V: String(paid.length),
        h2L: paid.length === 1 ? "payment" : "payments",
        segs: [],
        bars: toBars(list.slice(-6).map((e) => ({ v: e.n, label: e.short }))),
        rows: [...list].reverse().map((e) => ({
          name: e.label,
          sub: `${e.n} ${e.n === 1 ? "payment" : "payments"}`,
          val: fmtNZD(e.n * 10),
          sub2: "10¢ each",
        })),
      };
    }

    /* ── split bills ── */
    case "splits": {
      const splits = scoped.filter((t) => t.isSplit || (t.totalSplits ?? 1) > 1);
      const state = (t: RetailTx) => {
        const done = t.completedSplits ?? 0;
        const total = t.totalSplits ?? 1;
        if (done >= total) return "completed";
        if (done > 0) return "partial";
        return "not started";
      };
      const filtered = splits.filter((t) => {
        if (ctx.extra === "Completed") return state(t) === "completed";
        if (ctx.extra === "Partial") return state(t) === "partial";
        return true;
      });
      if (filtered.length === 0) {
        return { ...base, chart: "donut", ...EMPTY, heroL: "no split bills in this period", detailTitle: "RECENT SPLITS" };
      }
      const counts = ["completed", "partial", "not started"].map((label) => ({
        label,
        value: filtered.filter((t) => state(t) === label).length,
      }));
      const avgWays =
        filtered.reduce((s, t) => s + (t.totalSplits ?? 1), 0) / filtered.length;
      return {
        ...base,
        chart: "donut",
        detailTitle: "RECENT SPLITS",
        heroV: String(filtered.length),
        heroL: filtered.length === 1 ? "split bill this period" : "split bills this period",
        h2V: avgWays.toFixed(1),
        h2L: "average ways split",
        segs: toSegs(counts.filter((c) => c.value > 0)),
        bars: [],
        rows: [...filtered]
          .sort((a, b) => when(b).getTime() - when(a).getTime())
          .slice(0, 8)
          .map((t) => ({
            name: t.itemName || "sale",
            sub: when(t).toLocaleString("en-NZ", { weekday: "short", hour: "numeric", minute: "2-digit" }).toLowerCase(),
            val: fmtNZD(cents(t)),
            sub2: `${t.completedSplits ?? 0} of ${t.totalSplits ?? 1} paid · ${state(t)}`,
          })),
      };
    }

    /* ── failed & refunded ── */
    case "failed": {
      const declined = scoped.filter((t) => t.status === "failed" || t.status === "cancelled");
      const refunded = scoped.filter((t) => dollarsToCents(t.totalRefunded) > 0);
      const list =
        ctx.extra === "Declined" ? declined : ctx.extra === "Refunds" ? refunded : [...declined, ...refunded];
      const refundTotal = refunded.reduce((s, t) => s + dollarsToCents(t.totalRefunded), 0);
      const rate = scoped.length > 0 ? (declined.length / scoped.length) * 100 : 0;

      const byDay = WEEKDAYS.map((label, i) => ({
        label,
        i,
        n: declined.filter((t) => mondayIndex(when(t)) === i).length,
      }));
      return {
        ...base,
        detailTitle: "RECENT ISSUES",
        heroV: `${rate.toFixed(1)}%`,
        heroL: "failure rate",
        h2V: fmtNZD(refundTotal),
        h2L: "refunded this period",
        segs: [],
        bars: toBars(byDay.map((d) => ({ v: d.n, label: WEEKDAY_INITIALS[d.i] }))),
        rows: [...list]
          .sort((a, b) => when(b).getTime() - when(a).getTime())
          .slice(0, 8)
          .map((t) => {
            const ref = dollarsToCents(t.totalRefunded);
            return {
              name: t.itemName || "sale",
              sub: ref > 0 ? `refunded ${fmtNZD(ref)}` : t.status === "cancelled" ? "cancelled" : "declined",
              val: fmtNZD(cents(t)),
              sub2: when(t).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" }).toLowerCase(),
            };
          }),
      };
    }

    /* ── busiest days ── */
    case "days": {
      if (paid.length === 0) return { ...base, ...EMPTY, detailTitle: "BY DAY" };
      const byRevenue = ctx.extra === "Revenue";
      const byDay = WEEKDAYS.map((label, i) => {
        const rows = paid.filter((t) => mondayIndex(when(t)) === i);
        return {
          label,
          i,
          n: rows.length,
          revenue: rows.reduce((s, t) => s + cents(t), 0),
        };
      });
      const metric = (d: { n: number; revenue: number }) => (byRevenue ? d.revenue : d.n);
      const best = [...byDay].sort((a, b) => metric(b) - metric(a))[0];
      return {
        ...base,
        detailTitle: "BY DAY",
        heroV: best.label.toLowerCase(),
        heroL: "busiest day",
        h2V: byRevenue ? fmtNZD(best.revenue) : String(best.n),
        h2L: `${byRevenue ? "revenue" : "sales"} on ${best.label.toLowerCase()}`,
        segs: [],
        bars: toBars(byDay.map((d) => ({ v: metric(d), label: WEEKDAY_INITIALS[d.i] }))),
        rows: byDay
          .filter((d) => d.n > 0)
          .sort((a, b) => metric(b) - metric(a))
          .map((d) => ({
            name: d.label.toLowerCase(),
            sub: "",
            val: byRevenue ? fmtNZD(d.revenue) : String(d.n),
            sub2: byRevenue ? `${d.n} ${d.n === 1 ? "sale" : "sales"}` : fmtNZD(d.revenue),
          })),
      };
    }

    /* ── stock performance ── */
    case "stockrep": {
      const sold = new Map<string, { name: string; units: number; revenue: number; cost: number | null }>();
      for (const s of ctx.stockItems) {
        sold.set(s.name.toLowerCase(), {
          name: s.name,
          units: 0,
          revenue: 0,
          cost: dollarsToCents(s.cost),
        });
      }
      for (const t of paid) {
        const key = (t.itemName || "unnamed").toLowerCase();
        const e = sold.get(key) ?? { name: t.itemName || "unnamed", units: 0, revenue: 0, cost: null };
        e.units += 1;
        e.revenue += cents(t);
        sold.set(key, e);
      }
      let list = [...sold.values()].sort((a, b) => b.revenue - a.revenue);
      const notSelling = list.filter((e) => e.units === 0).length;
      if (ctx.extra === "Selling") list = list.filter((e) => e.units > 0);
      else if (ctx.extra === "Not selling") list = list.filter((e) => e.units === 0);

      const withSales = list.filter((e) => e.units > 0);
      const total = withSales.reduce((s, e) => s + e.revenue, 0);
      if (list.length === 0) return { ...base, chart: "donut", ...EMPTY, detailTitle: "BY PRODUCT" };

      const top = withSales.slice(0, 4);
      const rest = withSales.slice(4).reduce((s, e) => s + e.revenue, 0);
      const segEntries = [
        ...top.map((e) => ({ label: e.name, value: e.revenue })),
        ...(rest > 0 ? [{ label: "other", value: rest }] : []),
      ];
      return {
        ...base,
        chart: "donut",
        detailTitle: "BY PRODUCT",
        heroV: withSales.length > 0 ? `${pct(withSales[0].revenue, total)}%` : "—",
        heroL: withSales.length > 0 ? `of revenue is ${withSales[0].name}` : "nothing sold in this period",
        h2V: String(notSelling),
        h2L: notSelling === 1 ? "product with no sales" : "products with no sales",
        segs: toSegs(segEntries),
        bars: [],
        rows: list.slice(0, 10).map((e) => ({
          name: e.name,
          sub: e.cost != null ? `${fmtNZD(e.cost)} each` : "not in stock list",
          val: fmtNZD(e.revenue),
          sub2: `${e.units} sold`,
        })),
      };
    }
  }
}
