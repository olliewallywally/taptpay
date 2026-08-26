/**
 * Scroll → scene/step resolution for the landing phone demo.
 *
 * The whole controller is pure arithmetic over a scroll progress value. That is
 * deliberate: it is what makes the plan's scroll requirements (§3.2) provable
 * in a unit test rather than eyeballed in a browser.
 *
 *   forward   — every milestone is visited, in order
 *   backward  — rewinds through the same milestones, symmetrically
 *   jump      — any progress maps to exactly one state, with no replay
 *   re-entry  — a zone always starts at its own step 0
 *
 * Because state is a pure function of progress, there is no in-flight timer or
 * queued animation that can survive a scene change and leak into the next one.
 * Scenes render from `step`; they must not schedule their own transitions.
 */
import type { LandingPhoneScene, LandingPhoneState } from './types';

/** Story order: intro + cards 01–07, eight equal zones (§3.2). */
export const SCENE_ORDER: readonly LandingPhoneScene[] = [
  'overview',
  'rent-weekly',
  'property-bill',
  'trades-invoice',
  'quote-deposit',
  'retail-sale',
  'retail-split',
  'checkout-wallet',
];

export const ZONE_COUNT = SCENE_ORDER.length;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Maps overall story progress (0–1) to a zone and the progress within it. */
export function sceneAtProgress(progress: number): {
  scene: LandingPhoneScene;
  local: number;
} {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const scaled = p * ZONE_COUNT;
  const index = Math.min(Math.floor(scaled), ZONE_COUNT - 1);
  return { scene: SCENE_ORDER[index], local: clamp01(scaled - index) };
}

/**
 * Splits a zone into `steps` equal milestones. The final milestone owns the
 * end of the zone, so scrolling a scene fully through always finishes it.
 */
export function stepAtProgress(steps: number, local: number): number {
  if (steps <= 1) return 0;
  const slice = Math.floor(clamp01(local) * steps);
  return Math.min(slice, steps - 1);
}

export type StepsFor = (scene: LandingPhoneScene) => number;

/** The single source of truth: progress in, complete state out. */
export function resolveState(progress: number, stepsFor: StepsFor): LandingPhoneState {
  const { scene, local } = sceneAtProgress(progress);
  return { scene, step: stepAtProgress(stepsFor(scene), local) };
}

/** Reduced-motion and Save-Data viewers get the finished frame, not the build-up. */
export function finalState(scene: LandingPhoneScene, stepsFor: StepsFor): LandingPhoneState {
  return { scene, step: Math.max(0, stepsFor(scene) - 1) };
}

export const sameState = (a: LandingPhoneState, b: LandingPhoneState) =>
  a.scene === b.scene && a.step === b.step;

/**
 * Wraps `resolveState` so React only re-renders on an actual milestone change.
 * Scroll fires far more often than the demo changes; without this the phone
 * would set state on every frame.
 */
export function createSceneController(stepsFor: StepsFor, initial?: LandingPhoneState) {
  let current: LandingPhoneState = initial ?? { scene: SCENE_ORDER[0], step: 0 };
  return {
    get state(): LandingPhoneState {
      return current;
    },
    /** Returns the new state only when it changed, else null. */
    update(progress: number): LandingPhoneState | null {
      const next = resolveState(progress, stepsFor);
      if (sameState(next, current)) return null;
      current = next;
      return next;
    },
    /** Direct selection, used by the Industries tabs and replay control. */
    set(next: LandingPhoneState): LandingPhoneState | null {
      if (sameState(next, current)) return null;
      current = next;
      return next;
    },
  };
}
