import {
  ALL_SITES,
  buildTradesReport,
  tradesSiteChips,
  type TradesReportContext,
} from "../trades-reports";
import type { TradesClient, TradesInvoice, TradesQuote } from "../trades-data";

const NOW = new Date("2026-07-28T12:00:00.000Z");
const DAY_MS = 86_400_000;

const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString();

function client(
  id: string,
  firstName: string,
  lastName: string,
  siteAddress: string,
  overrides: Partial<TradesClient> = {},
): TradesClient {
  return {
    id,
    merchantId: 1,
    firstName,
    lastName,
    email: null,
    phone: null,
    siteAddress,
    notes: null,
    preferredChannel: "email",
    status: "active",
    archivedAt: null,
    createdAt: iso(200),
    updatedAt: iso(1),
    ...overrides,
  };
}

function invoice(
  id: string,
  clientProfileId: string,
  amountCents: number,
  overrides: Partial<TradesInvoice> = {},
): TradesInvoice {
  return {
    id,
    merchantId: 1,
    clientProfileId,
    quoteId: null,
    scheduleId: null,
    kind: "full",
    amountCents,
    token: id,
    deliveryChannel: "email",
    jobDetails: null,
    status: "dispatched",
    dueAt: ahead(7),
    dispatchedAt: iso(2),
    sentAt: iso(2),
    viewedAt: null,
    paidAt: null,
    voidedAt: null,
    completedAt: null,
    externalPaymentReference: null,
    lastReminderSentAt: null,
    scheduledSendAt: null,
    reminderCount: 0,
    documentUrl: null,
    documentName: null,
    windcaveSessionId: null,
    windcaveTransactionId: null,
    splitEnabled: false,
    splitCount: null,
    splitPaidCount: 0,
    splitPaidSessions: null,
    splitPayerEmails: null,
    whatsappMessageId: null,
    whatsappDeliveredAt: null,
    createdAt: iso(2),
    updatedAt: iso(2),
    ...overrides,
  };
}

function quote(
  id: string,
  clientProfileId: string,
  totalCents: number,
  overrides: Partial<TradesQuote> = {},
): TradesQuote {
  return {
    id,
    merchantId: 1,
    clientProfileId,
    token: id,
    status: "sent",
    lineItems: [
      { description: "Work", qty: 1, unitPriceCents: totalCents, lineTotalCents: totalCents },
    ],
    subtotalCents: totalCents,
    gstCents: 0,
    gstMode: null,
    totalCents,
    depositEnabled: false,
    depositType: null,
    depositValue: null,
    depositCents: null,
    deliveryChannel: "email",
    validUntil: ahead(10),
    notes: null,
    documentUrl: null,
    documentName: null,
    sentAt: iso(3),
    viewedAt: null,
    acceptedAt: null,
    declinedAt: null,
    createdAt: iso(3),
    updatedAt: iso(3),
    ...overrides,
  };
}

const MIKE = client("c-mike", "Mike", "Thompson", "14 Queen Street");
const SARAH = client("c-sarah", "Sarah", "Chen", "8 Kauri Grove");
const ARCHIVED = client("c-old", "Alice", "Archived", "6 Archive Lane", {
  status: "archived",
});
const PROSPECT = client("c-pro", "Priya", "Prospect", "Hidden Site", {
  status: "prospect",
});

const CLIENTS = [MIKE, SARAH, ARCHIVED, PROSPECT];

function ctx(overrides: Partial<TradesReportContext> = {}): TradesReportContext {
  return {
    clients: CLIENTS,
    invoices: [],
    quotes: [],
    period: "This month",
    site: ALL_SITES,
    extra: "All",
    now: NOW,
    ...overrides,
  };
}

describe("tradesSiteChips", () => {
  it("lists All sites plus each distinct visible site, sorted", () => {
    expect(tradesSiteChips(CLIENTS)).toEqual([
      ALL_SITES,
      "14 Queen Street",
      "8 Kauri Grove",
    ]);
  });

  it("omits archived and prospect-only sites", () => {
    const chips = tradesSiteChips(CLIENTS);
    expect(chips).not.toContain("6 Archive Lane");
    expect(chips).not.toContain("Hidden Site");
  });
});

