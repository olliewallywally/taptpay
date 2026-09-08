import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { encryptedDump, parseBackupArguments, runBackup, validateBackupConnection } from './db-backup.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the operator command refuses CI before creating files or selecting ambient databases', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'taptpay-backup-refusal-'));
  try {
    // Deliberately do not inherit DATABASE_URL, NEON_DATABASE_URL or credentials.
    const result = spawnSync('bash', ['scripts/db-backup.sh'], {
      cwd: root,
      env: { PATH: process.env.PATH, CI: 'true', BACKUP_DIR: path.join(temporary, 'dumps') },
      encoding: 'utf8',
      timeout: 5_000,
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(temporary, 'dumps')), false);
    assert.match(result.stderr, /BACKUP_OPERATOR_ONLY/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

const connection = 'postgresql://fixture:synthetic-only@localhost/backup_fixture';
const recipient = 'A'.repeat(40);
function argumentsFor(destination) {
  return ['--target', 'local', '--expected-host', 'localhost', '--expected-database', 'backup_fixture',
    '--recipient', recipient, '--output', destination];
}

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'taptpay-backup-fixture-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const destination = path.join(temporary, 'backup.sql.gpg');
  return { temporary, destination, argv: argumentsFor(destination) };
}

function operatorOverrides(extra = {}) {
  return {
    env: { BACKUP_DATABASE_URL: connection },
    input: { isTTY: true },
    output: { isTTY: true, write() {} },
    confirm: async () => 'BACKUP local',
    execute: async () => assert.fail('must reject before execution'),
    ...extra,
  };
}

test('exact typed confirmation is required before execution', async (t) => {
  const { argv } = fixture(t);
  for (const answer of ['', 'yes', 'BACKUP production', 'BACKUP local ']) {
    await assert.rejects(runBackup(argv, operatorOverrides({ confirm: async () => answer })), /BACKUP_NOT_CONFIRMED/);
  }
  let executions = 0;
  await runBackup(argv, operatorOverrides({ execute: async (options) => {
    executions++;
    assert.equal(options.connection, connection);
    assert.equal(options.recipient, recipient);
  } }));
  assert.equal(executions, 1);
});

test('noninteractive callers and every declared CI value are refused before confirmation', async (t) => {
  const { argv } = fixture(t);
  for (const extra of [
    { input: { isTTY: false } }, { output: { isTTY: false } },
    ...['true', 'false', '1', '0', ''].map((CI) => ({ env: { CI, BACKUP_DATABASE_URL: connection } })),
  ]) {
    await assert.rejects(runBackup(argv, operatorOverrides({ ...extra,
      confirm: async () => assert.fail('must not ask'),
    })), /BACKUP_OPERATOR_ONLY/);
  }
});

test('missing, duplicate, unknown and malformed arguments are rejected', (t) => {
  const { argv } = fixture(t);
  for (const invalid of [[], argv.slice(0, -1), [...argv, '--target', 'local'], [...argv, '--yes', 'true'],
    argv.map((s) => s === recipient ? 'someone@example.test' : s),
    argv.map((s) => s === 'local' ? 'unknown' : s),
    argv.map((s) => s.endsWith('.sql.gpg') ? 'relative.sql.gpg' : s),
  ]) assert.throws(() => parseBackupArguments(invalid), /BACKUP_INVALID_/);
});

test('ambient database URLs cannot supply the backup connection', (t) => {
  const { argv } = fixture(t);
  assert.throws(() => validateBackupConnection(parseBackupArguments(argv), {
    DATABASE_URL: connection, NEON_DATABASE_URL: connection,
  }), /BACKUP_INVALID_CONNECTION/);
});

test('host/database mismatch and libpq query overrides are rejected', (t) => {
  const options = parseBackupArguments(fixture(t).argv);
  for (const invalid of [
    connection.replace('localhost', 'remote.invalid'), connection.replace('backup_fixture', 'other'),
    `${connection}?host=remote.invalid`, `${connection}?dbname=other`, `${connection}?service=production`,
    `${connection}?sslmode=disable&sslmode=verify-full`, `${connection}?connect_timeout=0`,
    `${connection}?connect_timeout=999`, `${connection}?connect_timeout=1abc`, `${connection}#ignored`,
    'not-a-url',
  ]) assert.throws(() => validateBackupConnection(options, { BACKUP_DATABASE_URL: invalid }), /BACKUP_/);
});

test('remote targets require authenticated TLS and cannot be labelled local', (t) => {
  const options = { ...parseBackupArguments(fixture(t).argv), 'expected-host': 'db.example.test' };
  const remote = connection.replace('localhost', 'db.example.test');
  assert.throws(() => validateBackupConnection(options, { BACKUP_DATABASE_URL: remote }), /BACKUP_TARGET_MISMATCH/);
  for (const target of ['ci', 'staging', 'production']) {
    assert.throws(() => validateBackupConnection({ ...options, target }, { BACKUP_DATABASE_URL: `${remote}?sslmode=require` }), /BACKUP_TLS_REQUIRED/);
    assert.equal(validateBackupConnection({ ...options, target }, { BACKUP_DATABASE_URL: `${remote}?sslmode=verify-full` }), `${remote}?sslmode=verify-full`);
  }
});

test('repository output and symlinked repository directories are rejected before confirmation', async (t) => {
  const { temporary } = fixture(t);
  const alias = path.join(temporary, 'checkout');
  fs.symlinkSync(root, alias, 'dir');
  for (const directory of [root, alias]) {
    await assert.rejects(runBackup(argumentsFor(path.join(directory, 'backup.sql.gpg')), operatorOverrides({
      confirm: async () => assert.fail('must not ask'),
    })), /BACKUP_OUTPUT_IN_REPOSITORY/);
  }
});

function fakePrograms(temporary, { dumpFails = false, encryptionFails = false, hangs = false, empty = false } = {}) {
  const bin = path.join(temporary, 'bin');
  fs.mkdirSync(bin);
  // These executables are transport fakes, not cryptographic or database proof.
  // They assert secret separation and argument isolation without printing values.
  fs.writeFileSync(path.join(bin, 'pg_dump'), `#!${process.execPath}\n
if (process.env.PGDATABASE !== ${JSON.stringify(connection)} || process.argv.some(x => x.includes('synthetic-only')) || process.env.NEON_DATABASE_URL || process.env.WINDCAVE_API_KEY) process.exit(91);
${hangs ? 'setInterval(() => {}, 1000);' : `process.stdout.write('synthetic sql'); process.stderr.write('synthetic private error'); process.exitCode = ${dumpFails ? 2 : 0};`}
`, { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'gpg'), `#!${process.execPath}\n
if (process.env.PGDATABASE || process.env.BACKUP_DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.WINDCAVE_API_KEY) process.exit(92);
if (!process.argv.includes('--encrypt') || !process.argv.includes('--batch') || !process.argv.includes(${JSON.stringify(recipient)})) process.exit(93);
let data = ''; process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => { if (data !== 'synthetic sql') process.exitCode = 94;
${empty ? '' : "process.stdout.write('fixture-encrypted-output');"}
process.stderr.write('synthetic private error'); ${encryptionFails ? 'process.exitCode = 3;' : ''} });
`, { mode: 0o700 });
  return { PATH: bin, NEON_DATABASE_URL: 'must-not-inherit', WINDCAVE_API_KEY: 'must-not-inherit' };
}

test('successful stream writes only encryption output with private permissions', { timeout: 5_000 }, async (t) => {
  const { temporary, destination } = fixture(t);
  const env = fakePrograms(temporary);
  await encryptedDump({ connection, recipient, output: destination, env });
  assert.equal(fs.readFileSync(destination, 'utf8'), 'fixture-encrypted-output');
  assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(temporary).sort(), ['backup.sql.gpg', 'bin']);
});

