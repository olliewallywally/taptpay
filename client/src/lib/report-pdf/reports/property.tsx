/* The four Property Management reports (Rent Roll, Collection Statement, Aged
   Arrears, Annual Income Statement). Each builder is a plain function returning a
   @react-pdf <Document> composed from the shared primitives — no hooks, so the
   dispatcher can call them directly and hand the element to savePdf().

   Data comes straight from the property page caches: tenants (tenantProfiles),
   invoices (invoicesRentRequests) and schedules (activeSchedules). Nothing here
   fetches. Money is in integer cents throughout. */
import React from "react";
import { Document } from "@react-pdf/renderer";

import {
  ReportPage, SectionTitle, KpiRow, DataTable, Money, StatusText,
  type Column, type MerchantHeader,
} from "../components";
import {
  fmtNZD, fmtDate, dateRangeLabel, calcGST, daysOverdue,
  inRange, agedBuckets, sumCents, ratePct, fmtPct, buildCSV,
} from "../../report-utils";
import { savePdf, downloadCsv } from "../savePdf";
import type { ReportFormat, DateRange } from "./types";

export interface PropertyReportData {
  merchant: MerchantHeader;
  tenants: any[];
  invoices: any[];
  schedules: any[];
  /** Selected property address when the page is filtered to one property — the
     data is already narrowed to it; this just labels the report header. */
  scope?: string;
}

/* ── Shared domain helpers ──────────────────────────────────────────── */

const isPaid = (i: any) => i.status === "paid" || i.status === "paid_external";
const isVoided = (i: any) => i.status === "voided";
const isOverdue = (i: any, now: Date) =>
  !isPaid(i) && !isVoided(i) && i.dueAt != null && new Date(i.dueAt).getTime() < now.getTime();

const tenantName = (t: any) => [t?.firstName, t?.lastName].filter(Boolean).join(" ").trim() || "—";
const byId = (tenants: any[]) => new Map<string, any>(tenants.map((t) => [t.id, t]));
const addressOf = (i: any, tmap: Map<string, any>) =>
  i.propertyAddress ?? tmap.get(i.tenantProfileId)?.propertyAddress ?? "—";
const tenantOf = (i: any, tmap: Map<string, any>) => {
  const t = tmap.get(i.tenantProfileId);
  return t ? tenantName(t) : i.tenantName ?? "—";
};

type StatusKind = "paid" | "overdue" | "sent" | "muted";
function displayStatus(i: any, now: Date): { kind: StatusKind; label: string } {
  if (isPaid(i)) return { kind: "paid", label: "Paid" };
  if (isVoided(i)) return { kind: "muted", label: "Voided" };
  if (isOverdue(i, now)) return { kind: "overdue", label: "Overdue" };
  return { kind: "sent", label: "Sent" };
}

const FREQ: Record<string, string> = { weekly: "wk", fortnightly: "fn", monthly: "mo" };
const rentLabel = (s: any) => (s ? `${fmtNZD(s.amountCents)}/${FREQ[s.frequency] ?? s.frequency}` : "—");

