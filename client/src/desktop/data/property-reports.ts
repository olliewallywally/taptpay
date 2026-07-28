/* Property desktop analytics previews for the four reports that have a real
   PropertyReportsButton/PDF implementation. This module is deliberately pure:
   the page supplies the shared property caches and every displayed value is
   derived from tenantProfiles, invoicesRentRequests, and activeSchedules.

   The report ids and snapshot/period behaviour match
   report-pdf/reports/property-options.ts. The output shape mirrors
   desktop/data/retail-reports.ts so the analytics page can share the same
   donut/bar/row presentation without importing @react-pdf. */
import {
  agedBuckets,
  daysOverdue,
  fmtDate,
  fmtNZD,
  fmtPct,
  inRange,
  ratePct,
  sumCents,
  timeframeWindow,
} from "@/lib/report-utils";
import { filterByProperty } from "@/lib/property-dashboard-data";

/* ── inputs and metadata ───────────────────────────────────────────── */

export interface PropertyTenant {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  propertyAddress?: string | null;
  status?: string | null;
}

export interface PropertyInvoice {
  id: string;
  tenantProfileId: string;
  amountCents?: number | null;
  propertyAddress?: string | null;
  tenantName?: string | null;
  kind?: string | null;
  status: string;
  dueAt?: string | Date | null;
  paidAt?: string | Date | null;
  createdAt?: string | Date | null;
}

export interface PropertySchedule {
  id?: string;
  tenantProfileId: string;
  amountCents?: number | null;
  frequency?: string | null;
  status?: string | null;
}

export const PROPERTY_PERIOD_CHIPS = [
  "This week",
  "This month",
  "This quarter",
  "This year",
] as const;
export type PropertyPeriodChip = (typeof PROPERTY_PERIOD_CHIPS)[number];

export const ALL_PROPERTIES = "All properties";

export type PropertyReportId =
  | "rent-roll"
  | "collection-statement"
  | "aged-arrears"
  | "annual-income";

export interface PropertyReportMeta {
  id: PropertyReportId;
  title: string;
  desc: string;
  icon: string;
  extraLabel: string;
  extra: string[];
  periodFiltered: boolean;
}

export const PROPERTY_DESKTOP_REPORTS: PropertyReportMeta[] = [
  {
    id: "rent-roll",
    title: "Rent Roll",
    desc: "active tenancies, rent and balances",
    icon: "M4 11l8-7 8 7 M6 9.5V20h12V9.5",
    extraLabel: "STATUS",
    extra: ["All", "Up to date", "Outstanding", "Overdue"],
    periodFiltered: false,
  },
  {
    id: "collection-statement",
    title: "Collection Statement",
    desc: "invoices, collections and payment rate",
    icon: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
    extraLabel: "STATUS",
    extra: ["All", "Paid", "Sent", "Overdue"],
    periodFiltered: true,
  },
  {
    id: "aged-arrears",
    title: "Aged Arrears",
    desc: "overdue balances by age",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 8v4l3 3",
    extraLabel: "AGING",
    extra: ["All", "1–7 days", "8–30 days", "31–60 days", "60+ days"],
    periodFiltered: false,
  },
  {
    id: "annual-income",
    title: "Annual Income Statement",
    desc: "income by property and month",
    icon: "M4 20h16 M7 16v-5 M12 16V8 M17 16v-3",
    extraLabel: "VIEW",
    extra: ["Income"],
    periodFiltered: false,
  },
];

export const PROPERTY_REPORT_BY_ID: Record<PropertyReportId, PropertyReportMeta> =
  Object.fromEntries(PROPERTY_DESKTOP_REPORTS.map((r) => [r.id, r])) as Record<
    PropertyReportId,
    PropertyReportMeta
  >;

export interface PropertyReportRow {
  name: string;
  sub: string;
  val: string;
  sub2: string;
}

export interface PropertyReportSeg {
  label: string;
  pct: number;
  val: string;
}

export interface PropertyReportBar {
  v: number;
  label: string;
}

