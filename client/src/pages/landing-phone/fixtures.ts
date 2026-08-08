/**
 * Fixed demo data for the landing phone.
 *
 * Two rules hold everywhere in this file:
 *
 * 1. No `Date`, no `Math.random`, no locale-sensitive derivation. Every date or
 *    day label is a literal string, so a scene renders identically on any
 *    machine, in any timezone, on any test day. Screenshot comparison depends
 *    on this.
 * 2. Amounts are cents, matching the terminals. Formatting goes through
 *    `fmt()` in tokens.ts so the demo rounds and groups exactly as production.
 */

/** The story's frozen "today". Display only — never parsed. */
export const DEMO_TODAY = 'fri 7 aug';

export const PROPERTY = {
  tenant: { name: 'Mia', address: '18 Tui St' },
  /** §4.2 weekly rent */
  rentCents: 62_000,
  frequency: 'weekly' as const,
  scheduleNote: 'first request now, then weekly from fri 14 aug',
  scheduleCard: { amount: 62_000, cadence: 'weekly', status: 'active' as const },
  /** §4.3 utility bill */
  billCents: 8_640,
  billType: 'water',
  billDue: 'due in 7 days',
  billDoc: 'water-invoice.pdf',
} as const;

export const TRADES = {
  client: { name: 'Dave Kerr', site: '12 Rimu Ave' },
  /** §4.4 quick invoice */
  invoiceCents: 48_000,
  invoiceLabel: 'emergency callout',
  /** §4.5 quote → deposit */
  quoteLine: { description: 'Heat pump service', qty: 1, unitCents: 125_000 },
  depositPercent: 20,
  depositCents: 25_000,
} as const;

export const RETAIL = {
  /** §4.6 normal sale */
  saleCents: 1_250,
  saleItem: 'flat white ×2',
  /** §4.7 split bill */
  splitTotalCents: 12_000,
  splitPeople: 4,
  splitShareCents: 3_000,
} as const;

export const CHECKOUT = {
  /** §4.8 continues the quote deposit from TRADES */
  amountCents: 25_000,
  merchant: 'Kerr Plumbing',
  reference: 'deposit · heat pump service',
  methods: ['apple-pay', 'google-pay', 'card'] as const,
  /** The deterministic method the demo always "chooses". */
  chosen: 'apple-pay' as const,
} as const;

export type PaymentMethod = (typeof CHECKOUT.methods)[number];
