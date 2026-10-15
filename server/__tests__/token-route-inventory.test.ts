import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");

function handler(method: "get" | "post" | "all", route: string): string {
  const marker = `app.${method}("${route}"`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing route ${method.toUpperCase()} ${route}`);
  const next = source.indexOf("\n  app.", start + marker.length);
  const registration=source.slice(start, next < 0 ? source.length : next);
  const extracted=/retailCheckoutHandlers\.(session|complete|returnState|numericReturn)/.exec(registration);
  if(extracted){
    const module=fs.readFileSync(path.join(process.cwd(),'server/payment-checkout-handlers.ts'),'utf8');
    const from=module.indexOf(`  const ${extracted[1]}`),to=module.indexOf('\n  const ',from+8);
    const find=module.slice(module.indexOf('  const find='),module.indexOf('  const session='));
    return registration+'\n'+find+module.slice(from,to<0?module.length:to);
  }
  if(registration.includes('...durableNotificationHandlers'))return registration+fs.readFileSync('server/durable-payment-notification.ts','utf8');
  return registration;
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
    expect(handler(method, route)).toMatch(/isTokenAddressedTransaction\(|paymentTokenHash\s*(?:==|!=)/);
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
    expect(handler(method, route)).toMatch(/setPaymentTokenHeaders\(res\)|Cache-Control.*private, no-store/);
  });

  test("token handlers never generate a numeric browser redirect", () => {
    const start = source.indexOf('app.get("/api/pay/t/:token"');
    const end = source.indexOf("// Get active transaction for merchant", start);
    const tokenHandlers = source.slice(start, end);
    expect(tokenHandlers).not.toMatch(/`\/(?:receipt|checkout|split|payment\/result)\/\$\{/);
    expect(handler('get','/api/pay/return/:state')).toContain("/pay/return/${encodeURIComponent(req.params.state)}");
  });

  test("HPP callbacks cannot enable simulated approval from a query parameter", () => {
    expect(handler("get", "/api/pay/return/:state")).not.toContain("req.query.sim");
  });

  test("a reused processor-bound attempt queries its exact session and never sends a replacement", () => {
    const service=fs.readFileSync('server/durable-retail-checkout.ts','utf8');
    const reused=service.slice(service.indexOf("if(claim.kind!=='claimed')"),service.indexOf('const expected=await'));
    expect(reused).toContain('querySession(binding.sessionId)');
    expect(reused).toContain("receive(binding.sessionId,'poll'");
    expect(reused).not.toContain('createSession(');
  });
});
