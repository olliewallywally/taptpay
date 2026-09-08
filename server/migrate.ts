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
 * 6. Every invocation must name its target: `--target`, `--expected-host` and
 *    `--expected-database` are required, and the URI is checked against them
 *    before `pg` is imported. A command that does not say which database it
 *    means fails before it can connect to the wrong one. See
 *    `docs/operations/migration-target.md`.
 *
 * Usage
 * -----
 *   TARGET="--target=local --expected-host=127.0.0.1 --expected-database=taptpay"
 *
 *   npm run db:migrate -- $TARGET                       apply pending migrations
 *   npm run db:migrate:status -- $TARGET                report only, touches nothing
 *   npm run db:migrate -- $TARGET --dry-run             list what would be applied
 *   npm run db:migrate:baseline -- $TARGET              print the baseline plan, refuse
 *   npm run db:migrate:baseline -- $TARGET --confirm    record as applied, run nothing
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
// Safety gate: destructive and non-transactional statements
// ---------------------------------------------------------------------------

/**
 * Two different hazards, deliberately not collapsed into one.
 *
 * `destructive` destroys rows. It is a decision, not a defect, so it is
 * refused unless the operator says otherwise on the command line.
 *
 * `nontransactional` cannot honestly run inside the single transaction this
 * runner wraps every file in. `CREATE INDEX CONCURRENTLY` in a transaction-
 * wrapped file does not fail loudly on a good day and half-applies on a bad
 * one, so it is refused outright: there is no reviewed non-transactional mode
 * yet, and it must not be slipped into the current files.
 */
export type MigrationSafetyKind = "destructive" | "nontransactional";

export interface MigrationSafetyFinding {
  filename: string;
  kind: MigrationSafetyKind;
  /** Fixed rule name. Never statement text — a migration body carries values. */
  rule: string;
  /** 1-based position among the file's executable statements. */
  statement: number;
}

export class MigrationSafetyError extends Error {
  readonly findings: readonly MigrationSafetyFinding[];
  constructor(findings: readonly MigrationSafetyFinding[]) {
    const detail = findings
      .map((f) => `${f.filename}: ${f.kind} — ${f.rule} (statement ${f.statement})`)
      .join("; ");
    super(
      `Refusing to apply ${findings.length} unsafe statement(s). ${detail}. ` +
        `A destructive migration needs --allow-destructive and a reviewed ` +
        `decision; a non-transactional one needs a reviewed runner mode that ` +
        `does not exist yet.`,
    );
    this.name = "MigrationSafetyError";
    this.findings = findings;
  }
}

/**
 * Single-quoted literals only. Dollar-quoted bodies are deliberately left
 * intact: a `DO $$ … $$` block executes real SQL with real effects and must
 * never become a safe harbour the scanner waives.
 */
function maskStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

interface SafetyRule {
  kind: MigrationSafetyKind;
  rule: string;
  matches: (normalized: string) => boolean;
}

/**
 * Non-transactional rules are tested first, and at most one finding is raised
 * per statement, so a statement that is both reports the stricter hazard.
 *
 * Constraint, default and index reshapes are absent on purpose. `ALTER TABLE …
 * DROP CONSTRAINT` / `ALTER COLUMN … DROP DEFAULT` destroy no rows, and the
 * checked-in history already uses the drop-then-re-add pattern; flagging them
 * would block every fresh database for no safety gain.
 */
const SAFETY_RULES: readonly SafetyRule[] = Object.freeze([
  { kind: "nontransactional", rule: "CONCURRENTLY", matches: (s) => /\bCONCURRENTLY\b/.test(s) },
  { kind: "nontransactional", rule: "VACUUM", matches: (s) => /\bVACUUM\b/.test(s) },
  { kind: "nontransactional", rule: "REINDEX", matches: (s) => /\bREINDEX\b/.test(s) },
  {
    kind: "nontransactional",
    rule: "ALTER TYPE … ADD VALUE",
    matches: (s) => /\bALTER\s+TYPE\b/.test(s) && /\bADD\s+VALUE\b/.test(s),
  },
  { kind: "destructive", rule: "DROP TABLE", matches: (s) => /\bDROP\s+TABLE\b/.test(s) },
  { kind: "destructive", rule: "DROP COLUMN", matches: (s) => /\bDROP\s+COLUMN\b/.test(s) },
  { kind: "destructive", rule: "DROP SCHEMA", matches: (s) => /\bDROP\s+SCHEMA\b/.test(s) },
  { kind: "destructive", rule: "DROP DATABASE", matches: (s) => /\bDROP\s+DATABASE\b/.test(s) },
  { kind: "destructive", rule: "DROP TYPE", matches: (s) => /\bDROP\s+TYPE\b/.test(s) },
  { kind: "destructive", rule: "TRUNCATE", matches: (s) => /\bTRUNCATE\b/.test(s) },
  {
    kind: "destructive",
    rule: "DELETE without WHERE",
    matches: (s) => /\bDELETE\s+FROM\b/.test(s) && !/\bWHERE\b/.test(s),
  },
]);

