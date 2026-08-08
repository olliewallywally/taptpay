/**
 * Design tokens copied from the production mobile terminals so the demo reads
 * as the same product.
 *
 * Sources: client/src/pages/property/property-terminal.tsx (NAVY/BLUE/OFFW/…)
 * and client/src/lib/trades-theme.ts, which resolve to identical values across
 * all three verticals. Keep these in sync by value, not by import — the landing
 * chunk must not pull the merchant app's module graph in behind it.
 */

export const NAVY = '#040D6D';
export const BLUE = '#58ABFF';
export const OFFW = '#F4F4F4';
export const GREEN = '#1BBF85';
export const RED = '#FF3B4E';
export const AMBER = '#FFB02E';
export const WHITE = '#FFFFFF';

/** Translucent navy/blue mixes the terminals use for secondary text. */
export const NAVY_50 = 'rgba(4,13,109,0.5)';
export const NAVY_35 = 'rgba(4,13,109,0.35)';
export const NAVY_25 = 'rgba(4,13,109,0.25)';
export const NAVY_06 = 'rgba(4,13,109,0.06)';
export const BLUE_55 = 'rgba(88,171,255,0.55)';
export const BLUE_40 = 'rgba(88,171,255,0.4)';
export const BLUE_18 = 'rgba(88,171,255,0.18)';

/**
 * The landing page already declares 'Outfit' via @font-face in landing.css, so
 * the demo adds no font file. The production terminals additionally @import
 * Outfit from Google Fonts; the demo must not — an external request would blow
 * both the request-graph rule and the transfer budget.
 */
export const FONT = "'Outfit', system-ui, sans-serif";

/** Canonical mobile viewport the demo is measured against. */
export const SCREEN_W = 390;
export const SCREEN_H = 844;

/** Formats cents the way the terminals do: $1,250 / $86.40. */
export function fmt(cents: number): string {
  const whole = cents / 100;
  return `$${whole.toLocaleString('en-NZ', {
    minimumFractionDigits: Number.isInteger(whole) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
