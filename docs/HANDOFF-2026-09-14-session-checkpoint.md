# Session checkpoint — 2026-09-14 (mid-session save, usage limit approaching)

This is an emergency checkpoint, not a finished evidence record. It exists so
the next session can resume exactly where this one was cut off, without
re-deriving context or losing the owner's answers below. Read this file first
if you are resuming R1 remediation work on `remediation/r1-continuation-20260907`.

## 1. A background Workflow is still running (or may have just finished)

Launched this session: **Task ID `wo8x9rcxj`, Run ID `wf_8e0b21e5-16e`**,
script name `r1-t3-settings-uploads-exports`. It investigates the fifth and
final R1-T3 tenant-scoping domain (Settings, Uploads & Exports) using the same
plan → 3-reviewer panel → implement → 2-skeptic-verify → writeup pipeline the
prior four domains used.

**Do not re-launch it.** If it already completed, its notification and full
output are what you should read next (a task notification arrives as a
user-role message; if this session already ended, use `/workflows` or read
`<transcriptDir>/journal.jsonl` under
`/home/runner/.claude/projects/-home-runner-workspace/bba0a444-1a69-4eae-869c-6a2fd3cc6626/subagents/workflows/wf_8e0b21e5-16e/`
to recover its result without re-running agents). If it's still running,
either wait for its notification or resume with
`Workflow({scriptPath: "/home/runner/.claude/projects/-home-runner-workspace/bba0a444-1a69-4eae-869c-6a2fd3cc6626/workflows/scripts/r1-t3-settings-uploads-exports-wf_8e0b21e5-16e.js", resumeFromRunId: "wf_8e0b21e5-16e"})`
— completed stages return cached instantly.

### What it had already produced by checkpoint time (committed in this same commit)

Its Implement phase landed one fix with a permanent regression test,
independently reviewed by its panel before being written:

**UPL-1** — `POST /api/merchants/:id/logo` ran `logoUpload.single('logo')`
(multer, memory-buffered) *before* `checkAccountOwnership` — violating the
plan's explicit "must not accept... a file before merchant ownership is known"
rule. Fixed by adding a `requireLogoOwnership` middleware ahead of multer in
the route chain (`server/routes.ts`); the handler's own inline re-check is
kept as harmless defense in depth. Test:
`server/__tests__/route-policy-role-defaults.test.ts` (3 new cases: non-owner
403 before multer errors, cross-tenant 403 with zero write, owner sanity
check). **This was committed as-is in this checkpoint** — it's narrow,
schema-free, no product decision, matches the established low-risk-fix bar
this whole project has used since `c1e42db1`.

### What the workflow was still expected to produce (not yet landed)

Per its own design (see the script above), still pending when this checkpoint
was written:
- A verdict + possible narrow fix on **finding candidate #2**: the invoice-
  document upload (`POST /api/property/invoices/document`, using
  `invoiceDocUpload`) has no server-side magic-byte check on the uploaded
  content — only the client-supplied `Content-Type` is checked. Logo upload
  already does magic-byte verification; this route doesn't.
- A verdict on **finding candidate #3** (the big one, likely escalated rather
  than fixed): `GET /uploads/:folder/:name` is a fully unauthenticated static
  serve route, and `shared/schema.ts`'s `uploaded_files` table has **no
  merchant/tenant column at all** — tenant isolation for every uploaded file
  (logos, and property invoice documents which can carry real tenant
  financial info) currently rests entirely on filename secrecy, not
  authorization. This directly conflicts with the plan's uploads security
  requirements (tenant-bound short-lived download auth, no public
  storage-key exposure, nosniff headers). Expect this to come back as an
  **owner-decision item**, not a same-day fix (logos plausibly need to stay
  publicly `<img>`-able; invoice documents may not) — likely with a narrow,
  no-product-decision nosniff-header mitigation proposed as a stopgap,
  mirroring how gap 12 got a narrow mitigation now plus a bigger decision
  memo.
