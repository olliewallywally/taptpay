import { z } from "zod";

/**
 * The TaptPay subscription catalogue — the single source of truth for what a
 * plan costs and how many logins it carries.
 *
 * Prices are integer cents so no display path can round them differently. Both
 * the marketing page and the billing job read from here, which is what stops the
 * advertised price and the charged price from drifting apart.
 *
 * Enterprise (10+ logins) is deliberately absent: it is a contact-sales tier with
 * no self-serve plan id, so it can never be selected or billed automatically.
 */
export const PLANS = {
  solo: {
    id: "solo",
    name: "Solo",
    priceCents: 799,
    seats: 1,
    blurb: "1 login · the full stack",
  },
  team: {
    id: "team",
    name: "Team",
    priceCents: 899,
    seats: 5,
    blurb: "5 logins · one dollar more",
    popular: true,
  },
  crew: {
    id: "crew",
    name: "Crew",
    priceCents: 1299,
    seats: 10,
    blurb: "10 logins · whole crew covered",
  },
} as const;

export const PLAN_IDS = ["solo", "team", "crew"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  priceCents: number;
  seats: number;
  blurb: string;
  popular?: boolean;
}

export const DEFAULT_PLAN_ID: PlanId = "solo";

export const planIdSchema = z.enum(PLAN_IDS);

/** Catalogue order — cheapest first. Drives every plan picker in the product. */
export const PLAN_LIST: readonly Plan[] = PLAN_IDS.map((id) => PLANS[id]);

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

/** Strict lookup. Throws on an unknown id so a bad plan can never be billed. */
export function planFor(id: unknown): Plan {
  if (!isPlanId(id)) throw new Error(`Unknown plan id: ${String(id)}`);
  return PLANS[id];
}

/** Lenient lookup for display paths that must not throw on a legacy row. */
export function planForOrDefault(id: unknown): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS[DEFAULT_PLAN_ID];
}

/** "$7.99" — the canonical way to render a plan price. */
export function formatPlanPrice(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(2)}`;
}

/** Windcave amounts are decimal strings: 799 -> "7.99". */
export function planAmountString(priceCents: number): string {
  return (priceCents / 100).toFixed(2);
}

/**
 * Plan direction follows the catalogue hierarchy, not a customer's stored
 * grandfathered price. Price snapshots affect proration, never plan identity.
 */
export function isUpgrade(fromPlanId: PlanId, toPlanId: PlanId): boolean {
  return PLAN_IDS.indexOf(toPlanId) > PLAN_IDS.indexOf(fromPlanId);
}
