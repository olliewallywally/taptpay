/** R8: create, verify and destroy only this invocation's loopback CI databases. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {assertCIDatabase, assertNode22, runOwnedCommand} from './verify-ci-safety.mjs';
import {collectSchema, fingerprintDocument} from './schema-fingerprint.mjs';
import {emptyCIUploadInventory} from './ci-upload-inventory';

assertNode22();
const marker = process.env.TAPTPAY_TEST_DATABASE;
const applicationUrls = [process.env.DATABASE_URL, process.env.NEON_DATABASE_URL].filter(Boolean);
// No fallback to DATABASE_URL, PG* or a remote operator target.
const raw = process.env.R8_CI_ADMIN_URL;
if (!raw) throw Error('CI_ADMIN_REQUIRED');
const adminUrl = new URL(raw);
if (adminUrl.pathname !== '/postgres') throw Error('CI_ADMIN_REFUSED');
const probe = new URL(adminUrl);
probe.pathname = '/r8_ci_' + randomBytes(8).toString('hex');
assertCIDatabase(probe.href, {marker, applicationUrls});
const settings = {
  host: adminUrl.hostname, port: Number(adminUrl.port), database: 'postgres',
  user: decodeURIComponent(adminUrl.username), password: decodeURIComponent(adminUrl.password),
  ssl: false, connectionTimeoutMillis: 5000, query_timeout: 30000,
};
const admin = new pg.Client(settings);
const privateDir = await mkdtemp(path.join(tmpdir(), 'taptpay-r8-pg-'));
// Child verifiers clear credentials themselves as well; never forward application secrets.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
Object.assign(env, {TAPTPAY_TEST_DATABASE: '1', NODE_ENV: 'test', APP_ENV: 'test',
  ENV_VALIDATION_MODE: 'audit', PAYMENT_MODE: 'disabled', EMAIL_PROVIDER: 'simulation',
  UPLOAD_SCANNER: 'simulation', JWT_SECRET: 'r8-ci-synthetic-only-not-a-real-secret-0001',
  PUBLIC_ORIGIN: 'https://r8-ci.test'});
async function ownedDatabase(run: (url: URL, database: string) => Promise<void>) {
  const url = new URL(adminUrl);
  url.pathname = '/r8_ci_' + randomBytes(8).toString('hex');
  const {database} = assertCIDatabase(url.href, {marker, applicationUrls});
  let created = false;
  try {
    // Strict name validation above makes this identifier safe. No IF NOT EXISTS:
    // a collision must fail without granting permission to drop an existing DB.
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
    created = true;
    await run(url, database);
  } finally {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  }
}
async function child(name: string, command: string[], url: URL) {
  const result = await runOwnedCommand(command, {
    env: {...env, TEST_DATABASE_URL: url.href},
    logFile: path.join(privateDir, name + '.log'), timeoutMs: 10 * 60_000,
  });
  assert.equal(result.exitCode, 0, 'CI_POSTGRES_STAGE_FAILED:' + name);
  console.log('PASS postgres-' + name);
}
try {
  await admin.connect();
  const identity = (await admin.query('SELECT current_database() AS name, current_setting(\'server_version_num\')::int AS version')).rows[0];
  assert.equal(identity.name, 'postgres');
  assert.ok(identity.version >= 170000 && identity.version < 180000, 'POSTGRES17_REQUIRED');
  await ownedDatabase(async (url, database) => {
    const target = {host: url.hostname, port: Number(url.port), database};
    const inventory = emptyCIUploadInventory(target);
    const inventoryPath = path.join(privateDir, 'empty-inventory.json');
    await writeFile(inventoryPath, inventory.source, {mode: 0o600});
    const args = [process.execPath, '--import', 'tsx', 'server/migrate.ts', '--release', '--target=local',
      '--expected-host=127.0.0.1', `--expected-port=${url.port}`, `--expected-database=${database}`,
      `--upload-ownership-inventory=${inventoryPath}`,
      `--upload-ownership-inventory-sha256=${inventory.sha256}`];
    for (const name of ['from-zero', 'repeat']) {
      const result = await runOwnedCommand(args, {env: {...env, DATABASE_URL: url.href},
        logFile: path.join(privateDir, name + '.log'), timeoutMs: 5 * 60_000});
      assert.equal(result.exitCode, 0, 'CI_MIGRATION_FAILED:' + name);
    }
    const client = new pg.Client({...settings, database});
    await client.connect();
    try {
      const canonical = 'docs/evidence/remediation-v2-2/r6/R6-through-0049b-fingerprint-2026-10-15.json';
      assert.equal(process.env.RECORDED ?? canonical, canonical, 'UNREVIEWED_FINGERPRINT');
      const expected = JSON.parse(await readFile(canonical, 'utf8'));
      assert.equal(fingerprintDocument(await collectSchema(client)).digest, expected.digest, 'CANONICAL_SCHEMA_DRIFT');
    } finally { await client.end(); }
    console.log('PASS postgres-canonical-0049b-repeat');
  });
  // Existing verifiers that accept a fresh DB; stricter source-specific R3/R5/R6
  // rehearsal tools keep their original operator guards and are not retargeted.
  for (const [name, script] of [
    ['google-sessions', 'verify-google-handoff-postgres.ts'],
    ['split-sessions', 'verify-invoice-split-sessions-postgres.ts'],
    ['admin-delete', 'verify-admin-business-delete-postgres.ts'],
    ['push-sessions', 'verify-push-switches-per-login-postgres.ts'],
  ]) await ownedDatabase(url => child(name, [process.execPath, '--import', 'tsx', 'scripts/' + script], url));
} finally {
  await admin.end().catch(() => undefined);
  // Logs may contain pg errors; never publish them. Keep on failure for private
  // diagnosis; the outer CI runner uploads only its allowlisted stage summary.
  if (process.env.R8_KEEP_PRIVATE_LOGS !== '1') await rm(privateDir, {recursive: true, force: true});
}
