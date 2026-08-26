import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("terminal amount fitting contract", () => {
  test("shared CSS fits from characters and retains an observer fallback", () => {
    const css = read("features/terminal/terminal-tokens.css");
    expect(css).toContain("--amount-k: 1.5");
    expect(css).toContain("var(--amount-chars, 6)");
    expect(css).toContain("var(--amount-authored, var(--amount-max))");
    expect(css).toContain("var(--fit, 1)");
    expect(css).toContain("white-space: nowrap");
  });

  test("fallback reacts to size, text, and late font changes", () => {
    const hook = read("features/terminal/useFitTerminalAmounts.ts");
    expect(hook).toContain("new ResizeObserver(fit)");
    expect(hook).toContain("new MutationObserver(fit)");
    expect(hook).toContain("document.fonts?.ready.then(fit)");
    expect(hook).toContain("Math.max(FIT_FLOOR, available / required)");
  });
});
