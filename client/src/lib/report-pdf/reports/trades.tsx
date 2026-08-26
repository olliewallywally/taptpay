/* The four Trades reports (Invoice Summary, Quote Conversion, Aged Receivables,
   Client Statement). Builders are plain functions returning a @react-pdf
   <Document>. Data is the trades caches: clients (client_profiles), invoices
   (job_invoices) and quotes. All money is already integer cents. GST follows the
   merchant's trade GST mode (inclusive default) via calcGSTByMode. */
import React from "react";
import { Document } from "@react-pdf/renderer";

import {
  ReportPage, SectionTitle, KpiRow, DataTable, DonutStat, Money, StatusText,
  type Column, type MerchantHeader,
} from "../components";
import {
  fmtNZD, fmtDate, dateRangeLabel, calcGSTByMode, daysOverdue,
  inRange, agedBuckets, sumCents, ratePct, fmtPct, buildCSV,
} from "../../report-utils";
import {
  tradesInvoiceRemainingCents,
  tradesOutstandingCents,
} from "../../trades-money";
import { savePdf, downloadCsv } from "../savePdf";
import type { ReportFormat, DateRange } from "./types";

export interface TradesReportData {
  merchant: MerchantHeader;
  clients: any[];
  invoices: any[];
  quotes: any[];
  /** Merchant trade GST mode ("inclusive" default). */
  gstMode?: string | null;
  /** Selected site address when the page is filtered to one site. */
  scope?: string;
}

/* ── Domain helpers ─────────────────────────────────────────────────── */

const isPaid = (i: any) => i.status === "paid" || i.status === "paid_external";
const isVoided = (i: any) => i.status === "voided";
const isOverdue = (i: any, now: Date) =>
  !isPaid(i) && !isVoided(i) && i.dueAt != null && new Date(i.dueAt).getTime() < now.getTime();