describe("invoice summary", () => {
  const invoices = [
    invoice("i1", MIKE.id, 120_000, { status: "paid", paidAt: iso(1) }),
    invoice("i2", SARAH.id, 80_000, { kind: "deposit" }),
    invoice("i3", MIKE.id, 50_000, { status: "voided" }),
    invoice("i4", SARAH.id, 30_000, { createdAt: iso(90) }),
  ];

  it("counts only non-voided invoices raised in the period", () => {
    const result = buildTradesReport("invoice-summary", ctx({ invoices }));
    expect(result.heroL).toBe("2 invoices raised");
    expect(result.heroV).toBe("$2,000.00");
  });

  it("reports the collection rate over the same set", () => {
    const result = buildTradesReport("invoice-summary", ctx({ invoices }));
    expect(result.h2V).toBe("$1,200.00");
    expect(result.h2L).toBe("60% collected");
  });

  it("filters by invoice type", () => {
    const result = buildTradesReport(
      "invoice-summary",
      ctx({ invoices, extra: "Deposit" }),
    );
    expect(result.heroL).toBe("1 invoice raised");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Sarah Chen");
  });

  it("scopes to one site through the client join", () => {
    const result = buildTradesReport(
      "invoice-summary",
      ctx({ invoices, site: "14 Queen Street" }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Mike Thompson");
  });

  it("reports an empty period rather than zeroes", () => {
    const result = buildTradesReport("invoice-summary", ctx({ invoices: [] }));
    expect(result.heroV).toBe("—");
    expect(result.rows).toHaveLength(0);
  });
});

describe("quote conversion", () => {
  const quotes = [
    quote("q1", MIKE.id, 300_000, {
      status: "accepted",
      sentAt: iso(6),
      acceptedAt: iso(2),
    }),
    quote("q2", SARAH.id, 200_000),
    quote("q3", SARAH.id, 100_000, { status: "declined" }),
    /* Sent, but its validity has passed: expired, not awaiting. */
    quote("q4", MIKE.id, 90_000, { validUntil: iso(1) }),
  ];

  it("rates acceptance over every quote raised in the period", () => {
    const result = buildTradesReport("quote-conversion", ctx({ quotes }));
    expect(result.heroV).toBe("25%");
    expect(result.heroL).toBe("1 of 4 accepted");
  });

  it("averages the days from sent to accepted", () => {
    const result = buildTradesReport("quote-conversion", ctx({ quotes }));
    expect(result.h2L).toBe("4d average to accept");
  });

  it("treats a sent quote past validUntil as expired", () => {
    const result = buildTradesReport(
      "quote-conversion",
      ctx({ quotes, extra: "Expired" }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].val).toBe("$900.00");
  });

  it("keeps the headline rate stable when the status chip narrows the rows", () => {
    const all = buildTradesReport("quote-conversion", ctx({ quotes }));
    const filtered = buildTradesReport(
      "quote-conversion",
      ctx({ quotes, extra: "Declined" }),
    );
    expect(filtered.heroV).toBe(all.heroV);
    expect(filtered.rows).toHaveLength(1);
  });
});

describe("aged receivables", () => {
  const invoices = [
    invoice("a1", MIKE.id, 40_000, { dueAt: iso(3) }),
    invoice("a2", SARAH.id, 60_000, { dueAt: iso(20) }),
    invoice("a3", MIKE.id, 25_000, { dueAt: iso(80) }),
    /* Not overdue: still within terms. */
    invoice("a4", SARAH.id, 90_000, { dueAt: ahead(4) }),
    /* Settled, so never overdue however old. */
    invoice("a5", MIKE.id, 10_000, { dueAt: iso(60), status: "paid", paidAt: iso(59) }),
  ];

  it("counts only open invoices past their due date", () => {
    const result = buildTradesReport("aged-receivables", ctx({ invoices }));
    expect(result.heroL).toBe("3 overdue invoices");
    expect(result.heroV).toBe("$1,250.00");
  });

  it("ages every open invoice off its due date, whatever its status", () => {
    const notYetDue = buildTradesReport(
      "aged-receivables",
      ctx({
        invoices: [
          invoice("b1", MIKE.id, 70_000, { status: "balance_due", dueAt: ahead(5) }),
        ],
      }),
    );
    expect(notYetDue.heroV).toBe("—");

    const aged = buildTradesReport(
      "aged-receivables",
      ctx({
        invoices: [
          invoice("b2", MIKE.id, 70_000, { status: "balance_due", dueAt: iso(5) }),
        ],
      }),
    );
    expect(aged.heroL).toBe("1 overdue invoice");
    expect(aged.rows[0].sub2).toContain("1–7 days");
  });

  it("filters to one aging bucket while the total stays the whole book", () => {
    const result = buildTradesReport(
      "aged-receivables",
      ctx({ invoices, extra: "60+ days" }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.heroV).toBe("$250.00");
    expect(result.h2V).toBe("$1,250.00");
  });

  it("ignores the period chip — it is a snapshot", () => {
    const thisWeek = buildTradesReport(
      "aged-receivables",
      ctx({ invoices, period: "This week" }),
    );
    const thisYear = buildTradesReport(
      "aged-receivables",
      ctx({ invoices, period: "This year" }),
    );
    expect(thisWeek.heroV).toBe(thisYear.heroV);
  });

  it("ages only the exact remainder of a partially paid split invoice", () => {
    const result = buildTradesReport(
      "aged-receivables",
      ctx({
        invoices: [
          invoice("split-overdue", MIKE.id, 10_001, {
            dueAt: iso(3),
            splitEnabled: true,
            splitCount: 3,
            splitPaidCount: 1,
          }),
        ],
      }),
    );

    expect(result.heroV).toBe("$66.68");
    expect(result.h2V).toBe("$66.68");
    expect(result.rows[0].val).toBe("$66.68");
  });

  it("omits an open row whose split paid count already reaches the total", () => {
    const result = buildTradesReport(
      "aged-receivables",
      ctx({
        invoices: [
          invoice("split-complete", MIKE.id, 10_001, {
            dueAt: iso(3),
            splitEnabled: true,
            splitCount: 3,
            splitPaidCount: 3,
          }),
        ],
      }),
    );

    expect(result.heroV).toBe("—");
    expect(result.rows).toHaveLength(0);
  });
});

describe("client statement", () => {
  const invoices = [
    invoice("s1", MIKE.id, 120_000, { status: "paid", paidAt: iso(1) }),
    invoice("s2", MIKE.id, 40_000, { dueAt: iso(2) }),
    invoice("s3", SARAH.id, 60_000, { status: "paid_external", paidAt: iso(2) }),
  ];

  it("groups the period's invoices by client, biggest first", () => {
    const result = buildTradesReport("client-statement", ctx({ invoices }));
    expect(result.heroL).toBe("2 clients billed");
    expect(result.rows.map((row) => row.name)).toEqual(["Mike Thompson", "Sarah Chen"]);
  });

  it("totals what is still outstanding and flags overdue", () => {
    const result = buildTradesReport("client-statement", ctx({ invoices }));
    expect(result.h2V).toBe("$400.00");
    expect(result.h2L).toBe("1 with overdue");
    expect(result.rows[0].sub2).toBe("$400.00 outstanding · overdue");
    expect(result.rows[1].sub2).toBe("settled");
  });

  it("filters to settled clients", () => {
    const result = buildTradesReport(
      "client-statement",
      ctx({ invoices, extra: "Settled" }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Sarah Chen");
  });

  it("keeps gross billed value but reports only a split invoice's remainder", () => {
    const result = buildTradesReport(
      "client-statement",
      ctx({
        invoices: [
          invoice("split", MIKE.id, 10_001, {
            dueAt: iso(2),
            splitEnabled: true,
            splitCount: 3,
            splitPaidCount: 1,
          }),
        ],
      }),
    );

    expect(result.heroV).toBe("$100.01");
    expect(result.h2V).toBe("$66.68");
    expect(result.rows[0].val).toBe("$100.01");
    expect(result.rows[0].sub2).toBe("$66.68 outstanding · overdue");
  });
});
