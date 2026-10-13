/** Synthetic-only expansion rehearsal. Refuses any ambient database target.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/rehearse-r3-migration-postgres.ts
 * --before-expansion builds through 0033 and populates fixtures for dump/restore.
 * --restored applies pending 0034 to a previously restored synthetic database.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pg from "pg";
import { assertSafePostgresVerifierEnvironment } from "./postgres-verifier-safety.mjs";
import { collectSchema, buildFingerprint } from "./schema-fingerprint.mjs";
import { readPaymentDurabilityPreflight } from '../server/payment-durability-preflight';

const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
  testDatabaseUrl: process.env.TEST_DATABASE_URL, configuredDatabaseUrl: process.env.DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE,
});
assertSafePostgresVerifierEnvironment({ testDatabaseUrl, configuredDatabaseUrl: process.env.NEON_DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE });
const url = new URL(testDatabaseUrl);
assert.equal(url.hostname, "127.0.0.1", "this populated synthetic rehearsal requires an isolated loopback server");
assert.match(url.pathname, /^\/r3_(scratch|snapshot|restore|integrated_scratch|integrated_snapshot|integrated_restore)$/);
await import("../server/__tests__/support/test-env");
const runner = await import("../server/migrate");
const inventoryTools = await import("../server/upload-ownership-inventory");
const client = new pg.Client({ connectionString: testDatabaseUrl });
await client.connect();
const expansion = "0034_payment_attempt_expected_values.sql";
const evidencePrefix=url.pathname.includes('integrated_') ? 'integrated-' : '';
try {
  const restored = process.argv.includes("--restored");
  const before = process.argv.includes("--before-expansion");
  if (!restored) {
    const occupied = await client.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')");
    assert.equal(occupied.rows[0].n, 0, "only empty disposable databases may be bootstrapped");
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === "0023_uploaded_files_tenant_column.sql") break;
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
  }
  const target = { host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1) };
  const facts = await inventoryTools.readInvoiceDocumentFacts(client, { withContent: true });
  const { inventory } = inventoryTools.buildDraftInventory(facts, { target,
    approvedBy: "isolated synthetic R3 verifier", approvedAt: "2026-10-12T00:00:00Z" });
  assert.equal(inventory.entries.length, 0);
  const source = JSON.stringify(inventory);
  const verified = inventoryTools.parseUploadOwnershipInventory(source,
    createHash("sha256").update(source).digest("hex"), target);
  const dir = await mkdtemp(path.join(os.tmpdir(), "taptpay-r3-migrations-"));
  for (const file of runner.listMigrationFiles()) {
    if (before && file >= expansion) break;
    await copyFile(`migrations/${file}`, path.join(dir, file));
  }
  const beforeCounts=restored ? await readPaymentDurabilityPreflight(client) : undefined;
  if(beforeCounts) assert.ok(Object.values(beforeCounts.counts).every(n=>n===0),'dirty restored preflight');
  const result = await runner.runPendingMigrations(client, { dir, uploadOwnershipInventory: verified,
    log: () => undefined });
  if (before) {
    await client.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('R3 synthetic','R3 synthetic','r3@synthetic.test','active')");
    await client.query("INSERT INTO tenant_profiles(merchant_id,first_name,last_name,property_address) VALUES (1,'Test','Tenant','Synthetic')");
    await client.query("INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address) VALUES (1,'Test','Client','Synthetic')");
    await client.query(`INSERT INTO invoices_rent_requests(merchant_id,tenant_profile_id,amount_cents,token,delivery_channel,due_at,status)
      SELECT 1,(SELECT id FROM tenant_profiles LIMIT 1),10001,'legacy-rent-'||s,'email',now(),'sent' FROM generate_series(1,1000) s`);
    await client.query(`INSERT INTO job_invoices(merchant_id,client_profile_id,amount_cents,token,delivery_channel,due_at,status)
      SELECT 1,(SELECT id FROM client_profiles LIMIT 1),10001,'legacy-job-'||s,'email',now(),'sent' FROM generate_series(1,1000) s`);
    await client.query(`INSERT INTO quotes(merchant_id,client_profile_id,token,line_items,subtotal_cents,total_cents,status)
      SELECT 1,(SELECT id FROM client_profiles LIMIT 1),'legacy-quote-'||s,
        '[{"description":"Synthetic","qty":1,"unitPriceCents":10001,"lineTotalCents":10001}]'::jsonb,10001,10001,'sent' FROM generate_series(1,1000) s`);
    console.log("PRE-EXPANSION synthetic fixture: 1000 property invoices + 1000 trades invoices + 1000 quotes; raw links preserved for restore");
  } else {
    assert.ok(result.appliedNow.includes(expansion));
    const count = await client.query("SELECT (SELECT count(*)::int FROM invoices_rent_requests) AS property, (SELECT count(*)::int FROM job_invoices) AS trades, (SELECT count(*)::int FROM quotes) AS quotes");
    if (restored) assert.deepEqual(count.rows[0], { property: 1000, trades: 1000, quotes:1000 });
    const fingerprint = buildFingerprint(await collectSchema(client));
    const afterCounts=await readPaymentDurabilityPreflight(client);
    await writeFile(`/tmp/taptpay-r3-postgres/${evidencePrefix}${restored ? 'restored' : 'scratch'}-preflight.json`,JSON.stringify({before:beforeCounts,after:afterCounts},null,2));
    await writeFile(`/tmp/taptpay-r3-postgres/${evidencePrefix}${restored ? "restored" : "scratch"}-fingerprint.json`, JSON.stringify(fingerprint, null, 2));
    console.log(JSON.stringify({ applied: result.appliedNow, counts: count.rows[0], fingerprintSaved: true }));
  }
} finally { await client.end(); }
