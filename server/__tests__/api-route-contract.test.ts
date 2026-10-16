import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expandFacts } from "../route-facts";
import { strictPositiveIntegerParam, strictUuidParam } from "../http-params";
import { ROUTE_MATRIX } from "../route-matrix";
import { ROUTE_POLICY } from "../route-policy";
import { ROUTE_REVIEW } from "../route-review";
import { API_ROUTES_FILE, browserApiRoutes, renderApiRoutes } from "../api-route-list";
import {
  ADMIN_API_PREFIX, CHECKOUT_RESOLVE_KEY, MERCHANTS_KEY, QUOTE_TOKEN_KEY, SPLIT_PAYMENTS_KEY, TRANSACTIONS_KEY,
  apiMethod, apiPath, apiTo, wholeNumber,
} from "../../shared/api-path";
import { isTutorialPageKey } from "../../shared/tutorial";

/**
 * R1-T10: one spelling for every API address. The pages name a route by its registration
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

/** Every source file of the client, tests aside: TypeScript and the few plain JavaScript ones alike. */
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
function clientSources(dir = "client/src"): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : clientSources(file);
    return SOURCE.test(entry.name) && !/\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [file] : [];
  });
}

/**
 * The files the app never loads. Nothing imports nine of them; App declares three for lazy loading
 * and never renders them. Every call to a route the server no longer has is in one of these, so they
 * are left as they are, held to the number of addresses each spells today, and must stay unloaded.
 * Deleting them is the owner's decision (docs/PLAN-2026-10-06-r1-t10-acceptance-matrix.md, question 4).
 * A file is taken off this list by deleting it or by moving it onto the builder, never added to it.
 */
const NEVER_LOADED: Record<string, number> = {
  "client/src/pages/admin-api.tsx": 0,
  "client/src/pages/admin-dashboard.tsx": 6,
  "client/src/pages/admin-merchant-broken.tsx": 9,
  "client/src/pages/admin-merchant.tsx": 9,
  "client/src/pages/admin-revenue.tsx": 1,
  "client/src/pages/admin/WebsiteAnalytics.tsx": 2,
  "client/src/pages/create-merchant.tsx": 3,
  "client/src/pages/demo-terminal.tsx": 28,
  "client/src/pages/exports.tsx": 4,
  "client/src/pages/merchant-terminal-mobile.tsx": 13,
  "client/src/pages/merchant-terminal.tsx": 19,
  "client/src/pages/settings-simple.tsx": 3,
};
/**
 * The admin area has a page of its own at the address /api, as it has one at /merchants: a page's
 * address, not the API's. It is the one such text a loaded file may spell, in the two files that go there.
 */
const ADMIN_PAGE = "/api";
const ADMIN_PAGE_USES: Record<string, number> = {
  "client/src/pages/admin/AdminDashboard.tsx": 5,
  "client/src/pages/admin/GridDashboard.tsx": 1,
};
/** Moved onto the builder with the sign-in pages (T10a), and found later to be a page nothing imports. */
const MOVED_AND_NEVER_LOADED = ["client/src/pages/admin-login.tsx"];
/** Text that is an API address or the start of one: /api itself, or /api followed by a path, a query or a fragment. */
const ADDRESS_START = /^\/api(?:[/?#]|$)/;

/** The cache labels (shared/api-path.ts): the first word of a cached entry's name that is not an address. */
const LABELS: Record<string, string> = { MERCHANTS_KEY, TRANSACTIONS_KEY, SPLIT_PAYMENTS_KEY, CHECKOUT_RESOLVE_KEY, QUOTE_TOKEN_KEY };

/**
 * Calls that take an address first and, like fetch, say their method in the options after it.
 * `request` is a fetch handed in to be called (hooks/use-push-notifications).
 */
const FETCH_LIKE = new Set(["fetch", "sessionFetch", "tradesFetch", "propFetch", "authFetch", "request"]);
const BUILDERS = new Set(["apiPath", "apiTo", "apiMethod"]);

const parsed = new Map<string, ts.SourceFile>();
/** A client source file's syntax tree: the checks below read calls from it, not from the text. */
function tree(file: string): ts.SourceFile {
  if (!parsed.has(file)) parsed.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JSX));
  return parsed.get(file)!;
}
const at = (file: string, node: ts.Node) => `${file}:${tree(file).getLineAndCharacterOfPosition(node.getStart(tree(file))).line + 1}`;
const written = (node: ts.Node | undefined): string | null =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
const calleeOf = (call: ts.CallExpression | ts.NewExpression): string =>
  ts.isIdentifier(call.expression) ? call.expression.text : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : "";

/**
 * The API addresses a file spells itself: every string, in quotes of any kind or a template, that
 * starts with /api. Read from the syntax tree, so a comment that mentions an address is not one.
 */
