import { createHash, randomUUID } from 'node:crypto';
import { ACTIVE_SECRET_FIELDS } from './active-secret-vault';
import {
  DataEncryption,
  MAX_ENCRYPTED_ENVELOPE_LENGTH,
  type EncryptionBucket,
} from './data-encryption';
import {
  countLegacyBankData,
  type CredentialPolicy,
  type EncryptionCounts,
  type PreflightClient,
  type PreflightTarget,
  MAX_PREFLIGHT_BATCH_SIZE,
} from './encryption-preflight';
import type {
  EncryptionRunMode,
  EncryptionWorkflowClient,
  EncryptionWorkflowPool,
} from './encryption-workflow';

type Field = (typeof ACTIVE_SECRET_FIELDS)[number];
const buckets: EncryptionBucket[] = [
  'null',
  'plaintext',
  'encryptedActiveKey',
  'encryptedOldKey',
  'unknownKey',
  'malformedEnvelope',
  'authenticationFailure',
  'unsupportedVersion',
  'invalidValue',
];
const safeBuckets = [
  'null',
  'plaintext',
  'encryptedActiveKey',
  'encryptedOldKey',
];
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code: string): never => {
  throw Error(code);
};
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const context = (field: Field, id: number | string) =>
  ({
    schema: 'public',
    table: field.table,
    column: field.column,
    rowId: id,
  }) as const;
const validId = (field: Field, id: unknown) =>
  field.numericId
    ? Number.isSafeInteger(id) && Number(id) > 0
    : typeof id === 'string' && uuid.test(id);

// Identifiers are exclusively the immutable module allowlist. PostgreSQL bounds
// stored text before it can reach the client; no values are returned in reports.
function pageQuery(field: Field) {
  return `SELECT id,xmin::text AS encryption_row_version,
    CASE WHEN octet_length(${field.column})>${MAX_ENCRYPTED_ENVELOPE_LENGTH} THEN NULL ELSE ${field.column} END AS secret,
    (octet_length(${field.column})>${MAX_ENCRYPTED_ENVELOPE_LENGTH}) AS oversized${field.numericId ? '' : ',token_hash'}
    FROM public.${field.table} WHERE ($1::${field.numericId ? 'integer' : 'uuid'} IS NULL OR id>$1::${field.numericId ? 'integer' : 'uuid'}) ORDER BY id LIMIT $2`;
}
export interface ActiveSecretReport {
  fields: Record<Field['table'], EncryptionCounts>;
  missingLookupHashes: number;
  lookupHashMismatches: number;
  safeToBackfill: boolean;
}
function rowSafety(
  row: Record<string, any>,
  field: Field,
  encryption: DataEncryption
) {
  let bucket = row.oversized
    ? 'invalidValue'
    : encryption.classify(row.secret, context(field, row.id));
  let missingHash = false,
    hashMismatch = false,
    originalHash: string | undefined;
  if (field.numericId && row.secret !== null && safeBuckets.includes(bucket)) {
    const raw =
      bucket === 'plaintext'
        ? row.secret
        : encryption.read(row.secret, context(field, row.id));
    // An empty card was previously absent. Wrapping it must not make an opaque
    // presence check true; stop and require an explicit data repair instead.
    if (typeof raw !== 'string' || raw.length < 1 || raw.length > 1000)
      bucket = 'invalidValue';
  }
  if (!field.numericId && row.secret !== null && safeBuckets.includes(bucket)) {
    // classify authenticates encrypted values; reading again obtains only the
    // in-memory capability needed to check its existing lookup hash.
    const raw =
      bucket === 'plaintext'
        ? row.secret
        : encryption.read(row.secret, context(field, row.id));
    if (typeof raw !== 'string' || raw.length < 1 || raw.length > 512)
      hashMismatch = true;
    else {
      originalHash = digest(raw);
      missingHash = row.token_hash === null;
      hashMismatch =
        (!missingHash && row.token_hash !== originalHash) ||
        (missingHash && bucket !== 'plaintext');
    }
  }
  return {
    bucket: bucket as EncryptionBucket,
    missingHash,
    hashMismatch,
    originalHash,
  };
}
export async function countActiveSecrets(
  client: PreflightClient,
  target: PreflightTarget,
  encryption: DataEncryption,
  batchSize = 25
): Promise<ActiveSecretReport> {
  if (
    encryption.describe().stage === 'legacy' ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_PREFLIGHT_BATCH_SIZE
  )
    fail('R5_ACTIVE_INVALID_ARGUMENTS');
  const report: ActiveSecretReport = {
    fields: Object.fromEntries(
      ACTIVE_SECRET_FIELDS.map(f => [
        f.table,
        Object.fromEntries(buckets.map(b => [b, 0])),
      ])
    ) as ActiveSecretReport['fields'],
    missingLookupHashes: 0,
    lookupHashMismatches: 0,
    safeToBackfill: true,
  };
  await client.query(
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
  );
  try {
    await client.query('SET LOCAL search_path=pg_catalog');
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    if (
      (await client.query('SELECT current_database() AS database')).rows[0]
        ?.database !== target.database
    )
      fail('R5_ACTIVE_TARGET_MISMATCH');
    for (const field of ACTIVE_SECRET_FIELDS) {
      let cursor: number | string | null = null;
      while (true) {
        const { rows } = await client.query(pageQuery(field), [
          cursor,
          batchSize,
        ]);
        if (rows.length > batchSize) fail('R5_ACTIVE_INVALID_PAGE');
        for (const row of rows) {
          if (!validId(field, row.id) || (cursor !== null && row.id <= cursor))
            fail('R5_ACTIVE_INVALID_PAGE');
          const state = rowSafety(row, field, encryption);
          report.fields[field.table][state.bucket]++;
          if (state.missingHash) report.missingLookupHashes++;
          if (state.hashMismatch) report.lookupHashMismatches++;
          if (!safeBuckets.includes(state.bucket) || state.hashMismatch)
            report.safeToBackfill = false;
          cursor = row.id;
        }
        if (rows.length < batchSize) break;
      }
    }
    return report;
  } finally {
    await client.query('ROLLBACK');
  }
}
const complete = (r: ActiveSecretReport, rotate = false) =>
  r.safeToBackfill &&
  r.missingLookupHashes === 0 &&
  Object.values(r.fields).every(
    c => c.plaintext === 0 && (!rotate || c.encryptedOldKey === 0)
  );
