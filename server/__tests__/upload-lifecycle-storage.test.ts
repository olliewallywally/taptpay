import "./support/test-env";

import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { DatabaseStorage, MemStorage } from "../storage";

const BYTES = Buffer.from("%PDF-1.4\nsynthetic");
const doc = (n: number) => `invoices/invoice-17900000000${String(n).padStart(2, "0")}-0123456789abcdef.pdf`;
const CLEAN = { verdict: "clean", scanner: "simulation" } as const;
const FOUND = { verdict: "infected", scanner: "simulation", signature: "Eicar-Test-Signature" } as const;
const DAY = 86_400_000;

/** Memory storage with documents of given ages; `scanned` ones were stored with a clean verdict. */
async function seeded() {
  const storage = new MemStorage() as any;
  await storage.saveUploadedFile(doc(1), "application/pdf", BYTES, 11);
  await storage.saveUploadedFile(doc(2), "application/pdf", BYTES, 22);
  await storage.saveScannedUploadedFile(doc(3), "application/pdf", BYTES, 11, { scanner: "simulation" });
  await storage.saveUploadedFile("logos/merchant-11.png", "image/png", Buffer.from([0x89, 0x50]), 11);
  return storage;
}
const age = (storage: any, path: string, days: number) => { storage.uploadedFileBlobs.get(path).createdAt = new Date(Date.now() - days * DAY); };

describe("R1-T7 S6b — documents with no verdict (memory)", () => {
  test("lists only documents with no scan on record, never a logo, within the limit", async () => {
    const storage = await seeded();
    const listed = await storage.listUnscannedInvoiceDocuments(10);
    expect(listed.map((row: any) => row.path).sort()).toEqual([doc(1), doc(2)]);
    expect(listed.find((row: any) => row.path === doc(1))).toMatchObject({ merchantId: 11, data: BYTES, version: expect.any(String) });
    expect(await storage.listUnscannedInvoiceDocuments(1)).toHaveLength(1);
    expect(await storage.listUnscannedInvoiceDocuments(0)).toEqual([]);
  });

  test("a clean verdict makes the document readable; an infected one keeps it from every reader", async () => {
    const storage = await seeded();
    const [first, second] = [doc(1), doc(2)].map((path) => storage.listUnscannedInvoiceDocuments(10).then((rows: any[]) => rows.find((row) => row.path === path)));
    expect(await storage.recordUploadedFileScan(doc(1), (await first).version, CLEAN)).toBe(true);
    expect(await storage.recordUploadedFileScan(doc(2), (await second).version, FOUND)).toBe(true);
    expect(await storage.getCleanUploadedFileForMerchant(doc(1), 11)).toEqual({ mimeType: "application/pdf", data: BYTES });
    expect(await storage.getCleanUploadedFileForMerchant(doc(2), 22)).toBeUndefined();
    expect(await storage.getCleanUploadedFile(doc(2))).toBeUndefined();
    expect(storage.uploadedFileBlobs.get(doc(2)).scan).toMatchObject({ verdict: "infected", signature: "Eicar-Test-Signature" });
    // The bytes of a blocked document are kept where they are, unreadable: nothing is deleted here.
    expect(storage.uploadedFileBlobs.get(doc(2)).data).toEqual(BYTES);
    expect(await storage.listUnscannedInvoiceDocuments(10)).toEqual([]);
  });

  test("a file takes one verdict: a second pass, a replaced file and a missing one record nothing", async () => {
    const storage = await seeded();
    const [row] = (await storage.listUnscannedInvoiceDocuments(10)).filter((listed: any) => listed.path === doc(1));
    expect(await storage.recordUploadedFileScan(doc(1), row.version, FOUND)).toBe(true);
    expect(await storage.recordUploadedFileScan(doc(1), row.version, CLEAN)).toBe(false);
    expect(storage.uploadedFileBlobs.get(doc(1)).scan.verdict).toBe("infected");
    // The bytes were replaced after they were read for scanning: the verdict is not theirs.
    const [second] = (await storage.listUnscannedInvoiceDocuments(10)).filter((listed: any) => listed.path === doc(2));
    await storage.saveUploadedFile(doc(2), "application/pdf", Buffer.from("%PDF-1.4\nreplaced"), 22);
    expect(await storage.recordUploadedFileScan(doc(2), second.version, CLEAN)).toBe(false);
    expect(storage.uploadedFileBlobs.get(doc(2)).scan).toBeUndefined();
    expect(await storage.recordUploadedFileScan(doc(9), "0", CLEAN)).toBe(false);
  });

  test.each([{ verdict: "probably-fine", scanner: "x" }, { verdict: "infected", scanner: "x" }, { verdict: "infected", scanner: "x", signature: "" }, undefined])(
    "a verdict that is neither, or a finding with no name, is refused: %j", async (scan) => {
      const storage = await seeded();
      const [row] = (await storage.listUnscannedInvoiceDocuments(10)).filter((listed: any) => listed.path === doc(1));
      await expect(storage.recordUploadedFileScan(doc(1), row.version, scan)).rejects.toThrow();
      expect(storage.uploadedFileBlobs.get(doc(1)).scan).toBeUndefined();
    });
});

