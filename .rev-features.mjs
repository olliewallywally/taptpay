import fs from 'fs';
const T = fs.readFileSync('.rev-token.txt','utf8').trim();
const B='http://localhost:5000';
const hit=async(m,p,body)=>{
  const r=await fetch(B+p,{method:m,headers:{Authorization:'Bearer '+T,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  let t=''; try{t=(await r.text()).slice(0,110).replace(/\s+/g,' ')}catch(e){}
  return {code:r.status,t};
};
const rows=[];
const go=async(label,m,p,body)=>{const r=await hit(m,p,body);rows.push({label,code:r.code,ok:r.code<400?'ok':'FAIL',body:r.t});};

// NOTE: deliberately excludes every endpoint that dispatches email/SMS (resend,
// send-balance, dispatch passes) — those are outward-facing.
await go('receipt QR (own txn 306)','GET','/api/transactions/306/receipt-qr');
await go('receipt PDF (own txn 306)','POST','/api/transactions/306/receipt-pdf',{});
await go('split-enabled ON (txn 315)','PATCH','/api/transactions/315/split-enabled',{splitEnabled:true});
await go('split-enabled OFF (txn 315)','PATCH','/api/transactions/315/split-enabled',{splitEnabled:false});
await go('checkout resolve (txn 315)','GET','/api/checkout/resolve/315');
await go('active transaction','GET','/api/merchants/22/active-transaction');
await go('cancel own test txn 315','POST','/api/transactions/315/cancel',{});
await go('analytics after sale','GET','/api/merchants/22/analytics');
await go('transactions list','GET','/api/merchants/22/transactions');
await go('property invoices list','GET','/api/property/invoices');
await go('trades quotes list','GET','/api/trades/quotes');
await go('subscription state','GET','/api/subscription');
await go('billing card state','GET','/api/billing/card');
console.table(rows);
for(const r of rows) if(r.ok==='FAIL') console.log('FAIL '+r.label+' -> '+r.code+' :: '+r.body);
