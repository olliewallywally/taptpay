import { strictPositiveIntegerParam, strictPositiveIntegerQueryParam, strictUuidParam } from "../http-params";

describe("strictPositiveIntegerParam", () => {
  it.each(["1", "42", "999999999"])("accepts a clean positive integer string %s", (value) => {
    expect(strictPositiveIntegerParam(value)).toBe(Number(value));
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
    expect(strictPositiveIntegerParam(value)).toBeNull();
  });

  it("rejects missing/undefined/null", () => {
    expect(strictPositiveIntegerParam(undefined)).toBeNull();
    expect(strictPositiveIntegerParam(null)).toBeNull();
  });
});

describe("strictPositiveIntegerQueryParam", () => {
  it("accepts a single scalar value", () => {
    expect(strictPositiveIntegerQueryParam("42")).toBe(42);
  });

  it("rejects an array (Express's shape for a repeated query key)", () => {
    expect(strictPositiveIntegerQueryParam(["1", "2"])).toBeNull();
  });

  it("rejects an object (Express's shape for a bracketed query key)", () => {
    expect(strictPositiveIntegerQueryParam({ foo: "1" })).toBeNull();
  });

  it("rejects missing", () => {
    expect(strictPositiveIntegerQueryParam(undefined)).toBeNull();
  });
});

describe("strictUuidParam", () => {
  it("accepts a well-formed uuid", () => {
    expect(strictUuidParam("123e4567-e89b-12d3-a456-426614174000")).toBe(
      "123e4567-e89b-12d3-a456-426614174000",
    );
  });

  it.each(["", "not-a-uuid", "123e4567e89b12d3a456426614174000", "1"])("rejects %s", (value) => {
    expect(strictUuidParam(value)).toBeNull();
  });

  it("rejects undefined/null", () => {
    expect(strictUuidParam(undefined)).toBeNull();
    expect(strictUuidParam(null)).toBeNull();
  });
});
