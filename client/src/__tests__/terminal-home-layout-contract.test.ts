import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const verticals = [
  {
    name: "retail",
    source: "client/src/features/terminal/retail/RetailTerminalViewCore.jsx",
    homes: 2,
  },
  {
    name: "property",
    source: "client/src/features/terminal/property/PropertyTerminalView.tsx",
    homes: 1,
  },
  {
    name: "trades",
    source: "client/src/features/terminal/trades/TradesTerminalView.tsx",
    homes: 1,
  },
] as const;

const topologyClasses = (source: string): string[] =>
  [...source.matchAll(/className=["'{`]([^"'`}]*\btp-screen\b[^"'`}]*?)["'`}]/g)]
    .map(match => match[1]);

describe("terminal home layout phase-8 contract", () => {
  test("grids only the home topology with measured chrome and a three-row stack floor", () => {
    const css = read("client/src/features/terminal/terminal-tokens.css")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const homeRule = css.match(/\.tp-viewport\s+\.tp-screen\.tp-home\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(homeRule).toMatch(/display:\s*grid/);
    expect(homeRule).toMatch(/grid-template-rows:[^;]*var\(--hero-min\)[^;]*var\(--hero-pref\)[^;]*var\(--chrome-gutter\)[^;]*var\(--stack-min\)/s);
    expect(homeRule).toMatch(/padding-bottom:\s*calc\([^;]*var\(--dock-h[^;]*var\(--safe-bottom\)[^;]*var\(--sp-3\)/s);
    expect(css).toMatch(/--stack-min:\s*calc\(\s*3\s*\*\s*var\(--row-h\)\s*\+\s*var\(--stack-hdr-h\)\s*\+\s*2px\s*\)/);

    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim();
      const subject = selector.split(/\s+|>|\+|~/).filter(Boolean).pop() ?? "";
      if (!/(^|\.)tp-screen\b/.test(subject) || /\.tp-(?:home|feature|plain)\b/.test(subject)) continue;
      expect({ selector, body: match[2] }).not.toEqual(expect.objectContaining({
        body: expect.stringMatching(/(?:display:\s*grid|grid-template|grid-auto|grid-area)/),
      }));
    }
  });

  test("the shared hook measures the rendered overlay and publishes the home-local token", () => {
    const hook = read("client/src/features/terminal/useMeasuredChromeGutter.ts");

    expect(hook).toContain("ResizeObserver");
    expect(hook).toContain("--chrome-gutter");
    expect(hook).toMatch(/\.style\.setProperty\s*\(\s*["']--chrome-gutter["']/);
    expect(hook).toMatch(/viewportRef\.current/);
    expect(hook).toMatch(/\.tp-(?:pfab|psubbar)\.show/);
    expect(hook).toMatch(/getBoundingClientRect\(\)\.height/);
    expect(hook).toMatch(/\.observe\s*\(/);
    expect(hook).toMatch(/\.disconnect\s*\(\s*\)/);
  });

  test.each(verticals)("$name wires every home to the shared measurement contract", vertical => {
    const source = read(vertical.source);
    const screens = topologyClasses(source);

    expect(screens.filter(classes => /\btp-home\b/.test(classes))).toHaveLength(vertical.homes);
    expect(source).toMatch(/import\s+\{[^}]*useMeasuredChromeGutter[^}]*\}\s+from\s+["']\.\.\/useMeasuredChromeGutter["']/s);
    expect(source).toMatch(/useMeasuredChromeGutter\s*\(\s*viewportRef\s*,/);
    expect(source).toMatch(/ref=\{viewportRef\}/);
  });

  test("stack headers are siblings before the scrolling row region", () => {
    const retail = read(verticals[0].source);
    expect(retail).not.toMatch(/className=["']tp-stack-scroll["'][^>]*>\s*<Stack\b/);

    for (const vertical of verticals.slice(1)) {
      const source = read(vertical.source);
      const header = source.indexOf('className="tp-stack-title"');
      const scroll = source.indexOf('className="tp-stack-scroll"');
      expect({ vertical: vertical.name, headerBeforeScroll: header >= 0 && header < scroll })
        .toEqual({ vertical: vertical.name, headerBeforeScroll: true });
    }
  });
});
