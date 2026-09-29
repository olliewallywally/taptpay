import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digestOf } from './schema-fingerprint.mjs';
import { main, verifyRestoreAcl } from './verify-restore-acl.mjs';

const base = 'docs/evidence/remediation-v2-2/r0/';
const source = JSON.parse(fs.readFileSync(`${base}R0-T6A-production-fingerprint-2026-09-10.json`, 'utf8'));
const restored = JSON.parse(fs.readFileSync(`${base}R0-T6A-restored-snapshot-fingerprint-2026-09-10.json`, 'utf8'));
function changed(document, mutate) {
  const copy = structuredClone(document);
  mutate(copy.fingerprint);
  copy.digest = digestOf(copy.fingerprint);
  return copy;
}
const policy = (privileges) => changed(restored, (fp) => {
  fp.schemas[0].acl.find((entry) => entry.grantee === 'PUBLIC').privileges = privileges;
});

test('recorded restore is more permissive even though summary counts agree', () => {
  assert.equal(source.fingerprint.counts.grantsBeyondOwner, restored.fingerprint.counts.grantsBeyondOwner);
  assert.throws(() => verifyRestoreAcl(source, restored), /RESTORE_ACL_POLICY_MISMATCH/);
});
test('USAGE-only repair passes without claiming owner or whole-schema equivalence', () => {
  assert.deepEqual(verifyRestoreAcl(source, policy('U')), {
    status: 'pass', scope: 'public-schema-PUBLIC-privileges-only',
  });
});
test('grant options and CREATE in either ordering fail', () => {
  for (const privileges of ['U*', 'UC', 'CU', 'UC*', 'C']) {
    assert.throws(() => verifyRestoreAcl(source, policy(privileges)), /RESTORE_ACL_POLICY_MISMATCH/);
  }
});
test('unsafe source cannot bless an equally unsafe restore', () => {
  assert.throws(() => verifyRestoreAcl(restored, restored), /RESTORE_ACL_SOURCE_POLICY_UNAPPROVED/);
});
test('absent, null, duplicate, malformed schema policies fail closed', () => {
  for (const mutate of [
    (fp) => { fp.schemas = []; },
    (fp) => { fp.schemas.push(structuredClone(fp.schemas[0])); },
    (fp) => { fp.schemas[0].acl = null; },
    (fp) => { fp.schemas[0].acl[0].privileges = 'unknown'; },
  ]) assert.throws(() => verifyRestoreAcl(source, changed(restored, mutate)), /RESTORE_ACL_AMBIGUOUS_POLICY/);
});
test('removing PUBLIC usage or adding a separate CREATE grant fails', () => {
  for (const mutate of [
    (fp) => { fp.schemas[0].acl = fp.schemas[0].acl.filter((x) => x.grantee !== 'PUBLIC'); },
    (fp) => { fp.schemas[0].acl.push({ grantee: 'PUBLIC', grantor: 'other', privileges: 'C' }); },
  ]) assert.throws(() => verifyRestoreAcl(source, changed(policy('U'), mutate)), /RESTORE_ACL_POLICY_MISMATCH/);
});
test('invalid digest and legacy fingerprint fail', () => {
  assert.throws(() => verifyRestoreAcl(source, { ...policy('U'), digest: 'bad' }), /RESTORE_ACL_INVALID_FINGERPRINT/);
  assert.throws(() => verifyRestoreAcl(source, changed(policy('U'), (fp) => { fp.fingerprintVersion = 1; })), /RESTORE_ACL_INVALID_FINGERPRINT/);
});
test('CLI requires two local artifacts and sanitises read failures', () => {
  assert.throws(() => main([]), /RESTORE_ACL_INVALID_ARGUMENTS/);
  assert.throws(() => main(['/missing/private/location', '/also-missing']), /^Error: RESTORE_ACL_INPUT_FAILED$/);
});
