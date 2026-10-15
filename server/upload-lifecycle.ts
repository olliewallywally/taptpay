import {logOperation} from "./structured-log";
/**
 * R1-T7 S6b: the two scheduled passes of the private upload lifecycle (owner decisions 2026-09-29,
 * docs/decisions/2026-09-29-finish-r1-owner-answers.md, answers 3 and 4).
 *
 * - Documents with no scan on record (those uploaded before scanning existed) are scanned and given
 *   their verdict. Clean makes one readable again; infected is recorded and its bytes stay where
 *   they are, unreadable. A scanner that gives no verdict stops the pass and records nothing.
 * - An upload no invoice or quote names is deleted 12 months after it was uploaded. An attached
 *   document is never touched here, however old (the 7-year rule of 2026-09-21).
 */
import { storage } from "./storage";
import { logSecurityEvent } from "./auth";
import { getMalwareScanner, type ScanResult } from "./malware-scanner";

/** Each document is read into memory (up to 20 MB), so one run takes a few. */
export const UPLOAD_SCAN_BATCH = 5;
export const UNATTACHED_UPLOAD_RETENTION_MONTHS = 12;
/** The most one run deletes; the next run takes the rest. */
export const UPLOAD_DELETE_BATCH = 50;

export interface UploadScanReport {
  /** False when no scanner is configured: nothing was read. */
  scannerAvailable: boolean;
  /** Verdicts this run recorded. */
  scanned: number;
  clean: number;
  blocked: number;
  /** 1 when the run stopped at a document the scanner gave no verdict on. */
  noVerdict: number;
}

/** A verdict the scanner is entitled to give, or nothing. */
function verdictOf(result: unknown): ScanResult | null {
  const scan = result as Partial<ScanResult> & { signature?: unknown } | null | undefined;
  if (!scan || typeof scan.scanner !== "string" || !scan.scanner) return null;
  if (scan.verdict === "clean") return { verdict: "clean", scanner: scan.scanner };
  if (scan.verdict === "infected" && typeof scan.signature === "string" && scan.signature) {
    return { verdict: "infected", scanner: scan.scanner, signature: scan.signature };
  }
  return null;
}

export async function runUploadScanPass(): Promise<UploadScanReport> {
  const report: UploadScanReport = { scannerAvailable: true, scanned: 0, clean: 0, blocked: 0, noVerdict: 0 };
  const scanner = getMalwareScanner();
  if (!scanner) return { ...report, scannerAvailable: false };

  for (const document of await storage.listUnscannedInvoiceDocuments(UPLOAD_SCAN_BATCH)) {
    let scan: ScanResult | null;
    try {
      scan = verdictOf(await scanner.scan(document.data));
    } catch {
      scan = null;
    }
    if (!scan) {
      // No verdict is neither clean nor infected. Stop: the scanner is most likely down, and the
      // next run starts again. Documents are taken in no fixed order, so one the scanner can never
      // judge does not hold the others back.
      logOperation("error","UPLOAD_SCAN_PASS_THE_SCANNER_GAVE_NO_VERDICT_THE_PASS_STOPPED",{payload:["[UPLOAD_SCAN_PASS] the scanner gave no verdict; the pass stopped"]});
      report.noVerdict = 1;
      break;
    }
    // Only if the file still has no verdict and still holds the bytes that were scanned.
    if (!(await storage.recordUploadedFileScan(document.path, document.version, scan))) continue;
    report.scanned++;
    if (scan.verdict === "clean") {
      report.clean++;
    } else {
      report.blocked++;
      logSecurityEvent("INVOICE_DOCUMENT_BLOCKED_BY_SCAN", {
        merchantId: document.merchantId, scanner: scan.scanner, signature: scan.signature, pass: "earlier-documents",
      });
    }
  }
  return report;
}

/** 12 calendar months before `now`, in UTC: an upload stored before this is past its 12 months. */
export function unattachedUploadCutoff(now: Date): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - UNATTACHED_UPLOAD_RETENTION_MONTHS);
  return cutoff;
}

export async function runUploadRetentionPass(now: Date): Promise<{ deleted: number; uploadedBefore: string }> {
  const cutoff = unattachedUploadCutoff(now);
  const deleted = await storage.deleteUnattachedInvoiceDocuments(cutoff, UPLOAD_DELETE_BATCH);
  const report = { deleted, uploadedBefore: cutoff.toISOString() };
  // A count only: no business, name or address of what was removed.
  if (deleted > 0) logSecurityEvent("UNATTACHED_UPLOADS_DELETED", report);
  return report;
}
