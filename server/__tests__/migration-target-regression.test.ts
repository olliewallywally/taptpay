import fs from 'node:fs';
import path from 'node:path';
import {
  MigrationTargetError,
  SELECT_TARGET_IDENTITY_SQL,
  parseCliArgs,
  resolveMigrationTargetExpectation,
  validateMigrationTargetUrl,
  withValidatedMigrationTarget,
  type CliOptions,
  type MigrationClient,
  type MigrationTargetConnection,
  type ValidatedMigrationTarget,
} from '../migrate';

const SECRET = 'hunter2-do-not-echo';
const LOCAL_URL = `postgres://migrator:${SECRET}@127.0.0.1:5432/taptpay`;
const REMOTE_URL = `postgres://migrator:${SECRET}@db.example.net:5432/taptpay?sslmode=verify-full`;

/** The CLI arguments an operator must now supply for a loopback target. */
function localArgs(overrides: readonly string[] = []): string[] {
  return [
    '--target=local',
    '--expected-host=127.0.0.1',
    '--expected-port=5432',
    '--expected-database=taptpay',
    ...overrides,
  ];
}

function localExpectation() {
  return resolveMigrationTargetExpectation(parseCliArgs(localArgs()));
}

/** A fake connection whose queries are recorded and never touch a database. */
function fakeConnection(identity: { database: string; username: string } | null = {
  database: 'taptpay',
  username: 'migrator',
}) {
  const calls: string[] = [];
  let ended = 0;
  const client = {
    async query(text: string) {
      calls.push(text);
      if (text === SELECT_TARGET_IDENTITY_SQL) return { rows: identity ? [identity] : [] };
      return { rows: [] };
    },
  } as MigrationClient;
  const connection: MigrationTargetConnection = { client, end: async () => { ended += 1; } };
  return { connection, calls, client, ended: () => ended };
}

// ---------------------------------------------------------------------------
// CLI boundary — duplicate/unknown options and conflicting modes
// ---------------------------------------------------------------------------

test('conflicting migration modes cannot silently select the last mode', () => {
  expect(parseCliArgs(['--status', '--baseline']).unknown.length).toBeGreaterThan(0);
});

test('duplicate mode flags cannot silently pass validation', () => {
  expect(parseCliArgs(['--status', '--status']).unknown.length).toBeGreaterThan(0);
});

test('the CLI uses the validated target connection boundary', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'migrate.ts'), 'utf8');
  expect(source).toContain('await withValidatedMigrationTarget(');
  expect(source).not.toContain('Unknown argument(s): ${options.unknown.join');
});

test.each([
  ['--dry-run', '--dry-run'],
  ['--confirm', '--confirm'],
  ['--force', '--force'],
  ['--target=local', '--target=local'],
  ['--expected-host=127.0.0.1', '--expected-host=127.0.0.1'],
  ['--expected-database=taptpay', '--expected-database=taptpay'],
])('a repeated option is rejected rather than merged (%s)', (first, second) => {
  expect(parseCliArgs([first, second]).unknown.length).toBeGreaterThan(0);
});

test('a repeated option with a different value cannot override the first', () => {
  expect(parseCliArgs(['--expected-database=a', '--expected-database=b']).unknown.length)
    .toBeGreaterThan(0);
});

test('unrecognised arguments are still rejected', () => {
  expect(parseCliArgs(['--apply-everything']).unknown.length).toBeGreaterThan(0);
  expect(parseCliArgs(['--target']).unknown.length).toBeGreaterThan(0);
});

test('invalid arguments fail without echoing the offending input', () => {
  const options = parseCliArgs(['--secret-flag=' + SECRET]);
  const error = (() => {
    try {
      resolveMigrationTargetExpectation(options);
      return null;
    } catch (caught) {
      return caught as MigrationTargetError;
    }
  })();
  expect(error).toBeInstanceOf(MigrationTargetError);
  expect(error!.code).toBe('MIGRATE_CLI_INVALID_ARGUMENTS');
  expect(error!.message).not.toContain(SECRET);
  expect(error!.message).not.toContain('secret-flag');
});

// ---------------------------------------------------------------------------
// Explicit target identity — no ambient selection
// ---------------------------------------------------------------------------

test.each([
  ['classification', ['--expected-host=127.0.0.1', '--expected-database=taptpay']],
  ['host', ['--target=local', '--expected-database=taptpay']],
  ['database', ['--target=local', '--expected-host=127.0.0.1']],
])('a missing expected %s is refused before any connection', (_label, argv) => {
  expect(() => resolveMigrationTargetExpectation(parseCliArgs(argv)))
    .toThrow(MigrationTargetError);
});

