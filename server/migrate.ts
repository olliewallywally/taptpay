/**
 * SQL migration runner.
 *
 * Why this exists
 * ---------------
 * The `migrations/*.sql` files were checked in but nothing ever applied them:
 * `drizzle.__drizzle_migrations` was empty, the startup `drizzle-kit push` is
 * opt-in behind `RUN_SCHEMA_PUSH`/`RUN_MIGRATIONS`, and everything else was
 * applied by hand. That let the dev database fall three migrations behind
 * `shared/schema.ts`, and because Drizzle's `select()` enumerates every column
 * declared in the schema, a single missing column ("billing_claim_token") took
 * the whole app down after login.
 *
 * This runner makes "which migrations has this database actually seen?" a
 * recorded fact instead of folklore.
 *
 * Design decisions
 * ----------------
 * 1. `pg` (not `@neondatabase/serverless`). DDL needs a real session-scoped
 *    connection with honest transaction semantics.
 *
 * 2. Ordering is plain lexical (UTF-16 code unit) order, never `localeCompare`
 *    — ICU collation treats `_` as variable-weight punctuation and can reorder
 *    `0010_...` vs `0010a_...`. `_` is 0x5F and `a` is 0x61, so `0010_` sorts
 *    before `0010a_`, which is exactly the order `0010a` documents it needs
 *    (it must run before `0011`). `assertLexicalMigrationOrder` asserts this
 *    rather than trusting it: every filename must carry a 4-digit zero-padded
 *    prefix with an optional lowercase letter suffix, and lexical order must
 *    agree with (numeric prefix, letter suffix) order.
 *
 * 3. Embedded BEGIN/COMMIT: the migration files are inconsistent — 0000-0006
 *    have no transaction control, 0007-0013 wrap themselves in `BEGIN;`/
 *    `COMMIT;`. Running them as-is would mean the ledger INSERT could not share
 *    a transaction with the migration (the file would already have committed),
 *    so a crash between the two would leave an applied-but-unrecorded
 *    migration. Wrapping them as-is instead produces nested-transaction
 *    warnings and a file that self-commits halfway through the outer
 *    transaction.
 *
 *    So: we parse each file into top-level statements with a scanner that
 *    understands line/block comments, single- and double-quoted literals and
 *    dollar-quoted bodies (`$$ ... $$`, so `DO $$ BEGIN ... END $$;` stays one
 *    statement and its inner BEGIN/END is never mistaken for transaction
 *    control), drop the top-level transaction-control statements, and run the
 *    remainder plus the ledger INSERT inside one transaction we own. Migration
 *    applied <=> ledger row present, atomically. This is behaviour-preserving
 *    for the current files: every self-transacting migration is wholly wrapped,
 *    with no statements before BEGIN or after COMMIT.
 *
 * 4. The ledger lives in the `drizzle` schema, not `public`. `drizzle-kit push`
 *    diffs `public` against `shared/schema.ts` and would offer to DROP an
 *    unknown `public` table; the `drizzle` schema is already outside its view.
 *
 * 5. `--baseline` records migrations as applied WITHOUT executing them, for
 *    adopting this runner on a database that already has their effects. It is
 *    deliberately awkward to trigger: it needs a second `--confirm` flag, it
 *    refuses on a database whose `public` schema has no tables (baselining an
 *    empty database would permanently skip the entire schema), and it refuses
 *    if the ledger already has rows unless `--force`.
 *
 * Usage
 * -----
 *   npm run db:migrate                          apply pending migrations
 *   npm run db:migrate:status                   report only, touches nothing
 *   npm run db:migrate -- --dry-run             list what would be applied
 *   npm run db:migrate:baseline                 print the baseline plan, refuse
 *   npm run db:migrate:baseline -- --confirm    record as applied, run nothing
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { findMissingBaselineEffects } from "./migration-baseline-contract";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Schema holding the ledger. Outside `public` so `drizzle-kit push` ignores it. */
export const LEDGER_SCHEMA = "drizzle";
export const LEDGER_TABLE = "applied_migrations";
export const LEDGER_QUALIFIED = `${LEDGER_SCHEMA}.${LEDGER_TABLE}`;

/** Repo-relative directory holding the checked-in `*.sql` migrations. */
export const MIGRATIONS_DIRNAME = "migrations";

export function defaultMigrationsDir(): string {
  return path.resolve(process.cwd(), MIGRATIONS_DIRNAME);
}

// ---------------------------------------------------------------------------
// Minimal client interface (so tests can inject a fake; no live DB required)
// ---------------------------------------------------------------------------

export interface QueryResultLike<Row = any> {
  rows: Row[];
}

export interface MigrationClient {
  query<Row = any>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResultLike<Row>>;
}

// ---------------------------------------------------------------------------
// Filenames and ordering
// ---------------------------------------------------------------------------

