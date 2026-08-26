---
name: review-2026-08-15-full-app
description: "Full app review complete — deploy blocker C2 (billing gate vs migration 0014) awaits Oliver's product decision; report in docs/REVIEW-2026-08-15-full-app-review.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: 43fc2657-5cdb-40c1-a803-8d84c7f60a3b
  modified: 2026-08-15T06:17:33.435Z
---

Top-to-bottom app review (excluding landing) finished 2026-08-15 on `feat/tablet-desktop-app`.
Full report: `docs/REVIEW-2026-08-15-full-app-review.md`; published artifact
https://claude.ai/code/artifact/8fdb219b-9f2f-4342-8cf9-3592824911c4

**Why:** 9 findings, none catchable by CI (tsc + 719 tests + build all green). Two need
Oliver's decision before this branch can ship, so the work is blocked, not done.

**How to apply:**
- **C2 is a deploy blocker awaiting a product call.** Migration 0014 (already applied to
  prod) grants `status=active` + a live `current_period_end` but never sets
  `last_billing_date`; `subscriptionHasPaidAccess` in `server/billing-card.ts:73` requires
  both. Proven against real prod rows: 8 of 8 merchants would be unable to take payments the
  moment this branch deploys. `main` has no billing gate at all, which is why prod is fine
  today. Either the gate accepts a live period, or 0014 backfills `last_billing_date` —
  do not pick one unilaterally.
- **C1:** `.replit` is tracked and holds `JWT_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_EMAIL`,
  `VAPID_PRIVATE_KEY`, Windcave creds. An admin token was forged from it and accepted live.
  Rotate + untrack before anything else; see [[audit-2026-07-12-security]].
- **H2:** cron is pull-only and its Replit Scheduled Deployment was never documented in
  `replit.md` (the spec explicitly required that). Only Oliver can confirm the dashboard.
- Verified genuinely solid: tenancy isolation (data-driven probe with real foreign ids),
  SSE audience projection, subscription charge machinery, and the full money path once the
  gate is open.

Review method worth reusing: findings were written to the docs file *incrementally* rather
than held in context — see [[crash-recovery-from-transcripts]].
