import {
  dollarsToCents,
  fmtNZD,
  calcGST,
  calcGSTExclusive,
  calcGSTByMode,
  fmtDate,
  dateRangeLabel,
  daysOverdue,
  timeframeWindow,
  inRange,
  agedBuckets,
  csvCell,
  buildCSV,
  ratePct,
  fmtPct,
  sumCents,
} from "../report-utils";

describe("money", () => {
  test("dollarsToCents parses strings, numbers, junk", () => {
    expect(dollarsToCents("12.34")).toBe(1234);
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(dollarsToCents("0.10")).toBe(10);
    expect(dollarsToCents("")).toBe(0);
    expect(dollarsToCents(null)).toBe(0);
    expect(dollarsToCents("abc")).toBe(0);
    expect(dollarsToCents("19.995")).toBe(2000); // rounds half-up
  });

  test("fmtNZD formats with grouping, cents, sign, optional code", () => {
    expect(fmtNZD(123456)).toBe("$1,234.56");
    expect(fmtNZD(5)).toBe("$0.05");
    expect(fmtNZD(0)).toBe("$0.00");
    expect(fmtNZD(-2500)).toBe("-$25.00");
    expect(fmtNZD(123456, true)).toBe("$1,234.56 NZD");
  });
});

describe("GST (NZ 15%)", () => {
  test("inclusive split reconciles exactly", () => {
    const g = calcGST(11500);
    expect(g).toEqual({ excl: 10000, gst: 1500, incl: 11500 });
    expect(g.excl + g.gst).toBe(g.incl);
  });

  test("inclusive rounds and still reconciles", () => {
    const g = calcGST(10000); // 8695.65.. -> 8696
    expect(g.excl + g.gst).toBe(10000);
    expect(g.excl).toBe(8696);
    expect(g.gst).toBe(1304);
  });

  test("exclusive adds 15% on top", () => {
    expect(calcGSTExclusive(10000)).toEqual({ excl: 10000, gst: 1500, incl: 11500 });
  });

  test("byMode honours merchant trade GST mode", () => {
    expect(calcGSTByMode(11500, "inclusive")).toEqual(calcGST(11500));
    expect(calcGSTByMode(10000, "exclusive")).toEqual(calcGSTExclusive(10000));
    expect(calcGSTByMode(11500, null)).toEqual(calcGST(11500)); // default inclusive
  });
});

describe("dates", () => {
  test("fmtDate is dd/mm/yyyy and safe on null", () => {
    expect(fmtDate("2026-06-05T10:00:00Z")).toBe("05/06/2026");
    expect(fmtDate(null)).toBe("");
    expect(fmtDate("not a date")).toBe("");
  });

  test("NZ timezone rolls a late-UTC instant into the correct NZ day", () => {
    // 2026-06-30 23:30 UTC is already 1 Jul 2026 in NZ (UTC+12).
    expect(fmtDate("2026-06-30T23:30:00Z")).toBe("01/07/2026");
  });

  test("dateRangeLabel collapses a shared year", () => {
    expect(dateRangeLabel(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-30T00:00:00Z"))).toContain("Jun");
    expect(dateRangeLabel(new Date("2026-06-01T00:00:00Z"), new Date("2026-06-30T00:00:00Z"))).toContain("2026");
  });

  test("daysOverdue floors and clamps", () => {
    const asOf = new Date("2026-07-09T00:00:00Z");
    expect(daysOverdue("2026-07-01T00:00:00Z", asOf)).toBe(8);
    expect(daysOverdue("2026-07-20T00:00:00Z", asOf)).toBe(0); // future
    expect(daysOverdue(null, asOf)).toBe(0);
  });

  test("timeframeWindow month starts on the 1st", () => {
    const { start, end } = timeframeWindow("month", new Date("2026-07-09T12:00:00"));
    expect(start.getDate()).toBe(1);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  test("inRange is inclusive and null-safe", () => {
    const s = new Date("2026-06-01T00:00:00Z");
    const e = new Date("2026-06-30T23:59:59Z");
    expect(inRange("2026-06-15T00:00:00Z", s, e)).toBe(true);
    expect(inRange("2026-07-01T00:00:00Z", s, e)).toBe(false);
    expect(inRange(null, s, e)).toBe(false);
  });
});

describe("agedBuckets", () => {
  const asOf = new Date("2026-07-09T00:00:00Z");
  const items = [
    { due: "2026-07-05T00:00:00Z", cents: 1000 }, // 4 days -> 1-7
    { due: "2026-07-01T00:00:00Z", cents: 2000 }, // 8 days -> 8-30
    { due: "2026-05-01T00:00:00Z", cents: 3000 }, // 69 days -> 60+
    { due: "2026-08-01T00:00:00Z", cents: 9999 }, // future -> dropped
  ];
  const { buckets, grandTotalCents } = agedBuckets(items, (i) => i.due, (i) => i.cents, asOf);

  test("routes each item to the right bucket and drops non-overdue", () => {
    expect(buckets.find((b) => b.key === "1-7")!.totalCents).toBe(1000);
    expect(buckets.find((b) => b.key === "8-30")!.totalCents).toBe(2000);
    expect(buckets.find((b) => b.key === "31-60")!.totalCents).toBe(0);
    expect(buckets.find((b) => b.key === "60+")!.totalCents).toBe(3000);
  });

  test("grand total excludes the future item", () => {
    expect(grandTotalCents).toBe(6000);
  });
});

describe("CSV", () => {
  test("csvCell quotes commas, quotes, newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  test("csvCell neutralises formula injection", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  test("buildCSV joins header + rows with CRLF", () => {
    const csv = buildCSV(["Name", "Amount"], [["Ann", 100], ["Bo,b", 200]]);
    expect(csv).toBe('Name,Amount\r\nAnn,100\r\n"Bo,b",200');
  });
});

describe("rates", () => {
  test("ratePct returns null on zero denominator", () => {
    expect(ratePct(3, 4)).toBe(75);
    expect(ratePct(1, 3, 1)).toBe(33.3);
    expect(ratePct(5, 0)).toBeNull();
  });

  test("fmtPct renders — for null", () => {
    expect(fmtPct(72)).toBe("72%");
    expect(fmtPct(null)).toBe("—");
  });

  test("sumCents tolerates missing values", () => {
    expect(sumCents([{ c: 10 }, { c: 20 }], (x) => x.c)).toBe(30);
    expect(sumCents([{ c: 10 }, {} as any], (x: any) => x.c)).toBe(10);
  });
});
