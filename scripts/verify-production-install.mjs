import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,copyFile,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import {assertNode22,runOwnedCommand} from './verify-ci-safety.mjs';

assertNode22();
const privateDir = await mkdtemp(path.join(tmpdir(), 'taptpay-r8-production-'));
const install = path.join(privateDir, 'install');
await mkdir(install);
const installEnv = Object.fromEntries(['PATH','HOME','TMPDIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY',
  'NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','npm_config_cache'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
Object.assign(installEnv, {npm_config_update_notifier: 'false', npm_config_audit: 'false'});
const runtimeEnv = {PATH: process.env.PATH, NODE_ENV: 'production', APP_ENV: 'production',
  DATABASE_TARGET: 'production', ENV_VALIDATION_MODE: 'enforce', PAYMENT_MODE: 'disabled'};
const hash = data => createHash('sha256').update(data).digest('hex');
const controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGINT',abort);process.once('SIGTERM',abort);
async function run(name, command, env, cwd, timeoutMs = 120000) {
  if(controller.signal.aborted)throw Error('PRODUCTION_PROOF_ABORTED');
  const logFile = path.join(privateDir, name+'.log');
  // This coordinator can itself be an owned CI child. Stop nested groups
  // immediately on cancellation, before the enclosing runner's kill grace.
  const result = await runOwnedCommand(command, {cwd,env,logFile,timeoutMs,signal:controller.signal,killGraceMs:0});
  assert.equal(result.timedOut, false, 'PRODUCTION_PROOF_TIMEOUT');
  assert.equal(result.aborted, false, 'PRODUCTION_PROOF_ABORTED');
  return {result,output: await readFile(logFile,'utf8')};
}
try {
  const lock = await readFile('package-lock.json');
  for (const name of ['package.json','package-lock.json']) await copyFile(name,path.join(install,name));
  await cp('dist',path.join(install,'dist'),{recursive:true});
  const installed = await run('install',['npm','ci','--omit=dev','--no-audit','--no-fund'],installEnv,install,180000);
  assert.equal(installed.result.exitCode,0,'PRODUCTION_INSTALL_FAILED');
  assert.equal(hash(await readFile(path.join(install,'package-lock.json'))),hash(lock),'PRODUCTION_LOCK_CHANGED');
  const connections = path.join(privateDir,'connections.jsonl');
  await writeFile(connections,'',{mode:0o600});
  const entry = await run('entry',['npm','start'],
    {...runtimeEnv,NODE_OPTIONS:'--import='+path.resolve('scripts/r8-build-guard.mjs'),
      npm_config_update_notifier:'false',npm_config_audit:'false',R8_BUILD_GUARD_REPORT:connections},install);
  // Intentionally omit DATABASE_URL: module resolution must reach the existing
  // fail-closed configuration gate without starting a daemon or touching a DB.
  assert.equal(entry.result.exitCode,1,'PRODUCTION_CONFIG_REFUSAL_REQUIRED');
  assert.match(entry.output,/ConfigValidationError: Configuration error \[database\]: DATABASE_URL/,'PRODUCTION_IMPORT_SAFETY_NOT_REACHED');
  assert.doesNotMatch(entry.output,/ERR_MODULE_NOT_FOUND/,'PRODUCTION_RUNTIME_DEPENDENCY_MISSING');
  assert.equal((await readFile(connections,'utf8')).length,0,'PRODUCTION_ENTRY_ATTEMPTED_CONNECTION');
  await build({entryPoints:['server/vite.ts'],outfile:path.join(install,'dist/static-module.mjs'),
    bundle:true,platform:'node',packages:'external',format:'esm',logLevel:'silent'});
  await copyFile('scripts/fixtures/r8-production-static.mjs',path.join(install,'dist/static-proof.mjs'));
  const served = await run('static',[process.execPath,'dist/static-proof.mjs'],{PATH:process.env.PATH},install);
  assert.equal(served.result.exitCode,0,'PRODUCTION_STATIC_FAILED');
  assert.equal(served.output.trim(),'PRODUCTION_STATIC_PASS');
  console.log(JSON.stringify({productionInstall:'pass',productionNpmStart:'pass',lockUnchanged:true,entryConfigRefusal:'pass',
    entryNetworkAttempts:0,staticServing:'pass'}));
} catch {
  console.error('PRODUCTION_INSTALL_VERIFICATION_FAILED');process.exitCode = 1;
} finally {
  // Only this invocation's newly created install. Raw child logs remain private.
  await rm(install,{recursive:true,force:true});
  process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);
}
