/**
 * The few facts about the demo that the *landing page itself* needs to know.
 *
 * This module is pure data with no runtime imports, which is the whole point:
 * landing-page.tsx must be able to size the story and pick a scene per
 * Industries tab without importing scenes/registry, because that would drag all
 * eight scenes and every primitive into the main landing chunk and break §6
 * ("phone-specific bytes before the story approaches: 0 KB").
 *
 * Step counts are duplicated from each SceneDefinition rather than derived from
 * them, so drift is possible in principle — landing-phone-scenes.test.ts asserts
 * the two agree, which turns that drift into a failing test rather than a phone
 * that stops one milestone early.
 */
import type { LandingPhoneScene } from './types';

/** Milestones per scene. `step` runs 0 … steps - 1. */
export const SCENE_STEPS: Record<LandingPhoneScene, number> = {
  overview: 7,
  'rent-weekly': 18,
  'property-bill': 19,
  'trades-invoice': 19,
  'quote-deposit': 13,
  'retail-sale': 16,
  'retail-split': 18,
  'checkout-wallet': 8,
};

/** Default scene per Industries tab (§3.3). */
export const INDUSTRY_SCENE = {
  property: 'rent-weekly',
  trades: 'quote-deposit',
  retail: 'retail-sale',
} as const satisfies Record<string, LandingPhoneScene>;

export type IndustryKey = keyof typeof INDUSTRY_SCENE;

export const isIndustryKey = (v: unknown): v is IndustryKey =>
  typeof v === 'string' && v in INDUSTRY_SCENE;
