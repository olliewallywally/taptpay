import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePreflightArguments,
  assertPreflightTarget,
} from '../server/encryption-preflight';
import { preflightConnectionSettings } from './r5-encryption-preflight';
import {
  operateEntitlements,
  parseEntitlementManifest,
} from '../server/entitlement-operations';
export function parseEntitlementOperation(argv: readonly string[]) {
  const values = new Map<string, string>(),
    allowed = [
      'expected-host',
      'expected-port',
      'expected-database',
      'action',
      'review-digest',
      'manifest',
      'manifest-sha256',
      'execute',
      'acknowledge-release-checks',
    ];
  for (const arg of argv) {
    const m = /^--([a-z][a-z0-9-]*)=(.*)$/.exec(arg);
    if (!m || !allowed.includes(m[1]) || values.has(m[1]))
      throw Error('R6_ENTITLEMENT_INVALID_ARGUMENTS');
    values.set(m[1], m[2]);
  }
  const action = values.get('action'),
    reviewDigest = values.get('review-digest'),
    execute = values.get('execute') ?? 'false',
    ack = values.get('acknowledge-release-checks') ?? 'false';
  if (
    !['classify', 'activate'].includes(action ?? '') ||
    !reviewDigest ||
    !/^[0-9a-f]{64}$/.test(reviewDigest) ||
    !['true', 'false'].includes(execute) ||
    !['true', 'false'].includes(ack) ||
    (action === 'classify' &&
      (!values.get('manifest') ||
        !/^[0-9a-f]{64}$/.test(values.get('manifest-sha256') ?? ''))) ||
    (action === 'activate' &&
      (values.has('manifest') ||
        values.has('manifest-sha256') ||
        (execute === 'true' && ack !== 'true')))
  )
    throw Error('R6_ENTITLEMENT_INVALID_ARGUMENTS');
  return {
    target: parsePreflightArguments(
      ['expected-host', 'expected-port', 'expected-database'].map(
        key => `--${key}=${values.get(key) ?? ''}`
      )
    ),
    action: action as 'classify' | 'activate',
    reviewDigest,
    execute: execute === 'true',
    acknowledgeReleaseChecks: ack === 'true',
    manifestPath: values.get('manifest'),
    manifestSha256: values.get('manifest-sha256'),
  };
}
async function readManifest(path: string, digest: string) {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 262144)
      throw Error('R6_ENTITLEMENT_INVALID_MANIFEST');
    const bytes = Buffer.alloc(262145);
    let length = 0;
    while (length < bytes.length) {
      const r = await handle.read(bytes, length, bytes.length - length, null);
      if (!r.bytesRead) break;
      length += r.bytesRead;
    }
    if (
      length > 262144 ||
      createHash('sha256').update(bytes.subarray(0, length)).digest('hex') !==
        digest
    )
      throw Error('R6_ENTITLEMENT_INVALID_MANIFEST');
    return parseEntitlementManifest(
      JSON.parse(bytes.subarray(0, length).toString('utf8'))
    );
  } finally {
    await handle.close();
  }
}
export async function runEntitlementOperation(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
) {
  const options = parseEntitlementOperation(argv),
    settings = preflightConnectionSettings({
      ...env,
      R5_PREFLIGHT_DATABASE_URL: env.R6_ENTITLEMENT_DATABASE_URL,
    });
  assertPreflightTarget(options.target, settings);
  const manifest =
    options.action === 'classify'
      ? await readManifest(options.manifestPath!, options.manifestSha256!)
      : { version: 1, periods: [], revocations: [] };
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    ...settings,
    application_name: 'taptpay-r6-entitlement-policy',
    connectionTimeoutMillis: 3000,
    query_timeout: 12000,
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    return await operateEntitlements(client, options.target, manifest, options);
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
      JSON.stringify(
        await runEntitlementOperation(process.argv.slice(2), process.env),
        null,
        2
      ) + '\n'
    );
  } catch {
    process.stderr.write('R6_ENTITLEMENT_POLICY_FAILED\n');
    process.exitCode = 1;
  }
}
