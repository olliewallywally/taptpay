import { randomBytes as nodeRandomBytes } from "node:crypto";

export const TEST_DATABASE_MARKER = "TAPTPAY_TEST_DATABASE";
export const TEST_DATABASE_MARKER_VALUE = "1";
export const VERIFIER_SCHEMA_PATTERN = /^taptpay_verify_[0-9a-f]{32}$/;

function requiredValue(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function postgresDatabaseIdentity(connectionString, name = "database URL") {
  const raw = requiredValue(connectionString, name);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} must use postgres:// or postgresql://`);
  }
  if (!parsed.hostname) {
    throw new Error(`${name} must include a hostname`);
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    throw new Error(`${name} contains an invalid database name`);
  }
  if (!databaseName) {
    throw new Error(`${name} must name a database`);
  }

  // Credentials and connection options do not change which database receives
  // DDL. Ignore them so a differently formatted live URL is still rejected.
  return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${databaseName}`;
}

export function assertSafePostgresVerifierEnvironment({
  testDatabaseUrl,
  configuredDatabaseUrl,
  marker,
}) {
  const testUrl = requiredValue(testDatabaseUrl, "TEST_DATABASE_URL");
  if (marker !== TEST_DATABASE_MARKER_VALUE) {
    throw new Error(
      `${TEST_DATABASE_MARKER} must be exactly ${TEST_DATABASE_MARKER_VALUE}`,
    );
  }

  const testIdentity = postgresDatabaseIdentity(testUrl, "TEST_DATABASE_URL");
  if (
    typeof configuredDatabaseUrl === "string" &&
    configuredDatabaseUrl.trim() !== ""
  ) {
    const configuredIdentity = postgresDatabaseIdentity(
      configuredDatabaseUrl,
      "DATABASE_URL",
    );
    if (configuredIdentity === testIdentity) {
      throw new Error(
        "TEST_DATABASE_URL resolves to the same database as DATABASE_URL",
      );
    }
  }

  return { testDatabaseUrl: testUrl, testIdentity };
}

export function createVerifierSchemaName(randomBytes = nodeRandomBytes) {
  const entropy = randomBytes(16);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 16) {
    throw new Error("schema entropy source must return exactly 16 bytes");
  }
  const schemaName = `taptpay_verify_${entropy.toString("hex")}`;
  assertVerifierSchemaName(schemaName);
  return schemaName;
}

export function assertVerifierSchemaName(schemaName) {
  if (!VERIFIER_SCHEMA_PATTERN.test(schemaName)) {
    throw new Error("refusing an invalid disposable verifier schema name");
  }
  return schemaName;
}

export function quoteVerifierSchema(schemaName) {
  return `"${assertVerifierSchemaName(schemaName)}"`;
}

export function prepareMigrationSql(fileName, sql) {
  let prepared = sql;
  const publicMerchantReference = '"public"."merchants"';

  if (fileName === "0000_vengeful_zaladane.sql") {
    const references = prepared.split(publicMerchantReference).length - 1;
    if (references !== 2) {
      throw new Error(
        `0000 public merchant reference count changed (expected 2, found ${references})`,
      );
    }
    // Migration 0000 predates isolated-schema verification. Resolve its two FKs
    // through this run's search_path without changing the migration on disk.
    prepared = prepared.replaceAll(publicMerchantReference, '"merchants"');
  }

  if (/(?:"public"|\bpublic)\s*\./i.test(prepared)) {
    throw new Error(
      `${fileName} contains an explicit public-schema reference; isolation is not proven`,
    );
  }
  return prepared;
}
