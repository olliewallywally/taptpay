import fs from "fs";
import path from "path";

const SERVER_ROOT = path.resolve(__dirname, "..");

/**
 * R1-T6's completion gate: "zero parseInt(req.params or parseInt(req.query in
 * production route code, source guards active, and every generated
 * execution-baseline site migrated or explicitly typed by a reviewed schema."
 *
 * There is deliberately NO allowlist. The tracker's gap 6 is explicit — "Do not
 * add an allowlist that silently weakens the requirement" — so a new permissive
 * parse has to be migrated, not registered as an exception. The strict helpers
 * live in server/http-params.ts and cover every shape these routes need:
 * strictPositiveIntegerParam, strictPositiveIntegerQueryParam,
 * strictBoundedIntegerQueryParam and strictUuidParam.
 *
 * Structure copied from config-source-guard.test.ts, including its recursive
 * walk that descends into server/middleware/ and skips only __tests__.
 */
function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(absolute);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
  });
}

/**
 * Each pattern is a way a request value has actually reached a permissive
 * numeric conversion in this codebase — every one of them was a real site
 * before R1-T6 migrated it, not a hypothetical.
 */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = Object.freeze([
  ["parseInt(req.params", /\bparseInt\s*\(\s*req\.params/g],
  ["parseInt(req.query", /\bparseInt\s*\(\s*req\.query/g],
  ["Number(req.params", /\bNumber\s*\(\s*req\.params/g],
  ["Number(req.query", /\bNumber\s*\(\s*req\.query/g],
  // The String(...) wrapper hid several sites from a literal grep, and turned
  // "?limit=abc" into NaN that reached storage rather than a 400.
  ["parseInt(String(req.params", /\bparseInt\s*\(\s*String\s*\(\s*req\.params/g],
  ["parseInt(String(req.query", /\bparseInt\s*\(\s*String\s*\(\s*req\.query/g],
]);

function permissiveParses(source: string): string[] {
  const found = new Set<string>();
  for (const [label, pattern] of FORBIDDEN) {
    if (new RegExp(pattern.source).test(source)) found.add(label);
  }
  return [...found].sort();
}

describe("R1-T6 strict request-parameter parsing boundary", () => {
  test("no production server code parses a request parameter permissively", () => {
    const violations: string[] = [];
    for (const absolute of sourceFiles(SERVER_ROOT)) {
      const relative = path.relative(SERVER_ROOT, absolute).replaceAll(path.sep, "/");
      for (const label of permissiveParses(fs.readFileSync(absolute, "utf8"))) {
        violations.push(`${relative}: ${label}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("the guard actually detects each shape it claims to", () => {
    // A guard that cannot fail proves nothing, so exercise every pattern.
    const samples = [
      "const id = parseInt(req.params.id);",
      "const size = parseInt(req.query.size as string);",
      "const id = Number(req.params.id);",
      "const size = Number(req.query.size);",
      "const id = parseInt(String(req.params.id));",
      'const limit = parseInt(String(req.query.limit ?? "50"));',
    ];
    for (const sample of samples) {
      expect(permissiveParses(sample)).not.toEqual([]);
    }
    expect(permissiveParses("const id = strictPositiveIntegerParam(req.params.id);")).toEqual([]);
  });
});
