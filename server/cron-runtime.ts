import { Pool } from '@neondatabase/serverless';
import { config } from './config';
import { CronCoordinator } from './durable-cron';
import { PostgresCronRepository } from './durable-cron-postgres';
import { logOperation } from './structured-log';
let coordinator: CronCoordinator | undefined, pool: Pool | undefined;
/** Construction starts no timer or query. No process-local production fallback. */
export function getCronCoordinator() {
  if (coordinator) return coordinator;
  if (!config.databaseUrl) return undefined;
  pool = new Pool({
    connectionString: config.databaseUrl,
    max: 2,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
  });
  pool.on('error', () =>
    logOperation('error', 'cron_database_connection_lost')
  );
  return (coordinator = new CronCoordinator(new PostgresCronRepository(pool)));
}
export async function closeCronCoordinator() {
  coordinator?.stop();
  await pool?.end();
}
