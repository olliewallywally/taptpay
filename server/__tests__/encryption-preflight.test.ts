import {
  BANK_PAGE_QUERY, CREDENTIAL_COUNTS_QUERY, assertPreflightTarget,
  countLegacyBankData, parsePreflightArguments,
} from "../encryption-preflight";
import { LEGACY_BANK_COLUMNS, loadDataEncryption } from "../data-encryption";

const target = { host: "127.0.0.1", port: 55440, database: "r5_synthetic" };
const key = Buffer.alloc(32, 17).toString("base64url");
const ready = () => loadDataEncryption({ DATA_ENCRYPTION_STAGE: "read-compatible", DATA_ENCRYPTION_ACTIVE_KEY_ID: "test",
  DATA_ENCRYPTION_KEYRING: JSON.stringify([{ id: "test", key }]),
});
const row = (id: number) => ({ id, bank_name: null, bank_branch: "synthetic branch", account_holder_name: "",
  bank_account_number: null } as Record<string, any>);

function fixture(rows: Record<string, any>[], database = target.database, failQuery?: string) {
  const issued: { text: string; values?: unknown[] }[] = [];
  const client = { query: async (text: string, values?: unknown[]) => {
    issued.push({ text, values });
    if (text === failQuery) throw new Error("synthetic database error including private bank value");
    if (text.startsWith("SELECT current_database()")) return { rows: [{ database }] };
    if (text === CREDENTIAL_COUNTS_QUERY) return { rows: [{ merchants: rows.length, with_credential: 1, with_nonempty_credential: 0 }] };
    if (text === BANK_PAGE_QUERY) return { rows: rows.filter(row => row.id > (values![0] as number)).slice(0, values![1] as number) };
    return { rows: [] };
  } };
  return { issued, client };
}