/** Prefix a report's period line with the selected property, when scoped. */
const scopePrefix = (data: PropertyReportData) => (data.scope ? `${data.scope}  ·  ` : "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Whole-dollar money with no cents — keeps the 12 annual columns narrow. */
const money0 = (c: number) => (c <= 0 ? "—" : "$" + Math.round(c / 100).toLocaleString("en-NZ"));

/* ── 1 · Rent Roll (snapshot of every active tenancy) ───────────────── */

interface RollRow {
  address: string;
  name: string;
  rent: string;
  lastPaid: string;
  status: { kind: StatusKind; label: string };
  outstandingCents: number;
}

function rentRollRows(data: PropertyReportData, now: Date): RollRow[] {
  const activeSched = new Map<string, any>();
  for (const s of data.schedules) {
    if (s.status && s.status !== "active") continue;
    if (!activeSched.has(s.tenantProfileId)) activeSched.set(s.tenantProfileId, s);
  }
  const invByTenant = new Map<string, any[]>();
  for (const i of data.invoices) {
    const arr = invByTenant.get(i.tenantProfileId) ?? [];
    arr.push(i);
    invByTenant.set(i.tenantProfileId, arr);
  }

  return data.tenants
    .filter((t) => t.status !== "archived")
    .map((t) => {
      const invs = invByTenant.get(t.id) ?? [];
      const paid = invs.filter(isPaid);
      const lastPaidAt = paid.reduce<Date | null>((acc, i) => {
        const d = i.paidAt ? new Date(i.paidAt) : null;
        return d && (!acc || d > acc) ? d : acc;
      }, null);
      const outstanding = invs.filter((i) => !isPaid(i) && !isVoided(i));
      const outstandingCents = sumCents(outstanding, (i) => i.amountCents ?? 0);
      const status = outstanding.some((i) => isOverdue(i, now))
        ? { kind: "overdue" as const, label: "Overdue" }
        : outstandingCents === 0 && paid.length > 0
          ? { kind: "paid" as const, label: "Paid" }
          : outstanding.length > 0
            ? { kind: "sent" as const, label: "Sent" }
            : { kind: "muted" as const, label: "—" };
      return {
        address: t.propertyAddress ?? "—",
        name: tenantName(t),
        rent: rentLabel(activeSched.get(t.id)),
        lastPaid: lastPaidAt ? fmtDate(lastPaidAt) : "—",
        status,
        outstandingCents,
      };
    })
    .sort((a, b) => a.address.localeCompare(b.address));
}

function RentRollDoc(data: PropertyReportData) {
  const now = new Date();
  const rows = rentRollRows(data, now);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstandingCents, 0);
  const overdueCount = rows.filter((r) => r.status.label === "Overdue").length;

  const columns: Column<RollRow>[] = [
    { header: "Property", flex: 3, render: (r) => r.address },
    { header: "Tenant", flex: 2.2, render: (r) => r.name },
    { header: "Rent", flex: 1.5, align: "right", render: (r) => r.rent },
    { header: "Last Paid", flex: 1.4, align: "right", render: (r) => r.lastPaid },
    { header: "Status", flex: 1.4, align: "center", render: (r) => <StatusText kind={r.status.kind} label={r.status.label} /> },
    { header: "Outstanding", flex: 1.7, align: "right", render: (r) => <Money cents={r.outstandingCents} /> },
  ];
  const foot = ["Total", "", "", "", "", fmtNZD(totalOutstanding)];

  return (
    <Document title="Rent Roll">
      <ReportPage merchant={data.merchant} title="Rent Roll" period={`${scopePrefix(data)}As at ${fmtDate(now)}  ·  ${rows.length} active tenancies`}>
        <KpiRow
          items={[
            { label: "Active Tenancies", value: String(rows.length) },
            { label: "Outstanding", value: fmtNZD(totalOutstanding), sub: "across portfolio" },
            { label: "Overdue Tenancies", value: String(overdueCount) },
          ]}
        />
        <SectionTitle>Tenancies</SectionTitle>
        <DataTable columns={columns} rows={rows} foot={foot} emptyText="No active tenancies." />
      </ReportPage>
    </Document>
  );
}

/* ── 2 · Collection Statement (period-filtered) ─────────────────────── */

interface CollRow {
  date: string;
  tenant: string;
  property: string;
  amountCents: number;
  status: { kind: StatusKind; label: string };
  paid: string;
  _paid: boolean;
}

function collectionRows(data: PropertyReportData, range: DateRange): CollRow[] {
  const tmap = byId(data.tenants);
  const now = new Date();
  return data.invoices
    .filter((i) => !isVoided(i))
    .filter((i) => inRange(i.createdAt, range.start, range.end))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((i) => ({
      date: fmtDate(i.createdAt),
      tenant: tenantOf(i, tmap),
      property: addressOf(i, tmap),
      amountCents: i.amountCents ?? 0,
      status: displayStatus(i, now),
      paid: i.paidAt ? fmtDate(i.paidAt) : "—",
      _paid: isPaid(i),
    }));
}