- The evidence file at
  `docs/evidence/remediation-v2-2/r1/R1-T3-settings-uploads-exports-tenant-scoping-2026-09-14.md`
  and a new top entry + updated `R1-T3` row in
  `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md`.

**When you pick this back up: read the workflow's actual result/journal before
assuming any of the above happened — this section describes intent at launch
time, not a confirmed outcome.** Verify with `git status` / `git diff` and the
test suite before trusting anything it claims.

---

## 2. Owner answers collected this session (2026-09-14) — authoritative, not yet transcribed into decision docs

Oliver answered a 7-item list this session. **None of these have been written
into `docs/decisions/*.md` or `CONTINUATION-2026-09-07.md` yet** — that's the
main remaining paperwork task. Recorded here verbatim-in-substance so nothing
is lost:

1. **R0-H1 (declare/inventory any incident):** "No, nothing happened." →
   Record as owner disposition: no incident occurred. Closes R0-H1.
2. **R0-H4 (access log review):** "No, nothing at all [found]." → Record as
   owner attestation that no suspicious access was found — same caveat
   pattern as R0-H3's existing owner-attested disposition (not independently
   re-verified by an agent, since no agent here has hosting/log access).
   Closes R0-H4 on that basis.
3. **R0-H5 (tracked uploads/local dumps):** "Just delete them if they have not
   been currently used." **Investigation was in progress at checkpoint time
   — see §3 below. Not yet executed.**
4. **Gap 11 vs gap 12 — see §4, this needs re-confirming with Oliver, not
   just transcribing.** His literal answer: "No we need to fix it properly,
   we need both paths with the payment boards and without via the payment
   links etc just like the other verticals." Given in response to a question
   I had mislabeled as gap 11; on rereading the source memos this answer
   actually resolves **gap 12** (the SSE/addressing bug), not gap 11 (the
   split-payment session-replay bug). I had started explaining this
   distinction to Oliver when the checkpoint interrupt happened — **he has
   not yet confirmed he agrees with this reframing.** Say this plainly when
   you resume, don't just proceed as if he's confirmed it.
5. **Gap 12's remaining blocker (`FEATURE_NEW_RETAIL_PAYMENTS` in
   production):** "It's in production, that needs to work properly, I think
   this is linked to Q5" [Q5 was this same question — read as Oliver
   recognizing items 4 and 5 are related, which they are, both being gap 12].
   Treat as owner attestation the flag is on; not independently verified
   (no agent here has production access) — same caveat as item 2.
6. **R1-H1 (visual baseline acceptance):** "Looks good." → **This is the
   owner acceptance R1-H1 was waiting on.** Write the decision doc, update
   the R1-H1 tracker row, and note explicitly: this lifts the "client work
   remains gated" blocker (tracker gap-list item 8) — the gap-12 terminal
   migration (§4 below) touches client files and was previously blocked on
   exactly this.
7. **R0-T6 (real backup rehearsal):** "Will do this later." → No action, no
   status change. Just don't chase this.

---

## 3. R0-H5 investigation — state at checkpoint

Could not locate the original source of the "41 tracked entries, now 38
ignored" figure quoted in
`docs/evidence/remediation-v2-2/r0/R0-exit-gate-assessment-2026-09-12.md:35`
and `docs/evidence/remediation-v2-2/r0/R0-T6-backup-handoff-2026-09-07.md:49`
(the latter turned out to be about backup-script test output, a red herring —
**do not conflate the two "38" numbers, they are unrelated**). Grepped for an
inventory script and found none.

What actually exists on disk/in git right now, under the only path this
turned up real content for (`uploads/`, which `.gitignore` covers going
forward but which had 3 pre-existing tracked files):

