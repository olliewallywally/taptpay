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
  // T10b, batch 1: Settings, on the phone and on tablet and desktop, and what they share.
  "client/src/pages/settings.tsx",
  "client/src/desktop/DesktopSettingsPage.tsx",
  "client/src/hooks/use-billing-card-return.ts",
  "client/src/lib/merchant.ts",
  // T10b, batch 2: retail. The terminals, home, analytics, stock, transactions, the payment stack, boards.
  "client/src/pages/merchant-terminal-mobile-v2.tsx",
  "client/src/desktop/pages/retail-terminal.tsx",
  "client/src/desktop/pages/retail-analytics.tsx",
  "client/src/desktop/pages/retail-home.tsx",
  "client/src/desktop/pages/retail-stock.tsx",
  "client/src/pages/stock-management.tsx",
  "client/src/pages/transactions.tsx",
  "client/src/pages/dashboard.tsx",
  "client/src/components/reports/RetailReportsButton.tsx",
  "client/src/pages/board-builder.tsx",
  "client/src/components/qr-code-display.tsx",
  "client/src/pages/payment-stack.tsx",
  // T10b, batch 3: property. Both terminals, the tenant pages, the lists they share, the desktop profile panel.
  "client/src/pages/property/property-terminal.tsx",
  "client/src/desktop/pages/property-terminal.tsx",
  "client/src/pages/property/tenant-directory.tsx",
  "client/src/pages/property/tenant-profile.tsx",
  "client/src/lib/property-data.ts",
  "client/src/desktop/DesktopDirectoryProfile.tsx",
  "client/src/desktop/pages/property-clients.tsx",
];
/** Text that is an API address or the start of one: /api itself, or /api followed by a path, a query or a fragment. */
const ADDRESS_START = /^\/api(?:[/?#]|$)/;

/** The cache labels (shared/api-path.ts): the first word of a cached entry's name that is not an address. */
const LABELS: Record<string, string> = { MERCHANTS_KEY, TRANSACTIONS_KEY, SPLIT_PAYMENTS_KEY, CHECKOUT_RESOLVE_KEY, QUOTE_TOKEN_KEY };

/** Calls that take an address first and, like fetch, say their method in the options after it. */
const FETCH_LIKE = new Set(["fetch", "sessionFetch", "tradesFetch", "propFetch", "authFetch"]);
const BUILDERS = new Set(["apiPath", "apiTo", "apiMethod"]);

const parsed = new Map<string, ts.SourceFile>();
/** A client source file's syntax tree: the checks below read calls from it, not from the text. */
function tree(file: string): ts.SourceFile {
  if (!parsed.has(file)) parsed.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
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
function spelledAddresses(file: string): string[] {
  const spelled: string[] = [];
  const visit = (node: ts.Node): void => {
    const text = ts.isTemplateExpression(node) ? node.head.text : written(node);
    if (text !== null && ADDRESS_START.test(text)) spelled.push(`${at(file, node)}: ${node.getText(tree(file)).slice(0, 60)}`);
    ts.forEachChild(node, visit);
  };
  visit(tree(file));
  return spelled;
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
    expect(uses).toBeGreaterThanOrEqual(60);
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

describe("R1-T10 — the pages moved onto the builder", () => {
  it("spell no API address themselves", () => {
    expect(MIGRATED.flatMap(spelledAddresses)).toEqual([]);
  });

  it("are real files, each listed once, and each uses the builder", () => {
    expect(new Set(MIGRATED).size).toBe(MIGRATED.length);
    for (const file of MIGRATED) {
      expect([file, fs.existsSync(path.join(ROOT, file))]).toEqual([file, true]);
      expect([file, /\bapi(?:Path|To)\(/.test(read(file))]).toEqual([file, true]);
    }
    expect(MIGRATED.length).toBeGreaterThanOrEqual(35);
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
    expect(uses.length).toBeGreaterThanOrEqual(205);
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
    expect(checked).toBeGreaterThanOrEqual(95);
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
