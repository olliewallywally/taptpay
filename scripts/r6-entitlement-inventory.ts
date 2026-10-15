import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryEntitlements } from '../server/entitlement-inventory';
import {
  parsePreflightArguments,
  assertPreflightTarget,
} from '../server/encryption-preflight';
import { preflightConnectionSettings } from './r5-encryption-preflight';
export async function runEntitlementInventory(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
) {
  const target = parsePreflightArguments(argv),
    settings = preflightConnectionSettings({
      ...env,
      R5_PREFLIGHT_DATABASE_URL: env.R6_ENTITLEMENT_DATABASE_URL,
    });
  assertPreflightTarget(target, settings);
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    ...settings,
    application_name: 'taptpay-r6-entitlement-inventory',
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    return await inventoryEntitlements(client, target, target.batchSize);
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(await runEntitlementInventory(process.argv.slice(2), process.env), null, 2)}\n`
    );
  } catch {
    process.stderr.write('R6_ENTITLEMENT_INVENTORY_FAILED\n');
    process.exitCode = 1;
  }
}
