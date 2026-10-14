/** Owned synthetic R5 migration rehearsal only; never an ambient app target. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
// @ts-expect-error Existing standalone JavaScript safety helper.
import { assertSafePostgresVerifierEnvironment } from './postgres-verifier-safety.mjs';
// @ts-expect-error Existing standalone JavaScript fingerprint helper.
import { collectSchema, buildFingerprint } from './schema-fingerprint.mjs';

async function rehearse() {
  const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
    testDatabaseUrl: process.env.R5_TEST_DATABASE_URL,
    configuredDatabaseUrl: process.env.DATABASE_URL,
    marker: process.env.TAPTPAY_TEST_DATABASE,
  });
  assertSafePostgresVerifierEnvironment({
    testDatabaseUrl,
    configuredDatabaseUrl: process.env.NEON_DATABASE_URL,
    marker: process.env.TAPTPAY_TEST_DATABASE,
  });
  const url = new URL(testDatabaseUrl);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '55440' ||
    !['/r5_full_scratch', '/r5_full_restore'].includes(url.pathname)
  )
    throw Error('R5_OWNED_TARGET_REQUIRED');
  await import('../server/__tests__/support/test-env');
  const runner = await import('../server/migrate');
  const inventoryTools = await import('../server/upload-ownership-inventory');
  const client = new pg.Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    const empty =
      (
        await client.query(
          "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')"
        )
      ).rows[0].n === 0;
    await runner.ensureMigrationLedger(client);
    if (empty)
      for (const file of runner.listMigrationFiles()) {
        if (file === '0023_uploaded_files_tenant_column.sql') break;
        await runner.applyMigration(
          client,
          file,
          await readFile(`migrations/${file}`, 'utf8')
        );
      }
    const target = {
      host: url.hostname,
      port: Number(url.port),
      database: url.pathname.slice(1),
    };
    const facts = await inventoryTools.readInvoiceDocumentFacts(client, {
      withContent: true,
    });
    const { inventory } = inventoryTools.buildDraftInventory(facts, {
      target,
      approvedBy: 'owned synthetic R5 rehearsal',
      approvedAt: '2026-10-14T00:00:00Z',
    });
    if (inventory.entries.length)
      throw Error('R5_EMPTY_UPLOAD_INVENTORY_REQUIRED');
    const text = JSON.stringify(inventory);
    const verified = inventoryTools.parseUploadOwnershipInventory(
      text,
      createHash('sha256').update(text).digest('hex'),
      target
    );
    const result = await runner.runPendingMigrations(client, {
      log: () => undefined,
      uploadOwnershipInventory: verified,
    });
    const fingerprint = buildFingerprint(await collectSchema(client));
    await writeFile(
      `/tmp/taptpay-r5/${target.database}-fingerprint.json`,
      JSON.stringify(fingerprint, null, 2)
    );
    const counts = (
      await client.query(
        'SELECT (SELECT count(*)::int FROM invoices_rent_requests) AS property,(SELECT count(*)::int FROM job_invoices) AS trades,(SELECT count(*)::int FROM quotes) AS quotes'
      )
    ).rows[0];
    const policy = (
      await client.query(
        'SELECT stage,credential_policy FROM data_encryption_control WHERE id=1'
      )
    ).rows[0];
    console.log(
      JSON.stringify({
        appliedNow: result.appliedNow,
        counts,
        policy,
        schemaFingerprintSaved: true,
      })
    );
  } finally {
    await client.end();
  }
}
try {
  await rehearse();
} catch {
  console.error('R5_MIGRATION_REHEARSAL_FAILED');
  process.exitCode = 1;
}
