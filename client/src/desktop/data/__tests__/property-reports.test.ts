import {
  ALL_PROPERTIES,
  buildPropertyReport,
  propertyChips,
  type PropertyInvoice,
  type PropertyReportContext,
  type PropertyReportId,
  type PropertySchedule,
  type PropertyTenant,
} from "../property-reports";

const NOW = new Date("2026-07-28T12:00:00.000Z");
const DAY_MS = 86_400_000;

function tenant(
  id: string,
  firstName: string,
  lastName: string,
  overrides: Partial<PropertyTenant> = {},
): PropertyTenant {
  return {
    id,
    firstName,
    lastName,
    status: "active",
    ...overrides,
  };
}

function invoice(
  id: string,
  tenantProfileId: string,
  amountCents: number,
  overrides: Partial<PropertyInvoice> = {},
): PropertyInvoice {
  return {
    id,
    tenantProfileId,
    amountCents,
    status: "sent",
    ...overrides,
  };
}

function schedule(
  tenantProfileId: string,
  amountCents: number,
  overrides: Partial<PropertySchedule> = {},
): PropertySchedule {
  return {
    tenantProfileId,
    amountCents,
    frequency: "weekly",
    status: "active",
    ...overrides,
  };
}

function context(
  overrides: Partial<PropertyReportContext> = {},
): PropertyReportContext {
  return {
    tenants: [],
    invoices: [],
    schedules: [],
    period: "This month",
    property: ALL_PROPERTIES,
    extra: "All",
    now: NOW,
    ...overrides,
  };
}

