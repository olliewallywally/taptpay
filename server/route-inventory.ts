/**
 * R1-T2 — source inventory of every Express registration on `app`.
 *
 * AST-based (TypeScript compiler API), not regex: the 2026-08-29 correction
 * register on this remediation records that an earlier regex-based count
 * missed the five `app.all(...)` registrations. Walking the parsed AST for
 * every `app.<method>(...)` call, regardless of formatting or nesting,
 * closes that specific class of miss.
 *
 * This module is imported BOTH by the one-off generator
 * (scripts/generate-route-policy.ts, which writes server/route-policy.ts and
 * the documentation table) and by the completeness-gate test
 * (server/__tests__/route-policy-inventory.test.ts, which re-parses the
 * source fresh on every run) — so a route added to server/routes.ts without
 * a matching server/route-policy.ts entry is caught immediately, not only
 * when someone remembers to regenerate.
 */
import * as ts from "typescript";
import fs from "fs";

export type HttpRegistrationMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";

export interface RouteRegistration {
  method: HttpRegistrationMethod;
  path: string;
  /** 1-based source line, for humans regenerating the table. */
  line: number;
}

export interface MiddlewareUse {
  /** The mount path, or null for a path-less app.use(fn). */
  path: string | null;
  /** true when the argument looks like a mounted Router (an Identifier, not an inline function). */
  looksLikeMountedRouter: boolean;
  line: number;
}

export interface SourceInventory {
  registrations: RouteRegistration[];
  uses: MiddlewareUse[];
}

const ROUTE_METHODS: Record<string, HttpRegistrationMethod> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  all: "ALL",
};

/**
 * @param appIdentifier the local variable name the app/router is bound to —
 * "app" for server/routes.ts's `registerRoutes(app: Express)`.
 */
export function extractSourceInventory(
  sourceText: string,
  fileName: string,
  appIdentifier = "app",
): SourceInventory {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const registrations: RouteRegistration[] = [];
  const uses: MiddlewareUse[] = [];

  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === appIdentifier
    ) {
      const prop = node.expression.name.text;
      const firstArg = node.arguments[0];

      if (prop in ROUTE_METHODS) {
        if (firstArg && ts.isStringLiteralLike(firstArg)) {
          registrations.push({ method: ROUTE_METHODS[prop], path: firstArg.text, line: lineOf(node) });
        }
      } else if (prop === "use") {
        if (firstArg && ts.isStringLiteralLike(firstArg)) {
          const second = node.arguments[1];
          uses.push({
            path: firstArg.text,
            looksLikeMountedRouter: !!second && ts.isIdentifier(second),
            line: lineOf(node),
          });
        } else {
          uses.push({ path: null, looksLikeMountedRouter: false, line: lineOf(node) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { registrations, uses };
}

export function extractSourceInventoryFromFile(filePath: string, appIdentifier = "app"): SourceInventory {
  return extractSourceInventory(fs.readFileSync(filePath, "utf8"), filePath, appIdentifier);
}

export function registrationKey(method: string, path: string): string {
  return `${method} ${path}`;
}

/**
 * Known gate/guard identifiers this repo already uses, detected as plain
 * substring matches in the slice of source between one `app.<method>(` call
 * and the next (the same slicing technique server/__tests__/subscription-route-security.test.ts
 * already uses to isolate one handler's body). This is deliberately a
 * mechanical marker list, not a semantic classifier — see server/route-policy.ts's
 * header for what it does and does not assert.
 */
export const KNOWN_GATE_MARKERS = [
  "authenticateToken",
  "authorizeCronRequest",
  "authenticateApiKey",
  "requireEcommerceApi",
  "checkMerchantOwnership",
  "checkAccountOwnership",
  "isAccountOwner",
  "req.user?.role === \"admin\"",
  "req.user?.role !== \"admin\"",
  "req.user.role === 'admin'",
  "req.user.role !== 'admin'",
] as const;

export function detectGateMarkers(handlerSlice: string): string[] {
  return KNOWN_GATE_MARKERS.filter((marker) => handlerSlice.includes(marker));
}

/** Slices from one registration's start line to just before the next `app.` call, for marker detection. */
export function sliceHandlerBodies(sourceText: string, registrations: RouteRegistration[]): string[] {
  const lines = sourceText.split("\n");
  const starts = registrations
    .map((r) => r.line - 1)
    .sort((a, b) => a - b);
  return registrations.map((r) => {
    const startLine = r.line - 1;
    const nextStart = starts.find((s) => s > startLine) ?? lines.length;
    return lines.slice(startLine, nextStart).join("\n");
  });
}
