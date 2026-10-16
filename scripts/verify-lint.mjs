import {ESLint} from 'eslint';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function findings() {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(['client/src', 'server', 'shared', 'scripts']);
  const rows = [];
  for (const result of results) {
    const lines = (result.source ?? await readFile(result.filePath, 'utf8')).split(/\r?\n/);
    for (const m of result.messages.filter(m => m.severity === 2)) rows.push({
      file: path.relative(process.cwd(), result.filePath).split(path.sep).join('/'),
      rule: m.ruleId ?? 'parse-error',
      digest: createHash('sha256').update([m.ruleId, m.message, lines[m.line - 1]?.trim()].join('\0')).digest('hex'),
    });
  }
  return rows;
}
export function newFindings(actual, baseline) {
  const counts = new Map();
  const key = r => JSON.stringify([r.file, r.rule, r.digest]);
  for (const row of baseline) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return actual.filter(row => {
    const k = key(row), left = counts.get(k) ?? 0;
    if (!left) return true;
    counts.set(k, left - 1);
    return false;
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const baseline = JSON.parse(await readFile('scripts/lint-baseline.json', 'utf8'));
    const actual = await findings(), added = newFindings(actual, baseline.findings);
    // Metadata only; no source line or matched text is printed.
    console.log(JSON.stringify({existingErrors: actual.length - added.length, newErrors: added.length,
      files: [...new Set(added.map(r => r.file))]}));
    if (added.length) process.exitCode = 1;
  } catch { console.error('LINT_VERIFICATION_FAILED'); process.exitCode = 1; }
}
