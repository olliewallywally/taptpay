# R1-T9 — handoff and independent-review brief (2026-09-25)

Branch: `remediation/r1-continuation-20260907`, local only, nothing pushed. R1-T9 (truthful
frontend failure states; v2.2 §8.8; source plan R1-T9 / C16) was finished on 2026-09-23, but it
had no plan §21.2 handoff and no brief for its independent reviewer. Every other piece of work
waiting for review has both. This file adds them. It changes no code.

## What R1-T9 covers

| Piece | Commits | Evidence |
|---|---|---|
| Pilot: retail analytics; the approved design (`DesktopLoadFailure`) | `c37f1602..025d638d` | [pilot](R1-T9-failure-states-2026-09-21.md) |
| The other eight screens: retail stock and terminal, property analytics and terminal, trades analytics and terminal, desktop settings | `0b0a9fb7`, `5805a416`, `f48139f6`, `64e12ef8`, `2e8b308a`, `6dd7bc68` | [rollout](R1-T9-rollout-2026-09-23.md) |
| Reports and exports made only from loaded data | `0c75e747`, `d5cf4d5f`, `88fe0e3f`, `721ce328` | [rollout](R1-T9-rollout-2026-09-23.md) |
| Found on the way: exports' business details after a password sign-in; GST in exports; the desktop quick invoice's "add client" | `707cff2f`, `5132caa9`, `0f748fde` | [exports and GST](R1-T9-export-business-details-2026-09-23.md), [rollout](R1-T9-rollout-2026-09-23.md) |
| Billing 402s: one banner, and the browser check | `1f6a8673`, `8a4e8c20`, `09b07a43`, `a2dee290`, `6562cf4f` | [402s](R1-T9-billing-402-2026-09-23.md) |
| Actions wait while pending, keep what was typed, cannot be sent twice | `0a257926`, `0220c6f9`, `09000e9f` | [pending](R1-T9-pending-and-double-submit-2026-09-23.md) |

The rollout is one unbroken run, `e4c25fb1..b86f0071`: 33 commits, 21 touching code, tests or
scripts and 12 touching only `docs/`. The pilot is earlier, between the R1-T8 brief (`c37f1602`)
and the R1-T4 work.

## Re-verified 2026-09-25 at `b86f0071`

The session that finished R1-T9 ended normally (its transcript's last line is the turn's end, not
a crash). Before writing this, the whole tree was re-run rather than relayed:

- `npx tsc`: clean.
- Server: 79 suites / 1,432 tests pass, the count recorded after `2a935b02`. R1-T9 changed no
  server code.
- Client: 86 suites / 760 tests pass, the count recorded after `09000e9f`.

Not re-run here: the red-first runs, the mutation checks and the browser checks. Their numbers
below are the authors' claims, from the evidence files.

## Handoff (plan §21.2)

```text
Phase / release:         R1-T9 truthful frontend failure states (C16), complete; not merged,
                         not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ b86f0071 (local); pilot 025d638d
Scope completed:         the nine desktop screens of v2.2 §8.8; optional sources say
                         "unavailable"; reports and exports only from loaded data; billing 402s
                         raise one banner (desktop, phone, and the customer's quote page);
                         actions wait while pending, keep input, cannot double submit
Files changed:           client/ and scripts/ (browser checks, fixtures) only, plus docs/;
                         `git diff --stat c37f1602 025d638d` and
                         `git diff --stat e4c25fb1 b86f0071 -- . ':!docs'`
Migrations:              none
Preflight queries:       none (no database change)
Commands run and results: 2026-09-25 at b86f0071: tsc clean; client 86 / 760; server 79 / 1,432.
                         Per piece (authors' claims, in the evidence): tests red first on the
                         unchanged code for their stated reason; every mutation check caught
Negative/no-side-effect: failure tests assert the money action is off or its request is never
                         sent; 402 tests assert the banner is the only message and the input stays
Provider/UAT activity:   none; the browser checks answer every /api request from fixtures and
                         block every other origin
Device/browser evidence: before/after screenshots per screen; loaded views compared with builds
                         from before each change; 402 browser check 9/9 on a production build;
                         export PDFs before and after
Security/privacy review: the customer's quote page no longer shows the business's billing words,
                         but the server's 402 body to that public route still carries them (open,
                         below); the business-details helper now takes the merchant from the
                         session token, and the server refuses another merchant's profile (403)
External actions:        none
Feature flags and payment mode after deploy: unchanged
In-flight operations:    none
Known warnings or deferred items: "Found, not changed" and "Open for the owner" below
Rollback commit and constraints: revert the commits; nothing stored changes. Reverting 5132caa9
                         brings back the wrong GST figures in exports
Approvals:               design approved by the owner 2026-09-21; GST rule set by the owner
                         2026-09-23; plan §21.1 review owed
Stop conditions checked: no money initiation enabled; no migration; nothing pushed
Next phase prerequisites: this review; the owner's answers below
```

## Found, not changed

- The same "a failure reads as empty" pattern outside R1-T9's desktop screens: the phone
  terminals, tenant profile, client directory and the phone trades reports button (file and line
  list in the rollout evidence, under property terminal).
