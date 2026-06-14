import { parseCsv, mapCsvRows } from "../csv";

describe("csv", () => {
  test("parseCsv handles quoted fields with commas and newlines", () => {
    const csv = 'name,note\n"Joe, Inc","line1\nline2"\nBob,hi';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Joe, Inc", "line1\nline2"],
      ["Bob", "hi"],
    ]);
  });

  test("parseCsv unescapes doubled quotes", () => {
    expect(parseCsv('a\n"she said ""hi"""')).toEqual([["a"], ['she said "hi"']]);
  });

  test("mapCsvRows maps header aliases, drops no-name rows, infers segment", () => {
    const rows = parseCsv("company,e-mail,category\nJoe's Cafe,hi@joescafe.co.nz,cafe\n,orphan@x.com,shop");
    const mapped = mapCsvRows(rows);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].businessName).toBe("Joe's Cafe");
    expect(mapped[0].email).toBe("hi@joescafe.co.nz");
    expect(mapped[0].segment).toBe("hospitality"); // inferred from "cafe"
  });
});
