---
name: head-broken-stash1-fix
description: "RESOLVED 2026-08-08 — c350644 shipped callers without implementations; the fix from stash@{1} is committed as 2565a68"
metadata: 
  node_type: memory
  type: project
  originSessionId: e4f65deb-20f6-43d9-bf35-49c5e86df498
  modified: 2026-08-08T05:20:24.298Z
---

**Resolved 2026-08-08 — kept as the explanation for an odd-looking commit.**

Commit `c350644` ("feat(subscription): add plans, team logins, and billing flows")
was made from a partially staged tree on `feat/tablet-desktop-app`. It committed
the **callers** but left their **implementations** uncommitted in `stash@{1}`, so
`npm run check` failed with 6 errors:

- `server/routes.ts:6631,6661` called `sseBroker.disconnectUser(...)`, which did
  not exist — it drops live SSE streams for a **revoked team login**, so team
  logins shipped without their revocation path actually working
- `server/routes.ts:5175` passed `userId` into `{ kind: "merchant" }`
- `server/routes.ts:3257` — `ReportData` still required the provider-comparison
  fields (`savings`, `ourCost`, …) that routes.ts had stopped passing
- `server/storage.ts:1459,4436` — `platformFee` missing from
  `FinalizePaymentAttemptResult`

Fixed by applying `stash@{1}` and committing as **`2565a68`**; `npm run check`
now exits 0. The stash was applied, not popped, so it still exists as a safety
net and can be dropped once the branch is pushed and reviewed.

`stash@{2}` is superseded (its subscription half became `c350644`; its landing
half is byte-identical to `stash@{1}`'s). `stash@{0}` is harness noise.

The same stash also carried the landing pricing rewrite
([[landing-pricing-repositioning]]) and, as untracked files, the entire phone
demo ([[landing-phone-demo-status]]) — see [[git-stash-hides-untracked]] for why
that was nearly missed.
