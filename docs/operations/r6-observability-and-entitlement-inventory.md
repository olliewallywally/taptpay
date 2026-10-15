# R6 logging and read-only entitlement inventory

This is the first R6 repository slice. Durable cron coordination, health/readiness,
graceful shutdown, D9 policy changes and actual UAT remain separate work. No live
target report or scheduler configuration is implied.

## Correlating a request or job

Every request receives `X-Request-Id`. Only a UUID-shaped inbound value is accepted
and canonicalized to lowercase; otherwise the server generates a new UUID. This
identifier is diagnostic and never authorizes anything. It is established before
parsing, so malformed JSON and authorization refusals also receive it.

API completion logs are one-line JSON with `event`, `level`, UTC `timestamp`,
`requestId`, method, trusted route template, status and duration. Unmatched routes
use `[unmatched]`; raw URLs, query values, headers and bodies are excluded. Context
survives asynchronous work. Each cron pass, reconciliation/outbox operation and
subscription recovery batch gets a separate job UUID. Nested work retains its
parent request ID.

Structured fields pass through one bounded redactor and a strict metadata
allowlist. Arbitrary provider/error prose is suppressed; known database/network
error codes can remain. Existing direct console call sites were migrated with
their arguments behind a redacted payload. Those events retain their static
category but intentionally lose the old prose. Use typed counts/status fields and
reviewed fixed enums when adding diagnostics; do not put data into event names.
The current cron completion event has duration, success and failed-pass count;
pass failures identify the fixed job name and job ID.

Approved numeric internal IDs and the existing masked-email policy remain.
Other allowed correlation identities use `h_` plus the first 24 hexadecimal SHA256
characters (96 bits). Raw auth session IDs are redacted and have this diagnostic
join instead. Correlations are not bearer-token hashes or credentials and must
never be used for access. No raw session/card/provider identities, payment bearer
tokens/hashes, bank fields, OAuth codes, Authorization, cookies or key material
belong in a log. Bounded traversal does not execute getters or `toJSON` methods.

The private audit queue remains asynchronous, size bounded and mode0600, with a
finite shutdown drain. Its records and fixed sink-failure diagnostics use the
same serializer. Retention, access controls and any external log export still
need the release operator's existing policies; this slice configures no export.

## Running the inventory

Use a dedicated securely supplied `R6_ENTITLEMENT_DATABASE_URL` and an account
with read-only access. The URI must explicitly supply a user and match all three
expected arguments. Ambient application `DATABASE_URL`, PG password variables and
`.pgpass` do not supply this tool's target or credentials. Remote transport requires
verified TLS. Do not place URI/password values in chat, evidence or shell history.

```sh
node --import tsx scripts/r6-entitlement-inventory.ts \
  --expected-host=APPROVED_HOST \
  --expected-port=5432 \
  --expected-database=APPROVED_DATABASE \
  --batch-size=25
```

The CLI offers no execute/mutation option. It verifies the named target before
connecting and the actual database identity before projecting data. All counts
come from one repeatable-read, read-only snapshot with keyset pages of at most100,
statement/lock limits and a final rollback. A failure emits only
`R6_ENTITLEMENT_INVENTORY_FAILED` on stderr and exits1; it never emits a partial
report or raw database error.

The JSON contains only counts and the database snapshot timestamp:

- `merchantCoverage` includes all merchants and those with no subscription.
  `currentGate` counts all merchants, including missing subscriptions as blocked,
  using the unchanged shared access helper. Aggregate totals must reconcile.
- `subscriptions`, `states` and period/payment-date claim counts describe stored
  subscription rows. Malformed billing dates are flagged; the current-policy
  result faithfully reproduces the existing helper even for such claims.
- `missingProviderToken` reports SQL presence only. Presence is not authentication,
  usability, expiry validation or proof of a valid renewal card. Token values are
  never selected or decrypted. Due/overdue counts exclude requested cancellation
  and non-active/non-past-due states; they do not initiate billing.
- Provenance remains `unclassified`; `activeWithoutBillingDate` is a review count,
  not proof of a migration grant. `proposedGate.blocked` stays null with
  `assessment: pending_D9`. An after-policy comparison is not yet available.

The local PostgreSQL verifier creates a new named clone of the explicitly guarded
owned R5 scratch database. It seeds six synthetic merchants/five subscriptions,
proves page-level read-only enforcement with a rejected write, checks actual CLI
service targeting and confirms original source policies/data remain unchanged.
This is synthetic evidence, not permission or evidence for a real-target run.
