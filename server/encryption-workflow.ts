import { randomUUID } from 'node:crypto';
import { countActiveSecrets } from './active-secret-workflow';
import {
  DataEncryption,
  LEGACY_BANK_COLUMNS,
  LEGACY_PROTECTED_COLUMNS,
} from './data-encryption';
import {
  BANK_PAGE_QUERY,
  ENCRYPT_CREDENTIAL_PAGE_QUERY,
  DELETE_CREDENTIAL_PAGE_QUERY,
  countLegacyBankData,
  type CredentialPolicy,
  type EncryptionPreflightReport,
  type PreflightClient,
  type PreflightTarget,
  MAX_PREFLIGHT_BATCH_SIZE,
} from './encryption-preflight';

export type EncryptionRunMode = 'backfill' | 'rotate';
export interface EncryptionWorkflowClient extends PreflightClient {
  release(): void;
}
export interface EncryptionWorkflowPool {
  connect(): Promise<EncryptionWorkflowClient>;
}
interface RunRow {
  scope: 'bank' | 'active';
  id: string;
  mode: EncryptionRunMode;
  database_name: string;
  writer_fingerprint: string;
  state: 'running' | 'verified';
  last_merchant_id: number;
  sweep_number: number;
  batch_number: number;
  rows_scanned: string;
  rows_changed: string;
  credential_policy: CredentialPolicy;
  credential_review_reference: string | null;
  credential_delete_after: string | null;
}
interface ControlRow {
  active_secret_stage: string;
  stage: string;
  writer_fingerprint: string;
  review_reference: string | null;
  credential_policy: CredentialPolicy;
  credential_review_reference: string | null;
  credential_delete_after: string | null;
}
export interface CredentialDecision {
  policy: 'delete' | 'encrypt';
  reviewReference: string;
  deleteAfter?: string;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code: string): never => {
  throw new Error(code);
};
const zeroPlaintext = (report: EncryptionPreflightReport) =>
  report.safeToBackfill &&
  [
    ...Object.values(report.fields),
    ...(report.credentialEncryption ? [report.credentialEncryption] : []),
  ].every(field => field.plaintext === 0);
const controlQuery =
  'SELECT *,credential_delete_after::text AS credential_delete_after FROM public.data_encryption_control WHERE id=1';
const runQuery =
  'SELECT *,credential_delete_after::text AS credential_delete_after FROM public.data_encryption_runs WHERE id=$1';

function checkDecision(
  policy: CredentialPolicy,
  reference: string | null,
  deletion: string | null
) {
  if (!['unselected', 'delete', 'encrypt'].includes(policy))
    fail('R5_WORKFLOW_CREDENTIAL_REVIEW_REQUIRED');
  if (
    policy !== 'unselected' &&
    (!reference || !/^[0-9a-f]{64}$/.test(reference))
  )
    fail('R5_WORKFLOW_CREDENTIAL_REVIEW_REQUIRED');
  if (
    policy === 'encrypt' &&
    (!deletion ||
      !/^\d{4}-\d{2}-\d{2}$/.test(deletion) ||
      !Number.isFinite(Date.parse(deletion)) ||
      new Date(deletion).toISOString().slice(0, 10) !== deletion ||
      deletion <= new Date().toISOString().slice(0, 10))
  )
    fail('R5_WORKFLOW_CREDENTIAL_REVIEW_EXPIRED');
}

export class EncryptionWorkflow {
  constructor(
    private readonly pool: EncryptionWorkflowPool,
    private readonly target: PreflightTarget,
    private readonly encryption: DataEncryption,
    private readonly readerPool: EncryptionWorkflowPool
  ) {
    // Verification holds a writer/control lock. It must never wait for another
    // connection from the same exhausted pool while other workers do the same.
    if (pool === readerPool) fail('R5_WORKFLOW_INDEPENDENT_READER_REQUIRED');
  }

