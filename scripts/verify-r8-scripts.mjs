/** Run the actual development command prefix with a tiny owned watch entry. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { assertNode22, runOwnedCommand } from './verify-ci-safety.mjs';
assertNode22();
assert.equal(process.argv.length, 2, 'INVALID_SCRIPT_PROOF_ARGUMENT');
const root = fileURLToPath(new URL('../', import.meta.url)),
  dir = await mkdtemp(path.join(os.tmpdir(), 'taptpay-r8-watch-'));
const controller = new AbortController(),
  abort = () => controller.abort();
process.once('SIGTERM', abort);
process.once('SIGINT', abort);
let running,
  finished,
  passed = false;
try {
  const pkg = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8')
    ),
    tokens = pkg.scripts.dev.split(/\s+/);
  assert.equal(tokens[0], 'cross-env');
  assert.deepEqual(tokens.slice(-3), ['tsx', 'watch', 'server/index.ts']);
  const fixture = path.join(dir, 'fixture.ts'),
    logFile = path.join(dir, 'watch.log');
  const source = tag =>
    `const expected={APP_ENV:'development',DATABASE_TARGET:'local',ENV_VALIDATION_MODE:'audit',NODE_ENV:'development'};for(const [key,value] of Object.entries(expected))if(process.env[key]!==value)throw Error('BAD_SYNTHETIC_ENV');console.log('R8_WATCH_${tag}');setInterval(()=>{},1000);`;
  await writeFile(fixture, source('FIRST'));
  const env = Object.fromEntries(
    ['PATH', 'HOME', 'TMPDIR'].flatMap(k =>
      process.env[k] ? [[k, process.env[k]]] : []
    )
  );
  env.PATH = path.join(root, 'node_modules/.bin') + path.delimiter + env.PATH;
  env.CI = 'true';
  running = runOwnedCommand(
    [
      process.execPath,
      path.join(root, 'node_modules/cross-env/dist/bin/cross-env.js'),
      ...tokens.slice(1, -1),
      fixture,
    ],
    {
      cwd: dir,
      env,
      logFile,
      timeoutMs: 25000,
      signal: controller.signal,
      killGraceMs: 0,
    }
  ).then(r => {
    finished = r;
    return r;
  });
  async function observed(marker) {
    const until = performance.now() + 10000;
    while (performance.now() < until) {
      let text = '';
      try {
        text = await readFile(logFile, 'utf8');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      if (text.includes(marker)) return;
      assert.equal(controller.signal.aborted, false, 'SCRIPT_PROOF_ABORTED');
      assert.equal(finished, undefined, 'WATCH_ENDED_EARLY');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error('WATCH_MARKER_TIMEOUT');
  }
  await observed('R8_WATCH_FIRST');
  await writeFile(fixture, source('SECOND'));
  await observed('R8_WATCH_SECOND');
  controller.abort();
  const result = await running;
  assert.equal(result.timedOut, false);
  assert.equal(result.aborted, true);
  passed = true;
} catch {
  console.error('PORTABLE_SCRIPT_VERIFICATION_FAILED');
  process.exitCode = 1;
} finally {
  controller.abort();
  await running?.catch(() => undefined);
  process.removeListener('SIGTERM', abort);
  process.removeListener('SIGINT', abort);
  if (passed) await rm(dir, { recursive: true, force: true });
}
if (passed)
  console.log(
    JSON.stringify({
      crossEnv: 'pass',
      actualDevelopmentAssignments: 'pass',
      tsxWatchRestart: 'pass',
      ownedGroupStopped: true,
      applicationServerStarted: false,
    })
  );
