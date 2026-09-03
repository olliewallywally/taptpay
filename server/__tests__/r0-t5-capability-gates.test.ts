import fs from "node:fs";
import path from "node:path";

const routes = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf8");

function handler(method: string, route: string): string {
  const start = routes.indexOf(`app.${method}("${route}"`);
  if (start < 0) throw new Error(`Missing ${method.toUpperCase()} ${route}`);
  const next = routes.indexOf("\n  app.", start + 1);
  return routes.slice(start, next < 0 ? routes.length : next);
}

describe("R0-T5 disabled capability gates", () => {
  test.each([
    ["post", "/api/transactions/tap-to-pay"],
    ["post", "/api/merchants/:merchantId/nfc-pay"],
  ])("%s %s fails before billing or transaction writes", (method, route) => {
    const source = handler(method, route);
    const gate = source.indexOf("config.features.tapToPay");
    expect(gate).toBeGreaterThan(0);
    expect(source.indexOf("requireBillingCard")).toBeGreaterThan(gate);
    expect(source.indexOf("storage.createTransaction")).toBeGreaterThan(gate);
  });

  test("refund initiation fails before reservation and refund creation", () => {
    const source = handler("post", "/api/transactions/:transactionId/refunds");
    const gate = source.indexOf("config.features.refundInitiation");
    expect(gate).toBeGreaterThan(0);
    expect(source.indexOf("reserveRefundAmount")).toBeGreaterThan(gate);
    expect(source.indexOf("createRefund")).toBeGreaterThan(gate);
  });

  test.each([
    ["post", "/api/v1/transactions"],
    ["get", "/api/v1/transactions/:id"],
  ])("%s %s is hidden before API-key database work", (method, route) => {
    const registration = handler(method, route).slice(0, 180);
    expect(registration.indexOf("requireEcommerceApi")).toBeGreaterThan(0);
    expect(registration.indexOf("requireEcommerceApi")).toBeLessThan(
      registration.indexOf("authenticateApiKey"),
    );
  });
});
