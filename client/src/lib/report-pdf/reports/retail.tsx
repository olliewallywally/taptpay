/* The three Retail / Payments reports (Sales Summary, Transaction Ledger, Refunds
   Report). Builders are plain functions returning a @react-pdf <Document>. Data is
   the retail `transactions` cache; retail stores `price`/`totalRefunded` as decimal
   dollar STRINGS, so we cross to integer cents at the edge with dollarsToCents. */
import React from "react";
import { Document } from "@react-pdf/renderer";

import {
  ReportPage, SectionTitle, KpiRow, DataTable, Money, StatusText,
  type Column, type MerchantHeader,
} from "../components";
import {
  fmtNZD, fmtDate, fmtDateTime, dateRangeLabel, dollarsToCents, calcGST,
  inRange, sumCents, ratePct, fmtPct, buildCSV,
} from "../../report-utils";
import { savePdf, downloadCsv } from "../savePdf";
import type { ReportFormat, DateRange } from "./types";

export interface RetailReportData {
  merchant: MerchantHeader;
  transactions: any[];
}

/* ── Domain helpers ─────────────────────────────────────────────────── */

const priceCents = (t: any) => dollarsToCents(t.price);
const refundCents = (t: any) => dollarsToCents(t.totalRefunded);
/** A sale where money was actually captured (before any later refund). */
const isCaptured = (t: any) => t.status === "completed" || t.status === "refunded" || t.status === "partially_refunded";
const isRefunded = (t: any) => refundCents(t) > 0 || t.status === "refunded" || t.status === "partially_refunded";
const inPeriod = (t: any, r: DateRange) => inRange(t.createdAt, r.start, r.end);

type StatusKind = "paid" | "overdue" | "sent" | "muted";
function retailStatus(t: any): { kind: StatusKind; label: string } {
  switch (t.status) {
    case "completed": return { kind: "paid", label: "Completed" };
    case "refunded": return { kind: "overdue", label: "Refunded" };
    case "partially_refunded": return { kind: "overdue", label: "Part. Refunded" };
    case "failed": return { kind: "muted", label: "Failed" };
    case "processing": return { kind: "sent", label: "Processing" };
    case "pending": return { kind: "sent", label: "Pending" };
    default: return { kind: "muted", label: String(t.status ?? "—") };
  }
}

const itemName = (t: any) => (t.itemName ? String(t.itemName) : "—");

/* ── 1 · Sales Summary (one page) ───────────────────────────────────── */

function SalesSummaryDoc(data: RetailReportData, range: DateRange) {
  const txs = data.transactions.filter((t) => inPeriod(t, range));
  const captured = txs.filter(isCaptured);
  const grossCents = sumCents(captured, priceCents);
  const refundsCents = sumCents(txs, refundCents);
  const netCents = grossCents - refundsCents;
  const gst = calcGST(netCents);
  const splitCents = sumCents(captured.filter((t) => t.isSplit || t.splitEnabled), priceCents);
  const avgCents = captured.length ? Math.round(grossCents / captured.length) : 0;

  const completed = txs.filter((t) => t.status === "completed");
  const failed = txs.filter((t) => t.status === "failed");
  const refunded = txs.filter(isRefunded);

  interface BreakRow { label: string; count: number; cents: number; kind: StatusKind }
  const breakdown: BreakRow[] = [
    { label: "Completed", count: completed.length, cents: sumCents(completed, priceCents), kind: "paid" },
    { label: "Refunded", count: refunded.length, cents: sumCents(refunded, refundCents), kind: "overdue" },
    { label: "Failed", count: failed.length, cents: 0, kind: "muted" },
  ];

  const columns: Column<BreakRow>[] = [
    { header: "Status", flex: 3, render: (r) => <StatusText kind={r.kind} label={r.label} /> },
    { header: "Count", flex: 1.2, align: "right", render: (r) => String(r.count) },
    { header: "Value", flex: 2, align: "right", render: (r) => <Money cents={r.cents} /> },
  ];

  return (
    <Document title="Sales Summary">
      <ReportPage merchant={data.merchant} title="Sales Summary" period={dateRangeLabel(range.start, range.end)}>
        <KpiRow
          items={[
            { label: "Gross Revenue", value: fmtNZD(grossCents), sub: `${captured.length} sales` },
            { label: "Net After Refunds", value: fmtNZD(netCents) },
            { label: "Average Sale", value: fmtNZD(avgCents) },
            { label: "Transactions", value: String(txs.length) },
          ]}
        />
        <KpiRow
          items={[
            { label: "GST (15%) incl.", value: fmtNZD(gst.gst), sub: "in net revenue" },
            { label: "Refunds", value: fmtNZD(refundsCents), sub: `${refunded.length} refunded` },
            { label: "Split Payments", value: fmtNZD(splitCents) },
          ]}
        />
        <SectionTitle>Breakdown by status</SectionTitle>
        <DataTable
          columns={columns}
          rows={breakdown}
          foot={["Net revenue", String(txs.length), fmtNZD(netCents)]}
          emptyText="No transactions in this period."
        />
      </ReportPage>
    </Document>
  );
}

