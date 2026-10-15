import { readPaymentDurabilityPreflight } from "./payment-durability-preflight";

/**
 * R3 integration (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md §5): the cutover gate
 * the owner runs, with the app stopped, before the first boot of the R3 build on a database an
 * earlier build has used. Counts only: no identifier, amount or other row value is returned.
 *
 * - A live retail attempt recorded by the pre-R3 route has no provider account or request
 *   fingerprint, so R3 can neither bind nor recover it. It must finish under the old build first.
 * - Earlier builds had no delivery loop: they announced their own events and left the outbox rows
 *   pending. R3's loop starts with the database, so it would announce them again. Those rows are
 *   retired, never delivered.
 */

type Query = { query(sql: string, values?: unknown[]): Promise<{ rows: any[] }> };

/** An outbox row an earlier build left: never claimed by any delivery loop, due before the cutover. */
const LEGACY_OUTBOX = `status='pending' AND attempt_count=0 AND targets_prepared_at IS NULL AND next_attempt_at<$1`;
const SOURCE = `CASE WHEN event_id IS NOT NULL THEN 'provider_settlement' WHEN transaction_event_id IS NOT NULL THEN 'transaction_event'
  WHEN job_event_id IS NOT NULL THEN 'job_event' ELSE 'subscription_event' END`;

function cutoverTime(before: Date): Date {
  if (!(before instanceof Date) || Number.isNaN(before.getTime())) throw new Error("invalid_cutover_time");
  return before;
}

export interface CutoverGate {
  ok: boolean;
  /** The names of the counts that block cutover. */
  blocking: string[];
  counts: Record<string, number>;
  liveRetailMissingExpectations: number;
  /** Undelivered rows by source and channel; only read when a cutover time is given. */
  legacyUndeliveredOutbox?: Record<string, Record<string, number>>;
}

export async function readCutoverGate(client: Query, before?: Date): Promise<CutoverGate> {
  const preflight = await readPaymentDurabilityPreflight(client);
  const blocking = Object.entries(preflight.counts).filter(([, n]) => n !== 0).map(([name]) => name);
  if (preflight.liveRetailMissingExpectations !== 0) blocking.push("liveRetailMissingExpectations");
  let legacyUndeliveredOutbox: CutoverGate["legacyUndeliveredOutbox"];
  if (before !== undefined) {
    const rows = (await client.query(`SELECT ${SOURCE} AS source,channel,count(*)::int AS n FROM payment_delivery_outbox
      WHERE ${LEGACY_OUTBOX} GROUP BY 1,2 ORDER BY 1,2`, [cutoverTime(before)])).rows;
    legacyUndeliveredOutbox = {};
    for (const row of rows) (legacyUndeliveredOutbox[row.source] ??= {})[row.channel] = row.n;
    if (rows.length) blocking.push("legacyUndeliveredOutbox");
  }
  return { ok: blocking.length === 0, blocking, counts: preflight.counts,
    liveRetailMissingExpectations: preflight.liveRetailMissingExpectations,
    ...(legacyUndeliveredOutbox ? { legacyUndeliveredOutbox } : {}) };
}

/** Marks the rows an earlier build left undelivered as complete, so they are never announced again.
 * A dry run (apply false) only counts them. */
export async function retireLegacyOutbox(client: Query, input: { before: Date; apply: boolean }): Promise<{ retired: number; eligible: number }> {
  const before = cutoverTime(input.before);
  const eligible = (await client.query(`SELECT count(*)::int AS n FROM payment_delivery_outbox WHERE ${LEGACY_OUTBOX}`, [before])).rows[0].n;
  if (!input.apply) return { retired: 0, eligible };
  const retired = (await client.query(`UPDATE payment_delivery_outbox SET status='complete',completed_at=now()
    WHERE ${LEGACY_OUTBOX} RETURNING id`, [before])).rows.length;
  return { retired, eligible };
}
