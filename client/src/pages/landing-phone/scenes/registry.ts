/**
 * The one scene registry, used by both the cinematic phone and the Industries
 * phone so the two can never drift apart.
 *
 * Scenes are imported statically on purpose: the whole demo is one lazily
 * loaded chunk (§6 rule 3), so changing scene must not cost a network request.
 *
 * Adding a scene means adding a member to LandingPhoneScene in types.ts — the
 * SceneRegistry type then fails to compile until it is registered here.
 */
import type { LandingPhoneScene, SceneRegistry } from '../types';
import { overviewScene } from './overview';
import { rentWeeklyScene } from './rent-weekly';
import { propertyBillScene } from './property-bill';
import { tradesInvoiceScene } from './trades-invoice';
import { quoteDepositScene } from './quote-deposit';
import { retailSaleScene } from './retail-sale';
import { retailSplitScene } from './retail-split';
import { checkoutWalletScene } from './checkout-wallet';

export const SCENES: SceneRegistry = {
  overview: overviewScene,
  'rent-weekly': rentWeeklyScene,
  'property-bill': propertyBillScene,
  'trades-invoice': tradesInvoiceScene,
  'quote-deposit': quoteDepositScene,
  'retail-sale': retailSaleScene,
  'retail-split': retailSplitScene,
  'checkout-wallet': checkoutWalletScene,
};

export const stepsFor = (scene: LandingPhoneScene): number => SCENES[scene].steps;

/** Default scene per Industries tab (§3.3). */
export const INDUSTRY_SCENE = {
  property: 'rent-weekly',
  trades: 'quote-deposit',
  retail: 'retail-sale',
} as const satisfies Record<string, LandingPhoneScene>;
