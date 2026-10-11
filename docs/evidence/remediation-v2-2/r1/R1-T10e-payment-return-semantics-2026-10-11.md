# R1-T10e payment-return wordmark semantics — 2026-10-11

Base: `3720c5f1fb24ef53c8e652f456d43af61753a132`; branch `fix/qwen-aligned-20261010`.
Scope: the named generic-span candidate on `/pay/return/:state`, retained as 12 repeated incomplete findings in the previous matrix. Those are repeated observations, not 12 distinct defects.

## Verification of Prior Fixes
Inspected the current payment-return component and shared `TaptWordmark`. The existing generic span carries `aria-label="taptpay"`, which its implicit role does not support. A failing-first component test rejected the absent named image role (1 failed, 1 passed). Chromium/axe reproduced one `aria-prohibited-attr` incomplete result using the original rendered wordmark markup reconstructed by removing only the new role. This was an incomplete result, not a violation.

## Blocking Issues
The bounded candidate is corrected by adding `role="img"` to the existing named wordmark. No blocker found for publishing this repair. Broader R1-T10e/T10f/R1/release acceptance remains open.

## High-Risk Concerns
The component is shared by checkout and receipt surfaces. A named image role represents the styled brand text as one logo; it leaves the custom merchant `<img alt="Merchant logo">` branch intact. Styles, DOM children, handlers, payment routing and financial behavior are unchanged. Actual screen-reader announcement remains part of manual acceptance.

## Missing Steps
Claude's separate stock-sheet hidden-focus review, incomplete contrast, experimental semantics, real devices/assistive technology, owner visual/golden acceptance and final independent acceptance remain pending. The prior 876-cell matrix has not been rerun for this one-attribute repair and is not presented as fresh evidence.

## Unsafe Assumptions
Passing these two targeted axe rules does not establish whole-page accessibility conformance. The isolated browser fixture renders the real `PaymentReturn` component, React Query and wouter route, with synthetic intercepted API replies; it is not a live-provider or deployed-app test. Approved/declined/cancelled navigation is covered by the existing payment-flow tests.

## Required Ordering Changes
The regression test was run and failed before changing production source. Root cause was then fixed, followed by targeted tests, real Chromium checks and typecheck. This record follows verification. No additional acceptance gate has been waived.

## Open Product / Provider / Legal Questions
No new product/provider/legal decision. Logo appearance is unchanged. Deployment remains with the owner.

## Compliance and Data-Handling Notes
Only synthetic browser requests were intercepted. No live API/provider/payment, data mutation, deployment or golden update. Private raw logs, compiled fixtures and rendered HTML are outside the repository at `/workspace/reviews/r1-t10e-payment-return-2026-10-11/`; only checksums are recorded below. Runtime logs and Claude's lane are excluded from this commit.

## Test and Rollback Adequacy
- Targeted Jest: 4 suites / 22 tests passed, including valid named brand/custom-logo semantics and existing approved/declined/cancelled return navigation.
- Chromium/axe component: original markup has one incomplete `aria-prohibited-attr` finding; fixed markup has no violations/incompletes and passes `aria-prohibited-attr` and `role-img-alt`.
- Chromium full-component synthetic fixture: missing browser state, pending result and unavailable result each pass both targeted rules, with zero page errors and `no-referrer`. Missing state makes zero API requests; pending/unavailable each make one intercepted request.
- `npm run check`: exit 0. Isolated browser fixture esbuild: exit 0. `git diff --check`: clean.
Rollback: revert this small implementation commit; no migration or data rollback.

## Final Recommendation (Approve / Do not approve)
Approve this bounded fix for the owner's previously authorized commit/push. Do not approve phase exit or deployment.

Separate implementer reread: retraced the one-attribute production diff, native custom-logo branch, test assertions, before/after browser rule results and synthetic full-component request/privacy checks. This is an implementer reread, not the outstanding final independent acceptance.

Private artifact SHA256 checksums:

- `wordmark-red.log`: `a52718a5d26c3da3bd23d40b810926d49f4b1570ffed01e0d37908f15cbe993f`
- `targeted-green.log`: `83d8fe9ec3570e7572a7097e983f0d522b0c63daa289c5b4667099cb4d44a960`
- `typecheck.log`: `0fedab01a35ca9fca53fe6fd66268f14af56d83677404c554d736f962da99fb3`
- `wordmark-browser.json`: `d0ae476314974e305e26528f49ea4c6b0acef7ecae3724eb0824a57577b243fd`
- `page-browser.json`: `deb390e2240bdf7784e3098c4dd1872069cff1b54918180529ffc6a28315609c`
- `fixture-build.log`: `63ca448f58b14596bb618edaee5b5fade215bea9bd52ebef356bbad715adde62`
