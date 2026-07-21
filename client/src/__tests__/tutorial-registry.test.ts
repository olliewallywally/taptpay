import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { TUTORIAL_PAGE_KEYS, isTutorialPageKey } from "../../../shared/tutorial";
import { TUTORIAL_REGISTRY } from "../features/tutorial/tutorial-registry";

// Bare element selectors are forbidden as PRIMARY targets: they spotlight
// "the first heading" or "the first button" instead of a real feature, which
// is exactly the mis-targeting this registry exists to avoid.
const GENERIC_TARGET = /^(h[1-6]|button|main|div|section|a|p|span|input|textarea|select|ul|ol|li|img|svg|nav|header|footer|form|label)$/;

function collectSource(): string {
  const root = join(__dirname, "..");
  let out = "";
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        walk(full);
      } else if (/\.(tsx|jsx|ts)$/.test(entry.name)) {
        out += readFileSync(full, "utf8");
      }
    }
  };
  walk(root);
  return out;
}

describe("merchant tutorial registry", () => {
  it("defines a walkthrough for every server-approved merchant page", () => {
    expect(Object.keys(TUTORIAL_REGISTRY).sort()).toEqual([...TUTORIAL_PAGE_KEYS].sort());
  });

  it("keeps page keys unique and rejects unregistered routes", () => {
    expect(new Set(TUTORIAL_PAGE_KEYS).size).toBe(TUTORIAL_PAGE_KEYS.length);
    expect(isTutorialPageKey("retail-dashboard")).toBe(true);
    expect(isTutorialPageKey("/dashboard")).toBe(false);
    expect(isTutorialPageKey("admin")).toBe(false);
  });

  it("gives every page concise, targetable tutorial content", () => {
    for (const pageKey of TUTORIAL_PAGE_KEYS) {
      const definition = TUTORIAL_REGISTRY[pageKey];
      expect(definition.label.trim().length).toBeGreaterThan(0);
      expect(definition.steps.length).toBeGreaterThanOrEqual(2);
      expect(definition.steps.length).toBeLessThanOrEqual(6);

      for (const step of definition.steps) {
        expect(step.target.trim().length).toBeGreaterThan(0);
        expect(step.tag.trim().length).toBeGreaterThan(0);
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("never uses a bare generic element as a primary target", () => {
    for (const pageKey of TUTORIAL_PAGE_KEYS) {
      for (const step of TUTORIAL_REGISTRY[pageKey].steps) {
        expect(step.target.trim()).not.toMatch(GENERIC_TARGET);
      }
    }
  });

  it("only references data-tutorial-id anchors that exist in the source", () => {
    const source = collectSource();
    const missing: string[] = [];
    for (const pageKey of TUTORIAL_PAGE_KEYS) {
      for (const step of TUTORIAL_REGISTRY[pageKey].steps) {
        for (const selector of [step.target, step.fallbackTarget].filter(Boolean) as string[]) {
          const match = selector.match(/\[data-tutorial-id="([^"]+)"\]/);
          if (!match) continue;
          const id = match[1];
          // The anchor is rendered either directly (data-tutorial-id="id")
          // or via a section component's `anchor="id"` prop.
          if (!source.includes(`data-tutorial-id="${id}"`) && !source.includes(`anchor="${id}"`)) {
            missing.push(`${pageKey}: ${id}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("contains the shared Settings restart page", () => {
    expect(TUTORIAL_REGISTRY.settings.steps.some(step =>
      step.target.includes("settings-tutorial-help"),
    )).toBe(true);
  });
});