export interface PropertyReportResult {
  title: string;
  chart: "donut" | "bars";
  heroV: string;
  heroL: string;
  h2V: string;
  h2L: string;
  segs: PropertyReportSeg[];
  bars: PropertyReportBar[];
  detailTitle: string;
  rows: PropertyReportRow[];
}

export interface PropertyReportContext {
  tenants: PropertyTenant[];
  invoices: PropertyInvoice[];
  schedules: PropertySchedule[];
  period: PropertyPeriodChip;
  property: string;
  extra: string;
  now?: Date;
}

/** "All properties" followed by the merchant's real, distinct addresses. */
export function propertyChips(tenants: PropertyTenant[]): string[] {
  const addresses = new Set<string>();
  for (const tenant of tenants) {
    if (tenant.status === "archived") continue;
    const address = tenant.propertyAddress?.trim();
    if (address) addresses.add(address);
  }
  return [
    ALL_PROPERTIES,
    ...[...addresses].sort((a, b) => a.localeCompare(b, "en-NZ")),
  ];
}

/* ── shared domain helpers ─────────────────────────────────────────── */

const isPaid = (invoice: PropertyInvoice) =>
  invoice.status === "paid" || invoice.status === "paid_external";
const isVoided = (invoice: PropertyInvoice) => invoice.status === "voided";
const centsOf = (invoice: PropertyInvoice) => invoice.amountCents ?? 0;