describe("property report data", () => {
  test("builds property chips only from real, distinct active-tenant addresses", () => {
    expect(
      propertyChips([
        tenant("tenant-1", "Ana", "Rangi", {
          propertyAddress: "  12 Tui Street  ",
        }),
        tenant("tenant-2", "Hemi", "Kauri", {
          propertyAddress: "7 Kea Road",
        }),
        tenant("tenant-3", "Moana", "Rewi", {
          propertyAddress: "12 Tui Street",
        }),
        tenant("tenant-4", "Ari", "Tane", {
          propertyAddress: "99 Archived Avenue",
          status: "archived",
        }),
        tenant("tenant-5", "Kiri", "Roa", { propertyAddress: "   " }),
      ]),
    ).toEqual([ALL_PROPERTIES, "12 Tui Street", "7 Kea Road"]);
  });

  test("collection statement applies the selected period and status to every total", () => {
    const tenants = [
      tenant("tenant-1", "Ana", "Rangi", {
        propertyAddress: "12 Tui Street",
      }),
      tenant("tenant-2", "Hemi", "Kauri", {
        propertyAddress: "7 Kea Road",
      }),
    ];
    const invoices = [
      invoice("paid", "tenant-1", 10_000, {
        status: "paid",
        createdAt: "2026-07-02T10:00:00.000Z",
        paidAt: "2026-07-03T10:00:00.000Z",
      }),
      invoice("paid-external", "tenant-2", 5_000, {
        status: "paid_external",
        createdAt: "2026-07-05T10:00:00.000Z",
        paidAt: "2026-07-06T10:00:00.000Z",
      }),
      invoice("sent", "tenant-1", 3_000, {
        status: "dispatched",
        createdAt: "2026-07-10T10:00:00.000Z",
        dueAt: "2026-08-10T10:00:00.000Z",
      }),
      invoice("overdue", "tenant-2", 2_000, {
        status: "dispatched",
        createdAt: "2026-07-12T10:00:00.000Z",
        dueAt: "2026-07-01T10:00:00.000Z",
      }),
      invoice("voided", "tenant-1", 999_900, {
        status: "voided",
        createdAt: "2026-07-15T10:00:00.000Z",
      }),
      invoice("previous-month", "tenant-2", 777_700, {
        status: "paid",
        createdAt: "2026-06-30T10:00:00.000Z",
        paidAt: "2026-07-01T10:00:00.000Z",
      }),
    ];

    const all = buildPropertyReport(
      "collection-statement",
      context({ tenants, invoices }),
    );

    expect(all.heroV).toBe("$150.00");
    expect(all.heroL).toBe("4 invoices · $200.00 invoiced");
    expect(all.h2V).toBe("50%");
    expect(all.segs).toEqual([
      { label: "paid", pct: 50, val: "50%" },
      { label: "sent", pct: 25, val: "25%" },
      { label: "overdue", pct: 25, val: "25%" },
    ]);
    expect(all.rows.map((row) => row.val)).toEqual([
      "$100.00",
      "$50.00",
      "$30.00",
      "$20.00",
    ]);

    const overdueOnly = buildPropertyReport(
      "collection-statement",
      context({ tenants, invoices, extra: "Overdue" }),
    );

    expect(overdueOnly.heroV).toBe("$0.00");
    expect(overdueOnly.heroL).toBe("1 invoices · $20.00 invoiced");
    expect(overdueOnly.h2V).toBe("0%");
    expect(overdueOnly.segs).toEqual([
      { label: "overdue", pct: 100, val: "100%" },
    ]);
    expect(overdueOnly.rows).toHaveLength(1);
    expect(overdueOnly.rows[0]).toMatchObject({
      name: "Hemi Kauri",
      val: "$20.00",
      sub2: "overdue",
    });
  });

  test("rent roll is an active-tenancy snapshot, independent of the selected period", () => {
    const tenants = [
      tenant("tenant-1", "Ana", "Rangi", {
        propertyAddress: "1 Alpha Lane",
      }),
      tenant("tenant-2", "Hemi", "Kauri", {
        propertyAddress: "2 Beta Road",
      }),
      tenant("tenant-archived", "Ari", "Tane", {
        propertyAddress: "3 Gamma Street",
        status: "archived",
      }),
    ];
    const invoices = [
      invoice("old-paid", "tenant-1", 65_000, {
        status: "paid",
        createdAt: "2025-01-01T00:00:00.000Z",
        paidAt: "2025-01-15T00:00:00.000Z",
      }),
      invoice("old-overdue", "tenant-1", 12_000, {
        status: "overdue",
        createdAt: "2025-02-01T00:00:00.000Z",
        dueAt: "2025-02-10T00:00:00.000Z",
      }),
      invoice("outstanding", "tenant-2", 5_000, {
        status: "dispatched",
        createdAt: "2025-03-01T00:00:00.000Z",
        dueAt: "2026-08-10T00:00:00.000Z",
      }),
      invoice("archived-balance", "tenant-archived", 999_900, {
        status: "overdue",
        dueAt: "2024-01-01T00:00:00.000Z",
      }),
    ];
    const schedules = [
      schedule("tenant-1", 999_900, { status: "cancelled" }),
      schedule("tenant-1", 65_000),
      schedule("tenant-2", 100_000, { frequency: "monthly" }),
      schedule("tenant-archived", 888_800),
    ];

    const report = buildPropertyReport(
      "rent-roll",
      context({
        tenants,
        invoices,
        schedules,
        period: "This week",
      }),
    );

    expect(report.heroV).toBe("2");
    expect(report.heroL).toBe("active tenancies");
    expect(report.h2V).toBe("$170.00");
    expect(report.h2L).toBe("1 overdue");
    expect(report.rows).toEqual([
      {
        name: "Ana Rangi",
        sub: "1 Alpha Lane · $650.00/wk",
        val: "$120.00",
        sub2: "overdue · last paid 15/01/2025",
      },
      {
        name: "Hemi Kauri",
        sub: "2 Beta Road · $1,000.00/mo",
        val: "$50.00",
        sub2: "outstanding",
      },
    ]);
  });

  test("aged arrears keeps every boundary in its exact bucket", () => {
    const tenantRow = tenant("tenant-1", "Ana", "Rangi", {
      propertyAddress: "1 Alpha Lane",
    });
    const daysAgo = (days: number) =>
      new Date(NOW.getTime() - days * DAY_MS).toISOString();
    const invoices = [1, 7, 8, 30, 31, 60, 61].map((days) =>
      invoice(`day-${days}`, tenantRow.id, days * 100, {
        status: "overdue",
        dueAt: daysAgo(days),
      }),
    );
    invoices.push(
      invoice("due-now", tenantRow.id, 999_900, {
        status: "overdue",
        dueAt: NOW,
      }),
    );

    const cases = [
      {
        bucket: "1–7 days",
        total: "$8.00",
        ages: ["7 days", "1 day"],
      },
      {
        bucket: "8–30 days",
        total: "$38.00",
        ages: ["30 days", "8 days"],
      },
      {
        bucket: "31–60 days",
        total: "$91.00",
        ages: ["60 days", "31 days"],
      },
      {
        bucket: "60+ days",
        total: "$61.00",
        ages: ["61 days"],
      },
    ];

    for (const { bucket, total, ages } of cases) {
      const report = buildPropertyReport(
        "aged-arrears",
        context({ tenants: [tenantRow], invoices, extra: bucket }),
      );

      expect(report.heroV).toBe(total);
      expect(report.heroL).toBe(
        `${ages.length} overdue ${ages.length === 1 ? "invoice" : "invoices"}`,
      );
      expect(report.rows.map((row) => row.sub2)).toEqual(
        ages.map(() => bucket),
      );
      expect(
        report.rows.map((row) => row.sub.split(" · ")[1]),
      ).toEqual(ages);
    }
  });

  test("annual income includes only paid invoices from the current year", () => {
    const tenants = [
      tenant("tenant-1", "Ana", "Rangi", {
        propertyAddress: "1 Alpha Lane",
      }),
      tenant("tenant-2", "Hemi", "Kauri", {
        propertyAddress: "2 Beta Road",
      }),
    ];
    const invoices = [
      invoice("alpha-jan", "tenant-1", 100_000, {
        status: "paid",
        paidAt: "2026-01-15T00:00:00.000Z",
      }),
      invoice("alpha-feb", "tenant-1", 20_000, {
        status: "paid_external",
        paidAt: "2026-02-15T00:00:00.000Z",
      }),
      invoice("beta-jun", "tenant-2", 50_000, {
        status: "paid",
        paidAt: "2026-06-15T00:00:00.000Z",
      }),
      invoice("previous-year", "tenant-1", 999_900, {
        status: "paid",
        paidAt: "2025-12-15T00:00:00.000Z",
      }),
      invoice("current-unpaid", "tenant-2", 888_800, {
        status: "dispatched",
        paidAt: "2026-07-15T00:00:00.000Z",
      }),
    ];

    const report = buildPropertyReport(
      "annual-income",
      context({ tenants, invoices }),
    );

    expect(report.heroV).toBe("$1,700.00");
    expect(report.heroL).toBe("income collected · 2026");
    expect(report.h2V).toBe("$141.67");
    expect(report.h2L).toBe("monthly average · 2 properties");
    expect(report.bars).toHaveLength(12);
    expect(report.bars[0]).toEqual({ label: "J", v: 1 });
    expect(report.bars[1]).toEqual({ label: "F", v: 0.2 });
    expect(report.bars[5]).toEqual({ label: "J", v: 0.5 });
    expect(report.rows).toEqual([
      {
        name: "1 Alpha Lane",
        sub: "2 months with income",
        val: "$1,200.00",
        sub2: "$100.00 avg / month",
      },
      {
        name: "2 Beta Road",
        sub: "1 month with income",
        val: "$500.00",
        sub2: "$41.67 avg / month",
      },
    ]);
  });

  test("empty API data never produces mock rows or default numeric results", () => {
    const reportIds: PropertyReportId[] = [
      "rent-roll",
      "collection-statement",
      "aged-arrears",
      "annual-income",
    ];

    for (const id of reportIds) {
      const report = buildPropertyReport(id, context());
      expect(report.heroV).toBe("—");
      expect(report.h2V).toBe("");
      expect(report.rows).toEqual([]);
      expect(report.segs).toEqual([]);
      expect(report.bars).toEqual([]);
    }
  });
});
