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
  settings: "desktop/DesktopSettingsPage.tsx",
  "property-dashboard": "desktop/pages/property-home.tsx",
  "property-tenants": "desktop/pages/property-clients.tsx",
  "property-terminal": "desktop/pages/property-terminal.tsx",
  "property-analytics": "desktop/pages/property-analytics.tsx",
  "trades-dashboard": "desktop/pages/trades-home.tsx",
  "trades-clients": "desktop/pages/trades-clients.tsx",
  "trades-terminal": "desktop/pages/trades-terminal.tsx",
  "trades-quote": "desktop/pages/trades-terminal.tsx",
  "trades-recurring": "desktop/pages/trades-terminal.tsx",
  "trades-analytics": "desktop/pages/trades-analytics.tsx",
};


// The three phone terminals anchor their spotlights on `.tp-*` classes and
// aria-labels rather than data-tutorial-id attributes, and nothing checked them.
// That matters because the failure is silent: an anchor that stops matching
// falls back to `.tp-viewport` and spotlights the entire screen instead of the
// feature, which looks like a design choice rather than a bug. Phase 2 of
// docs/PLAN-2026-08-17-mobile-responsive-ui.md moved every one of those classes
// into a scoped stylesheet (RC-6), so from here on a rename is a real risk.
const MOBILE_TUTORIAL_SOURCES: Partial<Record<TutorialPageKey, string>> = {
  "retail-terminal": "features/terminal/retail/RetailTerminalViewCore.jsx",
  "property-terminal": "features/terminal/property/PropertyTerminalView.tsx",
  "trades-terminal": "features/terminal/trades/TradesTerminalView.tsx",
};

// Each vertical's chrome is scoped under this class. A `.tp-*` anchor that is
// not defined under it is unstyled at runtime even though it still resolves.
const VERTICAL_SCOPE: Partial<Record<TutorialPageKey, { root: string; css: string }>> = {
  "retail-terminal": {
    root: ".retail-terminal-view",
    css: "features/terminal/retail/retail-terminal-view.css",
  },
  "property-terminal": {
    root: ".property-terminal-view",
    css: "features/terminal/property/property-terminal-view.css",
  },
  "trades-terminal": {
    root: ".trades-terminal-view",
    css: "features/terminal/trades/trades-terminal-view.css",
  },
};

const DESKTOP_LEGACY_TUTORIAL_SOURCES: Partial<Record<TutorialPageKey, string>> = {
  "retail-nfc": "pages/nfc-payment.tsx",
  "payment-board-builder": "pages/board-builder.tsx",
  "property-tenant-profile": "pages/property/tenant-profile.tsx",
  "trades-client-profile": "pages/trades/client-profile.tsx",
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
          // via a section component's `anchor="id"` prop, or from a typed id
          // passed to data-tutorial-id at render time.
          if (!source.includes(`data-tutorial-id="${id}"`) &&
              !source.includes(`anchor="${id}"`) &&
              !source.includes(`"${id}"`)) {
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
        expect(source).toContain(`"${match![1]}"`);

        if (step.desktopFallbackTarget) {
          const fallback = step.desktopFallbackTarget.match(DESKTOP_TARGET);
          expect(fallback).not.toBeNull();
          expect(source).toContain(`"${fallback![1]}"`);
        }
      }
    }
  });

  it("covers all 20 registered pages on tablet/desktop, including legacy-column pages", () => {
    const covered = new Set([
      ...Object.keys(DESKTOP_TUTORIAL_SOURCES),
      ...Object.keys(DESKTOP_LEGACY_TUTORIAL_SOURCES),
    ]);
    expect([...covered].sort()).toEqual([...TUTORIAL_PAGE_KEYS].sort());

    for (const [pageKey, relativeSource] of Object.entries(DESKTOP_LEGACY_TUTORIAL_SOURCES) as Array<[TutorialPageKey, string]>) {
      const source = readFileSync(join(__dirname, "..", relativeSource), "utf8");
      for (const step of tutorialStepsForDevice(pageKey, "desktop")) {
        const dataAnchor = step.target.match(/\[data-tutorial-id="([^"]+)"\]/);
        if (dataAnchor) {
          const id = dataAnchor[1];
          expect(
            source.includes(`data-tutorial-id="${id}"`) || source.includes(`anchor="${id}"`),
          ).toBe(true);
          continue;
        }

        const ariaAnchor = step.target.match(/\[aria-label="([^"]+)"\]/);
        expect(ariaAnchor).not.toBeNull();
        expect(source).toContain(`aria-label="${ariaAnchor![1]}"`);
      }
    }
  });

  it("anchors every phone-terminal spotlight on a class the view still renders", () => {
    const unresolved: string[] = [];
    const segmentedBarSource = readFileSync(
      join(__dirname, "..", "features/terminal/SegmentedBar.tsx"),
      "utf8",
    );

    for (const [pageKey, relativeSource] of Object.entries(MOBILE_TUTORIAL_SOURCES) as Array<[TutorialPageKey, string]>) {
      const source = readFileSync(join(__dirname, "..", relativeSource), "utf8");
      const renderedSource = source.includes("SegmentedBar")
        ? `${source}\n${segmentedBarSource}`
        : source;

      for (const step of tutorialStepsForDevice(pageKey, "mobile")) {
        for (const selector of [step.target, step.fallbackTarget].filter(Boolean) as string[]) {
          const cssClass = selector.match(/^\.([\w-]+)$/);
          if (cssClass) {
            // Matches className="tp-subbar", className={`tp-subbar ...`} and
            // the `tp-subbar${cond ? ...}` template forms the views all use.
            if (!new RegExp(`\\b${cssClass[1]}\\b`).test(renderedSource)) {
              unresolved.push(`${pageKey}: ${selector} not rendered by ${relativeSource}`);
            }
            continue;
          }

          const aria = selector.match(/^\[aria-label="([^"]+)"\]$/);
          expect({ pageKey, selector, recognised: !!aria }).toEqual({ pageKey, selector, recognised: true });
          if (aria && !renderedSource.includes(`aria-label="${aria[1]}"`)) {
            unresolved.push(`${pageKey}: ${selector} not rendered by ${relativeSource}`);
          }
        }
      }
    }

    expect(unresolved).toEqual([]);
  });

  it("keeps every phone-terminal anchor styled inside its own vertical's scope", () => {
    const unscoped: string[] = [];

    for (const [pageKey, scope] of Object.entries(VERTICAL_SCOPE) as Array<[TutorialPageKey, { root: string; css: string }]>) {
      // RC-6: these sheets were global `<style>` literals, so whichever terminal
      // was mounted last decided how the anchors looked. terminal-css-scoping
      // holds the whole-sheet guard; this only asks that the anchors themselves
      // are styled inside their own vertical.
      const css = readFileSync(join(__dirname, "..", scope.css), "utf8");

      for (const step of tutorialStepsForDevice(pageKey, "mobile")) {
        for (const selector of [step.target, step.fallbackTarget].filter(Boolean) as string[]) {
          const cssClass = selector.match(/^\.([\w-]+)$/);
          if (!cssClass) continue;
          const scoped = new RegExp(
            `\\${scope.root}[\\s.][^{,]*\\.${cssClass[1]}\\b|\\${scope.root}\\.${cssClass[1]}\\b`,
          );
          if (!scoped.test(css)) {
            unscoped.push(`${pageKey}: ${selector} has no rule under ${scope.root}`);
          }
        }
      }
    }

    expect(unscoped).toEqual([]);
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
