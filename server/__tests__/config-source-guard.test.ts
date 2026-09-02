import fs from "fs";
import path from "path";

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
  for (const match of source.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) reads.add(match[1]);
  for (const match of source.matchAll(/process\.env\[([^\]]+)\]/g)) {
    const literal = match[1].match(/^["']([A-Za-z_][A-Za-z0-9_]*)["']$/);
    reads.add(literal?.[1] ?? "<dynamic process.env read>");
  }
  if (/process\.env(?![.\[])/.test(source)) reads.add("<bare process.env>");
  return [...reads].sort();
}

describe("runtime environment-read boundary", () => {
  test("only the config module and reviewed bootstrap seams read process.env", () => {
    const violations: string[] = [];
    for (const absolute of sourceFiles(SERVER_ROOT)) {
      const relative = path.relative(SERVER_ROOT, absolute).replaceAll(path.sep, "/");
      if (relative === "config.ts") continue;
      const allowed = ALLOWLIST[relative] ?? {};
      for (const key of environmentReads(fs.readFileSync(absolute, "utf8"))) {
        if (!allowed[key]) {
          violations.push(`${relative}: ${key}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
