import "./support/test-env";

import { createTestApp } from "./support/http-harness";
import {
  discoverRegistrationFiles,
  extractRegistrationInventory,
  extractSourceInventory,
  middlewarePolicyDiff,
  registrationKey,
  REGISTRATION_FILES,
  type SourceInventory,
} from "../route-inventory";
import { ROUTE_POLICY } from "../route-policy";
import { MIDDLEWARE_POLICY } from "../middleware-policy";

interface RuntimeRoute {
  method: string;
  path: string;
}

/** The files the test harness builds into its app: createApp, then registerRoutes. */
const HARNESS_FILES = ["server/app.ts", "server/routes.ts"] as const;

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

function registrationsIn(files: readonly string[]) {
  const inventory = extractRegistrationInventory();
  return files.flatMap((file) => inventory[file as keyof typeof inventory].registrations);
}

describe("R1-T2 route policy inventory", () => {
  it("the runtime-registered route stack matches the source inventory", async () => {
    const { app } = await createTestApp();
    const runtime = new Set(extractRuntimeRoutes(app).map((r) => registrationKey(r.method, r.path)));
    const source = new Set(registrationsIn(HARNESS_FILES).map((r) => registrationKey(r.method, r.path)));

    const missingFromRuntime = [...source].filter((k) => !runtime.has(k));
    const missingFromSource = [...runtime].filter((k) => !source.has(k));

    expect(missingFromRuntime).toEqual([]);
    expect(missingFromSource).toEqual([]);
  });

  it("every source-registered route, in every registration file, has a route-policy.ts entry", () => {
    const missing = registrationsIn(REGISTRATION_FILES)
      .map((r) => registrationKey(r.method, r.path))
      .filter((key) => !(key in ROUTE_POLICY));

    // This is the completeness gate: add a route without regenerating
    // server/route-policy.ts (npx tsx scripts/generate-route-policy.ts)
    // and this fails, naming exactly which registration has no policy entry.
    expect(missing).toEqual([]);
  });

  it("route-policy.ts has no stale entries for routes that no longer exist", () => {
    const source = new Set(registrationsIn(REGISTRATION_FILES).map((r) => registrationKey(r.method, r.path)));
    const stale = Object.keys(ROUTE_POLICY).filter((key) => !source.has(key));

    expect(stale).toEqual([]);
  });

  it("has no duplicate method+path registrations", () => {
    const keys = registrationsIn(REGISTRATION_FILES).map((r) => registrationKey(r.method, r.path));
    const counts = new Map<string, number>();
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);

    expect(duplicates).toEqual([]);
  });

  it("registers no mounted sub-router today — a future one must extend this test's coverage, not bypass it", async () => {
    const { app } = await createTestApp();
    expect(extractMountedRouters(app)).toEqual([]);

    const inventory = extractRegistrationInventory();
    const mounted = REGISTRATION_FILES.flatMap((file) =>
      inventory[file].uses.filter((u) => u.looksLikeMountedRouter).map((u) => `${file}:${u.line}`),
    );
    expect(mounted).toEqual([]);
  });
});

describe("R1-T2 — every middleware registration has policy (C10)", () => {
  it("every server file that registers on an Express app or router is one the inventory reads", () => {
    // A new file that registers a route or middleware must be added to
    // REGISTRATION_FILES (and its registrations to the policy), or this fails.
    expect(discoverRegistrationFiles()).toEqual([...REGISTRATION_FILES].sort());
  });

  it("every app.use registration has a middleware policy entry, in order, and none is stale", () => {
    expect(middlewarePolicyDiff(extractRegistrationInventory(), MIDDLEWARE_POLICY)).toEqual([]);
  });

  describe("the middleware gate itself", () => {
    const base = [
      'import express from "express";',
      "export function wire(app: express.Express) {",
      "  app.use(helmet());",
      "  app.use((req, res, next) => next());",
      '  app.get("/health", (_req, res) => res.send("ok"));',
      "}",
    ].join("\n");
    const policy = {
      "server/wire.ts": [
        { path: null, mounts: "helmet(…)" },
        { path: null, mounts: "inline function" },
      ],
    };
    const diffOf = (source: string) =>
      middlewarePolicyDiff(
        { "server/wire.ts": extractSourceInventory(source, "server/wire.ts") } as Record<string, SourceInventory>,
        policy,
      );

    it("passes the registrations it lists", () => {
      expect(diffOf(base)).toEqual([]);
    });

    it("names a middleware added without policy", () => {
      const problems = diffOf(base.replace("  app.use(helmet());", "  app.use(helmet());\n  app.use(cors());"));
      expect(problems.join("\n")).toContain("cors(…)");
    });

    it("names a mounted router added without policy", () => {
      const problems = diffOf(base.replace("  app.use(helmet());", '  app.use(helmet());\n  app.use("/api/extra", extraRouter);'));
      expect(problems.join("\n")).toContain("extraRouter");
      expect(problems.join("\n")).toContain("/api/extra");
    });

    it("names a listed middleware that was removed, and one that moved", () => {
      expect(diffOf(base.replace("  app.use(helmet());\n", "")).join("\n")).toContain("helmet(…)");
      const swapped = base.replace(
        "  app.use(helmet());\n  app.use((req, res, next) => next());",
        "  app.use((req, res, next) => next());\n  app.use(helmet());",
      );
      expect(diffOf(swapped)).not.toEqual([]);
    });

    it("reads a settings read (app.get with one argument) as no registration", () => {
      const inventory = extractSourceInventory(base.replace('  app.get("/health"', '  app.get("env");\n  app.get("/health"'), "x.ts");
      expect(inventory.registrations.map((r) => registrationKey(r.method, r.path))).toEqual(["GET /health"]);
    });
  });

  it("the app the server tests build runs exactly the policy's middleware, in order", async () => {
    const { app } = await createTestApp();
    const stack: any[] = (app as any)._router.stack;
    const firstRoute = stack.findIndex((layer) => layer.route);
    let lastRoute = -1;
    stack.forEach((layer, index) => {
      if (layer.route) lastRoute = index;
    });

    // Express's own two layers (query parsing, request initialisation) come
    // first; then server/app.ts's, then any in server/routes.ts.
    const beforeRoutes = stack.slice(0, firstRoute).map((layer) => layer.name);
    const expectedBefore = [
      "query",
      "expressInit",
      ...HARNESS_FILES.flatMap((file) => MIDDLEWARE_POLICY[file].map((entry) => entry.runtimeName)),
    ];
    expect(beforeRoutes).toEqual(expectedBefore);

    const betweenRoutes = stack.slice(firstRoute, lastRoute + 1).filter((layer) => !layer.route);
    expect(betweenRoutes.map((layer) => layer.name)).toEqual([]);

    // The harness adds the global error handler after the routes, as
    // server/index.ts does.
    const errorHandler = MIDDLEWARE_POLICY["server/index.ts"].find(
      (entry) => entry.mounts === "createGlobalErrorHandler(…)",
    );
    const afterRoutes = stack.slice(lastRoute + 1);
    expect(afterRoutes.map((layer) => layer.name)).toEqual([errorHandler?.runtimeName]);
    expect(afterRoutes[0].handle.length).toBe(4); // (error, req, res, next): an error handler
  });
});
