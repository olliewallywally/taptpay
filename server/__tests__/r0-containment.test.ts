import fs from "node:fs";
import path from "node:path";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const routesSource = read("server/routes.ts");
const indexSource = read("server/index.ts");
const seedSource = read("server/seed.ts");
const windcaveSource = read("server/windcave.ts");
const contractsSource = read("server/http-contracts.ts");
const settingsSource = read("client/src/pages/settings.tsx");
const trackedReplitConfig = read(".replit");

function routeHandler(
  method: "get" | "post" | "put" | "patch" | "delete" | "all",
  route: string,
): string {
  const marker = new RegExp(
    `app\\.${method}\\(\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
  );
  const match = marker.exec(routesSource);
  if (!match) throw new Error(`Missing route ${method.toUpperCase()} ${route}`);
  const start = match.index;
  const next = routesSource.slice(start + match[0].length).search(/\n\s*app\.(?:get|post|put|patch|delete|all)\s*\(/);
  return routesSource.slice(
    start,
    next < 0 ? routesSource.length : start + match[0].length + next,
  );
}

function registrationPrefix(method: "post", route: string): string {
  const handler = routeHandler(method, route);
  const asyncStart = handler.indexOf("async");
  return asyncStart < 0 ? handler.slice(0, 240) : handler.slice(0, asyncStart);
}

describe("R0 containment — failing baseline evidence", () => {
  test("cross-tenant transaction clearing is authorized and cannot delete", () => {
    const clear = routeHandler("post", "/api/merchants/:id/clear-transactions");
    const violations: string[] = [];
    if (!/check(?:Account|Merchant)Ownership\s*\(/.test(clear)) {
      violations.push("missing tenant ownership gate");
    }
    if (clear.includes("storage.clearTransactions(")) {
      violations.push("destructive storage call remains");
    }

    expect(violations).toEqual([]);
  });

  test("wallet processing routes reject unauthenticated requests", () => {
    for (const route of [
      "/api/payments/apple-pay/process",
      "/api/payments/google-pay/process",
    ]) {
      expect({ route, registration: registrationPrefix("post", route) }).toEqual({
        route,
        registration: expect.stringContaining("authenticateToken"),
      });
    }
  });

  test("missing provider credentials never select a success simulator", () => {
    const violations: string[] = [];
    if (/(?:isSimulation|isSim)\s*=\s*!?\s*windcaveService\.isConfigured\s*\(\s*\)/.test(routesSource)) {
      violations.push("provider absence selects simulation");
    }
    if (/Simulat(?:e|ed) (?:Apple|Google|NFC|payment)/i.test(routesSource)) {
      violations.push("production router contains simulated success");
    }

    expect(violations).toEqual([]);
  });

  test("request-controlled simulation inputs cannot change an outcome", () => {
    const violations: string[] = [];
    if (/req\.query\.sim\b/i.test(routesSource)) violations.push("route query sim switch");
    if (/req\.body\.sim\b/i.test(routesSource)) violations.push("route body sim switch");
    if (/[?&]sim=1\b/i.test(routesSource)) violations.push("route-generated sim URL");
    if (/[?&]sim=1\b/i.test(windcaveSource)) violations.push("provider-generated sim URL");

    expect(violations).toEqual([]);
  });

  test("normal startup seeds only after the explicit seed capability gate", () => {
    const call = indexSource.indexOf("await seedDatabase()");
    expect(call).toBeGreaterThan(0);
    const guard = indexSource.slice(Math.max(0, call - 500), call);
    const violations = /seedDemoData|SEED_DEMO_DATA/.test(guard)
      ? []
      : ["startup seed call lacks explicit capability gate"];

    expect(violations).toEqual([]);
  });

  test("direct seed invocation refuses staging and production before database access", () => {
    const databaseAccess = seedSource.indexOf("getDb()");
    expect(databaseAccess).toBeGreaterThan(0);
    const guard = seedSource.slice(0, databaseAccess);
    const violations: string[] = [];
    if (!/appEnv|APP_ENV/.test(guard)) violations.push("direct seed lacks environment gate");
    if (!/development/.test(guard)) violations.push("development is not allowlisted");
    if (!/test/.test(guard)) violations.push("test is not allowlisted");

    expect(violations).toEqual([]);
  });

  test("application startup never launches a database backup", () => {
    const violations: string[] = [];
    if (indexSource.includes("db-backup.sh")) violations.push("startup backup command remains");
    if (/setInterval\s*\(\s*runBackup/.test(indexSource)) {
      violations.push("startup backup interval remains");
    }

    expect(violations).toEqual([]);
  });

  test("tracked runtime configuration contains no credential assignments", () => {
    const forbiddenKeys = [
      "JWT_SECRET",
      "ADMIN_PASSWORD",
      "ADMIN_PASSWORD_HASH",
      "VAPID_PRIVATE_KEY",
      "DATABASE_URL",
      "NEON_DATABASE_URL",
      "WINDCAVE_API_KEY",
      "WINDCAVE_USERNAME",
      "GOOGLE_CLIENT_SECRET",
      "APPLE_CLIENT_SECRET",
      "XERO_CLIENT_SECRET",
      "CRON_SECRET",
      "PAYMENT_RETURN_STATE_SECRET",
    ];
    const assignedKeys = forbiddenKeys.filter((key) =>
      new RegExp(`^\\s*${key}\\s*=`, "m").test(trackedReplitConfig),
    );

    expect(assignedKeys).toEqual([]);
  });

  test("merchant settings cannot read, write, or derive readiness from a Windcave credential", () => {
    const violations: string[] = [];
    const update = routeHandler("put", "/api/merchants/:id");
    if (/windcaveApiKey/.test(update)) violations.push("owner update schema");
    if (/windcaveApiKey/.test(settingsSource)) violations.push("client settings form");
    if (/Boolean\s*\(\s*merchant\.windcaveApiKey\s*\)/.test(contractsSource)) {
      violations.push("merchant DTO readiness");
    }

    expect(violations).toEqual([]);
  });
});
