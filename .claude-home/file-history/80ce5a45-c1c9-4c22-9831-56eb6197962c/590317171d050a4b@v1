/**
 * Shared contract for the landing-page phone demo.
 *
 * Everything in this module is pure data — no React runtime, no DOM, no Date.
 * The scroll controller, the scene modules and the tests all compile against
 * these types, which is what lets the three vertical lanes be built and
 * verified independently of each other.
 */
import type { ComponentType } from 'react';

/** One scene per landing story zone: intro + cards 01–07. */
export type LandingPhoneScene =
  | 'overview'
  | 'rent-weekly'
  | 'property-bill'
  | 'trades-invoice'
  | 'quote-deposit'
  | 'retail-sale'
  | 'retail-split'
  | 'checkout-wallet';

/** The complete demo state. `step` is always a valid milestone for `scene`. */
export type LandingPhoneState = {
  scene: LandingPhoneScene;
  step: number;
};

/**
 * Scenes render from `step` alone. They hold no state of their own, so any
 * scroll position — forward, backward, or jumped — produces the same frame.
 */
export type SceneProps = {
  step: number;
  /** true when the viewer asked for reduced motion or Save-Data. */
  still?: boolean;
};

export type SceneDefinition = {
  id: LandingPhoneScene;
  /** Milestone count. `step` runs 0 … steps - 1. */
  steps: number;
  /** Announced politely when the scene reaches its final milestone. */
  label: string;
  Component: ComponentType<SceneProps>;
};

/** Registry shape. Every scene id must be present — the type enforces it. */
export type SceneRegistry = Record<LandingPhoneScene, SceneDefinition>;
