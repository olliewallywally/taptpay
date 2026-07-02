---
name: split-bill-cross-vertical
description: "Split-bill cross-vertical parity feature — shipped to PR on 2026-06-27; what changed and what's still owed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 68503c27-cba0-4a50-9280-0c9df517f7ee
---

Built "split-bill cross-vertical parity" on branch `feat/trades-phase3c-cross-cutting` (2026-06-27), via brainstorming → spec → plan → subagent-driven-development. Spec: `docs/superpowers/specs/2026-06-27-split-bill-cross-vertical-design.md`; plan: `docs/superpowers/plans/2026-06-27-split-bill-cross-vertical.md`.

**Key product decisions (from user):** split stays MERCHANT-GATED (merchant enables when sending; customer divides at pay time — NOT customer-initiated). Customer-facing label is exactly "Split the bill". Wording neutralized only (both existing customer UIs kept structurally — retail standalone `/split-payment` page + property/trades inline `checkout.tsx`).

**What shipped (commits 156302e..093765e):** (1) neutralized "flatmate" wording in shared `checkout.tsx` + `property-terminal.tsx` indicator ("split enabled — bill can be divided"), with Jest guard test `client/src/__tests__/split-wording.test.ts`; (2) trades quick-invoice `splitEnabled` toggle in `trades-terminal.tsx` QuickInvoice; (3) trades balance toggle — `send-balance` route (`server/routes.ts` ~6969) now accepts optional `splitEnabled`, JobActionSheet got a "split the balance" toggle; (4) deleted dead `client/src/components/bill-split.tsx`. Plus post-review polish: `splitEnabled` resets on invoice abandonment, `type="button"` on toggles.

**Discovery that shaped scope:** split was ALREADY plumbed end-to-end in schema + backend for all 3 verticals (`transactions`/`invoices_rent_requests`/`job_invoices` all have split columns; `/api/checkout/:token/split` already handled property+trades; trades invoice-create route already persisted splitEnabled). So this was a near-frontend change, not new infra.

**Status / OWED:** Branch pushed to origin; PR opened against `main` by the user. Local `main` is 29 commits BEHIND `origin/main` (stale) and `git checkout main` is blocked by dirty `.claude-home/.credentials.json` — that's why we used push+PR not a local merge. **Still owed: manual webview verification of the two trades toggles + "Split the bill" checkout wording** — could not be done in sandbox (no browser; install banned per [[avoid-playwright-install-replit-nix]]). Final opus review verdict was "Ready to merge — Yes" (0 Critical/Important).

Env note: background subagents hit intermittent auth 401s mid-run this session (twice on Task 2, which made zero edits each time); recovered after user re-login. See [[trades-vertical-project]] and [[db-schema-drift-fk-sequences]].
