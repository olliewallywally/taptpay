# Full integration continuation audit — 2026-09-07

Latest continuation (2026-09-22, resumed after the 2026-09-21 session hit its usage limit
mid-push). **This branch's history was cleaned before its first push**
([decision](../../decisions/2026-09-22-push-cleaned-branch-history.md),
[evidence](r1/R1-branch-history-clean-2026-09-22.md)). On 2026-09-21 the owner asked to stop, save
and push the completed commits. Pushed as it stood, the branch would have uploaded 101
`.claude-home/` objects that GitHub lacks, plus `.claude/settings.local.json`; the objects include
9 settings backups, two `.credentials.json` versions, session transcripts and shell snapshots. The
owner chose a cleaned copy instead. Re-verified from scratch today:
- GitHub, read live: the repository is private, the last push was 2026-08-26, the branch is absent,
  and the refs equal the local ones.
- 173 of 174 commits are identical except for those paths; one commit that touched only the agent
  folder was dropped.
- A push sends 0 such paths.
- A scan of every blob it sends found only test-fixture database URLs.

**Every commit ID from `83014135` onward changed.** Old IDs map to new ones in the
[lookup table](r1/R1-branch-history-clean-2026-09-22-commit-map.tsv). IDs written before 2026-09-22
refer to the original history, which is kept locally as `backup/r1-continuation-20260907-pre-clean`.
Corrected: the 2026-09-21 pass's "about 1,440 files" counted paths missing from `origin/main`, not
objects a push would send.

The work itself:
- **R1-T4 phase A is code-complete: `a9426330`, local, awaiting independent review**
  ([evidence](r1/R1-T4-phase-A-google-sign-in-2026-09-22.md)). The login page redeems the one-time
  code by POST and never takes a token from the address.
- Client 63/567, server 65/1,285, `tsc` clean.
- Real PostgreSQL verifier 6/6. It fails 24 vs 1 with the single-use condition removed.
- Real-browser analytics probe on the production build: 30/30. The pre-fix build fails 19,
  including an invoice-link token in `page_path` that phase A's redaction also closes.
- **Found and fixed with the owner:** dev sign-in answered 500 because the schema declares
  `users.session_version` and dev had migrations only through 0023. 0024–0028 were applied to dev
  as owner-approved, inventory as drafted
  ([decision](../../decisions/2026-09-22-apply-0024-0028-to-dev.md)). Dev status is 30/0/0/0 and
  sign-in answers 401 again.
- GitHub CI: `verify.yml` does not run on this branch (push trigger covers `main` and `feat/**`
  only). The secret scan's tree scan is clean. Its red history scan (124 unresolved) has **0**
  findings in the 173 pushed commits.

- **R1-T4 phase D is code-complete: `44a5cfc2`, local, awaiting independent review**
  ([evidence](r1/R1-T4-phase-D-sessions-2026-09-22.md)). Tokens carry the login's session
  version; a password reset or "sign out everywhere" advances it; older tokens get 401
  `SESSION_ENDED`; the login's live streams are closed. "Sign out of all devices" is under Log
  Out on phone, tablet and desktop. Client 65/578, server 66/1,294. PostgreSQL verifier 10/10;
  a read-then-write advance loses 18 of 20 concurrent sign-outs.
- **Owner questions from D — answered 2026-09-22**
  ([decision](../../decisions/2026-09-22-r1-t4-phase-d-owner-answers.md)): both recommendations
  accepted.
- **R1-T4 phase D follow-ups are code-complete: `50a469e7` and `36a320d6`, local, awaiting
  independent review** ([evidence](r1/R1-T4-phase-D-follow-ups-2026-09-22.md)):
  - A signed-in password change ends every other session and keeps this device signed in.
  - Push subscriptions record their login (0029). Log Out stops that device. "Sign out
    everywhere", a reset or a password change stop that login's devices. One iPhone's "off"
    stops that iPhone only.
  - Client 69/614, server 67/1,307. PostgreSQL verifier 15/15; the two new scoping checks fail
    when their clauses are removed. CI empty-database rehearsal 31/0/0/0, fingerprint
    byte-identical.
  - Found on re-check and fixed: "sign out everywhere" answered 500 after ending every session
    when stopping notifications failed.
  - The session doing this stopped at 07:23 UTC (container restart) and was recovered from its
    transcript. Its claims were re-run before anything was built on them.
- **Owner answers on the follow-ups (2026-09-22), all recommendations accepted:**
  - **0029 applied to the development database** at 08:04 UTC
    ([decision and outcome](../../decisions/2026-09-22-apply-0029-to-dev.md)): status 31/0/0/0,
    the push reads that failed work again, and the two existing rows are unchanged. Production is
    untouched.
  - **Disabling a teammate now stops their devices' notifications** (`b714efda`, test first).
  - **Resume-on-sign-in after a remote sign-out is confirmed** as built
    ([decision](../../decisions/2026-09-22-r1-t4-push-follow-up-owner-answers.md)).

- **R1-T4 phase C is code-complete: `e60e90c0`, local, awaiting independent review**
  ([evidence](r1/R1-T4-phase-C-throttling-2026-09-22.md)).
  - Sign-in (merchant and admin), forgot-password and change-password attempts are counted in
    `auth_throttle` (0028, already in dev) before the password is checked. Repeated failures are
    slowed down — 5 free, then waits doubling from 30 s to 15 min — instead of locking the account.
  - A device that has signed in before carries an HttpOnly, HMAC-tagged mark and is counted on its
    own, so no one else's guesses can keep a merchant out. A completed reset clears the login's
    waits. The login page says how long to wait.
  - The session that started C stopped at 08:50 UTC (usage limit) before writing any code. It was
    resumed from its transcript at 21:55, and its design was changed:
    - **address-keyed limits moved to phase B**: without a trusted proxy they are one bucket for
      everyone;
    - known devices were added: a per-email bucket alone lets anyone keep a merchant waiting.
  - Found and fixed: **change-password's current-password check had no limit**, so a stolen
    session allowed unlimited guesses. The day-old-row reclaim could also wait on, then delete, a
    row another attempt had just counted (now `SKIP LOCKED`).
  - Results:
    - client 70/616, server 69/1,347;
    - PostgreSQL verifier 24/24; without `FOR UPDATE`, 24 of 24 simultaneous attempts get through;
    - real browser 12/12. The old commit fails 7, including the merchant's own laptop being refused
      while someone else guessed.
  - Open for the owner: the numbers; the 6-character password minimum; the sign-in timing leak
    (which emails have logins; predates C); the address limits wait for B.

- **Phase C follow-ups, owner answers 2026-09-23: `f6c62f50`, local, awaiting independent
  review** ([decision](../../decisions/2026-09-23-r1-t4-phase-c-owner-answers.md),
  [evidence](r1/R1-T4-password-rule-and-sign-in-timing-2026-09-23.md)).
  - "You crashed again" was a container restart at 23:13 UTC, after phase C's turn had ended at 22:40.
    Phase C's claims were re-run and gave the same numbers. Dev, relaunched on `e60e90c0`, signs in
    normally through the Neon driver.
  - Q1: the slow-down numbers stay.
  - Q2: every new password needs 8+ characters, a capital, and a number or symbol.
    - One rule (`shared/password-rule.ts`) replaces three. Email verification and admin activation
      checked nothing at all before.
    - Sign-in does not apply the rule.
  - Q3: every merchant and admin sign-in spends one cost-12 check's work.
    - Older cost-10 hashes (3 of 5 dev logins) are topped up with stand-in checks, so they no
      longer stand out.
    - Refused sign-ins now take 275–295 ms whatever the email. Before: 5 ms with no login, ~75 ms at
      cost 10, ~280 ms at cost 12.
  - Results: server 71/1,375, client 71/623, tsc clean; browser 9/9 (the old code fails 6).
  - Open for the owner:
    - sign-up's 409 "Email already registered" says outright which emails have accounts;
    - forgot-password has the same timing leak, and on Autoscale "reply first, send after" risks
      lost emails;
    - existing passwords are not forced to change;
    - the invite page's heading is white on cream (predates this work).

- **No door says whether an address has an account (owner answers 2026-09-23 ~01:00): `8fdb63e0`,
  local, awaiting independent review** ([decision](../../decisions/2026-09-23-r1-t4-enumeration-owner-answers.md),
  [evidence](r1/R1-T4-account-discovery-2026-09-23.md)).
  - Sign-up answers every valid request "Check your email to continue." (no account number) after
    1.5 s. An address with an account is mailed a note instead of getting a second application.
  - The Resend button beside it had been a second oracle (404 "Merchant not found", by address or
    by number). It now gives one answer after 1 s, counted per address or number asked.
  - Forgot-password's 200 waits 1 s.
  - Found and fixed: the confirmation email put the sign-up name into its HTML unescaped.
  - The invite form now sits on its dark card (heading contrast 1.1 → 19).
  - Results: server 72/1,384, client 71/623, browser 14/14 (the old commit fails 4).
  - Open for the owner (pre-existing, found here): confirming an application needs only the
    emailed link, so a stranger-made application confirmed by the address's owner signs in with the
    stranger's password.

- **R1-T4 phase B is code-complete: `ce3c13de`, local, awaiting independent review**
  ([evidence](r1/R1-T4-phase-B-trusted-proxy-2026-09-23.md)).
  - `TRUST_PROXY_HOPS`: unset (the default) believes no forwarded header and applies no address
    limit; `0` means no proxy; `1`–`9` trust that many hops.
  - Once set, limits apply per visitor address, HMAC-keyed:
    - sign-in 50, never for a device that already knows the email;
    - forgot-password 10;
    - the Google callback 20.
  - Found and fixed: `getBaseUrl` read raw `X-Forwarded-Host`/`-Proto` when no public address was
    configured, so a forged header put `https://evil.test/…` into a reset email (dev only;
    production sets PUBLIC_ORIGIN).
  - Admin-only `GET /api/admin/request-origin` is the tool for the owner's live check (Q4), with the
    steps in the evidence §5.
  - Route inventory regenerated, 0 unclassified: phase A had hand-set `google/session` "public".
  - Results: server 76/1,420, client 71/623; 20 red first.

- **Owner answers to the phase B report (2026-09-23 ~03:22): admin sign-in `ff16abfe`, confirming
  with the password `2a935b02`, local, awaiting independent review**
  ([decision](../../decisions/2026-09-23-r1-t4-confirm-with-password-owner-answers.md),
  [evidence](r1/R1-T4-admin-sign-in-and-confirm-password-2026-09-23.md)).
  - "i cant log into admin anymore": `ADMIN_PASSWORD_HASH` is set nowhere in dev, so admin sign-in
    refused everyone. `npm run admin:password` makes the hash from a password typed unseen in the
    Shell. The admin email now matches whatever its capitals. **Owner action: set the secret**
    (evidence §1); the phase B live check waits for it.
  - Confirming an email needs the password chosen at sign-up; the link alone confirms nothing.
    Tries are counted per link. After a refused password the page offers a reset.
  - The session stopped at 03:31 UTC partway through the browser check (dev relaunched on the tree
    at 03:31:55 and works). It was recovered from its transcript; its claims were re-run, and two
    things were added: the reset offer, and the admin tool's sign-in page (`/login`, "Admin"; it
    said `/admin-login`, which nothing serves).
  - Results: server 79/1,432, client 72/627, browser 18/18; red first 8/8 and 4/5, +2.
  - Open for the owner: the unused public `POST /api/merchants/verify` confirms with the link and a
    new password (recommend removing); 1 of 3 waiting dev applications has no password and now needs
    support, where before it could confirm by link and sign in with Google (recommend leaving it).
    Q3: the team-invite message stays. Q4: R1-T9 next.

