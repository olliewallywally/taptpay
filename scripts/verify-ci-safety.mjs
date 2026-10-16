import {spawn} from 'node:child_process';
import {open,mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
export function assertNode22(version=process.versions.node){
  const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if(!m||Number(m[1])!==22||Number(m[2])<23||(Number(m[2])===23&&Number(m[3])<3)) throw Error('PINNED_NODE22_REQUIRED');
}
export function assertCIDatabase(raw,{marker,applicationUrls=[]}={}){
  try{
    if(marker!=='1')throw Error();
    const u=new URL(raw),db=decodeURIComponent(u.pathname.slice(1));
    if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'||u.hash||!/^r8_ci_[a-f0-9]{16}$/.test(db))throw Error();
    if(!u.username||!u.password||!u.port||Number(u.port)<1||Number(u.port)>65535)throw Error();
    const keys=[...u.searchParams.keys()];
    if(new Set(keys).size!==keys.length||keys.some(k=>!['sslmode','connect_timeout'].includes(k)))throw Error();
    if(u.searchParams.has('sslmode')&&u.searchParams.get('sslmode')!=='disable')throw Error();
    if(u.searchParams.has('connect_timeout')&&!/^(?:[1-9]|[12][0-9]|30)$/.test(u.searchParams.get('connect_timeout')))throw Error();
    for(const rawApp of applicationUrls.filter(Boolean)){
      const app=new URL(rawApp);
      if(app.hostname===u.hostname&&(app.port||'5432')===u.port&&decodeURIComponent(app.pathname.slice(1))===db)throw Error();
    }
    return {url:u,database:db};
  }catch{throw Error('CI_DATABASE_REFUSED');}
}
export function sanitizedStages(stages){
  return stages.map(s=>{
    if(!/^[a-z][a-z0-9-]{0,60}$/.test(s.name)||!['pass','fail'].includes(s.status))throw Error('INVALID_STAGE_REPORT');
    return {name:s.name,status:s.status,exitCode:Number.isInteger(s.exitCode)?s.exitCode:1};
  });
}
export function assertJestReport(report){
  if(!report||report.success!==true||!Number.isInteger(report.numTotalTests)||report.numTotalTests<1
    ||!Number.isInteger(report.numPassedTests)||report.numPassedTests<1
    ||report.numFailedTests!==0||report.numFailedTestSuites!==0
    ||!Array.isArray(report.openHandles)||report.openHandles.length)throw Error('UNIT_REPORT_FAILED');
}
export async function writeCIReport(directory,stages){
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'summary.json'),JSON.stringify({version:1,stages:sanitizedStages(stages)},null,2)+'\n',{mode:0o600});
}
async function waitForOwnedGroup(pgid){
  const until=performance.now()+2000;
  while(true){
    let running=false;
    if(process.platform==='linux'){
      for(const pid of (await readdir('/proc')).filter(p=>/^\d+$/.test(p))){
        let stat;
        try{stat=await readFile(`/proc/${pid}/stat`,'utf8');}
        catch(e){if(['ENOENT','ESRCH'].includes(e.code))continue;throw Error('OWNED_GROUP_STATUS_FAILED');}
        const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
        if(Number(fields[2])===pgid&&!['Z','X'].includes(fields[0])){running=true;break;}
      }
    }else{
      try{process.kill(-pgid,0);running=true;}catch(e){if(e.code!=='ESRCH')throw e;}
    }
    if(!running)return;
    if(performance.now()>=until)throw Error('OWNED_GROUP_DID_NOT_STOP');
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
export async function runOwnedCommand(command,{cwd=process.cwd(),env=process.env,logFile,timeoutMs=20*60*1000,signal,killGraceMs=1500}={}){
  if(!Array.isArray(command)||!command.length)throw Error('INVALID_COMMAND');
  if(!Number.isInteger(killGraceMs)||killGraceMs<0||killGraceMs>1500)throw Error('INVALID_KILL_GRACE');
  if(process.platform==='win32')throw Error('OWNED_VERIFIER_REQUIRES_POSIX');
  const file=await open(logFile,'w',0o600);
  const detached=process.platform!=='win32';
  let child,timedOut=false,aborted=false,forceDone;
  function stop(){
    // Only the session created by this spawn; never a supplied/ambient PID.
    if(!child?.pid||forceDone)return;
    const kill=sig=>{try{if(detached)process.kill(-child.pid,sig);else child.kill(sig);return true;}catch(e){if(e.code!=='ESRCH')throw e;return false;}};
    if(!kill('SIGTERM'))return;
    if(killGraceMs===0){kill('SIGKILL');forceDone=Promise.resolve();}
    else forceDone=new Promise(resolve=>setTimeout(()=>{kill('SIGKILL');resolve();},killGraceMs));
  }
  const onAbort=()=>{aborted=true;stop();};
  let timer;
  try{
    child=spawn(command[0],command.slice(1),{cwd,env,detached,stdio:['ignore',file.fd,file.fd]});
    signal?.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);timer.unref();
    if(signal?.aborted)onAbort();
    const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,sig)=>resolve(sig?1:code??1));});
    // The command's deadline ends at exit. Descendant teardown has its own
    // bounded grace; it must not turn an already successful exit into a timeout.
    clearTimeout(timer);
    stop(); // A successful parent must not leave browser/worker descendants alive.
    if(forceDone){await forceDone;await waitForOwnedGroup(child.pid);}
    return {exitCode:timedOut||aborted?1:exitCode,timedOut,aborted};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);await file.close();}
}