describe("R1-T7 S6b — uploads no invoice uses (memory)", () => {
  test("only documents uploaded before the cutoff are deleted, with their verdicts; logos never", async () => {
    const storage = await seeded();
    const cutoff = new Date(Date.now() - 365 * DAY);
    age(storage, doc(1), 366); age(storage, doc(2), 364); age(storage, doc(3), 400); age(storage, "logos/merchant-11.png", 900);
    expect(await storage.deleteUnattachedInvoiceDocuments(cutoff, 10)).toBe(2);
    expect([...storage.uploadedFileBlobs.keys()].sort()).toEqual([doc(2), "logos/merchant-11.png"].sort());
    expect(await storage.deleteUnattachedInvoiceDocuments(cutoff, 10)).toBe(0);
  });

  test("the limit bounds one pass", async () => {
    const storage = await seeded();
    for (const path of [doc(1), doc(2), doc(3)]) age(storage, path, 500);
    expect(await storage.deleteUnattachedInvoiceDocuments(new Date(), 2)).toBe(2);
    expect(await storage.deleteUnattachedInvoiceDocuments(new Date(), 2)).toBe(1);
  });
});

/** Every statement DatabaseStorage issues, in order, with the table it names; no database connection. */
function capture(rows: any[] = [{ id: 7 }]) {
  const calls: any[] = [];
  const answer = (found: any[]) => {
    const result: any = Promise.resolve(found);
    const chain = (name: string) => (...args: any[]) => { calls[calls.length - 1][name] = args.length === 1 ? args[0] : args; return result; };
    for (const name of ["limit", "orderBy", "returning", "for", "onConflictDoNothing"]) result[name] = chain(name);
    return result;
  };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => ({ where: (where: any) => { calls.push({ kind: "select", table: getTableName(table), where }); return answer(rows); } }) }),
    insert: (table: any) => ({ values: (values: any) => { calls.push({ kind: "insert", table: getTableName(table), values }); return answer(rows); } }),
    delete: (table: any) => ({ where: (where: any) => { calls.push({ kind: "delete", table: getTableName(table), where }); return answer(rows); } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const sqlOf = (where: any) => new PgDialect().sqlToQuery(where);
// "Names it" is read widely, because a deletion cannot be undone: the file's path anywhere in the address.
const UNATTACHED = [
  `not exists (select 1 from "invoices_rent_requests" where position("uploaded_files"."path" in "invoices_rent_requests"."document_url") > 0)`,
  `not exists (select 1 from "quotes" where position("uploaded_files"."path" in "quotes"."document_url") > 0)`,
  `not exists (select 1 from "job_invoices" where position("uploaded_files"."path" in "job_invoices"."document_url") > 0)`,
];

describe("R1-T7 S6b — PostgreSQL statements", () => {
  test("the list reads documents-folder files with no scan row, in no fixed order, bounded", async () => {
    const { storage, calls } = capture([]);
    await storage.listUnscannedInvoiceDocuments(5);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["select", "uploaded_files"]]);
    const query = sqlOf(calls[0].where);
    expect(query.sql).toContain('"uploaded_files"."path" like $1');
    expect(query.sql).toContain('not exists (select 1 from "uploaded_file_scans" where "uploaded_file_scans"."file_id" = "uploaded_files"."id")');
    expect(query.params).toEqual(["invoices/%"]);
    expect(calls[0].limit).toBe(5);
    expect(sqlOf(calls[0].orderBy).sql).toBe("random()");
  });

  test.each([0, -1, 1.5, NaN, 51, undefined])("a limit of %s lists and deletes nothing, with no statement", async (limit) => {
    const { storage, calls } = capture();
    expect(await storage.listUnscannedInvoiceDocuments(limit)).toEqual([]);
    expect(await storage.deleteUnattachedInvoiceDocuments(new Date(), limit)).toBe(0);
    expect(calls).toEqual([]);
  });

  test("a verdict is recorded under the file's row lock, for the bytes that were read, and never over another", async () => {
    const { storage, calls } = capture();
    expect(await storage.recordUploadedFileScan(doc(1), "2026-10-04 00:00:00.123456", FOUND)).toBe(true);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["transaction", undefined], ["select", "uploaded_files"], ["insert", "uploaded_file_scans"]]);
    const query = sqlOf(calls[1].where);
    expect(query.sql).toContain('"uploaded_files"."path" = $1');
    expect(query.sql).toContain('"uploaded_files"."created_at"::text = $2');
    expect(query.params).toEqual([doc(1), "2026-10-04 00:00:00.123456"]);
    expect(calls[1].for).toBe("update");
    expect(calls[2].values).toEqual({ fileId: 7, verdict: "infected", signature: "Eicar-Test-Signature", scanner: "simulation" });
    expect(calls[2]).toHaveProperty("onConflictDoNothing");
    // A clean verdict carries no signature.
    const clean = capture();
    await clean.storage.recordUploadedFileScan(doc(1), "v", CLEAN);
    expect(clean.calls[2].values).toEqual({ fileId: 7, verdict: "clean", signature: null, scanner: "simulation" });
    // No such file, or its bytes were replaced: nothing is written.
    const gone = capture([]);
    expect(await gone.storage.recordUploadedFileScan(doc(1), "v", CLEAN)).toBe(false);
    expect(gone.calls.filter((call) => call.kind === "insert")).toEqual([]);
  });

  test("a verdict that is neither is refused before any statement", async () => {
    const { storage, calls } = capture();
    await expect(storage.recordUploadedFileScan(doc(1), "v", { verdict: "probably-fine", scanner: "x" })).rejects.toThrow();
    await expect(storage.recordUploadedFileScan(doc(1), "v", { verdict: "infected", scanner: "x" })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test("the deletion locks its candidates, skipping any being attached, then deletes only what is still unattached", async () => {
    const { storage, calls } = capture([{ id: 7 }, { id: 9 }]);
    const cutoff = new Date("2025-10-04T00:00:00.000Z");
    expect(await storage.deleteUnattachedInvoiceDocuments(cutoff, 20)).toBe(2);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["transaction", undefined], ["select", "uploaded_files"], ["delete", "uploaded_files"]]);
    const select = sqlOf(calls[1].where);
    expect(select.sql).toContain('"uploaded_files"."path" like $1');
    expect(select.sql).toContain('"uploaded_files"."created_at" < $2');
    for (const reference of UNATTACHED) expect(select.sql).toContain(reference);
    expect(select.params).toEqual(["invoices/%", cutoff.toISOString()]);
    expect(calls[1].limit).toBe(20);
    expect(calls[1].for).toEqual(["update", { skipLocked: true }]);
    const removal = sqlOf(calls[2].where);
    expect(removal.sql).toContain('"uploaded_files"."id" in ($1, $2)');
    expect(removal.sql).toContain('"uploaded_files"."path" like $3');
    for (const reference of UNATTACHED) expect(removal.sql).toContain(reference);
    expect(removal.params).toEqual([7, 9, "invoices/%"]);
  });

  test("nothing old and unattached: no delete is issued", async () => {
    const { storage, calls } = capture([]);
    expect(await storage.deleteUnattachedInvoiceDocuments(new Date(), 20)).toBe(0);
    expect(calls.filter((call) => call.kind === "delete")).toEqual([]);
  });
});
