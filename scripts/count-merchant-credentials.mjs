// R0-T5 count-only preflight for historical merchant-stored Windcave credentials.
//
// R0-T5 stops all NEW merchant credential writes; R5 owns secure deletion or
// encryption of values already stored. Deciding that needs a count, and the plan
// permits only a count: "record only the count, never a value".
//
// This reads one aggregate row inside a READ ONLY transaction and prints counts.
// It never selects, logs or returns a credential value, and it refuses to run
// against a database the caller has not named.
import { connectionSettings } from './schema-fingerprint.mjs';

const fail = (code) => { throw new Error(code); };

export function parseArguments(argv) {
  const options = new Map();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) fail('CREDENTIAL_COUNT_INVALID_ARGUMENTS');
    if (options.has(match[1])) fail('CREDENTIAL_COUNT_INVALID_ARGUMENTS');
    options.set(match[1], match[2]);
  }
  const host = options.get('expected-host');
  const database = options.get('expected-database');
  if (!host || !database) fail('CREDENTIAL_COUNT_INVALID_ARGUMENTS');
  if ([...options.keys()].some((key) => !['expected-host', 'expected-database'].includes(key))) {
    fail('CREDENTIAL_COUNT_INVALID_ARGUMENTS');
  }
  return { host, database };
}

/**
 * The URI says which database the caller believes they reached; the server says
 * which one they actually reached. Both must match what the caller named, because
 * a URI alone can be redirected and ambient PG* variables can backfill it.
 */
export function assertTarget(expected, settings, server) {
  if (settings.host !== expected.host || settings.database !== expected.database) {
    fail('CREDENTIAL_COUNT_TARGET_MISMATCH');
  }
  if (server.current_database !== expected.database) fail('CREDENTIAL_COUNT_TARGET_MISMATCH');
}

export const COUNT_QUERY = `
  SELECT count(*)::int AS merchants,
         count(*) FILTER (WHERE windcave_api_key IS NOT NULL)::int AS with_credential,
         count(*) FILTER (WHERE windcave_api_key IS NOT NULL
                            AND btrim(windcave_api_key) <> '')::int AS with_nonempty_credential
    FROM public.merchants
`;

export async function countCredentials(client, expected, settings) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  try {
    const identity = await client.query('SELECT current_database(), current_user');
    assertTarget(expected, settings, identity.rows[0]);
    const counted = await client.query(COUNT_QUERY);
    return {
      database: identity.rows[0].current_database,
      role: identity.rows[0].current_user,
      ...counted.rows[0],
    };
  } finally {
    await client.query('ROLLBACK');
  }
}

export async function main(argv, env) {
  const expected = parseArguments(argv);
  const settings = connectionSettings({ FINGERPRINT_DATABASE_URL: env.CREDENTIAL_COUNT_DATABASE_URL });
  const { default: pg } = await import('pg');
  const client = new pg.Client(settings);
  await client.connect();
  try {
    return await countCredentials(client, expected, settings);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('count-merchant-credentials.mjs')) {
  try {
    process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2), process.env), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${/^(?:CREDENTIAL_COUNT|FINGERPRINT)_[A-Z_]+$/.test(error.message) ? error.message : 'CREDENTIAL_COUNT_FAILED'}\n`);
    process.exitCode = 1;
  }
}