function spelled(file: string): Array<{ where: string; text: string; whole: boolean }> {
  const found: Array<{ where: string; text: string; whole: boolean }> = [];
  const visit = (node: ts.Node): void => {
    const text = ts.isTemplateExpression(node) ? node.head.text : written(node);
    // `whole`: the text is all there is (not the start of a template that goes on).
    if (text !== null && ADDRESS_START.test(text)) found.push({ where: `${at(file, node)}: ${node.getText(tree(file)).slice(0, 60)}`, text, whole: !ts.isTemplateExpression(node) });
    ts.forEachChild(node, visit);
  };
  visit(tree(file));
  return found;
}
const spelledAddresses = (file: string): string[] => spelled(file).map((address) => address.where);

/**
 * What a file loads: its imports and re-exports that are not types only, and its import() calls.
 * A page declared for lazy loading and never used is never asked for: `const Page = lazy(() => import("…"))`
 * with no other mention of Page. Any other mention counts as a use, so a doubt reads as loaded.
 */
function importsOf(file: string): string[] {
  const source = tree(file);
  const mentions = new Map<string, number>();
  const count = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) mentions.set(node.text, (mentions.get(node.text) ?? 0) + 1);
    ts.forEachChild(node, count);
  };
  count(source);
  const specs: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typesOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly === true : node.isTypeOnly;
      if (!typesOnly) specs.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && mentions.get(node.name.text) === 1
      && node.initializer && ts.isCallExpression(node.initializer) && /^(lazy|lazyWithRetry)$/.test(calleeOf(node.initializer))) return;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const spec = written(node.arguments[0]);
      if (spec !== null) specs.push(spec);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specs;
}

/** The client file an import names, where it is one of the client's own source files. */
function clientFile(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? `client/src/${spec.slice(2)}`
    : spec.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(from), spec))
    : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const full = path.join(ROOT, candidate);
    if (SOURCE.test(candidate) && fs.existsSync(full) && fs.statSync(full).isFile()) return candidate;
  }
  return null;
}

/** Every client source file the app can load, starting from its entry and following importsOf. */
function loadedFiles(entry = "client/src/main.tsx"): Set<string> {
  const loaded = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (loaded.has(file)) continue;
    loaded.add(file);
    for (const spec of importsOf(file)) {
      const target = clientFile(file, spec);
      if (target !== null) queue.push(target);
    }
  }
  return loaded;
}

interface BuilderUse { file: string; node: ts.CallExpression; builder: string; key: string | null }
/** Every call of the builder in a file, with the route's name where it is written out. */
function builderUses(file: string): BuilderUse[] {
  const uses: BuilderUse[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && BUILDERS.has(node.expression.text)) {
      uses.push({ file, node, builder: node.expression.text, key: written(node.arguments[0]) });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree(file));
  return uses;
}

/**
 * The method a call says beside a built address, where the address is handed straight to a request:
 * fetch(apiPath(...), { method }), a wrapper of the same shape, apiRequest("METHOD", apiPath(...)), or
 * new EventSource(apiPath(...)). Also through `${apiPath(...)}?tail`, `apiPath(...) + tail` and
 * `a ? apiPath(...) : apiPath(...)`. Null where the address goes anywhere else: nothing is said there.
 */
function saidBeside(use: BuilderUse): { method: string } | { unreadable: string } | null {
  let node: ts.Node = use.node;
  for (;;) {
    const parent: ts.Node = node.parent;
    if (ts.isTemplateSpan(parent) && ts.isTemplateExpression(parent.parent) && parent.parent.head.text === "" && parent.parent.templateSpans[0] === parent) node = parent.parent;
    else if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent)) node = parent;
    else if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken && parent.left === node) node = parent;
    else if (ts.isConditionalExpression(parent) && (parent.whenTrue === node || parent.whenFalse === node)) node = parent;
    else break;
  }
  const parent = node.parent;
  if (ts.isNewExpression(parent) && calleeOf(parent) === "EventSource" && parent.arguments?.[0] === node) return { method: "GET" };
  if (!ts.isCallExpression(parent)) return null;
  const name = calleeOf(parent);
  if (name === "apiRequest" && parent.arguments[1] === node) {
    const said = written(parent.arguments[0]);
    return said === null ? { unreadable: "apiRequest's method is not written out" } : { method: said.toUpperCase() };
  }
  if (!FETCH_LIKE.has(name) || parent.arguments[0] !== node) return null;
  const options = parent.arguments[1];
  if (!options) return { method: "GET" };
  if (!ts.isObjectLiteralExpression(options)) return { unreadable: `${name}'s options are not written at the call` };
  let method = "GET";
  for (const property of options.properties) {
    if (ts.isSpreadAssignment(property)) return { unreadable: `${name}'s options are spread from elsewhere` };
    if ((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name.getText(tree(use.file)) === "method") {
      const said = ts.isPropertyAssignment(property) ? written(property.initializer) : null;
      if (said === null) return { unreadable: `${name}'s method is not written out` };
      method = said.toUpperCase();
    }
  }
  return { method };
}