const clientName = (c: any) => [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim() || "—";
const byId = (clients: any[]) => new Map<string, any>(clients.map((c) => [c.id, c]));
const siteOf = (i: any, cmap: Map<string, any>) => cmap.get(i.clientProfileId)?.siteAddress ?? "—";
const nameOf = (i: any, cmap: Map<string, any>) => {
  const c = cmap.get(i.clientProfileId);
  return c ? clientName(c) : "—";
};

const KIND_LABEL: Record<string, string> = { deposit: "Deposit", balance: "Balance", full: "Full", recurring: "Recurring" };
const kindLabel = (k: string) => KIND_LABEL[k] ?? (k ? k[0].toUpperCase() + k.slice(1) : "—");

type StatusKind = "paid" | "overdue" | "sent" | "muted";
function invStatus(i: any, now: Date): { kind: StatusKind; label: string } {
  if (isPaid(i)) return { kind: "paid", label: "Paid" };
  if (isVoided(i)) return { kind: "muted", label: "Voided" };
  if (isOverdue(i, now)) return { kind: "overdue", label: "Overdue" };
  return { kind: "sent", label: "Sent" };
}

const scopePrefix = (data: TradesReportData) => (data.scope ? `${data.scope}  ·  ` : "");

/* ── 1 · Invoice Summary (period, grouped by kind) ──────────────────── */

interface GroupRow {
  type: string;
  count: number;
  invoicedCents: number;
  collectedCents: number;
  rate: number | null;
}

function invoiceGroups(data: TradesReportData, range: DateRange): GroupRow[] {
  const inPeriod = data.invoices.filter((i) => !isVoided(i) && inRange(i.createdAt, range.start, range.end));
  const groups = new Map<string, any[]>();
  for (const i of inPeriod) {
    const k = i.kind ?? "full";
    const arr = groups.get(k) ?? [];
    arr.push(i);
    groups.set(k, arr);
  }
  return [...groups.entries()]
    .map(([type, invs]) => {
      const paid = invs.filter(isPaid);
      return {
        type: kindLabel(type),
        count: invs.length,
        invoicedCents: sumCents(invs, (i) => i.amountCents ?? 0),
        collectedCents: sumCents(paid, (i) => i.amountCents ?? 0),
        rate: ratePct(paid.length, invs.length),
      };
    })
    .sort((a, b) => b.invoicedCents - a.invoicedCents);
}

function InvoiceSummaryDoc(data: TradesReportData, range: DateRange) {
  const rows = invoiceGroups(data, range);
  const invoiced = rows.reduce((s, r) => s + r.invoicedCents, 0);
  const collected = rows.reduce((s, r) => s + r.collectedCents, 0);
  const count = rows.reduce((s, r) => s + r.count, 0);
  const gst = calcGSTByMode(invoiced, data.gstMode);

  const columns: Column<GroupRow>[] = [
    { header: "Type", flex: 2.4, render: (r) => r.type },
    { header: "Count", flex: 1.2, align: "right", render: (r) => String(r.count) },
    { header: "Invoiced", flex: 2, align: "right", render: (r) => <Money cents={r.invoicedCents} /> },
    { header: "Collected", flex: 2, align: "right", render: (r) => <Money cents={r.collectedCents} /> },
    { header: "Rate", flex: 1.2, align: "right", render: (r) => fmtPct(r.rate) },
  ];

  return (
    <Document title="Invoice Summary">
      <ReportPage merchant={data.merchant} title="Invoice Summary" period={`${scopePrefix(data)}${dateRangeLabel(range.start, range.end)}`}>
        <KpiRow
          items={[
            { label: "Invoiced", value: fmtNZD(invoiced), sub: `${count} invoices` },
            { label: "Collected", value: fmtNZD(collected) },
            { label: "Collection Rate", value: fmtPct(ratePct(collected, invoiced)) },
          ]}
        />
        <SectionTitle>By invoice type</SectionTitle>
        <DataTable
          columns={columns}
          rows={rows}
          foot={["Total", String(count), fmtNZD(invoiced), fmtNZD(collected), ""]}
          emptyText="No invoices in this period."
        />
        <SectionTitle>GST summary ({data.gstMode === "exclusive" ? "exclusive" : "inclusive"}, 15%)</SectionTitle>
        <KpiRow
          items={[
            { label: "Excl. GST", value: fmtNZD(gst.excl) },
            { label: "GST", value: fmtNZD(gst.gst) },
            { label: "Incl. GST", value: fmtNZD(gst.incl) },
          ]}
        />
      </ReportPage>
    </Document>
  );
}

function invoiceSummaryCsv(data: TradesReportData, range: DateRange) {
  const rows = invoiceGroups(data, range);
  const headers = ["Type", "Count", "Invoiced (NZD)", "Collected (NZD)", "Rate %"];
  const body = rows.map((r) => [r.type, r.count, (r.invoicedCents / 100).toFixed(2), (r.collectedCents / 100).toFixed(2), r.rate == null ? "" : String(r.rate)]);
  return { csv: buildCSV(headers, body), filename: `Invoice Summary ${dateRangeLabel(range.start, range.end)}` };
}

/* ── 2 · Quote Conversion (period) ──────────────────────────────────── */

const QUOTE_STATUSES = ["draft", "sent", "viewed", "accepted", "declined", "expired"] as const;

function QuoteConversionDoc(data: TradesReportData, range: DateRange) {
  const quotes = data.quotes.filter((q) => inRange(q.createdAt, range.start, range.end));
  const byStatus = QUOTE_STATUSES.map((s) => {
    const qs = quotes.filter((q) => q.status === s);
    return { status: s, count: qs.length, valueCents: sumCents(qs, (q) => q.totalCents ?? 0) };
  });

  const sentCount = quotes.filter((q) => q.sentAt || q.status !== "draft").length;
  const accepted = quotes.filter((q) => q.status === "accepted");
  const conversion = ratePct(accepted.length, sentCount);
  const avgValue = quotes.length ? Math.round(sumCents(quotes, (q) => q.totalCents ?? 0) / quotes.length) : 0;

  // Average days from sent to accepted, where both timestamps exist.
  const spans = accepted
    .filter((q) => q.sentAt && q.acceptedAt)
    .map((q) => (new Date(q.acceptedAt).getTime() - new Date(q.sentAt).getTime()) / 86_400_000)
    .filter((d) => d >= 0);
  const avgDays = spans.length ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null;

  const columns: Column<{ status: string; count: number; valueCents: number }>[] = [
    { header: "Status", flex: 2.4, render: (r) => r.status[0].toUpperCase() + r.status.slice(1) },
    { header: "Count", flex: 1.2, align: "right", render: (r) => String(r.count) },
    { header: "Value", flex: 2, align: "right", render: (r) => <Money cents={r.valueCents} /> },
  ];

  return (
    <Document title="Quote Conversion">
      <ReportPage merchant={data.merchant} title="Quote Conversion" period={`${scopePrefix(data)}${dateRangeLabel(range.start, range.end)}`}>
        <KpiRow
          items={[
            { label: "Quotes", value: String(quotes.length), sub: `${sentCount} sent` },
            { label: "Accepted", value: String(accepted.length) },
            { label: "Avg Quote", value: fmtNZD(avgValue) },
            { label: "Avg Days to Accept", value: avgDays == null ? "—" : String(avgDays) },
          ]}
        />
        <SectionTitle>Conversion</SectionTitle>
        <DonutStat pct={conversion ?? 0} centerLabel={fmtPct(conversion)} caption={`${accepted.length} accepted of ${sentCount} sent`} />
        <SectionTitle>By status</SectionTitle>
        <DataTable
          columns={columns}
          rows={byStatus}
          foot={["Total", String(quotes.length), fmtNZD(sumCents(quotes, (q) => q.totalCents ?? 0))]}
          emptyText="No quotes in this period."
        />
      </ReportPage>
    </Document>
  );
}

/* ── 3 · Aged Receivables (bucketed) ────────────────────────────────── */

function AgedReceivablesDoc(data: TradesReportData) {
  const now = new Date();
  const cmap = byId(data.clients);
  const overdue = data.invoices.filter(
    (invoice) =>
      tradesInvoiceRemainingCents(invoice) > 0 &&
      daysOverdue(invoice.dueAt, now) >= 1,
  );
  const { buckets, grandTotalCents } = agedBuckets<any>(
    overdue,
    (invoice) => invoice.dueAt,
    (invoice) => tradesInvoiceRemainingCents(invoice),
    now,
  );
  const oldest = overdue.reduce((m, i) => Math.max(m, daysOverdue(i.dueAt, now)), 0);

  const columns: Column<any>[] = [
    { header: "Client", flex: 2, render: (i) => nameOf(i, cmap) },
    { header: "Email", flex: 2.4, render: (i) => cmap.get(i.clientProfileId)?.email ?? "—" },
    { header: "Site", flex: 2.6, render: (i) => siteOf(i, cmap) },
    { header: "Type", flex: 1.3, render: (i) => kindLabel(i.kind) },
    { header: "Outstanding", flex: 1.5, align: "right", render: (i) => <Money cents={tradesInvoiceRemainingCents(i)} /> },
    { header: "Days", flex: 1, align: "right", render: (i) => String(daysOverdue(i.dueAt, now)) },
  ];

  return (
    <Document title="Aged Receivables">
      <ReportPage merchant={data.merchant} title="Aged Receivables" period={`${scopePrefix(data)}Overdue as at ${fmtDate(now)}`}>
        <KpiRow
          items={[
            { label: "Total Overdue", value: fmtNZD(grandTotalCents), sub: `${overdue.length} invoices` },
            { label: "Buckets", value: buckets.filter((b) => b.rows.length > 0).length + " active" },
            { label: "Oldest", value: oldest ? `${oldest} days` : "—" },
          ]}
        />
        {buckets
          .filter((b) => b.rows.length > 0)
          .map((b) => (
            <React.Fragment key={b.key}>
              <SectionTitle>{`${b.label}  ·  ${fmtNZD(b.totalCents)}  (${b.rows.length})`}</SectionTitle>
              <DataTable columns={columns} rows={b.rows} foot={["Subtotal", "", "", "", fmtNZD(b.totalCents), ""]} />
            </React.Fragment>
          ))}
        {overdue.length === 0 && <SectionTitle>No overdue invoices — every client is up to date.</SectionTitle>}
      </ReportPage>
    </Document>
  );
}

/* ── 4 · Client Statement (single client or all) ────────────────────── */

function ClientStatementDoc(data: TradesReportData, range: DateRange, clientId: string | null) {
  const now = new Date();
  const cmap = byId(data.clients);
  const targets = clientId ? data.clients.filter((c) => c.id === clientId) : data.clients.filter((c) => c.status !== "archived");
  const sorted = [...targets].sort((a, b) => clientName(a).localeCompare(clientName(b)));

  const columns: Column<any>[] = [
    { header: "Date", flex: 1.4, render: (i) => fmtDate(i.createdAt) },
    { header: "Detail", flex: 3, render: (i) => (i.jobDetails ? String(i.jobDetails) : kindLabel(i.kind)) },
    { header: "Amount", flex: 1.6, align: "right", render: (i) => <Money cents={i.amountCents ?? 0} /> },
    { header: "Status", flex: 1.5, align: "center", render: (i) => { const s = invStatus(i, now); return <StatusText kind={s.kind} label={s.label} />; } },
    { header: "Paid", flex: 1.4, align: "right", render: (i) => (i.paidAt ? fmtDate(i.paidAt) : "—") },
  ];

  return (
    <Document title="Client Statement">
      <ReportPage merchant={data.merchant} title="Client Statement" period={`${clientId ? clientName(cmap.get(clientId)) + "  ·  " : ""}${dateRangeLabel(range.start, range.end)}`}>
        {sorted.length === 0 && <SectionTitle>No clients to report.</SectionTitle>}
        {sorted.map((c) => {
          const invs = data.invoices
            .filter((i) => i.clientProfileId === c.id && !isVoided(i) && inRange(i.createdAt, range.start, range.end))
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          const balance = tradesOutstandingCents(invs);
          return (
            <React.Fragment key={c.id}>
              <SectionTitle>{`${clientName(c)}  ·  ${c.siteAddress ?? "—"}`}</SectionTitle>
              <DataTable
                columns={columns}
                rows={invs}
                foot={["Balance outstanding", "", fmtNZD(balance), "", ""]}
                emptyText="No invoices in this period."
              />
            </React.Fragment>
          );
        })}
      </ReportPage>
    </Document>
  );
}

/* ── Dispatcher (heavy: pulls @react-pdf — imported dynamically by callers) ── */
/* The lightweight option list lives in ./trades-options. */

const biz = (data: TradesReportData) => data.merchant.businessName || "TaptPay";

export async function runTradesReport(
  id: string,
  format: ReportFormat,
  data: TradesReportData,
  range: DateRange,
  clientId: string | null = null,
): Promise<void> {
  switch (id) {
    case "invoice-summary":
      if (format === "csv") {
        const { csv, filename } = invoiceSummaryCsv(data, range);
        downloadCsv(csv, filename);
        return;
      }
      await savePdf(InvoiceSummaryDoc(data, range), `${biz(data)} Invoice Summary`);
      return;
    case "quote-conversion":
      await savePdf(QuoteConversionDoc(data, range), `${biz(data)} Quote Conversion`);
      return;
    case "aged-receivables":
      await savePdf(AgedReceivablesDoc(data), `${biz(data)} Aged Receivables`);
      return;
    case "client-statement":
      await savePdf(ClientStatementDoc(data, range, clientId), `${biz(data)} Client Statement`);
      return;
    default:
      throw new Error(`Unknown trades report: ${id}`);
  }
}
