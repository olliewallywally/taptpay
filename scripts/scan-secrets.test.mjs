import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scanSecrets } from './scan-secrets.mjs';

const binary = process.env.GITLEAKS_BIN ?? 'gitleaks';
const synthetic = ['ghp_', 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL3oR6'].join('');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taptpay-scan-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, {
    cwd: root, env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  git('init', '--quiet');
  const records = [];
  return { root, git, records, scan: (mode = 'tree') => scanSecrets({ root, mode, binary, emit: (r) => records.push(r) }) };
}

test('clean tree passes and ignored local artifacts are not scanned', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(f.root, '.env'), synthetic);
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'no credentials here');
  assert.equal(f.scan(), 0);
  assert.equal(f.records.at(-1).status, 'clean');
});

test('untracked source leak fails with only metadata; inline suppression cannot bypass it', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), `token = "${synthetic}" # gitleaks:allow\n`);
  assert.equal(f.scan(), 1);
  assert.equal(f.records.some((r) => r.file === 'source.txt'), true);
  assert.equal(JSON.stringify(f.records).includes(synthetic), false);
  for (const row of f.records.filter((r) => r.rule)) {
    assert.deepEqual(Object.keys(row), ['rule', 'file', 'commit', 'status']);
  }
});

test('tracked source remains scanned even when a later ignore rule hides its name', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'tracked.txt'), synthetic);
  f.git('add', '--', 'tracked.txt');
  fs.writeFileSync(path.join(f.root, '.gitignore'), 'tracked.txt\n');
  assert.equal(f.scan(), 1);
});

test('history finds a deleted synthetic leak without emitting commit author or secret', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), synthetic);
  f.git('add', '--', 'source.txt');
  const commit = () => f.git('-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'synthetic scan fixture');
  commit();
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'removed');
  f.git('add', '--', 'source.txt');
  commit();
  assert.equal(f.scan('tree'), 0);
  assert.equal(f.scan('history'), 1);
  const output = JSON.stringify(f.records);
  assert.equal(output.includes(synthetic) || output.includes('fixture@example.invalid'), false);
  assert.equal(f.records.some((r) => /^[a-f0-9]{40}$/.test(r.commit)), true);
});

test('missing executable and invalid mode fail closed without echoing sensitive inputs', (t) => {
  const f = fixture(t);
  assert.throws(() => scanSecrets({ root: f.root, binary: `/missing/${synthetic}` }),
    (error) => error.message === 'SECRET_SCAN_FAILED');
  assert.throws(() => f.scan(synthetic), (error) => error.message === 'SECRET_SCAN_INVALID_MODE');
});

test('repository symlinks cannot make the tree scanner follow an external file', (t) => {
  const f = fixture(t);
  fs.symlinkSync('/etc/passwd', path.join(f.root, 'external'));
  assert.throws(() => f.scan(), (error) => error.message === 'SECRET_SCAN_FAILED');
  assert.equal(f.records.length, 0);
});

test('a symlinked parent of a tracked file cannot escape the checkout', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'nested'));
  fs.writeFileSync(path.join(f.root, 'nested', 'source.txt'), 'original source');
  f.git('add', '--', 'nested/source.txt');
  fs.renameSync(path.join(f.root, 'nested'), path.join(f.root, 'original'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'taptpay-scan-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'source.txt'), 'external source');
  fs.symlinkSync(outside, path.join(f.root, 'nested'));
  // Ignore the directory link itself so the tracked descendant exercises the
  // parent-component boundary, independently of final-component lstat checks.
  fs.writeFileSync(path.join(f.root, '.gitignore'), 'nested\noriginal\n');
  assert.throws(() => f.scan(), (error) => error.message === 'SECRET_SCAN_FAILED');
  assert.equal(f.records.length, 0);
});

