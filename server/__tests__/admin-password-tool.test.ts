import { spawnSync } from "node:child_process";
import bcrypt from "bcrypt";

/**
 * Owner report 2026-09-23: admin sign-in was off in development because ADMIN_PASSWORD_HASH
 * was set nowhere. `npm run admin:password` makes the value: the owner types a new password
 * twice in the Replit Shell, unseen, and pastes the printed hash into Secrets. The password
 * never passes through chat or a command line. Piped input stands in for the keyboard here.
 */

jest.setTimeout(60_000);

function runTool(input: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/set-admin-password.ts"], {
    input,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ADMIN_EMAIL: "admin@harness.test" },
  });
}
const hashIn = (output: string) => output.split("\n").map((line) => line.trim()).find((line) => /^\$2[aby]\$\d{2}\$/.test(line));

it("prints a cost-12 bcrypt hash of the password typed twice, and says where it goes", () => {
  const run = runTool("Admin-password-1\nAdmin-password-1\n");

  expect(run.status).toBe(0);
  const hash = hashIn(run.stdout);
  expect(hash).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
  expect(bcrypt.compareSync("Admin-password-1", hash!)).toBe(true);
  expect(run.stdout).toContain("ADMIN_PASSWORD_HASH");
  expect(run.stdout).toContain("admin@harness.test");
  expect(run.stdout).not.toContain("Admin-password-1");
});

it("refuses when the two entries differ, printing no hash", () => {
  const run = runTool("Admin-password-1\nAdmin-password-2\n");

  expect(run.status).not.toBe(0);
  expect(hashIn(run.stdout)).toBeUndefined();
  expect(run.stderr).toContain("did not match");
});

it("refuses a password that breaks the rule, and says the rule", () => {
  const run = runTool("password\npassword\n");

  expect(run.status).not.toBe(0);
  expect(hashIn(run.stdout)).toBeUndefined();
  expect(run.stderr).toContain("Use at least 8 characters, including a capital letter and a number or symbol.");
});
