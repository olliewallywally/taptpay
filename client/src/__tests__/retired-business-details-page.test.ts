import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 4):
 * the old /business-details page is removed, with the server routes only it used. Nothing had
 * linked to it since sign-up stopped handing out account numbers (2026-09-23); it asked the
 * server about a sign-up by that number.
 */
const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("the old business-details page", () => {
  it("is routed nowhere, and its file is gone", () => {
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    expect(app).not.toMatch(/["']\/business-details["']/);
    expect(app).not.toMatch(/@\/pages\/business-details/);
    expect(existsSync(join(SRC, "pages", "business-details.tsx"))).toBe(false);
  });

  it("left no screen asking the server about a sign-up by its account number", () => {
    const files = sourceFiles(SRC).map((file) => [file, readFileSync(file, "utf8")] as const);
    const named = files.filter(([, text]) => /email-status|\/business-details/.test(text));
    const resendByNumber = files.filter(
      ([, text]) => text.includes("/api/auth/resend-confirmation") && /merchantId/.test(text),
    );
    expect(named.map(([file]) => file)).toEqual([]);
    expect(resendByNumber.map(([file]) => file)).toEqual([]);
  });
});
