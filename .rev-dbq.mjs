import pg from 'pg';
const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes('localhost')?false:{rejectUnauthorized:false} });
await c.connect();
const q = async (label, sql) => {
  try { const r = await c.query(sql); console.log('==', label, '=='); console.table(r.rows); }
  catch(e){ console.log('==', label, 'ERROR:', e.message); }
};
await q('users', `select id, email, merchant_id, role, status from users order by id limit 20`);
await q('merchants', `select id, email, status, onboarding_completed, sector, gst_registered from merchants order by id limit 25`);
await q('subscriptions', `select merchant_id, plan_id, status, seat_limit, current_period_end, failed_payment_count, billing_card_last4 from subscriptions order by merchant_id limit 20`);
await q('tx counts', `select merchant_id, count(*) , max(created_at) from transactions group by merchant_id order by 2 desc limit 10`);
await q('tables', `select table_name from information_schema.tables where table_schema='public' order by 1`);
await c.end();
