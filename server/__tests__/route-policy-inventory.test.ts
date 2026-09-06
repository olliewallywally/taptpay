import "./support/test-env";

import path from "path";
import { createTestApp } from "./support/http-harness";
import { extractSourceInventoryFromFile, registrationKey } from "../route-inventory";
import { ROUTE_POLICY } from "../route-policy";

const ROUTES_FILE = path.join(process.cwd(), "server", "routes.ts");

interface RuntimeRoute {
  method: string;
  path: string;
}

/**
 * Express 4 stores every app.get/post/.../all() registration as a Layer with
 * a `.route` on app._router.stack, in registration order. app.all() sets
 * every verb on route.methods (no distinct flag) — the WebDAV-only verbs
 * ('m-search', 'purge', ...) never appear from an explicit single/multi
 * -method registration in this codebase, so their presence is what
 * distinguishes an app.all() registration from a real one at runtime.
 */
function extractRuntimeRoutes(app: any): RuntimeRoute[] {
  const stack: any[] = app._router?.stack ?? [];
  const routes: RuntimeRoute[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods);
    const isAll = methods.includes("m-search") || methods.includes("purge");
    if (isAll) {
      routes.push({ method: "ALL", path: layer.route.path });
    } else {
      for (const m of methods) routes.push({ method: m.toUpperCase(), path: layer.route.path });
    }
  }
  return routes;
}

function extractMountedRouters(app: any): string[] {
  const stack: any[] = app._router?.stack ?? [];
  return stack.filter((layer) => !layer.route && layer.name === "router").map((layer) => String(layer.regexp));
}

describe("R1-T2 route policy inventory", () => {
  it("the runtime-registered route stack matches the source inventory", async () => {
    const { app } = await createTestApp();
    const runtime = new Set(extractRuntimeRoutes(app).map((r) => registrationKey(r.method, r.path)));
    const source = new Set(
      extractSourceInventoryFromFile(ROUTES_FILE).registrations.map((r) => registrationKey(r.method, r.path)),
    );

    const missingFromRuntime = [...source].filter((k) => !runtime.has(k));
    const missingFromSource = [...runtime].filter((k) => !source.has(k));

    expect(missingFromRuntime).toEqual([]);
    expect(missingFromSource).toEqual([]);
  });

  it("every source-registered route has a route-policy.ts entry", () => {
    const source = extractSourceInventoryFromFile(ROUTES_FILE).registrations;
    const missing = source
      .map((r) => registrationKey(r.method, r.path))
      .filter((key) => !(key in ROUTE_POLICY));

    // This is the completeness gate: add a route to server/routes.ts without
    // regenerating server/route-policy.ts (npx tsx scripts/generate-route-policy.ts)
    // and this fails, naming exactly which registration has no policy entry.
    expect(missing).toEqual([]);
  });

  it("route-policy.ts has no stale entries for routes that no longer exist", () => {
    const source = new Set(
      extractSourceInventoryFromFile(ROUTES_FILE).registrations.map((r) => registrationKey(r.method, r.path)),
    );
    const stale = Object.keys(ROUTE_POLICY).filter((key) => !source.has(key));

    expect(stale).toEqual([]);
  });

  it("has no duplicate method+path registrations", () => {
    const keys = extractSourceInventoryFromFile(ROUTES_FILE).registrations.map((r) =>
      registrationKey(r.method, r.path),
    );
    const counts = new Map<string, number>();
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);

    expect(duplicates).toEqual([]);
  });

  it("registers no mounted sub-router today — a future one must extend this test's coverage, not bypass it", async () => {
    const { app } = await createTestApp();
    expect(extractMountedRouters(app)).toEqual([]);

    const uses = extractSourceInventoryFromFile(ROUTES_FILE).uses;
    expect(uses.filter((u) => u.looksLikeMountedRouter)).toEqual([]);
  });
});
