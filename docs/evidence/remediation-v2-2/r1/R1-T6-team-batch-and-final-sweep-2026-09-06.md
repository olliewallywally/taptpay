# R1-T6 — `/api/team/:userId/*` identifiers; final identifier-family sweep — 2026-09-06

Branch: `remediation/r1-foundation`. Scope for this slice: every remaining
`parseInt(req.params.userId, 10)` site under `/api/team/*`, then a fresh
`grep -n 'parseInt(req\.\(params\|query\)'` across the whole of
`server/routes.ts` to confirm this closes the identifier-parsing family — the
task named this explicitly as "the final identifier-family sweep."

## Regenerated count on this SHA (evidence, not a timeless constant)

Fresh `grep -n 'parseInt(req\.params'`/`'parseInt(req\.query'` against
`server/routes.ts` at the start of this batch: 9 sites (matches exactly what
`R1-T6-admin-batch-2026-09-06.md`'s "Still open" section left off at — 4
params + 5 query, confirmed by fresh grep, not assumed). Of the 4 remaining
path-param sites, all 4 sit under `/api/team/:userId/*`:

- `POST /api/team/:userId/resend`
- `DELETE /api/team/:userId/invite`
- `PUT /api/team/:userId/status`
- `DELETE /api/team/:userId`

`users.id` is `serial` in `shared/schema.ts` (re-confirmed, not assumed), so
every site here takes `strictPositiveIntegerParam`, not `strictUuidParam` —
this batch needed no UUID sites and added none.

After this batch: **5 sites remain, all query-tuning, all documented
exceptions from two prior batches** (see "Final sweep" below) — 0 unmigrated
path-param identifier sites remain anywhere in `server/routes.ts`.

## Migrated — 4 sites across 4 route registrations