test.each(['local', 'ci', 'staging', 'production'])('%s is an accepted classification', (classification) => {
  const argv = [`--target=${classification}`, '--expected-host=h.example.net', '--expected-database=taptpay'];
  expect(resolveMigrationTargetExpectation(parseCliArgs(argv)).classification).toBe(classification);
});

test('an unknown target classification is refused', () => {
  expect(() => resolveMigrationTargetExpectation(parseCliArgs(localArgs().map((arg) =>
    arg.startsWith('--target=') ? '--target=whatever' : arg))))
    .toThrow(MigrationTargetError);
});

test.each(['0', '70000', 'abc', '5432.0', ''])('an out-of-range expected port %s is refused', (port) => {
  const argv = localArgs().map((arg) => (arg.startsWith('--expected-port=') ? `--expected-port=${port}` : arg));
  expect(() => resolveMigrationTargetExpectation(parseCliArgs(argv))).toThrow(MigrationTargetError);
});

test('an omitted expected port defaults to the PostgreSQL port', () => {
  const argv = localArgs().filter((arg) => !arg.startsWith('--expected-port='));
  expect(resolveMigrationTargetExpectation(parseCliArgs(argv)).port).toBe(5432);
});

// ---------------------------------------------------------------------------
// URL boundary — structure, encoding and bounds
// ---------------------------------------------------------------------------

function rejects(url: string | undefined, code: string) {
  const error = (() => {
    try {
      validateMigrationTargetUrl(url, localExpectation());
      return null;
    } catch (caught) {
      return caught as MigrationTargetError;
    }
  })();
  expect(error).toBeInstanceOf(MigrationTargetError);
  expect(error!.code).toBe(code);
  return error!;
}

test('an absent connection string is refused', () => {
  rejects(undefined, 'MIGRATE_TARGET_URL_MISSING');
  rejects('', 'MIGRATE_TARGET_URL_MISSING');
});

test('a non-PostgreSQL scheme is refused', () => {
  rejects(`mysql://migrator:${SECRET}@127.0.0.1:5432/taptpay`, 'MIGRATE_TARGET_URL_SCHEME');
});

test('a malformed URI is refused', () => {
  rejects('not a url at all', 'MIGRATE_TARGET_URL_MALFORMED');
});

test.each([
  `postgres://127.0.0.1:5432/taptpay`,
  `postgres://migrator@127.0.0.1:5432/taptpay`,
  `postgres://:${SECRET}@127.0.0.1:5432/taptpay`,
])('an implicit or partial credential is refused', (url) => {
  rejects(url, 'MIGRATE_TARGET_URL_CREDENTIALS');
});

test.each([
  `postgres://migrator:${SECRET}@127.0.0.1:5432/`,
  `postgres://migrator:${SECRET}@127.0.0.1:5432`,
  `postgres://migrator:${SECRET}@127.0.0.1:5432/taptpay/extra`,
])('a missing or multi-segment database path is refused', (url) => {
  rejects(url, 'MIGRATE_TARGET_URL_DATABASE');
});

test('a URI fragment is refused', () => {
  rejects(`${LOCAL_URL}#fragment`, 'MIGRATE_TARGET_URL_FRAGMENT');
});

test('a percent-encoded socket directory is refused as a host', () => {
  rejects(`postgres://migrator:${SECRET}@%2Fvar%2Frun%2Fpostgresql/taptpay`, 'MIGRATE_TARGET_URL_HOST');
});

// An authority with credentials and no host is not a parseable URI at all, so
// it is refused one step earlier. Both paths refuse; only the code differs.
test('an empty host is refused', () => {
  rejects(`postgres://migrator:${SECRET}@/taptpay`, 'MIGRATE_TARGET_URL_MALFORMED');
  rejects('postgres:///taptpay', 'MIGRATE_TARGET_URL_CREDENTIALS');
});

test('an uppercase host still matches the declared lowercase host', () => {
  expect(validateMigrationTargetUrl(
    `postgres://migrator:${SECRET}@LOCALHOST:5432/taptpay`,
    resolveMigrationTargetExpectation(parseCliArgs(localArgs().map((arg) =>
      (arg.startsWith('--expected-host=') ? '--expected-host=localhost' : arg)))),
  ).host).toBe('localhost');
});

test('an out-of-range port is refused', () => {
  rejects(`postgres://migrator:${SECRET}@127.0.0.1:0/taptpay`, 'MIGRATE_TARGET_URL_PORT');
});

test('invalid percent-encoding is refused', () => {
  rejects(`postgres://migrator:${SECRET}@127.0.0.1:5432/tapt%zzpay`, 'MIGRATE_TARGET_URL_ENCODING');
});