/** Scan one migration's statements. Pure: reads nothing and connects to nothing. */
export function inspectMigrationSafety(
  filename: string,
  sql: string,
): MigrationSafetyFinding[] {
  const findings: MigrationSafetyFinding[] = [];
  executableStatements(sql).forEach((chunk, index) => {
    const normalized = maskStringLiterals(chunk.normalized);
    const rule = SAFETY_RULES.find((candidate) => candidate.matches(normalized));
    if (rule) {
      findings.push({ filename, kind: rule.kind, rule: rule.rule, statement: index + 1 });
    }
  });
  return findings;
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

export const READ_MIGRATION_TIMEOUTS_SQL =
  "SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout";
export const SET_MIGRATION_SESSION_TIMEOUTS_SQL =
  "SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)";
export const SET_MIGRATION_LOCAL_TIMEOUTS_SQL =
  "SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)";

export interface MigrationTimeouts {
  advisoryLockMs: number;
  lockMs: number;
  statementMs: number;
}

export const DEFAULT_MIGRATION_TIMEOUTS: Readonly<MigrationTimeouts> = Object.freeze({
  advisoryLockMs: 10_000,
  lockMs: 5_000,
  statementMs: 60_000,
});

function migrationTimeouts(overrides: Partial<MigrationTimeouts>): MigrationTimeouts {
  const budgets = { ...DEFAULT_MIGRATION_TIMEOUTS, ...overrides };
  for (const value of Object.values(budgets)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 300_000) {
      throw new MigrationHistoryError('Invalid migration timeout budget');
    }
  }
  if (budgets.lockMs >= budgets.statementMs) {
    throw new MigrationHistoryError('Migration lock budget must be below statement budget');
  }
  return budgets;
}

/**
 * Serialize the full plan/apply/baseline operation on a dedicated connection.
 * Restore caller settings on exit. A failed acquire/unlock/restore makes the
 * connection unsafe to reuse; the CLI always closes it in its finally block.
 */