function CollectionStatementDoc(data: PropertyReportData, range: DateRange) {
  const rows = collectionRows(data, range);
  const invoiced = sumCents(rows, (r) => r.amountCents);
  const paidRows = rows.filter((r) => r._paid);
  const collected = sumCents(paidRows, (r) => r.amountCents);
  const overdueCount = rows.filter((r) => r.status.label === "Overdue").length;
  const rate = ratePct(paidRows.length, rows.length);

  const columns: Column<CollRow>[] = [
    { header: "Date", flex: 1.4, render: (r) => r.date },
    { header: "Tenant", flex: 2.2, render: (r) => r.tenant },
    { header: "Property", flex: 3, render: (r) => r.property },
    { header: "Amount", flex: 1.5, align: "right", render: (r) => <Money cents={r.amountCents} /> },
    { header: "Status", flex: 1.4, align: "center", render: (r) => <StatusText kind={r.status.kind} label={r.status.label} /> },
    { header: "Paid", flex: 1.4, align: "right", render: (r) => r.paid },
  ];
  const foot = ["Total", "", "", fmtNZD(invoiced), "", ""];

  return (
    <Document title="Collection Statement">
      <ReportPage merchant={data.merchant} title="Collection Statement" period={`${scopePrefix(data)}${dateRangeLabel(range.start, range.end)}`}>
        <KpiRow
          items={[
            { label: "Invoiced", value: fmtNZD(invoiced), sub: `${rows.length} invoices` },
            { label: "Collected", value: fmtNZD(collected) },
            { label: "Collection Rate", value: fmtPct(rate) },
            { label: "Overdue", value: String(overdueCount) },
          ]}
        />
        <SectionTitle>Invoices</SectionTitle>
        <DataTable columns={columns} rows={rows} foot={foot} emptyText="No invoices sent in this period." />
      </ReportPage>
    </Document>
  );
}

function collectionCsv(data: PropertyReportData, range: DateRange) {
  const rows = collectionRows(data, range);
  const headers = ["Date", "Tenant", "Property", "Amount (NZD)", "Status", "Paid Date"];
  const body = rows.map((r) => [r.date, r.tenant, r.property, (r.amountCents / 100).toFixed(2), r.status.label, r.paid]);
  return { csv: buildCSV(headers, body), filename: `Collection Statement ${dateRangeLabel(range.start, range.end)}` };
}

/* ── 3 · Aged Arrears (overdue invoices, bucketed) ──────────────────── */

function AgedArrearsDoc(data: PropertyReportData) {
  const now = new Date();
  const tmap = byId(data.tenants);
  const overdue = data.invoices.filter((i) => !isPaid(i) && !isVoided(i) && daysOverdue(i.dueAt, now) >= 1);
  const { buckets, grandTotalCents } = agedBuckets(overdue, (i) => i.dueAt, (i) => i.amountCents ?? 0, now);
  const oldest = overdue.reduce((m, i) => Math.max(m, daysOverdue(i.dueAt, now)), 0);

  const columns: Column<any>[] = [
    { header: "Tenant", flex: 2, render: (i) => tenantOf(i, tmap) },
    { header: "Email", flex: 2.6, render: (i) => tmap.get(i.tenantProfileId)?.email ?? "—" },
    { header: "Property", flex: 3, render: (i) => addressOf(i, tmap) },
    { header: "Amount", flex: 1.5, align: "right", render: (i) => <Money cents={i.amountCents ?? 0} /> },
    { header: "Days", flex: 1, align: "right", render: (i) => String(daysOverdue(i.dueAt, now)) },
  ];

  return (
    <Document title="Aged Arrears">
      <ReportPage merchant={data.merchant} title="Aged Arrears Report" period={`${scopePrefix(data)}Overdue as at ${fmtDate(now)}`}>
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
              <DataTable
                columns={columns}
                rows={b.rows}
                foot={["Subtotal", "", "", fmtNZD(b.totalCents), ""]}
              />
            </React.Fragment>
          ))}
        {overdue.length === 0 && <SectionTitle>No overdue invoices — every tenancy is up to date.</SectionTitle>}
      </ReportPage>
    </Document>
  );
}

/* ── 4 · Annual Income Statement (month-by-month, landscape) ─────────── */

interface PropRow {
  address: string;
  months: number[]; // 12 cents totals
  total: number;
}

