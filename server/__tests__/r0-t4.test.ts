import fs from "node:fs";
import path from "node:path";
import { strictPositiveIntegerParam } from "../http-params";
import { assertDemoSeedAllowed } from "../seed";
import { isDemoAccountLoginBlocked } from "../demo-safety";

const routesSource = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");

function clearingHandler(): string {
  const start = routesSource.indexOf('app.post("/api/merchants/:id/clear-transactions"');
  if (start < 0) throw new Error("transaction-clearing tombstone is missing");
  const next = routesSource.indexOf("\n  app.", start + 1);
  return routesSource.slice(start, next < 0 ? routesSource.length : next);
}

describe("R0-T4 retired clearing and seed safety", () => {
  test.each([
    ["1", 1],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
    ["1abc", null],
    ["0", null],
    ["-1", null],
    ["1.5", null],
    [["1", "2"], null],
    ["9007199254740992", null],
  ])("strict merchant ID parser maps %p to %p", (raw, expected) => {
    expect(strictPositiveIntegerParam(raw)).toBe(expected);
  });

  test("clearing route authenticates, authorizes, and only returns its tombstone", () => {
    const handler = clearingHandler();
    expect(handler.slice(0, 180)).toContain("authenticateToken");
    expect(handler).toContain("strictPositiveIntegerParam");
    expect(handler).toContain("checkAccountOwnership");
    expect(handler).toContain("status(400)");
    expect(handler).toContain("status(403)");
    expect(handler).toContain("status(410)");
    expect(handler).toContain("TRANSACTION_CLEARING_RETIRED");
    expect(handler).not.toMatch(/storage\.|windcave|sendPush|sseBroker|outbox/i);
  });

  test("direct seed policy requires the flag and a development/test environment", () => {
    expect(() => assertDemoSeedAllowed({ seedDemoData: false, appEnv: "development" }))
      .toThrow("SEED_DEMO_DATA");
    expect(() => assertDemoSeedAllowed({ seedDemoData: true, appEnv: "staging" }))
      .toThrow("development and test");
    expect(() => assertDemoSeedAllowed({ seedDemoData: true, appEnv: "production" }))
      .toThrow("development and test");
    expect(() => assertDemoSeedAllowed({ seedDemoData: true, appEnv: "development" }))
      .not.toThrow();
    expect(() => assertDemoSeedAllowed({ seedDemoData: true, appEnv: "test" }))
      .not.toThrow();
  });

  test("the known demo account cannot authenticate in staging or production", () => {
    expect(isDemoAccountLoginBlocked("production", "demo@tapt.co.nz")).toBe(true);
    expect(isDemoAccountLoginBlocked("staging", " DEMO@TAPT.CO.NZ ")).toBe(true);
    expect(isDemoAccountLoginBlocked("development", "demo@tapt.co.nz")).toBe(false);
    expect(isDemoAccountLoginBlocked("test", "demo@tapt.co.nz")).toBe(false);
    expect(isDemoAccountLoginBlocked("production", "merchant@example.test")).toBe(false);
  });
});