  private async transaction<T>(
    operation: (client: EncryptionWorkflowClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL search_path=pg_catalog');
      await client.query("SET LOCAL lock_timeout='2s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      const identity = (
        await client.query('SELECT current_database() AS database')
      ).rows[0];
      if (identity?.database !== this.target.database)
        fail('R5_WORKFLOW_TARGET_MISMATCH');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* original fixed boundary below */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async inspect(
    credentialPolicy: CredentialPolicy = 'unselected'
  ): Promise<EncryptionPreflightReport> {
    const client = await this.readerPool.connect();
    try {
      return await countLegacyBankData(
        client,
        this.target,
        this.target,
        this.encryption,
        25,
        credentialPolicy
      );
    } finally {
      client.release();
    }
  }

  /** Policy changes are operator-only. The external review reference is not legal approval by this code. */
  async activate(
    stage: 'encrypted-write' | 'contract',
    reviewReference?: string,
    credentialDecision?: CredentialDecision
  ): Promise<void> {
    if (!this.encryption.writesEncrypted())
      fail('R5_WORKFLOW_WRITER_NOT_READY');
    if (
      stage === 'contract' &&
      (!reviewReference ||
        !/^[0-9a-f]{64}$/.test(reviewReference) ||
        this.encryption.describe().stage !== 'contract')
    ) {
      fail('R5_WORKFLOW_REVIEW_REQUIRED');
    }
    await this.transaction(async client => {
      const control = (await client.query(`${controlQuery} FOR UPDATE`))
        .rows[0] as ControlRow;
      if (!control) fail('R5_WORKFLOW_POLICY_MISSING');
      if (control.stage === 'contract' && stage !== 'contract')
        fail('R5_WORKFLOW_POLICY_DOWNGRADE');
      // Hold the policy lock while a separate read-only connection verifies.
      // Waiting legacy writes see the new policy after commit, never its stale stage.
      const credentialPolicy =
        credentialDecision?.policy ?? control.credential_policy;
      const credentialReference =
        credentialDecision?.reviewReference ??
        control.credential_review_reference;
      const deleteAfter = credentialDecision
        ? (credentialDecision.deleteAfter ?? null)
        : control.credential_delete_after;
      checkDecision(credentialPolicy, credentialReference, deleteAfter);
      const report = await this.inspect(credentialPolicy);
      if (control.active_secret_stage !== 'legacy') {
        const reader = await this.readerPool.connect();
        try {
          const active = await countActiveSecrets(
            reader,
            this.target,
            this.encryption
          );
          if (
            !active.safeToBackfill ||
            (stage === 'contract' &&
              (control.active_secret_stage !== 'contract' ||
                active.missingLookupHashes > 0 ||
                Object.values(active.fields).some(
                  field => field.plaintext > 0
                )))
          )
            fail('R5_WORKFLOW_UNSAFE_DATA');
        } finally {
          reader.release();
        }
      } else if (stage === 'contract')
        fail('R5_WORKFLOW_ACTIVE_CONTRACT_REQUIRED');
      if (
        stage === 'contract' &&
        credentialPolicy === 'unselected' &&
        report.credentialCounts.withCredential > 0
      )
        fail('R5_WORKFLOW_CREDENTIAL_REVIEW_REQUIRED');
      if (
        !report.safeToBackfill ||
        (stage === 'contract' && !zeroPlaintext(report))
      )
        fail('R5_WORKFLOW_UNSAFE_DATA');
      if (
        stage === 'contract' &&
        credentialPolicy === 'delete' &&
        report.credentialCounts.withCredential !== 0
      )
        fail('R5_WORKFLOW_CREDENTIALS_REMAIN');
      await client.query(
        `UPDATE public.data_encryption_control SET stage=$1,writer_fingerprint=$2,review_reference=$3,
        credential_policy=$4,credential_review_reference=$5,credential_delete_after=$6,updated_at=now() WHERE id=1`,
        [
          stage,
          this.encryption.writerFingerprint(),
          reviewReference ?? control.review_reference,
          credentialPolicy,
          credentialReference,
          deleteAfter,
        ]
      );
    });
  }

  private async policy(client: EncryptionWorkflowClient): Promise<ControlRow> {
    if (!this.encryption.writesEncrypted())
      fail('R5_WORKFLOW_WRITER_NOT_READY');
    const control = (await client.query(`${controlQuery} FOR SHARE`))
      .rows[0] as ControlRow;
    if (!control || control.stage === 'legacy')
      fail('R5_WORKFLOW_WRITES_NOT_ACTIVATED');
    if (control.writer_fingerprint !== this.encryption.writerFingerprint())
      fail('R5_WORKFLOW_WRITER_CHANGED');
    checkDecision(
      control.credential_policy,
      control.credential_review_reference,
      control.credential_delete_after
    );
    return control;
  }

  private assertRun(
    row: RunRow | undefined,
    mode?: EncryptionRunMode
  ): asserts row is RunRow {
    if (
      !row ||
      row.scope !== 'bank' ||
      row.database_name !== this.target.database ||
      row.writer_fingerprint !== this.encryption.writerFingerprint() ||
      (mode !== undefined && row.mode !== mode)
    )
      fail('R5_WORKFLOW_RUN_CONFLICT');
  }

  async openRun(runId: string, mode: EncryptionRunMode): Promise<void> {
    if (!uuid.test(runId) || !['backfill', 'rotate'].includes(mode))
      fail('R5_WORKFLOW_INVALID_ARGUMENTS');
    if (mode === 'backfill' && this.encryption.describe().stage === 'contract')
      fail('R5_WORKFLOW_CONTRACT_BACKFILL_REFUSED');
    await this.transaction(async client => {
      const control = await this.policy(client);
      const existing = (await client.query(`${runQuery} FOR UPDATE`, [runId]))
        .rows[0] as RunRow | undefined;
      if (existing) {
        this.assertRun(existing, mode);
        this.assertDecision(existing, control);
        return;
      }
      const report = await this.inspect(control.credential_policy);
      if (!report.safeToBackfill) fail('R5_WORKFLOW_UNSAFE_DATA');
      await client.query(
        `INSERT INTO public.data_encryption_runs(id,mode,database_name,writer_fingerprint,credential_policy,credential_review_reference,credential_delete_after)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
        [
          runId,
          mode,
          this.target.database,
          this.encryption.writerFingerprint(),
          control.credential_policy,
          control.credential_review_reference,
          control.credential_delete_after,
        ]
      );
      const row = (await client.query(`${runQuery} FOR UPDATE`, [runId]))
        .rows[0] as RunRow;
      this.assertRun(row, mode);
      this.assertDecision(row, control);
    });
  }

  async batch(
    runId: string,
    batchSize = 25
  ): Promise<{ exhausted: boolean; state: 'running' | 'verified' }> {
    if (
      !uuid.test(runId) ||
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_PREFLIGHT_BATCH_SIZE
    )
      fail('R5_WORKFLOW_INVALID_ARGUMENTS');
    return this.transaction(async client => {
      const control = await this.policy(client);
      const run = (await client.query(`${runQuery} FOR UPDATE NOWAIT`, [runId]))
        .rows[0] as RunRow;
      this.assertRun(run);
      this.assertDecision(run, control);
      if (run.state === 'verified')
        return { exhausted: true, state: 'verified' };
      const started = Date.now();
      const query =
        run.credential_policy === 'encrypt'
          ? ENCRYPT_CREDENTIAL_PAGE_QUERY
          : run.credential_policy === 'delete'
            ? DELETE_CREDENTIAL_PAGE_QUERY
            : BANK_PAGE_QUERY;
      const columns =
        run.credential_policy === 'encrypt'
          ? LEGACY_PROTECTED_COLUMNS
          : LEGACY_BANK_COLUMNS;
      const rows = (
        await client.query(`${query} FOR UPDATE SKIP LOCKED`, [
          run.last_merchant_id,
          batchSize,
        ])
      ).rows;
      let changedRows = 0;
      for (const row of rows) {
        if (!Number.isSafeInteger(row.id) || row.id <= run.last_merchant_id)
          fail('R5_WORKFLOW_INVALID_PAGE');
        if (!/^[0-9]+$/.test(row.encryption_row_version))
          fail('R5_WORKFLOW_INVALID_PAGE');
        const oldValues = columns.map(column => row[column]);
        const newValues = [...oldValues];
        let changed =
          run.credential_policy === 'delete' && row.credential_present === true;
        for (let index = 0; index < columns.length; index++) {
          const column = columns[index];
          if (row[`${column}_oversized`] === true)
            fail('R5_WORKFLOW_UNSAFE_DATA');
          const context = {
            schema: 'public',
            table: 'merchants',
            rowId: row.id,
            column,
          } as const;
          const bucket = this.encryption.classify(row[column], context);
          if (
            ![
              'null',
              'plaintext',
              'encryptedActiveKey',
              'encryptedOldKey',
            ].includes(bucket)
          )
            fail('R5_WORKFLOW_UNSAFE_DATA');
          if (
            bucket === 'plaintext' ||
            (run.mode === 'rotate' && bucket === 'encryptedOldKey')
          ) {
            const plaintext =
              bucket === 'plaintext'
                ? row[column]
                : this.encryption.read(row[column], context);
            newValues[index] = this.encryption.encrypt(plaintext, context);
            changed = true;
          }
        }
        if (changed) {
          // MVCC row-version CAS under the row lock avoids sending any old
          // plaintext/credential back as a SQL bind parameter (or driver log).
          const update = await client.query(
            `UPDATE public.merchants SET ${columns.map((column, index) => `${column}=$${index + 1}`).join(',')}
            ${run.credential_policy === 'delete' ? ',windcave_api_key=NULL' : ''}
            WHERE id=$${newValues.length + 1} AND xmin::text=$${newValues.length + 2} RETURNING id`,
            [...newValues, row.id, row.encryption_row_version]
          );
          if (update.rows.length !== 1) fail('R5_WORKFLOW_CAS_FAILED');
          changedRows++;
        }
      }
      const exhausted = rows.length === 0;
      const cursor = exhausted ? 0 : rows[rows.length - 1].id;
      const batchNumber = run.batch_number + 1;
      await client.query(
        'INSERT INTO public.data_encryption_batches(id,run_id,batch_number,rows_scanned,rows_changed,duration_ms) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          runId,
          batchNumber,
          rows.length,
          changedRows,
          Math.max(0, Date.now() - started),
        ]
      );
      await client.query(
        `UPDATE public.data_encryption_runs SET last_merchant_id=$1,sweep_number=sweep_number+$2,
        batch_number=$3,rows_scanned=rows_scanned+$4,rows_changed=rows_changed+$5,updated_at=now() WHERE id=$6`,
        [
          cursor,
          exhausted ? 1 : 0,
          batchNumber,
          rows.length,
          changedRows,
          runId,
        ]
      );
      return { exhausted, state: 'running' };
    });
  }

  async verifyRun(runId: string): Promise<boolean> {
    if (!uuid.test(runId)) fail('R5_WORKFLOW_INVALID_ARGUMENTS');
    return this.transaction(async client => {
      const control = await this.policy(client);
      const run = (await client.query(`${runQuery} FOR UPDATE NOWAIT`, [runId]))
        .rows[0] as RunRow;
      this.assertRun(run);
      this.assertDecision(run, control);
      if (run.state === 'verified') return true;
      const report = await this.inspect(run.credential_policy);
      if (!report.safeToBackfill) fail('R5_WORKFLOW_UNSAFE_DATA');
      const complete =
        zeroPlaintext(report) &&
        (run.credential_policy !== 'delete' ||
          report.credentialCounts.withCredential === 0) &&
        (run.mode !== 'rotate' ||
          [
            ...Object.values(report.fields),
            ...(report.credentialEncryption
              ? [report.credentialEncryption]
              : []),
          ].every(field => field.encryptedOldKey === 0));
      if (!complete) return false;
      await client.query(
        "UPDATE public.data_encryption_runs SET state='verified',updated_at=now() WHERE id=$1",
        [runId]
      );
      return true;
    });
  }

  async progress(runId: string) {
    if (!uuid.test(runId)) fail('R5_WORKFLOW_INVALID_ARGUMENTS');
    const client = await this.pool.connect();
    try {
      const row = (await client.query(runQuery, [runId])).rows[0] as RunRow;
      this.assertRun(row);
      return {
        runId: row.id,
        mode: row.mode,
        credentialPolicy: row.credential_policy,
        state: row.state,
        batches: row.batch_number,
        sweeps: row.sweep_number,
        rowsScanned: row.rows_scanned,
        rowsChanged: row.rows_changed,
      };
    } finally {
      client.release();
    }
  }

  private assertDecision(run: RunRow, control: ControlRow) {
    if (
      run.credential_policy !== control.credential_policy ||
      run.credential_review_reference !== control.credential_review_reference ||
      run.credential_delete_after !== control.credential_delete_after
    )
      fail('R5_WORKFLOW_RUN_CONFLICT');
  }
}
