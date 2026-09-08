import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("R0-T6 startup and build side-effect boundaries", () => {
  test("normal application startup never launches or schedules a database dump", () => {
    const source = read("server/index.ts");

    expect(source).not.toMatch(/db-backup\.sh|pg_dump|runBackup/);
    expect(source).not.toMatch(/spawn\s*\(\s*["']bash["']/);
    expect(source).not.toMatch(/setInterval\s*\([^)]*backup/i);
  });

  test("the deployment build performs compilation only", () => {
    const replit = read(".replit");
    const buildLine = replit.match(/^build\s*=.*$/m)?.[0] ?? "";

    expect(buildLine).toBe('build = ["npm", "run", "build"]');
    expect(buildLine).not.toMatch(/migrat|database|backup|seed/i);
  });

  test("database dumps stay ignored and untracked", () => {
    expect(read(".gitignore")).toMatch(/^db-backups\/?$/m);
    const tracked = execFileSync("git", ["ls-files", "-z", "--", "db-backups/"], {
      cwd: process.cwd(), encoding: "utf8",
    }).split("\0").filter(Boolean);

    // Ignored operator backups may exist and must not be deleted to satisfy
    // this gate. Check the Git index, not directory contents; report count only.
    expect(tracked.length).toBe(0);
  });
});
