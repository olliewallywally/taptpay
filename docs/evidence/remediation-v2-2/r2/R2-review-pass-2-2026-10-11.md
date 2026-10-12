# R2 §21.1 review — pass 2 (recorded reread), 2026-10-11

A separately recorded reread of [pass 1](R2-review-pass-1-2026-10-11.md) and the
[preflight](R2-preflight-2026-10-11.md), as plan §21.1 allows. **It was performed by
the same session, not by an independent reviewer**; the final independent review of
R2 remains owed. The owner directed the session to keep moving on R2 rather than wait
for Codex.

Sources added in this pass: Windcave's public REST API page
(`developer-e-commerce-api-rest`) and Hosted Fields page
(`developer-ecommerce-hosted-fields`), read 2026-10-11. Statements below say where those
pages are silent.

## Verification of Prior Fixes

- Pass 1's unsafe assumption about `PUBLIC_ORIGIN` was **wrong**: `server/config.ts:413`
  already refuses any payment mode other than `disabled` without `PUBLIC_ORIGIN`, so
  `getBaseUrl` never reaches its Host-header fallback on a payment path. Withdrawn.
- Pass 1's assumed reply shape is **confirmed** for the fields R2 uses: a query reply
  carries `transactions[]` entries with `id`, `authorised` (boolean), `reCo`, `type`
  (`"purchase"`), `amount` as a two-decimal string (`"1.00"`), `currency` (`"NZD"`),
  `merchantReference` and `sessionId`. The page says to read `authorised` from the 0th
  transaction. Session `state` examples: `"init"`, `"complete"`; no full list is given.
- **Not documented** (still to confirm in UAT): HTTP 202 for a session query, duplicate
  X-ID behaviour on session creation, session lifetime.

## Blocking Issues

None for R2-T1–T3, provided the two conditions in the recommendation are met.

## High-Risk Concerns

1. **Multiple transactions in one session.** The documentation reads the 0th
   transaction; it does not say whether a session can hold a declined attempt followed
   by an approved one. A rule of "exactly one transaction" could reject a real approval.
   T3 must classify, not assume: approved only for exactly one authorised `purchase`;
   declined only when the session is complete and every transaction is unauthorised;
   anything else (more than one authorised, unknown type, missing fields) is
   **ambiguous** and stays reconcilable. Confirm the rule against UAT replies.
2. **Google Pay (RF-1) is worse than pass 1 stated.** Neither page documents a result
   carried on a `done` link; the current `result=approved` substring check rests on an
   undocumented behaviour. The fix (query the session after submitting) stays in T5.
3. **Notifications** are an unauthenticated GET with only `sessionId`, may arrive many
   times, and Windcave retries for 25 hours unless it receives 200/404 (the page lists
   502 inconsistently). T5's finalization must stay idempotent; nothing here changes in T1–T3.

## Missing Steps

- T2 must validate per relation from the documented list: `self` (`/api/v1/sessions/`),
  `hpp`/`seamless_hpp`/`submitCard` (`/pxmi3/`), `ajaxSubmitCard`/`ajaxSubmitApplePay`/
  `ajaxSubmitGooglePay` (`/mh/`), on the one host for the configured mode
  (`uat.windcave.com` or `sec.windcave.com`). The current fallback that accepts **any**
  `REDIRECT` link as the hosted page (`windcave.ts:156`, and the card-storage session at `424`) must go; `paymentMethod:paypal`
  and other unused relations are rejected.

## Unsafe Assumptions

- That a session query returns 202 while pending: undocumented. T1 must also treat a 200
  whose session is not `complete` (or has no transaction) as pending/unknown.

## Required Ordering Changes

None beyond pass 1: T1 → T2 → T3 → owner answers → T4 → T5 → T6.

## Open Product / Provider / Legal Questions

Pass 1's three owner questions stand. Add one for the provider: whether a session can
hold more than one transaction, and what the X-ID duplicate reply is for sessions.

## Compliance and Data-Handling Notes

No change. Fixtures are built from the documented shapes with synthetic IDs; nothing
from a real session is stored.

## Test and Rollback Adequacy

Adequate for T1–T3, with the added cases: a 200 with `state` not `complete`, no
transactions, one authorised among several, two authorised, a non-purchase type, and an
unlisted link relation or a `REDIRECT` link that is not `hpp`.

## Final Recommendation (Approve / Do not approve)

**Approve R2-T1, R2-T2 and R2-T3** on `ccr-e07e3100-0wm8kr` from `86e63302`, on two
conditions: T3 classifies ambiguous sessions as above, and T2 removes the any-`REDIRECT`
fallback. Route behaviour on live paths changes only in T5. **Do not approve R2-T4–T6**
until the owner answers the preflight questions. The independent R2 review remains owed.
