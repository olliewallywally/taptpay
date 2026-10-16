import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(root+p,'utf8');
test('project and every CI runner use the reviewed Node22 pin',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.ok(pkg.engines?.node?.includes('22'),'NODE22_ENGINE_REQUIRED');
  assert.ok(existsSync(root+'.nvmrc'),'NODE_VERSION_FILE_REQUIRED');
  assert.match(read('.nvmrc').trim(),/^22\.\d+\.\d+$/);
  const workflow=read('.github/workflows/verify.yml');
  assert.match(workflow,/node-version-file: \.nvmrc/);
  for(const name of ['verify:ci','verify:desktop','verify:tutorial','verify:chunk','verify:postgres','verify:build'])
    assert.ok(pkg.scripts[name],`VERIFIER_SCRIPT_REQUIRED: ${name}`);
});
test('CI uses disposable infrastructure and never consumes application secrets',()=>{
  const workflow=read('.github/workflows/verify.yml');
  assert.doesNotMatch(workflow,/\$\{\{\s*secrets\./,'APPLICATION_SECRET_IN_CI');
  assert.match(workflow,/permissions:\s*\n\s+contents: read/);
  assert.match(workflow,/TEST_DATABASE_URL/);
  assert.match(workflow,/postgres:/);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/,'REQUIRED_GATE_CANNOT_BE_ADVISORY');
});
test('failure artifact upload accepts only the sanitized report directory',()=>{
  const workflow=read('.github/workflows/verify.yml');
  assert.doesNotMatch(workflow,/path:\s*\|[\s\S]*?\/tmp\/dev\.log/,'RAW_LOG_UPLOAD');
  assert.match(workflow,/path:.*r8-sanitized/,'SANITIZED_REPORTS_REQUIRED');
});
test('native dependency versions, lock and Swift metadata stay in agreement',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
  const names=['@capacitor/core','@capacitor/cli','@capacitor/ios'];
  const versions=names.map(name=>pkg.dependencies[name]);
  assert.equal(new Set(versions).size,1);
  assert.match(versions[0],/^8\.\d+\.\d+$/);
  for(const name of names)assert.equal(lock.packages['node_modules/'+name].version,pkg.dependencies[name]);
  assert.ok(read('ios/App/CapApp-SPM/Package.swift').includes(`exact: "${versions[0]}"`));
});
test('browser CI schedules every device separately without dropping tutorial coverage',()=>{
  const workflow=read('.github/workflows/verify.yml');
  assert.match(workflow,/context: \[phone, tablet, desktop, desktop-short\]/);
  assert.match(workflow,/fail-fast: false/);
  assert.match(workflow,/--stage=browser --context=\$\{\{ matrix.context \}\}/);
  assert.match(workflow,/name: browser-\$\{\{ matrix.context \}\}-sanitized/);
});
