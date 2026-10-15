import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  parseEntitlementOperation,
  runEntitlementOperation,
} from './r6-entitlement-policy';
import { parseEntitlementManifest } from '../server/entitlement-operations';
const target = [
  '--expected-host=127.0.0.1',
  '--expected-port=55440',
  '--expected-database=owned',
];
const review = 'a'.repeat(64),
  activate = [...target, '--action=activate', `--review-digest=${review}`];
test('a concrete checksum-pinned classification command parses without connecting', () => {
  const p = parseEntitlementOperation([
    ...target,
    '--action=classify',
    `--review-digest=${review}`,
    '--manifest=/tmp/synthetic-manifest.json',
    `--manifest-sha256=${review}`,
  ]);
  assert.equal(p.action, 'classify');
  assert.equal(p.manifestSha256, review);
  assert.equal(p.execute, false);
});
test('policy operator is a dry-run unless explicitly executed with release acknowledgement', () => {
  assert.equal(parseEntitlementOperation(activate).execute, false);
  assert.throws(() =>
    parseEntitlementOperation([...activate, '--execute=true'])
  );
  assert.equal(
    parseEntitlementOperation([
      ...activate,
      '--execute=true',
      '--acknowledge-release-checks=true',
    ]).execute,
    true
  );
});
test('operator refuses duplicates, unknown args, loose booleans and unpinned manifests', () => {
  for (const extra of [
    ['--execute=yes'],
    ['--action=activate'],
    ['--force=true'],
    ['--manifest=x'],
  ])
    assert.throws(() => parseEntitlementOperation([...activate, ...extra]));
  assert.throws(() =>
    parseEntitlementOperation([
      ...target,
      '--action=classify',
      `--review-digest=${review}`,
      '--manifest=x',
    ])
  );
});
test('operator never uses ambient application credentials or a mismatched target', async () => {
  await assert.rejects(
    runEntitlementOperation(activate, {
      DATABASE_URL: 'postgresql://private:private@127.0.0.1/app',
    })
  );
  await assert.rejects(
    runEntitlementOperation(activate, {
      R6_ENTITLEMENT_DATABASE_URL:
        'postgresql://synthetic@127.0.0.1:55440/other',
    })
  );
});
test('manifests reject inferred/invalid paid sources, normalized dates, arbitrary fields and duplicate entries', () => {
  const p = {
    subscriptionId: 1,
    merchantId: 1,
    source: 'migration_grant',
    start: '2026-10-01T00:00:00Z',
    end: '2026-11-01T00:00:00Z',
  };
  assert.equal(
    parseEntitlementManifest({ version: 1, periods: [p], revocations: [] })
      .periods.length,
    1
  );
  for (const bad of [
    { ...p, source: 'paid' },
    { ...p, start: '2026-02-30T00:00:00Z' },
    { ...p, source: 'unclassified' },
    { ...p, privateData: 'private' },
    { ...p, merchantId: 0 },
  ])
    assert.throws(() =>
      parseEntitlementManifest({ version: 1, periods: [bad], revocations: [] })
    );
  assert.throws(() =>
    parseEntitlementManifest({ version: 1, periods: [p, p], revocations: [] })
  );
});
test('real CLI refuses before connecting with fixed secret-free error', () => {
  const r = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/r6-entitlement-policy.ts',
      ...activate,
      '--execute=true',
    ],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        R6_ENTITLEMENT_DATABASE_URL:
          'postgresql://private:private@127.0.0.1/app',
      },
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'R6_ENTITLEMENT_POLICY_FAILED\n');
});
