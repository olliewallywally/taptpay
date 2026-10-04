# R1-T7 trades continuation — 2026-10-04

Read CLAUDE.md and the newest entry at the top of the execution ledger first.
Branch: `remediation/r1-continuation-20260907`. No surviving workflow is needed.
Re-derive Git status/diff after any reset. Nothing here is pushed or deployed.

## How this session started

Codex had stopped inside S4a: ten changed files and three new ones in the tree, no
commit, no recorded check, and its `/tmp` logs and disposable PostgreSQL gone. The
owner's direction was "pick up where they left off". The draft was treated as
unverified: its new tests were replayed on the last commit (they failed), then every
check was repeated before anything was committed.

## Completed checkpoints (all local)

| Batch | Code | Docs | What moved to merchant-required storage |
|---|---|---|---|
| S4a | `22c6dc9c` | `c0fb5bc3` | Client profiles: create, read, edit, archive (with its recurring-invoice cancellation and history in one transaction), restore, promote, history |
| S4b1 | `394da7d6` | `51e0b186` | Quote and invoice reads and lists, the signed-in quote PDF, void, paid outside TaptPay (and its receipt), job complete |
| S4b2 | `9b124dea` | `22628b95` | Quote, invoice and balance creation (with the hidden prospect and creation history), and their sending |
| S4c | `df54069e` | this commit | Recurring invoices: list, create, pause/resume/edit, cancel |

Evidence, one file per batch: `docs/evidence/remediation-v2-2/r1/R1-T7-S4{a,b1,b2,c}-*.md`.
Preflights and separate rereads: `docs/PLAN-2026-10-03-r1-t7-s4-trades.md`.

Every signed-in trades registration (25) now names the signed-in business to storage,
and a test pins that none of them calls a globally keyed trades method. The global
methods that remain serve the public quote link, checkout, provider completion, the
WhatsApp status callback and the cron only.

Each batch: tests red first on the committed base; focused and affected suites; a
new empty disposable PostgreSQL through the existing migration runner; a mutation
check on a scratch copy; regenerated route and storage inventories; typecheck and
build; a full server run on the code commit (S4a 3,795; S4b1 3,847; S4b2 3,942 tests,
all passing). **S4c's full server run was started on `df54069e` but not read: the session
hit its usage limit. Read `.local/claude-scratch/session-2026-10-03/full-server-s4c.log`
or rerun it first.** Counts are in each evidence file.
No application database, provider, live migration, client UI, flag, push or deploy.
Independent review of S4 (and of S1–S3) remains owed.

## What changed that a reviewer should look at first

- Lock order everywhere in trades: the client row first, then its invoice, deposit or
  recurring invoice, then (share locks) a linked quote and an attached document. The
  provider, public and cron lanes issue single statements and take none of these.
- A transaction that returns a refusal still commits what it wrote: every create does
  its checks before making the hidden prospect.
- After an attempted send, an uncertain outcome or a refused record is a fixed 503
  with no row (`TRADES_QUOTE_…` / `TRADES_INVOICE_DELIVERY_RECONCILIATION_REQUIRED`).
  It replaces a 500; it is not a new product state the screens know about.
- Two signed-in balance sends at the same moment now make one balance. An archive
  beside a recurring-invoice create can no longer leave it live.
- Recorded and unchanged (R3/R4): a provider payment landing beside a manual void or
  external payment; a customer's quote acceptance landing beside a balance send; the
  cron's globally keyed advance landing beside a signed-in pause or resume.

## Reusable verification scratch

`.local/claude-scratch/session-2026-10-03/` (git-ignored, survives a restart):
`pgverify.sh <database> <verifier.ts> <port>` starts one throwaway PostgreSQL, runs a
verifier and deletes it; `mutate_lib.py` with `mutate-s4*.py` runs planted defects
against a unit test and a verifier on a scratch copy. The base-replay recipe is in
the S4a evidence.

## S5 starting facts (measured on `9b124dea`, before S4c)

A query over the current route facts, reviews and storage contract lists every
signed-in (merchant-branch) registration that still calls a storage method with no
required `merchantId` parameter: **44**, of which three are the S4c schedule writes.
The other 41, by kind, are the S5 audit's input. This is structural evidence only;
a `merchantId` parameter proves nothing about a predicate, and its absence is not a
defect by itself.

- **The business's own row by its id** (`getMerchant`, `updateMerchant`,
  `updateMerchantDetails`, `updateMerchantTheme`, `updateMerchantLogoUrl`): the
  parameter is the tenant itself, named `id`. 26 registrations across
  `/api/merchants/:id/*` (onboarding, profile, details, theme, daily goal, the plain
  update, logo, export PDF, board create), `/api/auth/me`, `/api/tutorial/*`,
  `/api/billing/card*`, `/api/team/invite` and `resend`, the property and trades
  reminder and GST settings, the trades quote create and PDF, and the board builder.
  S5 must check what each passes as the id (the session's or a checked path's), and
  that each update projects its fields.
- **A board read by a global id, then compared with the path's business**
  (`getTaptStone`): `GET /api/merchants/:id/active-transaction`,
  `GET /api/merchants/:id/events` and `POST /api/board-builder/submit`. The first two
  are mixed registrations that also serve the public board page, which S1 left on the
  global read deliberately; the query counts a registration, not a branch. S5 must
  classify per branch before changing any of them.
- **A create that takes its business inside the data** (`createStockItem`):
  `POST /api/merchants/:merchantId/stock-items`.
- **A login read by a global id, then compared** (`getUserById`): two team routes
  (resend, remove) and the password change.
- **History written from the route by a global insert** (`logTransactionEvent`):
  property tenant create, archive and restore.
- **A global transaction read beside the scoped one** (`getTransaction`):
  `POST /api/transactions/:id/cancel`.
- **Per-login push registration** (`createPushSubscription`,
  `deactivatePushSubscriptionByEndpoint`): four routes, keyed by the login and the
  endpoint by owner decision.
- **Account scope** (`advanceUserSessionVersion`, the throttle slots,
  `updateUserPassword`): sign-out-everywhere and the password change.
- **Validated admin scope** (`getUploadedFile`, `recordInvoiceDocumentAdminRead`):
  the admin branch of the invoice-document read.

The command that produced this is in the S4c evidence. Rerun it on the S4c commit
before the S5 preflight; do not start S5 from these counts.

## Still open in R1 (none of this is closed by S4)

- **S5** settings/exports and the stragglers above; **S6** private upload lifecycle
  (ClamAV scan before a document is shown, quarantine, 12-month deletion of
  unattached uploads: owner decisions of 2026-09-29, not to be asked again).
- **R1-T5** Sign in with Apple, built and tested with stand-ins; going live needs the
  owner's Apple setup and a real iPhone.
- **R1-T10** typed route constants and the device, tutorial and accessibility matrix.
- Independent review of every R1 batch; R3 gap-11 C2–C5 at its schema gate; Keychain
  is A-T4; development migrations 0030/0031 stay with the owner. Production closed.

Stage explicit paths only; exclude `.claude-home/**` and `.claude/settings.local.json`.
An implementer's separate reread is not the outstanding independent security review.
