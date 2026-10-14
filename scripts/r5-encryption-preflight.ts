import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDataEncryption } from "../server/data-encryption";
import { assertPreflightTarget, countLegacyBankData, parsePreflightArguments } from "../server/encryption-preflight";
// Reuse the existing URI parser/parameter allowlist; never use ambient DATABASE_URL.
// @ts-expect-error The existing standalone JavaScript helper has no type declarations.
import { connectionSettings } from "./schema-fingerprint.mjs";

export function preflightConnectionSettings(env: Readonly<Record<string, string | undefined>>) {
  const settings = connectionSettings({ FINGERPRINT_DATABASE_URL: env.R5_PREFLIGHT_DATABASE_URL });
  // pg treats an empty password string as absent. A truthy password callback
  // prevents both PGPASSWORD and .pgpass from backfilling a missing URI password.
  if (!settings.user) throw new Error("R5_PREFLIGHT_EXPLICIT_USER_REQUIRED");
  const explicitPassword = settings.password ?? "";
  settings.password = () => explicitPassword;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(settings.host);
  if (!local && (!settings.ssl || settings.ssl.rejectUnauthorized !== true)) {
    throw new Error("R5_PREFLIGHT_VERIFIED_TLS_REQUIRED");
  }
  return { ...settings, connectionTimeoutMillis: 10000, application_name: "taptpay-r5-preflight",
    options: "-c search_path=pg_catalog", client_encoding: "UTF8", sslnegotiation: "postgres" };
}

export async function runPreflight(argv: readonly string[], env: Readonly<Record<string, string | undefined>>) {
  const expected = parsePreflightArguments(argv);
  const reader = loadDataEncryption(env);
  if (reader.describe().stage === "legacy") throw new Error("R5_PREFLIGHT_READER_NOT_READY");
  const settings = preflightConnectionSettings(env);
  assertPreflightTarget(expected, settings); // Before constructing or connecting a client.
  const { default: pg } = await import("pg");
  const client = new pg.Client(settings);
  // Do not let an idle connection error bypass the fixed-error CLI boundary.
  client.on("error", () => undefined);
  try {
    await client.connect();
    return await countLegacyBankData(client, expected, settings, reader, expected.batchSize);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await runPreflight(process.argv.slice(2), process.env);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.safeToBackfill) {
      process.stderr.write("R5_PREFLIGHT_UNSAFE_DATA\n");
      process.exitCode = 2;
    }
  } catch {
    // Neither pg nor URI/crypto errors may print a connection string or value.
    process.stderr.write("R5_PREFLIGHT_FAILED\n");
    process.exitCode = 1;
  }
}
