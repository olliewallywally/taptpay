import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function guardedBuild({cwd=process.cwd(),command=['npm','run','build'],env=process.env,stdio='inherit'}={}){
  const temporary=await mkdtemp(join(tmpdir(),'taptpay-build-'));
  const report=join(temporary,'connections.jsonl');
  try{
    await writeFile(report,'',{mode:0o600});
    const hook=fileURLToPath(new URL('./r8-build-guard.mjs',import.meta.url));
    const child=spawn(command[0],command.slice(1),{cwd,stdio,env:{...env,
      npm_config_update_notifier:'false',npm_config_audit:'false',
      R8_BUILD_GUARD_REPORT:report,NODE_OPTIONS:[env.NODE_OPTIONS,`--import=${hook}`].filter(Boolean).join(' ')}});
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?1:code));});
    assert.equal((await readFile(report,'utf8')).length,0,'BUILD_ATTEMPTED_NETWORK_OR_DATABASE');
    assert.equal(code,0,'BUILD_FAILED');
    return {status:'pass',networkConnections:0,migrations:0};
  }finally{await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    assert.equal(process.versions.node.split('.')[0],'22','NODE22_REQUIRED');
    const pkg=JSON.parse(await readFile('package.json','utf8'));
    assert.doesNotMatch(pkg.scripts.build,/db:(?:push|migrate|release)|drizzle/,'MIGRATION_IN_BUILD_COMMAND');
    console.log(JSON.stringify(await guardedBuild()));
  }catch{console.error('BUILD_VERIFICATION_FAILED');process.exitCode=1;}
}