test('evidence exception accepts only known Git hashes at reviewed paths', (t) => {
  const f = fixture(t);
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const evidencePath = 'docs/evidence/remediation-v2-2/r0/R0-T7-history-scan-2026-09-08.jsonl';
  const records = fs.readFileSync(path.join(repository, evidencePath), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const known = records.find((record) => record.commit).commit;
  const keyword = ['source', 'graph'].join('');
  const file = path.join(f.root, evidencePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${keyword}: ${known}\n`);
  assert.equal(f.scan(), 0);
  const unknown = createHash('sha1').update('synthetic unknown evidence credential').digest('hex');
  fs.writeFileSync(file, `${keyword}: ${unknown}\n`);
  assert.equal(f.scan(), 1);
  fs.writeFileSync(file, `${['sg', 'p_'].join('')}${known}\n`);
  assert.equal(f.scan(), 1);
  fs.writeFileSync(file, `${keyword}: ${known}\n`);
  fs.writeFileSync(path.join(f.root, 'ordinary-source.txt'), `${keyword}: ${known}\n`);
  assert.equal(f.scan(), 1);
});

function committedLeak(t) {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'source.txt'), `token = "${synthetic}"\n`);
  f.git('add', '--', 'source.txt');
  f.git('-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '-m', 'synthetic disposition fixture');
  assert.equal(f.scan('history'), 1);
  const finding = f.records.find((r) => r.rule);
  f.records.length = 0;
  return { f, finding };
}
const disposition = (finding, over = {}) => JSON.stringify({
  rule: finding.rule, file: finding.file, commit: finding.commit,
  disposition: 'false-positive', reason: 'synthetic fixture', reviewed: '2026-09-09', ...over });

test('a reviewed disposition clears a finding and is scoped to one exact commit', (t) => {
  const { f, finding } = committedLeak(t);
  const file = path.join(f.root, '.gitleaks-dispositions.jsonl');
  fs.writeFileSync(file, `${disposition(finding)}\n`);
  assert.equal(f.scan('history'), 0);
  assert.equal(f.records.find((r) => r.rule).status, 'dispositioned');
  assert.equal(f.records.at(-1).dispositioned, 1);
  assert.equal(JSON.stringify(f.records).includes(synthetic), false);

  // The same review must not carry over to a different commit.
  f.records.length = 0;
  const other = createHash('sha1').update('some other commit').digest('hex');
  fs.writeFileSync(file, `${disposition(finding, { commit: other })}\n`);
  assert.equal(f.scan('history'), 1);
  assert.equal(f.records.find((r) => r.rule).status, 'review-required');
});

test('a known but unrevoked exposure is recorded and still fails', (t) => {
  const { f, finding } = committedLeak(t);
  fs.writeFileSync(path.join(f.root, '.gitleaks-dispositions.jsonl'),
    `${disposition(finding, { disposition: 'exposed-unresolved', reason: 'revocation outstanding' })}\n`);
  assert.equal(f.scan('history'), 1);
  const row = f.records.find((r) => r.rule);
  assert.equal(row.status, 'review-required');
  assert.equal(row.disposition, 'exposed-unresolved');
});

test('malformed, wildcarded or duplicated dispositions fail closed', (t) => {
  const { f, finding } = committedLeak(t);
  const file = path.join(f.root, '.gitleaks-dispositions.jsonl');
  const rejected = [
    disposition(finding, { file: '*' }),                      // no globs
    disposition(finding, { commit: '' }),                     // no file-wide waiver
    disposition(finding, { commit: 'not-a-sha' }),            // must be a full object id
    disposition(finding, { disposition: 'looks-fine' }),      // closed vocabulary
    disposition(finding, { reason: '  ' }),                   // a waiver needs a reason
    disposition(finding, { reviewed: 'yesterday' }),          // dated review only
    '{"rule":"x"}',                                           // incomplete record
    'not json at all',
    `${disposition(finding)}\n${disposition(finding)}`,        // duplicate hides which review applies
  ];
  for (const line of rejected) {
    fs.writeFileSync(file, `${line}\n`);
    assert.throws(() => f.scan('history'), (error) => error.message === 'SECRET_SCAN_FAILED', line);
  }
  // Comments and blank lines remain acceptable around real entries.
  fs.writeFileSync(file, `# reviewed 2026-09-09\n\n${disposition(finding)}\n`);
  assert.equal(f.scan('history'), 0);
});
