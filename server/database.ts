// NOTE: This module previously created its own connection via the
// `neon-http` (fetch-based) driver. That HTTP driver was observed serving
// stale reads for rows updated moments earlier via the WebSocket `Pool`
// connection in `./db` (same DATABASE_URL, same table) — e.g. a merchant's
// `onboardingCompleted`/`emailVerified` flags read back as `false` here long
// after they were committed as `true`. To keep the whole app reading a
// single consistent connection, this module now re-exports the same
// Pool-backed Drizzle instance used everywhere else instead of maintaining
// a second, independent connection.
import { db as sharedDb } from './db';

export function getDb() {
  return sharedDb;
}

export function isDatabaseConnected(): boolean {
  return getDb() !== null;
}