All four matched the exact line `const userId = parseInt(req.params.userId, 10);`
(read at its real current location before editing, not assumed from any
prior batch's line numbers) — no import changes needed, since
`strictPositiveIntegerParam` was already imported into `routes.ts` by the
batch-1 merchant migration. Standard two-line replacement:

```ts
const userId = strictPositiveIntegerParam(req.params.userId);
if (userId === null) return res.status(400).json({ message: "Invalid userId" });
```

Message text is `"Invalid userId"` for all four — the path param is named
`userId` (not `id`), so per the established convention (message noun matches
the actual param name when it isn't literally `id` — see the admin batch's
`keyId` → `"Invalid keyId"`) this is not `"Invalid id"`.

### The one nontrivial judgment call: all four handlers needed a reorder, not an in-place replace

Every one of the four handlers had the shape:

```ts
try {
  const merchantId = req.user?.merchantId;
  if (!merchantId) return res.status(400).json({ message: "Merchant ID required" });
  if (!isAccountOwner(req.user)) {
    return res.status(403).json({ message: "Only the account owner can ..." });
  }

  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) return res.status(400).json({ message: "..." });
  ...
```

i.e. the `isAccountOwner` role check ran **before** the old `parseInt` line in
the source, not after it — unlike every site migrated in the five prior T6
batches, where the parse was already the first statement (or, at worst, one
line ahead of a body destructure). This plan's own §8.4 states the required
handler order explicitly: "1. authenticate; 2. strict parameter parse; 3.
capability/payment-mode check; 4. role and tenant authorization; ..." — and
the task's own instruction is equally explicit: "Parameter parsing must
happen before any role/tenant/ownership check, so a malformed id returns 400
before a 403/404 — insert the parse+400 guard as the first thing in the
handler if it is not already first; do not reorder any other existing
checks." `isAccountOwner` is exactly the "role" check that rule names, so the
new guard was moved to be the literal first statement in the `try` block, in
all four handlers, ahead of both the `merchantId` presence check and the
`isAccountOwner` check. The relative order of the pre-existing checks to each
other is untouched — `merchantId` presence still runs before
`isAccountOwner`, both still run before the (now mostly-dead, see below)
`Number.isInteger` line, and every check after that is unchanged — only the
new guard's position moved, from "after the role check" to "before
everything."

This is a real, deliberate behavior change, not a cosmetic one: **before this
batch, a non-owner team member sending a garbage `userId` to any of these
four routes got a 403** (the role check ran first and rejected them
regardless of the path param), **after this batch they get a 400** (parsing
runs first and rejects the malformed input before role is even considered).
This is the intended effect of the ordering rule, not a side effect to
paper over — a malformed request is malformed for every caller, before the
system asks who they are. It is proven explicitly in the test suite (see
"Verification" — one `userId=abc` case per route asserts 400 for a
non-owner member, not 403) rather than left as an implicit consequence of the
diff.

### `Number.isInteger(userId)` was a materially weaker check than it looked

All four pre-existing checks used `if (!Number.isInteger(userId))`, not the
`isNaN(...)` half-guard the admin and transactions/refunds batches found
elsewhere in this file. This is a meaningfully weaker gate than `isNaN`:
`parseInt` already returns an integer for almost every non-garbage input
before `Number.isInteger` ever sees it, so `Number.isInteger(parseInt(x, 10))`
is true for far more of this family's target rejection classes than `isNaN`
catches. Confirmed by hand for every class this family exists to reject:

| Input | `parseInt(x, 10)` | `Number.isInteger(...)` | Old check's verdict |
|---|---|---|---|
| `"abc"` | `NaN` | `false` | correctly rejected |
| `"1abc"` | `1` | `true` | **silently accepted** |
| `"1.5"` | `1` | `true` | **silently accepted** |
| `"+1"` | `1` | `true` | **silently accepted** |
| `"1e3"` | `1` | `true` | **silently accepted** |
| `"-1"` | `-1` | `true` | **silently accepted** |
| `"0"` | `0` | `true` | **silently accepted** |
| `" 1"` (leading space) | `1` | `true` | **silently accepted** |

So the pre-existing guard on these four routes only ever caught a value with
no usable leading digits at all (`"abc"`, empty, `undefined`) — every other
rejection class this task family exists to close (suffix garbage, decimals,
exponent notation, leading `+`, negatives, zero, whitespace) passed straight
through to `storage.getUserById`/`storage.setTeamMemberStatus`/etc. as a
`NaN`-free but wrong number. This did not previously enable a cross-tenant
read (every storage method here internally checks
`member.merchantId !== merchantId` before acting, so a wrong-but-parseable id
still 404s), but it meant the "malformed input" and "well-formed input for a
different row" cases were indistinguishable to the caller, and a negative id
or `0` reached real storage lookups it should never have reached in the
first place. This is the same class of gap batch 1 and every later batch
closed elsewhere in the file; this batch closes it here too.

The four old `Number.isInteger` lines are left in place below the new guard
— now genuinely unreachable dead code for the `userId` half of each check
(a value `strictPositiveIntegerParam` returns can never fail
`Number.isInteger`), following the exact precedent the admin and
transactions/refunds batches already established (`GET
/api/merchants/:id/email-status`, `GET /api/split-payments/:id`, etc.):
insert the new guard immediately above, leave the old one exactly as it was.
One of the four (`PUT .../status`) combines the dead `userId` half with a
still-very-much-alive `status` field check
(`status !== "active" && status !== "disabled"`) in the same `if` — that
combination is untouched; only the reachability of the `userId` half of it
changed, not its text or its partner condition.

## Verification

- New runtime test file: `server/__tests__/http-params-team-batch.test.ts`
  (46 tests, through the real app via the R1-T1 harness):
  - all four routes 400 on the standard garbage set (`abc`, `1abc`, `1.5`,
    `-1`, `0`, `+1`, `1e3`) for the account owner;
  - all four routes also 400 (not 403) on `userId=abc` for a non-owner
    member — the direct proof of the reordering behavior change described
    above;
  - all four routes still 403 with the route's own message for a
    well-formed `userId` and a non-owner member — proving the role gate
    itself is unaffected by the reorder, only its position relative to
    parsing moved;
  - `resend`/`invite`/`DELETE :userId` each prove a well-formed-but-unknown
    id reaches the real 404, not the parser's 400;
  - `invite` and `DELETE :userId` each additionally prove a well-formed id
    belonging to a *different* merchant also 404s (tenant scoping, done
    entirely inside `storage.revokeTeamInvite`/`getUserById`+the handler's
    own `member.merchantId !== merchantId` check, is a distinct stage from
    parsing);
  - `status` additionally proves a well-formed id with an invalid `status`
    body value gets the route's own `"Invalid request"` 400 (the
    still-alive half of the combined check), not the id guard's
    `"Invalid userId"` — proving the two 400s are distinguishable and the
    guard didn't swallow the body-validation error;
  - all four routes prove a real, successful call against a real fixture
    (an invited-but-not-yet-accepted member for resend/revoke, a real
    active member for status/delete), confirming the new guard does not
    block a legitimate id.
  - Fixture note: resend/revoke-invite need a team member still in
    `status: "invited"`. `createMemberPrincipal` (the harness's existing
    fixture) activates the invite before returning, so this file adds a
    small local `inviteFixtureMember` helper that stops one step earlier —
    it mirrors `createMemberPrincipal`'s own seat-granting steps
    (`getOrCreateSubscription` then `changeSubscriptionPlan(merchantId,
    "team")`) exactly, then calls `storage.inviteTeamMember` directly and
    returns before `activateInvitedUser`, since resend/revoke only ever
    match a still-pending row.
- `npm run check`: pass (no type errors — narrowing `userId` from
  `number | null` to `number` after the new guard's early return was enough
  for every downstream `Number.isInteger(userId)`/template-literal use in
  these four handlers to type-check with no further changes needed, unlike
  the `stoneId` case in the NFC/tapt-stone batch).
- `npx jest --selectProjects server --runInBand`: **40 suites / 747 tests
  pass** (was 39/701 before this batch — the new file's 46 tests account for
  the entire delta; no existing test changed).
