import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runEntitlementInventory } from './r6-entitlement-inventory';
const target = [
  '--expected-host=127.0.0.1',
  '--expected-port=55440',
  '--expected-database=owned',
];
test('inventory has no mutation option and refuses it before connecting', async () => {
  await assert.rejects(
    runEntitlementInventory([...target, '--execute=true'], {}),
    /R5_PREFLIGHT_INVALID_ARGUMENTS/
  );
});
test('ambient application database never supplies the inventory target', async () => {
  await assert.rejects(
    runEntitlementInventory(target, {
      DATABASE_URL:
        'postgresql://private-username:private-password@127.0.0.1/app',
    }),
    /FINGERPRINT_INVALID_CONNECTION/
  );
});
test('mismatched named database is rejected without connection or data projection', async () => {
  await assert.rejects(
    runEntitlementInventory(target, {
      R6_ENTITLEMENT_DATABASE_URL:
        'postgresql://synthetic@127.0.0.1:55440/other',
    }),
    /R5_PREFLIGHT_TARGET_MISMATCH/
  );
});
test('real command failure is fixed and contains no supplied credentials', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/r6-entitlement-inventory.ts', ...target],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        R6_ENTITLEMENT_DATABASE_URL:
          'postgresql://private-username:private-password@127.0.0.1:55440/other',
      },
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'R6_ENTITLEMENT_INVENTORY_FAILED\n');
});
