import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const LEGACY_KEYS = new Set(["authToken", "adminAuthToken", "auth-token", "admin-token"]);
const SESSION_MODULE = "client/src/lib/session.ts";

function violations(file: string, code: string): string[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /^(jsonwebtoken|jwt-decode)$/.test(node.moduleSpecifier.text)) found.add("account JWT import");
    if (ts.isStringLiteralLike(node)) {
      if (node.text.toLowerCase() === "authorization") found.add("Authorization header");
      if (LEGACY_KEYS.has(node.text) && file !== SESSION_MODULE) found.add("stored account credential key");
    }
    if ((ts.isPropertyAccessExpression(node) || ts.isPropertyAssignment(node))
      && node.name?.getText(source).replace(/["']/g, "").toLowerCase() === "authorization") {
      found.add("Authorization header");
    }
    const method = ts.isCallExpression(node)
      ? ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text
        : ts.isElementAccessExpression(node.expression) && ts.isStringLiteralLike(node.expression.argumentExpression)
          ? node.expression.argumentExpression.text : undefined
      : undefined;
    if (ts.isCallExpression(node) && method && ["getItem", "setItem"].includes(method)) {
      const key = node.arguments[0];
      if (key && ts.isStringLiteralLike(key) && (LEGACY_KEYS.has(key.text) || ["user", "merchantId", "adminUser"].includes(key.text))) {
        found.add("account state in browser storage");
      }
      // This module's only stored value is the credential-free pending sign-out mark; legacy keys
      // may only be removed. A variable argument cannot bypass the key check here.
      if (file === SESSION_MODULE && key?.getText(source) !== "SIGN_OUT_PENDING_KEY") {
        found.add("session module stores more than the sign-out mark");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found].sort();
}

function productionClientFiles(dir = "client/src"): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : productionClientFiles(file);
    return /\.[jt]sx?$/.test(file) && !/\.(test|spec)\.[jt]sx?$/.test(file) ? [file] : [];
  });
}

describe("R1-T4 E3 — account credentials stay out of page scripts", () => {
  test("production client has no account bearer header, JWT reader or stored account credential", () => {
    const found = productionClientFiles().flatMap((file) => violations(file, fs.readFileSync(file, "utf8"))
      .map((rule) => `${file}: ${rule}`));
    expect(found).toEqual([]);
  });

  test.each([
    'localStorage.getItem("authToken")',
    'window.sessionStorage.setItem("adminAuthToken", value)',
    'window.localStorage["setItem"]("user", value)',
    'const key = "auth-token"; localStorage.getItem(key)',
    'fetch(url, { headers: { Authorization: value } })',
    'new Headers().set("authorization", value)',
    'headers.authorization = value',
    'import jwt from "jsonwebtoken"',
    'import { jwtDecode } from "jwt-decode"',
  ])("detects a reintroduced credential path: %s", (code) => {
    expect(violations("client/src/pages/example.tsx", code).length).toBeGreaterThan(0);
  });

  test("only the removal of old keys and the pending sign-out mark are allowed in the session module", () => {
    expect(violations(SESSION_MODULE, 'const keys = ["authToken", "adminAuthToken"]; keys.forEach(key => localStorage.removeItem(key))')).toEqual([]);
    expect(violations(SESSION_MODULE, 'localStorage.setItem(SIGN_OUT_PENDING_KEY, "1"); localStorage.getItem(SIGN_OUT_PENDING_KEY)')).toEqual([]);
    expect(violations(SESSION_MODULE, 'localStorage.setItem(key, secret)')).not.toEqual([]);
    expect(violations(SESSION_MODULE, 'sessionStorage.getItem(key)')).not.toEqual([]);
    expect(violations("client/src/pages/example.tsx", 'localStorage.setItem("taptMode", "retail")')).toEqual([]);
  });

  test("the server no longer issues or verifies account JWTs", () => {
    for (const file of ["server/auth.ts", "server/routes.ts"]) {
      const code = fs.readFileSync(path.resolve(file), "utf8");
      expect(code).not.toMatch(/(?:from\s*["']jsonwebtoken["']|\b(?:generateToken|verifyToken|issueTokenForUserId|tokenForUserRow)\b)/);
    }
  });
});
