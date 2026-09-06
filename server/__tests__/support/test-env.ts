/**
 * R1-T1 no-live-system HTTP harness — deterministic environment.
 *
 * server/config.ts freezes `config` from `process.env` the first time it is
 * imported (config.ts:588), and server/db.ts decides Postgres vs. in-memory
 * storage from `config.databaseUrl` at that same import. Import this module
 * — for its side effect only — before importing anything from
 * "../../routes", "../../storage", "../../config" or "../../auth" in a test
 * file, or the ambient dev environment (which does have DATABASE_URL set)
 * leaks into the "no live database" test run.
 *
 * Jest gives each test FILE its own module registry, so this only has to run
 * once per file, at the top, before those other imports.
 */

// Force MemStorage regardless of what the ambient shell/dev environment has
// set — this is the one thing that must never leak from a real dev database.
delete process.env.DATABASE_URL;
delete process.env.NEON_DATABASE_URL;
delete process.env.DATABASE_TARGET;

// Force explicit, deterministic values rather than relying on config.ts's
// JEST_WORKER_ID fallbacks, so this harness behaves the same under `jest`
// directly and under any future runner.
process.env.APP_ENV = "test";
process.env.ENV_VALIDATION_MODE = "audit";
process.env.PAYMENT_MODE = "disabled";

process.env.JWT_SECRET = "http-harness-jwt-secret-not-a-real-credential-000";
process.env.PAYMENT_RETURN_STATE_SECRET = "http-harness-return-state-secret-not-real-000";
process.env.CRON_SECRET = "http-harness-cron-secret-not-a-real-credential-000";
process.env.PUBLIC_ORIGIN = "https://harness.test";
process.env.ADMIN_EMAIL = "admin@harness.test";
process.env.ADMIN_PASSWORD_HASH = "$2b$12$harnessPlaceholderAdminPasswordHash00000000000";
