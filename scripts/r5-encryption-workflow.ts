import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataEncryption } from '../server/data-encryption';
import { EncryptionWorkflow } from '../server/encryption-workflow';
import { ActiveSecretWorkflow } from '../server/active-secret-workflow';
import { parseEncryptionOperatorArguments } from '../server/encryption-operator';
import { assertPreflightTarget } from '../server/encryption-preflight';
import { preflightConnectionSettings } from './r5-encryption-preflight';

export async function runEncryptionOperator(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
) {
  const options = parseEncryptionOperatorArguments(argv);
  const encryption = loadDataEncryption(env);
  if (encryption.describe().stage === 'legacy')
    throw new Error('R5_OPERATOR_READER_REQUIRED');
  if (options.execute && !encryption.writesEncrypted())
    throw new Error('R5_OPERATOR_WRITER_REQUIRED');
  const settings = preflightConnectionSettings({
    ...env,
    R5_PREFLIGHT_DATABASE_URL: env.R5_WORKFLOW_DATABASE_URL,
  });
  assertPreflightTarget(options, settings);
  const { default: pg } = await import('pg');
  const writerPool = new pg.Pool({ ...settings, max: 4 });
  const readerPool = new pg.Pool({ ...settings, max: 2 });
  writerPool.on('error', () => undefined);
  readerPool.on('error', () => undefined);
  const workflow =
    options.scope === 'active'
      ? new ActiveSecretWorkflow(writerPool, options, encryption, readerPool)
      : new EncryptionWorkflow(writerPool, options, encryption, readerPool);
  try {
    if (!options.execute) {
      const report = await workflow.inspect(options.credentialDecision?.policy);
      return {
        exitCode: report.safeToBackfill ? 0 : 2,
        report: {
          scope: options.scope,
          dryRun: true,
          mutationExecuted: false,
          ...report,
        },
      };
    }
    if (options.action === 'activate-writes' || options.action === 'contract') {
      await workflow.activate(
        options.action === 'contract' ? 'contract' : 'encrypted-write',
        options.reviewReference,
        options.credentialDecision
      );
      return {
        exitCode: 0,
        report: { mutationExecuted: true, action: options.action },
      };
    }
    const mode = options.action === 'rotate' ? 'rotate' : 'backfill';
    const runId = options.runId!;
    await workflow.openRun(runId, mode);
    let verified = false;
    for (let count = 0; count < options.maxBatches; count++) {
      const batch = await workflow.batch(runId, options.batchSize);
      if (
        batch.state === 'verified' ||
        (batch.exhausted && (await workflow.verifyRun(runId)))
      ) {
        verified = true;
        break;
      }
    }
    return {
      exitCode: verified ? 0 : 3,
      report: { mutationExecuted: true, ...(await workflow.progress(runId)) },
    };
  } finally {
    await Promise.all([writerPool.end(), readerPool.end()]);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await runEncryptionOperator(
      process.argv.slice(2),
      process.env
    );
    process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
    process.exitCode = result.exitCode;
  } catch {
    process.stderr.write('R5_ENCRYPTION_OPERATION_FAILED\n');
    process.exitCode = 1;
  }
}
