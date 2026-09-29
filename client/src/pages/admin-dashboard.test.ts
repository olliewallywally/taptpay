import { formatCounterValue } from "./admin-dashboard";

describe("admin dashboard counters", () => {
  it("preserves cents for monthly recurring revenue", () => {
    expect(formatCounterValue(26.97, 2)).toBe("26.97");
    expect(formatCounterValue(1234.5, 2)).toBe("1,234.50");
  });

  it("keeps whole-number dashboard counters unchanged", () => {
    expect(formatCounterValue(1234)).toBe("1,234");
  });
});
