# R0-T4 — retired clearing and demo-seed containment

Date: 2026-09-02 UTC

## Transaction clearing

- `POST /api/merchants/:id/clear-transactions` remains only as a compatibility
  tombstone.
- Authentication runs first. The handler then strictly accepts only a safe,
  positive base-10 integer, checks account ownership, rejects admins/members and
  cross-tenant callers, and returns `410 TRANSACTION_CLEARING_RETIRED` to the
  owner of the matching merchant.
- The handler has no storage, transaction, provider, SSE, push or outbox call.
- `clearTransactions` was removed from `IStorage`, `MemStorage` and
  `DatabaseStorage`. A repository call-site search finds only the tombstone and
  its tests; there is no callable deletion implementation.

## Demo-data safety

- Normal startup calls `seedDatabase` only when the strictly parsed
  `SEED_DEMO_DATA` flag is true.
- Configuration rejects that flag in staging and production.
- `seedDatabase` independently re-checks both the flag and the development/test
  environment before it obtains a database handle. A requested seed with no
  database now fails instead of being logged and swallowed.
- The existing first-merchant guard remains in place.
- The known `demo@tapt.co.nz` account is rejected before storage access in
  staging and production, even if a historical row remains.
- Direct execution of `server/seed.ts` no longer auto-runs a seed as an import
  side effect; the guarded application path is the explicit mechanism.

## Development database compatibility

Staging and production still require `DATABASE_URL`. Development and test may
construct the database layer with no URL and receive a null database client, so
the existing MemStorage boot path remains available. A focused module test
proves construction does not attempt to open a connection.

## Verification

- R0-T4 + database bootstrap focused run: 2 suites, 12 tests passed.
- Non-containment server run: 27 suites, 388 tests passed.
- `npm run check`: passed.
- `npm run build`: passed.
- The original containment suite now has 3 newly passing checks and 6 expected
  failures remaining for R0-T5 through R0-T7.

No server was started, no database or provider was called, no migration was
applied, and no deployment or environment value was changed.
