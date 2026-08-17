/* Pure model behind the tablet/desktop property terminal (2c).
   Extracted from the page so the money rules can be tested without a DOM —
   the same split as `retail-reports.ts` and `trades-data.ts`. */

/* The statuses the phone terminal counts as live (`property-terminal.tsx:281`).
   A whitelist, not "anything that is not paid": a cancelled or draft invoice must
   not land in an outstanding figure. */
export const PROPERTY_LIVE_STATUSES = [
  "pending_dispatch",
  "dispatched",
  "overdue",
  "dispatch_failed",
] as const;

export const PROPERTY_STACK_FILTERS = ["all", "overdue", "sent", "paid", "failed"] as const;
export type PropertyStackFilter = (typeof PROPERTY_STACK_FILTERS)[number];
export type PropertyStackBucket = Exclude<PropertyStackFilter, "all">;

/* `GET /api/property/invoices` returns Drizzle rows enriched with the tenant's
   display name and a computed `owingCents` (`server/routes.ts:7433-7445`). */
export interface PropertyTerminalInvoice {
  id: string;
  tenantProfileId: string;
  status: string;
  kind?: string | null;
  chargeType?: string | null;
  amountCents?: number | null;
  owingCents?: number | null;
  tenantName?: string | null;
  createdAt?: string | null;
  dueAt?: string | null;
}

export interface PropertyTerminalTenant {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface PropertyTerminalRow {
  id: string;
  name: string;
  initials: string;
  bucket: PropertyStackBucket;
  /* `pending_dispatch` buckets under `sent` so the design's five chips still
     reach it, but it has not actually been sent — the label and the dot say so. */
  awaiting: boolean;
  label: string;
  amountCents: number;
}

export interface PropertyTerminalModel {
  outstandingRent: number;
  outstandingExpenses: number;
  rows: PropertyTerminalRow[];
}

/* Split invoices are part-payable, so what is still owed is the server's
   `owingCents`; it equals `amountCents` for everything else. */
export const propertyOwingCents = (i: PropertyTerminalInvoice) =>
  i.owingCents ?? i.amountCents ?? 0;

export const isPropertyLive = (i: PropertyTerminalInvoice) =>
  (PROPERTY_LIVE_STATUSES as readonly string[]).includes(i.status);

/* The design's list buckets, mapped onto real invoice statuses. */
export function propertyBucketOf(status: string): PropertyStackBucket {
  if (status === "paid" || status === "paid_external") return "paid";
  if (status === "overdue") return "overdue";
  if (status === "dispatch_failed" || status === "failed") return "failed";
  return "sent";
}

const initialsFromName = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const fullNameOf = (t?: PropertyTerminalTenant | null) =>
  `${t?.firstName ?? ""} ${t?.lastName ?? ""}`.trim();

/* The server's enriched name survives archiving; the tenant list does not,
   because the page filters archived tenants out of the picker. */
function nameFor(
  i: PropertyTerminalInvoice,
  byId: Map<string, PropertyTerminalTenant>,
): string {
  const enriched = (i.tenantName ?? "").trim();
  if (enriched && enriched !== "—") return enriched;
  return fullNameOf(byId.get(i.tenantProfileId)) || "tenant";
}

function labelFor(i: PropertyTerminalInvoice, bucket: PropertyStackBucket, awaiting: boolean) {
  if (bucket === "paid") return i.status === "paid_external" ? "paid · marked" : "paid";
  if (bucket === "overdue") return "overdue";
  if (bucket === "failed") return "delivery failed";
  if (awaiting) return "awaiting send";
  return (i.kind ?? "rent") === "charge" ? `sent · ${i.chargeType ?? "charge"}` : "sent";
}

const sortKey = (i: PropertyTerminalInvoice) =>
  new Date(i.createdAt ?? i.dueAt ?? 0).getTime();

export function buildPropertyTerminalModel(
  invoices: PropertyTerminalInvoice[],
  tenants: PropertyTerminalTenant[],
): PropertyTerminalModel {
  const live = invoices.filter((i) => i.status !== "voided");
  const unpaid = live.filter(isPropertyLive);
  const sum = (list: PropertyTerminalInvoice[]) =>
    list.reduce((s, i) => s + propertyOwingCents(i), 0);

  /* Explicit rather than the phone's `kind !== 'charge'`; the schema enum has
     exactly two values, so the two are equivalent. */
  const outstandingRent = sum(unpaid.filter((i) => (i.kind ?? "rent") === "rent"));
  const outstandingExpenses = sum(unpaid.filter((i) => i.kind === "charge"));

  const byId = new Map(tenants.map((t) => [t.id, t]));
  const rows = [...live]
    .sort((a, b) => sortKey(b) - sortKey(a))
    .map((i) => {
      const bucket = propertyBucketOf(i.status);
      const awaiting = i.status === "pending_dispatch";
      const name = nameFor(i, byId);
      return {
        id: i.id,
        name,
        initials: initialsFromName(name) || "?",
        bucket,
        awaiting,
        label: labelFor(i, bucket, awaiting),
        amountCents: propertyOwingCents(i),
      };
    });

  return { outstandingRent, outstandingExpenses, rows };
}
