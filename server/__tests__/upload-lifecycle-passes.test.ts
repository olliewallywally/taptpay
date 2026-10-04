import "./support/test-env";

import request from "supertest";
import { createTestApp, cronHeader, resetTestStorage, storage } from "./support/http-harness";
import * as auth from "../auth";
import * as scanning from "../malware-scanner";
import { runUploadRetentionPass, runUploadScanPass, unattachedUploadCutoff, UPLOAD_SCAN_BATCH } from "../upload-lifecycle";

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

const held = storage as any;
const DAY = 86_400_000;
const CLEAN_BYTES = Buffer.from("%PDF-1.4\nsynthetic invoice document");
const TEST_FILE = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from(scanning.EICAR_TEST_FILE)]);
const doc = (n: number) => `invoices/invoice-17900000000${String(n).padStart(2, "0")}-0123456789abcdef.pdf`;
/** A document as one uploaded before scanning existed: stored for its business, with no verdict. */
const earlier = (n: number, merchantId: number, bytes = CLEAN_BYTES) => storage.saveUploadedFile(doc(n), "application/pdf", bytes, merchantId);
const verdictOf = (n: number) => held.uploadedFileBlobs.get(doc(n))?.scan?.verdict;
const age = (path: string, days: number) => { held.uploadedFileBlobs.get(path).createdAt = new Date(Date.now() - days * DAY); };

describe("R1-T7 S6b — the scan pass gives earlier documents their verdict", () => {
  test("a clean one becomes readable; a blocked one stays kept from every reader, and is logged", async () => {
    await earlier(1, 11); await earlier(2, 22, TEST_FILE);
    const log = jest.spyOn(auth, "logSecurityEvent").mockImplementation(() => undefined);
    expect(await runUploadScanPass()).toEqual({ scannerAvailable: true, scanned: 2, clean: 1, blocked: 1, noVerdict: 0 });
    expect(await storage.getCleanUploadedFileForMerchant(doc(1), 11)).toMatchObject({ data: CLEAN_BYTES });
    expect(await storage.getCleanUploadedFileForMerchant(doc(2), 22)).toBeUndefined();
    expect(await storage.getCleanUploadedFile(doc(2))).toBeUndefined();
    expect(held.uploadedFileBlobs.get(doc(2)).scan).toMatchObject({ verdict: "infected", scanner: "simulation", signature: "Eicar-Test-Signature" });
    // The business and what was found, never the document's name or bytes.
    expect(log.mock.calls).toEqual([["INVOICE_DOCUMENT_BLOCKED_BY_SCAN", { merchantId: 22, scanner: "simulation", signature: "Eicar-Test-Signature", pass: "earlier-documents" }]]);
    // Nothing left to do: a second pass scans nothing.
    expect(await runUploadScanPass()).toEqual({ scannerAvailable: true, scanned: 0, clean: 0, blocked: 0, noVerdict: 0 });
  });

  test("one run scans a bounded number, and later runs finish the rest", async () => {
    for (let n = 1; n <= UPLOAD_SCAN_BATCH + 3; n++) await earlier(n, 11);
    expect(await runUploadScanPass()).toMatchObject({ scanned: UPLOAD_SCAN_BATCH, clean: UPLOAD_SCAN_BATCH });
    expect(await runUploadScanPass()).toMatchObject({ scanned: 3, clean: 3 });
    expect(await storage.listUnscannedInvoiceDocuments(50)).toEqual([]);
  });

  test("a run holds only a few documents in memory", () => {
    // Each is read whole, up to the upload limit of 20 MB.
    expect(UPLOAD_SCAN_BATCH).toBeGreaterThan(0);
    expect(UPLOAD_SCAN_BATCH).toBeLessThanOrEqual(10);
  });

  test("documents already scanned and logos are not read at all", async () => {
    await storage.saveScannedUploadedFile(doc(1), "application/pdf", CLEAN_BYTES, 11, { scanner: "simulation" });
    await storage.saveUploadedFile("logos/merchant-11.png", "image/png", Buffer.from([0x89, 0x50]), 11);
    const scan = jest.fn(async () => ({ verdict: "clean", scanner: "spy" }) as const);
    jest.spyOn(scanning, "getMalwareScanner").mockReturnValue({ scan });
    expect(await runUploadScanPass()).toMatchObject({ scanned: 0 });
    expect(scan).not.toHaveBeenCalled();
  });

  test("no scanner configured: nothing is read and nothing recorded", async () => {
    await earlier(1, 11);
    jest.spyOn(scanning, "getMalwareScanner").mockReturnValue(null);
    const list = jest.spyOn(storage, "listUnscannedInvoiceDocuments");
    expect(await runUploadScanPass()).toEqual({ scannerAvailable: false, scanned: 0, clean: 0, blocked: 0, noVerdict: 0 });
    expect(list).not.toHaveBeenCalled();
    expect(verdictOf(1)).toBeUndefined();
  });

  test.each([
    ["cannot be reached", async () => { throw new scanning.ScannerUnavailableError("synthetic outage"); }],
    ["fails some other way", async () => { throw new Error("synthetic fault"); }],
    ["answers something that is no verdict", async () => ({ verdict: "probably-fine", scanner: "broken" }) as any],
    ["finds something it does not name", async () => ({ verdict: "infected", scanner: "broken" }) as any],
  ])("a scanner that %s stops the pass: no document becomes readable, none is condemned", async (_what, answer) => {
    await earlier(1, 11); await earlier(2, 11); await earlier(3, 11);
    const scan = jest.fn(answer);
    jest.spyOn(scanning, "getMalwareScanner").mockReturnValue({ scan });
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runUploadScanPass()).toEqual({ scannerAvailable: true, scanned: 0, clean: 0, blocked: 0, noVerdict: 1 });
    // It stopped at the first document that got no verdict.
    expect(scan).toHaveBeenCalledTimes(1);
    expect([1, 2, 3].map(verdictOf)).toEqual([undefined, undefined, undefined]);
    log.mockRestore();
  });

  test("a verdict another pass recorded first is not counted or overwritten", async () => {
    await earlier(1, 11);
    const scan = jest.fn(async () => {
      // Another instance's pass finishes this document while ours is still scanning it.
      const [row] = await storage.listUnscannedInvoiceDocuments(10);
      await storage.recordUploadedFileScan(row.path, row.version, { verdict: "infected", scanner: "other-pass", signature: "Synthetic.Test" });
      return { verdict: "clean", scanner: "ours" } as const;
    });
    jest.spyOn(scanning, "getMalwareScanner").mockReturnValue({ scan });
    expect(await runUploadScanPass()).toEqual({ scannerAvailable: true, scanned: 0, clean: 0, blocked: 0, noVerdict: 0 });
    expect(held.uploadedFileBlobs.get(doc(1)).scan).toMatchObject({ verdict: "infected", scanner: "other-pass" });
  });
});