- **R1-T9 rollout started (2026-09-23): retail stock and terminal `0b0a9fb7`, property analytics
  `5805a416`, property terminal `f48139f6`, trades analytics `64e12ef8`, local, awaiting
  independent review** ([evidence](r1/R1-T9-rollout-2026-09-23.md)).
  - A failed load no longer reads as "0 products", "$0 today" or "no sales yet": each screen says
    what did not load, with Try again. The terminal's two send buttons stay off until its sales
    load.
  - Red first on `e4c25fb1`: 3 of 6 and 3 of 6; mutations 4/4 and 7/7; client 74/639, `tsc` clean.
  - Loaded views unchanged against a build of `e4c25fb1`: the screenshot check was made
    repeatable first (the same build captured twice had differed).
  - The session stopped at 03:53 UTC: the whole workspace restarted during the terminal's
    mutation check. Recovered from transcript `f708258c`; the page on disk matched the intended
    edit byte for byte, and every claim was re-run.
  - Trades analytics: its history takes client names from the clients request, so a clients
    failure put "Job payment" on every row; it now says "client names didn't load" with try
    again. Reports and exports there are made only from loaded data: Generate while loading, then
    a failure, left a $0 report with no alert, and an export opened while loading stayed usable
    after a failure. Retail and property analytics have the same two gaps (not yet changed).
    Red first 8 of 11; mutations 18/18; client 77/667; loaded views match `c3dab4a8`.
  - The session stopped at 04:41 UTC on the usage limit, not a crash, one second after writing
    the trades analytics tests. The next session checked them against the page, added three, and
    ran them red first.
  - **Found and fixed, `707cff2f`: exports lacked the business details after a password
    sign-in** ([evidence](r1/R1-T9-export-business-details-2026-09-23.md)). The helper that
    stamps reports with the business name, GST number and GST settings read a storage key only
    Google sign-in writes, so since 2026-07-11 password users' exports said "TaptPay Merchant"
    with no GST number, and property's income statement had no GST line. Tests red 4/4 first,
    mutations 3/3, client 78/671. (This entry first called trades GST "worked out inclusive" a
    fault and $1,637.40 the fix; that was backwards, corrected by `5132caa9` below.)
    **Owner question:** did anyone rely on an earlier export, e.g. for a GST return?
  - **GST corrected, `5132caa9`** (owner, 2026-09-23: *"gst is 15% its a very simple
    calculation, get it right"*): every trades invoice amount is what the customer pays, GST
    included (a quote's total includes it; the checkout charges the amount as it is; the
    server's own receipt shows GST as total − total / 1.15). So the GST in what was invoiced is
    total − total / 1.15: $1,423.83 on $10,916.00. The Invoice Summary's "exclusive" branch,
    there since 2026-07-10/11, added 15% on top ($1,637.40, "incl." $12,553.40); `707cff2f` had
    spread it to password sign-ins (not released). Also: no GST figure for businesses that are
    not GST registered (trades Invoice Summary, retail Sales Summary). Red 9/10, mutations 5/5,
    client 82/729; browser PDFs before/after
    ([evidence](r1/R1-T9-export-business-details-2026-09-23.md)).
  - Then all three analytics screens make reports and exports only from loaded data, each waiting
    for exactly its sources (exports also for the business details): trades `0c75e747`
    `88fe0e3f`, property `d5cf4d5f`, retail `721ce328` (per report: with the boards failed, only
    Revenue by Board waits). Mutations 36/36; client 78/692; loaded views match `c3dab4a8`.
  - Trades terminal `2e8b308a`: invoices, clients, quotes, schedules, reminder settings and
    business details each say when they did not load. Notable: failed reminder settings showed
    "on" and were switchable; failed business details priced quotes without GST with create
    quote live, and cached a `null` where exports would have read it as loaded. Red 10/16,
    mutations 30/30, client 80/709. Also fixed, `0f748fde`: the desktop quick invoice's "add
    client" posted to `/api/trades/clients//promote` (no id) since 2026-08-06.
  - Desktop settings `6dd7bc68`, the last screen on the list: business details that did not load
    showed a blank form whose Save would overwrite the real details, and "Your Business" as
    PENDING; access that did not load told the owner that the owner manages everything; a plan
    that did not load showed the default plan with charge disclosures worked out from it and
    plan, card and cancel actions live; a card that did not load read as "Add payment method".
    Red 7/9, mutations 28/28, client 81/720.
  - **Billing 402s: one message, from the banner** — `1f6a8673`, `8a4e8c20`, `09b07a43`,
    `a2dee290` ([evidence](r1/R1-T9-billing-402-2026-09-23.md)). A 402 (subscription needs
    attention) now raises one banner, "Subscription needs attention — You can't send payments
    until it's sorted in Billing", with Open Billing; the action adds nothing and keeps what was
    typed. Before: actions repeated the server's text under a banner saying "Credit or debit card
    required" (a rule dropped 2026-08-10); phone Tap to Pay said "Payment Declined" though no card
    was declined, with no banner; phone resends said "Could not resend link" or "Resent 0 · 1
    failed", with no banner. A customer accepting a quote was shown the business's billing
    message; now "This quote can't be accepted online right now. Please contact the business to
    go ahead." Red first on every screen; mutations 39/39 (shared 6, desktop 10, quote 1, phone
    22); client 86/754, `tsc` clean; real browser 9/9 on a production build, each against a build
    of `d4bd9af0` (screenshots). The session stopped at 09:51 UTC on the usage limit after
    `8a4e8c20`; the next re-ran its claims (85/85, the quote mutation) before continuing. Found
    (pre-existing, not changed): on a phone, rent automations cannot be paused, resumed or
    cancelled, and batch resend cannot be reached. Nothing opens that screen since `7b99299a`
    (2026-06-02).
  - **Actions wait while pending, keep what was typed, cannot be sent twice (R1-T9's last item)**
    — `0a257926`, `0220c6f9`, `09000e9f`
    ([evidence](r1/R1-T9-pending-and-double-submit-2026-09-23.md)). All 34 desktop actions were
    surveyed, then the phone payment screens. Fixed: desktop property lost a typed payment
    reference when marking failed, and its reminder switch and chips stayed live during a save;
    phone property and trades "mark received" failed silently; a second tap on phone retail's send
    during a slow create made a second sale. Red first 6/6; mutations 9/9; client 86/760, `tsc`
    clean.
    **Owner questions:** should the business be told when a customer's acceptance is refused for
    billing? Should the public quote route's 402 carry the customer wording too (its body still
    has the business's message)?
- **R1-T9 handoff and review brief (2026-09-25)**
  ([brief](r1/R1-T9-INDEPENDENT-REVIEW-BRIEF-2026-09-25.md)). R1-T9 had been finished with no
  plan §21.2 handoff and no reviewer brief; every other piece awaiting review has both. Re-run at
  `b86f0071` first: `tsc` clean, server 79/1,432, client 86/760, as recorded. The session that
  finished R1-T9 ended normally (its transcript's last line is the turn's end). The review list
  below had left out two code commits: the pilot (`025d638d`) and the 402 browser check
  (`6562cf4f`). The brief's two ranges, `c37f1602..025d638d` and `e4c25fb1..b86f0071`, cover
  all of R1-T9.
- **R1-T1's audit (C09) is code-complete: `05195728`, local, awaiting independent review**
  ([evidence](r1/R1-T1-harness-audit-2026-09-25.md)). The harness's "no network, no database,
  no cron, no Vite" was only a test title, and the app it built lacked production's pipeline.
  - Every server test file now runs with a guard. It refuses and records any connection, name
    lookup or UDP send off the machine, and fails the test even when the code swallowed the
    error.
  - It caught two tests that dialled `192.0.2.1:5432` to imitate an unreachable database. They
    now use a silent server on this machine.
  - `server/app.ts` is the pipeline `index.ts` had, moved unchanged except the log writer. The
    harness builds the same app, so tests see production's headers and request log.
  - Added `providerNotification`, `useFakeClock` and `openEventStream`. The public payment bearer
    fixture is now exercised.
  - Red first 21 of 24; mutations 30/30; server 81/1,456 with the guard; client 86/760; `tsc`
    clean. Pipeline headers are identical to the running dev server's.
- **Found by that audit and fixed: live updates never reached a browser** (`3fac8ac8`,
  [evidence](r1/R1-live-updates-compression-2026-09-25.md)).
  - Since `7f52fe11` (2026-04-07), compression held back every event of
    `GET /api/merchants/:id/events` for any client that accepts compression, which is every
    browser. Screens polled instead (every 3–30 s), so it looked fine.
  - Shown on the dev server, and in real Chromium 125 before and after: nothing in 3 s, then the
    event at once.
  - Compression now skips event streams. Red first 2 of 3; mutations 3/3; server 82/1,459.
  - **Owner question (gap 12):** customers' no-board page receives live events again, and with
    them the residual you accepted in September. Nothing changes for an attacker. Keep this, or
    keep live updates off for that page until per-transaction addressing closes the residual?
- **Owner answers (2026-09-25 07:13 UTC)**
  ([decision](../../decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md)):
  no-board payments should work "like the other verticals" (a rework, item 1); tell the business
  about a quote refused for billing (2a), give the customer the customer wording (2b), bring the
  phone batch/schedules entry back (2c); "fix and move to the next phase".
  - **2a + 2b `e70dc724`, 2c `da90d1a1`, local, awaiting independent review.** The session that
    made them stopped at 07:38 on the weekly usage limit (its JSONL ends with the limit message,
    then `turn_duration`), before recording them here or answering the owner. Resumed ~10:40;
    both commits checked against their messages; baseline re-run at `da90d1a1`: `tsc` clean,
    server 83/1,466, all green.
- **The no-board rework (item 1): `09df766f`, `f5ef0d11`, `a2634ef3`, `a703847b`, `5c2cdb27`,
  local, awaiting independent review** ([evidence](r1/R1-no-board-rework-2026-09-25.md),
  [working notes](r1/WORKING-2026-09-25-no-board-rework.md)).
  - **Gap 12 is closed by retirement (Option A), not narrowed.** The business-wide no-board
    address is gone end to end:
    - its anonymous feed and "current sale" read answer 410 `NO_BOARD_ADDRESS_RETIRED`, and so
      do its QR image and its NFC tag (a notice page);
    - a board-less sale is always per-payment (a shared one is 400);
    - no response or live screen hands the address out.
    Boards are unchanged. The route inventory's one suspected gap is resolved (0 suspected, 0
    unclassified).
  - The phone terminal now reads its current sale signed in. The anonymous read never saw its
    per-payment sales, so "Payment Received" missed its chime on any payment over 30 s. Its
    share screen and QR pop-up carry the sale's own link, never `/pay/<merchant>`. The customer
    notice, the board builder (a board's QR; no "Main Payment Link"), the Payment Stack's Copy Link
    and the admin page follow.
  - **Found and fixed on the way (`a2634ef3`):** the phone Payment Stack had sent no
    Authorization since `c7220cea` (2026-05-12), so it could not load its sales.
  - Tests first everywhere (red counts in the evidence); mutations 40/40; `tsc` clean; server
    84/1,472; client 92/779; real Chromium 21/21 on a production build (9/21 on `da90d1a1`).
  - **Left as the owner's (his standing instruction):** the "Customer Payment Page" button and its
    tutorial step (settings redesign §2). They now open the no-board notice.
  - **Owner questions:** that button; a "new link" button for re-sharing a board-less sale after a
    reload; two pre-existing faults found (the phone share screen's "download QR" saves an
    unscannable picture; the cash-sale "copy receipt link" copies the demo address).

- **Owner answers on the rework (2026-09-25)**
  ([decision](../../decisions/2026-09-25-share-dropdown-and-fixes-owner-answers.md)): the model
  confirmed (per-sale links without a board; a board is one printed QR, fixed until deleted); a
  sale dropdown on the phone share page; "fix them".
  - **`1fb41d14`, local, awaiting independent review**
    ([evidence](r1/R1-share-dropdown-and-cash-2026-09-25.md)):
    - the share page lists the open sales it can share, and sending opens it with that sale;
    - "download QR" saves a real PNG;
    - **phone cash sales are recorded**: they never were, the screen said "success" and saved
      nothing.
    Red first 6/9 and 10/14; mutations 22/22; client 93/789; real Chromium 28/28.
  - Back to the owner: the settings button (unanswered); boards are capped at 10 at a time
    (`TAPT_STONE_LIMIT`) though he said "as much as they want".
  - **His request to exempt `oliverharryleonard@gmail.com` from the card requirement was not
    done:** the auto-mode safety check denied reaching the development database. His to allow or
    do.

- **R1-T2's remaining parts (C10), 2026-09-26: `12bc7d78`, `a394cae3`, `c85501ad`, `9869da1c`,
  `5e098281`, `cee1276a`, local, awaiting independent review**
  ([working notes](r1/WORKING-2026-09-26-r1-t2-c10.md)).
  - Coverage (`12bc7d78`): every file that registers on the app is inventoried (`app.ts`,
    `routes.ts`, `index.ts`, `vite.ts`). Every `app.use` has a middleware policy entry, in order,
    checked layer by layer against the harness app. The five `ALL` callbacks are driven with all
    34 methods.
  - Facts (`a394cae3`): a syntax-tree pass records what each handler does in the policy:
    middleware, parsers, validation, ownership checks, storage calls, side effects, statuses,
    DTOs, error text, gates and rate limits. A test fails on drift.
  - Review (`9869da1c`, `cee1276a`): a hand-written review per route, held to those facts by rules.
    31 of 223 are reviewed; the other 192 are on a list that can only shrink. Batch 1 covers
    provider callbacks, cron, the ecommerce API and billing callbacks. Batch 2 covers payment
    links, numbered board sales and the payment returns.
  - Fixed from the review. `c85501ad`: the WhatsApp webhook fails closed and compares its key in
    constant time; the ecommerce API checks permission before reading the body and hides other
    merchants' sales. `5e098281`: a board sale splits only when the business allows it, with the
    link route's strict body; the Windcave return parses its sale number strictly.
  - Mutations 12, 14, 14 and 9, all caught; server 93/1,699 at `cee1276a`; `tsc` clean.
  - Left for later phases, recorded in the review:
    - `GET /api/transactions/:id` lists every sale by counting;
    - read-then-write settlement (R3/C20);
    - `authenticateToken` answers 403 for an expired token where P2.2 says 401 (R1-T3);
    - about 40 property and trades UUID ids are read raw (§8.4).
- **Owner answers (2026-09-26 ~02:56 UTC)**
  ([decision](../../decisions/2026-09-26-split-amount-settings-button-board-limit-card-free-owner-answers.md)):
  - **exact share only, `442bfadf`**: a board sale's customer pays exactly the share owed, and any
    other amount is refused before a provider session (before, every share of $100 could be paid
    with $0.01). The split page drops its amount box and rounds like the server.
  - **the settings button opens the boards, `717b7384`**, and its tutorial step says so;
  - found on the way, **`a419f948`**: a board sale's "Cancel payment" and "Try Again" no longer
    lead to the retired `/pay/<business>`;
  - boards stay capped at 10;
  - **the card-free account is still not done**: the auto-mode safety check denied the one
    dev-database write he approved. Nothing was written. His to allow or run.
  - The session crashed (container restart 03:08 UTC) before committing. Resumed from its
    transcript and re-verified: `tsc` clean, server 94/1,706, client 96/799, mutations 14/14.
    Local, awaiting independent review.
- **Pushed on the owner's word (2026-09-26): `93aa6a0a..30c9d8cb`**, a fast-forward of 78 commits;
  the repository is still private, and the push carried no agent folders and no secrets.
- **C10 continued (2026-09-26): batch 3a `567e1cfa`, `8fb4d341`; batch 3b `ba1b6742`, `6f887234`;
  local, awaiting independent review** ([working notes](r1/WORKING-2026-09-26-r1-t2-c10.md)).
  56 of 223 routes are reviewed; 167 are pending.
  - Batch 3a, invoice checkout and quote links (11 routes). **Fixed, `567e1cfa`: any approved card
    payment on the platform (a $1 purchase anywhere) could mark someone's unpaid single-payment rent
    or trades invoice paid.** It is R1-T7's hole on the invoice routes. Also: the provider session
    id goes into the provider's address as one encoded segment, and the split count is strict.
  - Batch 3b, the sign-in entry points (14 routes). **Fixed, `ba1b6742`: a database fault made a
    good password-reset link look expired.** The extractor now recognises the sign-in checks and
    every email sender. Two tenant kinds, `credentials` and `mailbox`, each come with a rule.
  - Mutations 11/11 and 18/18; server 97/1,737; `tsc` clean. At the resume, batch 3a was
    re-verified independently: the suites as recorded, and its 11 mutations re-run, 11/11.
  - For the owner, to be asked with batch 3c's questions:
    - split invoices accept any approved session per share: each opened session needs a record
      (an interim migration, or wait for R3);
    - retire `POST /api/checkout/pay` and `POST /api/merchants/verify`: nothing calls them, and the
      second gets around the 2026-09-23 rule;
    - retire the old `/business-details` page with `GET /api/merchants/:id/email-status`, or
      require sign-in;
    - the reset page calls a failed check an expired link.
  - Recorded for later phases: the sign-up confirmation token is unhashed and never expires; admin
    sign-in shows which address is the admin's while `ADMIN_PASSWORD_HASH` is unset; sign-up's only
    limit is a count shared with the board page's 3-second feed and numbered pay.

**Next:** R1-T2's review, batch 3c (the 20 pending routes with no sign-in middleware), then the
batch 3 owner questions together, then the signed-in families; 167 routes are pending. Then
R1-T3's runtime matrix, on the audited harness. Also for R1-T2: `POST /api/board-builder/submit` is
public with no rate limit (it emails a supplied PDF to the owner's inbox), and its PDF may not fit
the 100 KB request limit (to check in 3c). Open for the owner: the card-free dev write (above). The
no-board rework's questions are all answered. Release of the rework: when production has no pending
shared no-board sale (count-only check once production is reopened), with
`FEATURE_NEW_RETAIL_PAYMENTS` on.

The phase B live check waits for the owner to set `ADMIN_PASSWORD_HASH`.
Independent reviews owed (each evidence file ends with its brief):
- C10 so far (`2ec9d78f..cee1276a`), the 2026-09-26 owner answers (`cee1276a..a419f948`), and
  C10's batch 3 so far (`30c9d8cb..6f887234`);
- the no-board rework (`da90d1a1..5c2cdb27`), its follow-up (`7051e25e..1fb41d14`), and the
  owner-answer fixes 2a–2c (`aba7b2be..da90d1a1`);
- R1-T1 (`03c4663b..05195728`) and the live-updates fix (`05195728..3fac8ac8`);
- gap 13, R1-T8;
- R1-T4 A (`ed847cda..a9426330`), D (`46cdc475..44a5cfc2`), the D follow-ups (`6abc2a03..b714efda`);
- C (`b9c947bb..e60e90c0`), the C follow-ups (`4b496104..f6c62f50`);
- the account-discovery follow-ups (`04e557eb..8fdb63e0`);
- B (`fa0b0230..ce3c13de`);
- admin sign-in and confirming with the password (`0d0a4a10..2a935b02`);
- R1-T9, all of it: the pilot `c37f1602..025d638d` and the rollout `e4c25fb1..b86f0071`
  ([brief](r1/R1-T9-INDEPENDENT-REVIEW-BRIEF-2026-09-25.md)). By piece: retail stock and
  terminal (`e4c25fb1..0b0a9fb7`), property analytics (`fafc6598..5805a416`), property terminal
  (`568d85c9..f48139f6`), trades analytics (`c3dab4a8..64e12ef8`); exports' business details
  (`dc07b6b8..707cff2f`); reports and exports from loaded data (`37da05d1..721ce328`); trades
  terminal and the quick invoice's add client (`9be83f59..2e8b308a`); desktop settings
  (`ca6573be..6dd7bc68`); GST in exports (`cf408c7e..5132caa9`); billing 402s
  (`d4bd9af0..a2dee290`, and the browser check `6562cf4f`); pending and double submit
  (`6562cf4f..09000e9f`).

Prior continuation (2026-09-21, R1-T4 plan). **Security finding:** on Google sign-in the server
redirects to `/login?token=<one-hour JWT>`, and GA4 records the page address before the login page
removes the token — shown with a local stub of gtag.js, nothing sent to Google — so every past
Google sign-in sent a working (now expired) account token to the GA property. Also: no OAuth
`state`/nonce/PKCE, `email_verified` unchecked with email-based linking, no early session cancel,
hourly sign-out, no `trust proxy`. Plan with phases A–E and owner questions Q1–Q5:
[PLAN-2026-09-21-r1-t4-sign-in-security](../../PLAN-2026-09-21-r1-t4-sign-in-security.md). Nothing
implemented; the site is private, so nothing is leaking now. **Waiting on:** the owner — R1-T9's
design approval and R1-T4's Q1–Q5. Nothing pushed.

Prior continuation (2026-09-21, R1-T9 pilot — the owner: *"ok go ahead"*, i.e. propose the
failure-state design, then apply it after approval). Retail analytics with its sales request failing
showed "$0.00 total revenue", "0 transactions" and "no sales yet"; every other R1-T9 screen has the
same flaw ([proposal](r1/R1-T9-failure-states-2026-09-21.md)). **Pilot committed, `2c013f33`:**
`DesktopLoadFailure` (desktop palette only — no red/green/amber) replaces the figure, chart and
history with "Sales didn't load" / "Payment history didn't load." and Try again, and makes Reports
and Export unavailable; tests first (3 of 5 red), mutations 3/3, client 61/557, loaded view
pixel-identical to the pre-change build. Screenshots in `r1/r1-t9-proposal-2026-09-21/`. Also:
the capture script blocks third-party origins — an earlier run of it attempted one Google Analytics
page view from a headless browser (the request failed, `ERR_ABORTED`). **Waiting on:** the owner's
approval of the design. **Next meanwhile:** the R1-T4 plan and its owner questions. Nothing pushed.

Prior continuation (2026-09-21, R1-T8 — the first R1 task after R0 exit). **The hook-order crash
is fixed on the branch, commit `387d189d`, awaiting independent review**
([evidence](r1/R1-T8-hook-order-crash-2026-09-21.md)). Seven merchant pages returned early before
most of their hooks; Sign out on /settings (token removed, then the page transition re-renders the
outgoing page) threw React error #300, reproduced in a real browser on the pre-fix build.
`MerchantGate` now resolves the merchant above each page (keyed by merchant; one redirect, from an
effect, skipped when already on /login; each page's way of leaving unchanged). New gates in the
client suite, which CI always runs: `rules-of-hooks` over the whole client with inline comments
ignored (67 findings → 0), and `jest.setup.js` failing any test in which React warns (18 act()
warnings → 0). Tests first (20 of 42 red for the stated reason); client 60/552; `tsc` clean;
mutations 5/5; the four routed phone pages pixel-identical to the pre-fix build; device smoke 20/20.
Three of the seven pages are routed nowhere (R8 dead-code candidates). Found for R1-T9: six pages
throw on a malformed response instead of showing a failure state. **Next:** R1-T9 (truthful
failure states, C16), then R1-T1's audit ahead of R1-T4. Independent reviews owed: gap 13
(`acef4e42..HEAD`, brief in gate evidence §11) and R1-T8 (`c6667985..387d189d`). Nothing pushed.

Prior continuation (2026-09-21, later still — the owner answered the production question,
verbatim *"the whole site is private"*, and directed *"ok lets move on to the next phase"*).
**Recorded:** production's closure is deliberate
([decision](../../decisions/2026-09-21-production-offline-owner-answer.md)); every production
step (gap-13 count, preflights, releases) waits for the owner to re-open it. **R0 exit
ESTABLISHED** ([record](r0/R0-exit-established-2026-09-21.md)): all nine gate criteria re-run
fresh on `4a9129df` — `tsc` clean, client 57/511, server 64/1272, build exit 0 with every database
variable removed, device smoke 20/20 (phone/tablet/desktop/D10 short desktop × 5 routes), R0-T1
9/9 — with R0-H1/H4/H5 closed by the owner on 2026-09-14 (attestations, not agent verification).
**This unblocks R1-T1's audit, R1-T4 and R1-T8** (task rows updated). R1-T8 measured: 66
`rules-of-hooks` violations in exactly the seven named pages, plus 1 in a test file (commit
`7822b19a`'s message says 67 in the pages — the 67 includes that test file). **Next: R1**, starting with R1-T8
(the hook-order crash — no owner decision needed), then R1-T1's audit ahead of R1-T4 (plan order
C09 → C11), whose design will need owner decisions. Gap 13's independent review (§11 brief) is
still owed before gap 13 can merge. Nothing pushed.

Prior continuation (2026-09-21, late — resumed after the container rebooted at about 06:41 UTC,
four minutes after the previous turn ended; **nothing was lost**: all of that work was already
committed as `60a2ca0b`). Every claim **re-run, not relayed**: `tsc` clean; server 64 / 1266;
client 57 / 511; scripts 51 / 51; PostgreSQL verifier 14 / 14; CI's migration steps with the
version-2 list and the fingerprint byte-identical; browser check PASS at 390 / 820 / 1440 (its
first run since `d0e99c23`); development's ledger still ends at `0023` (read-only check). **Two
small drafting-tool defects found and fixed** (`a25aaf09`, tests first, 3 / 3 mutations caught,
server 64 / 1272): a refusal pointed at a script that does not exist, and the tool could draft —
and print an approval SHA-256 for — a list the runner then refuses (a non-ASCII or over-long
`--approved-by`). Both failed closed. §7's review prompt predated three commits; the refreshed
brief is §11. **Production still offline** at 10:14 UTC (Neon endpoint disabled; `taptpay.co.nz`
private) — the owner question stands; nothing changed. Details:
[gate evidence §10](r1/R1-T7-gap13-ownership-inventory-gate-2026-09-21.md#10-re-verification-after-a-container-reboot-and-two-drafting-fixes-2026-09-21-late).
Next: the independent review of `acef4e42..HEAD` using
[§11](r1/R1-T7-gap13-ownership-inventory-gate-2026-09-21.md#11-independent-re-review--refreshed-brief).
Nothing pushed. Correction to the entry below: the `.replit` port line (24678 → 5173) was not
"discarded" for good — Replit re-adds it for the development server's live reload. It is harmless
and stays out of every commit.

Prior continuation (2026-09-21, night — the owner approved every
recommendation: "please go ahead with all of your recommendations";
[decision](../../decisions/2026-09-21-gap13-ownership-rule-and-retention.md)).
**Ownership rule built and verified, not applied anywhere:** each invoice
document is listed once, as `owner` (evidence: TaptPay's own records — one
merchant attached it within 24 hours of its upload — or an upload log or
attestation) or `locked` (kept, admin-only, audited); the runner re-derives
every records claim itself under the lock; `0025` records locked entries too.
New read-only drafting tool (`npm run db:draft-upload-inventory`, `--count-only`).
Tests first; 5/5 mutations caught; PostgreSQL verifier 14/14 including the real
tool; CI rehearsed with a version-2 list; fingerprint re-recorded (diff confined
to `0025`'s table). **Counts:** development 2 documents — 1 gets its owner
automatically, 1 locked (never attached). **Production could not be counted:**
the workspace's production database endpoint answers "The endpoint has been
disabled", and `taptpay.co.nz` is a private Replit deployment (every visitor is
sent to Replit sign-in) — nothing in the repository explains either; **owner
question**, nothing changed. **Retention:** invoice documents 7 years after the
tax year, ownership records with their document, admin-read log 7 years —
decided, professional confirmation (incl. AML/CFT status) and the deletion job
outstanding (`A-H3` partly decided). `.replit` stray port mapping discarded.
Details: [gate evidence §9](r1/R1-T7-gap13-ownership-inventory-gate-2026-09-21.md#9-update--the-automatic-rule-locked-not-blocking-2026-09-21-evening).
Next: the independent review of `acef4e42..HEAD`. Nothing pushed.

Prior continuation (2026-09-21, evening — the owner answered Q1–Q4;
[directions](../../decisions/2026-09-21-gap13-owner-directions.md)). **Q1 done:**
the checkout document route now looks the link up first and counts only real
invoices, so the platform-wide 600-a-minute pool (and the off-switch it gave any
anonymous client) is gone; tests first, 2/2 mutations caught, PostgreSQL
verifier 11/11 (its budget check fails on `e268d91e`). **Email/SMS in tests
fixed** as a separate commit: the harness clears `RESEND_API_KEY` and Twilio's
credentials and routes test email to the `simulation` provider — which exposed
two suites (`ENV_VALIDATION_MODE=enforce`) that had only ever loaded because a
real key was present, and so could never have loaded in CI. **Q2** explained,
rule unchanged. **Q3** recommendation made (TaptPay's own records as proof where
one merchant attached the document soon after upload; everything else locked to
the audited admin, not blocking) — **not built until approved**. **Q4** answered
with sources (tax and landlord records 7 years; privacy: no longer than needed);
retention period recommended, **nothing implemented** (A-H3). Nothing pushed; no
live database touched.

Prior continuation (2026-09-21, later — the ownership-inventory gate is
**implemented, verified and committed; not applied anywhere**). The owner's
decision (*require a trusted ownership inventory before migration*) is now
enforced by the runner: `0023`–`0025` run only with an operator-approved
inventory that is pinned by SHA-256, bound to the declared target and matches
every invoice document by id, path hash and content hash; the check runs before
the ledger exists and again under a lock inside `0025`, which clears every
inferred owner and assigns only verified ones, recording the evidence in
`uploaded_file_ownership_evidence`. Tests first (15 red → 28/28 green), 7/7
mutations caught, the PostgreSQL verifier **11/11** (Codex's two red legacy
checks now pass; refusals proven for no, incomplete, false and stale
inventories), CI's steps rehearsed through the real CLI with the committed empty
CI inventory, and CI's fingerprint re-recorded (it predated `0022`; the diff is
purely additive and itemised). No database outside throwaway loopback ones was
touched. **Open for the owner:** Q1 the platform-wide document budget; Q2 whether
a document nobody can evidence should block the release for good (production
keeps serving invoice documents publicly until gap 13 ships); Q3 where evidence
will come from; Q4 retention. **Next:** an independent review of
`acef4e42..HEAD` — brief and prompt in
[the gate's evidence](r1/R1-T7-gap13-ownership-inventory-gate-2026-09-21.md#7-independent-re-review--brief).
Not merge-ready or deployable until that says Approve; nothing pushed.

Prior continuation (2026-09-21 — resumed after an environment reset; Codex's
gap-13 review corrections re-verified and committed; the ownership-inventory
gate is still unfinished). The prior session's `/tmp` logs and screenshots were
gone, so ground truth came from `git status`/`git diff` and every result was
**re-run, not relayed**. The four finished corrections (atomic merchant delete,
MIME-derived upload extension, durable admin-read audit, PostgreSQL-shared
document budget), the corrected preflight and release guidance, `0024`, and the
two verifiers are **verified and committed with explicit paths**: their
regression tests fail 8/10 on the old code; re-breaking each correction turns a
test red (4 of 4); the PostgreSQL verifier on a throwaway PostgreSQL 16.10 gives
5 pass and the 2 legacy-ownership checks red by design; the browser check passes
at 390/820/1440 px; client 57/511, scripts 51/51. The owner **had already
answered** the question the entry below calls pending — *require a trusted
ownership inventory before migration*
([decision](../../decisions/2026-09-19-gap13-trusted-ownership-inventory.md)).
Its implementation was begun but **not finished, and is not committed**:
`server/upload-ownership-inventory.ts` and its test exist, the runner is not
wired to them, `0025` does not exist, `tsc` fails on those two files and two of
their tests fail. Also found, none changed: one anonymous client can exhaust the
platform-wide 600-a-minute document budget and switch off "View invoice" for
every tenant (**owner call**); CI's recorded empty-database fingerprint predates
`0022`–`0024`, so CI would fail on push; an ambient `RESEND_API_KEY` makes one
unrelated team-invite test fail here (fails identically on `acef4e42`). Full
record: [re-verification](r1/R1-T7-gap13-review-fixes-2026-09-19.md#re-verification--claude-2026-09-21).
Unchanged: do not merge or deploy; no live database was touched; nothing pushed.

Prior continuation (2026-09-19 — independent gap-13 review and authorized fixes):
The independent review of `454f4120..b0da2f08` returned **Do not approve** after
reproducing legacy reference-based ownership theft and transaction deletion
before a merchant FK refusal. The owner requested all findings be fixed.
Uncommitted corrections now make deletion atomic, normalize upload extensions,
require durable admin-read audit, share document limits in PostgreSQL, correct
the count-only inventory and rollback guidance, and add reproducible PostgreSQL
and browser verifiers. See [current evidence](r1/R1-T7-gap13-review-fixes-2026-09-19.md).
**Still pending:** the owner answer on quarantining existing invoice uploads
whose authenticated ownership cannot be distinguished from legacy inference.
The real-PostgreSQL legacy ownership assertions deliberately remain red. Do not
merge/deploy or claim gap 13 closed. New migration 0024 was tested only on an
isolated synthetic database; neither development nor production was migrated.
Migration 0023's bytes remain immutable. Its old rollback/backfill guidance is
superseded by the current evidence. There are no recoverable background task IDs
to rely on; inspect the tree and rerun the checked-in verifiers when resuming.

Prior continuation (2026-09-19 — resumed after another session/environment
boundary. The prior handoff's background-workflow IDs did not resolve, so
ground truth was re-derived from `git status` (clean) and the baseline was
**re-run, not trusted**: `tsc` clean, server 56 suites / 1063 tests, client
57 suites / 511 tests — all equal to the 2026-09-16 entry below.) One piece of
work, **implemented and verified; migration `0023` applied to the
development database (`heliumdb`) on Oliver's approval and NOT to production;
committed on this branch (code `94f24635` and `b0da2f08`, plus two documentation
commits), not pushed**:

1. **Gap 13 — uploads tenant authorization, Oliver's Option C — implemented**
   ([evidence and handoff](r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md),
   [the sub-decisions taken at their most restrictive default, awaiting Oliver](../../decisions/2026-09-19-gap13-uploads-option-c-implementation-defaults.md)).
   `uploaded_files` gets a nullable `merchant_id` (migration `0023`; ambiguous
   and orphaned rows stay NULL = served by nothing, deleted by nothing);
   storage methods are tenant-scoped and refuse to overwrite another tenant's
   row; the public `/uploads` route now serves the `logos` folder only (checked
   before the database or the disk fallback); new
   `GET /api/invoice-documents/:name` (authenticated, tenant-scoped, foreign =
   missing = 404 for merchants — **and the validated platform admin may open any
   document, audited: S1, Oliver's decision later the same day, commit
   `b0da2f08`**) and `GET /api/checkout/document/:token`
   (checkout-token authorized, that invoice's own document only); the three
   create routes (property invoice, trades quote, trades invoice) now `400` any
   `documentUrl` that is not the caller's own upload. **Two findings shaped it:**
   (a) the only thing that ever dereferences a `documentUrl` is the
   *unauthenticated tenant* on the public checkout page — the "linked from the
   invoicing UI and PDF exports" claim in the R1-T3 uploads evidence and the
   options memo is **wrong** (merchant UIs show only the name; no server
   email/PDF embeds it), so a session-only route would have silently broken the
   tenant's "View invoice"; (b) the three create routes accepted *any* string
   (another merchant's document, an external URL, a `javascript:` URI) as
   `documentUrl`. No client file changed.
2. **Verified** — failing-tests-first (red run: 40 failed on the unmodified
   tree — `201` for a foreign/external/`javascript:` document, `200` for an
   invoice document on its old public URL); final: server **61 suites / 1183
   tests** (was 56/1063), client 57/511 unchanged, script tests 51/51, `tsc`
   clean. Migration rehearsed on a **throwaway local PostgreSQL 16** through the
   project's own runner (24 → 25 applied; backfill correct row by row; idempotent;
   refuses a wrong-shape column; FK bites), and the **real `DatabaseStorage`**
   run against it (18 checks, incl. exactly one winner when two tenants race for
   one path). **Dev database (`heliumdb`):** read-only checks first (24 applied /
   1 pending; count-only preflight = 2 files — 1 attributable, 1 orphan, 0
   ambiguous; schema fingerprint identical to gap 11 C1's, so no drift), then
   `0023` **applied on Oliver's explicit "Yes, apply it"**
   ([record](../../decisions/2026-09-19-gap13-apply-0023-to-dev-approval.md)) and
   re-verified from the catalogue: 25 applied / 0 pending / 0 drifted / 0
   orphaned, column + FK + valid index present, checksum equals the file's,
   attribution 1 attributed / 1 NULL as predicted, fingerprint moved by exactly
   +1 column / +1 FK / +1 index; storage effect measured (2 files, 62,735 bytes;
   the unattributed one 9,076; `0023` added a 16 KB index). One self-review
   finding fixed test-first: the checkout page (the customer's *payment* page)
   must never fail because a document lookup did.
3. **Owner decisions, all answered 2026-09-19:** S2–S5 confirmed as implemented;
   **S1 reversed — the platform admin may read merchant documents** (my first
   reading of "s1. yes" was wrong and was corrected;
   [decision record](../../decisions/2026-09-19-gap13-uploads-option-c-implementation-defaults.md)).
   Limits of S1: there is **no admin screen or API that lists documents** (the
   admin needs a name), and the audit trail is the existing file-based
   `logs/security-audit.log`, which does not survive an ephemeral filesystem.
4. **Not done — and this is the list that matters:** an **independent** review.
   The author's own reread is not independent and the evidence says so; Oliver
   is having **ChatGPT** do it — marker **base `454f4120` → code tip `b0da2f08`**,
   tag `review/gap13-uploads-2026-09-19`, brief and paste-ready prompt in
   [R1-T7-gap13-INDEPENDENT-REVIEW-BRIEF-2026-09-19](r1/R1-T7-gap13-INDEPENDENT-REVIEW-BRIEF-2026-09-19.md).
   Its result is recorded next to the evidence; **not merge-ready until it says
   Approve**. Also not done: the owner-run **production** preflight and apply
   (before deploying this code); browser/device verification of the checkout
   "View invoice" link (no client file changed, but it is verified at HTTP level
   only); restarting the dev server (now safe) so uploads run on the new code.
   Gap 12's confidentiality half and gap 11's `C2`–`C5` are unchanged and open.

Prior continuation (2026-09-16 — resumed after a session/environment
boundary; the prior session's background-workflow task/run IDs recorded in
`docs/HANDOFF-2026-09-14-workflows-in-flight.md` did not resolve, exactly as
that doc warned they might not, so ground truth was re-derived from
`git status`/`git diff` and the two evidence docs already sitting uncommitted
in the tree, not assumed from the doc). Both halves of gap 12's approved
remediation had already been implemented and independently re-verified in
the prior (2026-09-15) session but left uncommitted; this session re-verified
both again independently (fresh `npm run check`, full server and client
suites, and direct reads of the key diffs against the live tree — not
trusted from either prior session's report) and, finding no discrepancy,
committed them as two separate commits, then wrote the one decision doc the
prior session's punch list still owed (Oliver's sign-off on the fail-closed
change's collateral effect on the staff terminals):

1. **Gap 12 Option C — fail closed on legacy-no-board ambiguity — landed**,
   commit `72230602`. Both `GET /api/merchants/:id/active-transaction`'s
   no-stoneId branch and its SSE broadcast counterpart now report ambiguous
   (no data from either candidate) instead of guessing the newest concurrent
   stoneless sale, closing the wrong-customer-wrong-amount payment-
   correctness defect gap 12(a)/(b) described. Merchant/board SSE delivery
   is unaffected (independently verified via a same-merchant-concurrent-call
   test against the real broker/route, not simulated). A residual leak (a
   completing sale's own broadcast can still reach a different concurrent
   sale's customer at the instant the pending bucket drops to 1) is traced,
   documented, and deliberately left open — it needs per-transaction
   addressing to close. See
   [R1-T2-gap12-option-c-fail-closed-2026-09-15](r1/R1-T2-gap12-option-c-fail-closed-2026-09-15.md)
   and the sign-off record,
   [gap12-option-c-failclosed-collateral-signoff](../../decisions/2026-09-14-gap12-option-c-failclosed-collateral-signoff.md).
2. **Gap 12 — three legacy terminals migrated to per-payment links —
   landed**, commit `8666dafc`. `merchant-terminal.tsx`,
   `merchant-terminal-mobile.tsx`, and `merchant-terminal-mobile-v2.tsx` now
   send `linkMode: "per_payment"` for board-less sales (mirroring the
   desktop retail terminal, which already did this) and gate a new
   share-link UI on the client's own board-selection decision, never on
   response field presence — the exact bug a prior redo's blocked plan would
   have shipped. See
   [R1-T2-gap12-terminal-linkmode-migration-2026-09-15](r1/R1-T2-gap12-terminal-linkmode-migration-2026-09-15.md)
   (independent re-verification) and its
   [-2026-09-14](r1/R1-T2-gap12-terminal-linkmode-migration-2026-09-14.md)
   implementer report.
3. **Full regression after both commits**: server 56 suites / 1063 tests
   (was 55/1046 before this pair), client 57 suites / 511 tests (was
   53/492), `npm run check` clean. Independently re-run in this session, not
   relayed.
4. **Not done this session, still open**: gap 12's confidentiality half (an
   anonymous caller who is the sole subscriber can still read a merchant's
   live sale feed) and the residual leak above remain open by design;
   retiring the standing `/pay/:merchantId` address needs a production
   traffic-drain window and is separately scheduled; gap 11's `C2`-`C5`
   (the actual replay-mechanism fix) remain not started; the uploads
   tenant-authorization escalation (gap list item 13) — queued behind this
   pair landing, per `docs/HANDOFF-2026-09-14-workflows-in-flight.md` step
   5 — has not been started.

Prior continuation (2026-09-14 — resumed from an emergency mid-session
checkpoint, `a1cca2c5`, whose background Workflow state did not survive the
session boundary; see the domain-5 evidence file's continuity note for what
that means and how ground truth was independently re-established). Five
things happened this session:

1. **R1-T3 Settings/Uploads/Exports — the fifth and final tenant-scoping
   domain — completed**
   ([evidence](r1/R1-T3-settings-uploads-exports-tenant-scoping-2026-09-14.md)).
   UPL-1/UPL-2/UPL-5 (already committed in the checkpoint, independently
   re-verified here rather than trusted) plus this session's UPL-3 (nosniff
   header), UPL-6/UPL-7 (7 new cross-tenant regression tests, no source
   change). All five R1-T3 domains are now investigated.
2. **Uploads tenant-authorization gap escalated, not fixed** —
   `uploaded_files` has no tenant column and its public serve route has no
   authorization at all. Decision memo:
   [uploads tenant authorization](../../decisions/2026-09-14-uploads-tenant-authorization-escalation.md).
   Gap list item 13.
3. **R0-H1, R0-H4, R0-H5, R1-H1 closed** on the owner's answers collected in
   the interrupted prior session (transcribed, not newly decided) — see
   their tracker rows and `docs/decisions/2026-09-14-*.md`. R1-H1's closure
   lifts gap-list item 8 (client work gated) for tasks blocked only on that
   sign-off.
4. **~~Gap 11 vs. gap 12 — NOT resolved this session~~ — RESOLVED later the
   same calendar day, in the next session, recorded here 2026-09-16.** The
   prior session collected an owner answer that maps to gap 12, not gap 11 as
   originally asked, and flagged that Oliver had not yet confirmed that
   reframing. A later session put the question to Oliver directly: **"it is
   about gap 12, not gap 11"**
   ([record](../../decisions/2026-09-14-gap11-vs-gap12-scope-confirmation.md)).
   Gap 11 then got its own, separate pacing decision
   ([land C0/C1 now, schedule the rest](../../decisions/2026-09-14-gap11-c0-c1-now-c2-c5-scheduled.md)),
   and gap 12's three-terminal migration got its own separate approval
   ([Yes, proceed now](../../decisions/2026-09-14-gap12-terminal-linkmode-migration-approval.md)).
   See gap list items 11/12 for the substance and
   `docs/HANDOFF-2026-09-14-session-checkpoint.md` §4 for the original
   reasoning trail.
5. R0-T6 (real backup rehearsal): owner said "will do this later" — no
   action taken, not chased.

Prior continuation (2026-09-13, second half — STOPPED ON INSTRUCTION, read
this and the entry below it before continuing). Three things happened after the
pass described in the next entry was stopped and restarted:

1. **Trades tenant-scoping completed** ([evidence](r1/R1-T3-trades-tenant-scoping-2026-09-13.md)),
   commit `06e40012` — investigated, **no gap found**, no code change, same
   method as its three sibling domains (live-code read plus a throwaway
   two-merchant runtime probe). That makes **four of five R1-T3 domains
   investigated with no tenant-scoping gap found**. The fifth, **Settings,
   Uploads & Exports, was stopped during its read-only planning phase and left
   no artifacts — it is untouched and still to do.** Its scope, including the
   plan §8.4 requirement that the logo route must not accept or write a file
   before merchant ownership is known, is unchanged.
2. **Gaps 11 and 12 both escalated**, commit `0b144592`, with decision memos —
   see their entries in the gap list below. Both were found to be materially
   worse than filed; every escalation claim was independently re-verified
   against live code before being recorded.
3. **Gap 12's fix was reframed by a later finding**, recorded in
   [owner input and the linkMode finding](../../decisions/2026-09-13-gap12-owner-input-and-linkmode-finding.md).
   Short version: per-transaction addressing (`linkMode: "per_payment"` →
   `/pay/t/<token>`) **already exists, is already shipped, and the desktop
   retail terminal already uses it** for board-less sales, which is why those
   sales are already immune. The entire vulnerable population is three older
   terminals (`merchant-terminal.tsx:198`,
   `merchant-terminal-mobile.tsx:237`, `merchant-terminal-mobile-v2.tsx:221`)
   that never pass `linkMode` and so silently default to `"legacy"`. The fix is
   therefore not a redesign — it is making three screens do what a fourth
   already does. **Not implemented: it edits client terminal files, which R1-H1
   still gates, and it needs the production value of
   `FEATURE_NEW_RETAIL_PAYMENTS` confirmed first** (the memo gives an exact
   behavioural check that needs no infra access).

**Owner input recorded this session** (answers to the options memo's blocking
questions): there are **no printed no-board QR codes or programmed NFC tags in
the field — demo only**; the no-board `/pay/:merchantId` flow **is** in real use
for sales not run through a payment board; `FEATURE_NEW_RETAIL_PAYMENTS` is
believed on in production but is **not** independently verified. The first
answer removes the only blocker the memo identified to retiring the standing
merchant-wide address.

Prior continuation (2026-09-13, review-gated multi-agent pass — STOPPED
MID-DOMAIN, read this before continuing): six lanes were run in sequence
(gap 12's mitigation, then five R1-T3 tenant-scoping domains), each gated
by an independent 2-3 reviewer panel using the plan's own §21.1 template
(Blocking Issues / High-Risk Concerns / Final Recommendation) before any
code was written. Four completed and are committed; **Trades was stopped
mid-implementation on operator instruction and is NOT committed** — its
scratch probe test was deleted, nothing else from it survives, and it needs
to restart from scratch (a background Workflow run's cache does not survive
into a new session, so do not look for a `resumeFromRunId` — just re-run the
domain).

- **Gap 12 mitigated (not closed)**, commit `c1e42db1`: `GET
  /api/merchants/:id/events`'s unauthenticated `legacy-no-board` branch now
  calls the same `checkRateLimit(clientIp)` its REST sibling
  `active-transaction` already used, closing the "anonymous caller can hold
  unbounded connections" abuse surface. Failing-test-first against the real
  shared limiter. 53 suites / 1020 tests (was 52/1019), `npm run check`
  clean. **The deeper fix — a per-transaction identifier for the anonymous
  no-board customer flow — is still open**; it needs the addressing-scheme
  product decision the original gap-12 writeup called for, not another
  same-day patch.
- **Transactions & Refunds — investigated, no gap found**, commit
  `1269e644`. All 6 global-fetch-plus-route-level-compare sites correctly
  deny cross-tenant access today, independently re-verified with a live
  two-merchant runtime probe (built, run, deleted). Surfaced for the owner
  rather than guessed at: `POST /api/transactions/:id/split` is
  unauthenticated by design (is that intended?), and the Tap to Pay
  `transactionId` branch's scope boundary is worth a second look. Also
  named: sites 2-6 have no committed cross-tenant regression test even
  though authorization currently holds — an open, no-schema test-coverage
  follow-up.
- **Boards & Stock — investigated, no gap found**, commit `7d3681ca`. Four
  write routes use the discouraged global-fetch-then-compare shape, but the
  compared `merchantId` always comes from the caller's own JWT
  (`checkMerchantOwnership`/inline role check), never attacker input — no
  real bypass. Re-verified with a throwaway two-merchant probe across all
  four routes.
- **Property — investigated, no gap found**, commit `b06c42eb`. All 14
  `tenantProfiles`/`activeSchedules`/`invoicesRentRequests` route+compare
  sites correctly 403 a second merchant. Named a real structural gap: this
  vertical has **zero dedicated committed test file** (`grep -rl "property"
  server/__tests__/*.ts` finds none) — a test-infrastructure hole, not
  evidence the routes are unsafe, but worth closing before anyone touches
  this domain again. Also corrected the task's own wording: the property
  analog is `tenantProfiles`, not `clientProfiles` (the latter is trades'
  table).
- **Trades — NOT completed.** Plan and review panel ran and approved
  proceeding; the implementer had only written a scratch probe test (since
  deleted, no conclusion recorded) when this pass was stopped. **Nothing
  about Trades tenant-scoping is known beyond what R1-T3's original
  inventory already said.** This is the next thing to pick up.
- **Settings, Uploads & Exports — not started at all.**

Operational note for whoever picks this up: for most of this pass (from
roughly the Property domain onward) the working tree also contained a
second, unrelated, uncommitted in-progress feature (a "mobile quote flow"
redesign of the trades terminal, `docs/HANDOFF-2026-09-13-mobile-quote.md`,
owner-confirmed as separately-owned work-in-progress, not part of this
remediation). Every domain agent in this pass ran `git status` first,
correctly identified those files as out of scope, and staged only its own
exact files — verified by re-reading each implementer's own transcript, not
just trusted. None of the four commits above touch any of that feature's
files. If that work is still uncommitted when Trades/Settings-Uploads-Exports
restart, the same discipline applies: `git status` first, stage explicitly,
never a wildcard add. The Property domain's 54-suite/1024-test count (up
from 53/1020) reflects that feature's own new test files being picked up by
the test runner, not a regression from this pass.

Prior continuation (2026-09-12/13, recovering a session that crashed with this
work uncommitted): **[R1-T2 classifier extension and a new suspected SSE gap](r1/R1-T2-classifier-extension-2026-09-12.md)**
— the prior session had extended the route-policy classifier from four principal
categories to eight (adding `admin`, `public`, `provider-webhook`,
`unauthenticated-suspect`) but crashed before regenerating the derived artifacts,
running regression, or writing up its own finding. This continuation regenerated
both derived files (218 registrations, **0 unclassified**, down from 96/97 across
prior continuations, 1 suspected gap), reran the full server suite (52/52 suites,
1019/1019 tests — unchanged, since this generator only produces policy-table
output and changes no runtime behavior), and independently verified the flagged
finding by reading the live handler and broker code: **`GET
/api/merchants/:id/events` opens its live SSE stream with zero authentication
when neither an `Authorization` header nor `?stoneId=` is supplied** — worse than
its already-accepted `active-transaction` sibling because it has no rate limit and
pushes a continuous feed of every future stoneless transaction event, not one
rate-limited snapshot. **Confirmed real, not fixed** — see gap 12 below and the
evidence file for the full mechanism and why a same-day patch was not attempted.
Also completed in this window: **[R1-H1 auth/onboarding visual baseline
capture](r1/R1-H1-auth-onboarding-baseline-2026-09-12.md)** — the prior session's
new capture script had been created but never successfully run; it now has
run cleanly (20/20 captures across 4 device classes × 5 routes, zero page errors,
zero unexpected API writes). This is a capture for Oliver's review, not the R1-H1
acceptance itself.

Owner update 2026-09-12: **the production database password has been rotated**, and
Oliver confirmed everything else he identified as needing rotation/deletion is done.
[Decision and exact scope](../../decisions/2026-09-12-production-db-password-rotation-and-r0-h2-disposition.md).
Every R0-H2 named credential now has a rotation/deletion disposition. R0-H3's own
"old credential rejected" check is itself owner-badged in the plan and is recorded as
owner-attested, not independently re-tested by an agent — this session never had
visibility into old secret values. **R0-H4 (access-log review) and R0-H5 (uploads
disposition) remain open**; a full walk of the R0 exit-gate checklist against today's
evidence, including a draft (unconfirmed) R0-H1 incident record, is in
[R0-exit-gate-assessment-2026-09-12](r0/R0-exit-gate-assessment-2026-09-12.md).
Fresh command-gate evidence today: `npm run check` clean, server suite **52/52 suites,
1019/1019 tests pass**.

Owner direction 2026-09-12: **no further JWT/admin credential action or reminders**.
[Recorded exception](../../decisions/2026-09-12-jwt-admin-owner-disposition.md).
Remove those items from the actionable owner checklist; historical exposure and
scanner findings remain preserved without a rotation or rejection-test claim.
This does not cover the production database password or close the overall R0 gate.

Owner direction 2026-09-12: **no further Figma deletion action or reminders**.
[Recorded exception](../../decisions/2026-09-12-figma-owner-disposition.md).
This supersedes the earlier deletion task; exposure evidence remains and no
revocation or passing scanner result is claimed. Other R0 checks stay open.

Owner update 2026-09-12: **both exposed Google Analytics service-account keys
are deleted, as confirmed by Oliver**. [Decision and exact scope](../../decisions/2026-09-12-google-analytics-key-revocation.md).
Five matching scanner dispositions are now `rotated`; no other finding is cleared.
Provider rejection evidence, IAM/audit-log review and the other R0 gates remain open.

Latest continuation (2026-09-12): **[R0-T5 device measurement correction](r0/R0-T5-frame-measurement-2026-09-12.md)** — completed the interrupted verifier repair; **20/20 synthetic browser scenarios pass**, including fine-pointer 1440×650 on all five routes. The prior desktop full-bleed claim was a selector bug: the verifier measured the backdrop, not the rounded frame. That owner-question is withdrawn. No application layout changed. Full visual acceptance and R0 operational/human gates remain open.

Prior bounded continuation (2026-09-12, working diff on `3d9736cf`):
**[R0-T2 source guard and configuration matrix](r0/R0-T2-source-guard-and-matrix-2026-09-12.md)**.
The environment-read regex missed alternate executable forms and falsely flagged
inert text (14 failing tests captured before repair). Replaced with an AST guard
without widening the bootstrap allowlist; all 16 environment/payment-mode cells
now prove the intended invariant rather than an unrelated database-target error.
Focused verification: 94 tests pass; typecheck passes. Full regression result is
in the linked evidence. Test-only work; R0's human/operational gates and the split
session replay finding remain open. No production action or capability enablement.

Latest continuation (recorded 2026-09-12, recovering an interrupted session —
these three were already committed on `remediation/r1-continuation-20260907`
but had not yet been logged here): **[R1-T7 — foreign Windcave session bypass
on the legacy transaction payment routes](r1/R1-T7-windcave-session-binding-2026-09-11.md)**
(commit `4183e241`) — a 10-agent cross-tenant/IDOR audit plus an independent
adversarial re-check found that `hosted-fields-complete` and
`googlepay-complete` only enforced session-ID binding once a transaction
already had a `windcaveSessionId`, so any transaction still in its initial
`null` state accepted an arbitrary client-supplied session and could be
finalised with a foreign approval. Failing-tests-first (2/4 failing pre-fix),
fixed by making the guard unconditional, 4/4 pass after. **A second, distinct
defect was found in the same helper and deliberately left unfixed, flagged
for the owner**: a session that legitimately funds one split of a split
transaction can be replayed against the same route to complete the *next*
split for free (no single-use consumption of a spent session), and the
non-split branch can replay-inflate a merchant's billed transaction count the
same way. Closing it correctly needs the R3 durable-payments machinery, not a
same-day inline patch — see the evidence file for the full mechanism and
reproduction. Also landed in this window: [R1-T2 route-policy inventory
regenerated](r1/R1-T2-route-inventory-table.md) against SHA `5d30caf6` (218
registrations, 96 unclassified — essentially unchanged from the prior 97,
this was a regen after the R0-T5 fix below, not a new classification pass),
and [R0-T5 — Apple Pay `/validate` auth gap closed and dead fake-success code
deleted](r0/R0-T5-wallet-validate-auth-and-dead-code-2026-09-11.md) (commit
`5d30caf6`) — `/api/payments/apple-pay/validate` was missing the
`authenticateToken` middleware its sibling wallet routes had (inert in
practice since `digitalWalletProcessingEnabled` is hardcoded false, but
against the plan's middleware-order rule and untested), and all three wallet
routes still carried their pre-containment fake-success bodies
`/* istanbul ignore next */`'d rather than deleted (plan rule 5: deleting is
the fix). Both fixed, failing-test-first. Full server regression after all
three: **52 suites / 974 tests pass** (independently re-verified 2026-09-12),
`npm run check` clean. No migration, secret rotation, production operation,
capability enablement, or push in this window.

Prior continuation: **[September 11 client containment and the first device smoke](r0/R0-T5-client-containment-and-device-smoke-2026-09-11.md)** — the device gate ran for the first time (historical 10/15; all five desktop failures were subsequently traced to the verifier selector and corrected, with 20/20 passing on September 12), the User-Agent-derived capability endpoint is truthful, and the NFC simulator consumer is deleted. Alongside it: [R1-T6 bounded query values and the source guard](r1/R1-T6-bounded-query-values-2026-09-11.md) and [the R1-T3 password-path contract](r1/R1-T3-password-path-contract-2026-09-11.md). Earlier that day: [callback/notification containment and credential-storage fix](r0/R0-T5-callback-credential-fix-2026-09-11.md) — the tree's uncommitted `r0-t5-callback-containment.test.ts` was a failing-tests-first checkpoint (16/16 failing) proving five real defects in the Windcave callback/notification handlers and merchant credential storage; all are now fixed and verified (49 suites / 942 tests pass). Device/browser smoke had not run at that earlier checkpoint; the September 12 record above supersedes that status. Prior: [September 11 R0-T5 runtime audit and admin containment](r0/R0-T5-continuation-2026-09-11.md). Resume point at that time: **PDF page 17 (R0-T5); R0 exit on page 21 remains open**.

Prior continuation: **[R0-T6A closure](r0/R0-T6A-closure-2026-09-10.md) — every Check criterion met**, following [the drift findings closed — repair, adoption and an exhaustive gate](r0/R0-T6A-fk-repair-and-adoption-2026-09-10.md)
(decision: [FK default repair and orphan column adoption](../../decisions/2026-09-10-fk-default-repair-and-orphan-column-adoption.md)),
following [the baseline contract's two blind spots, closed](r0/R0-T6A-baseline-contract-blind-spots-2026-09-10.md),
which also found that a `0009` requirement names the wrong table and could never
have been satisfied. Follows [the live-database drift finding](r0/R0-T6A-live-drift-2026-09-09.md),
[R0-T6A safety gate, release command and CI convergence](r0/R0-T6A-release-gate-handoff-2026-09-08.md)
and the first real-database evidence in [empty-database convergence](r0/R0-T6A-convergence-2026-09-08.md).
Earlier: [R0-T6A explicit migration target identity](r0/R0-T6A-target-handoff-2026-09-08.md),
[R0-T6A migration budget hardening](r0/R0-T6A-budget-handoff-2026-09-08.md)
and [R0-T7 reviewed source cleanup](r0/R0-T7-review-followup-2026-09-08.md).
**2026-09-09: the repository was found to be public with `.claude-home/` — including
file-history snapshots of a real `.env` — in the current tree of `origin/main` and
nine other remote branches. See [public repository exposure](r0/R0-T7-public-exposure-2026-09-09.md).
R0-H2 is reopened; this branch was not pushed.**
The CI target decision is configured but unexercised: [what CI is allowed to migrate](../../decisions/2026-09-08-ci-migration-target.md).
History disposition and database/release gates remain open. These records supersede the recovery snapshot only for their scope.

Follow-up: [September 8 R0-T7 repository safeguards](r0/R0-T7-handoff-2026-09-08.md)
adds the env inventory, ignore boundaries, metadata-only CI scanning and response
runbook. Scanner findings remain unclassified; R0 exit is still not established.
The September 7 dispositions below remain the historical recovery snapshot.

The full plan is **not complete**. This tracker preserves every named task/phase
and the inherited control checklist; a prior green test count or handoff label
cannot close a task whose required evidence is missing.

Source of truth: [corrected full integration plan](../../../attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt).
This file is an execution/evidence index, not a replacement plan or a waiver.
Every source task's dependency, required implementation, Check and exit criteria
remain binding, even where the row below summarizes its status.

## Recovered working state

- Workspace initially showed `feat/tablet-desktop-app` at
  `0df129166bf90e1bca9c04bb9a3f2bbb1ca42e24`, with a clean tree.
- Claude's latest integration work is `remediation/r1-foundation` at
  `ec2072795fa3adc48b508e227884b3837685a3aa`, dated 2026-09-06.
- The old `/home/runner/workspace-r1` worktree directory is absent; its branch
  and commits are intact. No worktree metadata was pruned.
- Continued from that exact tip on `remediation/r1-continuation-20260907`.
  No merge, cherry-pick, reset, rebase, commit, push or deployment performed.
  The separate UI branch and all other branch tips remain preserved.
- The accepted execution-base record is `r0/R0-T0-baseline-2026-08-31.md`;
  its approved corrected source SHA is `b00054f9bab40c6ba5f2364124d8b7f668073674`.
  Later UI-branch commits are not silently imported into this lineage.
- Existing R0/R1 test counts are historical, not newly regenerated release evidence.

## Owner direction recorded this turn

R0-H2 was closed by Oliver's instruction on 2026-09-07 (no secrets currently
require rotation) and **reopened on 2026-09-09** when the public `.env` exposure
was found. See the [2026-09-07 disposition](../../decisions/2026-09-07-R0-H2-owner-rotation-disposition.md)
and the [2026-09-09 reopening](../../decisions/2026-09-09-R0-H2-reopened-public-env-exposure.md).
Neither record claims a performed rotation, and neither closes the access,
backup, deployment or restore checks.

## Gaps that must not be silently skipped

1. **~~R0 exit is not established~~ — ESTABLISHED 2026-09-21**
   ([record](r0/R0-exit-established-2026-09-21.md)): all nine gate criteria re-run
   fresh on `4a9129df` (check, client 57/511, server 64/1272, build with no
   database variables, device smoke 20/20, R0-T1 9/9) and R0-H1/H4/H5 closed by
   the owner on 2026-09-14. H-items remain owner attestations, not agent
   verification; production untouched. Unblocks R1-T1's audit, R1-T4 and R1-T8.
   Original text follows. The R1-H1/T1 handoff calls `de753501` an R0
   exit, but the R0-T5/T7 evidence explicitly leaves operator follow-up open.
   **R0-T6A now has a completion artifact and is closed** (2026-09-10); **T5 and
   T7's engineering scope, and H2/H3's credential rotation, are now also complete
   (2026-09-12) — see [R0-exit-gate-assessment-2026-09-12](r0/R0-exit-gate-assessment-2026-09-12.md).
   R0 exit now waits specifically on R0-H1 (no confirmed incident owner yet), R0-H4
   (access-log review — needs hosting/infra access an agent does not have) and R0-H5
   (uploads privacy disposition)**, not on T5/T7. New R1 feature implementation must wait for
   actual R0 closure; existing work is preserved, not rolled back.
2. **R0-T6 was partial.** The surviving manual script selected both ambient
   databases, produced unencrypted gzip files and pruned retained files. This
   continuation replaces it with an explicit, confirmed encrypted-backup command
   and synthetic failure-path tests. No actual backup has been taken.
3. **~~R0-T7 is partial~~ — these two items are CLOSED (verified 2026-09-11).**
   `.env.example` exists and is strictly key-names-only (0 lines carry a value);
   `.gitignore` covers `.claude-home/` and `.env*` with an `!.env.example`
   exception; `.github/workflows/secret-scan.yml` exists alongside the
   `docs/operations/secret-rotation.md` and `secret-scan-dispositions.md`
   runbooks. What remains under R0-T7 is **revocation**, not classification —
   see its row below.
4. **R1-T2 is an inventory foundation, not the complete policy.** Its own handoff
   says 97/218 routes are unclassified and required policy fields are not
   populated. The tests inventory `routes.ts`; `index.ts`/`vite.ts` middleware,
   ALL-method semantics and mounted-router adversarial coverage need completion.
5. **~~R1-T3 password handling contradicts the source requirement~~ — CORRECTED
   2026-09-11.** The path id is now proved equal to the authenticated account
   (403 otherwise) rather than ignored; the superseded assertions are quoted in
   [the contract record](r1/R1-T3-password-path-contract-2026-09-11.md). The
   rest of R1-T3 — full principal/tenant matrix, client route guards — is still
   open.
6. **~~R1-T6 exceptions are not approval~~ — CLOSED 2026-09-11.** All sites are
   migrated to a reviewed typed schema that defaults only on absence and rejects
   repeated/array/object/garbage input, and the source guard is active with no
   allowlist. The count was larger than the handoff stated — see
   [the record](r1/R1-T6-bounded-query-values-2026-09-11.md).
7. **R1-T7 depends on completed T2/T3/T6.** Moving uploaded-file SQL behind
   storage does not close authorization-before-body, private object storage,
   content/quarantine/retention or the full tenant-method/runtime matrix.
8. **~~Client work remains gated~~ — LIFTED 2026-09-14.** R1-H1 needed owner
   acceptance of the exact visual baseline; Oliver gave it ("Looks good",
   [record](../../decisions/2026-09-14-r1-h1-visual-baseline-acceptance.md)).
   D10's product choice is already locked; do not ask the owner to choose it
   again. Auth/onboarding layout, actual phones, the desktop frame and
   tutorial contracts remain protected — this only lifts the sign-off gate,
   not the underlying protections. Tasks gated *only* on R1-H1 (e.g. gap 12's
   three-terminal migration) may now proceed; tasks with additional gates
   (e.g. R1-T8 also needs R0 exit) still need those resolved too.
9. **CI is not the final isolated release gate.** The existing workflow still
   uses repository database/JWT secrets, migrates that target, and skips its
   server/browser jobs without them. R8 requires isolated approved targets,
   least privilege, no production secrets, mandatory source guards and sanitized
   artifacts. Adding the synthetic backup test does not close those gaps.
10. **~~The repository is public~~ — PRIVATE since 2026-09-09; `origin/main` still carries local agent state.**
   The ongoing exposure is closed: `gh repo view` reads `PRIVATE`. Pushing is safe again, and this branch's own
   tree carries no `.claude-home/` or `.env` (checked). What does not change: the credentials were readable for
   roughly three months and must be assumed copied, so revocation is still required, and `origin/main`'s tree
   still holds 1441 `.claude-home/` files that should be cleaned before it is ever public again.
   Found 2026-09-09. `.claude-home/` sits in the current tree of `main` (1441
   files) and nine other remote branches, including four file-history snapshots
   of a real `.env`. The 2026-09-08 scanners recorded the hits; all 287 were left
   `review-required`, so nobody established that they were publicly served. This
   supersedes any reading of gap 3 as merely "partial", blocks pushing this
   branch, and reopens R0-H2. See
   [public repository exposure](r0/R0-T7-public-exposure-2026-09-09.md).
   Classifying that backlog then found **two public Google Cloud service-account
   private keys** — [GCP key exposure](r0/R0-T7-gcp-key-exposure-2026-09-09.md).
   Owner confirmed both keys deleted on 2026-09-12; IAM/audit-log and independent
   provider rejection checks remain open.
   Continuing the classification found a third class: Claude Code's own OAuth
   store, `.claude-home/.credentials.json`, in 50 commits — 20 public — whose
   **Figma OAuth client secret is still the live value**
   ([OAuth credential exposure](r0/R0-T7-oauth-credential-exposure-2026-09-09.md)).
   The reviewed decisions now live in `.gitleaks-dispositions.jsonl` and the scan
   gates on undispositioned findings
   ([how to disposition](../../operations/secret-scan-dispositions.md)).
11. **PARTIALLY MITIGATED 2026-09-14 (recorded here 2026-09-16, missed at the
   time) — `C0`/`C1` of the memo's six-step plan landed, commit `5318496b`.
   The replay mechanism itself is not closed.** Per the owner's pacing
   decision
   ([gap11-c0-c1-now-c2-c5-scheduled](../../decisions/2026-09-14-gap11-c0-c1-now-c2-c5-scheduled.md),
   "land the safe pieces now, schedule the rest"): a count-only duplicate
   preflight (`scripts/count-gap11-session-replay-duplicates.mjs`, zero
   duplicates found — vacuously, since this dev database has zero
   `payment_attempts`/`split_payments` rows) and two additive partial unique
   indexes (`payment_attempts.processor_session_id`,
   `split_payments.windcave_transaction_id`), migration `0022`, applied to
   the dev database and independently re-verified against `pg_indexes` and a
   fresh schema fingerprint. See
   [R1-T7-gap11-c0-preflight-c1-index-2026-09-14](r1/R1-T7-gap11-c0-preflight-c1-index-2026-09-14.md).
   **These are defense in depth only and do not stop the replay** — the
   mechanism never produces two rows sharing a session/provider-transaction
   id in the first place, so the indexes have nothing to reject; `C2`
   (compare-and-set finaliser), `C3` (migrate onto the `payment_attempts`
   engine — gap 11's actual close condition), `C4` (callback/notification
   reconciliation by session), and `C5` (durable inbox) remain **not
   started**, separately scheduled, and need `verifyWindcaveOutcome`, an
   R2-phase deliverable that does not exist yet (R2 itself is GATED/not
   started). Production re-run of the preflight is also still required
   before migration `0022` may ever be applied to production.
   Original escalation follows, superseded only where stated above:
   **ESCALATED 2026-09-13** — reproduces without an attacker. Decision memo:
   [gap11 single-use design](../../decisions/2026-09-13-gap11-split-session-single-use-design.md).
   Re-verified against live code before recording: after crediting a split,
   `finaliseHostedPayment` resets session state with
   `updateTransactionSessionState(transactionId, "pending")`
   (`server/routes.ts:2862`, comment: *"Reset session state so next split can
   start a new session"*) while the transaction stays bound to the same,
   now-spent `windcaveSessionId`. The notification handler's only guard is
   `if (transaction.windcaveSessionState !== 'pending') return;`
   (`server/routes.ts:3950`) — which that reset has just re-opened. So a
   **repeat Windcave FPRN for the already-spent session** resolves the
   transaction by session id, passes the guard, and credits the next split for
   free. Windcave documents that FPRNs may be sent more than once, so this can
   fire in normal operation; a crafted replay is not required. The memo also
   records that the browser callback needs only the numeric transaction id
   (`GET /api/windcave/callback?transactionId=N`, unauthenticated, no session
   id) to reach the same path, and *downgrades* one part of the original
   finding: the "inflated billed usage" variant appears to be a usage
   statistic no billing path reads (`server/storage.ts:5908-5909`) — relayed
   from the memo, not independently re-verified here.
   **Recommended fix is already-mandated work, not bespoke:** `payment_attempts`
   carries exactly four indexes and **none on `processor_session_id`**
   (verified, `shared/schema.ts:280-289`), yet plan §9.4 already requires
   adding that unique index. Once it exists, single-use consumption is enforced
   at the database level and this gap closes as a by-product of R2/R3 work.
   The memo rejects mirroring `splitPaidSessions` as the primary fix: its
   atomicity does not transfer to retail (claim and credit would touch
   different tables), it degrades to no-dedupe via `sessionId ?? randomUUID()`,
   and MemStorage stubs it to `return null`, so it is untestable in the
   project's main harness. Open owner decisions: retire vs migrate the legacy
   numeric flow (still routed in `client/src/App.tsx`), whether to take a
   non-concurrency-safe interim mitigation or wait for the index, retry
   semantics, and how to treat sessions already spent before deploy.
   Original finding follows — was: new, owner-visible, deliberately unfixed:
   split-payment session replay
   in `finaliseHostedPayment` (`server/routes.ts:2823`).** Found while closing
   the R1-T7 null-session bypass above. Once a session has legitimately
   funded one split of a split transaction, replaying that same
   still-bound `sessionId` against `hosted-fields-complete` /
   `googlepay-complete` again advances `getNextPendingSplit` and marks the
   *next* split `completed` for free — no new session, no new payment. The
   non-split branch has a milder version: replaying an already-completed
   transaction's matching session re-runs `incrementTransactionCount`,
   inflating billed usage. Root cause is architecturally different from the
   null-bypass fix (this session is genuinely and correctly bound; the gap
   is the absence of single-use consumption once a session has funded a
   finalisation) and needs a schema decision (a tracked-sessions column
   mirroring `invoicesRentRequests`/`jobInvoices`'s `splitPaidSessions`
   pattern) that the plan's own reasoning says belongs with R3's durable
   payments work, not a rushed same-day addendum. See
   [the evidence file](r1/R1-T7-windcave-session-binding-2026-09-11.md) for
   exact mechanism and reproduction. Not fixed. Not a stop condition (no
   live Windcave credentials in this environment; both wallet routes and
   this flow are currently inert wherever Windcave is unconfigured), but it
   must not be lost before R3 scoping.
12. **CLOSED BY RETIREMENT 2026-09-25 (owner decision; `09df766f..5c2cdb27`, local, awaiting
   independent review; [evidence](r1/R1-no-board-rework-2026-09-25.md)).** The business-wide
   no-board address is retired end to end: its anonymous feed and "current sale" read answer 410,
   a board-less sale is always per-payment, and nothing hands the address out, so both the leak
   and the residual below are gone rather than narrowed. The history below is kept as written.
   **Was: PARTIALLY CLOSED 2026-09-16 — the payment-correctness defect (a) is
   closed; the confidentiality leak is not.** Both approved pieces of the
   memo's recommended fix landed and were independently re-verified this
   session: fail-closed-on-ambiguity, commit `72230602`
   ([evidence](r1/R1-T2-gap12-option-c-fail-closed-2026-09-15.md)), and the
   three-terminal per-payment-link migration, commit `8666dafc`
   ([evidence](r1/R1-T2-gap12-terminal-linkmode-migration-2026-09-15.md)).
   A concurrent customer can no longer be routed into another customer's
   checkout at their amount. **Still open**: the confidentiality half — an
   anonymous caller who is the sole subscriber (or arrives when only one sale
   is open) can still read that merchant's live sale feed, since
   `GET /api/merchants/:id/events`'s legacy-no-board branch remains
   unauthenticated; a documented, deliberately-unfixed residual leak (a
   completing sale's own broadcast can still reach a different concurrent
   sale's customer at the instant the pending bucket drops to 1, needs
   per-transaction addressing to close); and retiring the standing
   `/pay/:merchantId` address itself, which needs a production traffic-drain
   window and is explicitly not to be attempted until the terminal migration
   above has had time to drain legacy no-board traffic by attrition.
   Original escalation, partial mitigation and analysis follow, superseded
   only where stated above — kept for the reasoning trail:
   **ESCALATED 2026-09-13** — this is a payment-correctness defect, not only a
   confidentiality leak. Partially mitigated (rate limit only) in commit
   `c1e42db1`. Decision memo:
   [gap12 addressing options](../../decisions/2026-09-13-gap12-anonymous-sse-addressing-options.md).
   Three findings from the memo pass, each independently re-verified against
   the live code before being recorded here:
   (a) **Customers can be routed into the wrong sale.**
   `getActiveTransactionByMerchant` (`server/storage.ts:4698`) orders
   `createdAt desc` and returns the *newest* pending stoneless sale;
   `client/src/pages/customer-payment.tsx:107-129` clears its redirect guard
   whenever that id changes and auto-navigates to `/checkout/<id>`. With two
   concurrent stoneless sales, a customer waiting on `/pay/:merchantId` is
   redirected into the other customer's checkout, at the other customer's
   amount. That is wrong-payment, not disclosure.
   (b) **The SSE route cannot be fixed alone.** `GET
   /api/merchants/:id/active-transaction` has the identical unauthenticated
   no-stoneId access mode and returns the same `publicTransactionDto`. Any fix
   touching one route and not the other is cosmetic. This reopens a previously
   accepted design decision and is itself part of what the owner must decide.
   (c) **The rate-limit mitigation may bound less than it appears.** No
   `trust proxy` setting exists anywhere in `server/` (verified by grep), so
   behind Replit's proxy `req.ip` may not key per client at all; and
   `checkRateLimit` bounds new *requests*, not already-held SSE connections.
   The commit is still correct and mirrors its accepted sibling exactly, but
   must not be read as closing the abuse surface. Recorded as uncertain —
   it needs a deployment-environment check, not an assumption.
   Memo recommendation (owner decides): land the fail-closed-on-ambiguity +
   narrowed-payload option now (no product decision, no schema change,
   red-testable today, not discarded by the end state), then converge on the
   existing `/pay/t/:token` per-transaction mechanism, which plan §10.3
   already requires independently. **Blocking owner question: are there
   printed no-board QR codes or programmed NFC tags in the field?** The
   product ships an 800px QR download and an NFC-write button, so "no" cannot
   be assumed, and the answer decides retire-vs-migrate.
   Original finding follows — was: new,
   owner-visible, deliberately unfixed unauthenticated live SSE stream
   on `GET /api/merchants/:id/events` (`server/routes.ts` ~line 5289-5360).
   Found by the R1-T2 classifier extension (flagged `unauthenticated-suspect`,
   independently verified 2026-09-12/13). When a request supplies neither an
   `Authorization` header nor `?stoneId=`, the handler opens the SSE stream
   with a `{ kind: "legacy-no-board" }` audience and no authentication check at
   all - anyone who knows or guesses a numeric merchant ID can subscribe and
   receive a live, unbounded-duration feed of that merchant's item names,
   prices, statuses and split state for every stoneless, non-token
   transaction. **The branch now calls the same `checkRateLimit(clientIp)` its
   REST sibling `active-transaction` already used**, closing the
   unbounded-concurrent-connections abuse surface — failing-test-first,
   53 suites/1020 tests, `npm run check` clean. **Still open:** this route has
   no per-transaction identifier to scope to, and the legitimate caller
   (`customer-payment.tsx`'s no-stoneId `/pay/:merchantId` flow) has no
   per-transaction identifier to scope to, so concurrent stoneless
   transactions at the same merchant would also bleed across customers. See
   [the evidence file](r1/R1-T2-classifier-extension-2026-09-12.md) for the
   full mechanism, the comparison against `active-transaction`, and why a
   same-day patch was not attempted: a narrow rate-limit addition is low-risk
   and could be done on request, but the real fix needs a decision on how the
   anonymous no-board customer flow should address its own transaction without
   a session - an addressing-scheme question that belongs with R1-T3/R1-T7's
   tenant-scoping work, not a unilateral same-day redesign. Not currently a
   live-funds risk (no Windcave credentials configured in this environment;
   the leak is metadata, not payment credentials), but a real confidentiality
   and tenant-isolation gap that must not be lost.
13. **IMPLEMENTED 2026-09-19 (migration `0023` applied to the development
   database only; not production) — Oliver's Option C, full tenant-scoped auth.** See the
   [evidence](r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md) and
   the [sub-decisions awaiting Oliver](../../decisions/2026-09-19-gap13-uploads-option-c-implementation-defaults.md).
   Nullable `uploaded_files.merchant_id` + tenant-scoped storage; the public
   `/uploads` route serves logos only; invoice documents are served by
   `GET /api/invoice-documents/:name` (authenticated, tenant-scoped; the validated
   platform admin may also read any document, audited — S1) and
   `GET /api/checkout/document/:token` (the tenant's checkout token); the three
   create routes reject a `documentUrl` that is not the caller's own upload.
   Still open: independent review, S1–S5 confirmation, applying `0023` (dev,
   then production after the owner-run preflight), retention/deletion of
   unreferenced documents (A-H3). Original escalation follows, superseded only
   where stated above — kept for the reasoning trail (note its "linked from the
   invoicing UI and PDF exports" claim is wrong; see the evidence):
   **ESCALATED 2026-09-14 — `uploaded_files` has no merchant/tenant column;
   `GET /uploads/:folder/:name` is fully unauthenticated.** Found during the
   R1-T3 Settings/Uploads/Exports domain audit
   ([evidence](r1/R1-T3-settings-uploads-exports-tenant-scoping-2026-09-14.md)).
   Serves two different risk profiles under one policy: merchant logos
   (plausibly intended to be public — shown to customers on checkout pages)
   and property invoice documents (can carry real tenant financial
   information, protected today only by unguessable-filename secrecy, no
   revocation, no expiry, no audit trail). **Narrow mitigation landed now,
   no product decision**: `X-Content-Type-Options: nosniff` on both response
   paths, closing the content-type-confusion/stored-XSS angle regardless of
   how the authorization question is resolved. **The authorization question
   itself is not fixed.** Decision memo:
   [uploads tenant authorization](../../decisions/2026-09-14-uploads-tenant-authorization-escalation.md).
   **Oliver decided 2026-09-14**: Option C, full tenant-scoped auth — a
   tenant column on `uploaded_files` plus an authenticated, ownership-checked
   download route for invoice documents; logos stay public
   ([disposition](../../decisions/2026-09-14-uploads-tenant-authorization-option-c-disposition.md)).
   **Not started** — deliberately sequenced behind gap 11's C0/C1 and gap
   12's two pieces landing first, to avoid concurrent-edit conflicts on
   `server/routes.ts`/`shared/schema.ts`; all three have now landed, so this
   is next.
   Not evidence of an actual leak — a design gap, not an incident.

## Every named task and phase

Status is deliberately conservative. “Recorded” means the prior artifact exists,
not that every acceptance check has been independently repeated. Human discovery
may proceed where the plan allows it. Code lanes remain gated by their dependencies.

| ID | Task / phase | Source line | Responsible lane | Current disposition |
|---|---|---:|---|---|
| R0-T0 | Cut the branch and record the base | 383 | Engineering | Prior owner-approved base recorded; continuation preserves its lineage. No merge/cherry-pick. Fresh release evidence remains required. |
| R0-T1 | Write the failing tests that prove each hole | 404 | Engineering | Original failing evidence recorded; prior tests passed. Full runtime no-side-effect matrix is not established by source tests alone. |
| R0-T2 | Fail-closed configuration module | 431 | Engineering | Implementation and prior tests recorded; review remaining P2.2/exit invariants before closure. |
| R0-T3 | Make VAPID rotation survivable | 444 | Engineering | Recovery code/tests recorded; real-device resubscribe and real test-push acceptance explicitly open. |
| R0-T4 | Tombstone cross-tenant clearing, lock down seeding | 455 | Engineering | Implementation and prior tests recorded; preserve runtime production/no-delete checks for final SHA. |
| R0-T5 | Remove fake-success and merchant credential surfaces | 473 | Engineering | PARTIAL — [September 11 continuation](r0/R0-T5-continuation-2026-09-11.md) fixes five missed admin ecommerce placeholder handlers and extends runtime checks to registered ecommerce routes, refunds, storage snapshots, fetch/SSE/push, retries and concurrency. A same-day [follow-up](r0/R0-T5-callback-credential-fix-2026-09-11.md) then closed a failing-tests-first checkpoint left mid-flight: the Windcave callback ignored `?sim=`, could query a browser-supplied unpersisted session, echoed a browser `result` into the redirect, and finalized a failed provider query as declined; the notification handler wrote transient state before checking configuration; `createMerchantWithPassword` on both storage backends still accepted a caller-supplied `windcaveApiKey`. All fixed. **Device smoke: 20/20 passed on September 12** — [corrected frame measurement](r0/R0-T5-frame-measurement-2026-09-12.md). The September 11 five desktop failures measured the backdrop, not the frame; the full-bleed claim and associated owner-question are withdrawn. Phone, tablet, desktop and short desktop now pass all five routes. Application layout was unchanged by this verifier repair. Earlier client containment removed the NFC simulator and enabled paywave control and made `/api/nfc/capabilities` truthful. Complete visual-baseline acceptance remains separate. An adversarial review of the earlier fix also found and closed: a throwing provider client stranding a session in `processing` forever, an approval with no processor id being recorded as settled, and `updateMerchant` still accepting a credential. The no-side-effect matrix now covers `logTransactionEvent` (a MemStorage no-op, previously invisible) and zero `getDb`; there is **no outbox table in this codebase** to assert on. Historical-credential count: development is 0 ([count](r0/R0-T5-credential-count-2026-09-11.md)); production is owner work. **Same-day follow-up (commit `5d30caf6`)** closed a residual gap: [`/api/payments/apple-pay/validate` was missing `authenticateToken`](r0/R0-T5-wallet-validate-auth-and-dead-code-2026-09-11.md) (inert but untested and against middleware-order rule), and all three wallet routes' pre-containment fake-success bodies were `/* istanbul ignore next */`'d rather than deleted per rule 5 — now deleted outright, including the dead `incrementTransactionCount` side effect on that path and the `digitalWalletProcessingEnabled` stub. Server regression re-verified 2026-09-12: 52 suites / 974 tests. |
| R0-T6 | Stop startup database dumps and the side-effectful build | 517 | Engineering | Startup/build fixed previously; manual backup safeguard implemented in this continuation. 17 synthetic and 3 existing R0-T6 tests pass; operational restore proof remains open. |
| R0-T6A | Re-prove the migration contract and continuously gate complete history | 531 | Engineering | Recorded CLOSED 2026-09-10 — [closure evidence](r0/R0-T6A-closure-2026-09-10.md). The later [owner directions and live migration record](../../decisions/2026-09-10-owner-directions-and-live-migration.md) supersedes the claim that no live database was modified: development reached 23 applied, 0 pending/drifted/orphaned, with 0 rogue FK defaults and 82 indexes. Production apply remains pending after the sandbox classifier refused it. The restore ACL repair procedure and offline gate now exist — [`docs/operations/restore-acl.md`](../../operations/restore-acl.md) and `scripts/verify-restore-acl.mjs` (8/8 tests pass) — but neither has been exercised against a real restore; the repair itself remains open until an actual restore rehearsal runs it. Historical convergence, compatibility and budget evidence is retained in linked artifacts, not fresh release approval for subsequent code changes. |
| R0-T7 | Scrub the tracked configuration | 547 | Engineering | PARTIAL — **classification is COMPLETE** (285 dispositioned triples, **0 `review-required`**, finished 2026-09-09; the earlier "287 remain review-required" reading is stale). The tracked runtime block is scrubbed. **Revocation is now owner-attested complete for every named credential**: production database password rotated (2026-09-12); JWT/admin waived (2026-09-12); both public GCP service-account keys deleted (2026-09-12); Figma waived (2026-09-12); `VAPID_PRIVATE_KEY` was already rotated; `WINDCAVE_API_KEY` was never exposed. IAM/audit-log and independent old-credential-rejection checks are not independently re-tested by this session — see [R0-exit-gate-assessment-2026-09-12](r0/R0-exit-gate-assessment-2026-09-12.md). |
| R0-H1 | Declare and inventory | 554 | Owner/professional/provider | **CLOSED 2026-09-14** — owner disposition: no incident occurred ([record](../../decisions/2026-09-14-r0-h1-no-incident-disposition.md)). |
| R0-H2 | Generate and enter replacement secrets through an owner-controlled channel | 560 | Owner/professional/provider | **All named credentials now owner-attested rotated/deleted (2026-09-12).** Reopened 2026-09-09 when `.env` snapshots were found in the public `origin/main` tree; JWT/admin further-action waived 2026-09-12; `VAPID_PRIVATE_KEY` already rotated; **production database password rotated, confirmed by Oliver 2026-09-12** ([disposition](../../decisions/2026-09-12-production-db-password-rotation-and-r0-h2-disposition.md)); Figma waived 2026-09-12; both GCP Analytics keys owner-confirmed deleted 2026-09-12. No `WINDCAVE_API_KEY` exposure was found. This closes the credential-rotation portion of H2; R0-H4/H5 remain separately open. |
| R0-H3 | Deploy and verify the rotation took | 567 | Owner/professional/provider | **Owner-attested via H2's disposition records (2026-09-12).** This check's own acceptance criterion (old credential rejected) is itself owner-badged in the plan; this session never had visibility into old secret values and does not independently re-test it. Not the same as an agent-verified technical re-check. |
| R0-H4 | Review access logs and scan history | 578 | Owner/professional/provider | **CLOSED 2026-09-14 on owner attestation** — no suspicious access found ([record](../../decisions/2026-09-14-r0-h4-access-log-review-disposition.md)); same caveat as R0-H3, no agent here has hosting/log access to independently re-verify. |
| R0-H5 | Classify tracked uploads and local dumps | 585 | Owner/professional/provider | **CLOSED 2026-09-14** — the three tracked `uploads/invoices/` entries (2 dev-fixture PNGs, 1 zero-byte glob artifact) were content-inspected, confirmed unreferenced anywhere in the repo and unreproducible by current code, and `git rm`'d per explicit owner instruction ([record](../../decisions/2026-09-14-r0-h5-tracked-uploads-deletion.md)). The historical "41 tracked, 38 ignored" figure remains unsourced — flagged as an open curiosity, not a known gap. |
| R1-T1 | No-live-system HTTP test harness | 610 | Engineering | **AUDIT CODE-COMPLETE 2026-09-25 (`05195728`; local), awaiting independent review** ([evidence](r1/R1-T1-harness-audit-2026-09-25.md)): every server test fails if it reaches off the machine (the guard caught two that dialled `192.0.2.1`); the harness builds production's app (`server/app.ts`, shared with `index.ts`); `providerNotification`, `useFakeClock`, `openEventStream`; the public payment bearer is exercised; red first 21 of 24, mutations 30/30, server 81/1,456. Found by it and fixed: live updates never reached a browser (`3fac8ac8`, [evidence](r1/R1-live-updates-compression-2026-09-25.md)). Was: Harness implemented early; audit all transport/clock/SSE/push injection and no-network proof — **unblocked 2026-09-21** (R0 exit established). `165fd605` already made the server harness clear single-key email and SMS credentials. |
| R1-T2 | Checked-in route policy inventory | 622 | Engineering | PARTIAL: [classifier extended and regenerated 2026-09-12/13](r1/R1-T2-classifier-extension-2026-09-12.md) — 218 registrations, **0 unclassified** (was 96/97), 8 principal categories (added `admin`/`public`/`provider-webhook`/`unauthenticated-suspect`), full server regression unchanged at 52/52 suites, 1019/1019 tests. **Found a new gap in the process — see gap 12, partially closed 2026-09-16** (commits `72230602`, `8666dafc` — payment-correctness defect fixed, confidentiality leak still open), **closed by retirement 2026-09-25** (owner decision; `09df766f..5c2cdb27`, local, awaiting review; [evidence](r1/R1-no-board-rework-2026-09-25.md)): the anonymous no-board feed and read are gone, and the inventory has 0 suspected gaps (223 registrations, 0 unclassified). Required per-route fields (capabilityGate, entitlementGate, idempotencyScope, storageMethods, successDto, errorDisclosure) and all-method/use/mounted-router coverage remain incomplete; 0-unclassified is a labeling improvement, not the completed task. |
| R1-T3 | Explicit role and tenant matrix | 639 | Engineering | PARTIAL: owner defaults fixed; full principal/tenant matrix and runtime coverage open. **The password-path contract is corrected (2026-09-11)** — [evidence](r1/R1-T3-password-path-contract-2026-09-11.md): a cross-tenant path id now returns 403 with both accounts' passwords provably unchanged, red run captured first, route policy regenerated. The route was not moved because its only caller builds the URL from the caller's own JWT. **Tenant-scoping domain audit (2026-09-13): Transactions & Refunds** ([evidence](r1/R1-T3-transactions-refunds-tenant-scoping-2026-09-13.md)), **Boards & Stock** ([evidence](r1/R1-T3-boards-stock-tenant-scoping-2026-09-13.md)), **Property** ([evidence](r1/R1-T3-property-tenant-scoping-2026-09-13.md)), and **Trades** ([evidence](r1/R1-T3-trades-tenant-scoping-2026-09-13.md)) were each independently investigated with a live two-merchant runtime probe — all four found already correctly tenant-scoped today, no code change needed. **Settings/Uploads/Exports — completed 2026-09-14** ([evidence](r1/R1-T3-settings-uploads-exports-tenant-scoping-2026-09-14.md)): unlike the four no-gap-found siblings, this domain found and fixed three real upload-handling bugs (UPL-1 auth-before-multer ordering, UPL-2 missing magic-byte check, UPL-5 filename-extension confusion), closed two test-coverage gaps (UPL-6/UPL-7, 7 new cross-tenant tests, no source change), landed a narrow `nosniff` mitigation (UPL-3), and escalated one structural gap rather than fixing it same-day — `uploaded_files` has no tenant column and its public serve route has zero authorization (gap list item 13, decision memo pending Oliver). **Update 2026-09-19:** Oliver chose Option C on 2026-09-14 and it is now implemented — migration `0023` applied to the development database only, not production; see gap list item 13. **All five R1-T3 tenant-scoping domains are now investigated.** Note what the five results do and do not establish: they show the *compared* merchantId is JWT-derived rather than attacker-controllable at each site, not that the storage layer has been migrated to tenant-scoped methods as §8.5 prefers; that refactor remains open. |
| R1-H1 | Accept the device baseline commit before R1 client changes | 651 | Owner/professional/provider | **CLOSED 2026-09-14** — Oliver accepted the [auth/onboarding visual baseline](r1/R1-H1-auth-onboarding-baseline-2026-09-12.md) ("Looks good", [record](../../decisions/2026-09-14-r1-h1-visual-baseline-acceptance.md)). This lifts gap-list item 8 (client work gated) for tasks blocked only on this sign-off. |
| R1-T4 | OAuth rebuild, session storage and shared security primitives | 660 | Engineering | **CONFIRM-WITH-PASSWORD AND ADMIN SIGN-IN CODE-COMPLETE 2026-09-23 (`ff16abfe`, `2a935b02`; local), awaiting independent review** ([evidence](r1/R1-T4-admin-sign-in-and-confirm-password-2026-09-23.md), [decision](../../decisions/2026-09-23-r1-t4-confirm-with-password-owner-answers.md)): confirming a sign-up's email needs the password chosen at sign-up; `npm run admin:password` and a case-blind admin email; the owner must set `ADMIN_PASSWORD_HASH`. **PHASE B CODE-COMPLETE 2026-09-23 (`ce3c13de`; local), awaiting independent review and the owner's live check** ([evidence](r1/R1-T4-phase-B-trusted-proxy-2026-09-23.md)): `TRUST_PROXY_HOPS` (off by default), per-address limits for sign-in, forgot-password and the Google callback. **ACCOUNT-DISCOVERY FOLLOW-UPS CODE-COMPLETE 2026-09-23 (`8fdb63e0`; local), awaiting independent review** ([evidence](r1/R1-T4-account-discovery-2026-09-23.md)): sign-up, the confirmation resend and forgot-password answer every address alike, after the same wait. **PHASE C FOLLOW-UPS CODE-COMPLETE 2026-09-23 (`f6c62f50`; local), awaiting independent review** ([evidence](r1/R1-T4-password-rule-and-sign-in-timing-2026-09-23.md), [decision](../../decisions/2026-09-23-r1-t4-phase-c-owner-answers.md)): one password rule (8+, a capital, a number or symbol) wherever a password is set; every sign-in spends one full check's work, so its time no longer tells which emails have logins. **PHASE C CODE-COMPLETE 2026-09-22 (`e60e90c0`; local), awaiting independent review** ([evidence](r1/R1-T4-phase-C-throttling-2026-09-22.md)): attempts counted in `auth_throttle` and slowed down, never locked; known devices counted on their own; forgot-password and change-password limited; address-keyed limits moved to phase B. **PHASES A and D CODE-COMPLETE 2026-09-22 (`a9426330`, `44a5cfc2`; local), awaiting independent review** ([D evidence](r1/R1-T4-phase-D-sessions-2026-09-22.md)). **D follow-ups code-complete the same day (`50a469e7` password change; `36a320d6` push subscriptions per login; `b714efda` disabling a teammate stops their notifications; local). Migration 0029 applied to the development database only (08:04 UTC, owner decision)** ([evidence](r1/R1-T4-phase-D-follow-ups-2026-09-22.md), [decision](../../decisions/2026-09-22-r1-t4-phase-d-owner-answers.md)). Phase A: ([evidence](r1/R1-T4-phase-A-google-sign-in-2026-09-22.md)); 0024–0028 applied to dev only. Earlier the same day: **PHASE A IN PROGRESS.** Owner answers 2026-09-21 ([decision](../../decisions/2026-09-21-r1-t4-t9-owner-answers.md)): A–D now, E designed separately; Google joins an existing merchant only on a verified email; slow repeated attempts down instead of locking. Schema 0026–0028 committed (`662371ba`, originally `7ba8bc7d`), applied nowhere; phase A server side is a local WIP commit, not pushed ([working notes](r1/WORKING-2026-09-21-r1-t4-t9-progress.md)). Was: **PLAN WRITTEN 2026-09-21, awaiting owner answers Q1–Q5** ([plan](../../PLAN-2026-09-21-r1-t4-sign-in-security.md)). Found: the Google sign-in token (1-hour JWT) is in the `/login?token=` address while GA4 runs — probe with a local gtag stub, nothing sent — so each Google sign-in has sent a working token to the GA property; no `state`/nonce/PKCE; `email_verified` unchecked and existing merchants linked by email; no early session cancel (password reset leaves stolen tokens valid) and an hourly sign-out; no `trust proxy`, so the per-IP login throttle may be one bucket for everyone. Proposed phases A (stop the leak: one-time code + state + PKCE) → B proxy → C shared throttling → D session cancel → E full session rebuild. Was: **UNBLOCKED 2026-09-21** (R0 exit established; R1-H1 accepted 2026-09-14); follows R1-T1's audit (plan C11 after C09). OAuth/session/reset/CORS/distributed-abuse work remains — not started. |
| R1-T5 | Sign in with Apple — protocol-specific adapter on T4's primitives | 686 | Engineering | GATED: R1-T4, then real Apple provisioning/device verification. |
| R1-T6 | Strict numeric path and query parsing — review snapshot has 71 path and 7 query sites | 699 | Engineering | **Task check MET 2026-09-11** — [bounded query values and the source guard](r1/R1-T6-bounded-query-values-2026-09-11.md). The handoff's "five remaining sites" undercounted: four more of the same class hid behind `Number(req.query...)`, `Number.parseInt(String(...))`, `parseInt(String(...))` and a `/^\d+$/` that accepted `0` — one of which passed `NaN` to storage — plus three `parseInt(req.params)` in `middleware/merchant-validation.ts`. All migrated to a reviewed typed schema; zero permissive parses remain in production server code; source guard active **with no allowlist**. Two superseded tests corrected, quoted in the evidence. R1-T2's 97 unclassified registrations are unchanged and still gate the wider task. |
| R1-T7 | Tenant-scoped storage — close the generated authenticated-route gap | 732 | Engineering | PARTIAL: upload SQL moved behind storage; other tenant methods, upload authorization/content/privacy and two-merchant matrix remain. **Closed 2026-09-11** (commit `4183e241`): a foreign-session bypass on `hosted-fields-complete`/`googlepay-complete` — any transaction still in its initial `windcaveSessionId: null` state accepted an arbitrary client-supplied session and could be finalised with a foreign approval — found by a 10-agent cross-tenant/IDOR audit, confirmed by independent adversarial re-check, fixed failing-tests-first. **New open item found in the same sweep**: split-payment session replay in the same `finaliseHostedPayment` helper — see gap 11 above and [the evidence](r1/R1-T7-windcave-session-binding-2026-09-11.md); needs an R3-scoped schema decision. **`C0`/`C1` (preflight + defense-in-depth indexes) landed 2026-09-14**, commit `5318496b` — [evidence](r1/R1-T7-gap11-c0-preflight-c1-index-2026-09-14.md). The replay mechanism itself (`C2`-`C5`) remains open — see gap 11. **Uploads tenant authorization (gap 13) implemented 2026-09-19** (dev database migrated; production not): tenant-scoped storage, migration `0023`, and authenticated + checkout-token download routes — [evidence](r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md); the "other tenant methods, upload authorization/content/privacy" remainder above is reduced accordingly, but `IStorage` is still not tenant-scoped across every domain. |
| R1-T8 | Fix the hook-order crash | 758 | Engineering | **IMPLEMENTED 2026-09-21, commit `387d189d` — awaiting independent review** ([evidence](r1/R1-T8-hook-order-crash-2026-09-21.md)). `MerchantGate` resolves the merchant above the page (keyed by merchant, redirects once from an effect); a client test gates `rules-of-hooks` over the whole client (67 → 0); `jest.setup.js` fails any client test in which React warns (18 act() warnings → 0); the repro now asserts no throw. Client 60/552; mutations 5/5; the four routed phone pages pixel-identical to the pre-fix build; Sign out on /settings reproduces React #300 before the fix and lands on /login after it. Originally recorded: **UNBLOCKED 2026-09-21** (R0 exit established; R1-H1 accepted 2026-09-14). Scope measured the same day: `react-hooks/rules-of-hooks` reports **66 violations in exactly the seven named pages** (settings 18, merchant-terminal 13, merchant-terminal-mobile 12, transactions 11, stock-management 6, exports 3, payment-stack 3) plus 1 in `merchant-terminal-mobile-v2.test.tsx` — 67 in the client; the repro test still asserts the crash; the client suite prints 18 `act(...)` warnings (12 from `Settings`, 6 from `MerchantTerminal`). Crash characterization is not a fix. |
| R1-T9 | Truthful frontend failure states | 773 | Engineering | **COMPLETE 2026-09-23 (`c37f1602..025d638d`, `e4c25fb1..b86f0071`; local), awaiting independent review** ([handoff and brief](r1/R1-T9-INDEPENDENT-REVIEW-BRIEF-2026-09-25.md), 2026-09-25; re-run at `b86f0071`: `tsc` clean, client 86/760, server 79/1,432). Was: **ROLLOUT IN PROGRESS 2026-09-23: retail stock and terminal (`0b0a9fb7`), property analytics (`5805a416`), property terminal (`f48139f6`), trades analytics (`64e12ef8`) done; local, awaiting independent review** ([evidence](r1/R1-T9-rollout-2026-09-23.md)): a failed load says so with Try again instead of "0 products", "$0 today", "$0.00 total revenue" or "no sales yet"; the terminal's send buttons wait for its sales; reports and exports wait for their data (on trades analytics, made only from loaded data); loaded views unchanged. Reports and exports on all three analytics screens are made only from loaded data, each waiting for its sources (`0c75e747`, `d5cf4d5f`, `88fe0e3f`, `721ce328`). Trades terminal (`2e8b308a`) and desktop settings (`6dd7bc68`) done: **the screen list is complete**. 402 banners done (`1f6a8673`, `8a4e8c20`, `09b07a43`, `a2dee290`; [evidence](r1/R1-T9-billing-402-2026-09-23.md)). Pending/double-submit done (`0a257926`, `0220c6f9`, `09000e9f`; [evidence](r1/R1-T9-pending-and-double-submit-2026-09-23.md)): **every R1-T9 item is done, awaiting independent review.** Found on the way and fixed (`707cff2f`, `0f748fde`): exports lacked the business details after a password sign-in ([evidence](r1/R1-T9-export-business-details-2026-09-23.md)). Was: **DESIGN APPROVED 2026-09-21** ([decision](../../decisions/2026-09-21-r1-t4-t9-owner-answers.md)); rollout to the remaining screens follows R1-T4 A–D in the working order. Was: **PILOT 2026-09-21, commit `2c013f33` (cleaned: `025d638d`) — design awaiting owner approval** ([proposal and evidence](r1/R1-T9-failure-states-2026-09-21.md)). `DesktopLoadFailure` (desktop palette only, one `role="alert"` per failure, Try again) on retail analytics: a failed sales load no longer reads "$0.00 / 0 transactions / no sales yet"; Reports/Export unavailable; loaded view pixel-identical. Remaining after approval: retail stock and terminal, property analytics and terminal, trades analytics and terminal (incl. `trades-terminal.tsx:165` mapping a failed request to `[]`), settings; optional-source "unavailable", mutation pending/double-submit rules, 402 banners. Was: GATED: R1-T8. |
| R1-T10 | Device and tutorial acceptance matrix | 780 | Engineering | GATED: T3/T5/T7/T9 and H1; typed routes, devices, tutorials and accessibility acceptance remain. |
| R2 | Provider boundary and exact verification | 818 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R3 | Durable notifications and payment convergence | 831 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R4 | Durable refunds | 871 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R5 | Encryption | 881 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R6 | Entitlement, scheduler, health, observability | 905 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R7 | Native truthfulness and full regression | 914 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R8 | CI, dependency hygiene, truthfulness, rehearsal | 926 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-H1 | Formalise the locked companion-v1 subscription model | 974 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| A-H2 | Confirm legal entity, capabilities, wallet scope and truthful reviewer environment | 980 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| A-H3 | Approve deletion, retention and legal-hold policy | 988 | Owner/professional/provider | PARTLY DECIDED 2026-09-21 — invoice documents 7 years after the tax year of their invoice, gap-13 ownership records with their document, admin-read log 7 years ([decision](../../decisions/2026-09-21-gap13-ownership-rule-and-retention.md)). Still open: professional confirmation (incl. whether TaptPay is an AML/CFT reporting entity), legal holds, the deletion job itself, and every other data class (bank fields, backups, accounts). Nothing deletes automatically. |
| A-T1 | Info.plist usage strings and export compliance | 996 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T2 | Entitlements and Sign in with Apple/push provisioning | 1002 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T3 | Evidence-driven privacy manifest and App Store privacy label | 1008 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T4 | Production bundled shell and API boundary | 1015 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T5 | Offline, external-navigation and deep-link safety | 1021 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T6 | Idempotent account-closure workflow | 1028 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T7 | Native Settings, subscription, privacy and wallet truth | 1034 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T8 | Signed release-candidate and review rehearsal | 1040 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-H4 | Prepare metadata, submit with manual release, and monitor | 1048 | Owner/professional/provider | GATED human release/pilot: requires signed post-R8 candidate and track-specific approvals. |
| X-H1 | Register the app and freeze current vendor/commercial facts | 1087 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| X-H2 | Approve accounting, GST, payment-provenance and settlement semantics | 1098 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| X-T1 | Create immutable local accounting documents and allocations | 1114 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T2 | Create connection-scoped Xero schema | 1121 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T3 | Transactional storage contract | 1134 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T4 | Feature gates, route policy and connection lifecycle contracts | 1140 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T5 | OAuth consent, organisation selection, reconnect and disconnect | 1146 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T6 | Serialized token refresh coordinator | 1153 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T7 | Transactional outbox worker and ambiguous-response recovery | 1159 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T8 | Distributed rate, concurrency and outage control | 1166 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T9 | Persistent account and tax mappings | 1172 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T10 | Stable contact mapping without email identity | 1178 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T11 | Trades invoice export from immutable snapshots | 1184 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T12 | Payment allocation and settlement reconciliation | 1190 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T13 | Credit-note, allocation and refund-payment state machine | 1196 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T14 | Settings, repair controls, observability and full fault/scale suite | 1202 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-H3 | Approve and run the canary pilot | 1217 | Owner/professional/provider | GATED human release/pilot: requires signed post-R8 candidate and track-specific approvals. |

## Decisions and cross-workstream rules

D1–D25 remain in the source P9 register. Locked decisions are not reopened.
D7's accepted lineage is recorded above; R0-H2's current disposition is the dated
owner instruction. D8 retention, D9 entitlement/dunning, D12 funds model and
D17 vendor confirmation retain their named external gates. D10/D16/D20/D23/D25
are product choices, not substitutes for baseline, accountant, provider or device
proof. Apple discovery A-H1/H2/H3 and Xero discovery X-H1/H2 may run in parallel;
submission and remote merchant/accounting writes cannot bypass their dependencies.
Property/Retail Xero, Tap to Pay, crypto, broad redesign and the other P8.4 deferred
items remain explicitly deferred. No capability or payment-mode flag was enabled.

## Inherited individual controls — mapping backlog

P8.4a requires the still-applicable v2.2 §22 checkboxes to have individual task,
owner, test and artifact mappings before phase decomposition. The checklist below
retains every source checkbox verbatim by subsection and line, so none disappears
inside a grouped “covered elsewhere” claim. **These are open mapping/review items,
not verified work.** Applicability and destination are resolved through P8.4a;
§22.14 remains deferred and must not be promoted without an ADR. Phase-level rows
above are navigation only and do not satisfy this individual mapping requirement.

Source: [v2.2 audit input](../../PLAN-2026-08-24-taptpay-remediation-v2-2.md).


### 22. Master content checklist and phase crosswalk


### 22.1 Governance, D1–D8, and constraints

- [ ] Source 22.1, line 1537: Record D1–D8 in `docs/decisions/`, including D4 platform-owned Windcave credentials and D8 encrypt-and-keep bank data as **provisional product/legal decisions**.
- [ ] Source 22.1, line 1538: D1 assumes live merchants and real payments exist and treats every production row/artifact as live.
- [ ] Source 22.1, line 1539: D2 keeps historical Stripe schema columns until dead-proof and a separately reviewed migration; this remediation proposes no drop.
- [ ] Source 22.1, line 1540: D3 keeps Replit + Neon as the target for the remediation period.
- [ ] Source 22.1, line 1541: D4 permits platform-owned `WINDCAVE_USERNAME` / `WINDCAVE_API_KEY` technically for UAT; real processing also needs D12 funds-flow approval.
- [ ] Source 22.1, line 1542: D5 keeps crypto OFF. `FEATURE_CRYPTO` is a false-only kill switch/invariant; true is rejected and no crypto code is recreated.
- [ ] Source 22.1, line 1543: D6 runs synthetic beta merchants against sandbox/UAT first; real processing waits for every applicable gate.
- [ ] Source 22.1, line 1544: D7 cuts/records the remediation branch from the product-approved active tablet/desktop SHA.
- [ ] Source 22.1, line 1545: D8 encrypts and keeps legacy bank data provisionally, with no new collection and a later retention/deletion decision.
- [ ] Source 22.1, line 1546: Enforce the feature freeze: no new verticals or noncritical features.
- [ ] Source 22.1, line 1547: Use the ADR decision log for every locked choice, change, exception, open provider/legal choice, and superseding decision.
- [ ] Source 22.1, line 1548: Complete the §21 reviewer template and independent second pass before implementation; final recommendation must be Approve.
- [ ] Source 22.1, line 1549: Apply boring-over-clever, fail-fast/fail-closed, never-trust-the-client, money-is-traceable, and reversible-change principles from §1.4.

### 22.2 Requested Phase −1 — handoff and preflight

- [ ] Source 22.2, line 1555: **Step 0 prerequisite — reconcile, do not blindly apply.** Read the pending-migration instructions in `docs/PLAN-2026-08-10-finish-review-and-fix.md`, name the target, and run read-only migration status/fingerprint. The 2026-08-24 inspected dev target reports 19 applied, 0 pending, 0 drifted, 0 orphaned, so Step 0 is currently satisfied without an apply. If a named dev target later shows a legitimate pending migration, stop, restore-test, rehearse, obtain migration approval, and apply only that reviewed forward migration. Any failure is a stop condition.
- [ ] Source 22.2, line 1556: Read `CLAUDE.md`, `AGENTS.md`, all listed handoffs/plans, `replit.md`, and `DEPLOYMENT.md`.
- [ ] Source 22.2, line 1557: Inventory active branch/SHA, dirty and in-flight work, worktrees, unmerged migrations, open PRs, deployment candidate, and owners. Do not infer open-PR state without checking the authorized remote.
- [ ] Source 22.2, line 1558: Inventory deployments: public/admin/payment/provider hosts; canonical domains; Replit build/run/release commands; autoscaling; env/secret sources; Neon projects/branches/roles; WebSocket adapter; scheduler; object storage; DNS/TLS; backup and rollback capability.
- [ ] Source 22.2, line 1559: Inventory and preserve existing auth middleware, JWT/admin validation, hashed retail bearer tokens, payment attempts/dedupe, DTO allowlists, redaction, migration runner, PostgreSQL verifiers, browser checks, rate limiting, and state claims.
- [ ] Source 22.2, line 1560: Classify live data, uploads, local/managed backups, logs, Git history, provider identifiers, bank fields, OAuth tokens, push subscriptions, and synthetic/test data.
- [ ] Source 22.2, line 1561: Record the coordination agreement: existing phone behavior, tablet full-bleed UI, centered desktop frame, auth/onboarding, tutorial adaptation, real API wiring, and no mock merchant data remain acceptance constraints.

### 22.3 Requested Phase 0 — safety nets before churn

- [ ] Source 22.3, line 1567: Create a managed Neon snapshot and, if required, an encrypted logical backup; restore into an isolated scratch project and verify schema, representative counts, tenant isolation, and decryptability. Record RPO/RTO and owner.
- [ ] Source 22.3, line 1568: After review approval, create `pre-remediation-<date>` tag, archive/checksum the deploy artifact in approved storage, and record exact rollback commands, flag rollback, schema compatibility, secret-rotation caveats, and responsible operator.
- [ ] Source 22.3, line 1569: Route-enforce `FEATURE_LIVE_WINDCAVE`, `FEATURE_REFUNDS`, `FEATURE_CRYPTO=false`, `FEATURE_WOOCOMMERCE=false`, `FEATURE_TAP_TO_PAY`, and `FEATURE_SPLIT_PAYMENTS`. §5 defines canonical mappings and adds per-domain flags so a broad switch cannot accidentally stop reconciliation.
- [ ] Source 22.3, line 1570: Defaults are off/fail-closed for staging and new deployments. A production enablement/change needs a business decision, merchant-impact/maintenance plan, rollback owner, and observation window.
- [ ] Source 22.3, line 1571: Run the current CI characterization without masking hook crashes, React warnings, page errors, tolerated visual defects, or pre-existing lint configuration failures.
- [ ] Source 22.3, line 1572: Add Zod configuration validation with `ENV_VALIDATION_MODE=audit|enforce`. First deploy may audit/warn for inventoried noncritical optional groups without values. Security-critical variables, invalid payment/environment combinations, partial credential pairs, and production seed/simulation are always enforced immediately. Move each feature group to enforce only after its inventory is complete; production money enablement requires all relevant groups enforced.
- [ ] Source 22.3, line 1573: Make deployment build side-effect-free: replace `npm run build && npm run db:migrate` with build only. Migrations run in a separately approved release step.
- [ ] Source 22.3, line 1574: Remove automatic production DB dumping from development startup.

### 22.4 Requested Phase 1 — non-destructive Stripe removal

- [ ] Source 22.4, line 1580: Run case-insensitive searches across source, generated entry points, routes, webhooks, UI, env templates, deployment config, package/lock files, WooCommerce, and current docs.
- [ ] Source 22.4, line 1581: Require zero Stripe runtime imports/routes/UI/webhooks/env reads. If a reachable runtime path is found, remove it with focused tests.
- [ ] Source 22.4, line 1582: Uninstall a Stripe package only if lockfile/import/build proof shows it remains; at review time Stripe packages are already absent.
- [ ] Source 22.4, line 1583: Inventory every historical `stripe_*` column/table reference, annotate deprecated/historical, and preserve it. A future drop needs data count, code/history dead-proof, backup, forward migration, and approval.
- [ ] Source 22.4, line 1584: Remove stale Stripe and unsafe production-ready/compliance wording from `SECURITY.md`, `APPLE_PAY_GOOGLE_PAY_COMPLIANCE.md`, `DEPLOYMENT.md`, README/product/plugin/legal copy while preserving truthful historical migration notes.

### 22.5 Requested Phase 2 — dependency and repository hygiene

- [ ] Source 22.5, line 1590: Capture `npm ls --all`, direct/transitive dependency graph, package-lock integrity, import graph, build bundle evidence, runtime dynamic imports, and native/build/test consumers.
- [ ] Source 22.5, line 1591: Treat every old v1 “typo/removal” list as examples to verify, never an uninstall list.
- [ ] Source 22.5, line 1592: For each proven-unused group run targeted `npm uninstall <exact packages>`, then `npm ci`, review `package.json` and lockfile diff, typecheck/test/build. Never delete or regenerate the lockfile casually.
- [ ] Source 22.5, line 1593: Verify compatible `react` and `react-dom` remain runtime dependencies. Move `@types/*`, compilers, test runners, linters, and build-only tooling to `devDependencies` only after production build/install proof.
- [ ] Source 22.5, line 1594: Select and retain one email delivery provider/adapter. Remove SendGrid/Resend/Nodemailer alternatives only after route/job/config/template and production delivery proof. Preserve a provider-independent interface and test fake.
- [ ] Source 22.5, line 1595: Make scripts explicit and portable: use `cross-env` where environment assignment must work on Windows, keep explicit Vite + esbuild production build, use a clear `tsx watch` development script, and prove Linux/Replit behavior does not regress.
- [ ] Source 22.5, line 1596: Add `.nvmrc`/Node engines, complete `.gitignore`, and a key-name-only `.env.example`; rename package `rest-express` to the approved TaptPay package name with lockfile review.
- [ ] Source 22.5, line 1597: Inventory `taptpay-ios.zip`, visual/demo archives, tracked `uploads/`, `attached_assets/`, screenshots, `.verify1.mjs`, stray HTML, generated bundles, local audit scripts, database dumps, and AI-tool folders. Classify reachability, design provenance, licensing, PII, and handoff need before removal. Move required artifacts to approved storage/docs, remove proven junk with explicit paths, and document/ignore `.claude-home/**`, local AI state, dumps, traces, and runtime uploads. Never wholesale-delete design sources or live uploads based only on a filename.

### 22.6 Requested Phase 3 — database correctness and migration safety

- [ ] Source 22.6, line 1601: Verify/preserve the Neon WebSocket Drizzle adapter; remove a conflicting SQLite import only if a new source audit finds one. Current audit found none.
- [ ] Source 22.6, line 1602: Harden the existing runner rather than replacing it: explicit target identity, advisory-lock timeout, `lock_timeout`, `statement_timeout`, structured/redacted logging, backup/rehearsal gate, destructive/drop approval, and no auto-apply from build/startup.
- [ ] Source 22.6, line 1603: Run count-only dirty-data preflights before every unique/CHECK/FK/not-null change and record reviewed cleanup decisions without row values.
- [ ] Source 22.6, line 1604: Rehearse on a production-sized restored clone and measure locks. Handle concurrent indexes only through an explicitly reviewed runner mode or approved short-lock window.
- [ ] Source 22.6, line 1605: Review constraints/indexes for provider notification identity, client/provider idempotency keys, normalized email uniqueness, FK integrity, tenant ownership, merchant/status/created-at queries, session/X-ID/provider-transaction lookup, refund reconciliation, and job claims. Add only query- and data-proven indexes.
- [ ] Source 22.6, line 1606: Plan `timestamptz`/UTC normalization as separate forward migrations: define ambiguous legacy timezone, convert on a restored clone, store UTC, display in merchant/user locale, and test DST boundaries. Do not mix this with money schema.
- [ ] Source 22.6, line 1607: Financial records have no hard-delete API. Use void/cancel/correction events and, for nonfinancial mutable records where deletion is allowed, reviewed `deleted_at` semantics.

### 22.7 Requested Phase 4 — Windcave notification integrity

- [ ] Source 22.7, line 1611: Remove any route-local `express.urlencoded()` / `express.json()` parser on Windcave notifications so one bounded application/provider parser owns the body. Do not add raw-body signature machinery unless Windcave proves a signed mode is active.
- [ ] Source 22.7, line 1612: Treat the notification as a hint: extract bounded `sessionId` / `transactionId`, durably record it, query Windcave with validated platform credentials, and match final status, exact cents, currency, platform provider account/environment, locally bound merchant/aggregate, merchant reference, session, type, and provider transaction.
- [ ] Source 22.7, line 1613: Reject/quarantine every missing, malformed, ambiguous, pending-as-final, or mismatched result. Log a sanitized failure/security event with request ID, never the raw body or full provider identity.
- [ ] Source 22.7, line 1614: Dedupe through the existing durable retail payment attempt plus the R3 provider-notification inbox. Its unique provider/session/kind key is the Windcave equivalent of requested `webhook_events(provider,event_id)`; do not invent an event ID the provider does not supply.
- [ ] Source 22.7, line 1615: Multiple, duplicate, delayed, and out-of-order FPRNs/callbacks are safe; only one atomic finalizer can create the terminal domain/event/message effects.

### 22.8 Requested Phase 5 — incident response, secrets, uploads, and encryption

- [ ] Source 22.8, line 1619: D4 uses platform-owned `WINDCAVE_USERNAME` / `WINDCAVE_API_KEY` as the short-term technical model and remains provisional for real funds.
- [ ] Source 22.8, line 1620: Support `MASTER_ENCRYPTION_KEY` only as an initial single-key/E1 compatibility input if needed; production design must expose an active key ID and readable keyring so rotation is possible. Validate a 32-byte key and never log it.
- [ ] Source 22.8, line 1621: The checklist shorthand `enc:v1:iv:tag:cipher` remains the versioned AES-256-GCM envelope concept. New writes use the safer rotation-capable `enc:v1:<key-id>:<base64url(iv)>:<base64url(tag)>:<base64url(ciphertext)>`.
- [ ] Source 22.8, line 1622: Deploy dual-read plaintext compatibility, then encrypt-on-write, then dry-run and idempotent CAS backfill. “Instant rollback via dual-read” means rolling back to an E1-compatible reader while stopping the writer/job; it never means resuming plaintext writes or deploying pre-E1 code after ciphertext exists.
- [ ] Source 22.8, line 1623: Detect/count plaintext and malformed/unknown/decrypt-failed envelopes without printing values. Decrypt only inside authorized server data/provider/operations services; never in browser DTOs, general logging, analytics, or templates that do not require it.
- [ ] Source 22.8, line 1624: Mask secrets and legacy bank fields in every API DTO; extend the central redactor to nested logs/errors/events.
- [ ] Source 22.8, line 1625: Audit sanitized backfill success/skip/failure counts and secret/key rotation events.
- [ ] Source 22.8, line 1626: Run gitleaks or approved equivalent on current tree/history; rotate and execute §7.1 incident steps for every real secret/PII exposure.
- [ ] Source 22.8, line 1627: Secure file uploads: authenticate and tenant-authorize before streaming; strict byte-size, count, extension-independent MIME/magic validation; randomized object keys; malware scanning/quarantine where appropriate; no executable serving; private object storage; short-lived signed download URLs after authorization; retention/deletion audit; no commits of runtime uploads.

### 22.9 Requested Phase 6 — authentication, authorization, and state machines

- [ ] Source 22.9, line 1631: Keep JWT bearer auth short-term. Schedule and ADR an evaluation of HttpOnly secure SameSite cookies + CSRF for web and OS secure storage for native; do not silently swap token transport during remediation.
- [ ] Source 22.9, line 1632: Remove `express-session`, `connect-pg-simple`, `memorystore`, and related packages only after route/import/runtime dead-proof.
- [ ] Source 22.9, line 1633: Standardize minimal JWT claims: subject/user ID, merchant ID where applicable, role/principal type, issued/expiry, token version/session ID, issuer/audience; no bank/provider secrets or mutable profile data. Use centralized `requireAuth`, `requireMerchant`, and `requireAdmin` middleware (or documented equivalent names) with server/database validation.
- [ ] Source 22.9, line 1634: Complete the route policy matrix for method, path, principal, role, tenant scope, parameter/body/file validation, feature/billing gate, idempotency, rate limit, DTO, and side effects.
- [ ] Source 22.9, line 1635: Dynamic two-merchant and admin integration tests prove Merchant A never sees or changes Merchant B.
- [ ] Source 22.9, line 1636: Production seed/demo login is disabled and audited.
- [ ] Source 22.9, line 1637: Password reset tokens are random, digest-only at rest, single-use, short-lived, tenant/account scoped, invalidated on success/password change, and responses do not enumerate accounts. Password change invalidates prior sessions/token version.
- [ ] Source 22.9, line 1638: Shared/distributed rate limits cover login, signup, reset, payment/session creation, public payment/result polling, admin, provider notification abuse, email/SMS/WhatsApp, upload, and API-key paths with proxy/IP correctness and account/tenant dimensions.
- [ ] Source 22.9, line 1639: Lock CORS to exact approved origins/methods/headers/credentials; provider server-to-server routes do not rely on browser CORS as authentication.
- [ ] Source 22.9, line 1640: Enforce aggregate-specific state machines. The requested current public subset `pending`, `completed`, `failed`, `refunded`, `partially_refunded` is preserved, but repository reality also requires `processing` and `cancelled`; no silent renaming to provider `approved/declined`.

### 22.10 Requested Phase 7 — payment engine hardening

- [ ] Source 22.10, line 1644: Preserve the existing hash-only retail public payment token model; audit entropy, digest comparison, expiry/rotation/single-resource scope and return-state use. Do not create a second retail token system. Property/trades raw link tokens follow the staged hash migration in §10.1.
- [ ] Source 22.10, line 1645: Enforce exact UAT/production Windcave hosts and returned-link relations in code, not only CSP.
- [ ] Source 22.10, line 1646: Test every disabled money route for its specified `404/503` (or role `403`) and zero DB/provider/SSE/push/outbox effects. The exact code follows §5.4 rather than interchangeable 403/404.
- [ ] Source 22.10, line 1647: Move route orchestration into focused `server/services/payments/` modules or an equivalently documented domain directory. Route handlers authenticate/validate/call services/map DTOs; they do not implement provider state machines.
- [ ] Source 22.10, line 1648: Use durable client idempotency, request fingerprints, stable provider X-IDs, leases, and database uniqueness for payments, refunds, subscriptions, and notification processing.
- [ ] Source 22.10, line 1649: Preserve/extend `transaction_events` for created, session-bound, processing, approved/completed, declined/failed, cancelled, refunded, webhook/FPRN, split, manual correction, and reconciliation events. Events are append-only and written with the state change.
- [ ] Source 22.10, line 1650: Reserve the schema names `financial_ledger_accounts` and `financial_ledger_entries` in the D12 accounting ADR. Ship domain events now. Implement the append-only balanced ledger only if funds-flow/accounting review makes it a gate; do not create decorative unused tables.
- [ ] Source 22.10, line 1651: Centralize integer-cents parsing/formatting/allocation; no binary float math for new financial logic. Define currency scale and overflow.
- [ ] Source 22.10, line 1652: Test NZ GST 15% inclusive and exclusive, cent rounding/allocation, line totals, quotes→invoices, split shares, partial/full refunds, and reporting/export totals against approved accounting examples.
- [ ] Source 22.10, line 1653: Split safeguards: min/max participant/share count, exact total allocation with deterministic remainder, immutable share binding, unique live attempt, caps, transactions/locks, abandonment/expiry, and idempotent completion.
- [ ] Source 22.10, line 1654: Refund safeguards follow R4: eligibility, owner role, confirmed captured gateway/share ID, remaining cap, stable idempotency/X-ID, unknown reconciliation, verified notification/query, and one terminal update.
- [ ] Source 22.10, line 1655: Windcave provider interface exposes typed `createSession`, `querySession/queryTransaction`, `createRefund`, `verifyOutcome`, and sanitized error categories through injected transport.
- [ ] Source 22.10, line 1656: Hosted payment retry rules: same client key reuses the live session; never create a second session while a provider-bound attempt is unknown; persist and validate return state; model 3DS required/redirect/complete/failed/expired fields in attempts/events before enabling that path.
- [ ] Source 22.10, line 1657: Build a settlement reconciliation report comparing local confirmed operations with authoritative gateway exports/API: counts, gross cents, processor fees, refunds, disputes where available, net, unmatched local, unmatched provider, and age. It does not claim merchant payout correctness until D12 is resolved.

### 22.11 Requested Phase 8 — frontend and native

- [ ] Source 22.11, line 1661: Add centralized typed route constants/builders in `shared/routes.ts` (or an ADR-approved split for server/client) and replace payment/auth/protected hardcoded strings in reviewed batches.
- [ ] Source 22.11, line 1662: Audit protection and device shell for `/terminal`, `/stack`, `/smart-terminal`, `/property/*`, `/trades/*`, and `/admin/*`; test unauthenticated, member, owner, other tenant, and admin cases.
- [ ] Source 22.11, line 1663: Preserve/extend the global React/chunk error boundary with a friendly retry/reload action, request ID where safe, and no stack/internal error details.
- [ ] Source 22.11, line 1664: Every data page distinguishes loading, error, true empty, partial/unknown, retrying, and success; money CTAs disable on essential uncertainty.
- [ ] Source 22.11, line 1665: One terminal payment UI/controller state machine owns idle, validating, claiming, redirect/native pending, processing, approved, declined, cancelled, error, and retry; one client action cannot double-submit.
- [ ] Source 22.11, line 1666: Capacitor work aligns `startTapToPay` in TypeScript, Swift, and `CAPPluginMethod`; removes `window.TaptPay`; uses `useTapToPay`; and detects web/iOS/unsupported OS-device/SDK/entitlement/offline/server-feature/provider-mode. Until real proof, capability is false.
- [ ] Source 22.11, line 1667: Re-run tablet/desktop/mobile/auth/onboarding/tutorial acceptance after every terminal-affecting batch.
- [ ] Source 22.11, line 1668: Accessibility pass covers names/labels, error association, focus order/trap/restore, keyboard operation, visible focus, semantic status/alerts, contrast, reduced motion, screen reader payment status, and approved tap-target geometry without blindly changing mobile layout.

### 22.12 Requested Phase 9 — operations, observability, staging, and delivery

- [ ] Source 22.12, line 1672: Add secret-free `/healthz` and `/readyz` per §13.4.
- [ ] Source 22.12, line 1673: Propagate validated/generated `X-Request-ID` (response header may use canonical `X-Request-Id`) through all request/job/provider logs.
- [ ] Source 22.12, line 1674: Emit structured logs through existing extended redaction.
- [ ] Source 22.12, line 1675: Record sanitized payment events/metrics for created, processing, approved/completed, declined/failed, cancelled/expired, refund states, FPRN mismatch/failure, duplicate ignored, reconciliation, and Tap-to-Pay capability/actions if ever enabled.
- [ ] Source 22.12, line 1676: Add a Sentry-class error tracker only after DPA/data-region/sampling/retention review and a before-send scrubber proves no secret, card, bank, token, raw provider body, or PII leakage. Keep it disabled until configured.
- [ ] Source 22.12, line 1677: Use durable background work/leases/outbox for expiry, provider retry, email/SMS/WhatsApp, reminders, PDFs, reports, subscription billing, payouts, and reconciliation. Reuse existing jobs; add missing durability rather than duplicating them.
- [ ] Source 22.12, line 1678: Staging has a separate Neon database/project/roles, UAT credentials, synthetic merchants/customers, separate push/email destinations, no production PII or copied live secrets, and external side effects captured/allowlisted.
- [ ] Source 22.12, line 1679: Runbooks cover backup/restore, Windcave outage, DB outage, secret leak, suspected breach, fraud spike, notification backlog/failure, refund unknown, subscription double-charge risk, admin compromise, scheduler stale, rollback, and customer/merchant communications.
- [ ] Source 22.12, line 1680: CI/branch protection requires PR review, typecheck, repaired lint, tests, build, isolated PostgreSQL/migration verification, secret scan, dependency triage, and migration-owner review.
- [ ] Source 22.12, line 1681: Use releases/tags/changelog with exact SHA, migrations, flags, known issues, artifact checksum, rollback, and evidence links.
- [ ] Source 22.12, line 1682: Provide a portability escape hatch: reviewed `Dockerfile`/container build, environment contract, health checks, migration release command, and deployment docs that can run away from Replit without pretending this remediation is a platform migration.

### 22.13 Requested Phase 10 — compliance and legal truthfulness

- [ ] Source 22.13, line 1686: Validate PCI scope against the actual enabled Windcave HPP, Hosted Fields/AJAX, wallet, subscription-token, and native data flows; documentation alone is not evidence.
- [ ] Source 22.13, line 1687: Correct every “production ready,” PCI/SAQ, native/wallet, encryption, monitoring, and endpoint-protection claim until its gate passes.
- [ ] Source 22.13, line 1688: Product/legal owns and approves Terms of Service, Privacy Policy, Merchant Agreement, Payer Terms, Refund Policy, and Acceptable Use Policy; link versions/effective dates and acceptance evidence.
- [ ] Source 22.13, line 1689: Define retention/deletion/legal-hold for merchants, users, financial records, provider identifiers, bank data, uploads, messages, logs, audit events, backups, and encryption keys.
- [ ] Source 22.13, line 1690: Record lawful consent and per-channel communication preferences/opt-out for email, SMS, WhatsApp, and push.
- [ ] Source 22.13, line 1691: Obtain NZ GST/tax/accounting review and provide exportable, immutable financial/event records with defined rounding and timezone.
- [ ] Source 22.13, line 1692: Obtain professional AML/KYB, sanctions, merchant onboarding, fraud, chargeback, refund, merchant-of-record, and settlement review before real onboarding/processing.
- [ ] Source 22.13, line 1693: Audit every admin action and impersonation/configuration/secret/merchant-status change with actor, target, reason, time, request ID, and before/after classification without sensitive values.
- [ ] Source 22.13, line 1694: Complete the bank-data handling and D8 retention review.

### 22.14 Requested Phase 11 — explicitly deferred after gates

- [ ] Source 22.14, line 1698: Merchant god-table normalization; organization/membership/role redesign; locations, terminals, and device management.
- [ ] Source 22.14, line 1699: Broader vertical isolation and long-term WooCommerce/trades/property product strategy beyond safety kill switches.
- [ ] Source 22.14, line 1700: Full OpenAPI contract, generated typed client, pagination strategy, and generalized reporting module.
- [ ] Source 22.14, line 1701: Broad load testing, disaster-recovery drills beyond release restore proof, fraud engine, payout tracking, synthetic monitoring, and independent penetration test.

### 22.15 Complete verification matrix


### 22.16 Checklist stop conditions and final approval