| File | Git-tracked? | Content (viewed) | Verdict |
|---|---|---|---|
| `uploads/invoices/invoice-1780568113073-f9271eb365f984b2.png` | yes | A generic dark rounded-square terminal/shell icon (`>_` glyph) — **not customer content** | Looks safe to delete |
| `uploads/invoices/invoice-1780814813425-46f344ab381d4b7e.png` | yes | The TaptPay wordmark/logo itself | Looks safe to delete |
| `uploads/invoices/*.png` (literal filename, asterisk included) | yes | 0 bytes — an accidental shell-glob artifact (an unquoted glob that didn't expand, committed literally) | Definitely garbage, safe to delete |

Both real images were clearly test/dev fixtures (a generic icon and the
company's own logo), not real tenant/customer invoice content, despite living
under a path (`uploads/invoices/`) and filename pattern
(`invoice-<timestamp>-<hex>`) that matches the real property-invoice-document
upload feature exactly. Reasoning for why this is very likely dev-only, not
production data: the serve route
(`GET /uploads/:folder/:name`, `server/routes.ts:6955`) explicitly treats disk
as **"a local-disk fallback for any legacy file that predates DB-backed
storage"** — current uploads write only to the `uploaded_files` DB table
(confirmed: `saveUploadedFile` never writes to disk). So these 2 files predate
that migration and are not something the live app can currently produce.
Combined with this being a dev workspace (production is a separate Neon
project per multiple existing decision records), these are almost certainly
local test artifacts, not real tenant financial documents.

**Not yet done:** the actual `git rm` + verification that nothing in the repo
references these exact paths (a quick grep, already partially done — no hits
found in code/tests/docs for either filename) + a short decision-doc closing
R0-H5. This is low-risk, quick work — do it first when resuming.

**Not committed in this checkpoint** — deliberately left as a clean todo
rather than rushed through under time pressure.

---

## 4. Gap 11 vs gap 12 — the distinction Oliver still needs to confirm

Two *different* bugs, on two *different* legacy payment paths, each with its
own decision memo:

- **Gap 11** — `docs/decisions/2026-09-13-gap11-split-session-single-use-design.md`.
  Bug: on the **split-bill checkout** flow (`/checkout/:id`, `/split/:id`,
  `finaliseHostedPayment` in `server/routes.ts`), a spent Windcave session can
  be replayed to credit additional splits for free — a real payment-
  correctness defect. The memo's own recommended fix ("Option C" in **its**
  lettering: converge onto the existing `payment_attempts` attempt engine) is
  explicitly staged (C0 preflight → C1 additive unique index → C2 compare-
  and-set → C3 the actual behavioral migration → C4 callback/notification
  reconciliation → C5 durable inbox), requires a schema ADR, a count-only
  production preflight, and rehearsal on a restored production-sized clone,
  and **depends on `verifyWindcaveOutcome`, which doesn't exist yet** (it's
  an R2-phase deliverable, and R2 itself is marked GATED/not started in the
  tracker). This is realistically multi-session engineering work, not a
  same-day fix, regardless of how "properly" the owner wants it done.
  **Oliver's "fix it properly, both paths" answer does not obviously map to
  this bug** — nothing about gap 11 is about "boards vs. no-board via
  payment links." **This needs to be re-put to Oliver, not assumed.**

