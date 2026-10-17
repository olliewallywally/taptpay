/** Prove the narrowly overridden legacy TS loader and actual Kit CLI offline. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assertNode22, runOwnedCommand } from './verify-ci-safety.mjs';

assertNode22();
assert.equal(process.argv.length, 2, 'INVALID_PACKAGE_CONTRACT_ARGUMENT');
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = await mkdtemp(path.join(os.tmpdir(), 'taptpay-r8-package-'));
const controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGINT', abort);
process.once('SIGTERM', abort);
let passed = false;
try {
  const pkg = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8')
  );
  assert.equal(
    pkg.overrides?.['@esbuild-kit/core-utils@3.3.2']?.esbuild,
    '0.25.12',
    'SCOPED_LOADER_OVERRIDE_REQUIRED'
  );
  assert.equal(
    pkg.overrides?.esbuild,
    undefined,
    'GLOBAL_ESBUILD_OVERRIDE_FORBIDDEN'
  );
  const require = createRequire(
    path.join(root, 'node_modules/@esbuild-kit/core-utils/package.json')
  );
  assert.equal(
    require('esbuild/package.json').version,
    '0.25.12',
    'LOADER_ESBUILD_RESOLUTION_DRIFT'
  );
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ type: 'module' })
  );
  await writeFile(
    path.join(dir, 'schema.ts'),
    `import {pgTable,integer,text} from ${JSON.stringify(path.join(root, 'node_modules/drizzle-orm/pg-core/index.js'))};\ntype Name=string; const name:Name='r8_fixture';\nexport const fixture=pgTable(name,{id:integer('id').primaryKey(),label:text('label').notNull()});\n`
  );
  await writeFile(
    path.join(dir, 'drizzle.config.ts'),
    `export default ${JSON.stringify({ dialect: 'postgresql', schema: path.join(dir, 'schema.ts'), out: './generated' })};\n`
  );
  // Native Node stripping cannot handle this enum: the actual legacy loader runs.
  await writeFile(
    path.join(dir, 'loader.ts'),
    `enum Fixture { Value=7 }; if(Fixture.Value!==7)throw Error('LOADER_BAD'); console.log('LEGACY_LOADER_PASS');`
  );
  const connections = path.join(dir, 'connections.jsonl');
  await writeFile(connections, '', { mode: 0o600 });
  const env = Object.fromEntries(
    ['PATH', 'HOME', 'TMPDIR'].flatMap(k =>
      process.env[k] ? [[k, process.env[k]]] : []
    )
  );
  Object.assign(env, {
    NODE_OPTIONS:
      '--import=' + path.join(root, 'scripts/r8-package-network-guard.mjs'),
    R8_PACKAGE_GUARD_REPORT: connections,
    R8_PACKAGE_EXPECTED_TSX_IPC: path.join(
      os.tmpdir(),
      `tsx-${process.geteuid()}`,
      `${process.pid}.pipe`
    ),
  });
  const commands = [
    [
      'generate',
      [
        path.join(root, 'node_modules/drizzle-kit/bin.cjs'),
        'generate',
        '--config=' + path.join(dir, 'drizzle.config.ts'),
      ],
    ],
    [
      'check',
      [
        path.join(root, 'node_modules/drizzle-kit/bin.cjs'),
        'check',
        '--config=' + path.join(dir, 'drizzle.config.ts'),
      ],
    ],
    [
      'legacy-loader',
      [
        '--loader',
        path.join(root, 'node_modules/@esbuild-kit/esm-loader/dist/index.js'),
        path.join(dir, 'loader.ts'),
      ],
    ],
  ];
  for (const [name, args] of commands) {
    assert.equal(controller.signal.aborted, false, 'PACKAGE_CONTRACT_ABORTED');
    const logFile = path.join(dir, name + '.log');
    const result = await runOwnedCommand([process.execPath, ...args], {
      cwd: dir,
      env,
      logFile,
      timeoutMs: 30000,
      signal: controller.signal,
      killGraceMs: 0,
    });
    assert.equal(result.exitCode, 0, 'PACKAGE_CONTRACT_FAILED:' + name);
    if (name === 'legacy-loader')
      assert.match(await readFile(logFile, 'utf8'), /LEGACY_LOADER_PASS/);
  }
  const files = (await readdir(path.join(dir, 'generated'))).filter(f =>
    f.endsWith('.sql')
  );
  assert.equal(files.length, 1);
  const sql = await readFile(path.join(dir, 'generated', files[0]), 'utf8');
  assert.match(sql, /CREATE TABLE "r8_fixture"/);
  assert.match(sql, /"label" text NOT NULL/);
  const attempts = (await readFile(connections, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse);
  assert.ok(
    attempts.length <= 2 &&
      attempts.every(r => r.kind === 'optional-tsx-ipc-refused'),
    'PACKAGE_CONTRACT_ATTEMPTED_CONNECTION'
  );
  passed = true;
  console.log(
    JSON.stringify({
      kitGenerate: 'pass',
      kitCheck: 'pass',
      legacyLoader: 'pass',
      networkAttempts: 0,
      optionalParentIPCProbesRefused: attempts.length,
      ownedFixtureSQLFiles: 1,
      applicationSQLChanges: 0,
    })
  );
} catch {
  console.error('PACKAGE_CONTRACT_VERIFICATION_FAILED');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', abort);
  process.removeListener('SIGTERM', abort);
  if (passed) await rm(dir, { recursive: true, force: true });
}
