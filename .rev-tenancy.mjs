import fs from 'fs';
import pg from 'pg';
const TOKEN = fs.readFileSync('.rev-token.txt','utf8').trim();      // merchant 22, owner
const BASE = 'http://localhost:5000';

const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes('localhost')?false:{rejectUnauthorized:false} });
await c.connect();

// current state of the FOREIGN rows, so mutations can be sent as exact no-ops
const stock8 = (await c.query(`select * from stock_items where id=8`)).rows[0];
const stone5 = (await c.query(`select * from tapt_stones where id=5`)).rows[0];
const user5  = (await c.query(`select * from users where id=5`)).rows[0];
const snapBefore = JSON.stringify({stock8, stone5, user5});

const FOREIGN = {
  tenant32: 'cf7f107f-72c0-4131-91de-9691f1ce649d',
  client32: '8d1f0e4f-9b1b-4c83-aabc-7f474e59e426',
  quote32 : '529f6bfb-f69b-4da8-883a-6652fc876cb5',
  stock28 : 8,
  stone28 : 5,
  user27  : 5,
};
const OWN = {
  tenant: 'd56c4be9-e1e7-4a24-bd9b-11eb527b48ec',
  client: '8b021f92-8519-46ef-9b81-e9b71ebd9c79',
  quote : '903a4ab4-51bd-4346-8050-2459a62950de',
  stock : 7, stone: 4, txn: 306,
};

async function hit(method, path, body) {
  const r = await fetch(BASE+path, {
    method,
    headers: { Authorization:'Bearer '+TOKEN, ...(body?{'Content-Type':'application/json'}:{}) },
    body: body?JSON.stringify(body):undefined,
  });
  let t=''; try{ t=(await r.text()).slice(0,140).replace(/\s+/g,' '); }catch(e){}
  return { code:r.status, body:t };
}

const rows=[];
const probe = async (label, method, path, body, expectOwn) => {
  const r = await hit(method, path, body);
  const leak = !expectOwn && r.code>=200 && r.code<300;
  rows.push({label, method, path:path.slice(0,62), code:r.code, verdict: expectOwn ? (r.code<300?'ok(control)':'CONTROL-FAILED') : (leak?'*** CROSS-TENANT LEAK ***':'blocked'), body:r.body});
};

console.log('=== CONTROLS (own resources, expect 2xx) ===');
await probe('own trades client','GET',`/api/trades/clients/${OWN.client}`,null,true);
await probe('own quote','GET',`/api/trades/quotes/${OWN.quote}`,null,true);
await probe('own tenant','GET',`/api/property/tenants/${OWN.tenant}`,null,true);
await probe('own transaction','GET',`/api/transactions/${OWN.txn}`,null,true);

console.log('=== FOREIGN READS (expect 403/404) ===');
await probe('m32 trades client','GET',`/api/trades/clients/${FOREIGN.client32}`);
await probe('m32 client events','GET',`/api/trades/clients/${FOREIGN.client32}/events`);
await probe('m32 quote','GET',`/api/trades/quotes/${FOREIGN.quote32}`);
await probe('m32 quote pdf','GET',`/api/trades/quotes/${FOREIGN.quote32}/pdf`);
await probe('m32 tenant','GET',`/api/property/tenants/${FOREIGN.tenant32}`);
await probe('m32 tenant events','GET',`/api/property/tenants/${FOREIGN.tenant32}/events`);
await probe('m32 tenant schedules','GET',`/api/property/tenants/${FOREIGN.tenant32}/schedules`);
await probe('m28 tapt stone','GET',`/api/tapt-stones/${FOREIGN.stone28}`);

console.log('=== NESTED-PARENT CONFUSION: my merchantId in path + FOREIGN child id ===');
await probe('PUT m28 stock under m22','PUT',`/api/merchants/22/stock-items/${FOREIGN.stock28}`,
  { name: stock8?.name ?? 'x', price: stock8?.price ?? '1.00' });
await probe('DELETE-safe? skipped','GET',`/api/merchants/22/stock-items`,null,true);
await probe('PUT m28 stone under m22','PUT',`/api/merchants/22/tapt-stones/${FOREIGN.stone28}`,
  { name: stone5?.name ?? 'x' });

console.log('=== TEAM: foreign user id ===');
await probe('PUT foreign user status','PUT',`/api/team/${FOREIGN.user27}/status`, { status: user5?.status ?? 'active' });
await probe('POST foreign user resend','POST',`/api/team/${FOREIGN.user27}/resend`, {});

console.log('=== TRANSACTION-SCOPED ===');
await probe('GET refunds of own txn','GET',`/api/transactions/${OWN.txn}/refunds`,null,true);
await probe('PATCH split-enabled own','PATCH',`/api/transactions/${OWN.txn}/split-enabled`,{ enabled:false },true);

console.table(rows.map(r=>({label:r.label, m:r.method, code:r.code, verdict:r.verdict})));
console.log('\n--- response bodies for anything not blocked ---');
for(const r of rows) if(r.verdict.includes('LEAK')||r.verdict==='CONTROL-FAILED') console.log(r.verdict+' '+r.method+' '+r.path+' -> '+r.code+' :: '+r.body);

// verify nothing actually changed
const stock8b = (await c.query(`select * from stock_items where id=8`)).rows[0];
const stone5b = (await c.query(`select * from tapt_stones where id=5`)).rows[0];
const user5b  = (await c.query(`select * from users where id=5`)).rows[0];
const snapAfter = JSON.stringify({stock8:stock8b, stone5:stone5b, user5:user5b});
console.log('\nforeign rows unchanged after probe:', snapBefore===snapAfter);
await c.end();
