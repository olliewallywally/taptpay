import {
  parsePreflightArguments,
  type PreflightTarget,
} from './encryption-preflight';
import type { CredentialDecision } from './encryption-workflow';

export type EncryptionAction =
  | 'inspect'
  | 'activate-writes'
  | 'backfill'
  | 'rotate'
  | 'contract';
export interface EncryptionOperatorOptions extends PreflightTarget {
  scope: 'bank' | 'active';
  action: EncryptionAction;
  batchSize: number;
  maxBatches: number;
  runId?: string;
  execute: boolean;
  reviewReference?: string;
  credentialDecision?: CredentialDecision;
}

/** Pure validation completes before a pool or database connection exists. */
export function parseEncryptionOperatorArguments(
  argv: readonly string[]
): EncryptionOperatorOptions {
  const options = new Map<string, string>();
  const fail = (): never => {
    throw new Error('R5_OPERATOR_INVALID_ARGUMENTS');
  };
  const allowed = [
    'expected-host',
    'expected-port',
    'expected-database',
    'batch-size',
    'max-batches',
    'action',
    'run-id',
    'execute',
    'confirm-database',
    'review-reference',
    'credential-policy',
    'credential-review-reference',
    'credential-delete-after',
    'scope',
  ];
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match || !allowed.includes(match[1]) || options.has(match[1])) fail();
    options.set(match![1], match![2]);
  }
  const namedTarget = argv.filter(argument =>
    /^--(expected-host|expected-port|expected-database|batch-size)=/.test(
      argument
    )
  );
  const target = parsePreflightArguments(namedTarget);
  const scope = options.get('scope') ?? 'bank';
  if (!['bank', 'active'].includes(scope)) fail();
  const action = options.get('action') ?? 'inspect';
  if (
    !['inspect', 'activate-writes', 'backfill', 'rotate', 'contract'].includes(
      action
    )
  )
    fail();
  const executeValue = options.get('execute') ?? 'false';
  if (!['true', 'false'].includes(executeValue)) fail();
  const execute = executeValue === 'true';
  if (
    execute &&
    (action === 'inspect' ||
      options.get('confirm-database') !== target.database)
  )
    fail();
  const maxBatches = options.get('max-batches') ?? '100';
  if (!/^[1-9][0-9]{0,3}$/.test(maxBatches) || Number(maxBatches) > 1000)
    fail();
  const runId = options.get('run-id');
  if (
    (action === 'backfill' || action === 'rotate') &&
    (!runId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        runId
      ))
  )
    fail();
  const reviewReference = options.get('review-reference');
  if (reviewReference !== undefined && !/^[0-9a-f]{64}$/.test(reviewReference))
    fail();
  if (execute && action === 'contract' && !reviewReference) fail();
  let credentialDecision: CredentialDecision | undefined;
  const credentialPolicy = options.get('credential-policy');
  const credentialReference = options.get('credential-review-reference');
  const deletion = options.get('credential-delete-after');
  if (credentialPolicy !== undefined) {
    if (scope !== 'bank') fail();
    if (
      !['delete', 'encrypt'].includes(credentialPolicy) ||
      !credentialReference ||
      !/^[0-9a-f]{64}$/.test(credentialReference) ||
      !['activate-writes', 'contract'].includes(action)
    )
      fail();
    if (
      credentialPolicy === 'encrypt' &&
      (!deletion ||
        !/^\d{4}-\d{2}-\d{2}$/.test(deletion) ||
        !Number.isFinite(Date.parse(deletion)) ||
        new Date(deletion).toISOString().slice(0, 10) !== deletion ||
        deletion <= new Date().toISOString().slice(0, 10))
    )
      fail();
    if (credentialPolicy === 'delete' && deletion !== undefined) fail();
    credentialDecision = {
      policy: credentialPolicy as 'delete' | 'encrypt',
      reviewReference: credentialReference!,
      ...(deletion ? { deleteAfter: deletion } : {}),
    };
  } else if (credentialReference !== undefined || deletion !== undefined)
    fail();
  return {
    ...target,
    scope: scope as 'bank' | 'active',
    action: action as EncryptionAction,
    execute,
    runId,
    maxBatches: Number(maxBatches),
    reviewReference,
    credentialDecision,
  };
}