- `npx jest --selectProjects client`: 52 suites / 486 tests pass (unchanged —
  this batch is server-only).
- `npm run build`: pass.
- `server/__tests__/route-policy-inventory.test.ts` (R1-T2's completeness
  gate): re-ran as part of the full server suite above — still passes. This
  batch only rewrote handler bodies (moved existing lines, added new ones),
  registering no new routes and removing none, and did not change which
  marker strings (`authenticateToken`, `isAccountOwner`) appear in each
  handler's source — only their relative position within the body, which
  none of the marker-presence tests in `route-policy-role-defaults.test.ts`
  or `subscription-route-security.test.ts` check order-sensitively for these
  four routes (confirmed by reading both files, not assumed) — so
  `route-policy.ts` needed no regeneration.

## Final sweep — what remains after this batch

Fresh `grep -n 'parseInt(req\.\(params\|query\)' server/routes.ts` at the end
of this batch returns exactly 5 lines, all `req.query`, none `req.params`:

```
1065:      const size = Math.min(parseInt(req.query.size as string) || 400, 1000);   // GET /api/merchants/:id/qr
1112:      const size = Math.min(parseInt(req.query.size as string) || 400, 1000);   // GET /api/merchants/:id/stone/:stoneId/qr
1236:      const size = Math.min(Math.max(parseInt(req.query.size as string) || 300, 100), 800); // GET /api/pay/t/:token/qr
3119:      const size = Math.min(parseInt(req.query.size as string) || 300, 800);    // GET /api/transactions/:id/receipt-qr
3174:      const days = Math.min(parseInt(req.query.days as string) || 30, 365);     // GET /api/merchants/:id/revenue-over-time
```

Every one of these five is a previously-reviewed, previously-documented
judgment-call exception, re-verified against the current file (not merely
trusted from an older doc) by reading each route's surrounding code above:

- The three `.../qr` and `.../receipt-qr` `size` sites were reviewed and
  left unchanged in `R1-T6-nfc-tapt-stone-and-days-clamp-2026-09-06.md`
  (the two `/api/merchants/...` routes) and
  `R1-T6-transactions-refunds-batch-2026-09-06.md` (`receipt-qr`) — each
  empirically proven, against the real installed `qrcode@1.5.4` package, to
  degrade to a small valid PNG for every non-positive or invalid width
  rather than crash or amplify resource use.
- The `revenue-over-time` `days` site was reviewed and **fixed** (not left
  as bare `parseInt`) in the same NFC/tapt-stone-batch doc — it kept the
  literal substring `parseInt` as the inner call inside a new
  `Math.min(parseInt(...) || 30, 365)` clamp, by that doc's own explicit
  design (free-form tuning parameter, not an identity lookup), so it
  correctly still matches this grep pattern without being an open gap.

**Zero sites in this final sweep are undocumented.** Every hit traces to an
evidence doc already under `docs/evidence/remediation-v2-2/r1/` with its own
reasoning recorded, and this batch's own fresh read of each route confirms
the code at those five lines has not drifted from what those docs described.
No additional migration was needed beyond the four `/api/team` sites named in
this batch's scope.

This closes the `parseInt(req.params.*)`/`parseInt(req.query.*)` **identifier
parsing** effort as scoped by this plan section (§8.4): every path/query
parameter that identifies a row is now strictly parsed; every remaining
`parseInt` call is a deliberately-bounded free-form tuning value, not an
identifier. The plan's own §8.4 also calls for "a source guard that forbids
new `parseInt(req.params` usage" as part of this same section. **This batch
does not add that guard.** Every prior T6 batch deferred it for the same
stated reason — "a completion gate for when T6 is fully migrated, not
something to land red mid-migration" — and this is arguably the point where
that condition is finally met for the *identifier* sub-family. But: (a) this
batch's stated scope was the four `/api/team` sites plus the confirmation
sweep, not "close out T6"; (b) a source guard would need to encode the five
remaining `req.query` sites as an explicit, permanent allowlist (not just an
absence check), which is a small design decision of its own (regex shape,
where the allowlist lives, whether it also has to account for any future
`req.query` tuning parameter) that this batch was not asked to make; and (c)
T6's plan-level scope is broader than identifier parsing alone (query-tuning
bounds, which are now also fully reviewed, but T6 as a named task in the plan
isn't itself declared complete by this doc). Recorded here as a judgment
call, not a silent omission: **adding the source guard now looks like a
reasonable next step and is very likely unblocked**, but making that call
unilaterally would be scope creep beyond what this batch was asked to do —
flagging it explicitly instead of either adding it uninvited or leaving it
unmentioned.

T4/T5/T8/T10 remain blocked on R1-H1 owner acceptance, unaffected by this
batch. T7's remaining scope (tenant-scoped storage methods for transactions,
refunds, boards, stock, property, trades, settings, exports; upload
hardening beyond storage-abstraction; the full two-merchant cross-tenant
runtime sweep) is independent of this batch and still open.