interface Control {
  stage: string;
  active_secret_stage: string;
  writer_fingerprint: string;
  credential_policy: CredentialPolicy;
  active_secret_review_reference: string | null;
}
interface Run {
  id: string;
  scope: string;
  database_name: string;
  mode: EncryptionRunMode;
  writer_fingerprint: string;
  state: 'running' | 'verified';
  table_cursor: number;
  last_record_id: string | null;
  batch_number: number;
  sweep_number: number;
  rows_scanned: string;
  rows_changed: string;
}
export class ActiveSecretWorkflow {
  constructor(
    private readonly pool: EncryptionWorkflowPool,
    private readonly target: PreflightTarget,
    private readonly encryption: DataEncryption,
    private readonly readerPool: EncryptionWorkflowPool
  ) {
    if (pool === readerPool) fail('R5_WORKFLOW_INDEPENDENT_READER_REQUIRED');
  }
  private async transaction<T>(
    operation: (c: EncryptionWorkflowClient) => Promise<T>
  ): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL search_path=pg_catalog');
      await c.query("SET LOCAL lock_timeout='2s'");
      await c.query("SET LOCAL statement_timeout='10s'");
      if (
        (await c.query('SELECT current_database() AS database')).rows[0]
          ?.database !== this.target.database
      )
        fail('R5_ACTIVE_TARGET_MISMATCH');
      const result = await operation(c);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await c.query('ROLLBACK');
      } catch {}
      throw error;
    } finally {
      c.release();
    }
  }
  async inspect() {
    const c = await this.readerPool.connect();
    try {
      return await countActiveSecrets(c, this.target, this.encryption);
    } finally {
      c.release();
    }
  }
  async activate(
    stage: 'encrypted-write' | 'contract',
    reviewReference?: string
  ) {
    if (!this.encryption.writesEncrypted())
      fail('R5_WORKFLOW_WRITER_NOT_READY');
    if (
      stage === 'contract' &&
      (!reviewReference ||
        !/^[0-9a-f]{64}$/.test(reviewReference) ||
        this.encryption.describe().stage !== 'contract')
    )
      fail('R5_WORKFLOW_REVIEW_REQUIRED');
    await this.transaction(async c => {
      const policy = (
        await c.query(
          'SELECT * FROM public.data_encryption_control WHERE id=1 FOR UPDATE'
        )
      ).rows[0] as Control;
      if (!policy || policy.stage === 'legacy')
        fail('R5_ACTIVE_BANK_WRITES_REQUIRED');
      if (policy.active_secret_stage === 'contract' && stage !== 'contract')
        fail('R5_WORKFLOW_POLICY_DOWNGRADE');
      const report = await this.inspect();
      if (!report.safeToBackfill || (stage === 'contract' && !complete(report)))
        fail('R5_WORKFLOW_UNSAFE_DATA');
      // A key-label switch is global: verify the bank scope with the same
      // supplied reader before replacing the shared writer fingerprint.
      const reader = await this.readerPool.connect();
      try {
        const bank = await countLegacyBankData(
          reader,
          this.target,
          this.target,
          this.encryption,
          25,
          policy.credential_policy
        );
        if (
          !bank.safeToBackfill ||
          (stage === 'contract' &&
            Object.values(bank.fields).some(f => f.plaintext > 0))
        )
          fail('R5_WORKFLOW_UNSAFE_DATA');
      } finally {
        reader.release();
      }
      await c.query(
        'UPDATE public.data_encryption_control SET active_secret_stage=$1,active_secret_review_reference=$2,writer_fingerprint=$3,updated_at=now() WHERE id=1',
        [
          stage,
          reviewReference ?? policy.active_secret_review_reference,
          this.encryption.writerFingerprint(),
        ]
      );
    });
  }
  private async policy(c: EncryptionWorkflowClient) {
    if (!this.encryption.writesEncrypted())
      fail('R5_WORKFLOW_WRITER_NOT_READY');
    const p = (
      await c.query(
        'SELECT * FROM public.data_encryption_control WHERE id=1 FOR SHARE'
      )
    ).rows[0] as Control;
    if (!p || p.active_secret_stage === 'legacy')
      fail('R5_WORKFLOW_WRITES_NOT_ACTIVATED');
    if (p.writer_fingerprint !== this.encryption.writerFingerprint())
      fail('R5_WORKFLOW_WRITER_CHANGED');
    return p;
  }
  private assertRun(
    r: Run | undefined,
    mode?: EncryptionRunMode
  ): asserts r is Run {
    if (
      !r ||
      r.scope !== 'active' ||
      r.database_name !== this.target.database ||
      r.writer_fingerprint !== this.encryption.writerFingerprint() ||
      (mode !== undefined && r.mode !== mode)
    )
      fail('R5_WORKFLOW_RUN_CONFLICT');
  }
  async openRun(id: string, mode: EncryptionRunMode) {
    if (!uuid.test(id) || !['backfill', 'rotate'].includes(mode))
      fail('R5_WORKFLOW_INVALID_ARGUMENTS');
    if (mode === 'backfill' && this.encryption.describe().stage === 'contract')
      fail('R5_WORKFLOW_CONTRACT_BACKFILL_REFUSED');
    await this.transaction(async c => {
      await this.policy(c);
      const existing = (
        await c.query(
          'SELECT * FROM public.data_encryption_runs WHERE id=$1 FOR UPDATE',
          [id]
        )
      ).rows[0] as Run | undefined;
      if (existing) {
        this.assertRun(existing, mode);
        return;
      }
      if (!(await this.inspect()).safeToBackfill)
        fail('R5_WORKFLOW_UNSAFE_DATA');
      await c.query(
        "INSERT INTO public.data_encryption_runs(id,scope,mode,database_name,writer_fingerprint,credential_policy) VALUES($1,'active',$2,$3,$4,'unselected') ON CONFLICT(id) DO NOTHING",
        [id, mode, this.target.database, this.encryption.writerFingerprint()]
      );
      this.assertRun(
        (
          await c.query(
            'SELECT * FROM public.data_encryption_runs WHERE id=$1 FOR UPDATE',
            [id]
          )
        ).rows[0] as Run,
        mode
      );
    });
  }
  async batch(id: string, batchSize = 25) {
    if (
      !uuid.test(id) ||
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_PREFLIGHT_BATCH_SIZE
    )
      fail('R5_WORKFLOW_INVALID_ARGUMENTS');
    return this.transaction(async c => {
      await this.policy(c);
      const run = (
        await c.query(
          'SELECT * FROM public.data_encryption_runs WHERE id=$1 FOR UPDATE NOWAIT',
          [id]
        )
      ).rows[0] as Run;
      this.assertRun(run);
      if (run.state === 'verified')
        return { exhausted: true, state: 'verified' as const };
      const started = Date.now(),
        field = ACTIVE_SECRET_FIELDS[run.table_cursor];
      if (!field) fail('R5_ACTIVE_INVALID_PAGE');
      const rows = (
        await c.query(`${pageQuery(field)} FOR UPDATE SKIP LOCKED`, [
          run.last_record_id,
          batchSize,
        ])
      ).rows;
      let changed = 0;
      for (const row of rows) {
        if (
          !validId(field, row.id) ||
          !/^[0-9]+$/.test(row.encryption_row_version)
        )
          fail('R5_ACTIVE_INVALID_PAGE');
        const safety = rowSafety(row, field, this.encryption);
        if (!safeBuckets.includes(safety.bucket) || safety.hashMismatch)
          fail('R5_WORKFLOW_UNSAFE_DATA');
        if (
          safety.bucket === 'plaintext' ||
          (run.mode === 'rotate' && safety.bucket === 'encryptedOldKey')
        ) {
          const raw =
            safety.bucket === 'plaintext'
              ? row.secret
              : this.encryption.read(row.secret, context(field, row.id));
          const sealed = this.encryption.encrypt(raw, context(field, row.id));
          const values: unknown[] = [sealed];
          let set = `${field.column}=$1`;
          if (!field.numericId) {
            values.push(safety.originalHash);
            set += ',token_hash=$2';
          }
          values.push(row.id, row.encryption_row_version);
          const updated = await c.query(
            `UPDATE public.${field.table} SET ${set} WHERE id=$${values.length - 1} AND xmin::text=$${values.length} RETURNING id`,
            values
          );
          if (updated.rows.length !== 1) fail('R5_WORKFLOW_CAS_FAILED');
          changed++;
        }
      }
      const tableEnd = rows.length === 0,
        exhausted =
          tableEnd && run.table_cursor === ACTIVE_SECRET_FIELDS.length - 1;
      const cursor = exhausted
        ? 0
        : tableEnd
          ? run.table_cursor + 1
          : run.table_cursor;
      const recordId = tableEnd ? null : String(rows[rows.length - 1].id);
      const number = run.batch_number + 1;
      await c.query(
        'INSERT INTO public.data_encryption_batches(id,run_id,batch_number,rows_scanned,rows_changed,duration_ms) VALUES($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          id,
          number,
          rows.length,
          changed,
          Math.max(0, Date.now() - started),
        ]
      );
      await c.query(
        'UPDATE public.data_encryption_runs SET table_cursor=$1,last_record_id=$2,sweep_number=sweep_number+$3,batch_number=$4,rows_scanned=rows_scanned+$5,rows_changed=rows_changed+$6,updated_at=now() WHERE id=$7',
        [cursor, recordId, exhausted ? 1 : 0, number, rows.length, changed, id]
      );
      return { exhausted, state: 'running' as const };
    });
  }
  async verifyRun(id: string) {
    if (!uuid.test(id)) fail('R5_WORKFLOW_INVALID_ARGUMENTS');
    return this.transaction(async c => {
      await this.policy(c);
      const run = (
        await c.query(
          'SELECT * FROM public.data_encryption_runs WHERE id=$1 FOR UPDATE NOWAIT',
          [id]
        )
      ).rows[0] as Run;
      this.assertRun(run);
      if (run.state === 'verified') return true;
      const report = await this.inspect();
      if (!report.safeToBackfill) fail('R5_WORKFLOW_UNSAFE_DATA');
      if (!complete(report, run.mode === 'rotate')) return false;
      await c.query(
        "UPDATE public.data_encryption_runs SET state='verified',updated_at=now() WHERE id=$1",
        [id]
      );
      return true;
    });
  }
  async progress(id: string) {
    if (!uuid.test(id)) fail('R5_WORKFLOW_INVALID_ARGUMENTS');
    return this.transaction(async c => {
      const r = (
        await c.query('SELECT * FROM public.data_encryption_runs WHERE id=$1', [
          id,
        ])
      ).rows[0] as Run;
      this.assertRun(r);
      return {
        runId: r.id,
        scope: 'active',
        mode: r.mode,
        state: r.state,
        batches: r.batch_number,
        sweeps: r.sweep_number,
        rowsScanned: r.rows_scanned,
        rowsChanged: r.rows_changed,
      };
    });
  }
}
