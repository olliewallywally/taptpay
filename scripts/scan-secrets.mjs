import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '8.30.1';

// No source snippets, matched values, author names/emails or native scanner logs
// reach output. The scanner writes only these fields, even to temporary storage.
const TEMPLATE = '{{range .}}{{dict "rule" .RuleID "file" .File "commit" .Commit | toJson}}{{"\\n"}}{{end}}';

export function scanSecrets({ root = ROOT, mode = 'tree', binary = 'gitleaks',
  emit = (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
} = {}) {
  if (!['tree', 'history'].includes(mode)) throw new Error('SECRET_SCAN_INVALID_MODE');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'taptpay-secret-scan-'));
  const env = { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' };
  const command = (program, args) => execFileSync(program, args, {
    cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024,
  });
  try {
    if (command(binary, ['version']).trim() !== VERSION) throw new Error();
    const template = path.join(temporary, 'template');
    const report = path.join(temporary, 'report');
    const ignore = path.join(temporary, 'ignore');
    fs.writeFileSync(template, TEMPLATE, { mode: 0o600 });
    fs.writeFileSync(ignore, '', { mode: 0o600 });
    const args = [mode === 'history' ? 'git' : 'dir',
      '--config', path.join(ROOT, '.gitleaks.toml'), '--gitleaks-ignore-path', ignore,
      '--ignore-gitleaks-allow', '--redact=100', '--no-banner', '--no-color',
      '--log-level', 'error', '--exit-code', '23',
      '--report-format', 'template', '--report-template', template, '--report-path', report];
    const tree = path.join(temporary, 'tree');
    if (mode === 'tree') {
      fs.mkdirSync(tree);
      // Follow only our own links to regular repository files: no raw source/data
      // copies and no traversal into ignored local dumps, env files or AI state.
      const files = command('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
      for (const name of new Set(files.split('\0').filter(Boolean))) {
        const source = path.resolve(root, name);
        if (!source.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error();
        let stat;
        try { stat = fs.lstatSync(source); } catch (error) {
          if (error.code === 'ENOENT') continue; // deleted tracked file
          throw error;
        }
        if (!stat.isFile() || fs.realpathSync(source) !== source) throw new Error();
        // Check every parent too: lstat of a regular file follows directory
        // symlinks, which otherwise escapes the checkout through tracked paths.
        const destination = path.join(tree, name);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.symlinkSync(source, destination);
      }
      args.push('--follow-symlinks', tree);
    } else {
      if (command('git', ['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw new Error();
      args.push('--log-opts=--all --full-history -m', root);
    }
    let findings = false;
    try { command(binary, args); } catch (error) {
      if (error.status !== 23) throw new Error();
      findings = true;
    }
    const rows = fs.readFileSync(report, 'utf8').split('\n').filter(Boolean);
    if (findings !== (rows.length > 0)) throw new Error();
    for (const row of rows) {
      const parsed = JSON.parse(row);
      if (typeof parsed.rule !== 'string' || typeof parsed.file !== 'string' ||
          typeof parsed.commit !== 'string') throw new Error();
      let file = parsed.file;
      if (mode === 'tree' && path.isAbsolute(file)) {
        file = path.relative(file.startsWith(`${tree}${path.sep}`) ? tree : root, file);
      }
      if (path.isAbsolute(file) || file === '..' || file.startsWith(`..${path.sep}`)) throw new Error();
      emit({ rule: parsed.rule, file, commit: parsed.commit, status: 'review-required' });
    }
    emit({ status: findings ? 'review-required' : 'clean', mode, findings: rows.length });
    return findings ? 1 : 0;
  } catch {
    // Even executable-not-found and malformed report errors must not echo argv,
    // stderr, file contents or exception objects.
    throw new Error('SECRET_SCAN_FAILED');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error();
    process.exitCode = scanSecrets({ mode: process.argv[2] ?? 'tree', binary: process.env.GITLEAKS_BIN ?? 'gitleaks' });
  } catch {
    process.stderr.write('SECRET_SCAN_FAILED\n');
    process.exitCode = 2;
  }
}
