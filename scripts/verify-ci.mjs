import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assertNode22, assertJestReport, runOwnedCommand, writeCIReport} from './verify-ci-safety.mjs';

assertNode22();
const options = new Map();
for (const arg of process.argv.slice(2)) {
  const m = /^--(stage|mode|context)=(.+)$/.exec(arg);
  if (!m || options.has(m[1])) throw Error('INVALID_CI_ARGUMENT');
  options.set(m[1], m[2]);
}
const stage = options.get('stage') ?? 'all', mode = options.get('mode') ?? 'all';
const context = options.get('context');
const contexts = ['phone','tablet','desktop','desktop-short'];
if (!['all','static','unit','build','postgres','browser','lint','audit','secrets'].includes(stage)
  || !['all','pages','tutorials','payment-states','chunks','terminal'].includes(mode)
  || (options.has('mode') && stage !== 'browser')
  || (context && (stage !== 'browser' || !contexts.includes(context)))) throw Error('INVALID_CI_STAGE');
const privateDir = await mkdtemp(path.join(tmpdir(), 'taptpay-r8-ci-'));
const reports = path.resolve(process.env.R8_REPORT_DIR ?? path.join(process.env.RUNNER_TEMP ?? privateDir, 'r8-sanitized'));
await mkdir(reports, {recursive: true});
// Discard ambient application/provider/PG*/NODE_OPTIONS before any app is loaded.
const env = Object.fromEntries(['PATH','HOME','TMPDIR','PLAYWRIGHT_CHROMIUM_PATH','GITLEAKS_BIN',
  'PHP_BIN',
  'HTTPS_PROXY','HTTP_PROXY','NO_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE',
  'npm_config_cache'].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
Object.assign(env, {CI: 'true', npm_config_update_notifier: 'false', npm_config_audit: 'false'});
const stages = [], controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGTERM', abort); process.once('SIGINT', abort);
async function run(name, command, extraEnv = {}, timeoutMs = 25 * 60_000) {
  if (controller.signal.aborted) throw Error('CI_ABORTED');
  const result = await runOwnedCommand(command, {env: {...env, ...extraEnv},
    logFile: path.join(privateDir, name + '.log'), timeoutMs, signal: controller.signal});
  stages.push({name, status: result.exitCode === 0 ? 'pass' : 'fail', exitCode: result.exitCode});
  await writeCIReport(reports, stages);
  console.log(`${result.exitCode === 0 ? 'PASS' : 'FAIL'} ${name}`);
  if (result.exitCode !== 0) throw Error('CI_STAGE_FAILED');
}
const wants = name => stage === 'all' || stage === name;
try {
  if (wants('static')) {
    await run('typecheck', ['npm','run','check']);
    await run('typecheck-r5', ['npm','run','check:r5']);
    await run('typecheck-r6', ['npm','run','check:r6']);
    await run('typecheck-r8', ['npm','run','check:r8']);
    await run('tool-contracts', ['npm','run','test:r8:tools']);
    await run('backup-safety', ['npm','run','test:backup:safety']);
    await run('fingerprint-safety', ['npm','run','test:fingerprint']);
    await run('r5-cli', ['npm','run','test:r5:cli']);
    await run('r6-cli', ['npm','run','test:r6:cli']);
    await run('r7-artifact-safety', ['npm','run','test:r7:artifacts']);
  }
  if (wants('unit')) {
    for (const project of ['client','server']) {
      const output = path.join(privateDir, project + '-jest.json');
      await run(project, ['npm','run','test:' + project,'--','--runInBand','--detectOpenHandles','--json', '--outputFile=' + output], {}, 35 * 60_000);
      assertJestReport(JSON.parse(await readFile(output, 'utf8')));
    }
  }
  if (wants('build')) {
    await run('build-without-db', ['npm','run','verify:build']);
    await run('web-snapshot-parity', ['npm','run','verify:r7:artifacts']);
    await run('production-install', ['npm','run','verify:production-install']);
    await run('development-middleware', ['npm','run','verify:development-vite']);
  }
  if (wants('postgres')) await run('postgres', ['npm','run','verify:postgres'], {
    R8_CI_ADMIN_URL: process.env.R8_CI_ADMIN_URL ?? '',
    TAPTPAY_TEST_DATABASE: process.env.TAPTPAY_TEST_DATABASE ?? '',
    RECORDED: process.env.RECORDED ?? 'docs/evidence/remediation-v2-2/r6/R6-through-0049b-fingerprint-2026-10-15.json',
    // Only the dedicated guarded runner receives these for collision refusal.
    DATABASE_URL: process.env.DATABASE_URL ?? '', NEON_DATABASE_URL: process.env.NEON_DATABASE_URL ?? '',
  }, 25 * 60_000);
  if (wants('browser')) {
    for (const device of context ? [context] : contexts) {
    for (const kind of (mode === 'all' ? ['pages','tutorials','payment-states','chunks','terminal'] : [mode])) {
      const flags = {pages: [], tutorials: ['--tutorials'], 'payment-states': ['--payment-states'], chunks: ['--chunks'], terminal: ['--terminal-checks']}[kind];
      await run('browser-' + device + '-' + kind, [process.execPath,'--import','tsx','scripts/verify-r1-t10-device-matrix.ts',
        path.join(privateDir, device, kind), path.resolve('dist/public'), '--context', device, ...flags], {}, 30 * 60_000);
    }
    }
  }
  if (wants('lint')) await run('lint-zero-new', ['npm','run','verify:lint']);
  if (wants('secrets')) {
    let failed = false;
    for (const mode of ['tree','history']) {
      try { await run('secret-' + mode, [process.execPath,'scripts/scan-secrets.mjs',mode]); }
      catch { failed = true; }
    }
    if (failed) throw Error('SECRET_GATE_FAILED');
  }
  if (wants('audit')) {
    const result = await runOwnedCommand(['npm','audit','--json','--package-lock-only'], {
      env, logFile: path.join(privateDir, 'audit.json'), timeoutMs: 120_000, signal: controller.signal});
    const report = JSON.parse(await readFile(path.join(privateDir, 'audit.json'), 'utf8'));
    if (result.timedOut || result.aborted || ![0,1].includes(result.exitCode) || !report.metadata?.vulnerabilities || report.error)
      throw Error('AUDIT_UNAVAILABLE');
    const counts = report.metadata.vulnerabilities;
    const advisories = [...new Set(Object.values(report.vulnerabilities ?? {}).flatMap(v =>
      v.via.filter(x => typeof x === 'object').map(x => /GHSA-[a-z0-9-]+$/.exec(x.url)?.[0]).filter(Boolean)))].sort();
    await writeFile(path.join(reports,'dependency-audit.json'), JSON.stringify({version: 1, counts, advisories}, null, 2) + '\n', {mode: 0o600});
    const exitCode = counts.high > 0 || counts.critical > 0 ? 1 : 0;
    stages.push({name: 'dependency-high-critical', status: exitCode ? 'fail' : 'pass', exitCode});
    if (exitCode) throw Error('DEPENDENCY_RELEASE_GATE_FAILED');
  }
} catch {
  // Includes pre-stage infrastructure errors; never publish exception strings.
  if (!stages.some(s => s.status === 'fail')) stages.push({name: 'infrastructure', status: 'fail', exitCode: 1});
  process.exitCode = 1;
} finally {
  await writeCIReport(reports, stages);
  await writeFile(path.join(reports, stage + '.json'), await readFile(path.join(reports, 'summary.json')), {mode: 0o600});
  process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort);
  console.log('Sanitized report: ' + reports);
  // Raw child output/screenshots remain private, never an upload path.
}
