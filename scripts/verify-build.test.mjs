import test from 'node:test';
import assert from 'node:assert/strict';
import {guardedBuild} from './verify-build.mjs';
test('pure build work completes without a database or network',async()=>{
  assert.deepEqual(await guardedBuild({command:[process.execPath,'-e','process.stdout.write("synthetic build")'],stdio:'ignore'}),
    {status:'pass',networkConnections:0,migrations:0});
});
for(const type of ['tcp','tls'])test(`caught ${type} connection attempts still fail the build verification`,async()=>{
  const code=type==='tcp'?"require('net').connect(1,'127.0.0.1')":"require('tls').connect({host:'127.0.0.1',port:1})";
  await assert.rejects(guardedBuild({command:[process.execPath,'-e',`try { ${code} } catch {} process.exit(0)`],stdio:'ignore'}),/BUILD_ATTEMPTED_NETWORK_OR_DATABASE/);
});
