import { normalizeDomain, normalizeEmail, normalizePhone, deriveDedupeKey, inferSegment } from "../normalize";

describe("normalize", () => {
  test("normalizeDomain strips scheme/www/path and reads an email host", () => {
    expect(normalizeDomain("https://www.Foo.co.nz/x?y=1")).toBe("foo.co.nz");
    expect(normalizeDomain("hi@bar.com")).toBe("bar.com");
    expect(normalizeDomain("")).toBeUndefined();
    expect(normalizeDomain(null)).toBeUndefined();
  });

  test("normalizeEmail lowercases + trims, rejects non-emails", () => {
    expect(normalizeEmail("  HI@X.COM ")).toBe("hi@x.com");
    expect(normalizeEmail("notanemail")).toBeUndefined();
  });

  test("normalizePhone keeps a leading + and digits only", () => {
    expect(normalizePhone("+64 21 123 4567")).toBe("+64211234567");
    expect(normalizePhone("(09) 555-1234")).toBe("095551234");
    expect(normalizePhone("--")).toBeUndefined();
  });

  test("deriveDedupeKey prefers the domain, else name + locality", () => {
    expect(deriveDedupeKey({ businessName: "Joe's Cafe", website: "https://www.joescafe.co.nz" })).toBe("d:joescafe.co.nz");
    expect(deriveDedupeKey({ businessName: "Joe's Cafe", suburb: "Newtown" })).toBe("n:joe-s-cafe@newtown");
    expect(deriveDedupeKey({ businessName: "X", email: "a@x.com" })).toBe("d:x.com");
  });

  test("inferSegment maps keywords", () => {
    expect(inferSegment("Coffee shop")).toBe("hospitality");
    expect(inferSegment("plumbing")).toBe("trades");
    expect(inferSegment("unknown thing")).toBeUndefined();
  });
});
