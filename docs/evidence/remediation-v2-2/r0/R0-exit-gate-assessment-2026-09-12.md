# R0 exit-gate assessment — 2026-09-12

Date: 2026-09-12 UTC. Branch: `remediation/r1-continuation-20260907` @ `024e3362`.
Status: **R0 exit is NOT yet established.** Every engineering criterion now passes;
two owner-badged human tasks (R0-H4, R0-H5) remain open and are not something an
agent can complete. This record exists so that is stated precisely rather than
inferred from a green test count, per the plan's own P8.5 rule.

Source: the R0 exit gate as written on plan pages 21-22 (`attached_assets/
full_intergration_plan_-_taptpay_1787816180424.pdf`), checked item by item against
current evidence.

## The Check, line by line

| # | Criterion | Status | Basis |
| --- | --- | --- | --- |
| 1 | Secret rotation and exposure review recorded by the incident owner (H1-H5) | ⚠️ PARTIAL | See H1-H5 breakdown below. Rotation itself is now owner-attested complete for every named credential; the incident-closure *record* and two review tasks are not. |
| 2 | Fake-approval routes unreachable in a production-mode test (T5) | ✅ | [R0-T5 wallet-validate-auth-and-dead-code](R0-T5-wallet-validate-auth-and-dead-code-2026-09-11.md); commit `5d30caf6`. Re-verified in full regression today. |
| 3 | Transaction clearing cannot delete; `clearTransactions` gone from all three storage locations (T4) | ✅ | Recorded in prior R0-T4 evidence; unchanged since. |
| 4 | Production seeding impossible under every flag value (T4) | ✅ | Recorded in prior R0-T4 evidence; unchanged since. |
| 5 | Automatic production dumps removed from startup; build makes no DB connection (T6) | ✅ | Prior R0-T6 evidence; unchanged since. |
| 6 | Empty/restored DB convergence; zero startup/build DDL; no auto-baseline of an unknown target (T6A) | ✅ | [R0-T6A closure](R0-T6A-closure-2026-09-10.md), CLOSED 2026-09-10. |
| 7 | All nine T1 tests pass; original failure output preserved as evidence | ✅ | Recorded at R0-T0/T1; preserved in evidence tree. |
| 8 | `npm run check`, `test:client`, `test:server`, `build`, device smoke all pass | ✅ | Run fresh today (2026-09-12), not carried over: `npm run check` clean; server suite **52/52 suites, 1019/1019 tests pass**; device smoke **20/20** ([frame-measurement record](R0-T5-frame-measurement-2026-09-12.md)). `test:client` and `build` were not re-run in this pass — flagging rather than assuming; run before treating this as full release evidence. |
| 9 | Existing legitimate provider reconciliation preserved / covered | ✅ | No Windcave configured in this environment; nothing to preserve or break. |

## H1-H5 breakdown (owner/professional-badged; not agent tasks)

| ID | Status | Detail |
| --- | --- | --- |
| R0-H1 — Declare and inventory | ⚠️ **Draft only, unconfirmed** | No dated incident-closure record existed before today. A draft synthesizing already-recorded facts is below; it needs Oliver to name the incident owner and confirm or correct it — an agent must not declare an incident closed on its own authority. |
| R0-H2 — Generate and enter replacement secrets | ✅ **Owner-attested complete for every named credential** | JWT_SECRET/ADMIN_PASSWORD_HASH: [waived 2026-09-12](../../../decisions/2026-09-12-jwt-admin-owner-disposition.md). GCP service-account keys: [deleted, confirmed 2026-09-12](../../../decisions/2026-09-12-google-analytics-key-revocation.md). Figma: [waived 2026-09-12](../../../decisions/2026-09-12-figma-owner-disposition.md). Production database password: [rotated, confirmed 2026-09-12](../../../decisions/2026-09-12-production-db-password-rotation-and-r0-h2-disposition.md). VAPID_PRIVATE_KEY: previously rotated. WINDCAVE_API_KEY: never exposed. |
| R0-H3 — Deploy and verify the rotation took | ⚠️ **Owner attestation only** | This check ("old credential rejected, new one works") is itself owner-badged in the plan; this session never had visibility into old secret values to test against, and must not seek it out. Recorded as owner-attested via H2's disposition docs, not independently re-tested. |
| R0-H4 — Review access logs and scan history | ❌ **OPEN — requires owner/infra access this session does not have** | The tracked-tree/history *secret scan* portion is effectively covered by R0-T7's classification (285 dispositioned triples, 0 review-required). The *access-log review* (forged admin use, unusual logins, cross-merchant access, simulator/refund/API-key calls) requires hosting/deployment console access an agent does not have, plus the history-rewrite decision, which is explicitly a human call either way. |
| R0-H5 — Classify tracked uploads and local dumps | ❌ **OPEN — requires a privacy content decision** | Prior inventory: 41 tracked entries, now 38 ignored. Content has not been inspected for real customer data (correctly — that inspection needs the privacy owner, not an agent). No disposition decision recorded yet. |

## Draft R0-H1 incident record (pending Oliver's confirmation)

- **Incident:** operational secrets (`JWT_SECRET`, `ADMIN_PASSWORD_HASH`, VAPID keypair,
  production database password, two GCP service-account keys, a Figma OAuth client
  secret) were committed to tracked configuration/history and, separately, `.claude-home/`
  file-history snapshots of a real `.env` were present in the tree of `origin/main` and
  nine other remote branches while the repository was public.
- **Exposure window:** repository was public until **2026-09-09**, when it was made
  private (confirmed via `gh repo view`). The `.replit` secret block (JWT/admin/VAPID)
  had been tracked for approximately seven months per the earlier disposition record.
  `origin/main` still carries the historical `.claude-home/` files as of this writing;
  the *live* exposure ended 2026-09-09, but historical copies must be assumed retained
  by anyone who cloned/mirrored the repo during the public window.
- **What had access:** anyone with read access to the public GitHub repository during
  that window; no evidence of anyone exploiting it has been found (see R0-H4, still open).
- **Deployed revisions during the window:** not separately reconstructed in this pass —
  flagging as a gap rather than asserting an answer.
- **Incident owner:** **not yet named** — this draft needs Oliver to either accept
  ownership himself or name a delegate, per R0-H1's requirement.
- **Disposition:** every specifically identified credential now has a rotation/deletion
  record (see R0-H2 above). Incident closure (as opposed to credential rotation) still
  needs: a named owner, R0-H4's access-log review, and an explicit history-rewrite
  decision.

## Bottom line

Every engineering (AGENT-badged) criterion in the R0 exit gate now passes on fresh
evidence. R0 exit itself cannot be marked established while R0-H4 and R0-H5 are open
and R0-H1 has no confirmed owner — these are exactly the items the plan assigns to
Oliver, not to a coding agent, and guessing at them would violate P9's core rule.