for (const [name, mode] of [
  ['dump failure', { dumpFails: true }], ['encryption failure', { encryptionFails: true }],
  ['empty encryption output', { empty: true }], ['timeout', { hangs: true }],
]) {
  test(`${name} removes only the new partial file and returns a redacted failure`, { timeout: 5_000 }, async (t) => {
    const { temporary, destination } = fixture(t);
    const env = fakePrograms(temporary, mode);
    const retained = path.join(temporary, 'retained.sql.gpg');
    fs.writeFileSync(retained, 'retained');
    await assert.rejects(encryptedDump({ connection, recipient, output: destination, env,
      timeoutMs: mode.hangs ? 100 : 2_000,
    }), { message: 'BACKUP_FAILED' });
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.readFileSync(retained, 'utf8'), 'retained');
  });
}

test('missing executables fail without leaving an artifact', async (t) => {
  const { temporary, destination } = fixture(t);
  await assert.rejects(encryptedDump({ connection, recipient, output: destination, env: { PATH: temporary } }), { message: 'BACKUP_FAILED' });
  assert.equal(fs.existsSync(destination), false);
});

test('existing files and dangling symlinks are neither overwritten nor deleted', async (t) => {
  const { temporary, destination } = fixture(t);
  fs.writeFileSync(destination, 'retained');
  await assert.rejects(encryptedDump({ connection, recipient, output: destination, env: {} }), /BACKUP_FAILED/);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'retained');
  const alias = path.join(temporary, 'symlink.sql.gpg');
  const absent = path.join(temporary, 'absent');
  fs.symlinkSync(absent, alias);
  await assert.rejects(encryptedDump({ connection, recipient, output: alias, env: {} }), /BACKUP_FAILED/);
  assert.equal(fs.lstatSync(alias).isSymbolicLink(), true);
  assert.equal(fs.existsSync(absent), false);
});

test('cancellation before execution produces no file', async (t) => {
  const { destination } = fixture(t);
  await assert.rejects(encryptedDump({ connection, recipient, output: destination, env: {},
    signal: AbortSignal.abort(),
  }), /BACKUP_FAILED/);
  assert.equal(fs.existsSync(destination), false);
});

test('cancellation during a dump terminates subprocesses and removes partial output', { timeout: 5_000 }, async (t) => {
  const { temporary, destination } = fixture(t);
  const env = fakePrograms(temporary, { hangs: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    await assert.rejects(encryptedDump({ connection, recipient, output: destination, env,
      signal: controller.signal,
    }), { message: 'BACKUP_FAILED' });
    assert.equal(fs.existsSync(destination), false);
  } finally { clearTimeout(timer); }
});
