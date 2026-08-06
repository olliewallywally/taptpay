/* Trades desktop analytics previews for the four reports that have a real
   TradesReportsButton/PDF implementation. This module is deliberately pure: the
   page supplies the shared trades caches and every displayed value is derived
   from clientProfiles, jobInvoices and quotes.

   The report ids and snapshot/period behaviour match
   report-pdf/reports/trades-options.ts. The output shape mirrors
   desktop/data/property-reports.ts so the analytics page can share the same
   donut/bar/row presentation without importing @react-pdf. */
import {
  agedBuckets,
  fmtDate,
  fmtNZD,
  fmtPct,
  inRange,
  ratePct,
  sumCents,
  timeframeWindow,
} from "@/lib/report-utils";
import type { TradesClient, TradesInvoice, TradesQuote } from "./trades-data";

/* ── inputs and metadata ───────────────────────────────────────────── */

export const TRADES_PERIOD_CHIPS = [
  "This week",
  "This month",
  "This quarter",
  "This year",
] as const;
export type TradesPeriodChip = (typeof TRADES_PERIOD_CHIPS)[number];

export const ALL_SITES = "All sites";

export type TradesReportId =
  | "invoice-summary"
  | "quote-conversion"
  | "aged-receivables"
  | "client-statement";

export interface TradesReportMeta {
  id: TradesReportId;
  title: string;
  desc: string;
  icon: string;
  extraLabel: string;
  extra: string[];
  periodFiltered: boolean;
}

export const TRADES_DESKTOP_REPORTS: TradesReportMeta[] = [
  {
    id: "invoice-summary",
    title: "Invoice Summary",
    desc: "invoices by type, with collection rate",
    icon: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
    extraLabel: "TYPE",
    extra: ["All", "Full", "Deposit", "Balance", "Recurring"],
    periodFiltered: true,
  },
  {
    id: "quote-conversion",
    title: "Quote Conversion",
    desc: "pipeline, conversion rate and time to accept",
    icon: "M4 20h16 M7 16v-5 M12 16V8 M17 16v-3",
    extraLabel: "STATUS",
    extra: ["All", "Accepted", "Awaiting", "Declined", "Expired"],
    periodFiltered: true,
  },
  {
    id: "aged-receivables",
    title: "Aged Receivables",
    desc: "outstanding balances by age",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 8v4l3 3",
    extraLabel: "AGING",
    extra: ["All", "1–7 days", "8–30 days", "31–60 days", "60+ days"],
    periodFiltered: false,
  },
  {
    id: "client-statement",
    title: "Client Statement",
    desc: "every invoice in the period, by client",
    icon: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21c1.6-4.4 4.6-6.6 8-6.6s6.4 2.2 8 6.6",
    extraLabel: "BALANCE",
    extra: ["All", "Outstanding", "Settled"],
    periodFiltered: true,
  },
];

export const TRADES_REPORT_BY_ID: Record<TradesReportId, TradesReportMeta> =
  Object.fromEntries(TRADES_DESKTOP_REPORTS.map((r) => [r.id, r])) as Record<
    TradesReportId,
    TradesReportMeta
  >;

export interface TradesReportRow {
  name: string;
  sub: string;
  val: string;
  sub2: string;
}

export interface TradesReportSeg {
  label: string;
  pct: number;
  val: string;
}

export interface TradesReportBar {
  v: number;
  label: string;
}

export interface TradesReportResult {
  title: string;
  chart: "donut" | "bars";
  heroV: string;
  heroL: string;
  h2V: string;
  h2L: string;
  segs: TradesReportSeg[];
  bars: TradesReportBar[];
  detailTitle: string;
  rows: TradesReportRow[];
}

export interface TradesReportContext {
  clients: TradesClient[];
  invoices: TradesInvoice[];
  quotes: TradesQuote[];
  period: TradesPeriodChip;
  site: string;
  extra: string;
  now?: Date;
}

