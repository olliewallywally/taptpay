import {
  buildTradesClientRows,
  buildTradesHomeModel,
  buildTradesRevenueBuckets,
  isTradesInvoiceOverdue,
  isTradesQuoteAwaitingReply,
  scopeTradesData,
  tradesPaidRevenueCents,
  tradesSiteOptions,
  type TradesClient,
  type TradesInvoice,
  type TradesQuote,
} from "../trades-data";

const NOW = new Date("2026-07-28T12:00:00.000Z");

function client(
  id: string,
  overrides: Partial<TradesClient> = {},
): TradesClient {
  return {
    id,
    merchantId: 7,
    firstName: "Ana",
    lastName: "Rangi",
    email: "ana@example.com",
    phone: null,
    siteAddress: "12 Tui Street",
    notes: null,
    preferredChannel: "email",
    status: "active",
    archivedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
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
    merchantId: 7,
    clientProfileId,
    quoteId: null,
    scheduleId: null,
    kind: "full",
    amountCents,
    token: `token-${id}`,
    deliveryChannel: "email",
    jobDetails: null,
    status: "dispatched",
    dueAt: "2026-08-04T12:00:00.000Z",
    dispatchedAt: "2026-07-28T00:00:00.000Z",
    sentAt: "2026-07-28T00:00:00.000Z",
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
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
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
    merchantId: 7,
    clientProfileId,
    token: `quote-token-${id}`,
    status: "sent",
    lineItems: [],
    subtotalCents: totalCents,
    gstCents: 0,
    gstMode: null,
    totalCents,
    depositEnabled: false,
    depositType: null,
    depositValue: null,
    depositCents: null,
    deliveryChannel: "email",
    validUntil: "2026-08-04T12:00:00.000Z",
    notes: null,
    documentUrl: null,
    documentName: null,
    sentAt: "2026-07-28T00:00:00.000Z",
    viewedAt: null,
    acceptedAt: null,
    declinedAt: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("Trades desktop home data", () => {
  test("site options show only visible clients while scope retains matching prospects for joins", () => {
    const clients = [
      client("active-a", { siteAddress: " 12 Tui Street " }),
      client("active-b", { siteAddress: "7 Kea Road" }),
      client("duplicate", { siteAddress: "12 Tui Street" }),
      client("prospect", {
        status: "prospect",
        siteAddress: "12 Tui Street",
      }),
      client("archived", {
        status: "archived",
        siteAddress: "99 Hidden Lane",
      }),
      client("blank", { siteAddress: "   " }),
    ];
    const invoices = [
      invoice("active-invoice", "active-a", 10_000),
      invoice("prospect-invoice", "prospect", 20_000),
      invoice("other-invoice", "active-b", 30_000),
    ];
    const quotes = [
      quote("active-quote", "active-a", 40_000),
      quote("prospect-quote", "prospect", 50_000),
      quote("other-quote", "active-b", 60_000),
    ];

    expect(tradesSiteOptions(clients)).toEqual([
      "12 Tui Street",
      "7 Kea Road",
    ]);

    const scoped = scopeTradesData(
      clients,
      invoices,
      quotes,
      "12 Tui Street",
    );
    expect(scoped.clients.map((row) => row.id)).toEqual([
      "active-a",
      "duplicate",
      "prospect",
    ]);
    expect(scoped.invoices.map((row) => row.id)).toEqual([
      "active-invoice",
      "prospect-invoice",
    ]);
    expect(scoped.quotes.map((row) => row.id)).toEqual([
      "active-quote",
      "prospect-quote",
    ]);
  });

  test("paid revenue requires a paid status and paidAt, and uses half-open boundaries", () => {
    const start = new Date("2026-07-28T00:00:00.000Z");
    const end = new Date("2026-07-29T00:00:00.000Z");
    const invoices = [
      invoice("at-start", "client", 1_000, {
        status: "paid",
        paidAt: start.toISOString(),
      }),
      invoice("paid-external", "client", 2_000, {
        status: "paid_external",
        paidAt: "2026-07-28T12:00:00.000Z",
      }),
      invoice("at-end", "client", 4_000, {
        status: "paid",
        paidAt: end.toISOString(),
      }),
      invoice("paid-without-date", "client", 8_000, {
        status: "paid",
        paidAt: null,
      }),
      invoice("dated-but-open", "client", 16_000, {
        status: "dispatched",
        paidAt: "2026-07-28T10:00:00.000Z",
      }),
      invoice("voided", "client", 32_000, {
        status: "voided",
        paidAt: "2026-07-28T10:00:00.000Z",
      }),
    ];

    expect(tradesPaidRevenueCents(invoices, start, end)).toBe(3_000);
  });

  test("day, week, month and year buckets group paid revenue by paidAt", () => {
    const invoices = [
      invoice("day", "client", 1_000, {
        status: "paid",
        paidAt: "2026-07-28T11:00:00.000Z",
      }),
      invoice("week", "client", 2_000, {
        status: "paid_external",
        paidAt: "2026-07-27T10:00:00.000Z",
      }),
      invoice("month", "client", 4_000, {
        status: "paid",
        paidAt: "2026-07-08T10:00:00.000Z",
      }),
      invoice("year", "client", 8_000, {
        status: "paid",
        paidAt: "2026-02-15T10:00:00.000Z",
      }),
      invoice("created-only", "client", 999_900, {
        status: "paid",
        paidAt: null,
        createdAt: "2026-07-28T11:00:00.000Z",
      }),
    ];

    const day = buildTradesRevenueBuckets(invoices, "day", NOW);
    const week = buildTradesRevenueBuckets(invoices, "week", NOW);
    const month = buildTradesRevenueBuckets(invoices, "month", NOW);
    const year = buildTradesRevenueBuckets(invoices, "year", NOW);

    expect(day).toHaveLength(8);
    expect(day.reduce((sum, bucket) => sum + bucket.valueCents, 0)).toBe(
      1_000,
    );
    expect(week.map((bucket) => bucket.valueCents)).toEqual([
      2_000,
      1_000,
      0,
      0,
      0,
      0,
      0,
    ]);
    expect(month.map((bucket) => bucket.valueCents)).toEqual([
      0,
      4_000,
      0,
      3_000,
      0,
    ]);
    expect(year[1].valueCents).toBe(8_000);
    expect(year[6].valueCents).toBe(7_000);
  });

  test("overdue is derived from open balance_due or strictly-past due dates", () => {
    const rows = {
      dueBefore: invoice("due-before", "client", 1_000, {
        dueAt: "2026-07-28T11:59:59.999Z",
      }),
      dueNow: invoice("due-now", "client", 1_000, {
        dueAt: NOW.toISOString(),
      }),
      futureBalance: invoice("future-balance", "client", 1_000, {
        status: "balance_due",
        dueAt: "2026-08-28T12:00:00.000Z",
      }),
      paidPast: invoice("paid-past", "client", 1_000, {
        status: "paid",
        paidAt: "2026-07-27T12:00:00.000Z",
        dueAt: "2026-07-20T12:00:00.000Z",
      }),
      voidedPast: invoice("voided-past", "client", 1_000, {
        status: "voided",
        dueAt: "2026-07-20T12:00:00.000Z",
      }),
      legacyDepositPaid: invoice("deposit-paid", "client", 1_000, {
        status: "deposit_paid",
        kind: "deposit",
        dueAt: "2026-07-20T12:00:00.000Z",
      }),
    };

    expect(isTradesInvoiceOverdue(rows.dueBefore, NOW)).toBe(true);
    expect(isTradesInvoiceOverdue(rows.dueNow, NOW)).toBe(false);
    expect(isTradesInvoiceOverdue(rows.futureBalance, NOW)).toBe(true);
    expect(isTradesInvoiceOverdue(rows.paidPast, NOW)).toBe(false);
    expect(isTradesInvoiceOverdue(rows.voidedPast, NOW)).toBe(false);
    expect(isTradesInvoiceOverdue(rows.legacyDepositPaid, NOW)).toBe(false);
  });

  test("quotes await replies only while sent/viewed and not strictly expired", () => {
    expect(
      isTradesQuoteAwaitingReply(
        quote("sent", "client", 1_000, { status: "sent" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isTradesQuoteAwaitingReply(
        quote("viewed", "client", 1_000, {
          status: "viewed",
          validUntil: null,
        }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isTradesQuoteAwaitingReply(
        quote("expires-now", "client", 1_000, {
          validUntil: NOW.toISOString(),
        }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isTradesQuoteAwaitingReply(
        quote("expired", "client", 1_000, {
          validUntil: "2026-07-28T11:59:59.999Z",
        }),
        NOW,
      ),
    ).toBe(false);
    for (const status of ["accepted", "declined", "expired", "draft"]) {
      expect(
        isTradesQuoteAwaitingReply(
          quote(status, "client", 1_000, { status }),
          NOW,
        ),
      ).toBe(false);
    }
  });

  test("home health keeps categories disjoint and active rows hide prospects/archives", () => {
    const clients = [
      client("active", { firstName: "Ana", lastName: "Rangi" }),
      client("prospect", { status: "prospect" }),
      client("archived", { status: "archived" }),
    ];
    const invoices = [
      invoice("overdue-deposit", "active", 10_000, {
        kind: "deposit",
        dueAt: "2026-07-27T12:00:00.000Z",
      }),
      invoice("awaiting-deposit", "prospect", 20_000, {
        kind: "deposit",
        dueAt: "2026-07-29T12:00:00.000Z",
      }),
      invoice("paid-this-week", "active", 30_000, {
        status: "paid",
        paidAt: "2026-07-28T10:00:00.000Z",
      }),
      invoice("paid-last-week", "active", 15_000, {
        status: "paid_external",
        paidAt: "2026-07-20T10:00:00.000Z",
      }),
      invoice("archived-overdue", "archived", 40_000, {
        dueAt: "2026-07-20T12:00:00.000Z",
      }),
    ];
    const quotes = [
      quote("awaiting", "active", 50_000),
      quote("viewed", "prospect", 60_000, { status: "viewed" }),
      quote("accepted", "active", 70_000, { status: "accepted" }),
    ];

    const model = buildTradesHomeModel({
      clients,
      invoices,
      quotes,
      timeframe: "week",
      now: NOW,
    });

    expect(model.revenue).toMatchObject({
      totalCents: 30_000,
      previousCents: 15_000,
      growthPct: 100,
    });
    expect(model.health).toEqual([
      {
        id: "overdue",
        label: "overdue invoices",
        count: 2,
        amountCents: 50_000,
      },
      {
        id: "awaiting-deposit",
        label: "awaiting deposit",
        count: 1,
        amountCents: 20_000,
      },
      {
        id: "awaiting-reply",
        label: "quotes awaiting reply",
        count: 2,
        amountCents: 110_000,
      },
    ]);
    expect(model.healthRowsById.overdue.map((row) => row.id)).toEqual([
      "overdue-deposit",
      "archived-overdue",
    ]);
    expect(
      model.healthRowsById["awaiting-deposit"].map((row) => row.id),
    ).toEqual(["awaiting-deposit"]);
    expect(
      model.healthRowsById["awaiting-reply"].map((row) => row.id),
    ).toEqual(["awaiting", "viewed"]);
    expect(model.clientById.has("prospect")).toBe(true);
    expect(model.clientRows.map((row) => row.id)).toEqual(["active"]);
    expect(model.clientRows[0]).toMatchObject({
      name: "Ana Rangi",
      status: "overdue",
      amountCents: 10_000,
    });
  });

  test("client rows prefer risk states over newer paid invoices", () => {
    const clients = [client("active")];
    const rows = buildTradesClientRows(
      clients,
      [
        invoice("older-overdue", "active", 1_000, {
          dueAt: "2026-07-20T12:00:00.000Z",
          createdAt: "2026-07-01T12:00:00.000Z",
        }),
        invoice("newer-paid", "active", 2_000, {
          status: "paid",
          paidAt: "2026-07-28T10:00:00.000Z",
          createdAt: "2026-07-28T10:00:00.000Z",
        }),
      ],
      NOW,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoiceId: "older-overdue",
      status: "overdue",
      amountCents: 1_000,
    });
  });
});
