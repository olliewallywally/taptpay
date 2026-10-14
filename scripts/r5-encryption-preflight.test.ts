import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { preflightConnectionSettings } from "./r5-encryption-preflight";

test("connection settings use only the explicitly named preflight URI and user", () => {
  assert.throws(() => preflightConnectionSettings({ DATABASE_URL: "postgresql://user@127.0.0.1/db" }), /FINGERPRINT_INVALID_CONNECTION/);
  assert.throws(() => preflightConnectionSettings({ R5_PREFLIGHT_DATABASE_URL: "postgresql://127.0.0.1/db" }), /R5_PREFLIGHT_EXPLICIT_USER_REQUIRED/);
  const settings = preflightConnectionSettings({ R5_PREFLIGHT_DATABASE_URL: "postgresql://user@127.0.0.1:55440/test" });
  assert.equal(settings.host, "127.0.0.1");
  assert.equal(settings.port, 55440);
  assert.equal(settings.database, "test");
  assert.equal(settings.user, "user");
  assert.equal(settings.password(), "");
  const client = new pg.Client(settings);
  assert.equal(typeof client.password, "function"); // No PGPASSWORD/.pgpass fallback in pg itself.
});

test("remote hosts require verified TLS and cannot redirect through URI parameters", () => {
  for (const suffix of ["", "?sslmode=disable", "?sslmode=require"]) {
    assert.throws(() => preflightConnectionSettings({ R5_PREFLIGHT_DATABASE_URL: `postgresql://user@synthetic.invalid/db${suffix}` }), /R5_PREFLIGHT_VERIFIED_TLS_REQUIRED/);
  }
  assert.equal(preflightConnectionSettings({ R5_PREFLIGHT_DATABASE_URL: "postgresql://user@synthetic.invalid/db?sslmode=verify-full" }).ssl.rejectUnauthorized, true);
  assert.throws(() => preflightConnectionSettings({ R5_PREFLIGHT_DATABASE_URL: "postgresql://user@127.0.0.1/db?host=elsewhere" }), /FINGERPRINT_INVALID_CONNECTION/);
});

test("the real CLI rejects a missing keyring with fixed stderr and no bank/key/connection data", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/r5-encryption-preflight.ts",
    "--expected-host=127.0.0.1", "--expected-port=55440", "--expected-database=test"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10000,
    env: { ...process.env, DATA_ENCRYPTION_STAGE: "read-compatible", DATA_ENCRYPTION_ACTIVE_KEY_ID: "current",
      DATA_ENCRYPTION_KEYRING: "", R5_PREFLIGHT_DATABASE_URL: "postgresql://user:synthetic-private-password@127.0.0.1/test" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "R5_PREFLIGHT_FAILED\n");
});

test("a wrong host is rejected before a connect attempt or any output of the URI", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/r5-encryption-preflight.ts",
    "--expected-host=other.invalid", "--expected-port=1", "--expected-database=test"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10000,
    env: { ...process.env, DATA_ENCRYPTION_STAGE: "read-compatible", DATA_ENCRYPTION_ACTIVE_KEY_ID: "test",
      DATA_ENCRYPTION_KEYRING: JSON.stringify([{ id: "test", key: Buffer.alloc(32, 9).toString("base64url") }]),
      R5_PREFLIGHT_DATABASE_URL: "postgresql://user:synthetic-private-password@127.0.0.1:1/test" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "R5_PREFLIGHT_FAILED\n");
});
