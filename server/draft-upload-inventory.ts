/**
 * Gap 13 — draft the upload-ownership inventory from a database's own records,
 * or count how the automatic rule would sort its invoice documents.
 *
 *   GAP13_INVENTORY_DATABASE_URL=<url> npm run db:draft-upload-inventory -- \
 *     --target=<local|workspace|ci|staging|production> --expected-host=<host> \
 *     [--expected-port=<port>] --expected-database=<name> \
 *     ( --count-only | --out=<new file> --approved-by="<who reviews and approves it>" )
 *
 * Read-only: everything happens in one READ ONLY transaction that is rolled back.
 * It prints numbers (and, for a draft, the file's SHA-256) — never a document, a
 * path or a merchant id. The target is declared and validated exactly as the
 * migration runner validates it, so a draft is bound to the same target the
 * release command for it will accept. The rule and the file format are in
 * server/upload-ownership-inventory.ts; the procedure is in
 * docs/operations/migration-release.md.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { MigrationTargetError, parseCliArgs, redactedFailureText, withValidatedMigrationTarget, type CliOptions } from "./migrate";
import {
  assertInventoryApprover,
  buildDraftInventory,
  readInvoiceDocumentFacts,
  summarizeClassifications,
  type ClassificationSummary,
} from "./upload-ownership-inventory";

export interface DraftOptions {
  cli: CliOptions;
  countOnly: boolean;
  out?: string;
  approvedBy?: string;
}

/** Only the target flags reach the runner's parser; anything else is refused. */
export function parseDraftArguments(argv: readonly string[]): DraftOptions {
  const options: Omit<DraftOptions, "cli"> = { countOnly: false };
  const targetArgs: string[] = [];
  const seen = new Set<string>();
  for (const arg of argv) {
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (["--count-only", "--out", "--approved-by"].includes(name)) {
      if (seen.has(name)) throw new MigrationTargetError("MIGRATE_CLI_INVALID_ARGUMENTS");
      seen.add(name);
      if (name === "--count-only" && arg === name) options.countOnly = true;
      else if (name === "--out" && arg.length > name.length + 1) options.out = arg.slice(name.length + 1);
      else if (name === "--approved-by" && arg.length > name.length + 1) options.approvedBy = arg.slice(name.length + 1);
      else throw new MigrationTargetError("MIGRATE_CLI_INVALID_ARGUMENTS");
      continue;
    }
    targetArgs.push(arg);
  }
  const cli = parseCliArgs(targetArgs);
  const onlyTarget = cli.unknown.length === 0 && cli.mode === "apply" && !cli.dryRun && !cli.confirm && !cli.force
    && !cli.allowDestructive && cli.uploadOwnershipInventoryPath === undefined && cli.uploadOwnershipInventorySha256 === undefined;
  const oneMode = options.countOnly ? !options.out && !options.approvedBy : !!options.out && !!options.approvedBy;
  if (!onlyTarget || !oneMode) throw new MigrationTargetError("MIGRATE_CLI_INVALID_ARGUMENTS");
  if (options.approvedBy !== undefined) assertInventoryApprover(options.approvedBy);
  return { cli, ...options };
}

function summaryLine(prefix: string, summary: ClassificationSummary): string {
  const locked = Object.entries(summary.locked).map(([reason, count]) => ` locked.${reason}=${count}`).join("");
  const lockedTotal = Object.values(summary.locked).reduce((sum, count) => sum + (count ?? 0), 0);
  return `${prefix} total=${summary.total} owner=${summary.owner} locked=${lockedTotal}${locked}`;
}

async function main(): Promise<void> {
  const options = parseDraftArguments(process.argv.slice(2));
  await withValidatedMigrationTarget(
    { cli: options.cli, connectionString: process.env.GAP13_INVENTORY_DATABASE_URL },
    async (client, target) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        await client.query("SELECT set_config('statement_timeout', '120s', true), set_config('lock_timeout', '5s', true)");
        const setting = await client.query<{ timezone: string; has_files: boolean }>(
          "SELECT current_setting('TimeZone') AS timezone, to_regclass('public.uploaded_files') IS NOT NULL AS has_files");
        const { timezone, has_files: hasFiles } = setting.rows[0];
        const facts = hasFiles ? await readInvoiceDocumentFacts(client, { withContent: !options.countOnly }) : [];
        const prefix = `GAP13_INVENTORY target=${target.classification} database=${target.database} timezone=${timezone}`;

        if (options.countOnly) {
          console.log(summaryLine(prefix, summarizeClassifications(facts)));
          return;
        }
        const { inventory, summary } = buildDraftInventory(facts, {
          target: { host: target.host, port: target.port, database: target.database },
          approvedBy: options.approvedBy!,
          approvedAt: new Date().toISOString(),
        });
        const source = `${JSON.stringify(inventory, null, 2)}\n`;
        // `wx`: never overwrite an existing (possibly already approved) inventory.
        writeFileSync(options.out!, source, { flag: "wx", mode: 0o600 });
        console.log(summaryLine(prefix, summary));
        console.log(`GAP13_INVENTORY_SHA256 ${createHash("sha256").update(source).digest("hex")}`);
        console.log("Review the counts. Approving means passing this SHA-256 to the release command.");
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
      }
    },
  );
}

const entrypoint = process.argv[1] ?? "";
if (/(^|[\\/])draft-upload-inventory\.(?:ts|js|mjs|cjs)$/.test(entrypoint) && !process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    const code = (error as { code?: string } | null)?.code;
    // A file-system refusal (e.g. --out already exists) carries only its code.
    console.error(code && /^E[A-Z]+$/.test(code) ? `GAP13_INVENTORY_WRITE_FAILED ${code}` : redactedFailureText(error));
    process.exitCode = 1;
  });
}
