/**
 * Scene resolution and deterministic state helpers for the landing phone demo.
 *
 * Overall scroll progress resolves the current scene. The autoplay hook uses
 * the pure sceneAtProgress helper while its clock advances authored beats:
 *
 *   ordering  — scene order remains stable
 *   jump      — any progress maps immediately to exactly one scene
 *   re-entry  — a zone always starts at its own step 0
 *
 * Scenes render from `step` alone and schedule no transitions of their own.
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

/* ── frame-authoring emphasis metadata ─────────────────────────────────────
   Scene modules use these values to drive taps, readable screens and results. */

/** A press: long enough to see the key light and the control sink, no longer. */
export const TAP_MS = 300;
/** A screen the eye has to actually read before the next move. */
export const BEAT_MS = 780;
/** A moment on something worth looking at — an amount landing, a QR appearing. */
export const DWELL_MS = 1150;
/**
 * A completed result, marked as the scene's strongest visual emphasis.
 */
export const HOLD_MS = 2100;


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
