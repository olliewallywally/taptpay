import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const componentPath = join(
  root,
  "client/src/features/terminal/SegmentedBar.tsx",
);

const verticals = [
  {
    name: "retail",
    path: "client/src/features/terminal/retail/RetailTerminalViewCore.jsx",
    demoPrefix: "retail-mode",
  },
  {
    name: "property",
    path: "client/src/features/terminal/property/PropertyTerminalView.tsx",
    demoPrefix: "property-mode",
  },
  {
    name: "trades",
    path: "client/src/features/terminal/trades/TradesTerminalView.tsx",
    demoPrefix: "trades-mode",
  },
] as const;

const read = (path: string) => readFileSync(join(root, path), "utf8");

function matchingRuleBodies(css: string, selectorPattern: RegExp): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => selectorPattern.test(match[1]))
    .map(match => `${match[1]} {${match[2]}}`);
}

describe("shared SegmentedBar phase-7 contract", () => {
  test.each(verticals)("$name uses the shared bar without retaining a local copy", vertical => {
    const source = read(vertical.path);

    expect(source).toMatch(/import\s+\{[^}]*SegmentedBar[^}]*\}\s+from\s+["']\.\.\/SegmentedBar["']/s);
    expect(source).toMatch(/<SegmentedBar\b/);
    expect(source).not.toMatch(/<div[^>]+className=[^>]+tp-subbar-ind/);
    expect(source).toContain(vertical.demoPrefix);
  });

  test("owns the shared track, indicator, button, and label anatomy", () => {
    const source = readFileSync(componentPath, "utf8");

    for (const className of [
      "tp-subbar-wrap",
      "tp-subbar",
      "tp-subbar-ind",
      "tp-subbar-btn",
      "tp-subbar-label",
    ]) {
      expect(source).toContain(className);
    }

    expect(source).toMatch(/aria-label=\{(?:item\.)?label\}/);
    expect(source).toMatch(/aria-(?:pressed|current)=/);
  });

  test("remeasures the track and buttons after element and font changes", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("ResizeObserver");
    expect(source).toMatch(/\.observe\s*\(\s*track\s*\)/);
    expect(source).toMatch(/buttonRefs\.current/);
    expect(source).toMatch(/\.observe\s*\(\s*(?:button|element|el|node|ref)\s*\)/);
    expect(source).toMatch(/document\.fonts\?*\.ready/);
    expect(source).toContain("requestAnimationFrame");
    expect(source).toMatch(/\.disconnect\s*\(\s*\)/);
  });

  test("keeps the established tutorial/style anchors in every vertical", () => {
    const component = readFileSync(componentPath, "utf8");
    expect(component).toContain("tp-subbar");

    for (const vertical of verticals) {
      const source = read(vertical.path);
      expect(source).toContain("tp-amount");
      expect(source).toMatch(/<SegmentedBar\b/);
    }
  });

  test("defines grid-coupled indicator and button geometry from the shared bar token", () => {
    const styles = [
      "client/src/features/terminal/terminal-tokens.css",
      "client/src/features/terminal/segmented-bar.css",
      "client/src/features/terminal/SegmentedBar.css",
    ]
      .map(path => {
        try {
          return read(path);
        } catch {
          return "";
        }
      })
      .join("\n");

    expect(styles).toMatch(/\.tp-subbar\.tp-bar\s*\{[^}]*display:\s*grid[^}]*height:\s*var\(--bar-h\)[^}]*transform:\s*none/s);
    expect(styles).toMatch(/\.tp-subbar\.tp-bar\s+\.tp-bar-ind\s*\{[^}]*grid-row:\s*1[^}]*grid-column:[^}]*height:\s*auto/s);
    expect(styles).toMatch(/\.tp-subbar\.tp-bar\s+\.tp-bar-btn\s*\{[^}]*grid-row:\s*1[^}]*height:\s*100%/s);
    expect(styles).toMatch(/\.tp-(?:psubbar|send)[^{]*\{[^}]*height:\s*var\(--bar-h\)/s);
  });

  test.each(verticals)("$name removes superseded local bar geometry and motion", vertical => {
    const stylesheet = read(
      `client/src/features/terminal/${vertical.name}/${vertical.name}-terminal-view.css`,
    );
    const subbarRules = matchingRuleBodies(
      stylesheet,
      /\.tp-(?:subbar(?:-ind|-btn)?|psubbar|send(?:-slot)?|split-slot)\b/,
    ).join("\n");

    expect(subbarRules).not.toMatch(/transform:\s*scale\(\s*0\.85\s*\)/);
    expect(subbarRules).not.toMatch(/\.tp-subbar-(?:ind|btn)[^{]*\{[^}]*height:\s*27px/s);
    expect(subbarRules).not.toMatch(/0\.45s\s+cubic-bezier\(\s*0\.34\s*,\s*1\.56\s*,\s*0\.64\s*,\s*1\s*\)/);
    expect(subbarRules).not.toMatch(/\.tp-(?:psubbar|send(?:-slot)?|split-slot)[^{]*\{[^}]*height:\s*37px/s);
  });
});
