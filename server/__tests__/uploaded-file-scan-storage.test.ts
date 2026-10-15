import "./support/test-env";

import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { DatabaseStorage, MemStorage, UploadPathOwnershipError } from "../storage";

const INVALID_TENANTS = [undefined, null, 0, -1, NaN, 1.5];
const PATH = "invoices/invoice-1790000000000-0123456789abcdef.pdf";
const BYTES = Buffer.from("%PDF-1.4\nsynthetic");
const SCAN = { scanner: "simulation" };

describe("R1-T7 S6a — a document is readable only with a clean scan on record (memory)", () => {
  test("a scanned save is read by its own business, by the admin reader, and counts as attachable", async () => {
    const storage = new MemStorage() as any;
    await storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, 11, SCAN);
    expect(await storage.getCleanUploadedFileForMerchant(PATH, 11)).toEqual({ mimeType: "application/pdf", data: BYTES });
    expect(await storage.getCleanUploadedFile(PATH)).toEqual({ mimeType: "application/pdf", data: BYTES });
    expect(await storage.cleanUploadedFileOwnedByMerchant(PATH, 11)).toBe(true);
    // Another business reads nothing and cannot attach it.
    expect(await storage.getCleanUploadedFileForMerchant(PATH, 22)).toBeUndefined();
    expect(await storage.cleanUploadedFileOwnedByMerchant(PATH, 22)).toBe(false);
  });

  test("a file stored with no scan is found by no document reader", async () => {
    const storage = new MemStorage() as any;
    await storage.saveUploadedFile(PATH, "application/pdf", BYTES, 11);
    expect(await storage.getCleanUploadedFileForMerchant(PATH, 11)).toBeUndefined();
    expect(await storage.getCleanUploadedFile(PATH)).toBeUndefined();
    expect(await storage.cleanUploadedFileOwnedByMerchant(PATH, 11)).toBe(false);
    // The public folder's reader is not the documents': a logo needs no scan.
    expect(await storage.getUploadedFile(PATH)).toEqual({ mimeType: "application/pdf", data: BYTES });
  });

  test("a file whose scan says infected is found by no document reader", async () => {
    const storage = new MemStorage() as any;
    await storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, 11, SCAN);
    storage.uploadedFileBlobs.get(PATH).scan = { verdict: "infected", scanner: "clamav", signature: "Synthetic.Test", scannedAt: new Date() };
    expect(await storage.getCleanUploadedFileForMerchant(PATH, 11)).toBeUndefined();
    expect(await storage.getCleanUploadedFile(PATH)).toBeUndefined();
    expect(await storage.cleanUploadedFileOwnedByMerchant(PATH, 11)).toBe(false);
  });

  test("another business cannot replace a document or its verdict", async () => {
    const storage = new MemStorage() as any;
    await storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, 11, SCAN);
    await expect(storage.saveScannedUploadedFile(PATH, "image/png", Buffer.from("other"), 22, SCAN)).rejects.toBeInstanceOf(UploadPathOwnershipError);
    expect(await storage.getCleanUploadedFileForMerchant(PATH, 11)).toEqual({ mimeType: "application/pdf", data: BYTES });
    expect(await storage.getCleanUploadedFileForMerchant(PATH, 22)).toBeUndefined();
  });

  test("an unscanned replacement of a scanned document is unscanned", async () => {
    const storage = new MemStorage() as any;
    await storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, 11, SCAN);
    await storage.saveUploadedFile(PATH, "application/pdf", Buffer.from("%PDF-1.4\nreplaced"), 11);
    expect(await storage.getCleanUploadedFileForMerchant(PATH, 11)).toBeUndefined();
  });

  test.each(INVALID_TENANTS)("invalid business %s stores and reads nothing", async (tenant) => {
    const storage = new MemStorage() as any;
    await expect(storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, tenant, SCAN)).rejects.toThrow();
    expect(storage.uploadedFileBlobs.size).toBe(0);
    await storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, 11, SCAN);
    expect(await storage.getCleanUploadedFileForMerchant(PATH, tenant)).toBeUndefined();
    expect(await storage.cleanUploadedFileOwnedByMerchant(PATH, tenant)).toBe(false);
  });

  test("the readers that asked for no scan are retired", () => {
    for (const implementation of [MemStorage, DatabaseStorage]) {
      expect((implementation.prototype as any).getUploadedFileForMerchant).toBeUndefined();
      expect((implementation.prototype as any).uploadedFileOwnedByMerchant).toBeUndefined();
    }
  });
});

