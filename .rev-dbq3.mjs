import pg from 'pg';
const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes('localhost')?false:{rejectUnauthorized:false} });
await c.connect();
const cols = await c.query(`select column_name from information_schema.columns where table_name='merchant_subscriptions' order by ordinal_position`);
console.log('merchant_subscriptions cols:', cols.rows.map(r=>r.column_name).join(', '));
const r = await c.query(`select * from merchant_subscriptions order by merchant_id`);
console.table(r.rows);
await c.end();
