import pg from 'pg';
const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes('localhost')?false:{rejectUnauthorized:false} });
await c.connect();
const q = async (l, s) => { try { const r = await c.query(s); console.log('==',l,'=='); console.table(r.rows);} catch(e){console.log('==',l,'ERR:',e.message);} };
await q('subs', `select merchant_id, plan_id, status, seat_limit, billing_card_last4, billing_card_token is not null as has_token, current_period_end, failed_payment_count, last_billing_date from merchant_subscriptions order by merchant_id`);
await q('merchants', `select id, business_name, email, status, onboarding_completed, business_type from merchants order by id`);
await c.end();
