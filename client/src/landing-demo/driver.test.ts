import {
  LandingDemoDriver,
  type LandingDemoScenario,
} from "./driver";

const scenario: LandingDemoScenario = {
  id: "retail-sale",
  label: "test sale",
  firstControl: '[data-demo-id="start"]',
  milestones: [
    { id: "start", durationMs: 1, capture: true, expect: '[data-demo-id="start"]' },
    {
      id: "press",
      durationMs: 1,
      capture: true,
      action: { kind: "press", target: '[data-demo-id="start"]' },
      expect: '[data-demo-id="amount"]',
    },
    {
      id: "input",
      durationMs: 1,
      capture: true,
      action: { kind: "input", target: '[data-demo-id="amount"]', value: "12.50" },
    },
  ],
};

const visibleRect = {
  x: 10, y: 10, left: 10, top: 10, right: 90, bottom: 50,
  width: 80, height: 40, toJSON: () => ({}),
};

describe("LandingDemoDriver", () => {
  let root: HTMLDivElement;
  let button: HTMLButtonElement;
  let input: HTMLInputElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    button = document.createElement("button");
    input = document.createElement("input");
    button.dataset.demoId = "start";
    input.dataset.demoId = "amount";
    button.getBoundingClientRect = () => visibleRect;
    input.getBoundingClientRect = () => visibleRect;
    root.getBoundingClientRect = () => visibleRect;
    root.append(button, input);
    document.body.append(root);
  });

  test("operates real controls in order and reports every milestone", async () => {
    const clicks: string[] = [];
    const changes: string[] = [];
    const steps: number[] = [];
    button.addEventListener("pointerdown", () => clicks.push("down"));
    button.addEventListener("pointerup", () => clicks.push("up"));
    button.addEventListener("click", () => clicks.push("click"));
    input.addEventListener("input", () => changes.push(input.value));
    const beforeLoop = jest.fn();
    const driver = new LandingDemoDriver(root, {
      beforeLoop,
      onStep: (_scene, step) => steps.push(step),
    });

    await driver.run(scenario, { loop: false, instant: true });

    expect(beforeLoop).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual(["down", "up", "click"]);
    expect(changes).toEqual(["12.50"]);
    expect(steps).toEqual([0, 1, 2]);
    expect(root.querySelector("[data-demo-pointer]")).toBeNull();
  });

  test("rejects a disabled target instead of bypassing its handler", async () => {
    button.disabled = true;
    const driver = new LandingDemoDriver(root, { beforeLoop: jest.fn() });
    const run = driver.run({
      ...scenario,
      milestones: [{
        id: "disabled",
        durationMs: 1,
        capture: true,
        action: { kind: "press", target: '[data-demo-id="start"]' },
      }],
    }, { loop: false, instant: true });
    await expect(run).rejects.toThrow("target unavailable");
  }, 6_000);

  test("abort cancels an in-flight run and removes its pointer", async () => {
    const driver = new LandingDemoDriver(root, { beforeLoop: jest.fn() });
    const run = driver.run({
      ...scenario,
      milestones: [{
        id: "long",
        durationMs: 10_000,
        capture: true,
        action: { kind: "press", target: '[data-demo-id="start"]' },
      }],
    }, { loop: false });
    await new Promise(resolve => setTimeout(resolve, 30));
    driver.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(root.querySelector("[data-demo-pointer]")).toBeNull();
  });
});