function AnnualIncomeDoc(data: PropertyReportData) {
  const now = new Date();
  const year = now.getFullYear();
  const tmap = byId(data.tenants);
  const paidThisYear = data.invoices.filter(isPaid).filter((i) => {
    const d = i.paidAt ? new Date(i.paidAt) : null;
    return d && d.getFullYear() === year;
  });

  const propMap = new Map<string, number[]>();
  for (const i of paidThisYear) {
    const addr = addressOf(i, tmap);
    const arr = propMap.get(addr) ?? new Array(12).fill(0);
    arr[new Date(i.paidAt).getMonth()] += i.amountCents ?? 0;
    propMap.set(addr, arr);
  }
  const rows: PropRow[] = [...propMap.entries()]
    .map(([address, months]) => ({ address, months, total: months.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => a.address.localeCompare(b.address));

  const grandMonths = new Array(12).fill(0);
  for (const r of rows) r.months.forEach((v, m) => (grandMonths[m] += v));
  const grandTotal = grandMonths.reduce((a, b) => a + b, 0);
  const gst = data.merchant.gstRegistered ? calcGST(grandTotal) : null;

  const columns: Column<PropRow>[] = [
    { header: "Property", flex: 2.6, render: (r) => r.address },
    ...MONTHS.map((m, idx) => ({
      header: m,
      flex: 0.9,
      align: "right" as const,
      render: (r: PropRow) => money0(r.months[idx]),
    })),
    { header: "Total", flex: 1.4, align: "right" as const, render: (r: PropRow) => <Money cents={r.total} /> },
  ];
  const foot = ["Portfolio total", ...grandMonths.map(money0), fmtNZD(grandTotal)];

  return (
    <Document title={`Annual Income Statement ${year}`}>
      <ReportPage merchant={data.merchant} title="Annual Income Statement" period={`${scopePrefix(data)}Calendar year ${year}`} orientation="landscape">
        <KpiRow
          items={[
            { label: "Income Collected", value: fmtNZD(grandTotal), sub: `${year}` },
            { label: "Properties", value: String(rows.length) },
            { label: "Monthly Average", value: fmtNZD(Math.round(grandTotal / 12)) },
          ]}
        />
        <SectionTitle>Income by property &amp; month</SectionTitle>
        <DataTable columns={columns} rows={rows} foot={foot} emptyText={`No rent collected in ${year}.`} />
        {gst && (
          <>
            <SectionTitle>GST Summary (NZ 15%)</SectionTitle>
            <KpiRow
              items={[
                { label: "Income excl. GST", value: fmtNZD(gst.excl) },
                { label: "GST", value: fmtNZD(gst.gst) },
                { label: "Income incl. GST", value: fmtNZD(gst.incl) },
              ]}
            />
          </>
        )}
      </ReportPage>
    </Document>
  );
}

/* ── Dispatcher (heavy: pulls @react-pdf, so callers import it dynamically) ── */
/* The lightweight PROPERTY_REPORT_OPTIONS list lives in ./property-options so a
   page can render the modal without loading this module or the PDF engine. */

const biz = (data: PropertyReportData) => data.merchant.businessName || "TaptPay";

/** Generate and deliver one property report. Throws on an unknown id so the
    modal can surface a failure toast. */
export async function runPropertyReport(
  id: string,
  format: ReportFormat,
  data: PropertyReportData,
  range: DateRange,
): Promise<void> {
  switch (id) {
    case "rent-roll":
      await savePdf(RentRollDoc(data), `${biz(data)} Rent Roll`);
      return;
    case "collection-statement":
      if (format === "csv") {
        const { csv, filename } = collectionCsv(data, range);
        downloadCsv(csv, filename);
        return;
      }
      await savePdf(CollectionStatementDoc(data, range), `${biz(data)} Collection Statement`);
      return;
    case "aged-arrears":
      await savePdf(AgedArrearsDoc(data), `${biz(data)} Aged Arrears`);
      return;
    case "annual-income":
      await savePdf(AnnualIncomeDoc(data), `${biz(data)} Annual Income ${new Date().getFullYear()}`);
      return;
    default:
      throw new Error(`Unknown property report: ${id}`);
  }
}