/**
 * `0013_subscription_plans.sql` -> { numeric: 13, letter: "", rest: "..." }
 * `0010a_reconcile...sql`       -> { numeric: 10, letter: "a", rest: "..." }
 */
const MIGRATION_NAME_PATTERN = /^(\d{4})([a-z]*)_([^/\\]*)\.sql$/;

export interface ParsedMigrationName {
  filename: string;
  numeric: number;
  letter: string;
  rest: string;
}

export function parseMigrationName(filename: string): ParsedMigrationName | null {
  const match = MIGRATION_NAME_PATTERN.exec(filename);
  if (!match) return null;
  return {
    filename,
    numeric: Number.parseInt(match[1], 10),
    letter: match[2],
    rest: match[3],
  };
}

/**
 * Sort by UTF-16 code unit, explicitly NOT `localeCompare`: locale collation
 * can treat `_` as ignorable punctuation and flip `0010_x` / `0010a_y`.
 */
export function sortMigrationFiles(filenames: readonly string[]): string[] {
  return [...filenames].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Assert that lexical order is a safe apply order, instead of assuming it.
 *
 * Catches the two ways a future filename could silently reorder the run:
 * a non-conforming name (`10_foo.sql`, `0010A_foo.sql`, `0010a-foo.sql`), or a
 * name whose lexical position disagrees with its numeric position.
 */
export function assertLexicalMigrationOrder(filenames: readonly string[]): string[] {
  const lexical = sortMigrationFiles(filenames);

  const parsed: ParsedMigrationName[] = [];
  const malformed: string[] = [];
  for (const filename of lexical) {
    const entry = parseMigrationName(filename);
    if (entry) parsed.push(entry);
    else malformed.push(filename);
  }

  if (malformed.length > 0) {
    throw new Error(
      `Migration filenames must look like 0000_name.sql (4-digit zero-padded ` +
        `prefix, optional lowercase letter suffix, then "_"). Offending: ` +
        `${malformed.join(", ")}. Lexical apply order cannot be trusted until ` +
        `they are renamed.`,
    );
  }

  const semantic = [...parsed].sort((a, b) => {
    if (a.numeric !== b.numeric) return a.numeric - b.numeric;
    if (a.letter !== b.letter) return a.letter < b.letter ? -1 : 1;
    return a.rest < b.rest ? -1 : a.rest > b.rest ? 1 : 0;
  });

  for (let i = 0; i < semantic.length; i += 1) {
    if (semantic[i].filename !== lexical[i]) {
      throw new Error(
        `Migration ordering is ambiguous: lexical order and numeric order ` +
          `disagree at position ${i} (lexical="${lexical[i]}", ` +
          `numeric="${semantic[i].filename}"). Rename the migrations so both ` +
          `agree before running them.`,
      );
    }
  }

  return lexical;
}

/** Read `migrations/*.sql`, ordered, with the ordering invariant asserted. */
export function listMigrationFiles(dir: string = defaultMigrationsDir()): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch (error) {
    throw new Error(
      `Cannot read migrations directory ${dir}: ${(error as Error).message}`,
    );
  }
  const sqlFiles = entries.filter((name) => name.endsWith(".sql"));
  return assertLexicalMigrationOrder(sqlFiles);
}

// ---------------------------------------------------------------------------
// Checksums
// ---------------------------------------------------------------------------

/**
 * SHA-256 over the migration text, normalised for a UTF-8 BOM and CRLF line
 * endings so a Windows checkout does not raise false drift. This means the
 * value will not match a bare `sha256sum` of a CRLF copy of the file — that is
 * the intended trade: false drift alarms are worse than shell-comparability.
 */
export function checksumMigrationSource(source: string): string {
  const normalised = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalised, "utf8").digest("hex");
}

export function readMigrationSource(dir: string, filename: string): string {
  return fs.readFileSync(path.join(dir, filename), "utf8");
}

export function checksumMigrationFile(dir: string, filename: string): string {
  return checksumMigrationSource(readMigrationSource(dir, filename));
}

// ---------------------------------------------------------------------------
// SQL scanning: split into top-level statements, drop transaction control
// ---------------------------------------------------------------------------

export interface SqlChunk {
  /** Exact source slice. Chunks are contiguous and cover the whole input. */
  raw: string;
  /** Comment-stripped, whitespace-collapsed, upper-cased, no trailing `;`. */
  normalized: string;
  /** Only whitespace and/or comments. */
  isEmpty: boolean;
  /** A top-level BEGIN/COMMIT/ROLLBACK/... that we must not send ourselves. */
  isTransactionControl: boolean;
  startOffset: number;
  /** 1-based line number of the chunk start, for error messages. */
  line: number;
}

function isIdentStart(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z_\u0080-\uffff]/.test(ch);
}

function isIdentPart(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_\u0080-\uffff]/.test(ch);
}

/**
 * If a dollar-quote tag opens at `i`, return the tag (`$$`, `$body$`, ...).
 * `$1` and `$` followed by anything else are not dollar quotes.
 */
