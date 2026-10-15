import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runCronResolution, parseCronResolution } from './r6-cron-resolve';
const args = [
  '--expected-host=127.0.0.1',
  '--expected-port=55440',
  '--expected-database=owned',
  '--run-id=12345678-1234-4234-9234-123456789012',
  '--job-id=12345678-1234-4234-9234-123456789013',
  '--resolution=verified_safe_retry',
  `--review-digest=${'a'.repeat(64)}`,
];
test('resolution defaults to dry-run; execute requires an explicit stopped-inflight acknowledgement', () => {
  assert.equal(parseCronResolution(args).execute, false);
  assert.throws(
    () => parseCronResolution([...args, '--execute=true']),
    /invalid_cron_resolution_arguments/
  );
  assert.equal(
    parseCronResolution([
      ...args,
      '--execute=true',
      '--acknowledge-inflight-stopped=true',
    ]).execute,
    true
  );
});
test('unknown flags, duplicate flags, malformed UUIDs and review digests are refused', () => {
  for (const suffix of [
    ['--force=true'],
    ['--run-id=bad'],
    ['--review-digest=private-marker'],
    ['--execute=yes'],
  ])
    assert.throws(() => parseCronResolution([...args, ...suffix]));
});
test('ambient application credentials never supply a target', async () => {
  await assert.rejects(
    runCronResolution(args, {
      DATABASE_URL: 'postgresql://private-user:private-password@127.0.0.1/app',
    })
  );
});
test('named-target mismatch prevents execution before connecting', async () => {
  await assert.rejects(
    runCronResolution(
      [...args, '--execute=true', '--acknowledge-inflight-stopped=true'],
      { R6_CRON_DATABASE_URL: 'postgresql://synthetic@127.0.0.1:55440/other' }
    ),
    /R5_PREFLIGHT_TARGET_MISMATCH/
  );
});
test('the real CLI emits a fixed failure and never prints supplied URI credentials', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/r6-cron-resolve.ts', ...args],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        R6_CRON_DATABASE_URL:
          'postgresql://private-user:private-password@127.0.0.1:55440/other',
      },
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'R6_CRON_RESOLUTION_FAILED\n');
});
