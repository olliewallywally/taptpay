import fs from 'fs';
const TOKEN = fs.readFileSync('.rev-token.txt','utf8').trim();
const BASE='http://localhost:5000';
const src = fs.readFileSync('server/routes.ts','utf8').split('\n');

// every GET route whose path has at least one :param
const routes=[];
src.forEach((l,i)=>{
  const m=l.match(/^\s*app\.get\(\s*["'`]([^"'`]+)["'`]/);
  if(m && m[1].includes(':') && m[1].startsWith('/api')) routes.push({line:i+1, path:m[1]});
});

const results=[];
for(const r of routes){
  // substitute a non-numeric token for every :param
  const probe = r.path.replace(/:([A-Za-z0-9_]+)\??/g,'abc');
  if(probe.includes('*')) continue;
  let code=0, body='';
  try{
    const res = await fetch(BASE+probe,{headers:{Authorization:'Bearer '+TOKEN}});
    code=res.status; body=(await res.text()).slice(0,90).replace(/\s+/g,' ');
  }catch(e){ code=-1; body=String(e.message).slice(0,60); }
  results.push({line:r.line, path:r.path, probe, code, body});
}
const bad = results.filter(r=>r.code>=500);
console.log('GET routes with params probed: '+results.length);
console.log('\n=== 5xx ON NON-NUMERIC ID ('+bad.length+') ===');
for(const b of bad) console.log(`  routes.ts:${b.line}  ${b.code}  ${b.probe}  :: ${b.body}`);
console.log('\n=== distribution of other codes ===');
const dist={}; for(const r of results) dist[r.code]=(dist[r.code]||0)+1;
console.log(dist);
