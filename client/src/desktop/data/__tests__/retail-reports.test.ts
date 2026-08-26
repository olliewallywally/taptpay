import {
  ALL_ITEMS,
  RETAIL_DESKTOP_REPORTS,
  buildRetailReport,
  type ReportContext,
  type RetailBoard,
  type RetailTx,
} from "../retail-reports";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function transaction(
  id: number,
  price: string,
  taptStoneId: number | null | undefined,
  overrides: Partial<RetailTx> = {},
): RetailTx {
  return {
    id,
    taptStoneId,
    itemName: "sale",
    price,
    status: "completed",
    createdAt: "2026-08-05T02:00:00.000Z",
    ...overrides,
  };
}

function board(id: number, stoneNumber: number, name: string): RetailBoard {
  return { id, stoneNumber, name };
}

function context(overrides: Partial<ReportContext> = {}): ReportContext {
  return {
    transactions: [],
    stockItems: [],
    boards: [],
    period: "This month",
    item: ALL_ITEMS,
    extra: "Revenue",
    now: NOW,
    ...overrides,
  };
}

describe("retail report catalogue", () => {
  it("replaces the invented Fees report with Revenue by Board", () => {
    expect(RETAIL_DESKTOP_REPORTS).toHaveLength(10);
    expect(RETAIL_DESKTOP_REPORTS.map((report) => report.id)).not.toContain("fees");
    expect(RETAIL_DESKTOP_REPORTS).toContainEqual(
      expect.objectContaining({
        id: "boards",
        title: "Revenue by Board",
        extra: ["Revenue", "Payment count", "Average sale"],
      }),
    );
  });

  it("does not retain the removed report's hard-coded fee estimate", () => {
    const report = buildRetailReport(
      "methods",
      context({ transactions: [transaction(1, "19.90", null)] }),
    );

    expect(report.h2V).toBe("$19.90");
    expect(report.h2L).toBe("revenue this period");
  });
});

describe("Revenue by Board", () => {
  it("joins by durable board ID and shows revenue, payment count and average", () => {
    const report = buildRetailReport(
      "boards",
      context({
        boards: [board(11, 1, "Front counter"), board(22, 2, "Garden bar")],
        transactions: [
          transaction(1, "10.00", 11),
          transaction(2, "20.00", 11),
          transaction(3, "45.00", 22),
        ],
      }),
    );

    expect(report).toMatchObject({
      title: "Revenue by Board",
      detailTitle: "BY BOARD",
      heroV: "$75.00",
      h2V: "3",
      h2L: "payments · $25.00 average",
    });
    expect(report.rows).toEqual([
      {
        name: "Garden bar",
        sub: "board 2",
        val: "$45.00",
        sub2: "1 payment · $45.00 average",
      },
      {
        name: "Front counter",
        sub: "board 1",
        val: "$30.00",
        sub2: "2 payments · $15.00 average",
      },
    ]);
    expect(report.bars).toEqual([
      { label: "B2", v: 1 },
      { label: "B1", v: 30 / 45 },
    ]);
  });

  it("uses the board's current name without changing its historical totals", () => {
    const transactions = [transaction(1, "12.00", 11), transaction(2, "18.00", 11)];
    const beforeRename = buildRetailReport(
      "boards",
      context({ boards: [board(11, 1, "Board 1")], transactions }),
    );
    const afterRename = buildRetailReport(
      "boards",
      context({ boards: [board(11, 1, "Window register")], transactions }),
    );

    expect(beforeRename.rows[0].name).toBe("Board 1");
    expect(afterRename.rows[0]).toMatchObject({
      name: "Window register",
      val: "$30.00",
      sub2: "2 payments · $15.00 average",
    });
  });

  it("combines null, absent, missing and archived-board references in Unassigned", () => {
    /* Board 22 was archived and is therefore absent from the active owner-board
       response, just like an otherwise missing reference. Neither is invented. */
    const report = buildRetailReport(
      "boards",
      context({
        boards: [board(11, 1, "Front counter")],
        transactions: [
          transaction(1, "50.00", 11),
          transaction(2, "10.00", null),
          transaction(3, "20.00", undefined),
          transaction(4, "30.00", 999),
          transaction(5, "40.00", 22),
        ],
      }),
    );

    expect(report.rows).toEqual([
      {
        name: "Unassigned",
        sub: "historical board assignment unknown",
        val: "$100.00",
        sub2: "4 payments · $25.00 average",
      },
      {
        name: "Front counter",
        sub: "board 1",
        val: "$50.00",
        sub2: "1 payment · $50.00 average",
      },
    ]);
    expect(report.rows[0].sub.toLowerCase()).not.toContain("no board");
    expect(report.bars[0]).toEqual({ label: "U", v: 1 });
  });

  it("keeps Unassigned distinct from a real board named Unassigned", () => {
    const report = buildRetailReport(
      "boards",
      context({
        boards: [board(11, 1, "Unassigned")],
        transactions: [transaction(1, "15.00", 11), transaction(2, "5.00", null)],
      }),
    );

    expect(report.rows).toEqual([
      {
        name: "Unassigned",
        sub: "board 1",
        val: "$15.00",
        sub2: "1 payment · $15.00 average",
      },
      {
        name: "Unassigned",
        sub: "historical board assignment unknown",
        val: "$5.00",
        sub2: "1 payment · $5.00 average",
      },
    ]);
  });

  it("ranks and charts independently by revenue, payment count or average sale", () => {
    const boards = [board(11, 1, "Revenue"), board(22, 2, "Count"), board(33, 3, "Average")];
    const transactions = [
      transaction(1, "60.00", 11),
      transaction(2, "40.00", 11),
      transaction(3, "20.00", 22),
      transaction(4, "20.00", 22),
      transaction(5, "20.00", 22),
      transaction(6, "90.00", 33),
    ];

    const revenue = buildRetailReport("boards", context({ boards, transactions }));
    const count = buildRetailReport(
      "boards",
      context({ boards, transactions, extra: "Payment count" }),
    );
    const average = buildRetailReport(
      "boards",
      context({ boards, transactions, extra: "Average sale" }),
    );

    expect(revenue.rows.map((row) => row.name)).toEqual(["Revenue", "Average", "Count"]);
    expect(count.rows.map((row) => row.name)).toEqual(["Count", "Revenue", "Average"]);
    expect(average.rows.map((row) => row.name)).toEqual(["Average", "Revenue", "Count"]);
    expect(revenue.bars.map((bar) => bar.label)).toEqual(["B1", "B3", "B2"]);
    expect(count.bars.map((bar) => bar.label)).toEqual(["B2", "B1", "B3"]);
    expect(average.bars.map((bar) => bar.label)).toEqual(["B3", "B1", "B2"]);
  });

  it("applies the shared period, item and paid-status scope before grouping", () => {
    const report = buildRetailReport(
      "boards",
      context({
        boards: [board(11, 1, "Front counter")],
        item: "coffee",
        transactions: [
          transaction(1, "10.00", 11, { itemName: "coffee" }),
          transaction(2, "99.00", 11, { itemName: "tea" }),
          transaction(3, "88.00", 11, { itemName: "coffee", status: "failed" }),
          transaction(4, "77.00", 11, {
            itemName: "coffee",
            createdAt: "2026-07-01T02:00:00.000Z",
          }),
        ],
      }),
    );

    expect(report.heroV).toBe("$10.00");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].sub2).toBe("1 payment · $10.00 average");
  });
});
