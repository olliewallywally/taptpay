import { isValidUuid, parsePositiveIntParam, parsePositiveIntQuery } from "../strict-params";

describe("parsePositiveIntParam", () => {
  it.each(["1", "42", "999999999"])("accepts a clean positive integer string %s", (value) => {
    expect(parsePositiveIntParam(value)).toBe(Number(value));
  });

  it.each([
    ["0", "zero is not positive"],
    ["-1", "negative"],
    ["+1", "explicit plus sign"],
    ["1.5", "decimal"],
    ["1e3", "exponent notation"],
    [" 1", "leading whitespace"],
    ["1 ", "trailing whitespace"],
    ["1abc", "trailing garbage — parseInt would silently return 1"],
    ["abc1", "leading garbage"],
    ["", "empty string"],
    ["01", "leading zero"],
    ["NaN", "literal NaN"],
    ["Infinity", "literal Infinity"],
    [String(Number.MAX_SAFE_INTEGER + 1), "unsafe integer overflow"],
  ])("rejects %s (%s)", (value) => {
    expect(parsePositiveIntParam(value)).toBeNull();
  });

  it("rejects missing/undefined/null", () => {
    expect(parsePositiveIntParam(undefined)).toBeNull();
    expect(parsePositiveIntParam(null)).toBeNull();
  });
});

describe("parsePositiveIntQuery", () => {
  it("accepts a single scalar value", () => {
    expect(parsePositiveIntQuery("42")).toBe(42);
  });

  it("rejects an array (Express's shape for a repeated query key)", () => {
    expect(parsePositiveIntQuery(["1", "2"])).toBeNull();
  });

  it("rejects an object (Express's shape for a bracketed query key)", () => {
    expect(parsePositiveIntQuery({ foo: "1" })).toBeNull();
  });

  it("rejects missing", () => {
    expect(parsePositiveIntQuery(undefined)).toBeNull();
  });
});

describe("isValidUuid", () => {
  it("accepts a well-formed uuid", () => {
    expect(isValidUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it.each(["", "not-a-uuid", "123e4567e89b12d3a456426614174000", "1"])(
    "rejects %s",
    (value) => {
      expect(isValidUuid(value)).toBe(false);
    },
  );

  it("rejects undefined/null", () => {
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(null)).toBe(false);
  });
});