describe("R1-T7 S6b — an upload no invoice uses is deleted 12 months after it was uploaded", () => {
  test.each([
    ["2026-10-04T10:30:00.000Z", "2025-10-04T10:30:00.000Z"],
    ["2027-01-15T00:00:00.000Z", "2026-01-15T00:00:00.000Z"],
    // A leap day has no twin the year before: the day after, so a February 28 upload is past 12 months.
    ["2028-02-29T12:00:00.000Z", "2027-03-01T12:00:00.000Z"],
  ])("12 calendar months before %s is %s", (now, cutoff) => {
    expect(unattachedUploadCutoff(new Date(now)).toISOString()).toBe(cutoff);
  });

  test("deletes only documents past 12 months, reports and logs the count alone", async () => {
    await earlier(1, 11); await earlier(2, 11); await earlier(3, 22);
    await storage.saveUploadedFile("logos/merchant-11.png", "image/png", Buffer.from([0x89, 0x50]), 11);
    age(doc(1), 400); age(doc(2), 300); age(doc(3), 800); age("logos/merchant-11.png", 900);
    const log = jest.spyOn(auth, "logSecurityEvent").mockImplementation(() => undefined);
    const now = new Date();
    expect(await runUploadRetentionPass(now)).toEqual({ deleted: 2, uploadedBefore: unattachedUploadCutoff(now).toISOString() });
    expect([...held.uploadedFileBlobs.keys()].sort()).toEqual([doc(2), "logos/merchant-11.png"].sort());
    expect(log.mock.calls).toEqual([["UNATTACHED_UPLOADS_DELETED", { deleted: 2, uploadedBefore: unattachedUploadCutoff(now).toISOString() }]]);
    // Nothing left past the cutoff: nothing deleted, nothing logged.
    log.mockClear();
    expect(await runUploadRetentionPass(now)).toMatchObject({ deleted: 0 });
    expect(log).not.toHaveBeenCalled();
  });

  test("the cutoff it hands storage is the 12-month one, and one pass is bounded", async () => {
    const remove = jest.spyOn(storage, "deleteUnattachedInvoiceDocuments").mockResolvedValue(0);
    const now = new Date("2026-10-04T10:30:00.000Z");
    await runUploadRetentionPass(now);
    expect(remove.mock.calls).toEqual([[new Date("2025-10-04T10:30:00.000Z"), expect.any(Number)]]);
    expect(remove.mock.calls[0][1]).toBeGreaterThan(0);
    expect(remove.mock.calls[0][1]).toBeLessThanOrEqual(50);
  });
});

describe("R1-T7 S6b — the scheduler runs both passes and reports them", () => {
  test("each run scans earlier documents and deletes old unattached ones", async () => {
    const { app } = await createTestApp();
    await earlier(1, 11); await earlier(2, 11);
    age(doc(2), 500);
    const res = await request(app).post("/api/internal/cron").set(cronHeader());
    expect(res.status).toBe(200);
    expect(res.body.failedPasses).toEqual([]);
    // The old one got its verdict and was then deleted as unattached; the recent one is readable.
    expect(res.body.uploadScans).toEqual({ scannerAvailable: true, scanned: 2, clean: 2, blocked: 0, noVerdict: 0 });
    expect(res.body.uploadRetention).toMatchObject({ deleted: 1 });
    expect([...held.uploadedFileBlobs.keys()]).toEqual([doc(1)]);
    expect(verdictOf(1)).toBe("clean");
  });

  test("a failing upload pass is reported and stops no other pass", async () => {
    const { app } = await createTestApp();
    await earlier(1, 11); age(doc(1), 500);
    jest.spyOn(storage, "listUnscannedInvoiceDocuments").mockRejectedValue(new Error("synthetic database fault"));
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(app).post("/api/internal/cron").set(cronHeader());
    expect(res.status).toBe(207);
    expect(res.body.failedPasses).toEqual(["uploadScans"]);
    expect(res.body.uploadScans).toEqual({ error: "Pass failed" });
    expect(res.body.uploadRetention).toMatchObject({ deleted: 1 });
    log.mockRestore();
  });

  test("the scheduler's secret is still required: without it nothing is scanned or deleted", async () => {
    const { app } = await createTestApp();
    await earlier(1, 11); age(doc(1), 500);
    const res = await request(app).post("/api/internal/cron");
    expect(res.status).not.toBe(200);
    expect([...held.uploadedFileBlobs.keys()]).toEqual([doc(1)]);
    expect(verdictOf(1)).toBeUndefined();
  });
});
