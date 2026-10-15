# R3 provider UAT checklist

Owner confirmed UAT can be arranged on October 12. This checklist does not
authorize production charging or enable any flag. Freeze the completed R3
candidate SHA and deploy it to an owner-approved UAT target before testing.
Repository code, synthetic PostgreSQL and actual provider evidence are separate.
Card/billing and receipt delivery are implemented; this checklist records the
external provider and release checks that repository tests cannot supply.

## Record for each case

Candidate SHA, UAT deployment URL, UTC time, flow/domain/share, exact expected
cents/currency, local attempt/inbox/event counts before and after, provider final
state and number/type of transactions, verified reference/account/environment
match booleans, send/retry count, local final status and receipt/delivery count.
Redact full provider/session/X-ID references, return/payment tokens, usernames,
stored-card credentials, cardholder details, API keys and authorization headers.
Do not upload raw request/response logs or real card data. Preserve sanitized
field names/types and presence/absence so protocol assumptions can be checked.

| Case | Expected behavior/evidence |
| --- | --- |
| Retail numbered and token purchase, approval and decline | Exact original attempt/share; one final transaction; one financial event; usage increments only once on approval. Browser `result` never decides. |
| Property and trades invoice, normal and split | Session belongs to its concrete invoice/share; exact cents including remainder; one paid-share increment. A different share/session is rejected. |
| Duplicate FPRN GET and supported POST | ACK only after receipt commit; repeated hints update arrival count without duplicate settlement. Confirm actual method, media type and session field casing. |
| Lost/expired browser return | FPRN/background worker still settles a valid persisted attempt; expired state cannot authorize a browser mutation. |
| Controlled UAT disconnect after possible session acceptance | Original UUID/X-ID/send marker stays held; no second create with a new identity. Confirm provider reference recovery and terminal query shape. |
| Decline, then a second card in the same session (T-3) | Decline a card on the hosted page, then try another card **without starting a new payment**. Record whether Windcave offers a retry, the session `state` after the decline and after the second card, and the transaction list each time. If the session reports `complete` after the decline and later reports an approval, T-3's full supersession is needed ([ADR](../decisions/2026-10-15-t3-decline-supersession.md)); until then that approval dead-letters with `PAYMENT_APPROVAL_NOT_RECORDED`. |
| Pending session, then approved/declined | UI stays processing; one later verified settlement. Document cancelled/abandoned session behavior when no transaction exists. |
| Card setup | Document zero-value verification transaction type/amount/currency/reference/account fields, final result, token/masked metadata presence and decline/abandonment shape. Redact the token. |
| Stored-card charge | Document returned amount/currency/type/reference/account field presence and final transaction identity; one billing-period operation and one charge after retries. |
| Stored-card ambiguous response | Agree with Windcave on supported lookup by retained X-ID/reference. Keep the original command held until verified; do not issue another charge to test recovery. |
| Real merchant/payer delivery | Confirm the actual receiver's stable-key deduplication contract and lifetime; repeated outbox delivery produces one success communication. Unkeyed uncertain delivery stays held. |

Integrity mismatches and arbitrary forged replies are already exercised with
synthetic transport; do not create a real mismatched financial operation merely
to reproduce those tests. Use only the provider's documented UAT test facilities.

The owner/provider tester records sanitized results. Codex then checks them
against the implementation and R2 exit questions. Official UAT evidence and a
production-sized restored migration/count review remain required before signoff.

Before enabling the release, explicitly establish whether a session reported as
final declined can subsequently approve on a later card attempt. Synthetic tests
cover one matching approval among prior declines in the same observed session;
they cannot establish the provider lifecycle across final observations. A later
contradiction remains held for reconciliation, never a new charge. Record repeated
X-ID behavior and its retention window; unknown creation without an identified
session remains held and is never blindly re-sent. Record PostgreSQL TimeZone UTC
and historical missing expectation/account counts in the restored production
preflight; never derive those identities from a provider response or silently
rewrite an already applied canonical migration.
