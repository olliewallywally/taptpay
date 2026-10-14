/** R5-T1 integration proof. Only a separately created owned synthetic R5 database. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { merchants } from "@shared/schema";
import { loadDataEncryption, LEGACY_BANK_COLUMNS, MAX_ENCRYPTED_VALUE_BYTES } from "../server/data-encryption";
import { BANK_PAGE_QUERY, countLegacyBankData } from "../server/encryption-preflight";
import { runPreflight } from "./r5-encryption-preflight";
// @ts-expect-error Existing standalone JavaScript safety helper has no declarations.
import { assertSafePostgresVerifierEnvironment } from "./postgres-verifier-safety.mjs";

let checks = 0;
const check = async (name: string, run: () => Promise<void>) => {
  try { await run(); } catch { throw new Error("R5_POSTGRES_CHECK_FAILED"); }
  checks++; process.stdout.write(`PASS ${name}\n`);
};

async function verify() {
  const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
    testDatabaseUrl: process.env.R5_TEST_DATABASE_URL, configuredDatabaseUrl: process.env.DATABASE_URL,
    marker: process.env.TAPTPAY_TEST_DATABASE,
  });
  assertSafePostgresVerifierEnvironment({ testDatabaseUrl, configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE });
  const url = new URL(testDatabaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "55440" || url.pathname !== "/r5_reader_20261014") {
    throw new Error("R5_POSTGRES_OWNED_TARGET_REQUIRED");
  }
  const target = { host: url.hostname, port: Number(url.port), database: url.pathname.slice(1) };
  await import("../server/__tests__/support/test-env");
  const { adminMerchantDto, ownerMerchantDto, publicBusinessDto } = await import("../server/http-contracts");
  const client = new pg.Client({ connectionString: testDatabaseUrl });
  const active = randomBytes(32).toString("base64url");
  const previous = randomBytes(32).toString("base64url");
  const env = { DATA_ENCRYPTION_STAGE: "read-compatible", DATA_ENCRYPTION_ACTIVE_KEY_ID: "current",
    DATA_ENCRYPTION_KEYRING: JSON.stringify([{ id: "current", key: active }, { id: "previous", key: previous }]),
  };
  const reader = loadDataEncryption(env);
  const oldReader = loadDataEncryption({ ...env, DATA_ENCRYPTION_ACTIVE_KEY_ID: "previous" });
  const inserted: number[] = [];
  await client.connect();
  const orm = drizzle(client, { schema: { merchants } });
  try {
    const before = await countLegacyBankData(client, target, target, reader, 2);
    assert.equal(before.safeToBackfill, true);
    for (const kind of ["encryptedActiveKey", "encryptedOldKey", "plaintext", "null"] as const) {
      const id = (await client.query("INSERT INTO public.merchants(name,business_name,email,status) VALUES ('R5 synthetic','R5 synthetic',$1,'active') RETURNING id",
        [`${randomUUID()}@r5-synthetic.test`])).rows[0].id;
      inserted.push(id);
      const values = LEGACY_BANK_COLUMNS.map(column => {
        const context = { schema: "public", table: "merchants", rowId: id, column } as const;
        return kind === "null" ? null : kind === "plaintext" ? "synthetic legacy value" :
          (kind === "encryptedOldKey" ? oldReader : reader).encrypt("synthetic retained value", context);
      });
      await client.query("UPDATE public.merchants SET bank_name=$1,bank_branch=$2,account_holder_name=$3,bank_account_number=$4 WHERE id=$5", [...values, id]);
    }
    const snapshot = async () => (await client.query("SELECT id,bank_name,bank_branch,account_holder_name,bank_account_number FROM public.merchants ORDER BY id")).rows;
    const rawBefore = await snapshot();

    await check("all four fields classify across bounded mixed-format restored-data pages", async () => {
      const report = await countLegacyBankData(client, target, target, reader, 2);
      assert.equal(report.merchants, before.merchants + 4);
      assert.equal(report.safeToBackfill, true);
      for (const column of LEGACY_BANK_COLUMNS) {
        for (const bucket of ["encryptedActiveKey", "encryptedOldKey", "plaintext", "null"] as const) {
          assert.equal(report.fields[column][bucket], before.fields[column][bucket] + 1);
        }
      }
      assert.ok(!JSON.stringify(report).includes("enc:") && !JSON.stringify(report).includes(active));
    });

    await check("every page executes under actual PostgreSQL transaction_read_only", async () => {
      let pages = 0;
      const observedClient = { query: async (text: string, values?: unknown[]) => {
        if (text === BANK_PAGE_QUERY) {
          assert.equal((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "on");
          pages++;
        }
        return client.query(text, values);
      } };
      await countLegacyBankData(observedClient, target, target, reader, 1);
      assert.ok(pages >= 5);
      assert.equal((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "off");
    });

    await check("PostgreSQL itself refuses attempted writes in the read-only transaction", async () => {
      await client.query("BEGIN READ ONLY");
      try {
        await assert.rejects(client.query("UPDATE public.merchants SET bank_name=bank_name WHERE id=$1", [inserted[0]]),
          (error: any) => error.code === "25006");
      } finally { await client.query("ROLLBACK"); }
    });

    await check("reader restart and key rotation preserve retained values", async () => {
      const restarted = loadDataEncryption(env);
      const rows = await snapshot();
      for (const id of inserted.slice(0, 2)) {
        const row = rows.find(row => row.id === id)!;
        for (const column of LEGACY_BANK_COLUMNS) assert.equal(restarted.read(row[column],
          { schema: "public", table: "merchants", rowId: id, column }), "synthetic retained value");
      }
    });

    await check("merchant/column swaps fail authentication against real stored ciphertext", async () => {
      const stored = rawBefore.find(row => row.id === inserted[0])!.bank_name;
      assert.throws(() => reader.read(stored, { schema: "public", table: "merchants", rowId: inserted[1], column: "bank_name" }), /ENCRYPTION_AUTHENTICATION_FAILED/);
      assert.throws(() => reader.read(stored, { schema: "public", table: "merchants", rowId: inserted[0], column: "bank_branch" }), /ENCRYPTION_AUTHENTICATION_FAILED/);
    });

    await check("owner/admin/public DTOs omit plaintext and encrypted legacy bank fields", async () => {
      for (const id of inserted) {
        const [merchant] = await orm.select().from(merchants).where(eq(merchants.id, id));
        assert.ok(merchant);
        for (const dto of [ownerMerchantDto(merchant), adminMerchantDto(merchant), publicBusinessDto(merchant)]) {
          assert.ok(!["bankName", "bankBranch", "accountHolderName", "bankAccountNumber"].some(field => field in dto));
          assert.ok(!JSON.stringify(dto).includes("enc:") && !JSON.stringify(dto).includes("synthetic retained value"));
        }
      }
    });

    await check("the actual standalone CLI service scans only its named target", async () => {
      const report = await runPreflight([`--expected-host=${target.host}`, `--expected-port=${target.port}`,
        `--expected-database=${target.database}`, "--batch-size=2"], { ...env, R5_PREFLIGHT_DATABASE_URL: testDatabaseUrl });
      assert.equal(report.safeToBackfill, true);
      assert.equal(report.merchants, before.merchants + 4);
    });

    const invokeCli = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/r5-encryption-preflight.ts",
      `--expected-host=${target.host}`, `--expected-port=${target.port}`, `--expected-database=${target.database}`, "--batch-size=2"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 15000, env: { ...process.env, ...env, R5_PREFLIGHT_DATABASE_URL: testDatabaseUrl } });
    await check("actual CLI process exits zero and prints counts only on a valid mixed-format target", async () => {
      const result = invokeCli();
      assert.equal(result.status, 0);
      assert.equal(result.stderr, "");
      const report = JSON.parse(result.stdout);
      assert.equal(report.merchants, before.merchants + 4);
      assert.equal(report.safeToBackfill, true);
      assert.ok(!result.stdout.includes("enc:") && !result.stdout.includes(active) && !result.stdout.includes("synthetic retained value"));
    });

    await check("wrong URI target refuses before a connection and does not change the database", async () => {
      await assert.rejects(runPreflight(["--expected-host=wrong.invalid", `--expected-port=${target.port}`,
        `--expected-database=${target.database}`], { ...env, R5_PREFLIGHT_DATABASE_URL: testDatabaseUrl }), /R5_PREFLIGHT_TARGET_MISMATCH/);
      assert.ok(isDeepStrictEqual(await snapshot(), rawBefore));
    });

    await check("corrupted stored ciphertext blocks suitability without overwriting it", async () => {
      const own = rawBefore.find(row => row.id === inserted[0])!.bank_name as string;
      const parts = own.split(":");
      const tag = Buffer.from(parts[4], "base64url"); tag[0] ^= 1; parts[4] = tag.toString("base64url");
      const corrupted = parts.join(":");
      await client.query("UPDATE public.merchants SET bank_name=$1 WHERE id=$2", [corrupted, inserted[0]]);
      const report = await countLegacyBankData(client, target, target, reader, 2);
      assert.equal(report.safeToBackfill, false);
      assert.equal(report.fields.bank_name.authenticationFailure, 1);
      const cli = invokeCli();
      assert.equal(cli.status, 2);
      assert.equal(cli.stderr, "R5_PREFLIGHT_UNSAFE_DATA\n");
      assert.equal(JSON.parse(cli.stdout).safeToBackfill, false);
      assert.ok(!cli.stdout.includes(corrupted));
      const after = (await client.query("SELECT bank_name FROM public.merchants WHERE id=$1", [inserted[0]])).rows[0];
      assert.equal(after.bank_name, corrupted);
      await client.query("UPDATE public.merchants SET bank_name=$1 WHERE id=$2", [own, inserted[0]]);
    });

    await check("preflight leaves all stored values unchanged and finishes its transaction", async () => {
      assert.ok(isDeepStrictEqual(await snapshot(), rawBefore));
      assert.equal((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "off");
    });

    await check("oversized database text is not fetched or mistaken for null/plaintext", async () => {
      await client.query("UPDATE public.merchants SET bank_name=repeat('x',$1) WHERE id=$2", [MAX_ENCRYPTED_VALUE_BYTES * 2, inserted[2]]);
      let sawFlag = false;
      const guarded = { query: async (text: string, values?: unknown[]) => {
        const result = await client.query(text, values);
        if (text === BANK_PAGE_QUERY) for (const row of result.rows) {
          if (row.id === inserted[2]) {
            assert.equal(row.bank_name_oversized, true);
            assert.equal(row.bank_name, null);
            sawFlag = true;
          }
        }
        return result;
      } };
      const report = await countLegacyBankData(guarded, target, target, reader, 2);
      assert.equal(sawFlag, true);
      assert.equal(report.fields.bank_name.invalidValue, 1);
      assert.equal(report.safeToBackfill, false);
      assert.equal((await client.query("SELECT octet_length(bank_name) AS n FROM public.merchants WHERE id=$1", [inserted[2]])).rows[0].n,
        MAX_ENCRYPTED_VALUE_BYTES * 2);
    });

    await check("the SQL byte guard permits a valid maximum-sized encrypted value", async () => {
      const context = { schema: "public", table: "merchants", rowId: inserted[0], column: "bank_name" } as const;
      const max = reader.encrypt("x".repeat(MAX_ENCRYPTED_VALUE_BYTES), context)!;
      await client.query("UPDATE public.merchants SET bank_name=$1 WHERE id=$2", [max, inserted[0]]);
      const report = await countLegacyBankData(client, target, target, reader, 2);
      assert.equal(report.fields.bank_name.encryptedActiveKey, before.fields.bank_name.encryptedActiveKey + 1);
      assert.equal(report.fields.bank_name.invalidValue, 1); // Only the prior oversized plaintext fixture.
    });

    // Do not label this a retained-backup/key-removal drill: T4 owns that proof.
    process.stdout.write(`R5_POSTGRES_READER_CHECKS_PASSED ${checks}\n`);
  } finally {
    // Only this run's fresh synthetic rows, never restored historical rows.
    if (inserted.length) await client.query("DELETE FROM public.merchants WHERE id=ANY($1::int[])", [inserted]);
    await client.end();
  }
}

try { await verify(); }
catch {
  process.stderr.write("R5_POSTGRES_READER_VERIFICATION_FAILED\n");
  process.exitCode = 1;
}