export async function withMigrationAdvisoryLock<T>(
  client: MigrationClient,
  work: (timeouts: Readonly<MigrationTimeouts>) => Promise<T>,
  timeoutOverrides: Partial<MigrationTimeouts> = {},
): Promise<T> {
  const budgets = migrationTimeouts(timeoutOverrides);
  const result = await client.query<{ lock_timeout: string; statement_timeout: string }>(READ_MIGRATION_TIMEOUTS_SQL);
  const previous = result.rows[0];
  if (!previous || typeof previous.lock_timeout !== 'string' || typeof previous.statement_timeout !== 'string') {
    throw new MigrationHistoryError('Cannot inspect migration timeout settings');
  }
  let acquired = false;
  try {
    await client.query(SET_MIGRATION_SESSION_TIMEOUTS_SQL, [`${budgets.lockMs}ms`, `${budgets.advisoryLockMs}ms`]);
    await client.query(ACQUIRE_MIGRATION_LOCK_SQL);
    acquired = true;
    // Ledger DDL and baseline writes also inherit bounded session settings.
    await client.query(SET_MIGRATION_SESSION_TIMEOUTS_SQL, [`${budgets.lockMs}ms`, `${budgets.statementMs}ms`]);
    return await work(Object.freeze(budgets));
  } finally {
    try {
      if (acquired) await client.query(RELEASE_MIGRATION_LOCK_SQL);
    } finally {
      await client.query(SET_MIGRATION_SESSION_TIMEOUTS_SQL, [previous.lock_timeout, previous.statement_timeout]);
    }
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
  timeoutOverrides: Partial<MigrationTimeouts> = {},
): Promise<{ statements: number; durationMs: number }> {
  const budgets = migrationTimeouts(timeoutOverrides);
  const checksum = checksumMigrationSource(source);
  const statements = executableStatements(source);
  const startedAt = Date.now();

  await client.query("BEGIN");
  try {
    await client.query(SET_MIGRATION_LOCAL_TIMEOUTS_SQL, [`${budgets.lockMs}ms`, `${budgets.statementMs}ms`]);
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
  timeouts?: Partial<MigrationTimeouts>;
  /** Operator approval for row-destroying statements. Never defaults to true. */
  allowDestructive?: boolean;
}

/** Apply every pending migration, in order, aborting on the first failure. */
export async function runPendingMigrations(
  client: MigrationClient,
  options: RunOptions = {},
): Promise<RunResult> {
  const budgets = migrationTimeouts(options.timeouts ?? {});
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

  const findings = plan.pending.flatMap((filename) =>
    inspectMigrationSafety(filename, readMigrationSource(dir, filename)),
  );

  if (options.dryRun) {
    log(`Would apply ${plan.pending.length} migration(s):`);
    for (const filename of plan.pending) log(`  • ${filename}`);
    // A dry run is the preflight, so it reports rather than refuses. The real
    // apply below is where the gate bites.
    for (const finding of findings) {
      log(
        `  ⚠️  ${finding.filename}: ${finding.kind} — ${finding.rule} ` +
          `(statement ${finding.statement})`,
      );
    }
    log("Dry run — nothing was executed.");
    return { plan, appliedNow: [] };
  }

  const blocking = findings.filter(
    (finding) => finding.kind === "nontransactional" || !options.allowDestructive,
  );
  if (blocking.length > 0) throw new MigrationSafetyError(blocking);

  await ensureMigrationLedger(client);

  const appliedNow: string[] = [];
  for (const filename of plan.pending) {
    const source = readMigrationSource(dir, filename);
    log(`→ applying ${filename} ...`);
    const { statements, durationMs } = await applyMigration(client, filename, source, budgets);
    appliedNow.push(filename);
    log(`  ✅ ${filename} (${statements} statement(s), ${durationMs}ms)`);
  }

  log(`✅ Applied ${appliedNow.length} migration(s).`);
  return { plan, appliedNow };
}

/**
 * Re-plan against the ledger after applying, so a release proves its own end
 * state instead of trusting that the apply loop finished. A release that
 * cannot say "0 pending, 0 drifted" has not finished, whatever it printed.
 */
export async function verifyMigrationState(
  client: MigrationClient,
  dir: string = defaultMigrationsDir(),
): Promise<MigrationPlan> {
  const ordered = listMigrationFiles(dir);
  const checksums = checksumAll(dir, ordered);
  const ledger = await readMigrationLedgerIfPresent(client);
  if (ledger === null) {
    throw new MigrationHistoryError(
      `Release verification failed: ledger ${LEDGER_QUALIFIED} is not initialised.`,
    );
  }
  const plan = planMigrations(ordered, checksums, ledger);
  if (
    plan.pending.length > 0 ||
    plan.drifted.length > 0 ||
    plan.orphaned.length > 0 ||
    plan.outOfOrder.length > 0
  ) {
    throw new MigrationHistoryError(
      `Release verification failed: ${plan.pending.length} pending, ` +
        `${plan.drifted.length} drifted, ${plan.orphaned.length} orphaned, ` +
        `${plan.outOfOrder.length} out of order.`,
    );
  }
  return plan;
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
// Target identity boundary
// ---------------------------------------------------------------------------

/**
 * The runner used to connect to whatever `DATABASE_URL` happened to be
 * exported. That is how a release step migrates the wrong database: the
 * operator's intent ("this is the isolated scratch target") was never written
 * down, so nothing could contradict it, and `pg` quietly fills any piece the
 * URI omits from `PGHOST`/`PGUSER`/`PGDATABASE`.
 *
 * Everything here is a pure boundary. The arguments and the URI are validated
 * before `pg` is imported or a socket is opened; the server's own identity is
 * compared before any ledger, status, apply or baseline work runs. Failures
 * carry a fixed code and never the URI, the arguments, the credentials or a
 * row value — the first thing an operator does with a failure is paste it into
 * a chat window.
 */

export type MigrationTargetClass = "local" | "ci" | "staging" | "production";

export const MIGRATION_TARGET_CLASSES: readonly MigrationTargetClass[] = Object.freeze([
  "local",
  "ci",
  "staging",
  "production",
]);

/**
 * Explicit loopback literals only. A hostname that merely *resolves* to
 * loopback today is not one, which is what stops the legacy non-loopback
 * workspace database from being relabelled "local" to dodge the TLS rule.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "localhost"]);

/** The only connection parameters allowed to survive into the driver. */
const APPROVED_URL_PARAMETERS: ReadonlySet<string> = new Set(["sslmode", "connect_timeout"]);
const APPROVED_SSL_MODES: ReadonlySet<string> = new Set([
  "disable",
  "require",
  "verify-ca",
  "verify-full",
]);
/** Modes that authenticate the server rather than merely encrypting the pipe. */
const AUTHENTICATED_SSL_MODES: ReadonlySet<string> = new Set(["verify-full"]);

export const DEFAULT_POSTGRES_PORT = 5432;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const MIN_CONNECT_TIMEOUT_SECONDS = 1;
const MAX_CONNECT_TIMEOUT_SECONDS = 60;

/**
 * Fixed operator-facing text per code. Deliberately free of hosts, database
 * names and examples so no message can become an echo of its own input.
 */
export const MIGRATION_TARGET_ERRORS = {
  MIGRATE_CLI_INVALID_ARGUMENTS:
    "Unrecognised, repeated or conflicting arguments.",
  MIGRATE_TARGET_EXPECTATION_MISSING:
    "The target classification, expected host and expected database are all required.",
  MIGRATE_TARGET_EXPECTATION_INVALID:
    "The target classification or expected port is not a permitted value.",
  MIGRATE_TARGET_URL_MISSING:
    "No database URL was supplied to the runner.",
  MIGRATE_TARGET_URL_MALFORMED:
    "The database URL is not a parseable URI.",
  MIGRATE_TARGET_URL_SCHEME:
    "The database URL is not a PostgreSQL URI.",
  MIGRATE_TARGET_URL_CREDENTIALS:
    "The database URL must carry an explicit user and password.",
  MIGRATE_TARGET_URL_DATABASE:
    "The database URL must name exactly one database path component.",
  MIGRATE_TARGET_URL_PORT:
    "The database URL port is outside the permitted range.",
  MIGRATE_TARGET_URL_HOST:
    "The database URL host is empty or a socket path.",
  MIGRATE_TARGET_URL_FRAGMENT:
    "The database URL carries a fragment.",
  MIGRATE_TARGET_URL_ENCODING:
    "The database URL contains invalid percent-encoding.",
  MIGRATE_TARGET_URL_PARAMETERS:
    "The database URL carries a duplicate, unapproved or out-of-range connection parameter.",
  MIGRATE_TARGET_CLASS_LOCAL_REQUIRES_LOOPBACK:
    "A local target must use an explicit loopback host.",
  MIGRATE_TARGET_CLASS_REMOTE_REQUIRES_REMOTE_HOST:
    "A ci, staging or production target must not point at loopback.",
  MIGRATE_TARGET_REMOTE_REQUIRES_TLS:
    "A remote target requires authenticated TLS.",
  MIGRATE_TARGET_EXPECTATION_MISMATCH:
    "The database URL does not match the declared host, port and database.",
  MIGRATE_TARGET_CONNECT_FAILED:
    "The runner could not open a connection to the declared target.",
  MIGRATE_TARGET_SERVER_IDENTITY_MISMATCH:
    "The connected server reports a different database or login than declared.",
} as const;

export type MigrationTargetErrorCode = keyof typeof MIGRATION_TARGET_ERRORS;

export class MigrationTargetError extends Error {
  readonly code: MigrationTargetErrorCode;
  constructor(code: MigrationTargetErrorCode) {
    super(`${code}: ${MIGRATION_TARGET_ERRORS[code]}`);
    this.name = "MigrationTargetError";
    this.code = code;
  }
}

/** What the operator asserted the target is, before anything is contacted. */
export interface MigrationTargetExpectation {
  classification: MigrationTargetClass;
  host: string;
  port: number;
  database: string;
}

/** Explicit driver fields. Never a connection string — see the note above. */
export interface ValidatedMigrationTarget {
  classification: MigrationTargetClass;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: false | { rejectUnauthorized: true };
  connectionTimeoutMs: number;
}

/** IPv6 arrives bracketed from the URL parser; the driver wants it bare. */
function normalizeHost(host: string): string {
  return host.replace(/^\[|\]$/g, "").toLowerCase();
}

function parsePortToken(token: string): number {
  if (!/^\d{1,5}$/.test(token)) return Number.NaN;
  const port = Number(token);
  return port >= 1 && port <= 65_535 ? port : Number.NaN;
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_ENCODING");
  }
}

/**
 * Turn validated CLI arguments into the declared target. Throws before any
 * connection object exists, so a bad invocation cannot reach a database.
 */
export function resolveMigrationTargetExpectation(
  options: CliOptions,
): MigrationTargetExpectation {
  if (options.unknown.length > 0) {
    throw new MigrationTargetError("MIGRATE_CLI_INVALID_ARGUMENTS");
  }
  const { target, expectedHost, expectedPort, expectedDatabase } = options;
  if (!target || !expectedHost || !expectedDatabase) {
    throw new MigrationTargetError("MIGRATE_TARGET_EXPECTATION_MISSING");
  }
  if (!MIGRATION_TARGET_CLASSES.includes(target as MigrationTargetClass)) {
    throw new MigrationTargetError("MIGRATE_TARGET_EXPECTATION_INVALID");
  }
  let port = DEFAULT_POSTGRES_PORT;
  if (expectedPort !== undefined) {
    port = parsePortToken(expectedPort);
    if (!Number.isFinite(port)) {
      throw new MigrationTargetError("MIGRATE_TARGET_EXPECTATION_INVALID");
    }
  }
  return {
    classification: target as MigrationTargetClass,
    host: normalizeHost(expectedHost),
    port,
    database: expectedDatabase,
  };
}

/**
 * Validate the URI's structure, then check it against what the operator
 * declared, then check the classification's own rules. That order matters: a
 * URI pointing somewhere unexpected must read as a mismatch, not as whatever
 * rule the wrong host happens to trip first.
 */
export function validateMigrationTargetUrl(
  raw: string | undefined,
  expectation: MigrationTargetExpectation,
): ValidatedMigrationTarget {
  if (!raw) throw new MigrationTargetError("MIGRATE_TARGET_URL_MISSING");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_MALFORMED");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_SCHEME");
  }
  if (url.hash !== "") {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_FRAGMENT");
  }

  const user = decodeUrlComponent(url.username);
  const password = decodeUrlComponent(url.password);
  if (user === "" || password === "") {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_CREDENTIALS");
  }

  // A percent-encoded socket directory arrives here as a hostname with a '%'.
  const host = normalizeHost(url.hostname);
  if (host === "" || host.includes("%")) {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_HOST");
  }

  let port = DEFAULT_POSTGRES_PORT;
  if (url.port !== "") {
    port = parsePortToken(url.port);
    if (!Number.isFinite(port)) {
      throw new MigrationTargetError("MIGRATE_TARGET_URL_PORT");
    }
  }

  if (!/^\/[^/]+$/.test(url.pathname)) {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_DATABASE");
  }
  const database = decodeUrlComponent(url.pathname.slice(1));
  if (database === "" || database.includes("/")) {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_DATABASE");
  }

  const parameters = new Map<string, string>();
  for (const [key, value] of url.searchParams) {
    const name = key.toLowerCase();
    if (!APPROVED_URL_PARAMETERS.has(name) || parameters.has(name)) {
      throw new MigrationTargetError("MIGRATE_TARGET_URL_PARAMETERS");
    }
    parameters.set(name, value);
  }

  const sslmode = parameters.get("sslmode");
  if (sslmode !== undefined && !APPROVED_SSL_MODES.has(sslmode)) {
    throw new MigrationTargetError("MIGRATE_TARGET_URL_PARAMETERS");
  }

  let connectionTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS;
  const connectTimeout = parameters.get("connect_timeout");
  if (connectTimeout !== undefined) {
    const seconds = /^\d{1,3}$/.test(connectTimeout) ? Number(connectTimeout) : Number.NaN;
    if (
      !Number.isFinite(seconds) ||
      seconds < MIN_CONNECT_TIMEOUT_SECONDS ||
      seconds > MAX_CONNECT_TIMEOUT_SECONDS
    ) {
      throw new MigrationTargetError("MIGRATE_TARGET_URL_PARAMETERS");
    }
    connectionTimeoutMs = seconds * 1_000;
  }

  if (host !== expectation.host || port !== expectation.port || database !== expectation.database) {
    throw new MigrationTargetError("MIGRATE_TARGET_EXPECTATION_MISMATCH");
  }

  const loopback = LOOPBACK_HOSTS.has(host);
  if (expectation.classification === "local") {
    if (!loopback) {
      throw new MigrationTargetError("MIGRATE_TARGET_CLASS_LOCAL_REQUIRES_LOOPBACK");
    }
  } else {
    if (loopback) {
      throw new MigrationTargetError("MIGRATE_TARGET_CLASS_REMOTE_REQUIRES_REMOTE_HOST");
    }
    if (sslmode === undefined || !AUTHENTICATED_SSL_MODES.has(sslmode)) {
      throw new MigrationTargetError("MIGRATE_TARGET_REMOTE_REQUIRES_TLS");
    }
  }

  // Only an authenticating mode becomes real TLS. The weaker modes are
  // reachable exclusively on loopback, where TLS is not the control in play.
  const ssl =
    sslmode !== undefined && AUTHENTICATED_SSL_MODES.has(sslmode)
      ? ({ rejectUnauthorized: true } as const)
      : false;

  return {
    classification: expectation.classification,
    host,
    port,
    database,
    user,
    password,
    ssl,
    connectionTimeoutMs,
  };
}

