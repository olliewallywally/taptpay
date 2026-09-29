import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

test('environment example contains unique key names with no values and covers config inputs', () => {
  const example = fs.readFileSync('.env.example', 'utf8');
  const entries = example.split('\n').filter((line) => line && !line.startsWith('#'));
  assert.equal(entries.every((line) => /^[A-Z][A-Z0-9_]*=$/.test(line)), true);
  assert.equal(new Set(entries).size, entries.length);
  const config = fs.readFileSync('server/config.ts', 'utf8');
  const keys = new Set([...config.matchAll(/nonempty\(env, "([A-Z0-9_]+)"\)/g)].map((m) => m[1]));
  for (const match of config.matchAll(/^  "((?:FEATURE_|RUN_|SEED_|SMTP_)[A-Z0-9_]+)",$/gm)) keys.add(match[1]);
  keys.delete('JEST_WORKER_ID');
  for (const key of keys) assert.equal(entries.includes(`${key}=`), true, `missing key: ${key}`);
});

test('local credentials and live artifacts are ignored without hiding migrations or synthetic fixtures', () => {
  const ignored = ['.env', '.env.local', 'server/.env.test', 'db-backups/probe.sql.gz',
    'probe.dump', 'probe.sql.gz', 'uploads/probe.png', 'traces/probe.zip',
    'provider-fixtures/live/probe.json', '.claude-home/probe', '.claude/settings.local.json'];
  const visible = ['.env.example', 'migrations/9999_probe.sql', 'server/__tests__/fixtures/probe.json',
    'docs/design/desktop-app/screens/probe.png'];
  const result = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    input: [...ignored, ...visible].join('\n'), encoding: 'utf8',
  }).trim().split('\n');
  assert.deepEqual(result, ignored);
});

test('secret scan is an independent mandatory CI workflow', () => {
  const workflow = fs.readFileSync('.github/workflows/secret-scan.yml', 'utf8');
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /node scripts\/scan-secrets.mjs/);
  assert.doesNotMatch(workflow, /continue-on-error|\$\{\{\s*secrets\.|upload-artifact|pull_request_target/);
});
