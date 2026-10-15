import { Pool } from '@neondatabase/serverless';
import { ApplicationHealth } from './application-health';
import {
  SchemaReadinessMonitor,
  verifyReadinessSchema,
} from './schema-readiness';
import { logOperation } from './structured-log';

/** Explicit bootstrap only; uses the configured Neon transport and a bounded pool. */
export function createReadinessRuntime(databaseUrl: string | undefined) {
  const pool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        max: 2,
        connectionTimeoutMillis: 1500,
        query_timeout: 1000,
      })
    : undefined;
  pool?.on('error', () =>
    logOperation('error', 'readiness_database_connection_lost')
  );
  const schema = new SchemaReadinessMonitor(async () =>
    pool ? verifyReadinessSchema(pool) : false
  );
  const database = async () =>
    !!pool && (await pool.query('SELECT 1 AS ready')).rows[0]?.ready === 1;
  const health = new ApplicationHealth({
    configValid: true,
    schemaValid: () => schema.valid(),
    probeTimeoutMs: 2500,
    database,
  });
  let closed: Promise<void> | undefined;
  return {
    health,
    schema,
    database,
    close: () => (closed ??= pool?.end() ?? Promise.resolve()),
  };
}
