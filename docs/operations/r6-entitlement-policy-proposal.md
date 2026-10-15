# R6 D9 entitlement and dunning proposal

Status: **approved by owner on October15,2026**; see the
[dated D9 decision](../decisions/2026-10-15-r6-d9-entitlement-and-dunning.md).
Prepared against `aa0802b2` on
`remediation/r6-operations-20261015`. This document changes no runtime policy,
billing history, schema, deployment setting or release approval.

The remediation plan, section13.1, requires: “Product signs D9 and the dunning
policy.” The recommendation below makes that decision concrete. The existing
uncertain-cron-job approval does not answer D9.

## Recommended customer behavior

Honor a verified, explicitly recorded service entitlement for its recorded period.
Record why access exists: `paid`, `migration_grant`, `complimentary`, `trial` or
`dunning_grace`. Keep `lastBillingDate` exclusively for a real confirmed bill.
Classifying a historical row requires evidence; an active status, missing billing
date, or the existence of migration0014 alone cannot prove that row received a
grant. Unclassified cases require review before activation.

| Situation | Recommended behavior |
| --- | --- |
| Verified paid period is current | Allow service through its recorded end. Removing or expiring the renewal card does not remove the period already purchased. |
| Verified migration grant is current | Allow service through its recorded end without inventing a charge or billing date. |
| Explicit complimentary or trial period is current | Honor its recorded scope and end. This approval does not create new complimentary periods, trial offers or a grant-issuance endpoint. |
| A period has ended or has not started | The period itself grants no access. Evaluate any separately valid entitlement. |
| No subscription, invalid period or unclassified provenance | Report the case explicitly; do not create a grant or fabricate payment history. Resolve unexpected lockouts before activation. |
| A renewal fails after a verified paid period | Preserve the existing bounded dunning policy below. |
| Initial activation fails, or an unpaid grant expires | Do not create paid dunning grace from the failed charge or expired grant. |
| Cancellation or suspension | Preserve existing cancellation/suspension rules for paid billing. A verified current unpaid grant must not be shortened merely by an unsuccessful payment attempt. This decision does not add a cancellation or reactivation flow. |

## Recommended dunning policy

Preserve the current initial attempt and retries on days1,3 and7, measured from
the original due date, for at most four failed billing attempts. This retains
the existing recorded missing/expired-payment-method failures as well as confirmed
declines. Exhausting those four attempts suspends paid renewal access even if it
occurs before the grace deadline; it does not revoke a still-current unpaid grant.
Otherwise paid renewal grace ends at the existing period boundary plus eight UTC
days; the end is exclusive. Grace never becomes indefinite if cron stops.

Keep renewal-card readiness separate from service entitlement. Missing/expired
cards follow the existing durable missing-payment-method handling; they do not
prove a provider declined a charge. Transport timeouts and other uncertain
provider results remain unknown/reconciling under R3, retain their stable attempt
identity and do not count as a new confirmed decline or justify a fresh charge.
This recommendation does not change prices, existing charge identity, card
collection, retry ownership or charging activation.

## Repository work Codex can complete

After approval, perform the required scoped implementation review and record a
separate reread before changing access behavior. Then:

1. Design a forward provenance/history migration and truthful classification
   process. Preserve applied0048a/b/c and0049a. Require source evidence for
   historical classifications and isolate unresolved rows for review.
2. Extend the named-target, read-only inventory with counts by provenance and
   validity, before/after allowed/blocked totals and transitions, including
   merchants without subscriptions. Do not emit PII, tokens or row identities.
3. Rehearse migration, classification and policy comparison on an owned synthetic
   restore. A synthetic restore cannot establish real merchant provenance.
4. Put access and typed retry/grace rules behind one shared policy, used by
   `subscriptionHasPaidAccess`, its compatibility helper and every
   `requireBillingCard` consumer. Keep renewal eligibility separate. Do not patch
   individual routes with differing rules.
5. Verify the combined schema fingerprint, migration guards, DTO/privacy
   boundaries, durable billing behavior and relevant route regression. Record
   exact source/test evidence and update the handoff.

Approval permits the repository implementation and owned synthetic rehearsal.
Real-target classification, gate activation and deployment still require the
counts-only snapshot/rehearsal and release checks in the master plan. Stop if any
intended active merchant would become unexpectedly blocked.

## Acceptance cases to implement after approval

| Case | Required proof |
| --- | --- |
| Current paid/granted period | Access at start, access immediately before end, no access from that period at end. |
| Historical ambiguity | Missing billing date never manufactures a grant; unclassified cases appear in report counts. |
| Invalid or future dates | Invalid/reversed/future periods cannot grant current access. |
| Renewal card removed/expired | Existing service period remains available; renewal readiness is independently false. |
| Paid renewal decline | UTC day1/3/7 retries; at most four failures including recorded unusable-payment-method failures; suspension and eight-day grace boundaries match the policy. |
| Initial/unpaid failure | No paid grace and no invented billing date. |
| Provider uncertainty | Stable identity and reconciliation; no additional confirmed decline or replacement charge. |
| Shared consumers | All existing payment-send gates use the same entitlement decision; committed idempotent retries preserve current behavior. |
| Migration and reporting | Forward-only history, repeatable guarded tooling, reconciled aggregate totals, read-only report, no credentials or PII. |
| Restore and rollback | Preserve confirmed bills, grants, attempts and uncertainty; unexpected lockouts stop activation. |

## Remaining items that need an external prerequisite

| Item | Codex can prepare or execute here | Prerequisite for real completion |
| --- | --- | --- |
| Real-target before/after report | Implement and locally verify guarded tooling; inspect sanitized evidence. | Approved restored target, truthful provenance evidence and securely configured target access. |
| Windcave UAT | Prepare scenarios and evidence checks; fix any code defects found. | Approved UAT setup and actual provider results, with charging safeguards and scope review. |
| Scheduler, alerts and deployment probes | Supply exact settings and checks from the cron/readiness runbooks. | Authorized deployment access, approved application URL and named alert recipient. |
| Rolling restart and capacity | Prepare procedure and synthetic verification. | Approved combined build and representative deployment/load target. |
| Professional release review | Assemble implementation and verification evidence; address findings. | Actual qualified reviewer sign-off. Local self-review cannot substitute for it. |

No external prerequisite above prevents preparing the repository work. None is
recorded as completed by this proposal.