test('an encoded separator cannot smuggle a second path component', () => {
  rejects(`postgres://migrator:${SECRET}@127.0.0.1:5432/tapt%2Fpay`, 'MIGRATE_TARGET_URL_DATABASE');
});

// ---------------------------------------------------------------------------
// Connection parameter overrides
// ---------------------------------------------------------------------------

test.each([
  'options=-csearch_path%3Dattacker',
  'host=elsewhere.example.net',
  'dbname=other',
  'user=postgres',
  'passfile=%2Ftmp%2Fpass',
  'application_name=not-the-runner',
])('an unapproved connection parameter is refused (%s)', (query) => {
  rejects(`${LOCAL_URL}?${query}`, 'MIGRATE_TARGET_URL_PARAMETERS');
});

test('a duplicated approved parameter is refused', () => {
  rejects(`${LOCAL_URL}?sslmode=disable&sslmode=verify-full`, 'MIGRATE_TARGET_URL_PARAMETERS');
});

test('an unknown TLS mode is refused', () => {
  rejects(`${LOCAL_URL}?sslmode=maybe`, 'MIGRATE_TARGET_URL_PARAMETERS');
});

test.each(['0', '600', 'soon'])('an out-of-range connect timeout %s is refused', (value) => {
  rejects(`${LOCAL_URL}?connect_timeout=${value}`, 'MIGRATE_TARGET_URL_PARAMETERS');
});