function dateValue(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function isOverdue(invoice: PropertyInvoice, now: Date): boolean {
  if (isPaid(invoice) || isVoided(invoice)) return false;
  const due = dateValue(invoice.dueAt);
  return invoice.status === "overdue" || (due !== null && due < now.getTime());
}

function tenantName(tenant: PropertyTenant | undefined): string {
  return [tenant?.firstName, tenant?.lastName].filter(Boolean).join(" ").trim() || "—";
}

function tenantMap(tenants: PropertyTenant[]) {
  return new Map(tenants.map((tenant) => [tenant.id, tenant]));
}

function invoiceTenantName(
  invoice: PropertyInvoice,
  tenants: Map<string, PropertyTenant>,
): string {
  const tenant = tenants.get(invoice.tenantProfileId);
  return tenant ? tenantName(tenant) : invoice.tenantName?.trim() || "—";
}

function invoiceAddress(
  invoice: PropertyInvoice,
  tenants: Map<string, PropertyTenant>,
): string {
  return (
    invoice.propertyAddress?.trim() ||
    tenants.get(invoice.tenantProfileId)?.propertyAddress?.trim() ||
    "—"
  );
}

function scopedData(ctx: PropertyReportContext) {
  const selected = ctx.property && ctx.property !== ALL_PROPERTIES
    ? ctx.property
    : null;
  const filtered = filterByProperty(
    ctx.invoices as any[],
    ctx.tenants as any[],
    selected,
  );
  const ids = new Set(filtered.tenants.map((tenant: any) => tenant.id));
  return {
    invoices: filtered.invoices as PropertyInvoice[],
    tenants: filtered.tenants as PropertyTenant[],
    schedules: selected
      ? ctx.schedules.filter((schedule) => ids.has(schedule.tenantProfileId))
      : ctx.schedules,
  };
}

function periodRange(period: PropertyPeriodChip, now: Date) {
  if (period === "This quarter") {
    const start = new Date(
      now.getFullYear(),
      Math.floor(now.getMonth() / 3) * 3,
      1,
    );
    return { start, end: now };
  }
  if (period === "This week") return timeframeWindow("week", now);
  if (period === "This month") return timeframeWindow("month", now);
  return timeframeWindow("year", now);
}

const percentage = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

function toSegments(entries: { label: string; value: number }[]): PropertyReportSeg[] {
  const nonZero = entries.filter((entry) => entry.value > 0);
  const total = nonZero.reduce((sum, entry) => sum + entry.value, 0);
  return nonZero.map((entry) => {
    const pct = percentage(entry.value, total);
    return { label: entry.label, pct, val: `${pct}%` };
  });
}

function toBars(entries: { label: string; value: number }[]): PropertyReportBar[] {
  const max = entries.reduce((highest, entry) => Math.max(highest, entry.value), 0);
  return entries.map((entry) => ({
    label: entry.label,
    v: max > 0 ? entry.value / max : 0,
  }));
}

const FREQ: Record<string, string> = {
  weekly: "wk",
  fortnightly: "fn",
  monthly: "mo",
};

function rentLabel(schedule: PropertySchedule | undefined): string {
  if (!schedule) return "no schedule";
  const frequency = schedule.frequency
    ? FREQ[schedule.frequency] ?? schedule.frequency
    : "";
  return `${fmtNZD(schedule.amountCents ?? 0)}${frequency ? `/${frequency}` : ""}`;
}

function statusLabel(invoice: PropertyInvoice, now: Date): string {
  if (isPaid(invoice)) return "Paid";
  if (isOverdue(invoice, now)) return "Overdue";
  return "Sent";
}

const empty = (
  title: string,
  chart: "donut" | "bars",
  detailTitle: string,
  heroL: string,
): PropertyReportResult => ({
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

function buildRentRoll(ctx: PropertyReportContext): PropertyReportResult {
  const now = ctx.now ?? new Date();
  const data = scopedData(ctx);
  const invoicesByTenant = new Map<string, PropertyInvoice[]>();
  for (const invoice of data.invoices) {
    const rows = invoicesByTenant.get(invoice.tenantProfileId) ?? [];
    rows.push(invoice);
    invoicesByTenant.set(invoice.tenantProfileId, rows);
  }

  const activeSchedules = new Map<string, PropertySchedule>();
  for (const schedule of data.schedules) {
    if (schedule.status && schedule.status !== "active") continue;
    if (!activeSchedules.has(schedule.tenantProfileId)) {
      activeSchedules.set(schedule.tenantProfileId, schedule);
    }
  }

  const roll = data.tenants
    .filter((tenant) => tenant.status !== "archived")
    .map((tenant) => {
      const invoices = invoicesByTenant.get(tenant.id) ?? [];
      const paid = invoices.filter(isPaid);
      const outstanding = invoices.filter(
        (invoice) => !isPaid(invoice) && !isVoided(invoice),
      );
      const outstandingCents = sumCents(outstanding, centsOf);
      const overdue = outstanding.some((invoice) => isOverdue(invoice, now));
      const status = overdue
        ? "Overdue"
        : outstanding.length > 0
          ? "Outstanding"
          : paid.length > 0
            ? "Up to date"
            : "No activity";
      const lastPaid = paid.reduce<number | null>((latest, invoice) => {
        const time = dateValue(invoice.paidAt);
        return time !== null && (latest === null || time > latest) ? time : latest;
      }, null);
      return {
        tenant,
        outstandingCents,
        status,
        lastPaid,
        schedule: activeSchedules.get(tenant.id),
      };
    })
    .filter((row) => ctx.extra === "All" || row.status === ctx.extra)
    .sort((a, b) =>
      (a.tenant.propertyAddress ?? "").localeCompare(
        b.tenant.propertyAddress ?? "",
        "en-NZ",
      ),
    );

  if (roll.length === 0) {
    return empty("Rent Roll", "donut", "BY TENANCY", "no active tenancies");
  }

  const totalOutstanding = roll.reduce(
    (sum, row) => sum + row.outstandingCents,
    0,
  );
  const overdueCount = roll.filter((row) => row.status === "Overdue").length;
  const statusCounts = ["Up to date", "Outstanding", "Overdue", "No activity"].map(
    (label) => ({
      label: label.toLowerCase(),
      value: roll.filter((row) => row.status === label).length,
    }),
  );

  return {
    title: "Rent Roll",
    chart: "donut",
    heroV: String(roll.length),
    heroL: roll.length === 1 ? "active tenancy" : "active tenancies",
    h2V: fmtNZD(totalOutstanding),
    h2L: `${overdueCount} overdue`,
    segs: toSegments(statusCounts),
    bars: [],
    detailTitle: "BY TENANCY",
    rows: roll.map((row) => ({
      name: tenantName(row.tenant),
      sub: `${row.tenant.propertyAddress || "—"} · ${rentLabel(row.schedule)}`,
      val: fmtNZD(row.outstandingCents),
      sub2: row.lastPaid
        ? `${row.status.toLowerCase()} · last paid ${fmtDate(row.lastPaid)}`
        : row.status.toLowerCase(),
    })),
  };
}

function buildCollectionStatement(
  ctx: PropertyReportContext,
): PropertyReportResult {
  const now = ctx.now ?? new Date();
  const data = scopedData(ctx);
  const tenants = tenantMap(data.tenants);
  const range = periodRange(ctx.period, now);
  const rows = data.invoices
    .filter((invoice) => !isVoided(invoice))
    .filter((invoice) => inRange(invoice.createdAt, range.start, range.end))
    .map((invoice) => ({ invoice, status: statusLabel(invoice, now) }))
    .filter((row) => ctx.extra === "All" || row.status === ctx.extra)
    .sort(
      (a, b) =>
        (dateValue(a.invoice.createdAt) ?? 0) -
        (dateValue(b.invoice.createdAt) ?? 0),
    );

  if (rows.length === 0) {
    return empty(
      "Collection Statement",
      "donut",
      "INVOICES",
      "no invoices in this period",
    );
  }

  const invoiced = sumCents(rows, (row) => centsOf(row.invoice));
  const paid = rows.filter((row) => isPaid(row.invoice));
  const collected = sumCents(paid, (row) => centsOf(row.invoice));
  const collectionRate = ratePct(paid.length, rows.length);

  return {
    title: "Collection Statement",
    chart: "donut",
    heroV: fmtNZD(collected),
    heroL: `${rows.length} invoices · ${fmtNZD(invoiced)} invoiced`,
    h2V: fmtPct(collectionRate),
    h2L: "collection rate",
    segs: toSegments(
      ["Paid", "Sent", "Overdue"].map((label) => ({
        label: label.toLowerCase(),
        value: rows.filter((row) => row.status === label).length,
      })),
    ),
    bars: [],
    detailTitle: "INVOICES",
    rows: rows.map(({ invoice, status }) => ({
      name: invoiceTenantName(invoice, tenants),
      sub: `${invoiceAddress(invoice, tenants)} · ${fmtDate(invoice.createdAt)}`,
      val: fmtNZD(centsOf(invoice)),
      sub2:
        isPaid(invoice) && invoice.paidAt
          ? `${status.toLowerCase()} ${fmtDate(invoice.paidAt)}`
          : status.toLowerCase(),
    })),
  };
}

function buildAgedArrears(ctx: PropertyReportContext): PropertyReportResult {
  const now = ctx.now ?? new Date();
  const data = scopedData(ctx);
  const tenants = tenantMap(data.tenants);
  const overdue = data.invoices.filter(
    (invoice) =>
      !isPaid(invoice) &&
      !isVoided(invoice) &&
      daysOverdue(invoice.dueAt, now) >= 1,
  );
  const aged = agedBuckets(overdue, (invoice) => invoice.dueAt, centsOf, now);
  const selectedBucket =
    ctx.extra === "All"
      ? null
      : aged.buckets.find((bucket) => bucket.label === ctx.extra) ?? null;
  const shown = selectedBucket ? selectedBucket.rows : overdue;

  if (shown.length === 0) {
    return empty("Aged Arrears", "bars", "BY TENANT", "no overdue invoices");
  }

  const shownTotal = sumCents(shown, centsOf);
  const oldest = shown.reduce(
    (days, invoice) => Math.max(days, daysOverdue(invoice.dueAt, now)),
    0,
  );

  return {
    title: "Aged Arrears",
    chart: "bars",
    heroV: fmtNZD(shownTotal),
    heroL: `${shown.length} overdue ${shown.length === 1 ? "invoice" : "invoices"}`,
    h2V: `${oldest} ${oldest === 1 ? "day" : "days"}`,
    h2L: "oldest balance",
    segs: [],
    bars: toBars(
      aged.buckets.map((bucket) => ({
        label: bucket.key,
        value: bucket.totalCents,
      })),
    ),
    detailTitle: "BY TENANT",
    rows: [...shown]
      .sort(
        (a, b) => daysOverdue(b.dueAt, now) - daysOverdue(a.dueAt, now),
      )
      .map((invoice) => {
        const days = daysOverdue(invoice.dueAt, now);
        const bucket = aged.buckets.find((entry) => entry.rows.includes(invoice));
        return {
          name: invoiceTenantName(invoice, tenants),
          sub: `${invoiceAddress(invoice, tenants)} · ${days} ${days === 1 ? "day" : "days"}`,
          val: fmtNZD(centsOf(invoice)),
          sub2: bucket?.label ?? "overdue",
        };
      }),
  };
}

function buildAnnualIncome(ctx: PropertyReportContext): PropertyReportResult {
  const now = ctx.now ?? new Date();
  const year = now.getFullYear();
  const data = scopedData(ctx);
  const tenants = tenantMap(data.tenants);
  const byProperty = new Map<string, number[]>();

  for (const invoice of data.invoices) {
    if (!isPaid(invoice)) continue;
    const paidAt = dateValue(invoice.paidAt);
    if (paidAt === null) continue;
    const date = new Date(paidAt);
    if (date.getFullYear() !== year) continue;
    const address = invoiceAddress(invoice, tenants);
    const months = byProperty.get(address) ?? new Array<number>(12).fill(0);
    months[date.getMonth()] += centsOf(invoice);
    byProperty.set(address, months);
  }

  const properties = [...byProperty.entries()]
    .map(([address, months]) => ({
      address,
      months,
      total: months.reduce((sum, amount) => sum + amount, 0),
    }))
    .sort((a, b) => a.address.localeCompare(b.address, "en-NZ"));

  if (properties.length === 0) {
    return empty(
      "Annual Income Statement",
      "bars",
      "BY PROPERTY",
      `no income collected in ${year}`,
    );
  }

  const monthTotals = new Array<number>(12).fill(0);
  for (const property of properties) {
    property.months.forEach((amount, month) => {
      monthTotals[month] += amount;
    });
  }
  const total = monthTotals.reduce((sum, amount) => sum + amount, 0);
  const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  return {
    title: "Annual Income Statement",
    chart: "bars",
    heroV: fmtNZD(total),
    heroL: `income collected · ${year}`,
    h2V: fmtNZD(Math.round(total / 12)),
    h2L: `monthly average · ${properties.length} ${properties.length === 1 ? "property" : "properties"}`,
    segs: [],
    bars: toBars(
      monthTotals.map((value, month) => ({
        label: MONTH_LABELS[month],
        value,
      })),
    ),
    detailTitle: "BY PROPERTY",
    rows: properties.map((property) => {
      const activeMonths = property.months.filter((amount) => amount > 0).length;
      return {
        name: property.address,
        sub: `${activeMonths} ${activeMonths === 1 ? "month" : "months"} with income`,
        val: fmtNZD(property.total),
        sub2: `${fmtNZD(Math.round(property.total / 12))} avg / month`,
      };
    }),
  };
}

/** Build one on-screen report preview. Unknown ids are impossible via the
    PropertyReportId type; the default guard still fails loudly at runtime. */
export function buildPropertyReport(
  id: PropertyReportId,
  ctx: PropertyReportContext,
): PropertyReportResult {
  switch (id) {
    case "rent-roll":
      return buildRentRoll(ctx);
    case "collection-statement":
      return buildCollectionStatement(ctx);
    case "aged-arrears":
      return buildAgedArrears(ctx);
    case "annual-income":
      return buildAnnualIncome(ctx);
    default:
      throw new Error(`Unknown property report: ${id}`);
  }
}
