import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestOf } from './schema-fingerprint.mjs';

const fail = (code) => { throw new Error(code); };

// Offline, schema-only acceptance of PUBLIC's privileges. Ownership and named
// role grants still require section-by-section operator review.
function publicPolicy(document) {
  const fp = document?.fingerprint;
  if (fp?.fingerprintVersion !== 2 || fp.schema !== 'public'
      || document.digest !== digestOf(fp) || !Array.isArray(fp.schemas)) {
    fail('RESTORE_ACL_INVALID_FINGERPRINT');
  }
  const schemas = fp.schemas.filter((schema) => schema.name === 'public');
  if (schemas.length !== 1 || !Array.isArray(schemas[0].acl)) {
    fail('RESTORE_ACL_AMBIGUOUS_POLICY');
  }
  const grants = schemas[0].acl;
  if (grants.some((grant) => typeof grant?.grantee !== 'string'
      || typeof grant.grantor !== 'string' || typeof grant.privileges !== 'string'
      || !/^(?:[UC]\*?)+$/.test(grant.privileges))) {
    fail('RESTORE_ACL_AMBIGUOUS_POLICY');
  }
  return [...new Set(grants.filter((grant) => grant.grantee === 'PUBLIC')
    .flatMap((grant) => grant.privileges.match(/[UC]\*?/g)))].sort();
}

export function verifyRestoreAcl(source, restored) {
  const expected = publicPolicy(source);
  const actual = publicPolicy(restored);
  // This reviewed repair is specifically for production's USAGE-only policy.
  // A changed policy must be reviewed, never used to bless CREATE silently.
  if (JSON.stringify(expected) !== '["U"]') fail('RESTORE_ACL_SOURCE_POLICY_UNAPPROVED');
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('RESTORE_ACL_POLICY_MISMATCH');
  return { status: 'pass', scope: 'public-schema-PUBLIC-privileges-only' };
}

export function main(argv) {
  if (argv.length !== 2) fail('RESTORE_ACL_INVALID_ARGUMENTS');
  let source, restored;
  try {
    source = JSON.parse(fs.readFileSync(argv[0], 'utf8'));
    restored = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  } catch { fail('RESTORE_ACL_INPUT_FAILED'); }
  return verifyRestoreAcl(source, restored);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)))}\n`); }
  catch (error) {
    process.stderr.write(`${/^RESTORE_ACL_[A-Z_]+$/.test(error.message) ? error.message : 'RESTORE_ACL_FAILED'}\n`);
    process.exitCode = 1;
  }
}