export interface MigrationTargetConnection {
  client: MigrationClient;
  end: () => Promise<void>;
}

export type MigrationTargetConnector = (
  target: ValidatedMigrationTarget,
) => Promise<MigrationTargetConnection>;

/** Asked of the server itself, so a redirected DNS name cannot answer for it. */
export const SELECT_TARGET_IDENTITY_SQL =
  "SELECT current_database() AS database, current_user AS username";

async function connectToMigrationTarget(
  target: ValidatedMigrationTarget,
): Promise<MigrationTargetConnection> {
  // Imported lazily so the pure validation above runs without `pg` present.
  const pg = await import("pg");
  const ClientCtor = (pg as any).default?.Client ?? (pg as any).Client;
  // Explicit fields, never `connectionString`: pg backfills anything a URI
  // omits from the ambient PG* environment, which is the selection this
  // boundary exists to remove.
  const client = new ClientCtor({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    ssl: target.ssl,
    application_name: "taptpay-migrate",
    connectionTimeoutMillis: target.connectionTimeoutMs,
    statement_timeout: DEFAULT_MIGRATION_TIMEOUTS.statementMs,
    query_timeout: DEFAULT_MIGRATION_TIMEOUTS.statementMs + 5_000,
  });
  // A pg Client emits 'error' asynchronously; unhandled that ends the process,
  // and the driver's own message carries the target. Absorb it.
  client.on("error", () => undefined);
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => undefined);
    throw new MigrationTargetError("MIGRATE_TARGET_CONNECT_FAILED");
  }
  return { client: client as MigrationClient, end: () => client.end() };
}