test('approved TLS and timeout controls pass', () => {
  const target = validateMigrationTargetUrl(`${LOCAL_URL}?sslmode=disable&connect_timeout=10`, localExpectation());
  expect(target.connectionTimeoutMs).toBe(10_000);
  expect(target.ssl).toBe(false);
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test.each(['127.0.0.1', 'localhost', '[::1]'])('an explicit loopback host classifies as local (%s)', (host) => {
  const argv = localArgs().map((arg) => (arg.startsWith('--expected-host=')
    ? `--expected-host=${host.replace(/[[\]]/g, '')}`
    : arg));
  const expectation = resolveMigrationTargetExpectation(parseCliArgs(argv));
  const target = validateMigrationTargetUrl(`postgres://migrator:${SECRET}@${host}:5432/taptpay`, expectation);
  expect(target.classification).toBe('local');
});

test('the legacy non-loopback workspace hostname cannot be relabelled local', () => {
  const argv = localArgs().map((arg) => (arg.startsWith('--expected-host=') ? '--expected-host=helium' : arg));
  const expectation = resolveMigrationTargetExpectation(parseCliArgs(argv));
  expect(() => validateMigrationTargetUrl(`postgres://migrator:${SECRET}@helium:5432/taptpay`, expectation))
    .toThrow(MigrationTargetError);
});

function remoteExpectation(classification: 'ci' | 'staging' | 'production') {
  return resolveMigrationTargetExpectation(parseCliArgs([
    `--target=${classification}`,
    '--expected-host=db.example.net',
    '--expected-port=5432',
    '--expected-database=taptpay',
  ]));
}

test.each(['ci', 'staging', 'production'] as const)('a remote %s target requires authenticated TLS', (classification) => {
  const expectation = remoteExpectation(classification);
  for (const mode of ['disable', 'require']) {
    const error = (() => {
      try {
        validateMigrationTargetUrl(`postgres://migrator:${SECRET}@db.example.net:5432/taptpay?sslmode=${mode}`, expectation);
        return null;
      } catch (caught) {
        return caught as MigrationTargetError;
      }
    })();
    expect(error?.code).toBe('MIGRATE_TARGET_REMOTE_REQUIRES_TLS');
  }
  const target = validateMigrationTargetUrl(REMOTE_URL, expectation);
  expect(target.ssl).toEqual({ rejectUnauthorized: true });
});

test('a remote classification cannot point at loopback', () => {
  const expectation = resolveMigrationTargetExpectation(parseCliArgs([
    '--target=production',
    '--expected-host=127.0.0.1',
    '--expected-database=taptpay',
  ]));
  expect(() => validateMigrationTargetUrl(`${LOCAL_URL}?sslmode=verify-full`, expectation))
    .toThrow(MigrationTargetError);
});

test.each([
  ['host', `postgres://migrator:${SECRET}@127.0.0.2:5432/taptpay`],
  ['port', `postgres://migrator:${SECRET}@127.0.0.1:5433/taptpay`],
  ['database', `postgres://migrator:${SECRET}@127.0.0.1:5432/other`],
])('a URL that disagrees with the declared %s is refused', (_label, url) => {
  rejects(url, 'MIGRATE_TARGET_EXPECTATION_MISMATCH');
});

test('an omitted URL port is compared as the effective PostgreSQL port', () => {
  const target = validateMigrationTargetUrl(`postgres://migrator:${SECRET}@127.0.0.1/taptpay`, localExpectation());
  expect(target.port).toBe(5432);
});

test('the validated target exposes explicit fields and no ambient connection string', () => {
  const target: ValidatedMigrationTarget = validateMigrationTargetUrl(LOCAL_URL, localExpectation());
  expect(target).toMatchObject({
    classification: 'local',
    host: '127.0.0.1',
    port: 5432,
    database: 'taptpay',
    user: 'migrator',
    password: SECRET,
  });
  expect(Object.keys(target)).not.toContain('connectionString');
});

// ---------------------------------------------------------------------------
// Boundary ordering, identity comparison and redaction
// ---------------------------------------------------------------------------

function boundary(argv: readonly string[], connectionString: string | undefined, connect: jest.Mock) {
  return withValidatedMigrationTarget(
    { cli: parseCliArgs(argv) as CliOptions, connectionString, connect },
    async (client) => {
      await client.query('WORK');
      return 'done';
    },
  );
}

test('invalid arguments fail before a connection is ever constructed', async () => {
  const connect = jest.fn();
  await expect(boundary(['--status', '--status'], LOCAL_URL, connect)).rejects.toThrow(MigrationTargetError);
  expect(connect).not.toHaveBeenCalled();
});

test('an invalid URL fails before a connection is ever constructed', async () => {
  const connect = jest.fn();
  await expect(boundary(localArgs(), `postgres://migrator@127.0.0.1:5432/taptpay`, connect))
    .rejects.toThrow(MigrationTargetError);
  expect(connect).not.toHaveBeenCalled();
});

test('a server database or login mismatch does no ledger work and closes the connection', async () => {
  for (const identity of [
    { database: 'other', username: 'migrator' },
    { database: 'taptpay', username: 'postgres' },
    null,
  ]) {
    const fake = fakeConnection(identity);
    const connect = jest.fn(async () => fake.connection);
    await expect(boundary(localArgs(), LOCAL_URL, connect)).rejects.toThrow(MigrationTargetError);
    expect(fake.calls).toEqual([SELECT_TARGET_IDENTITY_SQL]);
    expect(fake.ended()).toBe(1);
  }
});

test('a matching identity runs the work and always closes the connection', async () => {
  const fake = fakeConnection();
  const connect = jest.fn(async () => fake.connection);
  await expect(boundary(localArgs(), LOCAL_URL, connect)).resolves.toBe('done');
  expect(fake.calls).toEqual([SELECT_TARGET_IDENTITY_SQL, 'WORK']);
  expect(fake.ended()).toBe(1);
});

test('failed work still closes the connection', async () => {
  const fake = fakeConnection();
  const connect = jest.fn(async () => fake.connection);
  await expect(withValidatedMigrationTarget(
    { cli: parseCliArgs(localArgs()), connectionString: LOCAL_URL, connect },
    async () => { throw new Error('work failed'); },
  )).rejects.toThrow('work failed');
  expect(fake.ended()).toBe(1);
});

test('a connection failure is reported as a fixed code without the URI or credentials', async () => {
  const connect = jest.fn(async () => { throw new Error(`connect ECONNREFUSED ${LOCAL_URL}`); });
  const error = await boundary(localArgs(), LOCAL_URL, connect).then(
    () => null,
    (caught: unknown) => caught as MigrationTargetError,
  );
  expect(error).toBeInstanceOf(MigrationTargetError);
  expect(error!.code).toBe('MIGRATE_TARGET_CONNECT_FAILED');
  expect(error!.message).not.toContain(SECRET);
  expect(error!.message).not.toContain('127.0.0.1');
});

test('no boundary error echoes the URI, credentials or row values', () => {
  const cases: [string | undefined, string][] = [
    [`${LOCAL_URL}#fragment`, SECRET],
    [`${LOCAL_URL}?options=-csearch_path%3D${SECRET}`, SECRET],
    [`postgres://migrator:${SECRET}@127.0.0.2:5432/taptpay`, '127.0.0.2'],
  ];
  for (const [url, needle] of cases) {
    const error = (() => {
      try {
        validateMigrationTargetUrl(url, localExpectation());
        return null;
      } catch (caught) {
        return caught as MigrationTargetError;
      }
    })();
    expect(error).toBeInstanceOf(MigrationTargetError);
    expect(error!.message).not.toContain(needle);
    expect(error!.message).not.toContain('taptpay');
  }
});
