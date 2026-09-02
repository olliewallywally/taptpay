# R0-T2 — fail-closed configuration evidence

Date: 2026-09-02 UTC

## Failing-first evidence

Before `server/config.ts` existed, the focused configuration run failed both
suites:

- the configuration contract could not resolve `../config`;
- the environment-read source guard reported 75 file/key violations across
  authentication, database, routes, providers, push, messaging, seeding,
  storage, URL generation and application startup.

No environment value was printed or copied into this evidence.

## Implemented contract

- `server/config.ts` is the single immutable, typed application configuration
  snapshot. It is imported before routes, payment providers, seed logic and cron
  handlers.
- `ENV_VALIDATION_MODE`, `APP_ENV`, `DATABASE_TARGET` and `PAYMENT_MODE` are
  explicit enums. The Jest bootstrap is the only bounded implicit test seam.
- All capability flags use the canonical names in P2.2, default false, and use a
  strict boolean grammar. The retired per-payment-link alias is not parsed.
- Missing credentials never select a payment mode. UAT and production require
  the exact approved endpoint, complete credentials and provider reconciliation;
  production additionally requires enforce mode and the live-Windcave flag.
- Simulation/UAT/production environment combinations follow the P2.2 matrix.
  `FEATURE_CRYPTO=true` fails in every environment.
- Payment-return signing cannot fall back to the JWT secret. Enabled initiation
  requires an independent value; scheduled capabilities require a strong cron
  secret.
- Credential groups fail when partially configured. Canonical origins reject
  non-HTTPS URLs, paths, queries, fragments, credentials and wildcards.
- Audit diagnostics contain key and feature-group names only. Security-critical
  invariants remain fatal in audit mode.
- Application modules consume the typed object rather than `process.env`.

## Environment-read inventory result

The guard now permits only:

- `server/config.ts`: the sole application configuration snapshot;
- `server/migrate.ts` / `DATABASE_URL`: standalone migration bootstrap must
  select its target before application startup;
- `server/migrate.ts` / `JEST_WORKER_ID`: prevents the migration CLI entry point
  from executing inside Jest.

There are zero route, provider, worker, seed, cron, auth, storage, messaging or
application-startup reads outside that boundary. The source-guard test runs as
part of the normal server suite and fails if one is added.

## Verification

- Configuration + source-guard focused run: 2 suites, 47 tests passed.
- Non-containment server run: 25 suites, 374 tests passed.
- Client run: 52 suites, 486 tests passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- The nine R0-T1 containment tests still fail exactly 9/9, as expected until
  R0-T4 through R0-T7 remove the proven capabilities.

No server was started, no provider was called, no migration was applied, and no
deployment or environment value was changed. Before a future server start, the
operator must provide the newly explicit non-secret environment selectors and
must follow the H2/T7 ordering for every secret.
