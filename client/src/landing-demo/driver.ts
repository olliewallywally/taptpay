import type { LandingDemoScene } from "@shared/landing-demo";

export type LandingDemoInteraction =
  | { kind: "press"; target: string }
  | { kind: "input"; target: string; value: string }
  | { kind: "select"; target: string; value: string };

export type LandingDemoMilestone = {
  id: string;
  durationMs: number;
  capture: boolean;
  action?: LandingDemoInteraction;
  expect?: string;
};

export type LandingDemoScenario = {
  id: LandingDemoScene;
  label: string;
  firstControl: string;
  milestones: readonly LandingDemoMilestone[];
};

export type LandingDemoDriverHooks = {
  beforeLoop: (scene: LandingDemoScene, signal: AbortSignal) => void | Promise<void>;
  onStep?: (scene: LandingDemoScene, step: number) => void;
  onComplete?: (scene: LandingDemoScene) => void;
};

export type LandingDemoRunOptions = {
  loop?: boolean;
  instant?: boolean;
};

const TARGET_TIMEOUT_MS = 4_000;
const RESUME_DELTA_CAP_MS = 250;

const abortError = () => new DOMException("Landing demo run aborted", "AbortError");

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw signal.reason ?? abortError();
};

const nextFrame = (doc: Document, callback: FrameRequestCallback): number => {
  const view = doc.defaultView;
  if (view?.requestAnimationFrame) return view.requestAnimationFrame(callback);
  return view?.setTimeout(() => callback(performance.now()), 16) ?? 0;
};

const cancelFrame = (doc: Document, id: number) => {
  const view = doc.defaultView;
  if (view?.cancelAnimationFrame) view.cancelAnimationFrame(id);
  else view?.clearTimeout(id);
};

const isActionable = (element: Element): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return !("disabled" in element && Boolean((element as HTMLButtonElement).disabled));
};

const waitForElement = (
  root: ParentNode,
  selector: string,
  signal: AbortSignal,
  actionable: boolean,
): Promise<Element> => {
  const doc = root instanceof Document ? root : root.ownerDocument;
  if (!doc) return Promise.reject(new Error("Landing demo root is detached"));
  return new Promise((resolve, reject) => {
  const startedAt = performance.now();
  let frame = 0;

  const finish = (error?: unknown, element?: Element) => {
    signal.removeEventListener("abort", onAbort);
    if (frame) cancelFrame(doc, frame);
    if (error) reject(error);
    else resolve(element!);
  };
  const onAbort = () => finish(signal.reason ?? abortError());
  const inspect = (time: number) => {
    if (signal.aborted) return onAbort();
    const element = root.querySelector(selector);
    if (element && (!actionable || isActionable(element))) {
      finish(undefined, element);
      return;
    }
    if (time - startedAt >= TARGET_TIMEOUT_MS) {
      finish(new Error(`Landing demo target unavailable: ${selector}`));
      return;
    }
    frame = nextFrame(doc, inspect);
  };

  signal.addEventListener("abort", onAbort, { once: true });
  frame = nextFrame(doc, inspect);
  });
};

const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Landing demo input has no native value setter");
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const setNativeSelection = (element: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (!setter) throw new Error("Landing demo select has no native value setter");
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

export class LandingDemoDriver {
  private runController: AbortController | null = null;
  private visitorPaused = false;
  private pointer: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly hooks: LandingDemoDriverHooks,
  ) {}

  pause(): void {
    this.visitorPaused = true;
  }

  resume(): void {
    this.visitorPaused = false;
  }

  abort(reason = abortError()): void {
    this.runController?.abort(reason);
    this.runController = null;
    this.removePointer();
  }

  destroy(): void {
    this.abort();
  }

  async run(
    scenario: LandingDemoScenario,
    options: LandingDemoRunOptions = {},
  ): Promise<void> {
    this.abort();
    const controller = new AbortController();
    this.runController = controller;
    const { signal } = controller;
    const shouldLoop = options.loop ?? true;

    try {
      do {
        await this.hooks.beforeLoop(scenario.id, signal);
        for (let step = 0; step < scenario.milestones.length; step += 1) {
          throwIfAborted(signal);
          const milestone = scenario.milestones[step];
          if (milestone.action) await this.perform(milestone.action, signal, options.instant);
          if (milestone.expect) {
            await waitForElement(this.root, milestone.expect, signal, false);
          }
          this.hooks.onStep?.(scenario.id, step);
          if (!options.instant) await this.activeDelay(milestone.durationMs, signal);
        }
        this.hooks.onComplete?.(scenario.id);
      } while (shouldLoop && !signal.aborted);
    } finally {
      if (this.runController === controller) this.runController = null;
      this.removePointer();
    }
  }

  private async perform(
    action: LandingDemoInteraction,
    signal: AbortSignal,
    instant = false,
  ): Promise<void> {
    const element = await waitForElement(this.root, action.target, signal, true);
    if (action.kind === "input") {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new Error(`Landing demo input target is not editable: ${action.target}`);
      }
      element.focus({ preventScroll: true });
      setNativeValue(element, action.value);
      return;
    }
    if (action.kind === "select") {
      if (!(element instanceof HTMLSelectElement)) {
        throw new Error(`Landing demo select target is not a select: ${action.target}`);
      }
      element.focus({ preventScroll: true });
      setNativeSelection(element, action.value);
      return;
    }

    const target = element as HTMLElement;
    target.focus({ preventScroll: true });
    if (!instant) this.placePointer(target);
    const view = target.ownerDocument.defaultView;
    const Pointer = view?.PointerEvent ?? view?.MouseEvent ?? MouseEvent;
    const init = { bubbles: true, cancelable: true, composed: true, button: 0 };
    target.dispatchEvent(new Pointer("pointerdown", init));
    target.dispatchEvent(new Pointer("pointerup", init));
    target.dispatchEvent(new MouseEvent("click", init));
  }

  private placePointer(target: HTMLElement): void {
    const doc = target.ownerDocument;
    if (!this.pointer) {
      const pointer = doc.createElement("span");
      pointer.className = "landing-demo-pointer";
      pointer.dataset.demoPointer = "true";
      pointer.setAttribute("aria-hidden", "true");
      this.root.append(pointer);
      this.pointer = pointer;
    }
    const rootRect = this.root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    this.pointer.style.left = `${targetRect.left - rootRect.left + targetRect.width / 2}px`;
    this.pointer.style.top = `${targetRect.top - rootRect.top + targetRect.height / 2}px`;
    this.pointer.classList.remove("is-pressing");
    void this.pointer.offsetWidth;
    this.pointer.classList.add("is-pressing");
  }

  private removePointer(): void {
    this.pointer?.remove();
    this.pointer = null;
  }

  private activeDelay(durationMs: number, signal: AbortSignal): Promise<void> {
    const doc = this.root.ownerDocument;
    return new Promise((resolve, reject) => {
      let elapsed = 0;
      let previous = performance.now();
      let frame = 0;
      const finish = (error?: unknown) => {
        signal.removeEventListener("abort", onAbort);
        if (frame) cancelFrame(doc, frame);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => finish(signal.reason ?? abortError());
      const tick = (time: number) => {
        if (signal.aborted) return onAbort();
        const delta = Math.min(RESUME_DELTA_CAP_MS, Math.max(0, time - previous));
        previous = time;
        if (!this.visitorPaused && !doc.hidden) elapsed += delta;
        if (elapsed >= durationMs) {
          finish();
          return;
        }
        frame = nextFrame(doc, tick);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      frame = nextFrame(doc, tick);
    });
  }
}
