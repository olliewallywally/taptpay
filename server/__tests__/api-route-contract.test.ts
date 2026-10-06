import fs from "node:fs";
import path from "node:path";
import { expandFacts } from "../route-facts";
import { ROUTE_MATRIX } from "../route-matrix";
import { ROUTE_POLICY } from "../route-policy";
import { ROUTE_REVIEW } from "../route-review";
import { API_ROUTES_FILE, browserApiRoutes, renderApiRoutes } from "../api-route-list";
import { ADMIN_API_PREFIX, apiMethod, apiPath, apiTo } from "../../shared/api-path";

/**
 * R1-T10a: one spelling for every API address. The pages name a route by its registration
 * ("PUT /api/merchants/:id/theme") and a small builder fills its path; the list of names is
 * generated from the server's own registrations (shared/api-routes.ts, types only). So a page and
 * the server cannot disagree about a path or the shape of an id without this file, or the type
 * check, failing.
 *
 * Tests keep their literal addresses on purpose: a test that built its expectation with the same
 * builder would agree with any mistake in it.
 */
const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const listed = browserApiRoutes();
const keys = listed.map((route) => route.key);
/** A route's name passed to the builder, wherever the client's source does so. */
const NAMED = /\bapi(?:Path|To|Method)\(\s*(["'`])([^"'`]*)\1/g;
/** Any other first argument: a name the type check cannot be relied on to have seen. */
const CALLED = /\bapi(?:Path|To|Method)\(\s*([^\s)])/g;

/** Every source file of the client, tests aside. */
function clientSources(dir = "client/src"): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : clientSources(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

/**
 * The surfaces moved onto the builder. Each may no longer spell an API address itself. The list only
 * grows: a later batch (R1-T10b) appends its files; none is ever taken off.
 */
const MIGRATED = [
  // T10a: signing in, signing up, and getting back into an account.
  "client/src/pages/login.tsx",
  "client/src/pages/admin-login.tsx",
  "client/src/pages/merchant-signup.tsx",
  "client/src/pages/forgot-password.tsx",
  "client/src/pages/reset-password.tsx",
  "client/src/pages/confirm-email.tsx",
  "client/src/pages/check-email.tsx",
  "client/src/pages/accept-invite.tsx",
  "client/src/lib/session.ts",
  "client/src/lib/sign-out-everywhere.ts",
  "client/src/lib/apple-sign-in.ts",
  "client/src/hooks/use-apple-connection.ts",
];
/** A string that starts with /api: in quotes of any kind, a template included. */
const SPELLED_ADDRESS = /["'`]\/api(?:[/"'`?#]|$)/m;

describe("R1-T10a — the list of API routes a browser calls", () => {
  it("is the server's own registrations: the checked-in file is what the generator writes now", () => {
    // Regenerate with: node --import tsx scripts/generate-route-policy.ts
    expect(read(API_ROUTES_FILE)).toBe(renderApiRoutes(listed));
  });

  it("lists every /api route a business login, the platform admin, anyone or a link's holder calls, and no other", () => {
    const browser = new Set(["merchant", "platform-admin", "public", "public-bearer"]);
    const expected = Object.entries(ROUTE_POLICY)
      .filter(([key, entry]) => entry.path.startsWith("/api/") && entry.method !== "ALL"
        && ROUTE_REVIEW[key].branches.some((branch) => browser.has(branch.principal)))
      .map(([key]) => key);
    expect([...keys].sort()).toEqual([...expected].sort());
    expect(keys.length).toBeGreaterThan(150);
    // A browser's, of each kind.
    for (const key of [
      "POST /api/auth/login", "GET /api/auth/session", "GET /api/auth/apple/available", "GET /api/merchants/:id/profile",
      "GET /api/admin/merchants", "GET /api/pay/t/:token", "POST /api/merchants/signup",
    ]) expect([key, keys.includes(key)]).toEqual([key, true]);
    // Not a browser's: the provider's, the scheduler's, the ecommerce API's; and nothing off /api.
    for (const key of [
      "POST /api/internal/cron", "GET /api/internal/cron/status", "POST /api/webhooks/whatsapp", "POST /api/v1/transactions",
      "GET /api/v1/transactions/:id", "ALL /api/windcave/notification", "ALL /api/pay/notification/:state", "GET /robots.txt",
      "GET /uploads/:folder/:name",
    ]) {
      expect([key, key in ROUTE_POLICY]).toEqual([key, true]);
      expect([key, keys.includes(key)]).toEqual([key, false]);
    }
    expect(keys.filter((key) => !/^(GET|POST|PUT|PATCH|DELETE) \/api\//.test(key))).toEqual([]);
  });

  it("names each route as the server registers it, once, in a fixed order", () => {
    for (const route of listed) {
      expect(route.key).toBe(`${route.method} ${route.path}`);
      expect(route.key in ROUTE_POLICY).toBe(true);
    }
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("types each path parameter by the server's own parser: a strict positive integer is a number, anything else text", () => {
    for (const route of listed) {
      const inPath = [...route.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]);
      expect([route.key, route.params.map((param) => param.name)]).toEqual([route.key, inPath]);
      const parsers = new Map(expandFacts(ROUTE_POLICY[route.key].facts).params.map((entry) => {
        const [name, how] = entry.split(": ");
        return [name, how.split(" | ")] as const;
      }));
      for (const param of route.params) {
        const strictInteger = (parsers.get(param.name) ?? []).includes("strictPositiveIntegerParam");
        expect([route.key, param.name, param.type]).toEqual([route.key, param.name, strictInteger ? "number" : "string"]);
      }
    }
    const typeOf = (key: string) => Object.fromEntries(listed.find((route) => route.key === key)!.params.map((param) => [param.name, param.type]));
    expect(typeOf("GET /api/merchants/:id/profile")).toEqual({ id: "number" });
    expect(typeOf("PUT /api/merchants/:merchantId/stock-items/:itemId")).toEqual({ merchantId: "number", itemId: "number" });
    expect(typeOf("GET /api/pay/t/:token")).toEqual({ token: "string" });
    expect(typeOf("PATCH /api/tutorial/pages/:pageKey")).toEqual({ pageKey: "string" });
    expect(typeOf("GET /api/auth/session")).toEqual({});
    // An id the server reads as a UUID is text here.
    const uuidRoutes = listed.filter((route) => expandFacts(ROUTE_POLICY[route.key].facts).params.some((entry) => entry.endsWith(": strictUuidParam")));
    expect(uuidRoutes.length).toBeGreaterThan(10);
  });

  it("writes the file as types only: one entry per route, nothing a bundle would carry", () => {
    const file = renderApiRoutes(listed);
    for (const route of listed) {
      const params = route.params.length ? `{ ${route.params.map((param) => `${param.name}: ${param.type}`).join("; ")} }` : "Record<never, never>";
      expect(file).toContain(`  "${route.key}": ${params};\n`);
    }
    expect(file).toContain("export interface ApiRouteParams {");
    expect(file).toContain("export type ApiRouteKey = keyof ApiRouteParams;");
    // No value is exported: only an interface and a type.
    expect(file.split("\n").filter((line) => /^export /.test(line)).map((line) => line.split(" ").slice(0, 2).join(" ")))
      .toEqual(["export interface", "export type"]);
    // The same on any machine, on any day: no date, no commit.
    expect(file).not.toMatch(/\b20\d\d-\d\d-\d\d\b|\b[0-9a-f]{40}\b/);
  });
});

describe("R1-T10a — building an address", () => {
  const sample = (type: "number" | "string") => (type === "number" ? 7 : "abc-123_x");
  const build = apiPath as unknown as (key: string, params?: Record<string, unknown>) => string;

  it("fills every listed route's path with its parameters, and says its method", () => {
    for (const route of listed) {
      const params = Object.fromEntries(route.params.map((param) => [param.name, sample(param.type)]));
      const expected = route.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_whole, name: string) => String(params[name]));
      expect([route.key, route.params.length ? build(route.key, params) : build(route.key)]).toEqual([route.key, expected]);
      expect(apiMethod(route.key as never)).toBe(route.method);
      expect(apiTo(...([route.key, ...(route.params.length ? [params] : [])] as unknown as Parameters<typeof apiTo>))).toEqual([route.method, expected]);
    }
  });

  it("builds the addresses the pages have always used", () => {
    expect(apiPath("GET /api/auth/session")).toBe("/api/auth/session");
    expect(apiPath("GET /api/merchants/:id/profile", { id: 22 })).toBe("/api/merchants/22/profile");
    expect(apiPath("PUT /api/merchants/:merchantId/stock-items/:itemId", { merchantId: 22, itemId: 5 })).toBe("/api/merchants/22/stock-items/5");
    expect(apiPath("GET /api/pay/t/:token", { token: "AbC_-123" })).toBe("/api/pay/t/AbC_-123");
    expect(apiTo("PUT /api/merchants/:id/theme", { id: 22 })).toEqual(["PUT", "/api/merchants/22/theme"]);
    expect(apiTo("POST /api/auth/logout")).toEqual(["POST", "/api/auth/logout"]);
  });

  it("writes a text parameter into one path segment, whatever it holds", () => {
    expect(apiPath("GET /api/pay/t/:token", { token: "a/b c?d#e%" })).toBe("/api/pay/t/a%2Fb%20c%3Fd%23e%25");
    expect(apiPath("GET /api/pay/t/:token", { token: "../admin" })).toBe("/api/pay/t/..%2Fadmin");
  });

  it.each([
    ["zero", 0], ["a negative number", -3], ["a fraction", 1.5], ["not a number", Number.NaN], ["infinity", Number.POSITIVE_INFINITY],
    ["a number too large to be exact", Number.MAX_SAFE_INTEGER + 2], ["nothing", undefined], ["null", null], ["empty text", ""],
    ["a list", [22]], ["an object", { id: 22 }], ["true", true],
  ])("refuses %s as a parameter instead of building a wrong address", (_what, value) => {
    expect(() => build("GET /api/merchants/:id/profile", { id: value })).toThrow(/GET \/api\/merchants\/:id\/profile/);
    expect(() => build("GET /api/pay/t/:token", { token: value })).toThrow(/GET \/api\/pay\/t\/:token/);
  });

  it("refuses a missing parameter and one the path does not have, and never repeats what it was given", () => {
    expect(() => build("PUT /api/merchants/:merchantId/stock-items/:itemId", { merchantId: 22 })).toThrow(/itemId/);
    expect(() => build("GET /api/merchants/:id/profile")).toThrow(/"id"/);
    expect(() => build("GET /api/merchants/:id/profile", { id: 22, merchantId: 23 })).toThrow(/"merchantId"/);
    expect(() => build("GET /api/auth/session", { id: 22 })).toThrow(/"id"/);
    // A parameter can be a secret (a link's token): each refusal names the route and the parameter only.
    const told = (params: Record<string, unknown>) => {
      try { build("GET /api/merchants/:id/profile", params); } catch (error) { return String((error as Error).message); }
      return "(built)";
    };
    expect(told({ id: -987654321 })).toMatch(/"id"/);
    expect(told({ id: -987654321 })).not.toContain("987654321");
    expect(told({ id: { toString: () => "s3cr3t-value" } })).toMatch(/"id"/);
    expect(told({ id: { toString: () => "s3cr3t-value" } })).not.toContain("s3cr3t-value");
    expect(told({ id: 22, note: "s3cr3t-value" })).toMatch(/"note"/);
    expect(told({ id: 22, note: "s3cr3t-value" })).not.toContain("s3cr3t-value");
  });
});

describe("R1-T10a — the admin area's prefix", () => {
  it("is the one the server reads the admin's own session by, and where every admin-gated route lives", () => {
    // The page sends the admin's CSRF token to an address under this prefix, the business's to any other
    // (client/src/lib/session.ts); the server picks the session to read by the same prefix.
    expect(ADMIN_API_PREFIX).toBe("/api/admin");
    expect(read("server/auth.ts")).toContain(`req.path.startsWith('${ADMIN_API_PREFIX}')`);
    expect(read("client/src/lib/session.ts")).toContain("path === ADMIN_API_PREFIX || path.startsWith(`${ADMIN_API_PREFIX}/`)");
    const under = Object.keys(ROUTE_MATRIX).filter((key) => key.split(" ")[1].startsWith(`${ADMIN_API_PREFIX}/`));
    const adminGated = Object.entries(ROUTE_MATRIX).filter(([, row]) => row.gate === "admin").map(([key]) => key);
    expect(adminGated.length).toBeGreaterThan(10);
    expect(adminGated.filter((key) => !under.includes(key))).toEqual([]);
    // The one route under it that is not behind the admin gate is the way in.
    expect(under.filter((key) => !adminGated.includes(key))).toEqual(["POST /api/admin/auth/login"]);
  });
});

describe("R1-T10a — the pages moved onto the builder", () => {
  it("spell no API address themselves", () => {
    const spelled = MIGRATED.filter((file) => SPELLED_ADDRESS.test(read(file)));
    expect(spelled).toEqual([]);
  });

  it("are real files, each listed once, and each uses the builder", () => {
    expect(new Set(MIGRATED).size).toBe(MIGRATED.length);
    for (const file of MIGRATED) {
      expect([file, fs.existsSync(path.join(ROOT, file))]).toEqual([file, true]);
      expect([file, /\bapi(?:Path|To)\(/.test(read(file))]).toEqual([file, true]);
    }
    expect(MIGRATED.length).toBeGreaterThanOrEqual(12);
  });

  it("the guard itself tells an address from a route's name", () => {
    for (const address of ['fetch("/api/auth/login")', "fetch('/api/auth/login')", "fetch(`/api/merchants/${id}/profile`)", 'const base = "/api";', 'x = "/api?y=1"']) {
      expect([address, SPELLED_ADDRESS.test(address)]).toEqual([address, true]);
    }
    for (const fine of ['apiPath("POST /api/auth/login")', "apiTo('PUT /api/merchants/:id/theme', { id })", "// sends the browser to /api/auth/apple", 'href="/apiary"']) {
      expect([fine, SPELLED_ADDRESS.test(fine)]).toEqual([fine, false]);
    }
  });
});

describe("R1-T10a — every route the client names", () => {
  const sources = clientSources();

  it("is a listed one, read from the source so a cast past the types is still caught", () => {
    const unknown: string[] = [];
    let named = 0;
    for (const file of sources) {
      for (const match of read(file).matchAll(NAMED)) {
        named += 1;
        if (!keys.includes(match[2])) unknown.push(`${file}: ${match[2]}`);
      }
    }
    expect(unknown).toEqual([]);
    expect(named).toBeGreaterThanOrEqual(26);
  });

  it("is called by its own method wherever a call spells one beside the builder", () => {
    // fetch(apiPath("POST …"), { method: "POST", … }): the method is spelled twice there, and must be the route's.
    // (apiTo carries the method itself.) A call that spells none is a GET.
    const CALL = /\b(?:fetch|sessionFetch)\(\s*apiPath\(\s*"([A-Z]+) [^"]*"/g;
    const disagree: string[] = [];
    let calls = 0;
    for (const file of sources) {
      const text = read(file);
      for (const match of text.matchAll(CALL)) {
        calls += 1;
        const call = text.slice(match.index!, match.index! + 600).split(");")[0];
        const spelled = /\bmethod:\s*["'`]([A-Za-z]+)["'`]/.exec(call)?.[1] ?? "GET";
        if (spelled.toUpperCase() !== match[1]) disagree.push(`${file}: ${match[0].split("(").pop()} is called with ${spelled}`);
      }
    }
    expect(disagree).toEqual([]);
    expect(calls).toBeGreaterThanOrEqual(12);
  });

  it("is written out where it is used: the builder is never handed a name from a variable", () => {
    const indirect: string[] = [];
    for (const file of sources) {
      for (const match of read(file).matchAll(CALLED)) {
        if (!/["'`]/.test(match[1])) indirect.push(`${file}: ${read(file).slice(match.index!, match.index! + 40).split("\n")[0]}`);
      }
    }
    expect(indirect).toEqual([]);
  });
});
