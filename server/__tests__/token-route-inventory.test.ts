import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");

function handler(method: "get" | "post" | "all", route: string): string {
  const marker = `app.${method}("${route}"`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing route ${method.toUpperCase()} ${route}`);
  const next = source.indexOf("\n  app.", start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("token/numeric public route inventory", () => {
  test.each([
    ["post", "/api/transactions/:id/split"],
    ["get", "/api/split-payments/:id"],
    ["post", "/api/transactions/:id/pay"],
    ["post", "/api/transactions/:id/hosted-fields-complete"],
    ["post", "/api/transactions/:id/googlepay-complete"],
    ["get", "/api/transactions/:id"],
    ["post", "/api/transactions/:id/receipt-pdf"],
    ["get", "/api/transactions/:id/receipt-qr"],
    ["get", "/api/windcave/callback"],
  ] as const)("%s %s rejects token-addressed rows", (method, route) => {
    expect(handler(method, route)).toContain("isTokenAddressedTransaction(");
  });

  test.each([
    ["get", "/api/pay/t/:token"],
    ["get", "/api/pay/t/:token/qr"],
    ["post", "/api/pay/t/:token/split"],
    ["post", "/api/pay/t/:token/session"],
    ["post", "/api/pay/t/:token/hosted-fields-complete"],
    ["post", "/api/pay/t/:token/googlepay-complete"],
    ["get", "/api/pay/t/:token/receipt"],
    ["post", "/api/pay/t/:token/receipt-pdf"],
    ["get", "/api/pay/t/:token/receipt-qr"],
    ["get", "/api/pay/return/:state"],
    ["all", "/api/pay/notification/:state"],
  ] as const)("%s %s sets bearer response policy", (method, route) => {
    expect(handler(method, route)).toContain("setPaymentTokenHeaders(res)");
  });

  test("token handlers never generate a numeric browser redirect", () => {
    const start = source.indexOf('app.get("/api/pay/t/:token"');
    const end = source.indexOf("// Get active transaction for merchant", start);
    const tokenHandlers = source.slice(start, end);
    expect(tokenHandlers).not.toMatch(/`\/(?:receipt|checkout|split|payment\/result)\/\$\{/);
    expect(tokenHandlers).toContain("/pay/return/${encodeURIComponent(req.params.state)}");
  });

  test("HPP callbacks cannot enable simulated approval from a query parameter", () => {
    expect(handler("get", "/api/pay/return/:state")).not.toContain("req.query.sim");
  });

  test("an expired processor-bound session is reconciled before replacement", () => {
    const sessionHandler = handler("post", "/api/pay/t/:token/session");
    expect(sessionHandler).toContain("reconcileExpiredTokenAttempt(claim.attempt)");
    expect(sessionHandler).not.toContain("outcome must be reconciled");
  });
});