function matchDollarTag(sql: string, i: number): string | null {
  if (sql[i] !== "$") return null;
  let j = i + 1;
  if (sql[j] === "$") return sql.slice(i, j + 1);
  if (!isIdentStart(sql[j])) return null;
  j += 1;
  while (isIdentPart(sql[j])) j += 1;
  if (sql[j] !== "$") return null;
  return sql.slice(i, j + 1);
}

/** Index just past a single-quoted literal starting at `i`. */
function skipSingleQuoted(sql: string, i: number, escapeString: boolean): number {
  let j = i + 1;
  while (j < sql.length) {
    const ch = sql[j];
    if (escapeString && ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === "'") {
      if (sql[j + 1] === "'") {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  return sql.length;
}

/** Index just past a double-quoted identifier starting at `i`. */
function skipDoubleQuoted(sql: string, i: number): number {
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === '"') {
      if (sql[j + 1] === '"') {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  return sql.length;
}

/** Index just past a `-- ...` comment (newline included). */
function skipLineComment(sql: string, i: number): number {
  const newline = sql.indexOf("\n", i);
  return newline === -1 ? sql.length : newline + 1;
}

// Index just past a slash-star block comment. Postgres nests these, so track depth.
function skipBlockComment(sql: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < sql.length) {
    if (sql[j] === "/" && sql[j + 1] === "*") {
      depth += 1;
      j += 2;
      continue;
    }
    if (sql[j] === "*" && sql[j + 1] === "/") {
      depth -= 1;
      j += 2;
      if (depth === 0) return j;
      continue;
    }
    j += 1;
  }
  return sql.length;
}

/** True when the `'` at `i` opens an `E'...'` backslash-escape string. */
function isEscapeStringStart(sql: string, i: number): boolean {
  const prev = sql[i - 1];
  if (prev !== "E" && prev !== "e") return false;
  return !isIdentPart(sql[i - 2]);
}

/**
 * Remove comments while preserving string and dollar-quoted content, so a
 * statement can be classified without corrupting anything we will execute.
 * The result is used ONLY for classification — execution always uses `raw`.
 */
export function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "-" && sql[i + 1] === "-") {
      const end = skipLineComment(sql, i);
      out += "\n";
      i = end;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const end = skipBlockComment(sql, i);
      out += " ";
      i = end;
      continue;
    }
    if (ch === "'") {
      const end = skipSingleQuoted(sql, i, isEscapeStringStart(sql, i));
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '"') {
      const end = skipDoubleQuoted(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    const tag = matchDollarTag(sql, i);
    if (tag) {
      const close = sql.indexOf(tag, i + tag.length);
      const end = close === -1 ? sql.length : close + tag.length;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function normalizeStatement(raw: string): string {
  return stripSqlComments(raw)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;+$/, "")
    .trim()
    .toUpperCase();
}

/**
 * Transaction-control statements we must strip because we supply our own
 * transaction. Deliberately does NOT match SAVEPOINT / RELEASE SAVEPOINT /
 * ROLLBACK TO SAVEPOINT, which are legal inside our transaction and must
 * survive.
 */
export function isTransactionControlStatement(normalized: string): boolean {
  if (/^(?:BEGIN|START TRANSACTION|COMMIT|END|ROLLBACK|ABORT)$/.test(normalized)) {
    return true;
  }
  if (/^(?:BEGIN|COMMIT|END|ROLLBACK|ABORT) (?:WORK|TRANSACTION)$/.test(normalized)) {
    return true;
  }
  if (
    /^(?:BEGIN(?: WORK| TRANSACTION)?|START TRANSACTION) (?:ISOLATION LEVEL |READ ONLY|READ WRITE|DEFERRABLE|NOT DEFERRABLE)/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (
    /^(?:COMMIT|END|ROLLBACK)(?: WORK| TRANSACTION)? AND (?:NO )?CHAIN$/.test(normalized)
  ) {
    return true;
  }
  return false;
}

/**
 * Split SQL into top-level statements. Understands `--` and nested block
 * comments, `'...'` (incl. `E'...'`), `"..."` and `$tag$...$tag$`, so
 * semicolons inside a `DO $$ ... $$` body never split a statement.
 *
 * The returned chunks are contiguous and lossless: joining every `raw`
 * reproduces the input byte for byte.
 */
export function splitSqlStatements(sql: string): SqlChunk[] {
  const chunks: SqlChunk[] = [];
  let start = 0;
  let i = 0;

  const push = (from: number, to: number) => {
    const raw = sql.slice(from, to);
    const normalized = normalizeStatement(raw);
    chunks.push({
      raw,
      normalized,
      isEmpty: normalized === "",
      isTransactionControl:
        normalized !== "" && isTransactionControlStatement(normalized),
      startOffset: from,
      line: sql.slice(0, from).split("\n").length,
    });
  };

  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "-" && sql[i + 1] === "-") {
      i = skipLineComment(sql, i);
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      i = skipBlockComment(sql, i);
      continue;
    }
    if (ch === "'") {
      i = skipSingleQuoted(sql, i, isEscapeStringStart(sql, i));
      continue;
    }
    if (ch === '"') {
      i = skipDoubleQuoted(sql, i);
      continue;
    }
    const tag = matchDollarTag(sql, i);
    if (tag) {
      const close = sql.indexOf(tag, i + tag.length);
      i = close === -1 ? sql.length : close + tag.length;
      continue;
    }
    if (ch === ";") {
      push(start, i + 1);
      i += 1;
      start = i;
      continue;
    }
    i += 1;
  }

  if (start < sql.length) push(start, sql.length);
  return chunks;
}

/** Executable statements only: comments/whitespace and transaction control removed. */
export function executableStatements(sql: string): SqlChunk[] {
  return splitSqlStatements(sql).filter(
    (chunk) => !chunk.isEmpty && !chunk.isTransactionControl,
  );
}

// ---------------------------------------------------------------------------
// Planning: compare files on disk against the ledger
// ---------------------------------------------------------------------------

export interface LedgerRow {
  filename: string;
  checksum: string;
  applied_at?: Date | string | null;
  baselined?: boolean | null;
}

export interface DriftRecord {
  filename: string;
  recordedChecksum: string;
  actualChecksum: string;
  appliedAt?: Date | string | null;
}

export interface MigrationPlan {
  /** Every `*.sql` on disk, in apply order. */
  ordered: string[];
  /** Recorded and unchanged since. */
  applied: string[];
  /** On disk, never recorded — these are what a run would execute. */
  pending: string[];
  /** Recorded, but the file changed since. Fatal. */
  drifted: DriftRecord[];
  /** Recorded, but the file is gone from disk. Warning. */
  orphaned: string[];
  /** Pending files that sort before something already applied. Warning. */
  outOfOrder: string[];
}

export function planMigrations(
  ordered: readonly string[],
  checksums: ReadonlyMap<string, string>,
  ledger: readonly LedgerRow[],
): MigrationPlan {
  const recorded = new Map<string, LedgerRow>();
  for (const row of ledger) recorded.set(row.filename, row);

  const applied: string[] = [];
  const pending: string[] = [];
  const drifted: DriftRecord[] = [];

  for (const filename of ordered) {
    const row = recorded.get(filename);
    if (!row) {
      pending.push(filename);
      continue;
    }
    const actual = checksums.get(filename);
    if (actual !== undefined && actual !== row.checksum) {
      drifted.push({
        filename,
        recordedChecksum: row.checksum,
        actualChecksum: actual,
        appliedAt: row.applied_at ?? null,
      });
      continue;
    }
    applied.push(filename);
  }

  const onDisk = new Set(ordered);
  const orphaned = ledger
    .map((row) => row.filename)
    .filter((filename) => !onDisk.has(filename));

  const lastApplied = [...applied, ...drifted.map((d) => d.filename)].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  ).pop();
  const outOfOrder =
    lastApplied === undefined
      ? []
      : pending.filter((filename) => filename < lastApplied);

  return {
    ordered: [...ordered],
    applied,
    pending,
    drifted,
    orphaned: sortMigrationFiles(orphaned),
    outOfOrder,
  };
}

/** Read every migration's checksum from disk. */
export function checksumAll(
  dir: string,
  filenames: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const filename of filenames) {
    map.set(filename, checksumMigrationFile(dir, filename));
  }
  return map;
}

export function describeDrift(drifted: readonly DriftRecord[]): string {
  return drifted
    .map(
      (d) =>
        `  • ${d.filename}\n` +
        `      recorded checksum : ${d.recordedChecksum}\n` +
        `      file checksum now : ${d.actualChecksum}\n` +
        `      recorded at       : ${d.appliedAt ?? "unknown"}`,
    )
    .join("\n");
}

export class MigrationChecksumDriftError extends Error {
  readonly drifted: readonly DriftRecord[];

  constructor(drifted: readonly DriftRecord[]) {
    super(
      `Migration checksum drift detected — ${drifted.length} already-applied ` +
        `migration file(s) changed after they were recorded as applied:\n` +
        `${describeDrift(drifted)}\n` +
        `Refusing to run. An applied migration file must be immutable: the ` +
        `database was changed by the OLD contents, so the new contents have ` +
        `never run anywhere. Fix by reverting the file, or by writing the ` +
        `change as a NEW migration. Only if you are certain the recorded row ` +
        `is wrong should you correct ${LEDGER_QUALIFIED} by hand.`,
    );
    this.name = "MigrationChecksumDriftError";
    this.drifted = drifted;
  }
}
export class MigrationHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationHistoryError";
  }
}


// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export const CREATE_LEDGER_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS ${LEDGER_SCHEMA}`;

export const CREATE_LEDGER_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${LEDGER_QUALIFIED} (
  filename      text PRIMARY KEY,
  checksum      text NOT NULL,
  applied_at    timestamptz NOT NULL DEFAULT now(),
  execution_ms  integer,
  baselined     boolean NOT NULL DEFAULT false
)`;

export const SELECT_LEDGER_SQL = `SELECT filename, checksum, applied_at, baselined FROM ${LEDGER_QUALIFIED}`;

export const INSERT_LEDGER_SQL = `INSERT INTO ${LEDGER_QUALIFIED} (filename, checksum, execution_ms, baselined) VALUES ($1, $2, $3, $4)`;

export const ACQUIRE_MIGRATION_LOCK_SQL =
  "SELECT pg_advisory_lock(hashtext('taptpay:migration-runner'))";
export const RELEASE_MIGRATION_LOCK_SQL =
  "SELECT pg_advisory_unlock(hashtext('taptpay:migration-runner'))";

/** Serialize deploys for the full plan/apply/baseline operation. */
export async function withMigrationAdvisoryLock<T>(
  client: MigrationClient,
  work: () => Promise<T>,
): Promise<T> {
  await client.query(ACQUIRE_MIGRATION_LOCK_SQL);
  try {
    return await work();
  } finally {
    await client.query(RELEASE_MIGRATION_LOCK_SQL).catch(() => undefined);
  }
}

/** Postgres "relation does not exist". */
const UNDEFINED_TABLE = "42P01";
/** Postgres "schema does not exist". */
const INVALID_SCHEMA_NAME = "3F000";

export function isMissingLedgerError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === UNDEFINED_TABLE || code === INVALID_SCHEMA_NAME;
}

export async function ensureMigrationLedger(client: MigrationClient): Promise<void> {
  await client.query(CREATE_LEDGER_SCHEMA_SQL);
  await client.query(CREATE_LEDGER_TABLE_SQL);
}

export async function readMigrationLedger(
  client: MigrationClient,
): Promise<LedgerRow[]> {
  const result = await client.query<LedgerRow>(SELECT_LEDGER_SQL);
  return result.rows;
}

/**
 * Read the ledger without creating it. Returns `null` when the ledger has
 * never been initialised — used by the read-only startup check, which must not
 * have schema side effects.
 */
export async function readMigrationLedgerIfPresent(
  client: MigrationClient,
): Promise<LedgerRow[] | null> {
  try {
    return await readMigrationLedger(client);
  } catch (error) {
    if (isMissingLedgerError(error)) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export class MigrationExecutionError extends Error {
  readonly filename: string;

  constructor(filename: string, statementLine: number, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Migration ${filename} failed at the statement starting on line ` +
        `${statementLine}: ${detail}. The transaction was rolled back — this ` +
        `migration is NOT applied and NOT recorded.`,
    );
    this.name = "MigrationExecutionError";
    this.filename = filename;
    (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Apply one migration: its statements plus the ledger row, in a single
 * transaction we own. The file's own BEGIN/COMMIT is stripped first.
 */
export async function applyMigration(
  client: MigrationClient,
  filename: string,
  source: string,
): Promise<{ statements: number; durationMs: number }> {
  const checksum = checksumMigrationSource(source);
  const statements = executableStatements(source);
  const startedAt = Date.now();

  await client.query("BEGIN");
  try {
    for (const statement of statements) {
      try {
        await client.query(statement.raw);
      } catch (error) {
        throw new MigrationExecutionError(filename, statement.line, error);
      }
    }
    const durationMs = Date.now() - startedAt;
    await client.query(INSERT_LEDGER_SQL, [filename, checksum, durationMs, false]);
    await client.query("COMMIT");
    return { statements: statements.length, durationMs };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export interface RunResult {
  plan: MigrationPlan;
  appliedNow: string[];
}

export interface RunOptions {
  dir?: string;
  dryRun?: boolean;
  log?: (message: string) => void;
}

/** Apply every pending migration, in order, aborting on the first failure. */
export async function runPendingMigrations(
  client: MigrationClient,
  options: RunOptions = {},
): Promise<RunResult> {
  const dir = options.dir ?? defaultMigrationsDir();
  const log = options.log ?? ((message: string) => console.log(message));

  const ordered = listMigrationFiles(dir);
  const checksums = checksumAll(dir, ordered);

  // Read without creating: a --dry-run must leave the database untouched.
  const ledger = (await readMigrationLedgerIfPresent(client)) ?? [];
  const plan = planMigrations(ordered, checksums, ledger);

  if (plan.drifted.length > 0) throw new MigrationChecksumDriftError(plan.drifted);

  if (plan.orphaned.length > 0) {
    throw new MigrationHistoryError(
      `${plan.orphaned.length} migration(s) recorded in ${LEDGER_QUALIFIED} ` +
        `have no file on disk: ${plan.orphaned.join(", ")}. Refusing to run ` +
        `until repository and database history agree.`,
    );
  }
  if (plan.outOfOrder.length > 0) {
    throw new MigrationHistoryError(
      `Out-of-order migration(s) pending: ${plan.outOfOrder.join(", ")}. ` +
        `Refusing to alter history; ship a new forward migration instead.`,
    );
  }

  if (plan.pending.length === 0) {
    log(
      `✅ Nothing to apply — all ${plan.applied.length} migration(s) are ` +
        `already recorded in ${LEDGER_QUALIFIED}.`,
    );
    return { plan, appliedNow: [] };
  }

  if (options.dryRun) {
    log(`Would apply ${plan.pending.length} migration(s):`);
    for (const filename of plan.pending) log(`  • ${filename}`);
    log("Dry run — nothing was executed.");
    return { plan, appliedNow: [] };
  }

  await ensureMigrationLedger(client);

  const appliedNow: string[] = [];
  for (const filename of plan.pending) {
    const source = readMigrationSource(dir, filename);
    log(`→ applying ${filename} ...`);
    const { statements, durationMs } = await applyMigration(client, filename, source);
    appliedNow.push(filename);
    log(`  ✅ ${filename} (${statements} statement(s), ${durationMs}ms)`);
  }

  log(`✅ Applied ${appliedNow.length} migration(s).`);
  return { plan, appliedNow };
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

export class BaselineRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaselineRefusedError";
  }
}

export interface BaselineOptions extends RunOptions {
  /** Without this, baseline prints its plan and refuses. */
  confirm?: boolean;
  /** Allow baselining when the ledger already has rows. */
  force?: boolean;
  /** Injectable only so unit tests with synthetic migration names can opt in. */
  effectVerifier?: typeof findMissingBaselineEffects;
}

export const COUNT_PUBLIC_TABLES_SQL = `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

export async function countPublicTables(client: MigrationClient): Promise<number> {
  const result = await client.query<{ count: number }>(COUNT_PUBLIC_TABLES_SQL);
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Record migrations as applied WITHOUT executing them, to adopt this runner on
 * a database that already has their effects.
 *
 * Guards, in order:
 *   1. `--confirm` must be passed explicitly (never a default).
 *   2. The `public` schema must already contain tables. Baselining an empty
 *      database would permanently skip the entire schema and leave a database
 *      that can never be built — this is the guard that matters most.
 *   3. The ledger must be empty, unless `--force`.
 */
export async function baselineMigrations(
  client: MigrationClient,
  options: BaselineOptions = {},
): Promise<{ plan: MigrationPlan; recorded: string[] }> {
  const dir = options.dir ?? defaultMigrationsDir();
  const log = options.log ?? ((message: string) => console.log(message));

  const ordered = listMigrationFiles(dir);
  const checksums = checksumAll(dir, ordered);

  // Read without creating: a refused baseline must leave no trace.
  const ledger = (await readMigrationLedgerIfPresent(client)) ?? [];
  const plan = planMigrations(ordered, checksums, ledger);

  const toRecord = plan.pending;

  log("");
  log(`Baseline plan for ${LEDGER_QUALIFIED}:`);
  log(
    `  ${toRecord.length} migration(s) would be RECORDED AS APPLIED WITHOUT ` +
      `BEING EXECUTED:`,
  );
  for (const filename of toRecord) log(`    • ${filename}`);
  if (plan.applied.length > 0) {
    log(`  ${plan.applied.length} already recorded: ${plan.applied.join(", ")}`);
  }
  log("");

  if (toRecord.length === 0) {
    log("Nothing to baseline — every migration is already recorded.");
    return { plan, recorded: [] };
  }

  if (!options.confirm) {
    throw new BaselineRefusedError(
      `Baseline NOT applied. This mode marks migrations as applied without ` +
        `running them and is only correct on a database that already has ` +
        `their effects. If the plan above is right, re-run with --confirm:\n` +
        `  npm run db:migrate:baseline -- --confirm`,
    );
  }

  const tableCount = await countPublicTables(client);
  if (tableCount === 0) {
    throw new BaselineRefusedError(
      `Refusing to baseline: the "public" schema of this database contains no ` +
        `tables, so it cannot already have the effects of ${toRecord.length} ` +
        `migration(s). Baselining here would permanently skip the entire ` +
        `schema. Run \`npm run db:migrate\` instead to actually apply them.`,
    );
  }

  if (ledger.length > 0 && !options.force) {
    throw new BaselineRefusedError(
      `Refusing to baseline: ${LEDGER_QUALIFIED} already has ${ledger.length} ` +
        `row(s), so this database is already adopted and the remaining ` +
        `migration(s) are genuinely pending. Run \`npm run db:migrate\` to ` +
        `apply them. Pass --force only if you are certain they are already ` +
        `applied by hand.`,
    );
  }

  const missingEffects = await (options.effectVerifier ?? findMissingBaselineEffects)(
    client,
    toRecord,
  );
  if (missingEffects.length > 0) {
    throw new BaselineRefusedError(
      `Refusing to baseline: the database is missing required migration ` +
        `effects:\n  • ${missingEffects.join("\n  • ")}\n` +
        `Apply the migrations instead of recording work that has not run.`,
    );
  }

  await ensureMigrationLedger(client);

  await client.query("BEGIN");
  try {
    for (const filename of toRecord) {
      await client.query(INSERT_LEDGER_SQL, [
        filename,
        checksums.get(filename),
        null,
        true,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }

  log(
    `✅ Baselined ${toRecord.length} migration(s) — recorded as applied, ` +
      `nothing was executed.`,
  );
  return { plan, recorded: toRecord };
}

// ---------------------------------------------------------------------------
// Status reporting (shared by the CLI and the startup check)
// ---------------------------------------------------------------------------

const RULE = "═".repeat(72);

export function formatPendingReport(plan: MigrationPlan): string[] {
  const lines: string[] = [];

  if (plan.drifted.length > 0) {
    lines.push(RULE);
    lines.push(
      `🚨 MIGRATION CHECKSUM DRIFT — ${plan.drifted.length} applied migration ` +
        `file(s) changed after being applied`,
    );
    lines.push(describeDrift(plan.drifted));
    lines.push(
      `   The database was built by the OLD contents. Revert the file(s), or ` +
        `ship the change as a NEW migration.`,
    );
    lines.push(RULE);
  }

  if (plan.pending.length > 0) {
    lines.push(RULE);
    lines.push(
      `⚠️  DATABASE MIGRATIONS PENDING — ${plan.pending.length} migration ` +
        `file(s) have never been applied to this database`,
    );
    for (const filename of plan.pending) lines.push(`   • ${filename}`);
    lines.push(`   Apply them with:  npm run db:migrate`);
    lines.push(
      `   Nothing was applied automatically — schema sync is never an app-start ` +
        `side effect (see replit.md "Data Safety Policy").`,
    );
    lines.push(
      `   Until they are applied, any query touching a column added by them ` +
        `will fail at runtime.`,
    );
    lines.push(RULE);
  }

  if (plan.orphaned.length > 0) {
    lines.push(
      `⚠️  ${plan.orphaned.length} migration(s) recorded but missing on disk: ` +
        `${plan.orphaned.join(", ")}`,
    );
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Startup check — read-only, non-fatal, cannot crash the server
// ---------------------------------------------------------------------------

export interface StartupCheckOptions {
  dir?: string;
  connectionString?: string;
  log?: (message: string) => void;
  connectionTimeoutMs?: number;
  failOnIssues?: boolean;
}

/**
 * Log loudly when migrations are pending or drifted. Never applies anything,
 * never throws, never creates the ledger (a read-only check has no schema side
 * effects), and swallows every failure mode including an unreachable database.
 */
export async function reportPendingMigrations(
  options: StartupCheckOptions = {},
): Promise<void> {
  const log = options.log ?? ((message: string) => console.warn(message));
  const failOnIssues = options.failOnIssues ?? false;
  try {
    const connectionString = options.connectionString ?? process.env.DATABASE_URL;
    if (!connectionString) {
      if (failOnIssues) throw new MigrationHistoryError("DATABASE_URL is not set");
      return;
    }

    const dir = options.dir ?? defaultMigrationsDir();
    if (!fs.existsSync(dir)) {
      if (failOnIssues) throw new MigrationHistoryError(`Migrations directory not found: ${dir}`);
      return;
    }

    let ordered: string[];
    let checksums: Map<string, string>;
    try {
      ordered = listMigrationFiles(dir);
      checksums = checksumAll(dir, ordered);
    } catch (error) {
      if (failOnIssues) throw error;
      log(`⚠️  Migration check skipped: ${(error as Error).message}`);
      return;
    }
    if (ordered.length === 0) {
      if (failOnIssues) throw new MigrationHistoryError("No migration files found");
      return;
    }

    // Imported lazily so a missing/broken `pg` install can never block boot.
    const pg = await import("pg");
    const ClientCtor = (pg as any).default?.Client ?? (pg as any).Client;
    const client = new ClientCtor({
      connectionString,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
      statement_timeout: 5_000,
      query_timeout: 5_000,
      application_name: "taptpay-migration-check",
    });
    // A pg Client emits 'error' asynchronously; unhandled, that takes the
    // process down. Absorb it here.
    client.on("error", () => undefined);

    try {
      await client.connect();
      const ledger = await readMigrationLedgerIfPresent(client as MigrationClient);
      if (ledger === null) {
        log(RULE);
        log(
          `⚠️  MIGRATION LEDGER NOT INITIALISED — ${LEDGER_QUALIFIED} does not ` +
            `exist, so this database has no record of which of the ` +
            `${ordered.length} checked-in migration(s) it has seen.`,
        );
        log(
          `   If this database already has their effects:  npm run db:migrate:baseline -- --confirm`,
        );
        log(`   Otherwise:                                   npm run db:migrate`);
        log(RULE);
        if (failOnIssues) {
          throw new MigrationHistoryError(`Migration ledger ${LEDGER_QUALIFIED} is not initialised`);
        }
        return;
      }

      const plan = planMigrations(ordered, checksums, ledger);
      const lines = formatPendingReport(plan);
      if (lines.length === 0) {
        console.log(
          `✅ Migrations: all ${plan.applied.length} applied (${LEDGER_QUALIFIED})`,
        );
        return;
      }
      for (const line of lines) log(line);
      if (failOnIssues && (
        plan.drifted.length > 0 || plan.pending.length > 0 ||
        plan.orphaned.length > 0 || plan.outOfOrder.length > 0
      )) {
        throw new MigrationHistoryError(
          `Database migration gate failed: ${plan.pending.length} pending, ${plan.drifted.length} drifted, ${plan.orphaned.length} orphaned, ${plan.outOfOrder.length} out of order`,
        );
      }
    } finally {
      try {
        await client.end();
      } catch {
        // Closing a never-opened or already-broken connection is not a problem.
      }
    }
  } catch (error) {
    // Never fatal: a migration check must not be able to stop the server.
    log(`⚠️  Migration check failed (non-fatal): ${(error as Error).message}`);
    if (failOnIssues) throw error;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface CliOptions {
  mode: "apply" | "status" | "baseline";
  dryRun: boolean;
  confirm: boolean;
  force: boolean;
  unknown: string[];
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    mode: "apply",
    dryRun: false,
    confirm: false,
    force: false,
    unknown: [],
  };
  for (const arg of argv) {
    switch (arg) {
      case "--baseline":
        options.mode = "baseline";
        break;
      case "--status":
        options.mode = "status";
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--confirm":
        options.confirm = true;
        break;
      case "--force":
        options.force = true;
        break;
      default:
        options.unknown.push(arg);
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.unknown.length > 0) {
    console.error(`Unknown argument(s): ${options.unknown.join(", ")}`);
    console.error(
      `Usage: tsx server/migrate.ts [--status | --dry-run | --baseline [--confirm] [--force]]`,
    );
    process.exit(2);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set — refusing to run migrations.");
    process.exit(1);
  }

  const pg = await import("pg");
  const ClientCtor = (pg as any).default?.Client ?? (pg as any).Client;
  const client = new ClientCtor({
    connectionString,
    application_name: "taptpay-migrate",
  });
  client.on("error", (error: unknown) => {
    console.error("Database connection error:", error);
  });

  const target = (() => {
    try {
      const parsed = new URL(connectionString);
      return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
    } catch {
      return "(unparseable DATABASE_URL)";
    }
  })();
  console.log(`Migration runner → ${target}`);

  await client.connect();
  try {
    if (options.mode === "status") {
      const dir = defaultMigrationsDir();
      const ordered = listMigrationFiles(dir);
      const checksums = checksumAll(dir, ordered);
      const ledger = await readMigrationLedgerIfPresent(client as MigrationClient);
      if (ledger === null) {
        console.log(
          `Ledger ${LEDGER_QUALIFIED} does not exist — no migrations recorded.`,
        );
        console.log(`${ordered.length} migration file(s) on disk:`);
        for (const filename of ordered) console.log(`  • ${filename} (unrecorded)`);
        process.exitCode = 1;
        return;
      }
      const plan = planMigrations(ordered, checksums, ledger);
      console.log(
        `${plan.applied.length} applied, ${plan.pending.length} pending, ` +
          `${plan.drifted.length} drifted, ${plan.orphaned.length} orphaned.`,
      );
      const lines = formatPendingReport(plan);
      for (const line of lines) console.log(line);
      if (
        plan.drifted.length > 0 ||
        plan.pending.length > 0 ||
        plan.orphaned.length > 0 ||
        plan.outOfOrder.length > 0
      ) process.exitCode = 1;
      return;
    }

    if (options.mode === "baseline") {
      await withMigrationAdvisoryLock(client as MigrationClient, () =>
        baselineMigrations(client as MigrationClient, {
          confirm: options.confirm,
          force: options.force,
        }),
      );
      return;
    }

    await withMigrationAdvisoryLock(client as MigrationClient, () =>
      runPendingMigrations(client as MigrationClient, { dryRun: options.dryRun }),
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Run only when this file is the process entrypoint. Deliberately avoids
 * `import.meta` so the module still loads under ts-jest's CommonJS transform.
 */
const entrypoint = process.argv[1] ?? "";
const isDirectInvocation =
  /(^|[\\/])migrate\.(?:ts|js|mjs|cjs)$/.test(entrypoint) &&
  !process.env.JEST_WORKER_ID;

if (isDirectInvocation) {
  main().catch((error: unknown) => {
    console.error("");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    process.exit(1);
  });
}
