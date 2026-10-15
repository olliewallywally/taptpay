/*
 * R1-T9 (external review 2026-09-29): a reply that says OK and is not the data must not be cached as
 * data. A list is an array of records that each carry an id; a settings object is a record; a retail
 * sale also needs a status, a date that parses and a price that is a number.
 */
import { requireResponseRecord, responseRecord, responseRows, retailResponse } from "../response-data";

describe("a record", () => {
  it.each([[{}], [{ id: 1 }]])("%j is one", (value) => {
    expect(responseRecord(value)).toBe(true);
    expect(requireResponseRecord(value)).toBe(value);
  });
  it.each([[null], [undefined], [[]], [[{ id: 1 }]], ["{}"], [0], [true]])("%j is not", (value) => {
    expect(responseRecord(value)).toBe(false);
    expect(() => requireResponseRecord(value)).toThrow("Invalid object response");
  });
});

describe("a list", () => {
  it.each([
    [[]],
    [[{ id: 1 }, { id: 22, name: "kept as it is" }]],
    [[{ id: "5e2f9a52-8d4d-4b7e-9d1e-0a3f6c2b7d10" }]],
  ])("%j is one, returned as it is", (value) => {
    expect(responseRows(value)).toBe(value);
  });
  it.each([
    ["null", null],
    ["an object", {}],
    ["an object that holds the rows", { rows: [{ id: 1 }] }],
    ["a string", "[]"],
    ["a row that is null", [{ id: 1 }, null]],
    ["a row that is a list", [[]]],
    ["a row with no id", [{ name: "no id" }]],
    ["an id of 0", [{ id: 0 }]],
    ["a negative id", [{ id: -3 }]],
    ["a fractional id", [{ id: 1.5 }]],
    ["an empty id", [{ id: "" }]],
    ["an id that is null", [{ id: null }]],
  ])("%s is refused", (_name, value) => {
    expect(() => responseRows(value)).toThrow("Invalid list response");
  });
});

describe("a retail page's reply, by the address it came from", () => {
  const sale = { id: 1, status: "completed", createdAt: "2026-09-29T02:00:00.000Z", price: "12.50" };

  it("the business details are a record", () => {
    expect(retailResponse("/api/merchants/7/profile", { id: 7 })).toEqual({ id: 7 });
    expect(() => retailResponse("/api/merchants/7/profile", [{ id: 7 }])).toThrow("Invalid business response");
    expect(() => retailResponse("/api/merchants/7/profile", null)).toThrow("Invalid business response");
  });

  it("stock and boards are lists of rows with ids", () => {
    expect(retailResponse("/api/merchants/7/stock-items", [{ id: 3 }])).toEqual([{ id: 3 }]);
    expect(retailResponse("/api/merchants/7/tapt-stones", [])).toEqual([]);
    expect(() => retailResponse("/api/merchants/7/stock-items", { id: 3 })).toThrow("Invalid list response");
  });

  it.each([
    [[sale]],
    [[{ ...sale, price: 12.5 }]],
    [[{ ...sale, price: "0" }, { ...sale, id: 2, status: "pending" }]],
    [[]],
  ])("sales %j are taken", (rows) => {
    expect(retailResponse("/api/merchants/7/transactions", rows)).toBe(rows);
  });

  it.each([
    ["no status", { ...sale, status: undefined }],
    ["an empty status", { ...sale, status: "" }],
    ["no date", { ...sale, createdAt: undefined }],
    ["a date that is null", { ...sale, createdAt: null }],
    ["a date that does not parse", { ...sale, createdAt: "yesterday" }],
    ["no price", { ...sale, price: undefined }],
    ["an empty price", { ...sale, price: " " }],
    ["a price that is not a number", { ...sale, price: "bad" }],
    ["a price that is null", { ...sale, price: null }],
    ["a price that is not finite", { ...sale, price: "Infinity" }],
  ])("a sale with %s refuses the whole list: no total is made from part of it", (_name, row) => {
    expect(() => retailResponse("/api/merchants/7/transactions", [sale, row])).toThrow("Invalid sales response");
  });
});