- On a phone, rent automations cannot be paused, resumed or cancelled, and batch resend cannot be
  reached: nothing has opened that screen since `7b99299a` (2026-06-02).
- Desktop retail analytics: a failed refund's toast shows the raw error (`400: {…}`).
- Desktop retail "rename board" has no pending guard. Left on purpose: renaming is idempotent and a
  guard would drop a newer typed name.
- `merchant-terminal.tsx`, `merchant-terminal-mobile.tsx` and `demo-terminal.tsx` are routed
  nowhere (R8 dead-code candidates, noted under R1-T8), so they were not changed.

## Open for the owner

1. A customer who accepts a quote while the business's billing needs attention is turned away,
   and the business never hears of it. Should the business be told?
2. The public quote route's 402 body still carries the business's billing message. Recommended: a
   small server change so it carries the customer wording.
3. The unreachable phone batch/schedules screen: give it an entry again, or remove it?
4. Did anyone rely on an export made before `5132caa9`, for example for a GST return?
5. Choices made that the owner may overrule: the banner's words, the customer's words, and Tap to
   Pay closing its overlay on a billing refusal.

## Independent review — brief

**Ranges:** `c37f1602..025d638d` (pilot) and `e4c25fb1..b86f0071` (rollout; 21 commits touch
code, the rest only `docs/`), local only.

> You are the independent correctness reviewer for TaptPay, a payment-terminal SaaS in New
> Zealand. Review plan task R1-T9 on branch `remediation/r1-continuation-20260907`: the pilot
> `c37f1602..025d638d` and the rollout `e4c25fb1..b86f0071`. The requirement (plan v2.2 §8.8,
> `docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`): an essential query failure must never
> render as `$0`, an empty list, "no sales", "no saved card" or an enabled money action; failures
> get an in-frame `role="alert"`, a retry and disabled actions on desktop retail analytics, stock
> and terminal, property analytics and terminal, trades analytics and terminal, and settings;
> optional sources say "unavailable", never zero; mutations stay disabled while pending, keep
> input on failure and cannot be submitted twice; billing 402s state the required action with no
> conflicting duplicate banners. Start from
> `docs/evidence/remediation-v2-2/r1/R1-T9-INDEPENDENT-REVIEW-BRIEF-2026-09-25.md` and the five
> evidence files it lists; treat them as claims and re-derive everything from the code. Attack
> especially:
> - Any path on those screens where a request that failed, never ran or is disabled still shows a
>   zero, an empty state or a live money action. The rule used is `isError && data === undefined`:
>   consider `enabled: false`, a 200 with an unexpected body, a failure after a successful load,
>   and signing out and in as another merchant in the same tab.
> - Whether any report or export can still be made from data that did not load. Whether the GST
>   in every export is `total − total / 1.15` on the GST-inclusive amounts paid, shown only for a
>   GST-registered business, and rounded to the cent correctly (`5132caa9`).
> - Whether the business-details helper (`707cff2f`) can show one merchant's details to another
>   (shared cache keys; sign-out then sign-in in one tab).
> - Whether a 402 can still produce two messages, the server's words, or a misleading one such as
>   "Payment Declined", from any caller of the 15 billing-gated routes (`requireBillingCard` in
>   `server/routes.ts`); whether `isBillingCardRequired` can misread a different error; whether
>   the customer's quote page can show the business's billing message.
> - Whether the double-submit guards (`09000e9f`'s ref, `0a257926`) can stick after an error, an
>   unmount or a navigation and leave an action dead, or can be bypassed (Enter key, a second
>   button, a retry while the first request is in flight).
> - Whether `0f748fde` can promote a client the merchant does not own.
> - Whether any new test passes vacuously (for example, asserting the absence of text that no
>   version of the code renders), and whether the screenshot comparison can pass without really
>   comparing the loaded view.
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1 and end with Approve / Do not
> approve naming the commit ranges.

Reproduce:

- `npm run check`; `npx jest --selectProjects client`.
- Build each side with `npx vite build --outDir <absolute dir>` and serve it with
  `npx vite preview --outDir <absolute dir> --host 127.0.0.1 --port <port> --strictPort`. A
  relative `--outDir` resolves against `client/`. Before-builds: `e4c25fb1` for the screens,
  `d4bd9af0` for the 402 check, `cf408c7e` for the GST PDFs.
- `R1T9_AFTER_URL=… R1T9_BEFORE_URL=… R1T9_OUT=<dir> node scripts/capture-r1-t9-failure-states.mjs`
  (`R1T9_SCREENS=` limits it to some screens).
- `R1T9_402_URL=… R1T9_402_BEFORE_URL=… R1T9_402_OUT=<dir> node scripts/verify-r1-t9-billing-402-browser.mjs`
- `AFTER_URL=… BEFORE_URL=… OUT=<dir> node scripts/verify-export-business-details.mjs`
- Sandboxed Chromium may report itself offline; the 402 script forces it online. Phone toasts
  last 1.6 s; the 402 script samples every 100 ms.
