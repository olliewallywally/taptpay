import { useQuery } from "@tanstack/react-query";
import { tradesFetch } from "@/lib/trades-api";
import {
  tradesInvoiceRemainingCents,
  tradesOutstandingCents,
} from "@/lib/trades-money";

/* The list endpoints return raw Drizzle rows as JSON. Timestamps therefore
   arrive in the browser as ISO strings (or null for nullable columns). */
export type TradesApiTimestamp = string | null;

export interface TradesClient {
  id: string;
  merchantId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  siteAddress: string;
  notes: string | null;
  preferredChannel: string;
  status: string;
  archivedAt: TradesApiTimestamp;
  createdAt: TradesApiTimestamp;
  updatedAt: TradesApiTimestamp;
}

export interface TradesQuoteLineItem {
  description: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface TradesQuote {
  id: string;
  merchantId: number;
  clientProfileId: string;
  token: string;
  status: string;
  lineItems: TradesQuoteLineItem[];
  subtotalCents: number;
  gstCents: number;
  gstMode: string | null;
  totalCents: number;
  depositEnabled: boolean;
  depositType: string | null;
  depositValue: number | null;
  depositCents: number | null;
  deliveryChannel: string;
  validUntil: TradesApiTimestamp;
  notes: string | null;
  documentUrl: string | null;
  documentName: string | null;
  sentAt: TradesApiTimestamp;
  viewedAt: TradesApiTimestamp;
  acceptedAt: TradesApiTimestamp;
  declinedAt: TradesApiTimestamp;
  createdAt: TradesApiTimestamp;
  updatedAt: TradesApiTimestamp;
}

export interface TradesInvoice {
  id: string;
  merchantId: number;
  clientProfileId: string;
  quoteId: string | null;
  scheduleId: string | null;
  kind: string;
  amountCents: number;
  token: string;
  deliveryChannel: string;
  jobDetails: string | null;
  status: string;
  dueAt: string;
  dispatchedAt: TradesApiTimestamp;
  sentAt: TradesApiTimestamp;
  viewedAt: TradesApiTimestamp;
  paidAt: TradesApiTimestamp;
  voidedAt: TradesApiTimestamp;
  completedAt: TradesApiTimestamp;
  externalPaymentReference: string | null;
  lastReminderSentAt: TradesApiTimestamp;
  scheduledSendAt: TradesApiTimestamp;
  reminderCount: number;
  documentUrl: string | null;
  documentName: string | null;
  windcaveSessionId: string | null;
  windcaveTransactionId: string | null;
  splitEnabled: boolean;
  splitCount: number | null;
  splitPaidCount: number;
  splitPaidSessions: string[] | null;
  splitPayerEmails: string[] | null;
  whatsappMessageId: string | null;
  whatsappDeliveredAt: TradesApiTimestamp;
  createdAt: TradesApiTimestamp;
  updatedAt: TradesApiTimestamp;
}

/* Keep these keys byte-for-byte compatible with the existing mobile Trades
   caches. A mutation from either surface then invalidates both surfaces. */
export const TRADES_CLIENTS_QUERY_KEY = ["/api/trades/clients"] as const;
export const TRADES_INVOICES_QUERY_KEY = ["/api/trades/invoices"] as const;
export const TRADES_QUOTES_QUERY_KEY = ["/api/trades/quotes"] as const;

async function loadTradesRows<T>(path: string): Promise<T[]> {
  const response = await tradesFetch(path);
  if (!response.ok) {
    const message = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => null);
    throw new Error(message || `Couldn't load ${path}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error(`Invalid response from ${path}`);
  return body as T[];
}

export function useTradesClientsQuery() {
  return useQuery<TradesClient[]>({
    queryKey: TRADES_CLIENTS_QUERY_KEY,
    queryFn: () => loadTradesRows<TradesClient>("/api/trades/clients"),
    staleTime: 60_000,
    retry: false,
  });
}

export function useTradesInvoicesQuery() {
  return useQuery<TradesInvoice[]>({
    queryKey: TRADES_INVOICES_QUERY_KEY,
    queryFn: () => loadTradesRows<TradesInvoice>("/api/trades/invoices"),
    staleTime: 30_000,
    retry: false,
  });
}

export function useTradesQuotesQuery() {
  return useQuery<TradesQuote[]>({
    queryKey: TRADES_QUOTES_QUERY_KEY,
    queryFn: () => loadTradesRows<TradesQuote>("/api/trades/quotes"),
    staleTime: 30_000,
    retry: false,
  });
}

export function useTradesHomeQueries() {
  return {
    clientsQuery: useTradesClientsQuery(),
    invoicesQuery: useTradesInvoicesQuery(),
    quotesQuery: useTradesQuotesQuery(),
  };
}

export const TRADES_HOME_RANGES = ["day", "week", "month", "year"] as const;
export type TradesHomeRange = (typeof TRADES_HOME_RANGES)[number];

export interface TradesRevenueBucket {
  label: string;
  start: Date;
  end: Date;
  valueCents: number;
}

export interface TradesPeriodWindow {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

const PAID_STATUSES = new Set(["paid", "paid_external"]);
const CLOSED_STATUSES = new Set([
  "paid",
  "paid_external",
  "voided",
  // Readable legacy state accepted by send-balance. It represents a settled
  // deposit even though current payment finalisation writes `paid`.
  "deposit_paid",
]);

function timestampMs(value: TradesApiTimestamp | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function inWindow(value: TradesApiTimestamp, start: Date, end: Date): boolean {
  const time = timestampMs(value);
  return time !== null && time >= start.getTime() && time < end.getTime();
}

function sumInvoiceCents(invoices: TradesInvoice[]): number {
  return invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
}

function sumQuoteCents(quotes: TradesQuote[]): number {
  return quotes.reduce((sum, quote) => sum + quote.totalCents, 0);
}

export function isTradesInvoicePaid(invoice: TradesInvoice): boolean {
  return PAID_STATUSES.has(invoice.status);
}

export function isTradesInvoiceOpen(invoice: TradesInvoice): boolean {
  return !CLOSED_STATUSES.has(invoice.status);
}

/** Open balances become overdue at the first instant after `dueAt`.
 * `balance_due` is overdue immediately because that state explicitly means the
 * accepted job's remaining balance is due. */
export function isTradesInvoiceOverdue(
  invoice: TradesInvoice,
  now = new Date(),
): boolean {
  if (!isTradesInvoiceOpen(invoice)) return false;
  if (invoice.status === "balance_due") return true;
  const due = timestampMs(invoice.dueAt);
  return due !== null && due < now.getTime();
}

export function isTradesAwaitingDeposit(
  invoice: TradesInvoice,
  now = new Date(),
): boolean {
  return (
    invoice.kind === "deposit" &&
    isTradesInvoiceOpen(invoice) &&
    !isTradesInvoiceOverdue(invoice, now)
  );
}

/** Sent/viewed quotes need a reply until accepted/declined or strictly past
 * `validUntil`. The server uses the same strict-past expiry boundary. */
export function isTradesQuoteAwaitingReply(
  quote: TradesQuote,
  now = new Date(),
): boolean {
  if (quote.status !== "sent" && quote.status !== "viewed") return false;
  if (quote.validUntil === null) return true;
  const expiry = timestampMs(quote.validUntil);
  return expiry !== null && expiry >= now.getTime();
}

export function isVisibleTradesClient(client: TradesClient): boolean {
  return client.status !== "archived" && client.status !== "prospect";
}

export function buildTradesClientMap(
  clients: TradesClient[],
): Map<string, TradesClient> {
  return new Map(clients.map((client) => [client.id, client]));
}

/** Distinct sites from visible directory clients only. Hidden quick-invoice
 * prospects remain available in the join map but never leak into this picker. */
export function tradesSiteOptions(clients: TradesClient[]): string[] {
  const sites = new Set<string>();
  for (const client of clients) {
    if (!isVisibleTradesClient(client)) continue;
    const site = client.siteAddress.trim();
    if (site) sites.add(site);
  }
  return [...sites].sort((a, b) => a.localeCompare(b, "en-NZ"));
}

export interface TradesScopedData {
  clients: TradesClient[];
  invoices: TradesInvoice[];
  quotes: TradesQuote[];
}

/** A null site means all rows. Invoice/quote rows have no address column, so
 * selected-site membership is always resolved through the complete client map. */
export function scopeTradesData(
  clients: TradesClient[],
  invoices: TradesInvoice[],
  quotes: TradesQuote[],
  siteFilter: string | null,
): TradesScopedData {
  if (!siteFilter) return { clients, invoices, quotes };
  const scopedClientIds = new Set(
    clients
      .filter((client) => client.siteAddress.trim() === siteFilter)
      .map((client) => client.id),
  );
  return {
    clients: clients.filter((client) => scopedClientIds.has(client.id)),
    invoices: invoices.filter((invoice) =>
      scopedClientIds.has(invoice.clientProfileId),
    ),
    quotes: quotes.filter((quote) =>
      scopedClientIds.has(quote.clientProfileId),
    ),
  };
}

/** Current and immediately preceding revenue windows. Day is a rolling 24h;
 * week starts Monday; month/year are calendar periods. */
export function tradesPeriodWindow(
  timeframe: TradesHomeRange,
  now = new Date(),
): TradesPeriodWindow {
  if (timeframe === "day") {
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const previousStart = new Date(now.getTime() - 48 * 60 * 60 * 1_000);
    return {
      start,
      end: now,
      previousStart,
      previousEnd: start,
    };
  }

  if (timeframe === "week") {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const previousStart = new Date(start);
    previousStart.setDate(start.getDate() - 7);
    return {
      start,
      end: now,
      previousStart,
      previousEnd: start,
    };
  }

  if (timeframe === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start,
      end: now,
      previousStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      previousEnd: start,
    };
  }

  const start = new Date(now.getFullYear(), 0, 1);
  return {
    start,
    end: now,
    previousStart: new Date(now.getFullYear() - 1, 0, 1),
    previousEnd: start,
  };
}

/** Collected revenue is deliberately strict: settled status + a real `paidAt`
 * inside the window. It never falls back to createdAt. */
export function tradesPaidRevenueCents(
  invoices: TradesInvoice[],
  start: Date,
  end: Date,
): number {
  return sumInvoiceCents(
    invoices.filter(
      (invoice) =>
        isTradesInvoicePaid(invoice) &&
        inWindow(invoice.paidAt, start, end),
    ),
  );
}

function revenueBucketWindows(
  timeframe: TradesHomeRange,
  now: Date,
): Omit<TradesRevenueBucket, "valueCents">[] {
  if (timeframe === "day") {
    const end = new Date(now);
    end.setMinutes(0, 0, 0);
    end.setHours(end.getHours() - (end.getHours() % 3) + 3);
    return Array.from({ length: 8 }, (_, index) => {
      const start = new Date(
        end.getTime() - (8 - index) * 3 * 60 * 60 * 1_000,
      );
      const bucketEnd = new Date(
        end.getTime() - (7 - index) * 3 * 60 * 60 * 1_000,
      );
      const hour = start.getHours();
      const label =
        hour === 0
          ? "12a"
          : hour < 12
            ? `${hour}a`
            : hour === 12
              ? "12p"
              : `${hour - 12}p`;
      return { label, start, end: bucketEnd };
    });
  }

  if (timeframe === "week") {
    const { start } = tradesPeriodWindow("week", now);
    return ["M", "T", "W", "T", "F", "S", "S"].map((label, index) => {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + index);
      const end = new Date(start);
      end.setDate(start.getDate() + index + 1);
      return { label, start: bucketStart, end };
    });
  }

  if (timeframe === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    return Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, index) => {
      const start = new Date(first);
      start.setDate(1 + index * 7);
      const end = new Date(first);
      end.setDate(1 + (index + 1) * 7);
      return { label: `W${index + 1}`, start, end };
    });
  }

  return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map(
    (label, month) => ({
      label,
      start: new Date(now.getFullYear(), month, 1),
      end: new Date(now.getFullYear(), month + 1, 1),
    }),
  );
}

export function buildTradesRevenueBuckets(
  invoices: TradesInvoice[],
  timeframe: TradesHomeRange,
  now = new Date(),
): TradesRevenueBucket[] {
  return revenueBucketWindows(timeframe, now).map((bucket) => ({
    ...bucket,
    valueCents: tradesPaidRevenueCents(
      invoices,
      bucket.start,
      bucket.end,
    ),
  }));
}

export function currentTradesBucketIndex(
  timeframe: TradesHomeRange,
  now = new Date(),
): number {
  if (timeframe === "day") return 7;
  if (timeframe === "week") return (now.getDay() + 6) % 7;
  if (timeframe === "month") return Math.floor((now.getDate() - 1) / 7);
  return now.getMonth();
}

export type TradesHealthId =
  | "overdue"
  | "awaiting-deposit"
  | "awaiting-reply";

export interface TradesHealthMetric {
  id: TradesHealthId;
  label: string;
  count: number;
  amountCents: number;
}

export type TradesHealthById = Record<TradesHealthId, TradesHealthMetric>;

export interface TradesHealthRow {
  id: string;
  clientProfileId: string;
  sourceType: "invoice" | "quote";
  amountCents: number;
  status: string;
  dueAt: TradesApiTimestamp;
  validUntil: TradesApiTimestamp;
  createdAt: TradesApiTimestamp;
  invoice: TradesInvoice | null;
  quote: TradesQuote | null;
}

export type TradesHealthRowsById = Record<
  TradesHealthId,
  TradesHealthRow[]
>;

export function buildTradesHealth(
  invoices: TradesInvoice[],
  quotes: TradesQuote[],
  now = new Date(),
): {
  health: TradesHealthMetric[];
  healthById: TradesHealthById;
  healthRowsById: TradesHealthRowsById;
} {
  const overdue = invoices.filter(
    (invoice) =>
      tradesInvoiceRemainingCents(invoice) > 0 &&
      isTradesInvoiceOverdue(invoice, now),
  );
  const awaitingDeposit = invoices.filter(
    (invoice) =>
      tradesInvoiceRemainingCents(invoice) > 0 &&
      isTradesAwaitingDeposit(invoice, now),
  );
  const awaitingReply = quotes.filter((quote) =>
    isTradesQuoteAwaitingReply(quote, now),
  );
  const invoiceHealthRow = (
    invoice: TradesInvoice,
  ): TradesHealthRow => ({
    id: invoice.id,
    clientProfileId: invoice.clientProfileId,
    sourceType: "invoice",
    amountCents: tradesInvoiceRemainingCents(invoice),
    status: invoice.status,
    dueAt: invoice.dueAt,
    validUntil: null,
    createdAt: invoice.createdAt,
    invoice,
    quote: null,
  });
  const quoteHealthRow = (quote: TradesQuote): TradesHealthRow => ({
    id: quote.id,
    clientProfileId: quote.clientProfileId,
    sourceType: "quote",
    amountCents: quote.totalCents,
    status: quote.status,
    dueAt: null,
    validUntil: quote.validUntil,
    createdAt: quote.createdAt,
    invoice: null,
    quote,
  });
  const health: TradesHealthMetric[] = [
    {
      id: "overdue",
      label: "overdue invoices",
      count: overdue.length,
      amountCents: tradesOutstandingCents(overdue),
    },
    {
      id: "awaiting-deposit",
      label: "awaiting deposit",
      count: awaitingDeposit.length,
      amountCents: tradesOutstandingCents(awaitingDeposit),
    },
    {
      id: "awaiting-reply",
      label: "quotes awaiting reply",
      count: awaitingReply.length,
      amountCents: sumQuoteCents(awaitingReply),
    },
  ];
  return {
    health,
    healthById: Object.fromEntries(
      health.map((metric) => [metric.id, metric]),
    ) as TradesHealthById,
    healthRowsById: {
      overdue: overdue.map(invoiceHealthRow),
      "awaiting-deposit": awaitingDeposit.map(invoiceHealthRow),
      "awaiting-reply": awaitingReply.map(quoteHealthRow),
    },
  };
}

export type TradesClientRowStatus =
  | "overdue"
  | "awaiting deposit"
  | "delivery failed"
  | "sent"
  | "paid"
  | "no invoice";

export interface TradesClientRow {
  id: string;
  name: string;
  initials: string;
  siteAddress: string;
  client: TradesClient;
  invoice: TradesInvoice | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  status: TradesClientRowStatus;
  amountCents: number | null;
  dueAt: string | null;
}

function invoiceCreatedTime(invoice: TradesInvoice): number {
  return timestampMs(invoice.createdAt) ?? timestampMs(invoice.dueAt) ?? 0;
}

function invoicePriority(invoice: TradesInvoice, now: Date): number {
  if (isTradesInvoiceOverdue(invoice, now)) return 0;
  if (invoice.status === "dispatch_failed") return 1;
  if (isTradesAwaitingDeposit(invoice, now)) return 2;
  if (isTradesInvoiceOpen(invoice)) return 3;
  if (isTradesInvoicePaid(invoice)) return 4;
  return 5;
}

function representativeInvoice(
  invoices: TradesInvoice[],
  now: Date,
): TradesInvoice | null {
  return (
    invoices
      .filter((invoice) => invoice.status !== "voided")
      .sort((left, right) => {
        const priority =
          invoicePriority(left, now) - invoicePriority(right, now);
        return priority || invoiceCreatedTime(right) - invoiceCreatedTime(left);
      })[0] ?? null
  );
}

function clientRowStatus(
  invoice: TradesInvoice | null,
  now: Date,
): TradesClientRowStatus {
  if (!invoice) return "no invoice";
  if (isTradesInvoiceOverdue(invoice, now)) return "overdue";
  if (invoice.status === "dispatch_failed") return "delivery failed";
  if (isTradesAwaitingDeposit(invoice, now)) return "awaiting deposit";
  if (isTradesInvoicePaid(invoice)) return "paid";
  return "sent";
}

export function buildTradesClientRows(
  clients: TradesClient[],
  invoices: TradesInvoice[],
  now = new Date(),
): TradesClientRow[] {
  const invoicesByClient = new Map<string, TradesInvoice[]>();
  for (const invoice of invoices) {
    const rows = invoicesByClient.get(invoice.clientProfileId) ?? [];
    rows.push(invoice);
    invoicesByClient.set(invoice.clientProfileId, rows);
  }

  return clients.filter(isVisibleTradesClient).map((client) => {
    const invoice = representativeInvoice(
      invoicesByClient.get(client.id) ?? [],
      now,
    );
    const name =
      [client.firstName, client.lastName].filter(Boolean).join(" ").trim() ||
      "Client";
    const initials =
      `${client.firstName[0] ?? ""}${client.lastName[0] ?? ""}`.toUpperCase() ||
      "?";
    return {
      id: client.id,
      name,
      initials,
      siteAddress: client.siteAddress.trim(),
      client,
      invoice,
      invoiceId: invoice?.id ?? null,
      invoiceStatus: invoice?.status ?? null,
      status: clientRowStatus(invoice, now),
      amountCents: invoice
        ? isTradesInvoiceOpen(invoice)
          ? tradesInvoiceRemainingCents(invoice)
          : invoice.amountCents
        : null,
      dueAt: invoice?.dueAt ?? null,
    };
  });
}

export interface BuildTradesHomeModelInput {
  clients: TradesClient[];
  invoices: TradesInvoice[];
  quotes: TradesQuote[];
  timeframe: TradesHomeRange;
  selectedBar?: number;
  siteFilter?: string | null;
  now?: Date;
}

export interface TradesRevenueModel {
  totalCents: number;
  previousCents: number;
  growthPct: number | null;
  buckets: TradesRevenueBucket[];
  maxCents: number;
  selectedIdx: number;
  selected: TradesRevenueBucket;
}

export interface TradesHomeModel {
  sites: string[];
  clientById: Map<string, TradesClient>;
  scoped: TradesScopedData;
  revenue: TradesRevenueModel;
  health: TradesHealthMetric[];
  healthById: TradesHealthById;
  healthRowsById: TradesHealthRowsById;
  clientRows: TradesClientRow[];
}

export function buildTradesHomeModel({
  clients,
  invoices,
  quotes,
  timeframe,
  selectedBar = -1,
  siteFilter = null,
  now = new Date(),
}: BuildTradesHomeModelInput): TradesHomeModel {
  const scoped = scopeTradesData(
    clients,
    invoices,
    quotes,
    siteFilter,
  );
  const window = tradesPeriodWindow(timeframe, now);
  const totalCents = tradesPaidRevenueCents(
    scoped.invoices,
    window.start,
    window.end,
  );
  const previousCents = tradesPaidRevenueCents(
    scoped.invoices,
    window.previousStart,
    window.previousEnd,
  );
  const buckets = buildTradesRevenueBuckets(
    scoped.invoices,
    timeframe,
    now,
  );
  const defaultIndex = currentTradesBucketIndex(timeframe, now);
  const selectedIdx =
    Number.isInteger(selectedBar) &&
    selectedBar >= 0 &&
    selectedBar < buckets.length
      ? selectedBar
      : Math.min(defaultIndex, buckets.length - 1);
  const { health, healthById, healthRowsById } = buildTradesHealth(
    scoped.invoices,
    scoped.quotes,
    now,
  );

  return {
    sites: tradesSiteOptions(clients),
    // Intentionally unscoped and unfiltered: prospect profiles created by quick
    // invoices must remain resolvable even though they are not visible rows.
    clientById: buildTradesClientMap(clients),
    scoped,
    revenue: {
      totalCents,
      previousCents,
      growthPct:
        previousCents > 0
          ? Math.round(
              ((totalCents - previousCents) / previousCents) * 100,
            )
          : null,
      buckets,
      maxCents: buckets.reduce(
        (max, bucket) => Math.max(max, bucket.valueCents),
        0,
      ),
      selectedIdx,
      selected: buckets[selectedIdx],
    },
    health,
    healthById,
    healthRowsById,
    clientRows: buildTradesClientRows(
      scoped.clients,
      scoped.invoices,
      now,
    ),
  };
}