/** The built addresses that are the first word of a list: a cached entry's name. */
function keyWords(file: string): BuilderUse[] {
  return builderUses(file).filter((use) => {
    if (use.builder !== "apiPath") return false;
    let node: ts.Node = use.node;
    while (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent)) node = node.parent;
    return ts.isArrayLiteralExpression(node.parent) && node.parent.elements[0] === node;
  });
}

/**
 * Where a file makes a built address longer: `${apiPath(...)}/more`, apiPath(...) + "/more", or the same
 * through a name the file gave it (const base = on ? apiPath(...) : apiPath(...); `${base}/${id}/more`).
 * Only a query or a fragment may follow a built address. A longer address is another route, with a name
 * of its own; made this way it would be one the list has never seen, in a file that spells nothing.
 * A name is followed where it is a plain constant in the same file: not an object's member, and not
 * another file's export.
 */
function extendedAddresses(file: string): string[] {
  const source = tree(file);
  const named = new Set<string>();
  const built = (node: ts.Expression): boolean => {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
    if (ts.isCallExpression(node)) return ts.isIdentifier(node.expression) && node.expression.text === "apiPath";
    if (ts.isConditionalExpression(node)) return built(node.whenTrue) || built(node.whenFalse);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) {
      return built(node.left) || built(node.right);
    }
    return ts.isIdentifier(node) && named.has(node.text);
  };
  // The names this file gives a built address, in the order it declares them.
  const name = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && built(node.initializer)) named.add(node.name.text);
    ts.forEachChild(node, name);
  };
  name(source);
  const morePath = (text: string | null) => text !== null && text.startsWith("/");
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        if (built(span.expression) && morePath(span.literal.text)) found.push(`${at(file, span)}: ${node.getText(source).slice(0, 70)}`);
      }
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && built(node.left)) {
      if (morePath(ts.isTemplateExpression(node.right) ? node.right.head.text : written(node.right))) found.push(`${at(file, node)}: ${node.getText(source).slice(0, 70)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("R1-T10 — the list of API routes a browser calls", () => {
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

describe("R1-T10 — building an address", () => {
  const sample = (type: "number" | "string") => (type === "number" ? 7 : "abc-123_x");
  const build = apiPath as unknown as (key: string, params?: unknown) => string;
  /** What a page can hold where an id should be, and the server could not read as one. */
  const UNUSABLE: Array<[string, unknown]> = [
    ["zero", 0], ["a negative number", -3], ["a fraction", 1.5], ["not a number", Number.NaN], ["infinity", Number.POSITIVE_INFINITY],
    ["a number too large to be exact", Number.MAX_SAFE_INTEGER + 2], ["nothing", undefined], ["null", null], ["empty text", ""],
    ["a list", [22]], ["an object", { id: 22 }], ["true", true],
  ];

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
    expect(apiPath("GET /api/merchants/:id/profile", { id: Number.MAX_SAFE_INTEGER })).toBe("/api/merchants/9007199254740991/profile");
    expect(apiTo("PUT /api/merchants/:id/theme", { id: 22 })).toEqual(["PUT", "/api/merchants/22/theme"]);
    expect(apiTo("POST /api/auth/logout")).toEqual(["POST", "/api/auth/logout"]);
  });

  it("writes a text parameter into one path segment, whatever it holds", () => {
    expect(apiPath("GET /api/pay/t/:token", { token: "a/b c?d#e%" })).toBe("/api/pay/t/a%2Fb%20c%3Fd%23e%25");
    expect(apiPath("GET /api/pay/t/:token", { token: "../admin" })).toBe("/api/pay/t/..%2Fadmin");
    // The ids and tokens the server issues are written as they are.
    for (const issued of ["3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b", "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "AbC_-123xyz", "retail-terminal"]) {
      expect(apiPath("GET /api/pay/t/:token", { token: issued })).toBe(`/api/pay/t/${issued}`);
    }
  });

  it.each(UNUSABLE)("leaves the parameter's own name where %s was given, never an address for something else", (_what, value) => {
    expect(build("GET /api/merchants/:id/profile", { id: value })).toBe("/api/merchants/:id/profile");
    expect(build("GET /api/pay/t/:token", { token: value })).toBe("/api/pay/t/:token");
    // Each parameter on its own: a good one beside it is still written.
    expect(build("PUT /api/merchants/:merchantId/stock-items/:itemId", { merchantId: 22, itemId: value })).toBe("/api/merchants/22/stock-items/:itemId");
    expect(build("PUT /api/merchants/:merchantId/stock-items/:itemId", { merchantId: value, itemId: 5 })).toBe("/api/merchants/:merchantId/stock-items/5");
  });

  it("never throws, whatever it is handed: an address may be worked out while a page is being drawn", () => {
    for (const route of listed) {
      for (const [, value] of UNUSABLE) {
        const params = Object.fromEntries(route.params.map((param) => [param.name, value]));
        // Nothing usable for any parameter: the path as the server registers it.
        expect([route.key, build(route.key, params)]).toEqual([route.key, route.path]);
      }
      expect([route.key, build(route.key)]).toEqual([route.key, route.path]);
    }
    // A parameter left out, one the path does not have, and things that are not parameters at all.
    expect(build("PUT /api/merchants/:merchantId/stock-items/:itemId", { merchantId: 22 })).toBe("/api/merchants/22/stock-items/:itemId");
    expect(build("GET /api/merchants/:id/profile", { id: 22, merchantId: 23 })).toBe("/api/merchants/22/profile");
    expect(build("GET /api/auth/session", { id: 22 })).toBe("/api/auth/session");
    for (const odd of [null, 7, "text", true, [22], () => 22]) expect(build("GET /api/merchants/:id/profile", odd)).toBe("/api/merchants/:id/profile");
    // Only what the page itself handed over is a parameter: nothing inherited.
    expect(build("GET /api/merchants/:id/profile", Object.create({ id: 22 }))).toBe("/api/merchants/:id/profile");
  });

  it("what it leaves in the path is refused by the server's own parsers, and repeats nothing it was given", () => {
    for (const route of listed) {
      for (const param of route.params) {
        const left = `:${param.name}`;
        expect([route.key, strictPositiveIntegerParam(left)]).toEqual([route.key, null]);
        expect([route.key, strictUuidParam(left)]).toEqual([route.key, null]);
        expect([route.key, isTutorialPageKey(left)]).toEqual([route.key, false]);
      }
    }
    // A parameter can be a secret (a link's token) or a mistake: neither is echoed into the address.
    expect(build("GET /api/merchants/:id/profile", { id: -987654321 })).not.toContain("987654321");
    expect(build("GET /api/merchants/:id/profile", { id: { toString: () => "s3cr3t-value" } })).not.toContain("s3cr3t");
    expect(build("GET /api/merchants/:id/profile", { id: 22, note: "s3cr3t-value" })).not.toContain("s3cr3t");
  });
});

describe("R1-T10b — a whole number that reached the page as text", () => {
  const read = wholeNumber as unknown as (value: unknown) => number | null;

  it("is read exactly as the server's own parser reads a path parameter", () => {
    const texts = [
      "1", "22", "9007199254740991", "9007199254740992", "99999999999999999999", "0", "00", "022", "-3", "+3", "1.0", "1.5", "1e3", "0x10",
      " 22", "22 ", "2 2", "22\n", "", " ", "abc", "22abc", "NaN", "Infinity", "undefined", "null", ":id", "\u0662\u0662", "\uff12\uff12",
    ];
    for (const text of texts) expect([text, wholeNumber(text)]).toEqual([text, strictPositiveIntegerParam(text)]);
    expect(wholeNumber("22")).toBe(22);
    expect(wholeNumber("9007199254740991")).toBe(9007199254740991);
    expect(texts.filter((text) => wholeNumber(text) !== null)).toEqual(["1", "22", "9007199254740991"]);
  });

  it("hands a number on for the builder to judge, and reads nothing else as one", () => {
    expect(wholeNumber(22)).toBe(22);
    expect(wholeNumber(-3)).toBe(-3);
    expect(wholeNumber(1.5)).toBe(1.5);
    expect(Number.isNaN(wholeNumber(Number.NaN))).toBe(true);
    for (const other of [null, undefined, true, false, [22], ["22"], { id: 22 }, { toString: () => "22" }, () => 22]) expect(read(other)).toBeNull();
  });

  it("with the builder: the address the text names, or the parameter's own name", () => {
    expect(apiPath("GET /api/admin/merchants/:id", { id: wholeNumber("22") })).toBe("/api/admin/merchants/22");
    expect(apiPath("GET /api/admin/merchants/:id", { id: wholeNumber(22) })).toBe("/api/admin/merchants/22");
    for (const text of ["abc", "022", "22.0", "", "-1", " 22"]) {
      expect([text, apiPath("GET /api/admin/merchants/:id", { id: wholeNumber(text) })]).toEqual([text, "/api/admin/merchants/:id"]);
    }
    expect(apiPath("GET /api/admin/merchants/:id", { id: wholeNumber(-3) })).toBe("/api/admin/merchants/:id");
  });
});

describe("R1-T10b — cache labels", () => {
  it("are these five, with the values every cached entry already has", () => {
    expect(LABELS).toEqual({
      MERCHANTS_KEY: "/api/merchants",
      TRANSACTIONS_KEY: "/api/transactions",
      SPLIT_PAYMENTS_KEY: "/api/split-payments",
      CHECKOUT_RESOLVE_KEY: "/api/checkout/resolve",
      QUOTE_TOKEN_KEY: "/api/trades/quotes/token",
    });
    // And the builder's file holds no other address-like word: the labels and the admin prefix are all of them.
    const constants = [...read("shared/api-path.ts").matchAll(/^export const (\w+) = "(\/api[^"]*)";$/gm)].map((match) => [match[1], match[2]]);
    expect(Object.fromEntries(constants)).toEqual({ ...LABELS, ADMIN_API_PREFIX: "/api/admin" });
    const strings: string[] = [];
    const visit = (node: ts.Node): void => {
      const text = ts.isTemplateExpression(node) ? node.head.text : written(node);
      if (text !== null && text.startsWith("/api")) strings.push(text);
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile("shared/api-path.ts", read("shared/api-path.ts"), ts.ScriptTarget.Latest, true));
    expect([...strings].sort()).toEqual(constants.map(([, value]) => value).sort());
  });

  it("each is the start of a listed route's path, up to its parameter, and none can be fetched as it stands", () => {
    for (const [name, label] of Object.entries(LABELS)) {
      const starts = listed.filter((route) => route.path.startsWith(`${label}/:`));
      expect([name, starts.length > 0]).toEqual([name, true]);
      // The default query function asks the server for a key's first word: a label must not be one it could get.
      expect([name, keys.includes(`GET ${label}`)]).toEqual([name, false]);
    }
  });

  it("a label is only ever the first word of a cached entry's name, never part of an address", () => {
    const elsewhere: string[] = [];
    let uses = 0;
    for (const file of clientSources()) {
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && Object.prototype.hasOwnProperty.call(LABELS, node.text) && !ts.isImportSpecifier(node.parent)) {
          uses += 1;
          let holder: ts.Node = node.parent;
          let inner: ts.Node = node;
          while (ts.isParenthesizedExpression(holder) || ts.isAsExpression(holder)) { inner = holder; holder = holder.parent; }
          if (!ts.isArrayLiteralExpression(holder) || holder.elements[0] !== inner) elsewhere.push(at(file, node));
        }
        ts.forEachChild(node, visit);
      };
      visit(tree(file));
    }
    expect(elsewhere).toEqual([]);
    expect(uses).toBeGreaterThanOrEqual(75);
  });
});

describe("R1-T10 — the admin area's prefix", () => {
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

describe("R1-T10 — where an API address may still be spelled", () => {
  const sources = clientSources();
  const loaded = loadedFiles();

  it("nowhere but in the listed files the app never loads: no other client file spells one", () => {
    // Every file is held, loaded or not; a new file that spells an address fails here, whoever imports it.
    const spelt = sources
      .filter((file) => !(file in NEVER_LOADED))
      .flatMap((file) => spelled(file).filter((address) => !(file in ADMIN_PAGE_USES && address.whole && address.text === ADMIN_PAGE)))
      .map((address) => address.where);
    expect(spelt).toEqual([]);
    expect(sources.length).toBeGreaterThanOrEqual(245);
    // Plain JavaScript files are read too.
    expect(sources.filter((file) => /\.(js|jsx|mjs)$/.test(file)).length).toBeGreaterThanOrEqual(2);
  });

  it("the admin area's own page address is the one exception, in the two files that go to it", () => {
    for (const [file, times] of Object.entries(ADMIN_PAGE_USES)) {
      expect([file, spelled(file).filter((address) => address.whole && address.text === ADMIN_PAGE).length]).toEqual([file, times]);
      expect([file, loaded.has(file)]).toEqual([file, true]);
    }
    // It is a page: the admin area's own router has a route at it, and the server has no route there.
    expect(read("client/src/pages/admin/AdminDashboard.tsx")).toContain('<Route path="/api" component={APIManagement} />');
    expect(Object.keys(ROUTE_POLICY).filter((key) => key.split(" ")[1] === ADMIN_PAGE)).toEqual([]);
  });

  it("the files the app never loads spell what they spelled when they were listed, and are still never loaded", () => {
    for (const [file, times] of Object.entries(NEVER_LOADED)) {
      expect([file, fs.existsSync(path.join(ROOT, file))]).toEqual([file, true]);
      expect([file, spelled(file).length]).toEqual([file, times]);
      expect([file, loaded.has(file)]).toEqual([file, false]);
    }
    expect(Object.keys(NEVER_LOADED)).toHaveLength(12);
    expect(Object.values(NEVER_LOADED).reduce((sum, times) => sum + times, 0)).toBe(97);
  });

  it("the reading of what the app loads reaches every file that names a route", () => {
    // If the reading missed a way of importing, files the app plainly loads would read as never loaded.
    // Every file on the builder is a loaded one, but for the one found to be a page nothing imports.
    const onTheBuilder = sources.filter((file) => builderUses(file).length > 0);
    expect(onTheBuilder.filter((file) => !loaded.has(file))).toEqual(MOVED_AND_NEVER_LOADED);
    expect(onTheBuilder.length).toBeGreaterThanOrEqual(63);
    for (const file of [
      "client/src/main.tsx", "client/src/App.tsx", "client/src/pages/login.tsx", "client/src/lib/session.ts",
      // Reached only through import(), through a re-export, and through a plain JavaScript file.
      "client/src/pages/checkout.tsx", "client/src/pages/admin/MerchantDetail.tsx", "client/src/features/terminal/retail/RetailTerminalViewCore.jsx",
      "client/src/features/terminal/SegmentedBar.tsx", "client/src/components/Stepper.jsx",
    ]) {
      expect([file, loaded.has(file)]).toEqual([file, true]);
    }
    expect(loaded.size).toBeGreaterThanOrEqual(180);
    expect(loaded.size).toBeLessThan(sources.length);
  });

  it("the reading of what a file loads is itself right", () => {
    const loads = (code: string) => {
      const file = "client/src/__probe__.tsx";
      parsed.set(file, ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
      try {
        return importsOf(file);
      } finally {
        parsed.delete(file);
      }
    };
    expect(loads('import App from "./App"; import "./index.css"; import { a, type B } from "@/lib/a";')).toEqual(["./App", "./index.css", "@/lib/a"]);
    expect(loads('export { x } from "./x"; export * from "./y"; export type { T } from "./types";')).toEqual(["./x", "./y"]);
    expect(loads('import type { T } from "./types"; const x: T = 1;')).toEqual([]);
    expect(loads('const load = () => import("@/lib/heavy"); const again = async () => { await import(`./chunk`); };')).toEqual(["@/lib/heavy", "./chunk"]);
    // Declared for lazy loading and rendered: loaded. Declared and never mentioned again: never asked for.
    expect(loads('const Page = lazyWithRetry(() => import("@/pages/page")); const el = <Page />;')).toEqual(["@/pages/page"]);
    expect(loads('const Page = lazy(() => import("@/pages/page")); const routes = [Page];')).toEqual(["@/pages/page"]);
    expect(loads('const Page = lazyWithRetry(() => import("@/pages/page")); const Other = lazy(() => import("@/pages/other")); use(Other);')).toEqual(["@/pages/other"]);
    // Anything but a lazy declaration is followed, used or not.
    expect(loads('const unused = preload(() => import("@/pages/page"));')).toEqual(["@/pages/page"]);
    expect(clientFile("client/src/App.tsx", "@/pages/login")).toBe("client/src/pages/login.tsx");
    expect(clientFile("client/src/features/terminal/retail/RetailTerminalView.tsx", "./RetailTerminalViewCore.jsx")).toBe("client/src/features/terminal/retail/RetailTerminalViewCore.jsx");
    expect(clientFile("client/src/features/terminal/retail/RetailTerminalViewCore.jsx", "../SegmentedBar")).toBe("client/src/features/terminal/SegmentedBar.tsx");
    expect(clientFile("client/src/pages/merchant-signup.tsx", "@/components/Stepper")).toBe("client/src/components/Stepper.jsx");
    expect(clientFile("client/src/main.tsx", "./index.css")).toBeNull();
    expect(clientFile("client/src/main.tsx", "react")).toBeNull();
    expect(clientFile("client/src/pages/login.tsx", "@shared/api-path")).toBeNull();
  });

  it("the guard itself tells an address from a route's name", () => {
    const spelledIn = (code: string) => {
      const file = "client/src/__probe__.tsx";
      parsed.set(file, ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
      try {
        return spelledAddresses(file).length;
      } finally {
        parsed.delete(file);
      }
    };
    for (const address of [
      'fetch("/api/auth/login")', "fetch('/api/auth/login')", "fetch(`/api/auth/login`)", "fetch(`/api/merchants/${id}/profile`)",
      'const base = "/api";', 'x = "/api?y=1"', 'x = "/api#y"', 'const key = ["/api/merchants", id];', 'const image = <img src="/api/x" />;',
      'const image = <img src={`/api/x/${id}`} />;', "fetch(`${apiPath(\"GET /api/x\")}${'/api/y'}`)",
    ]) {
      expect([address, spelledIn(address)]).toEqual([address, 1]);
    }
    for (const fine of [
      'apiPath("POST /api/auth/login")', "apiTo('PUT /api/merchants/:id/theme', { id })", 'fetch(`${apiPath("GET /api/x")}?limit=5`)',
      '// was fetch("/api/auth/login")\nconst x = 1;', '/* ["/api/merchants", id, "profile"] */ const y = 2;', 'const link = <a href="/apiary">bees</a>;',
      'const page = "/settings/api";', 'const words = <p>/api/x</p>;',
    ]) {
      expect([fine, spelledIn(fine)]).toEqual([fine, 0]);
    }
  });
});

