import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Owner decision 2026-09-27 (docs/decisions/2026-09-27-r1-t3-owner-answers.md, answer 2): the old
 * /smart-terminal page is removed. It rendered the retail terminal's screens (no data) to anyone,
 * signed in or not, with no guard; nothing linked to it, and its component (SmartTransitions, a
 * compatibility wrapper) was used nowhere else. The real terminal at /terminal is unchanged.
 */
const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("the old /smart-terminal page", () => {
  it("is routed nowhere, and its component is gone", () => {
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    expect(app).not.toMatch(/["']\/smart-terminal["']/);
    expect(app).not.toMatch(/SmartTransitions/);
    expect(existsSync(join(SRC, "components", "SmartTransitions.jsx"))).toBe(false);
    expect(existsSync(join(SRC, "components", "SmartTransitions.d.ts"))).toBe(false);
  });

  it("is named by no screen", () => {
    const named = sourceFiles(SRC).filter((file) => /\/smart-terminal|SmartTransitions/.test(readFileSync(file, "utf8")));
    expect(named).toEqual([]);
  });

  it("left the real terminal routed, behind the sign-in guard", () => {
    const app = readFileSync(join(SRC, "App.tsx"), "utf8");
    expect(app).toMatch(/<Route path="\/terminal">\s*<ProtectedRoute/);
  });
});