/** "All sites" followed by the merchant's real, distinct site addresses. */
export function tradesSiteChips(clients: TradesClient[]): string[] {
  const sites = new Set<string>();
  for (const client of clients) {
    if (client.status === "archived" || client.status === "prospect") continue;
    const site = client.siteAddress?.trim();
    if (site) sites.add(site);
  }
  return [ALL_SITES, ...[...sites].sort((a, b) => a.localeCompare(b, "en-NZ"))];
}

/* ── shared domain helpers ─────────────────────────────────────────── */

const PAID = new Set(["paid", "paid_external"]);
const CLOSED = new Set(["paid", "paid_external", "voided", "deposit_paid"]);

const isPaid = (invoice: TradesInvoice) => PAID.has(invoice.status);
const isVoided = (invoice: TradesInvoice) => invoice.status === "voided";
const isOpen = (invoice: TradesInvoice) => !CLOSED.has(invoice.status);
const centsOf = (invoice: TradesInvoice) => invoice.amountCents ?? 0;

function dateValue(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

/** Matches the terminal and home screens: `balance_due` is overdue on sight,
 *  everything else open goes overdue the instant `dueAt` passes. */
function isOverdue(invoice: TradesInvoice, now: Date): boolean {
  if (!isOpen(invoice)) return false;
  if (invoice.status === "balance_due") return true;
  const due = dateValue(invoice.dueAt);
  return due !== null && due < now.getTime();
}

function clientName(client: TradesClient | undefined): string {
  return [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim() || "—";
}

function clientMap(clients: TradesClient[]) {
  return new Map(clients.map((client) => [client.id, client]));
}

function siteOf(
  invoice: { clientProfileId: string },
  clients: Map<string, TradesClient>,
): string {
  return clients.get(invoice.clientProfileId)?.siteAddress?.trim() || "—";
}

/** Invoices and quotes carry no address of their own, so site scoping always
 *  resolves through the client — including hidden prospect profiles, which stay
 *  joinable even though they never appear in a picker. */
function scopedData(ctx: TradesReportContext) {
  const selected = ctx.site && ctx.site !== ALL_SITES ? ctx.site : null;
  if (!selected) {
    return { clients: ctx.clients, invoices: ctx.invoices, quotes: ctx.quotes };
  }
  const ids = new Set(
    ctx.clients
      .filter((client) => client.siteAddress?.trim() === selected)
      .map((client) => client.id),
  );
  return {
    clients: ctx.clients.filter((client) => ids.has(client.id)),
    invoices: ctx.invoices.filter((invoice) => ids.has(invoice.clientProfileId)),
    quotes: ctx.quotes.filter((quote) => ids.has(quote.clientProfileId)),
  };
}

function periodRange(period: TradesPeriodChip, now: Date) {
  if (period === "This quarter") {
    const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { start, end: now };
  }
  if (period === "This week") return timeframeWindow("week", now);
  if (period === "This month") return timeframeWindow("month", now);
  return timeframeWindow("year", now);
}

const percentage = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

function toSegments(entries: { label: string; value: number }[]): TradesReportSeg[] {
  const nonZero = entries.filter((entry) => entry.value > 0);
  const total = nonZero.reduce((sum, entry) => sum + entry.value, 0);
  return nonZero.map((entry) => {
    const pct = percentage(entry.value, total);
    return { label: entry.label, pct, val: `${pct}%` };
  });
}

function toBars(entries: { label: string; value: number }[]): TradesReportBar[] {
  const max = entries.reduce((highest, entry) => Math.max(highest, entry.value), 0);
  return entries.map((entry) => ({
    label: entry.label,
    v: max > 0 ? entry.value / max : 0,
  }));
}

const KIND_LABEL: Record<string, string> = {
  full: "Full",
  deposit: "Deposit",
  balance: "Balance",
  recurring: "Recurring",
};

const kindLabel = (invoice: TradesInvoice) =>
  KIND_LABEL[invoice.kind] ?? (invoice.kind ? invoice.kind : "Full");

function statusLabel(invoice: TradesInvoice, now: Date): string {
  if (isPaid(invoice)) return "Paid";
  if (isVoided(invoice)) return "Voided";
  if (isOverdue(invoice, now)) return "Overdue";
  return "Sent";
}

/** The quote lifecycle collapsed to the four states a merchant reasons about.
 *  Sent/viewed past their validity read as expired, exactly as the server's
 *  strict-past boundary treats them. */
function quoteState(quote: TradesQuote, now: Date): "Accepted" | "Awaiting" | "Declined" | "Expired" {
  if (quote.status === "accepted" || quote.status === "invoiced") return "Accepted";
  if (quote.status === "declined") return "Declined";
  if (quote.status === "expired") return "Expired";
  if (quote.status === "sent" || quote.status === "viewed") {
    const until = dateValue(quote.validUntil);
    return until !== null && until < now.getTime() ? "Expired" : "Awaiting";
  }
  return "Awaiting";
}

const empty = (
  title: string,
  chart: "donut" | "bars",
  detailTitle: string,
  heroL: string,
): TradesReportResult => ({
  title,
  chart,
  heroV: "—",
  heroL,
  h2V: "",
  h2L: "",
  segs: [],
  bars: [],
  detailTitle,
  rows: [],
});

/* ── report builders ───────────────────────────────────────────────── */

function buildInvoiceSummary(ctx: TradesReportContext): TradesReportResult {
  const now = ctx.now ?? new Date();
  const data = scopedData(ctx);
  const clients = clientMap(data.clients);
  const range = periodRange(ctx.period, now);

  /* An invoice belongs to the period it was raised in, so the mix and the
     collection rate describe the same set of invoices. */
  const inPeriod = data.invoices.filter(
    (invoice) => !isVoided(invoice) && inRange(invoice.createdAt, range.start, range.end),
  );
  const selected =
    ctx.extra === "All"
      ? inPeriod
      : inPeriod.filter((invoice) => kindLabel(invoice) === ctx.extra);

  if (selected.length === 0) {
    return empty("Invoice Summary", "donut", "BY INVOICE", "no invoices in this period");
  }

  const invoicedCents = sumCents(selected, centsOf);
  const paid = selected.filter(isPaid);
  const collectedCents = sumCents(paid, centsOf);
  const mix = ["Full", "Deposit", "Balance", "Recurring"].map((label) => ({
    label: label.toLowerCase(),
    value: sumCents(
      selected.filter((invoice) => kindLabel(invoice) === label),
      centsOf,
    ),
  }));

  return {
    title: "Invoice Summary",
    chart: "donut",
    heroV: fmtNZD(invoicedCents),
    heroL: `${selected.length} invoice${selected.length === 1 ? "" : "s"} raised`,
    h2V: fmtNZD(collectedCents),
    h2L: `${fmtPct(ratePct(collectedCents, invoicedCents))} collected`,
    segs: toSegments(mix),
    bars: [],
    detailTitle: "BY INVOICE",
    rows: [...selected]
      .sort(
        (a, b) => (dateValue(b.createdAt) ?? 0) - (dateValue(a.createdAt) ?? 0),
      )
      .map((invoice) => ({
        name: clientName(clients.get(invoice.clientProfileId)),
        sub: `${kindLabel(invoice).toLowerCase()} · ${siteOf(invoice, clients)}`,
        val: fmtNZD(centsOf(invoice)),
        sub2: `${statusLabel(invoice, now).toLowerCase()} · raised ${fmtDate(invoice.createdAt)}`,
      })),
  };
}

function buildQuoteConversion(ctx: TradesReportContext): TradesReportResult {
  const now = ctx.now ?? new Date();
  const data = scopedData(ctx);
  const clients = clientMap(data.clients);
  const range = periodRange(ctx.period, now);

  const inPeriod = data.quotes.filter((quote) =>
    inRange(quote.createdAt, range.start, range.end),
  );
  const selected =
    ctx.extra === "All"
      ? inPeriod
      : inPeriod.filter((quote) => quoteState(quote, now) === ctx.extra);

  if (selected.length === 0) {
    return empty("Quote Conversion", "donut", "BY QUOTE", "no quotes in this period");
  }

  /* Conversion is measured against every quote raised in the period, not just
     the filtered slice, so the headline rate does not move with the chip. */
  const accepted = inPeriod.filter((quote) => quoteState(quote, now) === "Accepted");
  const acceptDays = accepted
    .map((quote) => {
      const sent = dateValue(quote.sentAt) ?? dateValue(quote.createdAt);
      const at = dateValue(quote.acceptedAt);
      return sent !== null && at !== null ? (at - sent) / 86_400_000 : null;
    })
    .filter((days): days is number => days !== null && days >= 0);
  const avgDays =
    acceptDays.length > 0
      ? Math.round((acceptDays.reduce((sum, d) => sum + d, 0) / acceptDays.length) * 10) / 10
      : null;

  const states = ["Accepted", "Awaiting", "Declined", "Expired"].map((label) => ({
    label: label.toLowerCase(),
    value: inPeriod.filter((quote) => quoteState(quote, now) === label).length,
  }));

  return {
    title: "Quote Conversion",
    chart: "donut",
    heroV: fmtPct(ratePct(accepted.length, inPeriod.length)),
    heroL: `${accepted.length} of ${inPeriod.length} accepted`,
    h2V: fmtNZD(sumCents(selected, (quote) => quote.totalCents ?? 0)),
    h2L: avgDays === null ? "no accepted quotes yet" : `${avgDays}d average to accept`,
    segs: toSegments(states),
    bars: [],
    detailTitle: "BY QUOTE",
    rows: [...selected]
      .sort((a, b) => (dateValue(b.createdAt) ?? 0) - (dateValue(a.createdAt) ?? 0))
      .map((quote) => ({
        name: clientName(clients.get(quote.clientProfileId)),
        sub: `${siteOf(quote, clients)} · sent ${fmtDate(quote.sentAt ?? quote.createdAt)}`,
        val: fmtNZD(quote.totalCents ?? 0),
        sub2: quoteState(quote, now).toLowerCase(),
      })),
  };
}

function buildAgedReceivables(ctx: TradesReportContext): TradesReportResult {
  const now = ctx.now ?? new Date();
  const data = scopedData(ctx);
  const clients = clientMap(data.clients);

  /* A snapshot, never period-filtered: what is owed right now. agedBuckets does
     the ageing off dueAt, so this pre-filter only drops settled and cancelled
     rows — a balance_due invoice whose due date is still ahead has no age yet
     and so belongs in no bucket. */
  const outstanding = data.invoices.filter(isOpen);
  const { buckets, grandTotalCents } = agedBuckets(
    outstanding,
    (invoice) => invoice.dueAt,
    centsOf,
    now,
  );

  const selected =
    ctx.extra === "All"
      ? buckets
      : buckets.filter((bucket) => bucket.label === ctx.extra);
  const rows = selected.flatMap((bucket) =>
    bucket.rows.map((invoice) => ({ invoice, bucket: bucket.label })),
  );

  if (rows.length === 0) {
    return empty("Aged Receivables", "bars", "BY INVOICE", "nothing overdue");
  }

  const shownCents = sumCents(rows, (row) => centsOf(row.invoice));
  const oldest = rows.reduce<number | null>((earliest, row) => {
    const due = dateValue(row.invoice.dueAt);
    return due !== null && (earliest === null || due < earliest) ? due : earliest;
  }, null);

  return {
    title: "Aged Receivables",
    chart: "bars",
    heroV: fmtNZD(shownCents),
    heroL: `${rows.length} overdue invoice${rows.length === 1 ? "" : "s"}`,
    h2V: fmtNZD(grandTotalCents),
    h2L: oldest === null ? "total overdue" : `oldest due ${fmtDate(oldest)}`,
    segs: [],
    bars: toBars(
      buckets.map((bucket) => ({ label: bucket.label, value: bucket.totalCents })),
    ),
    detailTitle: "BY INVOICE",
    rows: rows
      .sort((a, b) => (dateValue(a.invoice.dueAt) ?? 0) - (dateValue(b.invoice.dueAt) ?? 0))
      .map(({ invoice, bucket }) => ({
        name: clientName(clients.get(invoice.clientProfileId)),
        sub: `${siteOf(invoice, clients)} · ${kindLabel(invoice).toLowerCase()}`,
        val: fmtNZD(centsOf(invoice)),
        sub2: `${bucket} · due ${fmtDate(invoice.dueAt)}`,
      })),
  };
}

function buildClientStatement(ctx: TradesReportContext): TradesReportResult {
  const now = ctx.now ?? new Date();
  const data = scopedData(ctx);
  const range = periodRange(ctx.period, now);

  const inPeriod = data.invoices.filter(
    (invoice) => !isVoided(invoice) && inRange(invoice.createdAt, range.start, range.end),
  );

  const byClient = new Map<string, TradesInvoice[]>();
  for (const invoice of inPeriod) {
    const rows = byClient.get(invoice.clientProfileId) ?? [];
    rows.push(invoice);
    byClient.set(invoice.clientProfileId, rows);
  }

  const clients = clientMap(data.clients);
  const statements = [...byClient.entries()]
    .map(([clientId, invoices]) => {
      const billedCents = sumCents(invoices, centsOf);
      const outstandingCents = sumCents(invoices.filter(isOpen), centsOf);
      return {
        client: clients.get(clientId),
        invoices,
        billedCents,
        outstandingCents,
        overdue: invoices.some((invoice) => isOverdue(invoice, now)),
      };
    })
    .filter((row) =>
      ctx.extra === "Outstanding"
        ? row.outstandingCents > 0
        : ctx.extra === "Settled"
          ? row.outstandingCents === 0
          : true,
    )
    .sort((a, b) => b.billedCents - a.billedCents);

  if (statements.length === 0) {
    return empty("Client Statement", "bars", "BY CLIENT", "no invoices in this period");
  }

  const billedCents = statements.reduce((sum, row) => sum + row.billedCents, 0);
  const outstandingCents = statements.reduce((sum, row) => sum + row.outstandingCents, 0);

  return {
    title: "Client Statement",
    chart: "bars",
    heroV: fmtNZD(billedCents),
    heroL: `${statements.length} client${statements.length === 1 ? "" : "s"} billed`,
    h2V: fmtNZD(outstandingCents),
    h2L: `${statements.filter((row) => row.overdue).length} with overdue`,
    segs: [],
    bars: toBars(
      statements.slice(0, 8).map((row) => ({
        label: clientName(row.client).split(" ")[0],
        value: row.billedCents,
      })),
    ),
    detailTitle: "BY CLIENT",
    rows: statements.map((row) => ({
      name: clientName(row.client),
      sub: `${row.client?.siteAddress?.trim() || "—"} · ${row.invoices.length} invoice${row.invoices.length === 1 ? "" : "s"}`,
      val: fmtNZD(row.billedCents),
      sub2:
        row.outstandingCents > 0
          ? `${fmtNZD(row.outstandingCents)} outstanding${row.overdue ? " · overdue" : ""}`
          : "settled",
    })),
  };
}

export function buildTradesReport(
  id: TradesReportId,
  ctx: TradesReportContext,
): TradesReportResult {
  switch (id) {
    case "invoice-summary":
      return buildInvoiceSummary(ctx);
    case "quote-conversion":
      return buildQuoteConversion(ctx);
    case "aged-receivables":
      return buildAgedReceivables(ctx);
    case "client-statement":
      return buildClientStatement(ctx);
  }
}
