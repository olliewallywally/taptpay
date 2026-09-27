import fs from "node:fs";
import path from "node:path";
import { strictPositiveIntegerParam } from "../http-params";
import { assertDemoSeedAllowed } from "../seed";
import { isDemoAccountLoginBlocked } from "../demo-safety";

const routesSource = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");


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

  // The tombstone that replaced clearing (410) was removed on 2026-09-27 (owner decision, C10 batch
  // 6b): nothing called it. What R0-T4 holds is that no route clears a business's sales.
  test("no route clears a business's sales", () => {
    expect(routesSource).not.toMatch(/app\.\w+\("[^"]*clear-transactions/);
    expect(routesSource).not.toMatch(/storage\.(clear|deleteAll|deleteTransactionsBy)\w*/);
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