/* ── 2 · Transaction Ledger (period) ────────────────────────────────── */

function ledgerRows(data: RetailReportData, range: DateRange) {
  return data.transactions
    .filter((t) => inPeriod(t, range))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function TransactionLedgerDoc(data: RetailReportData, range: DateRange) {
  const rows = ledgerRows(data, range);
  const capturedTotal = sumCents(rows.filter(isCaptured), priceCents);

  const columns: Column<any>[] = [
    { header: "Date / Time", flex: 2.4, render: (t) => fmtDateTime(t.createdAt) },
    { header: "Item", flex: 3, render: (t) => itemName(t) },
    { header: "Amount", flex: 1.6, align: "right", render: (t) => <Money cents={priceCents(t)} /> },
    { header: "Split", flex: 1, align: "center", render: (t) => (t.isSplit || t.splitEnabled ? "Yes" : "—") },
    { header: "Status", flex: 1.8, align: "center", render: (t) => { const s = retailStatus(t); return <StatusText kind={s.kind} label={s.label} />; } },
  ];

  return (
    <Document title="Transaction Ledger">
      <ReportPage merchant={data.merchant} title="Transaction Ledger" period={dateRangeLabel(range.start, range.end)}>
        <KpiRow
          items={[
            { label: "Transactions", value: String(rows.length) },
            { label: "Captured Total", value: fmtNZD(capturedTotal) },
          ]}
        />
        <SectionTitle>Transactions</SectionTitle>
        <DataTable
          columns={columns}
          rows={rows}
          foot={["Captured total", "", fmtNZD(capturedTotal), "", ""]}
          emptyText="No transactions in this period."
        />
      </ReportPage>
    </Document>
  );
}

function ledgerCsv(data: RetailReportData, range: DateRange) {
  const rows = ledgerRows(data, range);
  const headers = ["Date/Time", "Item", "Amount (NZD)", "Split", "Status"];
  const body = rows.map((t) => [
    fmtDateTime(t.createdAt),
    itemName(t),
    (priceCents(t) / 100).toFixed(2),
    t.isSplit || t.splitEnabled ? "Yes" : "No",
    retailStatus(t).label,
  ]);
  return { csv: buildCSV(headers, body), filename: `Transaction Ledger ${dateRangeLabel(range.start, range.end)}` };
}

/* ── 3 · Refunds Report (period) ────────────────────────────────────── */

function RefundsReportDoc(data: RetailReportData, range: DateRange) {
  const rows = data.transactions
    .filter((t) => inPeriod(t, range) && refundCents(t) > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const origTotal = sumCents(rows, priceCents);
  const refundTotal = sumCents(rows, refundCents);

  const columns: Column<any>[] = [
    { header: "Date", flex: 1.6, render: (t) => fmtDate(t.createdAt) },
    { header: "Item", flex: 3, render: (t) => itemName(t) },
    { header: "Original", flex: 1.6, align: "right", render: (t) => <Money cents={priceCents(t)} /> },
    { header: "Refunded", flex: 1.6, align: "right", render: (t) => <Money cents={refundCents(t)} /> },
    { header: "Net", flex: 1.6, align: "right", render: (t) => <Money cents={priceCents(t) - refundCents(t)} /> },
  ];

  return (
    <Document title="Refunds Report">
      <ReportPage merchant={data.merchant} title="Refunds Report" period={dateRangeLabel(range.start, range.end)}>
        <KpiRow
          items={[
            { label: "Refunds", value: String(rows.length) },
            { label: "Refunded", value: fmtNZD(refundTotal) },
            { label: "Net Received", value: fmtNZD(origTotal - refundTotal) },
          ]}
        />
        <SectionTitle>Refunded transactions</SectionTitle>
        <DataTable
          columns={columns}
          rows={rows}
          foot={["Total", "", fmtNZD(origTotal), fmtNZD(refundTotal), fmtNZD(origTotal - refundTotal)]}
          emptyText="No refunds in this period."
        />
      </ReportPage>
    </Document>
  );
}

/* ── Dispatcher (heavy: pulls @react-pdf — imported dynamically by callers) ── */
/* The lightweight option list lives in ./retail-options. */

const biz = (data: RetailReportData) => data.merchant.businessName || "TaptPay";

export async function runRetailReport(
  id: string,
  format: ReportFormat,
  data: RetailReportData,
  range: DateRange,
): Promise<void> {
  switch (id) {
    case "sales-summary":
      await savePdf(SalesSummaryDoc(data, range), `${biz(data)} Sales Summary`);
      return;
    case "transaction-ledger":
      if (format === "csv") {
        const { csv, filename } = ledgerCsv(data, range);
        downloadCsv(csv, filename);
        return;
      }
      await savePdf(TransactionLedgerDoc(data, range), `${biz(data)} Transaction Ledger`);
      return;
    case "refunds":
      await savePdf(RefundsReportDoc(data, range), `${biz(data)} Refunds`);
      return;
    default:
      throw new Error(`Unknown retail report: ${id}`);
  }
}
