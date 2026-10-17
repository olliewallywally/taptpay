import test from 'node:test';
import assert from 'node:assert/strict';
import * as safety from './verify-ci-safety.mjs';
const core =
  'postgres://fixture:synthetic@127.0.0.1:55440/r8_ci_0123456789abcdef?sslmode=disable';
const storage = phase =>
  core.replace('r8_ci_', 'taptpay_s' + phase + '_verify_r8_');
test('existing CI guard refuses the same application database through every loopback alias', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]'])
    assert.throws(
      () =>
        safety.assertCIDatabase(core, {
          marker: '1',
          applicationUrls: [core.replace('127.0.0.1', host)],
        }),
      /CI_DATABASE_REFUSED/
    );
});
test('storage guard permits only fresh R8-namespaced phase2/3/4 loopback identities', () => {
  for (const phase of [2, 3, 4])
    assert.equal(
      safety.assertCIStorageDatabase(storage(phase), { marker: '1' }).database,
      `taptpay_s${phase}_verify_r8_0123456789abcdef`
    );
});
test('storage guard refuses transport, naming, marker and application collisions before DB access', () => {
  for (const bad of [
    storage(1),
    storage(5),
    core,
    storage(2).replace('verify_r8_', 'verify_'),
    storage(2).replace('0123456789abcdef', 'short'),
    storage(2).replace('127.0.0.1', 'remote.test'),
    storage(2).replace(':55440/', ':0/'),
    storage(2).replace(':synthetic@', '@'),
    storage(2) + '&options=unsafe',
  ])
    assert.throws(
      () => safety.assertCIStorageDatabase(bad, { marker: '1' }),
      /CI_DATABASE_REFUSED/
    );
  assert.throws(
    () => safety.assertCIStorageDatabase(storage(2)),
    /CI_DATABASE_REFUSED/
  );
  for (const host of ['127.0.0.1', 'localhost', '[::1]'])
    assert.throws(
      () =>
        safety.assertCIStorageDatabase(storage(2), {
          marker: '1',
          applicationUrls: [storage(2).replace('127.0.0.1', host)],
        }),
      /CI_DATABASE_REFUSED/
    );
  assert.throws(
    () => safety.assertCIDatabase(storage(2), { marker: '1' }),
    /CI_DATABASE_REFUSED/
  );
});

test('canonical storage worker refuses unsafe identities before any connection', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'r8-worker-guard-'));
  try {
    for (const [name, extra] of [
      [
        'unsafe',
        {
          TAPTPAY_VERIFY_CANONICAL_CI: '1',
          TEST_DATABASE_URL: core.replace(
            'r8_ci_0123456789abcdef',
            'production'
          ),
        },
      ],
      ['legacy-public', { TEST_DATABASE_URL: core }],
    ]) {
      const report = path.join(dir, name + '.jsonl'),
        logFile = path.join(dir, name + '.log');
      const result = await safety.runOwnedCommand(
        [process.execPath, 'scripts/verify-server-postgres-storage.mjs'],
        {
          env: {
            PATH: process.env.PATH,
            TAPTPAY_VERIFY_PHASE: 'post-index',
            TAPTPAY_VERIFY_SCHEMA: 'public',
            TAPTPAY_TEST_DATABASE: '1',
            NODE_OPTIONS:
              '--import=' + path.resolve('scripts/r8-build-guard.mjs'),
            R8_BUILD_GUARD_REPORT: report,
            ...extra,
          },
          logFile,
          timeoutMs: 5000,
        }
      );
      assert.equal(result.exitCode, 1);
      const output = await readFile(logFile, 'utf8');
      if (name === 'unsafe') assert.match(output, /CI_DATABASE_REFUSED/);
      else
        assert.match(
          output,
          /refusing an invalid disposable verifier schema name/
        );
      const connections = await readFile(report, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      assert.equal(connections, '');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('PG diagnostic selector rejects unknown modes before database configuration or effects', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'r8-pg-argument-'));
  try {
    const report = path.join(dir, 'connections.jsonl'),
      logFile = path.join(dir, 'private.log');
    const result = await safety.runOwnedCommand(
      [
        process.execPath,
        '--import',
        'tsx',
        'scripts/verify-ci-postgres.ts',
        '--only=unsafe',
      ],
      {
        env: {
          PATH: process.env.PATH,
          NODE_OPTIONS:
            '--import=' + path.resolve('scripts/r8-package-network-guard.mjs'),
          R8_PACKAGE_GUARD_REPORT: report,
          R8_PACKAGE_EXPECTED_TSX_IPC: path.join(
            tmpdir(),
            `tsx-${process.geteuid()}`,
            `${process.pid}.pipe`
          ),
        },
        logFile,
        timeoutMs: 5000,
      }
    );
    assert.equal(result.exitCode, 1);
    assert.match(await readFile(logFile, 'utf8'), /CI_POSTGRES_ARGUMENT/);
    const attempts = (
      await readFile(report, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return '';
        throw error;
      })
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);
    assert.ok(attempts.length <= 2, 'UNEXPECTED_SELECTOR_SOCKET_ATTEMPTS');
    assert.ok(
      attempts.every(record => record.kind === 'optional-tsx-ipc-refused'),
      'SELECTOR_ATTEMPTED_UNEXPECTED_CONNECTION'
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
