import { performance } from 'node:perf_hooks';
import { verifyMigrationState, type MigrationClient } from './migrate';
import { logOperation } from './structured-log';

// Canonical strict public-schema digest through frozen migration0049a.
// Kept in sync with the reviewed artifact by tests; never learned from the target.
export const READINESS_SCHEMA_DIGEST =
  'sha256:7c427b93f2e0a4c8ca48271faabbe07d641ee8a211d519364d6d0ea8002d3888';
export interface ReadinessSqlPool {
  connect(): Promise<MigrationClient & { release(destroy?: boolean): void }>;
}

/** One read-only snapshot; no ledger creation, DDL, application row scan or session state. */
export async function verifyReadinessSchema(
  pool: ReadinessSqlPool,
  options: { dir?: string; expectedDigest?: string } = {}
) {
  // @ts-expect-error The standalone canonical catalog helper is JavaScript.
  const core = await import('../scripts/schema-fingerprint-core.mjs');
  const { QUERIES, fingerprintDocument } = core;
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
    );
    await client.query("SET LOCAL statement_timeout='1s'");
    await client.query("SET LOCAL lock_timeout='1s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query('SET LOCAL search_path=pg_catalog');
    await verifyMigrationState(client, options.dir);
    const rows: Record<string, unknown[]> = {};
    for (const [name, sql] of Object.entries(QUERIES as Record<string, string>))
      rows[name] = (await client.query(sql)).rows;
    return (
      fingerprintDocument(rows).digest ===
      (options.expectedDigest ?? READINESS_SCHEMA_DIGEST)
    );
  } catch {
    broken = true;
    return false;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true;
    }
    client.release(broken);
  }
}

/** Cached validation expires even if a refresh stalls. Only one physical check. */
export class SchemaReadinessMonitor {
  private verifiedAt?: number;
  private verified = false;
  private stopped = false;
  private active?: Promise<void>;
  private answer?: Promise<boolean>;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly check: () => Promise<boolean>,
    private readonly options: {
      clock?: () => number;
      timeoutMs?: number;
      maxAgeMs?: number;
      refreshMs?: number;
    } = {}
  ) {}
  private now() {
    return (this.options.clock ?? (() => performance.now()))();
  }
  valid() {
    return (
      !this.stopped &&
      this.verified &&
      this.verifiedAt !== undefined &&
      this.now() - this.verifiedAt < (this.options.maxAgeMs ?? 90000)
    );
  }
  refresh(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    if (this.answer) return this.answer;
    let settle!: (ok: boolean) => void,
      expired = false;
    const answer = new Promise<boolean>(r => {
      settle = r;
    });
    this.answer = answer;
    const timeout = setTimeout(() => {
      expired = true;
      this.verified = false;
      logOperation('error', 'readiness_schema_timeout');
      settle(false);
    }, this.options.timeoutMs ?? 15000);
    this.active = Promise.resolve()
      .then(() => this.check())
      .then(
        ok => ok === true,
        () => false
      )
      .then(ok => {
        clearTimeout(timeout);
        this.active = undefined;
        this.answer = undefined;
        if (!expired && !this.stopped) {
          this.verified = ok;
          if (ok) this.verifiedAt = this.now();
          if (!ok) logOperation('error', 'readiness_schema_invalid');
          settle(ok);
        } else settle(false);
      });
    return answer;
  }
  start() {
    if (!this.stopped && !this.timer) {
      this.timer = setInterval(() => {
        void this.refresh();
      }, this.options.refreshMs ?? 60000);
      this.timer.unref();
    }
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  async drain() {
    await this.active;
  }
}