- **Gap 12** — `docs/decisions/2026-09-13-gap12-anonymous-sse-addressing-options.md`
  (options) and `docs/decisions/2026-09-13-gap12-owner-input-and-linkmode-finding.md`
  (the finding that reframes it). Bug: the **no-board, in-person terminal**
  flow (`/pay/:merchantId`, an anonymous SSE stream + polling) has no
  authentication and, on concurrent stoneless sales, can route customer A into
  customer B's checkout at customer B's amount. The finding: **per-transaction
  addressing already exists and already ships** — `linkMode: "per_payment"`
  mints a one-sale token link (`/pay/t/<token>`), and the **desktop** retail
  terminal (`client/src/desktop/pages/retail-terminal.tsx:237-238`) already
  uses it correctly for board-less sales. Three **older** terminals never
  send `linkMode` and silently default to the vulnerable `"legacy"` mode:
  `client/src/pages/merchant-terminal.tsx:198`,
  `client/src/pages/merchant-terminal-mobile.tsx:237`,
  `client/src/pages/merchant-terminal-mobile-v2.tsx:221`. **This is exactly
  what Oliver's answer describes** — "both paths, with boards and without via
  payment links, just like the other verticals" — the other verticals
  (property/trades) already invoice via links; gap 12's fix makes retail's
  no-board path do the same.

  The memo's own recommended sequence (§7 of the options memo), now that
  Oliver has answered every blocking question (no printed QR/NFC in the
  field; no-board flow is real production traffic; `FEATURE_NEW_RETAIL_PAYMENTS`
  is on in production; and now, explicitly, yes to migrating the three
  terminals):
  1. **Land "Option C"** (its own, unrelated-to-gap-11's-Option-C lettering:
     confusingly both memos reuse letter names for different things — say so
     explicitly if you write anything comparing them) — the fail-closed-on-
     ambiguity + payload-narrowing fix to `getActiveTransactionByMerchant`
     (`server/storage.ts:4698`) and the SSE/`active-transaction` branches.
     Schema-free, no product decision, red-testable today. **Not started.**
  2. **Migrate the three terminals** to send `linkMode: "per_payment"` for
     board-less sales, mirroring the desktop terminal exactly, plus build the
     "show the customer this sale's QR/link" UI those three screens don't
     have today (the desktop terminal's own `onSuccess` handler at
     `retail-terminal.tsx:249-269` is the reference pattern — sets
     `paymentUrl`/`qrCodeUrl` into local state and switches to a "share"
     mode). **This was blocked on R1-H1 acceptance, which Oliver just gave
     (§2 item 6) — the blocker is now lifted.** Not started. Note:
     `merchant-terminal.tsx` is also on the R1-T8 hook-order-crash list —
     expect that interaction when editing it.
  3. Only after (2) ships and legacy no-board sales drain by attrition:
     retire/tombstone the standing `/pay/:merchantId` no-board address
     itself. **Do not attempt this in the same pass as (2)** — it needs a
     production traffic-drain window this environment can't observe.

**Next action on resume:** tell Oliver plainly that his answer maps to gap 12
(not gap 11), get his confirmation, then decide pacing for gap 11 separately
— possibly proposing to land gap 11's safe, independent pieces (C0's
read-only preflight counts, C1's additive unique index — both zero product
decision, zero behavior change, already independently required by plan §9.4)
now, while treating the actual behavioral fix (C3) as its own larger,
separately-scheduled piece of work. This was the clarifying question queued
when the checkpoint interrupt happened — it was never actually sent to Oliver
yet.

---

## 5. Straight punch list for resuming

1. Read the R1-T3 Settings/Uploads/Exports workflow's actual result (§1).
   Verify, don't trust blindly.
2. Confirm with Oliver: gap 11 ≠ gap 12, get explicit sign-off on the gap-12
   reading of his answer, ask how he wants gap 11 paced.
3. Write the 3 quick decision docs + tracker updates for R0-H1, R0-H4, R1-H1
   (§2, items 1/2/6 — these are just transcription, already decided).
4. Finish R0-H5 (§3): confirm no reference anywhere, `git rm` the 3 files,
   write the closing decision doc.
5. Implement gap 12's Option C (fail-closed ambiguity fix) — schema-free,
   ready now, no blockers.
6. Implement gap 12's terminal migration (3 files + new share-link UI) — now
   unblocked by R1-H1 acceptance. Bigger; probably wants its own
   plan→review→implement→verify workflow given it's customer-facing payment
   UI, mirroring this session's R1-T3 workflow pattern.
7. Come back to gap 11 only once its pacing question (step 2) is answered.
