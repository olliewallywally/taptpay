/** R5 proof on newly cloned, owned synthetic databases only. No live providers. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';
import {
  loadDataEncryption,
  LEGACY_BANK_COLUMNS,
} from '../server/data-encryption';
import { EncryptionWorkflow } from '../server/encryption-workflow';
import { ActiveSecretWorkflow } from '../server/active-secret-workflow';
import {
  ACTIVE_SECRET_FIELDS,
  openActiveSecret,
} from '../server/active-secret-vault';
// @ts-expect-error Existing standalone safety helper.
import { assertSafePostgresVerifierEnvironment } from './postgres-verifier-safety.mjs';
// @ts-expect-error Existing standalone schema helper.
import { collectSchema, buildFingerprint } from './schema-fingerprint.mjs';
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    const code = (error as any)?.code;
    console.error(
      `FAIL ${name}${typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? ` (${code})` : ''}`
    );
    throw Error('R5_WORKFLOW_PROOF_FAILED');
  }
  passed++;
  console.log(`PASS ${name}`);
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function verify() {
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
  const sourceUrl = new URL(testDatabaseUrl);
  if (
    sourceUrl.hostname !== '127.0.0.1' ||
    sourceUrl.port !== '55440' ||
    !['/r5_full_scratch', '/r5_full_restore'].includes(sourceUrl.pathname)
  )
    throw Error('R5_OWNED_TARGET_REQUIRED');
  await import('../server/__tests__/support/test-env');
  const { DatabaseStorage } = await import('../server/storage');
  const { DurableSubscriptionBilling } = await import(
    '../server/durable-subscription-billing'
  );
  const { DurableSubscriptionCard } = await import(
    '../server/durable-subscription-card'
  );
  const { DurablePaymentStorage } = await import(
    '../server/durable-payment-storage'
  );
  const { PaymentRuntime } = await import('../server/payment-runtime');
  const { runEncryptionOperator } = await import('./r5-encryption-workflow');
  const { findMissingBaselineEffects } = await import(
    '../server/migration-baseline-contract'
  );
  const policyChoice = sourceUrl.pathname.endsWith('scratch')
    ? 'encrypt'
    : 'delete';
  const database = `r5_proof_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    restored = `${database}_restore`;
  console.log('R5_PROOF_CREATING_OWNED_CLONE');
  const source = new pg.Client({ connectionString: testDatabaseUrl });
  await source.connect();
  try {
    assert.deepEqual(
      (
        await source.query(
          'SELECT stage,active_secret_stage FROM data_encryption_control'
        )
      ).rows[0],
      { stage: 'legacy', active_secret_stage: 'legacy' }
    );
    await source.query(
      `CREATE DATABASE ${database} TEMPLATE ${sourceUrl.pathname.slice(1)}`
    );
  } finally {
    await source.end();
  }
  console.log('R5_PROOF_CLONE_CREATED');
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${database}`;
  const target = { host: url.hostname, port: Number(url.port), database };
  const pool = new pg.Pool({ connectionString: url.toString(), max: 6 }),
    readerPool = new pg.Pool({ connectionString: url.toString(), max: 2 });
  pool.on('error', () => undefined);
  readerPool.on('error', () => undefined);
  const keys = [
    { id: 'first', key: randomBytes(32).toString('base64url') },
    { id: 'second', key: randomBytes(32).toString('base64url') },
  ];
  const env = {
    DATA_ENCRYPTION_STAGE: 'encrypted-write',
    DATA_ENCRYPTION_ACTIVE_KEY_ID: 'first',
    DATA_ENCRYPTION_KEYRING: JSON.stringify(keys),
  };
  const encryption = loadDataEncryption(env),
    rotated = loadDataEncryption({
      ...env,
      DATA_ENCRYPTION_ACTIVE_KEY_ID: 'second',
    }),
    contract = loadDataEncryption({
      ...env,
      DATA_ENCRYPTION_ACTIVE_KEY_ID: 'second',
      DATA_ENCRYPTION_STAGE: 'contract',
    });
  const bank = new EncryptionWorkflow(pool, target, encryption, readerPool),
    active = new ActiveSecretWorkflow(pool, target, encryption, readerPool);
  const orm = drizzle(pool, { schema }),
    storage = new DatabaseStorage(orm as any, encryption);
  const decision = {
    policy: policyChoice as 'encrypt' | 'delete',
    reviewReference: hash('synthetic owned test decision'),
    ...(policyChoice === 'encrypt' ? { deleteAfter: '2099-01-01' } : {}),
  };
  let now = new Date();
  const clock = () => now,
    providerContext = {
      environment: 'uat' as const,
      providerAccount: 'synthetic-r5',
    };
  console.log('R5_PROOF_READING_FIXTURE');
  const initialCounts = (
    await pool.query(
      'SELECT (SELECT count(*)::int FROM invoices_rent_requests) AS property,(SELECT count(*)::int FROM job_invoices) AS trades,(SELECT count(*)::int FROM quotes) AS quotes'
    )
  ).rows[0];
  const preserved: any[] = [];
  for (const f of ACTIVE_SECRET_FIELDS.filter(f => !f.numericId))
    for (const r of (await pool.query(`SELECT id,token FROM ${f.table}`)).rows)
      preserved.push({ ...r, table: f.table });
  console.log('R5_PROOF_SEEDING_FIXTURE');
  const merchant = (
    await pool.query(
      "INSERT INTO merchants(name,business_name,email,status,bank_name,bank_branch,account_holder_name,bank_account_number,windcave_api_key) VALUES('R5 proof','R5 proof',$1,'active','synthetic bank','synthetic branch','synthetic holder','synthetic account','synthetic unused credential') RETURNING id",
      [`${randomUUID()}@synthetic.test`]
    )
  ).rows[0].id;
  const tenant = (
    await pool.query(
      "INSERT INTO tenant_profiles(merchant_id,first_name,last_name,property_address,email) VALUES($1,'R5','Fixture','synthetic','payer@synthetic.test') RETURNING id",
      [merchant]
    )
  ).rows[0].id;
  const clientId = (
    await pool.query(
      "INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address,email) VALUES($1,'R5','Fixture','synthetic','payer@synthetic.test') RETURNING id",
      [merchant]
    )
  ).rows[0].id;
  const sub = (
    await pool.query(
      "INSERT INTO merchant_subscriptions(merchant_id,plan_id,status,price_cents,windcave_card_id,current_period_start,current_period_end,next_billing_date,last_billing_date) VALUES($1,'solo','active',799,'synthetic original card',$2::timestamp,$3::timestamp,$3::timestamp,($2::timestamp)::text) RETURNING id",
      [merchant, new Date(now.getTime() - 31 * 86400000), now]
    )
  ).rows[0].id;
  const fixtureCard = 'synthetic original card';
  const bin =
    '/workspace/.onboarding/r3-postgres/root/usr/lib/postgresql/17/bin';
  const pgEnv = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(url.password),
    PGHOST: url.hostname,
    PGPORT: url.port,
    PGUSER: decodeURIComponent(url.username),
  };
  async function capture(path: string) {
    await writeFile(path, '', { mode: 0o600, flag: 'wx' });
    const result = spawnSync(
      `${bin}/pg_dump`,
      ['--format=custom', '--file', path, database],
      { env: pgEnv, stdio: 'pipe' }
    );
    assert.equal(result.status, 0);
    await chmod(path, 0o600);
  }
  async function restoreSnapshot(name: string, path: string) {
    if (!/^r5_proof_[a-f0-9]{12}_(restore|old_restore)$/.test(name))
      throw Error('owned snapshot target required');
    const adminUrl = new URL(testDatabaseUrl);
    adminUrl.pathname = '/postgres';
    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${name}`);
    } finally {
      await admin.end();
    }
    const result = spawnSync(
      `${bin}/pg_restore`,
      ['--exit-on-error', '--dbname', name, path],
      { env: pgEnv, stdio: 'pipe' }
    );
    assert.equal(result.status, 0);
  }
  const olderDump = `/tmp/taptpay-r5/${database}-old-key.dump`;
  async function finish(
    workflow: EncryptionWorkflow | ActiveSecretWorkflow,
    id: string,
    mode: 'backfill' | 'rotate' = 'backfill'
  ) {
    await workflow.openRun(id, mode);
    for (let n = 0; n < 1500; n++) {
      const b = await workflow.batch(id, 100);
      if (
        b.state === 'verified' ||
        (b.exhausted && (await workflow.verifyRun(id)))
      )
        return;
    }
    throw Error('R5_BATCH_LIMIT');
  }
  try {
    await check(
      'new and restored schemas have immutable migration checksums and expected fixture counts',
      async () => {
        assert.deepEqual(
          initialCounts,
          sourceUrl.pathname.endsWith('restore')
            ? { property: 1000, trades: 1000, quotes: 1000 }
            : { property: 0, trades: 0, quotes: 0 }
        );
        const rows = (
          await pool.query(
            "SELECT filename,checksum FROM drizzle.applied_migrations WHERE filename LIKE '0048%' ORDER BY filename"
          )
        ).rows;
        assert.deepEqual(rows, [
          {
            filename: '0048a_data_encryption_workflows.sql',
            checksum:
              '8319ec9760ae5d91c1b7339e988e6772f3f6925aebe2065ebfbf71407ce837ce',
          },
          {
            filename: '0048b_active_secret_vault.sql',
            checksum:
              '998e38c5606ea606fdc01712adcace451781668ad652e77e6a06c3dda99ddd37',
          },
          {
            filename: '0048c_invoice_email_constraint_canonical.sql',
            checksum:
              '6898e300826d17195f2934c2ece780f0093636d40fdff7dc3b9fae34dbeec462',
          },
        ]);
      }
    );
    await check(
      'baseline refuses the old constraint form even when its name exists',
      async () => {
        const c = await pool.connect();
        try {
          assert.deepEqual(
            await findMissingBaselineEffects(c, [
              '0048c_invoice_email_constraint_canonical.sql',
            ]),
            []
          );
          await c.query('BEGIN');
          await c.query(
            'ALTER TABLE invoice_payment_attempts DROP CONSTRAINT invoice_attempt_payer_email_check'
          );
          await c.query(
            "ALTER TABLE invoice_payment_attempts ADD CONSTRAINT invoice_attempt_payer_email_check CHECK (payer_email IS NULL OR (length(payer_email) BETWEEN 3 AND 254 AND position('@' in payer_email)>1))"
          );
          assert.equal(
            (
              await findMissingBaselineEffects(c, [
                '0048c_invoice_email_constraint_canonical.sql',
              ])
            ).length,
            1
          );
        } finally {
          await c.query('ROLLBACK');
          c.release();
        }
      }
    );
    await check(
      'real operator defaults to read-only active inspection and refuses ambiguous confirmations',
      async () => {
        const flags = [
          `--expected-host=${target.host}`,
          `--expected-port=${target.port}`,
          `--expected-database=${database}`,
          '--scope=active',
        ];
        const before = (
          await pool.query('SELECT * FROM data_encryption_control')
        ).rows;
        const result = await runEncryptionOperator(flags, {
          ...env,
          R5_WORKFLOW_DATABASE_URL: url.toString(),
        });
        assert.equal(result.exitCode, 0);
        assert.equal(result.report.mutationExecuted, false);
        assert.deepEqual(
          (await pool.query('SELECT * FROM data_encryption_control')).rows,
          before
        );
        assert.equal(
          (
            await pool.query(
              'SELECT count(*)::int AS n FROM data_encryption_runs'
            )
          ).rows[0].n,
          0
        );
        await assert.rejects(
          runEncryptionOperator(
            [
              ...flags,
              '--execute=true',
              '--action=activate-writes',
              '--confirm-database=wrong',
            ],
            { ...env, R5_WORKFLOW_DATABASE_URL: url.toString() }
          )
        );
      }
    );
    await check(
      'policy activation fences a waiting plaintext bank writer while unrelated profile edits proceed',
      async () => {
        const lock = await pool.connect(),
          waiter = await pool.connect();
        try {
          await lock.query('BEGIN');
          await lock.query(
            'SELECT id FROM data_encryption_control WHERE id=1 FOR UPDATE'
          );
          let settled = false;
          const pending = waiter
            .query(
              "UPDATE merchants SET bank_name='synthetic stale writer' WHERE id=$1",
              [merchant]
            )
            .then(
              () => {
                settled = true;
                return false;
              },
              () => {
                settled = true;
                return true;
              }
            );
          // Wait for actual PostgreSQL lock evidence, not a timing assumption.
          let waiting = false;
          for (let i = 0; i < 100; i++) {
            const r = (
              await pool.query(
                "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'"
              )
            ).rows[0];
            if (r.n > 0) {
              waiting = true;
              break;
            }
            await new Promise(r => setTimeout(r, 10));
          }
          assert.ok(waiting);
          assert.equal(settled, false);
          // Another merchant avoids the waiter's existing row lock.
          const other = (
            await pool.query(
              "INSERT INTO merchants(name,business_name,email) VALUES('R5 other','R5 other',$1) RETURNING id",
              [`${randomUUID()}@synthetic.test`]
            )
          ).rows[0].id;
          await pool.query(
            "UPDATE merchants SET business_name='R5 profile updated' WHERE id=$1",
            [other]
          );
          await lock.query(
            "UPDATE data_encryption_control SET stage='encrypted-write',writer_fingerprint=$1,credential_policy=$2,credential_review_reference=$3,credential_delete_after=$4 WHERE id=1",
            [
              encryption.writerFingerprint(),
              decision.policy,
              decision.reviewReference,
              decision.deleteAfter ?? null,
            ]
          );
          await lock.query('COMMIT');
          assert.equal(await pending, true);
        } finally {
          await lock.query('ROLLBACK');
          lock.release();
          waiter.release();
        }
      }
    );
    await check(
      'bank activation and active activation authenticate the supplied keyring',
      async () => {
        await bank.activate('encrypted-write', undefined, decision);
        await active.activate('encrypted-write');
      }
    );
    await check(
      'row-ID-first merchant insert and password/owner creation are atomic on encryption failure',
      async () => {
        const record = await storage.createMerchant({
          name: 'R5 encrypted',
          businessName: 'R5 encrypted',
          email: `${randomUUID()}@synthetic.test`,
          bankName: 'synthetic sealed bank',
        } as any);
        assert.equal(
          encryption.read(record.bankName, {
            schema: 'public',
            table: 'merchants',
            column: 'bank_name',
            rowId: record.id,
          }),
          'synthetic sealed bank'
        );
        const badEmail = `${randomUUID()}@synthetic.test`;
        await assert.rejects(
          storage.createMerchantWithPassword(
            {
              name: 'R5 invalid',
              businessName: 'R5 invalid',
              email: badEmail,
              bankName: 'enc:invalid',
            },
            'synthetic-hash'
          )
        );
        assert.equal(
          (
            await pool.query(
              'SELECT count(*)::int AS n FROM merchants WHERE email=$1',
              [badEmail]
            )
          ).rows[0].n,
          0
        );
        const ownerEmail = `${randomUUID()}@synthetic.test`;
        const owner = await storage.createMerchantWithPassword(
          {
            name: 'R5 owner',
            businessName: 'R5 owner',
            email: ownerEmail,
            bankAccountNumber: 'synthetic account',
          },
          'synthetic-hash'
        );
        assert.ok(
          (
            await pool.query(
              "SELECT 1 FROM users WHERE merchant_id=$1 AND role='owner'",
              [owner.id]
            )
          ).rows.length === 1
        );
        assert.equal(
          encryption.read(owner.bankAccountNumber, {
            schema: 'public',
            table: 'merchants',
            column: 'bank_account_number',
            rowId: owner.id,
          }),
          'synthetic account'
        );
      }
    );
    const bankRun = randomUUID();
    await bank.openRun(bankRun, 'backfill');
    await check(
      'locked lower bank row stays pending and is reached after a checkpoint sweep',
      async () => {
        const lock = await pool.connect();
        try {
          await lock.query('BEGIN');
          await lock.query('SELECT id FROM merchants WHERE id=$1 FOR UPDATE', [
            merchant,
          ]);
          await bank.batch(bankRun, 100);
          assert.equal(await bank.verifyRun(bankRun), false);
        } finally {
          await lock.query('ROLLBACK');
          lock.release();
        }
        await storage.updateMerchantBankAccount(merchant, {
          bankBranch: 'synthetic concurrent branch',
        } as any);
        await finish(bank, bankRun);
      }
    );
    await check(
      'bank backfill preserves all originals and applies the explicit credential test policy',
      async () => {
        const r = (
          await pool.query('SELECT * FROM merchants WHERE id=$1', [merchant])
        ).rows[0];
        for (const [column, raw] of LEGACY_BANK_COLUMNS.map(
          (c, i) =>
            [
              c,
              [
                'synthetic bank',
                'synthetic concurrent branch',
                'synthetic holder',
                'synthetic account',
              ][i],
            ] as const
        ))
          assert.equal(
            encryption.read(r[column], {
              schema: 'public',
              table: 'merchants',
              column,
              rowId: merchant,
            }),
            raw
          );
        if (decision.policy === 'delete')
          assert.equal(r.windcave_api_key, null);
        else
          assert.equal(
            encryption.read(r.windcave_api_key, {
              schema: 'public',
              table: 'merchants',
              column: 'windcave_api_key',
              rowId: merchant,
            }),
            'synthetic unused credential'
          );
        await assert.rejects(
          pool.query(
            "UPDATE merchants SET windcave_api_key='synthetic resurrection' WHERE id=$1",
            [merchant]
          )
        );
        const report = await bank.inspect(decision.policy);
        assert.equal(report.safeToBackfill, true);
        assert.ok(Object.values(report.fields).every(c => c.plaintext === 0));
      }
    );
    const activeRun = randomUUID();
    await active.openRun(activeRun, 'backfill');
    await check(
      'active batch audit failure rolls back physical data and checkpoint together',
      async () => {
        const before = (
          await pool.query(
            'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
            [sub]
          )
        ).rows[0].windcave_card_id;
        const checkpoint = await active.progress(activeRun);
        await pool.query(
          "CREATE FUNCTION r5_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$"
        );
        await pool.query(
          'CREATE TRIGGER r5_test_audit_failure BEFORE INSERT ON data_encryption_batches FOR EACH ROW EXECUTE FUNCTION r5_test_audit_failure()'
        );
        try {
          await assert.rejects(active.batch(activeRun, 100));
          assert.equal(
            (
              await pool.query(
                'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
                [sub]
              )
            ).rows[0].windcave_card_id,
            before
          );
          assert.deepEqual(await active.progress(activeRun), checkpoint);
        } finally {
          await pool.query(
            'DROP TRIGGER r5_test_audit_failure ON data_encryption_batches'
          );
          await pool.query('DROP FUNCTION r5_test_audit_failure()');
        }
      }
    );
    await check(
      'same-run workers cannot double-advance; interrupted active run resumes across a fresh service',
      async () => {
        const lock = await pool.connect();
        try {
          await lock.query('BEGIN');
          await lock.query(
            'SELECT id FROM data_encryption_runs WHERE id=$1 FOR UPDATE',
            [activeRun]
          );
          await assert.rejects(active.batch(activeRun, 10));
        } finally {
          await lock.query('ROLLBACK');
          lock.release();
        }
        const lower = await pool.connect();
        try {
          await lower.query('BEGIN');
          await lower.query(
            'SELECT id FROM merchant_subscriptions WHERE id=$1 FOR UPDATE',
            [sub]
          );
          for (let n = 0; n < 200; n++) {
            const b = await active.batch(activeRun, 100);
            if (b.exhausted) break;
          }
          assert.equal(await active.verifyRun(activeRun), false);
        } finally {
          await lower.query('ROLLBACK');
          lower.release();
        }
        await finish(
          new ActiveSecretWorkflow(pool, target, encryption, readerPool),
          activeRun
        );
        const unchanged = (
          await pool.query(
            'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
            [sub]
          )
        ).rows[0].windcave_card_id;
        assert.equal((await active.batch(activeRun)).state, 'verified');
        assert.equal(
          (
            await pool.query(
              'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
              [sub]
            )
          ).rows[0].windcave_card_id,
          unchanged
        );
      }
    );
    await check(
      'all 3,000 restored links preserve original lookup hashes and returned capabilities',
      async () => {
        for (const entry of preserved) {
          const r = (
            await pool.query(
              `SELECT token,token_hash FROM ${entry.table} WHERE id=$1`,
              [entry.id]
            )
          ).rows[0];
          assert.equal(
            openActiveSecret(entry.table, entry.id, r.token, encryption),
            entry.token
          );
          assert.equal(r.token_hash, hash(entry.token));
        }
        assert.equal(
          openActiveSecret(
            'merchant_subscriptions',
            sub,
            (
              await pool.query(
                'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
                [sub]
              )
            ).rows[0].windcave_card_id,
            encryption
          ),
          fixtureCard
        );
        const report = await active.inspect();
        assert.equal(report.safeToBackfill, true);
        assert.ok(Object.values(report.fields).every(c => c.plaintext === 0));
        assert.equal(report.missingLookupHashes, 0);
      }
    );
    const created: any[] = [];
    await check(
      'encrypted rent/job/quote create, full/split lookups and delivery snapshots expose original URLs',
      async () => {
        const rent = await storage.createInvoiceRentRequest({
          merchantId: merchant,
          tenantProfileId: tenant,
          amountCents: 1200,
          token: `rent-${randomUUID()}`,
          deliveryChannel: 'email',
          dueAt: now,
          splitEnabled: true,
        });
        const job = await storage.createJobInvoice({
          merchantId: merchant,
          clientProfileId: clientId,
          amountCents: 1200,
          token: `job-${randomUUID()}`,
          deliveryChannel: 'email',
          dueAt: now,
          splitEnabled: true,
        });
        const quote = await storage.createQuoteForMerchant(
          merchant,
          { clientProfileId: clientId },
          {
            lineItems: [
              {
                description: 'synthetic',
                qty: 1,
                unitPriceCents: 1200,
                lineTotalCents: 1200,
              },
            ],
            subtotalCents: 1200,
            gstCents: 0,
            totalCents: 1200,
            deliveryChannel: 'email',
          } as any
        );
        assert.equal(quote.kind, 'ok');
        if (quote.kind !== 'ok') throw Error('fixture');
        created.push(
          { table: 'invoices_rent_requests', row: rent },
          { table: 'job_invoices', row: job },
          { table: 'quotes', row: quote.quote }
        );
        for (const { table, row } of created) {
          assert.ok(!row.token.startsWith('enc:'));
          const stored = (
            await pool.query(
              `SELECT token,token_hash FROM ${table} WHERE id=$1`,
              [row.id]
            )
          ).rows[0];
          assert.ok(stored.token.startsWith('enc:'));
          assert.equal(stored.token_hash, hash(row.token));
        }
        assert.equal(
          (await storage.getInvoiceRentRequestByToken(rent.token)).token,
          rent.token
        );
        assert.equal(
          (await storage.getJobInvoiceByToken(job.token)).token,
          job.token
        );
        assert.equal(
          (await storage.getQuoteByToken(quote.quote.token)).token,
          quote.quote.token
        );
        assert.equal(
          (
            await storage.getInvoiceRentRequestDeliveryForMerchant(
              rent.id,
              merchant
            )
          )?.invoice.token,
          rent.token
        );
        assert.equal(
          (await storage.getJobInvoiceDeliveryForMerchant(job.id, merchant))
            ?.invoice.token,
          job.token
        );
        assert.equal(
          (await storage.getQuoteDeliveryForMerchant(quote.quote.id, merchant))
            ?.quote.token,
          quote.quote.token
        );
        assert.equal(
          (
            await storage.updateJobInvoice(job.id, {
              jobDetails: 'synthetic metadata',
            })
          ).token,
          job.token
        );
        await assert.rejects(
          storage.updateJobInvoice(job.id, { token: 'enc:invalid' })
        );
      }
    );
    await check(
      'creation-command replay returns the same decoded links for rent and job invoices',
      async () => {
        const intent = {
          key: randomUUID(),
          actor: { service: 'internal' as const },
        };
        const data = {
          kind: 'charge' as const,
          chargeType: 'other',
          description: 'synthetic',
          amountCents: 500,
          deliveryChannel: 'email',
          dueAt: now,
        };
        const a = await storage.createOrReuseInvoiceRentRequestForMerchant(
            tenant,
            merchant,
            data,
            intent
          ),
          b = await storage.createOrReuseInvoiceRentRequestForMerchant(
            tenant,
            merchant,
            data,
            intent
          );
        assert.equal(a.kind, 'ok');
        assert.equal(b.kind, 'ok');
        if (a.kind === 'ok' && b.kind === 'ok') {
          assert.equal(a.invoice.token, b.invoice.token);
          assert.ok(!b.invoice.token.startsWith('enc:'));
        }
        const jobIntent = {
            key: randomUUID(),
            actor: { service: 'internal' as const },
          },
          jobData = {
            kind: 'full' as const,
            amountCents: 500,
            deliveryChannel: 'email',
            dueAt: now,
          };
        const c = await storage.createJobInvoiceForMerchant(
            merchant,
            { clientProfileId: clientId },
            jobData,
            jobIntent
          ),
          d = await storage.createJobInvoiceForMerchant(
            merchant,
            { clientProfileId: clientId },
            jobData,
            jobIntent
          );
        assert.equal(c.kind, 'ok');
        assert.equal(d.kind, 'ok');
        if (c.kind === 'ok' && d.kind === 'ok')
          assert.equal(c.invoice.token, d.invoice.token);
      }
    );
    let sends = 0,
      queries = 0,
      billingId: string | undefined;
    const transactionId = `tx-${randomUUID()}`;
    const provider = {
      purchase: async (
        expected: any,
        persist: (id: string) => Promise<void>
      ) => {
        sends++;
        assert.equal(expected.cardId, fixtureCard);
        await persist(transactionId);
        return { success: false, windcaveTransactionId: transactionId };
      },
      query: async () => {
        queries++;
        return {
          success: true,
          approved: true,
          windcaveTransactionId: transactionId,
        };
      },
    };
    await check(
      'stored-card billing sends the decoded credential and retains original digest on unknown response',
      async () => {
        const card = (
          await pool.query(
            'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
            [sub]
          )
        ).rows[0].windcave_card_id;
        const service = new DurableSubscriptionBilling(
          pool,
          provider,
          providerContext,
          clock,
          () => true,
          encryption
        );
        const result = await service.charge({
          subscriptionId: sub,
          merchantId: merchant,
          kind: 'renewal',
          cardId: card,
          amountCents: 799,
          planId: 'solo',
          idempotencyKey: `synthetic-${randomUUID()}`,
          reference: `synthetic-${randomUUID()}`,
        });
        assert.equal(result.kind, 'processing');
        billingId = result.attemptId;
        assert.equal(
          (
            await pool.query(
              'SELECT card_digest FROM subscription_billing_attempts WHERE id=$1',
              [billingId]
            )
          ).rows[0].card_digest,
          hash(fixtureCard)
        );
        assert.equal(sends, 1);
      }
    );
    await check(
      'global key activation refuses missing old keys and rotation authenticates every protected scope',
      async () => {
        await capture(olderDump);
        const wrong = loadDataEncryption({
          ...env,
          DATA_ENCRYPTION_ACTIVE_KEY_ID: 'second',
          DATA_ENCRYPTION_KEYRING: JSON.stringify([keys[1]]),
        });
        await assert.rejects(
          new EncryptionWorkflow(pool, target, wrong, readerPool).activate(
            'encrypted-write'
          )
        );
        const rb = new EncryptionWorkflow(pool, target, rotated, readerPool),
          ra = new ActiveSecretWorkflow(pool, target, rotated, readerPool);
        await rb.activate('encrypted-write');
        await ra.activate('encrypted-write');
        await finish(rb, randomUUID(), 'rotate');
        await finish(ra, randomUUID(), 'rotate');
        assert.ok(
          Object.values((await rb.inspect(decision.policy)).fields).every(
            c => c.encryptedOldKey === 0
          )
        );
        assert.ok(
          Object.values((await ra.inspect()).fields).every(
            c => c.encryptedOldKey === 0
          )
        );
        assert.equal(
          (
            await pool.query(
              'SELECT card_digest FROM subscription_billing_attempts WHERE id=$1',
              [billingId]
            )
          ).rows[0].card_digest,
          hash(fixtureCard)
        );
      }
    );
    await check(
      'pending stored-card purchase recovers through GET without requiring a retained card key',
      async () => {
        await pool.query(
          'UPDATE merchant_subscriptions SET windcave_card_id=NULL WHERE id=$1',
          [sub]
        );
        now = new Date(now.getTime() + 61000);
        const unavailableReader = loadDataEncryption({
          ...env,
          DATA_ENCRYPTION_ACTIVE_KEY_ID: 'first',
          DATA_ENCRYPTION_KEYRING: JSON.stringify([keys[0]]),
        });
        await new DurableSubscriptionBilling(
          pool,
          provider,
          providerContext,
          clock,
          () => true,
          unavailableReader
        ).reconcileDue();
        assert.equal(sends, 1);
        assert.ok(queries >= 1);
        assert.equal(
          (
            await pool.query(
              'SELECT state FROM subscription_billing_attempts WHERE id=$1',
              [billingId]
            )
          ).rows[0].state,
          'approved'
        );
        assert.equal(
          (
            await pool.query(
              'SELECT count(*)::int AS n FROM subscription_billing_history WHERE subscription_id=$1',
              [sub]
            )
          ).rows[0].n,
          1
        );
      }
    );
    await check(
      'card setup callback seals the new credential and activation/status still use its original digest',
      async () => {
        const billing = new DurableSubscriptionBilling(
          pool,
          {
            purchase: async () => ({
              success: true,
              approved: true,
              windcaveTransactionId: `charge-${randomUUID()}`,
            }),
            query: async () => ({ success: false }),
          },
          providerContext,
          clock,
          () => true,
          rotated
        );
        const inbox = new DurablePaymentStorage(pool),
          sessionId = `card-${randomUUID()}`;
        const card = new DurableSubscriptionCard(
          pool,
          inbox,
          {
            create: async () => ({
              sessionId,
              redirectUrl: 'https://uat.windcave.com/synthetic',
            }),
            query: async () => ({
              kind: 'approved' as const,
              transactionId: `verify-${randomUUID()}`,
              card: {
                cardId: 'synthetic new card',
                brand: 'Visa',
                last4: '1234',
                expiry: '12/40',
              },
            }),
            hostedPage: async () => undefined,
          },
          billing,
          providerContext,
          'synthetic-return-secret',
          clock,
          () => true,
          rotated
        );
        assert.equal(
          (
            await card.start({
              subscriptionId: sub,
              merchantId: merchant,
              idempotencyKey: randomUUID(),
              email: 'owner@synthetic.test',
              baseUrl: 'https://harness.test',
              actor: { service: 'internal' },
            })
          ).kind,
          'ready'
        );
        const runtime = new PaymentRuntime(
          inbox,
          {
            query: async () => {
              throw Error('incorrect finalizer');
            },
          },
          clock,
          claim => card.processReceipt(claim)
        );
        await runtime.reconcile(sessionId, 'poll');
        const stored = (
          await pool.query(
            'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
            [sub]
          )
        ).rows[0].windcave_card_id;
        assert.ok(stored.startsWith('enc:v1:second:'));
        assert.equal(
          openActiveSecret('merchant_subscriptions', sub, stored, rotated),
          'synthetic new card'
        );
        assert.ok(await card.status(merchant, sessionId));
      }
    );
    await check(
      'wrong context, tampering and corrupt stored lookup hashes stop scans and never overwrite values',
      async () => {
        const { table, row } = created[0],
          original = (
            await pool.query(`SELECT token FROM ${table} WHERE id=$1`, [row.id])
          ).rows[0].token;
        assert.throws(() =>
          openActiveSecret(table, randomUUID(), original, rotated)
        );
        const swapped = rotated.encrypt('synthetic bad context', {
          schema: 'public',
          table,
          column: 'token',
          rowId: randomUUID(),
        });
        await pool.query(`UPDATE ${table} SET token=$1 WHERE id=$2`, [
          swapped,
          row.id,
        ]);
        const ra = new ActiveSecretWorkflow(pool, target, rotated, readerPool);
        assert.equal((await ra.inspect()).safeToBackfill, false);
        await assert.rejects(ra.openRun(randomUUID(), 'rotate'));
        assert.equal(
          (await pool.query(`SELECT token FROM ${table} WHERE id=$1`, [row.id]))
            .rows[0].token,
          swapped
        );
        await pool.query(`UPDATE ${table} SET token=$1 WHERE id=$2`, [
          original,
          row.id,
        ]);
        await pool.query(`UPDATE ${table} SET token_hash=$1 WHERE id=$2`, [
          '0'.repeat(64),
          row.id,
        ]);
        assert.equal((await ra.inspect()).safeToBackfill, false);
        await pool.query(`UPDATE ${table} SET token_hash=$1 WHERE id=$2`, [
          hash(row.token),
          row.id,
        ]);
      }
    );
    await check(
      'contract requires zero plaintext, review hashes, and refuses downgrade/stale writes',
      async () => {
        const cb = new EncryptionWorkflow(pool, target, contract, readerPool),
          ca = new ActiveSecretWorkflow(pool, target, contract, readerPool);
        await assert.rejects(
          cb.activate('contract', hash('synthetic contract'))
        );
        await ca.activate('contract', hash('synthetic active review'));
        await cb.activate('contract', hash('synthetic bank review'));
        await assert.rejects(
          pool.query(
            "UPDATE data_encryption_control SET stage='legacy',writer_fingerprint=NULL"
          )
        );
        await assert.rejects(
          pool.query(
            "UPDATE data_encryption_control SET active_secret_stage='encrypted-write'"
          )
        );
        await assert.rejects(
          pool.query('UPDATE data_encryption_control SET review_reference=NULL')
        );
        await assert.rejects(
          pool.query(
            "UPDATE merchants SET bank_name='synthetic plaintext' WHERE id=$1",
            [merchant]
          )
        );
        await assert.rejects(
          pool.query(
            "UPDATE merchant_subscriptions SET windcave_card_id='synthetic plaintext' WHERE id=$1",
            [sub]
          )
        );
      }
    );
    await check(
      'encrypted dump restores schema, checkpoints and all values with keys kept outside the snapshot',
      async () => {
        const snapshotClient = await pool.connect();
        let before: any;
        try {
          before = buildFingerprint(await collectSchema(snapshotClient));
        } finally {
          snapshotClient.release();
        }
        const dump = `/tmp/taptpay-r5/${database}.dump`;
        await capture(dump);
        await restoreSnapshot(restored, dump);
        const restoreUrl = new URL(url);
        restoreUrl.pathname = `/${restored}`;
        const c = new pg.Client({ connectionString: restoreUrl.toString() });
        await c.connect();
        try {
          const after = buildFingerprint(await collectSchema(c));
          console.log(
            'R5_SNAPSHOT_SCHEMA_EQUAL',
            JSON.stringify(after) === JSON.stringify(before)
          );
          assert.deepEqual(after, before);
          for (const f of ACTIVE_SECRET_FIELDS)
            for (const r of (
              await c.query(`SELECT id,${f.column} AS secret FROM ${f.table}`)
            ).rows) {
              if (r.secret !== null) {
                assert.equal(
                  rotated.classify(r.secret, {
                    schema: 'public',
                    table: f.table,
                    column: f.column,
                    rowId: r.id,
                  }),
                  'encryptedActiveKey'
                );
              }
            }
          for (const entry of preserved) {
            const r = (
              await c.query(`SELECT token FROM ${entry.table} WHERE id=$1`, [
                entry.id,
              ])
            ).rows[0];
            assert.equal(
              openActiveSecret(entry.table, entry.id, r.token, rotated),
              entry.token
            );
          }
          const badKeys = loadDataEncryption({
            ...env,
            DATA_ENCRYPTION_ACTIVE_KEY_ID: 'first',
            DATA_ENCRYPTION_KEYRING: JSON.stringify([keys[0]]),
          });
          const restoredCard = (
            await c.query(
              'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
              [sub]
            )
          ).rows[0].windcave_card_id;
          assert.throws(() =>
            openActiveSecret(
              'merchant_subscriptions',
              sub,
              restoredCard,
              badKeys
            )
          );
          for (const r of (
            await c.query(
              'SELECT id,bank_name,bank_branch,account_holder_name,bank_account_number FROM merchants'
            )
          ).rows)
            for (const column of LEGACY_BANK_COLUMNS)
              if (r[column] !== null)
                assert.equal(
                  rotated.classify(r[column], {
                    schema: 'public',
                    table: 'merchants',
                    column,
                    rowId: r.id,
                  }),
                  'encryptedActiveKey'
                );
          assert.equal(
            (await c.query('SELECT stage FROM data_encryption_control')).rows[0]
              .stage,
            'contract'
          );
          assert.ok(
            (
              await c.query(
                "SELECT 1 FROM data_encryption_runs WHERE state='verified'"
              )
            ).rows.length >= 4
          );
          const counts = (
            await c.query(
              'SELECT (SELECT count(*)::int FROM invoices_rent_requests) AS property,(SELECT count(*)::int FROM job_invoices) AS trades,(SELECT count(*)::int FROM quotes) AS quotes'
            )
          ).rows[0];
          assert.ok(
            counts.property >= initialCounts.property &&
              counts.trades >= initialCounts.trades &&
              counts.quotes >= initialCounts.quotes
          );
        } finally {
          await c.end();
        }
      }
    );
    await check(
      'older encrypted backup remains readable only while its historical key is retained',
      async () => {
        const oldName = `${database}_old_restore`;
        await restoreSnapshot(oldName, olderDump);
        const oldUrl = new URL(url);
        oldUrl.pathname = `/${oldName}`;
        const c = new pg.Client({ connectionString: oldUrl.toString() });
        await c.connect();
        try {
          const oldCard = (
            await c.query(
              'SELECT windcave_card_id FROM merchant_subscriptions WHERE id=$1',
              [sub]
            )
          ).rows[0].windcave_card_id;
          assert.equal(
            openActiveSecret('merchant_subscriptions', sub, oldCard, rotated),
            fixtureCard
          );
          const missingOld = loadDataEncryption({
            ...env,
            DATA_ENCRYPTION_ACTIVE_KEY_ID: 'second',
            DATA_ENCRYPTION_KEYRING: JSON.stringify([keys[1]]),
          });
          assert.throws(() =>
            openActiveSecret('merchant_subscriptions', sub, oldCard, missingOld)
          );
          for (const entry of preserved) {
            const r = (
              await c.query(`SELECT token FROM ${entry.table} WHERE id=$1`, [
                entry.id,
              ])
            ).rows[0];
            assert.equal(
              openActiveSecret(entry.table, entry.id, r.token, rotated),
              entry.token
            );
          }
        } finally {
          await c.end();
        }
      }
    );
    const original = new pg.Client({ connectionString: testDatabaseUrl });
    await original.connect();
    try {
      assert.deepEqual(
        (
          await original.query(
            'SELECT stage,active_secret_stage,credential_policy FROM data_encryption_control'
          )
        ).rows[0],
        {
          stage: 'legacy',
          active_secret_stage: 'legacy',
          credential_policy: 'unselected',
        }
      );
      assert.deepEqual(
        (
          await original.query(
            'SELECT (SELECT count(*)::int FROM invoices_rent_requests) AS property,(SELECT count(*)::int FROM job_invoices) AS trades,(SELECT count(*)::int FROM quotes) AS quotes'
          )
        ).rows[0],
        initialCounts
      );
    } finally {
      await original.end();
    }
    const receipt = {
      checks: passed,
      credentialPolicyTested: policyChoice,
      initialFixtureCounts: initialCounts,
      liveProviderCalls: 0,
      sourceUnchanged: true,
      encryptedSnapshotRestore: true,
    };
    await writeFile(
      `/tmp/taptpay-r5/${policyChoice}-workflow-receipt.json`,
      JSON.stringify(receipt, null, 2)
    );
    console.log(JSON.stringify(receipt));
  } finally {
    await Promise.all([pool.end(), readerPool.end()]);
  }
}
try {
  await verify();
} catch (error) {
  const code = (error as any)?.code;
  console.error(
    'R5_WORKFLOW_POSTGRES_VERIFICATION_FAILED',
    typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)
      ? code
      : 'fixed-boundary'
  );
  process.exitCode = 1;
}
