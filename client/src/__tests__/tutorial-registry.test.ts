import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  TUTORIAL_PAGE_KEYS,
  isTutorialPageKey,
  type TutorialPageKey,
} from "../../../shared/tutorial";
import {
  TUTORIAL_REGISTRY,
  tutorialStepsForDevice,
} from "../features/tutorial/tutorial-registry";

// Bare element selectors are forbidden as PRIMARY targets: they spotlight
// "the first heading" or "the first button" instead of a real feature, which
// is exactly the mis-targeting this registry exists to avoid.
const GENERIC_TARGET = /^(h[1-6]|button|main|div|section|a|p|span|input|textarea|select|ul|ol|li|img|svg|nav|header|footer|form|label)$/;
const DESKTOP_TARGET = /^\[data-tutorial-id="([^"]+)"\]$/;

const DESKTOP_TUTORIAL_SOURCES: Partial<Record<TutorialPageKey, string>> = {
  "retail-dashboard": "desktop/pages/retail-home.tsx",
  "retail-terminal": "desktop/pages/retail-terminal.tsx",
  "retail-payment-stack": "desktop/pages/retail-terminal.tsx",
  "retail-transactions": "desktop/pages/retail-analytics.tsx",
  "retail-stock": "desktop/pages/retail-stock.tsx",
  "property-dashboard": "desktop/pages/property-home.tsx",
  "property-tenants": "desktop/pages/property-clients.tsx",
  "property-terminal": "desktop/pages/property-terminal.tsx",
  "property-analytics": "desktop/pages/property-analytics.tsx",
  "trades-dashboard": "desktop/pages/trades-home.tsx",
  "trades-clients": "desktop/pages/trades-clients.tsx",
  "trades-terminal": "desktop/pages/trades-terminal.tsx",
  "trades-analytics": "desktop/pages/trades-analytics.tsx",
};

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
        for (const selector of [
          step.target,
          step.fallbackTarget,
          step.desktopTarget,
          step.desktopFallbackTarget,
        ].filter(Boolean) as string[]) {
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

  it("targets a real stable anchor on every bespoke desktop screen", () => {
    for (const [pageKey, relativeSource] of Object.entries(DESKTOP_TUTORIAL_SOURCES) as Array<[TutorialPageKey, string]>) {
      const source = readFileSync(join(__dirname, "..", relativeSource), "utf8");
      for (const step of TUTORIAL_REGISTRY[pageKey].steps) {
        expect(step.desktopTarget).toBeDefined();
        const match = step.desktopTarget!.match(DESKTOP_TARGET);
        expect(match).not.toBeNull();
        expect(source).toContain(`data-tutorial-id="${match![1]}"`);

        if (step.desktopFallbackTarget) {
          const fallback = step.desktopFallbackTarget.match(DESKTOP_TARGET);
          expect(fallback).not.toBeNull();
          expect(source).toContain(`data-tutorial-id="${fallback![1]}"`);
        }
      }
    }
  });

  it("contains the shared Settings restart page", () => {
    expect(TUTORIAL_REGISTRY.settings.steps.some(step =>
      step.target.includes("settings-tutorial-help"),
    )).toBe(true);
  });

  it("merges the payment stack and desktop-only dashboard widgets without adding mobile steps", () => {
    const retailTerminalMobile = tutorialStepsForDevice("retail-terminal", "mobile");
    const retailTerminalDesktop = tutorialStepsForDevice("retail-terminal", "desktop");
    expect(retailTerminalDesktop.map((step) => step.target)).toContain(
      '[data-tutorial-id="retail-terminal-live-payments"]',
    );
    expect(retailTerminalMobile.some((step) => step.desktopOnly)).toBe(false);
    expect(tutorialStepsForDevice("retail-payment-stack", "desktop").map((step) => step.target)).toEqual([
      '[data-tutorial-id="retail-terminal-live-payments"]',
      '[data-tutorial-id="retail-terminal-amount"]',
    ]);

    for (const pageKey of ["retail-dashboard", "property-dashboard", "trades-dashboard"] as const) {
      const desktopOnly = TUTORIAL_REGISTRY[pageKey].steps.filter((step) => step.desktopOnly);
      const mobile = tutorialStepsForDevice(pageKey, "mobile");
      const desktop = tutorialStepsForDevice(pageKey, "desktop");
      expect(desktopOnly.length).toBeGreaterThan(0);
      desktopOnly.forEach((step) => {
        expect(mobile).not.toContain(step);
        expect(desktop.some((candidate) => candidate.title === step.title)).toBe(true);
      });
    }
  });

  it("keeps every mobile step object and order unchanged while resolving desktop copies", () => {
    for (const pageKey of TUTORIAL_PAGE_KEYS) {
      const original = TUTORIAL_REGISTRY[pageKey].steps;
      const expectedMobile = original.filter((step) => !step.desktopOnly);
      const mobile = tutorialStepsForDevice(pageKey, "mobile");

      expect(mobile).toHaveLength(expectedMobile.length);
      expectedMobile.forEach((step, index) => {
        expect(mobile[index]).toBe(step);
      });

      for (const deviceClass of ["tablet", "desktop"] as const) {
        const resolved = tutorialStepsForDevice(pageKey, deviceClass);
        expect(resolved).toHaveLength(original.length);
        resolved.forEach((step, index) => {
          expect(step).not.toBe(original[index]);
          expect(step.target).toBe(original[index].desktopTarget ?? original[index].target);
          expect(step.fallbackTarget).toBe(
            original[index].desktopFallbackTarget ?? original[index].fallbackTarget,
          );
          expect(step.body).toBe(original[index].desktopBody ?? original[index].body);
        });
      }
    }
  });
});
