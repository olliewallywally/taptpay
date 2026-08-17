import {
  PROPERTY_LIVE_STATUSES,
  buildPropertyTerminalModel,
  propertyBucketOf,
  propertyOwingCents,
  type PropertyTerminalInvoice,
  type PropertyTerminalTenant,
} from "../property-terminal-model";

function invoice(
  id: string,
  overrides: Partial<PropertyTerminalInvoice> = {},
): PropertyTerminalInvoice {
  return {
    id,
    tenantProfileId: "t1",
    status: "dispatched",
    kind: "rent",
    amountCents: 100_000,
    owingCents: 100_000,
    tenantName: "Ana Rangi",
    createdAt: "2026-08-01T00:00:00.000Z",
    dueAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

const TENANTS: PropertyTerminalTenant[] = [
  { id: "t1", firstName: "Ana", lastName: "Rangi" },
];

const rowFor = (model: ReturnType<typeof buildPropertyTerminalModel>, id: string) =>
  model.rows.find((r) => r.id === id)!;

describe("propertyOwingCents", () => {
  it("prefers the server's owing figure and falls back to the full amount", () => {
    expect(propertyOwingCents(invoice("i", { amountCents: 40_000, owingCents: 10_000 }))).toBe(10_000);
    expect(propertyOwingCents(invoice("i", { amountCents: 40_000, owingCents: null }))).toBe(40_000);
    expect(propertyOwingCents(invoice("i", { amountCents: null, owingCents: null }))).toBe(0);
  });
});

describe("propertyBucketOf", () => {
  it.each([
    ["paid", "paid"],
    ["paid_external", "paid"],
    ["overdue", "overdue"],
    ["dispatch_failed", "failed"],
    ["failed", "failed"],
    ["dispatched", "sent"],
    ["pending_dispatch", "sent"],
  ])("maps %s to %s", (status, bucket) => {
    expect(propertyBucketOf(status)).toBe(bucket);
  });
});

describe("buildPropertyTerminalModel — outstanding figures", () => {
  it("counts only what a split invoice still owes", () => {
    const model = buildPropertyTerminalModel(
      [invoice("i1", { amountCents: 40_000, owingCents: 10_000 })],
      TENANTS,
    );
    expect(model.outstandingRent).toBe(10_000);
    expect(rowFor(model, "i1").amountCents).toBe(10_000);
  });

  it("drops a split whose shares are all paid, because its status settles", () => {
    const model = buildPropertyTerminalModel(
      [invoice("i1", { status: "paid", amountCents: 40_000, owingCents: 0 })],
      TENANTS,
    );
    expect(model.outstandingRent).toBe(0);
    expect(rowFor(model, "i1").bucket).toBe("paid");
  });

  it("splits rent from expenses, defaulting a missing kind to rent", () => {
    const model = buildPropertyTerminalModel(
      [
        invoice("rent", { amountCents: 50_000, owingCents: 50_000 }),
        invoice("implied", { kind: null, amountCents: 20_000, owingCents: 20_000 }),
        invoice("charge", { kind: "charge", amountCents: 7_500, owingCents: 7_500 }),
      ],
      TENANTS,
    );
    expect(model.outstandingRent).toBe(70_000);
    expect(model.outstandingExpenses).toBe(7_500);
  });

  it("excludes voided invoices from the figures and from the list", () => {
    const model = buildPropertyTerminalModel(
      [invoice("i1", { status: "voided" }), invoice("i2")],
      TENANTS,
    );
    expect(model.outstandingRent).toBe(100_000);
    expect(model.rows.map((r) => r.id)).toEqual(["i2"]);
  });

  it("excludes settled invoices from the figures but keeps them in the list", () => {
    const model = buildPropertyTerminalModel(
      [invoice("i1", { status: "paid_external" }), invoice("i2", { status: "paid" })],
      TENANTS,
    );
    expect(model.outstandingRent).toBe(0);
    expect(model.rows).toHaveLength(2);
    expect(rowFor(model, "i1").label).toBe("paid · marked");
    expect(rowFor(model, "i2").label).toBe("paid");
  });

  it("excludes statuses outside the live whitelist — cancelled is not outstanding", () => {
    const model = buildPropertyTerminalModel([invoice("i1", { status: "cancelled" })], TENANTS);
    expect(model.outstandingRent).toBe(0);
  });

  it("counts every whitelisted live status", () => {
    const model = buildPropertyTerminalModel(
      PROPERTY_LIVE_STATUSES.map((status, n) =>
        invoice(`i${n}`, { status, amountCents: 1_000, owingCents: 1_000 }),
      ),
      TENANTS,
    );
    expect(model.outstandingRent).toBe(PROPERTY_LIVE_STATUSES.length * 1_000);
  });
});

describe("buildPropertyTerminalModel — rows", () => {
  it("labels a pending_dispatch invoice as awaiting rather than sent", () => {
    const model = buildPropertyTerminalModel([invoice("i1", { status: "pending_dispatch" })], TENANTS);
    const row = rowFor(model, "i1");
    expect(row.bucket).toBe("sent");
    expect(row.awaiting).toBe(true);
    expect(row.label).toBe("awaiting send");
  });

  it("names a charge row by its charge type", () => {
    const model = buildPropertyTerminalModel(
      [invoice("i1", { kind: "charge", chargeType: "utilities" })],
      TENANTS,
    );
    expect(rowFor(model, "i1").label).toBe("sent · utilities");
  });

  it("keeps naming an archived tenant's invoice, using the server's enriched name", () => {
    const model = buildPropertyTerminalModel([invoice("i1", { tenantName: "Wiremu Kahu" })], []);
    const row = rowFor(model, "i1");
    expect(row.name).toBe("Wiremu Kahu");
    expect(row.initials).toBe("WK");
  });

  it("falls back to the tenant list when the server sends no usable name", () => {
    const model = buildPropertyTerminalModel([invoice("i1", { tenantName: "—" })], TENANTS);
    expect(rowFor(model, "i1").name).toBe("Ana Rangi");
  });

  it("falls back to a placeholder when neither source has a name", () => {
    const model = buildPropertyTerminalModel([invoice("i1", { tenantName: null })], []);
    const row = rowFor(model, "i1");
    expect(row.name).toBe("tenant");
    expect(row.initials).toBe("T");
  });

  it("sorts newest first, falling back to the due date", () => {
    const model = buildPropertyTerminalModel(
      [
        invoice("old", { createdAt: "2026-07-01T00:00:00.000Z" }),
        invoice("new", { createdAt: "2026-08-15T00:00:00.000Z" }),
        invoice("dueOnly", { createdAt: null, dueAt: "2026-08-20T00:00:00.000Z" }),
      ],
      TENANTS,
    );
    expect(model.rows.map((r) => r.id)).toEqual(["dueOnly", "new", "old"]);
  });
});
