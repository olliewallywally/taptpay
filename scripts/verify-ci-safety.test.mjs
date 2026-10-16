import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assertNode22,assertCIDatabase,sanitizedStages,runOwnedCommand,assertJestReport} from './verify-ci-safety.mjs';
test('unit evidence rejects zero tests and unresolved handles even with an exit-zero report',()=>{
  const good={success:true,numTotalTests:1,numPassedTests:1,numFailedTests:0,numFailedTestSuites:0,openHandles:[]};
  assert.doesNotThrow(()=>assertJestReport(good));
  for(const bad of [null,{...good,numTotalTests:0},{...good,numPassedTests:0},{...good,openHandles:[{}]},{...good,numFailedTests:1},{...good,success:false}])
    assert.throws(()=>assertJestReport(bad),/UNIT_REPORT_FAILED/);
});
test('normal command completion also tears down its owned descendants',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r8-normal-descendant-')),pidFile=join(dir,'pid');
  let pid;
  try{
    const code=`const cp=require('child_process'),fs=require('fs');const c=cp.spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setTimeout(()=>{console.log("PARENT_COMPLETED");process.exit(0);},200);`;
    // The execution deadline is shorter than the separate descendant kill grace.
    // Completing normally must cancel that deadline before cleanup starts.
    const result=await runOwnedCommand([process.execPath,'-e',code],{logFile:join(dir,'private.log'),timeoutMs:1000});
    assert.equal(result.exitCode,0,JSON.stringify({result,output:await readFile(join(dir,'private.log'),'utf8')}));
    pid=Number(await readFile(pidFile,'utf8'));
    let alive=false;
    try{alive=!/\) Z /.test(await readFile(`/proc/${pid}/stat`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    assert.equal(alive,false,'OWNED_DESCENDANT_STILL_RUNNING');
  }finally{
    if(Number.isInteger(pid)&&pid>1){try{process.kill(pid,'SIGKILL');}catch{/* already gone */}}
    await rm(dir,{recursive:true,force:true});
  }
});
const safe='postgres://fixture:synthetic@127.0.0.1:55440/r8_ci_0123456789abcdef?sslmode=disable';
test('database transport cannot fall back from port zero or an omitted password',()=>{
  assert.throws(()=>assertCIDatabase(safe.replace(':55440/',':0/'),{marker:'1'}),/CI_DATABASE_REFUSED/);
  assert.throws(()=>assertCIDatabase(safe.replace(':synthetic@','@'),{marker:'1'}),/CI_DATABASE_REFUSED/);
});
test('only the reviewed Node22 line runs the verifier',()=>{
  assert.doesNotThrow(()=>assertNode22('22.23.3'));
  for(const v of ['20.0.0','24.19.0','22.1.0','22.23.2','garbage'])assert.throws(()=>assertNode22(v),/PINNED_NODE22_REQUIRED/);
});
test('explicit uniquely named loopback targets pass and application identities never do',()=>{
  assert.equal(assertCIDatabase(safe,{marker:'1'}).database,'r8_ci_0123456789abcdef');
  assert.throws(()=>assertCIDatabase(safe,{marker:'1',applicationUrls:[safe.replace('fixture:synthetic','other:credentials')]}),/CI_DATABASE_REFUSED/);
});
for(const raw of [safe.replace('/r8_ci_0123456789abcdef','/production'),safe.replace('/r8_ci_0123456789abcdef','/dev'),safe.replace('/r8_ci_0123456789abcdef','/test'),safe.replace('127.0.0.1','db.example.test'),safe+'&host=external.example.test',safe+'&sslmode=disable',safe+'#fragment',safe.replace('postgres:','https:'),safe.replace('r8_ci_0123456789abcdef','r8_ci_0123456789abcdef%2Fother')])
  test('unsafe target fails before connecting: '+raw.replace(/fixture:synthetic@/,'[redacted]@'),()=>assert.throws(()=>assertCIDatabase(raw,{marker:'1'}),/CI_DATABASE_REFUSED/));
test('missing test marker is refused',()=>assert.throws(()=>assertCIDatabase(safe),/CI_DATABASE_REFUSED/));
test('sanitized reports never copy raw errors, URLs, logs or private values',()=>{
  const result=sanitizedStages([{name:'browser-phone',status:'fail',exitCode:1,error:'synthetic-private-value',url:safe,log:'raw output'}]);
  assert.deepEqual(result,[{name:'browser-phone',status:'fail',exitCode:1}]);
});
test('owned process completion preserves status and private output',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r8-child-'));
  try{
    const file=join(dir,'private.log');
    const result=await runOwnedCommand([process.execPath,'-e','console.log("private fixture");process.exit(7)'],{logFile:file});
    assert.equal(result.exitCode,7);assert.equal(result.timedOut,false);
    assert.match(await readFile(file,'utf8'),/private fixture/);
    const timeout=await runOwnedCommand([process.execPath,'-e','setInterval(()=>{},1000)'],{logFile:file,timeoutMs:100});
    assert.equal(timeout.exitCode,1);assert.equal(timeout.timedOut,true);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('immediate timeout teardown stops stubborn descendants before an enclosing runner exits',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r8-descendant-')),pidFile=join(dir,'pid');
  let pid;
  try{
    const code=`const cp=require('child_process'),fs=require('fs');const c=cp.spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000);`;
    const result=await runOwnedCommand([process.execPath,'-e',code],{logFile:join(dir,'private.log'),timeoutMs:800,killGraceMs:0});
    assert.equal(result.timedOut,true);
    pid=Number(await readFile(pidFile,'utf8'));
    let alive=false;
    try{alive=!/\) Z /.test(await readFile(`/proc/${pid}/stat`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    assert.equal(alive,false,'OWNED_DESCENDANT_STILL_RUNNING');
  }finally{
    if(Number.isInteger(pid)&&pid>1){try{process.kill(pid,'SIGKILL');}catch{/* already gone */}}
    await rm(dir,{recursive:true,force:true});
  }
});
test('invalid kill grace is refused before spawning a command',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r8-invalid-grace-')),logFile=join(dir,'not-created');
  try{
    for(const killGraceMs of [-1,1501,NaN,0.5])
      await assert.rejects(runOwnedCommand([process.execPath,'-e','process.exit(0)'],{logFile,killGraceMs}),/INVALID_KILL_GRACE/);
    await assert.rejects(readFile(logFile),{code:'ENOENT'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