/** Every statement DatabaseStorage issues, in order, with the table it names; no database connection. */
function capture(found = true) {
  const calls: any[] = [];
  const answer = (rows: any[]) => {
    const result: any = Promise.resolve(rows);
    result.limit = () => result; result.returning = () => result; result.for = () => result;
    result.onConflictDoUpdate = (conflict: any) => { calls[calls.length - 1].conflict = conflict; return result; };
    return result;
  };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    delete: (table: any) => ({ where: (where: any) => { calls.push({ kind: "delete", table: getTableName(table), where }); return answer([]); } }),
    select: () => ({ from: (table: any) => ({ where: (where: any) => {
      calls.push({ kind: "select", table: getTableName(table), where });
      return answer(found ? [{ id: 7, mimeType: "application/pdf", data: BYTES }] : []);
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      calls.push({ kind: "insert", table: getTableName(table), values });
      return answer(found ? [{ id: 7 }] : []);
    } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const sqlOf = (where: any) => new PgDialect().sqlToQuery(where);

describe("R1-T7 S6a — PostgreSQL statements", () => {
  test("the file and its clean verdict are written in one transaction, the verdict for the file just written", async () => {
    const { storage, calls } = capture();
    await storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, 29, SCAN);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["transaction", undefined], ["insert", "uploaded_files"], ["insert", "uploaded_file_scans"]]);
    expect(calls[1].values).toEqual({ path: PATH, mimeType: "application/pdf", data: BYTES, merchantId: 29 });
    // Only its own business's existing row is replaced (gap 13).
    expect(sqlOf(calls[1].conflict.setWhere).params).toEqual([29]);
    expect(calls[2].values).toEqual({ fileId: 7, verdict: "clean", scanner: "simulation" });
    expect(calls[2].conflict.set).toMatchObject({ verdict: "clean", signature: null, scanner: "simulation", scannedAt: expect.any(Date) });
  });

  test("bytes stored unscanned drop any verdict their file had, in the same transaction", async () => {
    const { storage, calls } = capture();
    await storage.saveUploadedFile(PATH, "application/pdf", BYTES, 29);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["transaction", undefined], ["insert", "uploaded_files"], ["delete", "uploaded_file_scans"]]);
    const query = sqlOf(calls[2].where);
    expect(query.sql).toBe('"uploaded_file_scans"."file_id" = $1');
    expect(query.params).toEqual([7]);
    // A path another business owns is refused before any verdict is touched.
    const refused = capture(false);
    await expect(refused.storage.saveUploadedFile(PATH, "application/pdf", BYTES, 29)).rejects.toBeInstanceOf(UploadPathOwnershipError);
    expect(refused.calls.filter((call) => call.kind === "delete")).toEqual([]);
  });

  test("a path another business owns writes no verdict", async () => {
    const { storage, calls } = capture(false);
    await expect(storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, 29, SCAN)).rejects.toBeInstanceOf(UploadPathOwnershipError);
    expect(calls.filter((call) => call.table === "uploaded_file_scans")).toEqual([]);
  });

  test.each([
    ["getCleanUploadedFileForMerchant", [PATH, 29], [PATH, 29]],
    ["cleanUploadedFileOwnedByMerchant", [PATH, 29], [PATH, 29]],
    ["getCleanUploadedFile", [PATH], [PATH]],
  ] as const)("%s requires the clean verdict in the query itself", async (method, args, params) => {
    const { storage, calls } = capture();
    await storage[method](...args);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["select", "uploaded_files"]]);
    const query = sqlOf(calls[0].where);
    expect(query.sql).toContain('"uploaded_files"."path" = $1');
    if (params.length === 2) expect(query.sql).toContain('"uploaded_files"."merchant_id" = $2');
    expect(query.sql.toLowerCase()).toContain('exists (select 1 from "uploaded_file_scans"');
    expect(query.sql).toContain('"uploaded_file_scans"."file_id" = "uploaded_files"."id"');
    expect(query.sql).toContain(`"uploaded_file_scans"."verdict" = 'clean'`);
    expect(query.params).toEqual([...params]);
  });

  test.each(INVALID_TENANTS)("invalid business %s issues no statement", async (tenant) => {
    const { storage, calls } = capture();
    await expect(storage.saveScannedUploadedFile(PATH, "application/pdf", BYTES, tenant, SCAN)).rejects.toThrow();
    expect(await storage.getCleanUploadedFileForMerchant(PATH, tenant)).toBeUndefined();
    expect(await storage.cleanUploadedFileOwnedByMerchant(PATH, tenant)).toBe(false);
    expect(calls).toEqual([]);
  });
});
