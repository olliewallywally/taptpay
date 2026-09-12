import fs from "fs";
import path from "path";
import * as ts from "typescript";

const SERVER_ROOT = path.resolve(__dirname, "..");

const ALLOWLIST: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  "migrate.ts": Object.freeze({
    DATABASE_URL: "Standalone migration CLI must select its database before application bootstrap.",
    JEST_WORKER_ID: "Prevents the migration CLI entry point from executing inside Jest.",
  }),
});

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(absolute);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
  });
}

function environmentReads(source: string): string[] {
  const reads = new Set<string>();
  const file = ts.createSourceFile("guard.ts", source, ts.ScriptTarget.ES2022, true);
  const isAccess = (node: ts.Node): node is ts.PropertyAccessExpression | ts.ElementAccessExpression =>
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
  function unwrap(node: ts.Node): ts.Node {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
      node = node.expression;
    }
    return node;
  }
  function key(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | undefined {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    const argument = unwrap(node.argumentExpression);
    return ts.isStringLiteralLike(argument) ? argument.text : undefined;
  }
  function isProcess(node: ts.Node): boolean {
    node = unwrap(node);
    if (ts.isIdentifier(node)) return node.text === "process";
    if (!isAccess(node) || key(node) !== "process") return false;
    const root = unwrap(node.expression);
    return ts.isIdentifier(root) && (root.text === "globalThis" || root.text === "global");
  }
  function outer(node: ts.Node): ts.Node {
    while (node.parent && unwrap(node.parent) === unwrap(node)) node = node.parent;
    return node;
  }
  function isProcessModule(node: ts.Node | undefined): boolean {
    return !!node && ts.isStringLiteralLike(node) &&
      (node.text === "process" || node.text === "node:process");
  }
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && isProcessModule(node.moduleSpecifier)) {
      reads.add("<process module import>");
      return;
    }
    if (ts.isExternalModuleReference(node) && isProcessModule(node.expression)) {
      reads.add("<process module import>");
      return;
    }
    if (ts.isCallExpression(node) && isProcessModule(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      reads.add("<process module import>");
      return;
    }
    if (isAccess(node) && isProcess(node.expression)) {
      if (key(node) === "env") {
        const reference = outer(node);
        const parent = reference.parent;
        reads.add(parent && isAccess(parent) && parent.expression === reference
          ? key(parent) ?? "<dynamic process.env read>"
          : "<bare process.env>");
      } else if (key(node) === undefined) {
        reads.add("<indirect process access>");
      }
      // The receiver is already accounted for; still inspect a computed key.
      if (ts.isElementAccessExpression(node)) visit(node.argumentExpression);
      return;
    }
    if (isProcess(node)) {
      // Ignore the property name in e.g. object.process; the global root is
      // recognised as a whole expression above. Escaping the process handle
      // (assignment, destructuring, function argument) requires review.
      if (!(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        reads.add("<indirect process access>");
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...reads].sort();
}

function violationsFor(relative: string, source: string): string[] {
  if (relative === "config.ts") return [];
  const allowed = ALLOWLIST[relative] ?? {};
  return environmentReads(source).filter((key) => !Object.hasOwn(allowed, key));
}

describe("runtime environment-read boundary", () => {
  test.each([
    ['process.env.JWT_SECRET', ['JWT_SECRET']],
    ['process.env["JWT_SECRET"]', ['JWT_SECRET']],
    ['process . env . JWT_SECRET', ['JWT_SECRET']],
    ['process["env"]["JWT_SECRET"]', ['JWT_SECRET']],
    ['process?.env?.JWT_SECRET', ['JWT_SECRET']],
    ['(process.env).JWT_SECRET', ['JWT_SECRET']],
    ['((process.env) as NodeJS.ProcessEnv).JWT_SECRET', ['JWT_SECRET']],
    ['process /* gap */ . env.JWT_SECRET', ['JWT_SECRET']],
    ['process.env[`JWT_SECRET`]', ['JWT_SECRET']],
    ['process.env[key]', ['<dynamic process.env read>']],
    ['const environment = process.env;', ['<bare process.env>']],
    ['const { env } = process;', ['<indirect process access>']],
    ['const runtime = process; runtime.env.JWT_SECRET;', ['<indirect process access>']],
    ['globalThis.process.env.JWT_SECRET', ['JWT_SECRET']],
    ['global["process"]["env"].JWT_SECRET', ['JWT_SECRET']],
    ['import { env } from "node:process";', ['<process module import>']],
    ['import runtime from "process";', ['<process module import>']],
    ['const runtime = require("node:process");', ['<process module import>']],
    ['const runtime = await import("node:process");', ['<process module import>']],
    ['import runtime = require("node:process");', ['<process module import>']],
    ['export { env } from "node:process";', ['<process module import>']],
    ['process[key].JWT_SECRET', ['<indirect process access>']],
    ['// process.env.JWT_SECRET\nconst value = config.jwtSecret;', []],
    ['const example = "process.env.JWT_SECRET";', []],
    ['const example = `process.env.JWT_SECRET`;', []],
    ['const example = `value: ${process.env.JWT_SECRET}`;', ['JWT_SECRET']],
    ['process.cwd(); process.exitCode = 1;', []],
  ])("detects executable environment access in %s", (source, expected) => {
    expect(environmentReads(source)).toEqual(expected);
  });

  test("new route/provider/worker reads fail the same gate used by the repository scan", () => {
    for (const file of ["routes.ts", "windcave.ts", "subscription-cron.ts", "middleware/new.ts"]) {
      for (const source of [
        "process.env.DATABASE_URL", 'process["env"].DATABASE_URL',
        'import { env } from "node:process";', "const runtime = process;",
      ]) {
        expect(violationsFor(file, source)).not.toEqual([]);
      }
    }
  });

  test("bootstrap exceptions remain exact file/key pairs, never alias or wildcard permissions", () => {
    expect(violationsFor("config.ts", "loadConfig(process.env)")).toEqual([]);
    expect(violationsFor("migrate.ts", "process.env.DATABASE_URL; process.env.JEST_WORKER_ID")).toEqual([]);
    expect(violationsFor("migrate.ts", 'process["env"].JWT_SECRET')).toEqual(["JWT_SECRET"]);
    expect(violationsFor("migrate.ts", "process.env[key]")).not.toEqual([]);
    expect(violationsFor("migrate.ts", "const env = process.env")).not.toEqual([]);
    expect(violationsFor("migrate.ts", 'import { env } from "node:process"')).not.toEqual([]);
    expect(violationsFor("nested/migrate.ts", "process.env.DATABASE_URL")).not.toEqual([]);
    expect(violationsFor("nested/config.ts", "process.env.DATABASE_URL")).not.toEqual([]);
    expect(violationsFor("routes.ts", "process.env.constructor")).toEqual(["constructor"]);
  });

  test("only the config module and reviewed bootstrap seams read process.env", () => {
    const violations: string[] = [];
    for (const absolute of sourceFiles(SERVER_ROOT)) {
      const relative = path.relative(SERVER_ROOT, absolute).replaceAll(path.sep, "/");
      for (const key of violationsFor(relative, fs.readFileSync(absolute, "utf8"))) {
        violations.push(`${relative}: ${key}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
