import { TUTORIAL_PAGE_KEYS, isTutorialPageKey } from "../../../shared/tutorial";
import { TUTORIAL_REGISTRY } from "../features/tutorial/tutorial-registry";

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
      expect(definition.steps.length).toBeLessThanOrEqual(4);

      for (const step of definition.steps) {
        expect(step.target.trim().length).toBeGreaterThan(0);
        expect(step.tag.trim().length).toBeGreaterThan(0);
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("contains the shared Settings restart page", () => {
    expect(TUTORIAL_REGISTRY.settings.steps.some(step =>
      step.target.includes("settings-tutorial-help"),
    )).toBe(true);
  });
});

