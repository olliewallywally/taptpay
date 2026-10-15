import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUERIES, fingerprintDocument, serialise } from './schema-fingerprint-core.mjs';
export * from './schema-fingerprint-core.mjs';

const fail = (code) => { throw new Error(code); };

/** Refuses ambient DATABASE_URL, matching scripts/db-backup.mjs: an operator tool names its own target. */
export function connectionSettings(env) {
  const raw = env.FINGERPRINT_DATABASE_URL;
  if (typeof raw !== 'string' || raw === '') fail('FINGERPRINT_INVALID_CONNECTION');
  let url;
  try { url = new URL(raw); } catch { fail('FINGERPRINT_INVALID_CONNECTION'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) fail('FINGERPRINT_INVALID_CONNECTION');
  // A percent-encoded socket directory is not a host, and libpq would accept it.
  if (!url.hostname || url.hostname.includes('%')) fail('FINGERPRINT_INVALID_CONNECTION');
  if (url.port !== '' && !/^[1-9]\d{0,4}$/.test(url.port)) fail('FINGERPRINT_INVALID_CONNECTION');
  let database;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { fail('FINGERPRINT_INVALID_CONNECTION'); }
  if (!database || database.includes('/')) fail('FINGERPRINT_INVALID_CONNECTION');
  // Query options can redirect host/dbname/user behind the URI's back. Accept
  // only bounded transport settings, once each.
  // `channel_binding` is on this list because it cannot redirect anything - it
  // only hardens SCRAM against a MITM - and Neon issues it by default. Rejecting
  // it forced an operator to STRIP a security parameter to fingerprint their own
  // restore target, which is exactly backwards.
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length
      || keys.some((key) => !['sslmode', 'connect_timeout', 'channel_binding'].includes(key))) {
    fail('FINGERPRINT_INVALID_CONNECTION');
  }
  const binding = url.searchParams.get('channel_binding');
  if (binding !== null && !['disable', 'prefer', 'require'].includes(binding)) {
    fail('FINGERPRINT_INVALID_CONNECTION');
  }
  const mode = url.searchParams.get('sslmode');
  if (mode !== null && !['disable', 'require', 'verify-ca', 'verify-full'].includes(mode)) {
    fail('FINGERPRINT_INVALID_CONNECTION');
  }
  const timeout = url.searchParams.get('connect_timeout');
  if (timeout !== null && (!/^[1-9]\d*$/.test(timeout) || Number(timeout) > 60)) fail('FINGERPRINT_INVALID_CONNECTION');
  // Explicit fields, never the string: pg backfills anything a URI omits from
  // the ambient PG* environment.
  return {
    host: url.hostname, port: url.port === '' ? 5432 : Number(url.port),
    user: decodeURIComponent(url.username) || undefined,
    password: url.password === '' ? undefined : decodeURIComponent(url.password),
    database,
    ssl: mode === null || mode === 'disable' ? false : { rejectUnauthorized: mode !== 'require' },
  };
}

/** Reads the whole catalogue from one read-only snapshot. Never writes, never reads a table's rows. */
export async function collectSchema(client) {
  // REPEATABLE READ gives every collection the same catalogue state; READ ONLY
  // makes writing impossible whatever the connected role is allowed to do.
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  try {
    await client.query('SET LOCAL search_path = pg_catalog');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const rows = {};
    for (const [name, sql] of Object.entries(QUERIES)) rows[name] = (await client.query(sql)).rows;
    return rows;
  } finally {
    // Nothing was written, so the rollback is only about not leaving an open
    // snapshot behind; its failure must not mask the collection's own error.
    await client.query('ROLLBACK').catch(() => undefined);
  }
}

async function openClient(settings) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    ...settings, application_name: 'schema-fingerprint',
    connectionTimeoutMillis: 5_000, query_timeout: 65_000, statement_timeout: 60_000,
  });
  try { await client.connect(); } catch (error) { await client.end().catch(() => undefined); throw error; }
  return client;
}

export async function runFingerprint(argv, {
  env = process.env, connect = openClient, out = process.stdout, log = process.stderr,
} = {}) {
  if (argv.length !== 0) fail('FINGERPRINT_INVALID_ARGUMENTS');
  const settings = connectionSettings(env);
  let client;
  try { client = await connect(settings); } catch { fail('FINGERPRINT_CONNECT_FAILED'); }
  let rows;
  try { rows = await collectSchema(client); }
  // Never propagate the driver's message: it carries the host and database.
  catch { fail('FINGERPRINT_QUERY_FAILED'); }
  finally { await Promise.resolve(client?.end?.()).catch(() => undefined); }
  const document = fingerprintDocument(rows);
  out.write(serialise(document));
  const counts = Object.entries(document.fingerprint.counts).map(([key, value]) => `${key}=${value}`).join(' ');
  log.write(`SCHEMA_FINGERPRINT ${document.digest} ${counts}\n`);
  return document;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runFingerprint(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${/^FINGERPRINT_[A-Z_]+$/.test(error.message) ? error.message : 'FINGERPRINT_FAILED'}\n`);
    process.exitCode = 1;
  }
}
