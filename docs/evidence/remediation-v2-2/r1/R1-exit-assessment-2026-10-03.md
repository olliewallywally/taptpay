# R1 exit assessment — 2026-10-03

Branch: `remediation/r1-continuation-20260907`. Starting HEAD:
`31f64efc2d405d60e071f364a29d918cde66137b`, initially clean. Authority: the supplied
`attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt`, particularly R1.D,
P8.4a/P8.5, the latest execution ledger and dated owner decisions. This records the
remaining work; **R1 is not complete and R2 remains gated by its exit**.

Yesterday's S1 and today's S2 are **batches within R1-T7**, not the full R1 and R2 phases.
The owner requested R1 continuation and the start of S2. We followed that immediate
handoff, reverified S1 and implemented S2a; we did not interpret the request as permission
to weaken any R1 exit requirement.

| Task | Current engineering state | Still required for closure |
|---|---|---|
| R1-T1 harness | Implemented, including the October 1 proxy/network fixes | Independent review of the audit/fixes on the final candidate; continuous no-network gate |
| R1-T2 policy inventory | Implemented; current inventory remains 187 registrations, 0 unclassified/gaps | Independent review and regenerated facts for the final candidate |
| R1-T3 principal/tenant matrix | Implemented; S2a preserves existing permissions | Independent review; later storage families retain their own positive/refusal/effect checks |
| R1-H1 baseline | Owner accepted September 14; D10 direction recorded | Preserve that baseline; new acceptance cannot silently replace it |
| R1-T4 authentication | Web E1/E2/E3 code-complete; old account bearer retired | Independent review of sessions/external-review fixes and earlier A–D scopes; owner live proxy/admin/migration verification as recorded. Native Keychain explicitly stays A-T4 |
| R1-T5 Apple sign-in | Open; no real Apple/device acceptance is recorded | Protocol-specific adapter, actual provisioning and real supported-device evidence. A green web-session suite cannot stand in for this |
| R1-T6 strict inputs | Implemented; source/runtime guards remain | Keep the guards and family tests green on the final candidate |
| R1-T7 scoped storage/uploads | S0/S1 code-complete; S2a code-complete in this continuation | S2b authenticated writes, S3 property, S4 trades, S5 settings/exports; S6 private object/quarantine/scanning/download/retention lifecycle; independent review |
| R1-T8 hooks | Implemented | Independent review; maintain hook guard and zero unexpected React output |
| R1-T9 truthful frontend | Implemented, including October 1 response-shape corrections | Independent review against its recorded brief and accepted design |
| R1-T10 acceptance | Open, depends on T5/T7 and the other named prerequisites | Typed route contracts, complete device/tutorial matrix, automated and manual accessibility, product approval against the baseline |

No test count alone closes these rows. This session has no physical Apple device/signing
access, did not contact an application database, and performed no provider, migration,
deployment or push action. The known development 0030/0031 actions are carried forward
as **unverified recorded owner actions**, not newly measured missing migrations.

Immediate next code batch is S2b's preflight and failing scoped-refund tests. Keep the
reservation invariant and separate R4's durable operation/state/unknown-outcome decisions.
Gap 11 C2–C5 remains the recorded R3 schema gate. S6 must present concrete private-storage,
scanner/quarantine and retention/legal-hold choices through their dated decision process;
the prior Option C authorization decision must be preserved rather than reopened.

This is a technical assessment and continuation record, not independent security review,
Apple/legal/provider approval, migration approval or production release authorization.
