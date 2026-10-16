import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import https from 'node:https';
import {runOwnedCommand} from './verify-ci-safety.mjs';
test('the owned manual preview reaches actual readiness after seeding and stops on abort', {timeout:25000}, async()=>{
  const out=await mkdtemp(path.join(tmpdir(),'r8-ready-preview-')),probe=net.createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  const controller=new AbortController();
  let completed;
  const owned=runOwnedCommand([process.execPath,'--import','tsx','scripts/verify-r1-t10-device-matrix.ts',
    out,path.resolve('client/public/app'),'--manual-preview','--preview-origin',`https://localhost:${port}`,'--preview-port',String(port)],{
    env:{PATH:process.env.PATH},logFile:path.join(out,'private.log'),signal:controller.signal,timeoutMs:20000,
  }).then(result=>{completed=result;return result;});
  try{
    const until=performance.now()+15000;
    let ca;
    while(!ca&&performance.now()<until&&!completed){
      try{ca=await readFile(path.join(out,'manual-preview-cert.pem'));}catch(e){if(e.code!=='ENOENT')throw e;}
      if(!ca)await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ca,'PREVIEW_DID_NOT_BOOT');
    const get=pathname=>new Promise((resolve,reject)=>{
      const req=https.get({hostname:'127.0.0.1',port,path:pathname,ca,servername:'localhost',timeout:3000},res=>{
        let body='';res.on('data',chunk=>{body+=chunk;});res.once('end',()=>resolve({status:res.statusCode,body}));
      });req.once('error',reject);req.once('timeout',()=>req.destroy(new Error('PREVIEW_TIMEOUT')));
    });
    const ready=await get('/readyz');
    assert.equal(ready.status,200);assert.equal(JSON.parse(ready.body).status,'ready');
    const acceptance=await get('/__acceptance');
    assert.equal(acceptance.status,200);assert.match(acceptance.body,/Synthetic acceptance preview/);
  }finally{
    controller.abort();
    const stopped=await owned;
    assert.equal(stopped.aborted,true);
    await rm(out,{recursive:true,force:true});
  }
});