describe("R1-T10 — every route the client names", () => {
  const uses = clientSources().flatMap(builderUses);

  it("is written out where it is used: the builder is never handed a name from a variable", () => {
    expect(uses.filter((use) => use.key === null).map((use) => `${at(use.file, use.node)}: ${use.node.getText(tree(use.file)).slice(0, 60)}`)).toEqual([]);
  });

  it("is a listed one, read from the source so a cast past the types is still caught", () => {
    expect(uses.filter((use) => use.key !== null && !keys.includes(use.key)).map((use) => `${at(use.file, use.node)}: ${use.key}`)).toEqual([]);
    expect(uses.length).toBeGreaterThanOrEqual(405);
  });

  it("is called by its own method wherever the call says one beside it", () => {
    // fetch(apiPath("POST …"), { method: "POST", … }): the method is spelled twice there, and must be the route's.
    // (apiTo carries the method itself.) A call that says none is a GET. A call whose method cannot be read
    // where it is made is refused too: write it out there, or take both from apiTo.
    const disagree: string[] = [];
    const unreadable: string[] = [];
    let checked = 0;
    for (const use of uses) {
      if (use.builder !== "apiPath" || use.key === null) continue;
      const said = saidBeside(use);
      if (said === null) continue;
      checked += 1;
      if ("unreadable" in said) unreadable.push(`${at(use.file, use.node)}: ${use.key}: ${said.unreadable}`);
      else if (said.method !== use.key.split(" ")[0]) disagree.push(`${at(use.file, use.node)}: ${use.key} is called with ${said.method}`);
    }
    expect(disagree).toEqual([]);
    expect(unreadable).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(175);
  });

  it("the reading of a call's method is itself right", () => {
    const said = (code: string) => {
      const file = "client/src/__probe__.tsx";
      parsed.set(file, ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
      try {
        return builderUses(file).map((use) => saidBeside(use));
      } finally {
        parsed.delete(file);
      }
    };
    expect(said('fetch(apiPath("GET /api/x"))')).toEqual([{ method: "GET" }]);
    expect(said('sessionFetch(apiPath("POST /api/x"), { method: "post", body })')).toEqual([{ method: "POST" }]);
    expect(said('tradesFetch(`${apiPath("GET /api/x")}?limit=5`, { headers })')).toEqual([{ method: "GET" }]);
    expect(said('propFetch(apiPath("GET /api/x") + query, { method: "DELETE" })')).toEqual([{ method: "DELETE" }]);
    expect(said('fetch(on ? apiPath("PUT /api/x") : apiPath("PUT /api/y"), { method: "PUT" })')).toEqual([{ method: "PUT" }, { method: "PUT" }]);
    expect(said('apiRequest("PATCH", apiPath("PATCH /api/x"), body)')).toEqual([{ method: "PATCH" }]);
    expect(said('new EventSource(apiPath("GET /api/x"))')).toEqual([{ method: "GET" }]);
    // A fetch handed in under the name `request` is read like fetch.
    expect(said('request(apiPath("POST /api/x"), { method: "POST", body })')).toEqual([{ method: "POST" }]);
    expect(said('request(apiPath("POST /api/x"))')).toEqual([{ method: "GET" }]);
    expect(said('fetch(apiPath("POST /api/x"), options)')).toEqual([{ unreadable: "fetch\'s options are not written at the call" }]);
    expect(said('fetch(apiPath("POST /api/x"), { ...options })')).toEqual([{ unreadable: "fetch\'s options are spread from elsewhere" }]);
    expect(said('fetch(apiPath("POST /api/x"), { method })')).toEqual([{ unreadable: "fetch\'s method is not written out" }]);
    expect(said('fetch(apiPath("POST /api/x"), { method: verb })')).toEqual([{ unreadable: "fetch\'s method is not written out" }]);
    expect(said('apiRequest(verb, apiPath("POST /api/x"))')).toEqual([{ unreadable: "apiRequest\'s method is not written out" }]);
    // Handed to anything else, or kept for later: nothing is said beside it.
    expect(said('const address = apiPath("GET /api/x"); load(apiPath("GET /api/y")); const key = [apiPath("GET /api/z")];')).toEqual([null, null, null]);
    expect(said('apiRequest(...apiTo("POST /api/x"), body)')).toEqual([null]);
    // The address inside a later template slot is not the address the call is made to.
    expect(said('fetch(`${base}${apiPath("POST /api/x")}`)')).toEqual([null]);
  });

  it("is a GET route wherever it is the first word of a cached entry's name", () => {
    // A cached entry is named for the address that is asked for it (the default query function gets its
    // first word), and one screen refreshes another's by that word. Named for a POST, it would be an
    // address nothing gets. Nothing is said beside a key, so the method check above does not reach it.
    const words = clientSources().flatMap(keyWords);
    expect(words.filter((use) => use.key !== null && !use.key.startsWith("GET ")).map((use) => `${at(use.file, use.node)}: ${use.key}`)).toEqual([]);
    expect(words.length).toBeGreaterThanOrEqual(120);
  });

  it("the reading of a key's first word is itself right", () => {
    const firstWords = (code: string) => {
      const file = "client/src/__probe__.tsx";
      parsed.set(file, ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
      try {
        return keyWords(file).map((use) => use.key);
      } finally {
        parsed.delete(file);
      }
    };
    expect(firstWords('useQuery({ queryKey: [apiPath("GET /api/x")] })')).toEqual(["GET /api/x"]);
    expect(firstWords('queryClient.invalidateQueries({ queryKey: [apiPath("GET /api/x"), id, "events"] })')).toEqual(["GET /api/x"]);
    expect(firstWords('queryClient.setQueryData([apiPath("POST /api/x")], data)')).toEqual(["POST /api/x"]);
    expect(firstWords('export const KEY = [apiPath("PUT /api/x")] as const;')).toEqual(["PUT /api/x"]);
    expect(firstWords('const key = [(apiPath("DELETE /api/x/:id", { id }) as string), "y"];')).toEqual(["DELETE /api/x/:id"]);
    // Not a key's first word: a later word, an address handed to a request, a request inside a list.
    expect(firstWords('const key = [MERCHANTS_KEY, apiPath("POST /api/x")];')).toEqual([]);
    expect(firstWords('fetch(apiPath("POST /api/x"), { method: "POST" })')).toEqual([]);
    expect(firstWords('await Promise.all([fetch(apiPath("POST /api/x"), { method: "POST" })]);')).toEqual([]);
    expect(firstWords('apiRequest(...apiTo("POST /api/x"), body)')).toEqual([]);
    // A route's method at the head of a list is not an address, so it is nobody's key.
    expect(firstWords('const said = [apiMethod("POST /api/x"), "is how it is called"];')).toEqual([]);
  });

  it("is never made longer: only a query or a fragment may follow a built address", () => {
    // A longer address is another route's, and has its own name. Made by adding to a built one, it would be
    // an address the list has never seen, in a file that spells none.
    expect(clientSources().flatMap(extendedAddresses)).toEqual([]);
  });

  it("the reading of what follows a built address is itself right", () => {
    const longer = (code: string) => {
      const file = "client/src/__probe__.tsx";
      parsed.set(file, ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
      try {
        return extendedAddresses(file).length;
      } finally {
        parsed.delete(file);
      }
    };
    for (const [code, times] of [
      ['fetch(`${apiPath("GET /api/x")}/more`)', 1],
      ['fetch(apiPath("GET /api/x") + "/more")', 1],
      ['fetch(apiPath("GET /api/x") + `/${id}/more`)', 1],
      ['const key = [`${apiPath("GET /api/x")}/${id}`];', 1],
      ['fetch(`${origin}${apiPath("GET /api/x")}/more`)', 1],
      ['fetch(`${(apiPath("GET /api/x") as string)}/more`)', 1],
      // Through a name the file gave it, a choice of two, a fallback, or a second name.
      ['const base = apiPath("GET /api/x"); fetch(`${base}/${id}/events`);', 1],
      ['const base = on ? apiPath("GET /api/x") : apiPath("GET /api/y"); const a = fetch(`${base}/${id}/events`); const b = fetch(base + "/more");', 2],
      ['const base = given || apiPath("GET /api/x"); load(`${base}/more`);', 1],
      ['const base = apiPath("GET /api/x"); const again = base; fetch(again + "/more");', 1],
    ] as Array<[string, number]>) {
      expect([code, longer(code)]).toEqual([code, times]);
    }
    for (const fine of [
      'fetch(`${apiPath("GET /api/x")}?limit=5`)', 'fetch(`${apiPath("GET /api/x")}#top`)', 'fetch(`${apiPath("GET /api/x")}${query}`)',
      'fetch(apiPath("GET /api/x") + query)', 'fetch(apiPath("GET /api/x") + "?a=1")', 'fetch(apiPath("GET /api/x"))',
      'const base = apiPath("GET /api/x"); say(`could not load ${base} today`); fetch(`${base}?page=2`);',
      'const shown = `${window.location.origin}${apiPath("GET /api/x")}`;',
      // A name never given a built address may be followed by anything: it is a page's address, or someone else's.
      'const home = "/settings"; go(`${home}/team`); const cdn = provider.base; load(`${cdn}/js/lib.js`);',
      'const base = apiTo("POST /api/x"); apiRequest(...base, body);',
    ]) {
      expect([fine, longer(fine)]).toEqual([fine, 0]);
    }
  });
});
