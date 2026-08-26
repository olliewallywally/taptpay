---
name: landing-pricing-repositioning
description: SHIPPED 2026-08-08 as 2565a68 — landing page moved from 10¢/0.3% transaction pricing to $0-per-transaction subscription
metadata: 
  node_type: memory
  type: project
  originSessionId: e4f65deb-20f6-43d9-bf35-49c5e86df498
  modified: 2026-08-08T05:20:41.634Z
---

**Shipped 2026-08-08 in commit `2565a68`.**

TaptPay moved from transaction-fee pricing to **subscription-only, $0 per
transaction**. The backend half shipped in `c350644` (`shared/plans.ts` — Solo
$7.99/1 seat, Team $8.99/5 seats (popular), Crew $12.99/10 seats, plus
`formatPlanPrice()`). The landing half sat uncommitted in `stash@{1}` for a day,
so the marketing site actively contradicted what the product billed.

What changed in `client/src/pages/landing-page.tsx` and `landingRuntime.ts`:

- nav: `"pricing: 10¢ retail · 0.3% everything else"` → `"pricing: from $7.99 a
  month · no transaction fees"`, read from `PLANS.solo` rather than hardcoded
- revenue panel: the 150px `10¢` → `$0` / "no transaction fee. not a cent. not a
  percentage."; `0.3%` → `3-in-1` / "retail, property and trades. one
  subscription."
- the three plan cards now read `PLANS[id].name/priceCents/blurb` and the
  `popular` flag instead of hardcoding `$7.99`/`$8.99`/`$12.99`
- all three industry stat rows and story beat 05 drop `0.3% platform fee` and
  `10¢ per transaction, flat`

Also in the same commit: deleted the unused `client/src/components/PricingSection.tsx`
(no importers; legacy Tailwind/motion component still advertising `$0.10 per
transaction`), removed the Stripe deps (`stripe`, `stripe-replit-sync`,
`@stripe/*`) since billing is Windcave, and dropped the "savings vs current
provider" card from `server/report-generator.ts`, which only made sense under
percentage pricing.

Verified 2026-08-08: no retired pricing copy remains on any screen the landing
phone demo replicates. Related: [[head-broken-stash1-fix]],
[[landing-phone-demo-status]].