export interface ValidatedMigrationTargetOptions {
  cli: CliOptions;
  connectionString?: string;
  /** Injected by the tests so the boundary is provable without a database. */
  connect?: MigrationTargetConnector;
}

/**
 * Validate, connect, prove identity, then hand the caller a client. The
 * connection is closed on every path, including an identity mismatch, where no
 * ledger, status, apply or baseline work is allowed to have run.
 */
export async function withValidatedMigrationTarget<T>(
  options: ValidatedMigrationTargetOptions,
  work: (client: MigrationClient, target: ValidatedMigrationTarget) => Promise<T>,
): Promise<T> {
  const expectation = resolveMigrationTargetExpectation(options.cli);
  const target = validateMigrationTargetUrl(options.connectionString, expectation);

  const connect = options.connect ?? connectToMigrationTarget;
  let connection: MigrationTargetConnection;
  try {
    connection = await connect(target);
  } catch (error) {
    if (error instanceof MigrationTargetError) throw error;
    throw new MigrationTargetError("MIGRATE_TARGET_CONNECT_FAILED");
  }

  try {
    const result = await connection.client.query<{ database: string; username: string }>(
      SELECT_TARGET_IDENTITY_SQL,
    );
    const identity = result.rows[0];
    if (
      !identity ||
      identity.database !== target.database ||
      identity.username !== target.user
    ) {
      throw new MigrationTargetError("MIGRATE_TARGET_SERVER_IDENTITY_MISMATCH");
    }
    return await work(connection.client, target);
  } finally {
    await connection.end().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export const MIGRATION_CLI_USAGE = [
  "Usage: tsx server/migrate.ts --target=<local|ci|staging|production>",
  "         --expected-host=<host> [--expected-port=<port>] --expected-database=<name>",
  "         [--status | --release | --dry-run | --baseline [--confirm] [--force]]",
  "         [--allow-destructive]",
  "See docs/operations/migration-target.md.",
].join("\n");

export interface CliOptions {
  mode: "apply" | "status" | "baseline" | "release";
  dryRun: boolean;
  confirm: boolean;
  force: boolean;
  allowDestructive: boolean;
  target?: string;
  expectedHost?: string;
  expectedPort?: string;
  expectedDatabase?: string;
  unknown: string[];
}

const VALUE_FLAGS: Readonly<Record<string, "target" | "expectedHost" | "expectedPort" | "expectedDatabase">> =
  Object.freeze({
    "--target": "target",
    "--expected-host": "expectedHost",
    "--expected-port": "expectedPort",
    "--expected-database": "expectedDatabase",
  });

/**
 * Rejects rather than merges. A repeated flag means two different intentions
 * reached one command line and the later one would silently win; two modes in
 * one invocation is a contradiction, not a preference. Only the flag *name* is
 * ever recorded, so an argument's value cannot leak through a diagnostic.
 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    mode: "apply",
    dryRun: false,
    confirm: false,
    force: false,
    allowDestructive: false,
    unknown: [],
  };
  const seen = new Set<string>();
  let modeSelected = false;

  for (const arg of argv) {
    const separator = arg.indexOf("=");
    const name = separator === -1 ? arg : arg.slice(0, separator);

    if (seen.has(name)) {
      options.unknown.push(name);
      continue;
    }

    const field = VALUE_FLAGS[name];
    if (field) {
      if (separator === -1) {
        options.unknown.push(name);
        continue;
      }
      seen.add(name);
      options[field] = arg.slice(separator + 1);
      continue;
    }

    if (separator !== -1) {
      options.unknown.push(name);
      continue;
    }

    switch (arg) {
      case "--baseline":
      case "--status":
      case "--release":
        if (modeSelected) {
          options.unknown.push(arg);
          break;
        }
        modeSelected = true;
        seen.add(arg);
        options.mode =
          arg === "--status" ? "status" : arg === "--release" ? "release" : "baseline";
        break;
      case "--dry-run":
        seen.add(arg);
        options.dryRun = true;
        break;
      case "--confirm":
        seen.add(arg);
        options.confirm = true;
        break;
      case "--force":
        seen.add(arg);
        options.force = true;
        break;
      case "--allow-destructive":
        seen.add(arg);
        options.allowDestructive = true;
        break;
      default:
        options.unknown.push(arg);
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  await withValidatedMigrationTarget(
    { cli: options, connectionString: process.env.DATABASE_URL },
    async (client, target) => {
      console.log(
        `Migration runner → ${target.classification}: ` +
          `${target.host}:${target.port}/${target.database}`,
      );

      if (options.mode === "status") {
        const dir = defaultMigrationsDir();
        const ordered = listMigrationFiles(dir);
        const checksums = checksumAll(dir, ordered);
        const ledger = await readMigrationLedgerIfPresent(client);
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
        await withMigrationAdvisoryLock(client, () =>
          baselineMigrations(client, {
            confirm: options.confirm,
            force: options.force,
          }),
        );
        return;
      }

      if (options.mode === "release") {
        // One command, migrate-first: apply, then prove the end state.
        await withMigrationAdvisoryLock(client, async (timeouts) => {
          await runPendingMigrations(client, {
            dryRun: options.dryRun,
            timeouts,
            allowDestructive: options.allowDestructive,
          });
          if (options.dryRun) return;
          const verified = await verifyMigrationState(client);
          console.log(
            `✅ Release verified: ${verified.applied.length} migration(s) recorded, 0 pending.`,
          );
        });
        return;
      }

      await withMigrationAdvisoryLock(client, (timeouts) =>
        runPendingMigrations(client, {
          dryRun: options.dryRun,
          timeouts,
          allowDestructive: options.allowDestructive,
        }),
      );
    },
  );
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
    // A target/CLI rejection is an operator error, so show them the contract.
    if (error instanceof MigrationTargetError) console.error(MIGRATION_CLI_USAGE);
    console.error("");
    process.exit(1);
  });
}