describe("R5 bounded read-only preflight", () => {
  test.each([
    [], ["--expected-host=127.0.0.1"], ["--expected-host=127.0.0.1", "--expected-database=test"],
    ["--expected-host=127.0.0.1", "--expected-port=0", "--expected-database=test"],
    ["--expected-host=127.0.0.1", "--expected-port=65536", "--expected-database=test"],
    ["--expected-host=127.0.0.1", "--expected-port=55440", "--expected-database=test", "--write=true"],
    ["--expected-host=127.0.0.1", "--expected-host=elsewhere", "--expected-port=55440", "--expected-database=test"],
    ["--expected-host=127.0.0.1", "--expected-port=55440", "--expected-database=test", "--batch-size=1001"],
    ["--expected-host=127.0.0.1", "--expected-port=55440", "--expected-database=test", "--batch-size=101"],
  ].map(argv => [argv]))("invalid/mutating invocation %# fails", argv => {
    expect(() => parsePreflightArguments(argv)).toThrow("R5_PREFLIGHT_INVALID_ARGUMENTS");
  });

  test("explicit target is required, with a bounded page size", () => {
    expect(parsePreflightArguments(["--expected-host=127.0.0.1", "--expected-port=55440", "--expected-database=r5_synthetic"]))
      .toEqual({ ...target, batchSize: 25 });
  });

  test.each([
    { ...target, host: "other" }, { ...target, port: 5432 }, { ...target, database: "other" },
  ])("URI mismatch %p is rejected before any query", async settings => {
    const { client, issued } = fixture([]);
    await expect(countLegacyBankData(client, target, settings, ready())).rejects.toThrow("R5_PREFLIGHT_TARGET_MISMATCH");
    expect(issued).toEqual([]);
  });

  test("unconfigured reader fails before a database statement", async () => {
    const { client, issued } = fixture([]);
    await expect(countLegacyBankData(client, target, target, loadDataEncryption({}))).rejects.toThrow("R5_PREFLIGHT_READER_NOT_READY");
    expect(issued).toEqual([]);
  });

  test("server identity mismatch rolls back before projecting bank fields or counting credentials", async () => {
    const { client, issued } = fixture([], "production");
    await expect(countLegacyBankData(client, target, target, ready())).rejects.toThrow("R5_PREFLIGHT_TARGET_MISMATCH");
    expect(issued[0].text).toBe("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    expect(issued.at(-1)?.text).toBe("ROLLBACK");
    expect(issued.some(query => query.text === BANK_PAGE_QUERY || query.text === CREDENTIAL_COUNTS_QUERY)).toBe(false);
  });

  test.each([1, 2, 3, 100])("keyset pages of %s count every row once and output no data", async batch => {
    const reader = ready();
    const rows = [row(2), row(9), row(50)];
    rows[1].bank_name = reader.encrypt("SYNTHETIC_PRIVATE_BANK", { schema: "public", table: "merchants", rowId: 9, column: "bank_name" });
    const { client, issued } = fixture(rows);
    const report = await countLegacyBankData(client, target, target, reader, batch);
    expect(report.merchants).toBe(3);
    expect(report.safeToBackfill).toBe(true);
    expect(report.credentialCounts).toEqual({ withCredential: 1, withNonemptyCredential: 0 });
    expect(report.fields.bank_name.null).toBe(2);
    expect(report.fields.bank_name.encryptedActiveKey).toBe(1);
    expect(report.fields.bank_branch.plaintext).toBe(3);
    expect(report.fields.account_holder_name.plaintext).toBe(3); // empty is not null
    expect(JSON.stringify(report)).not.toContain("SYNTHETIC_PRIVATE_BANK");
    expect(JSON.stringify(report)).not.toContain("enc:");
    expect(JSON.stringify(report)).not.toContain(key);
    for (const column of LEGACY_BANK_COLUMNS) expect(Object.values(report.fields[column]).reduce((a, b) => a + b, 0)).toBe(3);
    expect(issued.at(-1)?.text).toBe("ROLLBACK");
    expect(issued.every(query => /^(BEGIN|SET LOCAL|SELECT|ROLLBACK)/.test(query.text))).toBe(true);
    expect(issued.filter(query => query.text === BANK_PAGE_QUERY).every(query => query.values![1] === batch)).toBe(true);
  });

  test("all unsafe buckets block suitability without suppressing the rest of the count", async () => {
    const reader = ready();
    const rows = [row(1), row(2), row(3), row(4), row(5)];
    const encrypted = reader.encrypt("bank", { schema: "public", table: "merchants", rowId: 2, column: "bank_name" })!;
    rows[0].bank_name = "enc:v1:broken";
    rows[1].bank_name = encrypted.replace(":test:", ":unavailable:");
    rows[2].bank_name = encrypted; // valid envelope, wrong row
    rows[3].bank_name = "enc:v2:unavailable";
    rows[4].bank_name = undefined;
    const report = await countLegacyBankData(fixture(rows).client, target, target, reader, 2);
    expect(report.safeToBackfill).toBe(false);
    expect(report.fields.bank_name).toMatchObject({ unknownKey: 1, malformedEnvelope: 1, authenticationFailure: 1, unsupportedVersion: 1, invalidValue: 1 });
    expect(report.fields.bank_branch.plaintext).toBe(5);
  });

  test("page failures roll back without returning a partial report", async () => {
    const { client, issued } = fixture([row(1)], target.database, BANK_PAGE_QUERY);
    await expect(countLegacyBankData(client, target, target, ready())).rejects.toThrow("synthetic database error");
    expect(issued.at(-1)?.text).toBe("ROLLBACK");
  });

  test("a server-side oversized flag is invalid data rather than a null value", async () => {
    const oversized = { ...row(1), bank_name: null, bank_name_oversized: true };
    const report = await countLegacyBankData(fixture([oversized]).client, target, target, ready());
    expect(report.fields.bank_name.invalidValue).toBe(1);
    expect(report.fields.bank_name.null).toBe(0);
    expect(report.safeToBackfill).toBe(false);
    expect(BANK_PAGE_QUERY).toContain("octet_length(bank_name)");
  });

  test("duplicate/out-of-order rows are refused rather than looping indefinitely", async () => {
    const { client, issued } = fixture([row(1), row(1)]);
    await expect(countLegacyBankData(client, target, target, ready())).rejects.toThrow("R5_PREFLIGHT_INVALID_PAGE");
    expect(issued.at(-1)?.text).toBe("ROLLBACK");
  });

  test("the credential query never projects its value", () => {
    let projection = CREDENTIAL_COUNTS_QUERY;
    let previous: string;
    do { previous = projection; projection = projection.replace(/\([^()]*\)/g, "[]"); } while (previous !== projection);
    expect(projection).not.toContain("windcave_api_key");
    expect(BANK_PAGE_QUERY).not.toContain("windcave_api_key");
  });

  test("empty target produces complete zero counts", async () => {
    const client = fixture([]).client;
    const query = client.query;
    client.query = async (text, values) => text === CREDENTIAL_COUNTS_QUERY
      ? { rows: [{ merchants: 0, with_credential: 0, with_nonempty_credential: 0 }] }
      : query(text, values);
    const report = await countLegacyBankData(client, target, target, ready());
    expect(report.merchants).toBe(0);
    expect(report.safeToBackfill).toBe(true);
  });
});
