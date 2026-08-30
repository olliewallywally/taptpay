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
    expect(homeRule).toMatch(/grid-template-rows:[^;]*var\(--hero-min\)[^;]*var\(--home-hero-pref\)[^;]*var\(--chrome-gutter\)[^;]*var\(--stack-min\)/s);
    /* The dock clearance is padding on the STACK, not on the screen — putting
       it on the screen left the reserved band painting in the viewport's navy
       instead of the stack's off-white. Row 3's minimum carries the same token
       so §4.3's vertical budget is unchanged. */
    expect(homeRule).not.toMatch(/padding-bottom/);
    expect(homeRule).toMatch(/minmax\(\s*calc\(\s*var\(--stack-min\)\s*\+\s*var\(--dock-clear\)\s*\+\s*var\(--stack-gap\)\s*\)\s*,\s*1fr\)/s);
    /* --dock-h-max, not --dock-h: the morph republishes the live height per
       frame, and a grid track minimum that tracks it re-solves the home grid
       every frame (§9.F clause 7's 32ms budget, measured at 34-36ms). */
    expect(css).toMatch(/--dock-clear:\s*calc\([^;]*var\(--dock-h-max[^;]*var\(--safe-bottom\)[^;]*var\(--sp-3\)/s);
    const stackRule = css.match(/\.tp-viewport\s+\.tp-home-stack\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(stackRule).toMatch(/padding-bottom:\s*var\(--dock-clear\)/);
    /* The gap between the floating bar and the stack's header is reserved the
       same way: padding inside the off-white, and added to row 3's minimum so
       it does not come out of the three rows. */
    expect(stackRule).toMatch(/padding-top:\s*var\(--stack-gap\)/);
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
    expect(hook).toMatch(/getBoundingClientRect\(\)/);
    /* The gutter is derived from each overlay's own height and transform, never
       from the hero's live rect. `chromeBottom - heroBottom` reads a position
       that resolves against the --home-hero-h this hook published on an earlier
       frame, so it lags the hero it is compared against and the gutter it
       yields changes the grid that sizes the hero — a loop that converged on a
       128px and then a 70px gutter against a 106px bar on property @390x844. */
    expect(hook).toMatch(/DOMMatrixReadOnly/);
    expect(hook).not.toMatch(/\.bottom\s*-\s*heroRect\.bottom/);
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
