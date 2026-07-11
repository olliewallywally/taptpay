/* IO edge for report generation: turn a composed @react-pdf <Document> into a
   file the merchant actually receives. Everything upstream — report-utils and
   the per-vertical report files — is pure and unit-testable; all the
   browser-only surface (Blob URLs, anchor downloads) is quarantined here.

   Both PDF and CSV are delivered as a direct download — the merchant opens the
   saved file and shares it from their own PDF viewer. That's deliberate: the
   native Web Share sheet is unreliable inside the app's webview (it can silently
   swallow the tap), whereas a download always lands a file they can act on. */
import { pdf } from "@react-pdf/renderer";

/* The element type `pdf()` accepts (a <Document> at the root). Derived from the
   function itself because @react-pdf doesn't export DocumentProps by name. */
export type ReportDoc = NonNullable<Parameters<typeof pdf>[0]>;

/** Strip anything a filename or Content-Disposition header would choke on and
   guarantee the extension. "Rent Roll – June 2026" → "rent-roll-june-2026.pdf". */
export function reportFilename(base: string, ext: "pdf" | "csv"): string {
  const stem = base
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "") // drop punctuation, em dashes, emoji, macrons decomposed above
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
  const name = stem || "taptpay-report";
  return name.endsWith(`.${ext}`) ? name : `${name}.${ext}`;
}

/** Render a composed report Document to a PDF Blob. Resolves once @react-pdf
   has laid out every page and embedded the fonts. */
export function renderPdfBlob(doc: ReportDoc): Promise<Blob> {
  return pdf(doc).toBlob();
}

/** Push any Blob to the user as a download via a short-lived object URL. */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has committed before the URL dies.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Render `doc` and download it as a PDF. The merchant opens the saved file and
   shares it from their PDF viewer — more reliable inside the webview than the
   native share sheet. */
export async function savePdf(doc: ReportDoc, filename: string): Promise<void> {
  const blob = await renderPdfBlob(doc);
  triggerDownload(blob, reportFilename(filename, "pdf"));
}

/** Download a CSV string (produced by report-utils buildCSV). Prepends a UTF-8
   BOM so Excel on Windows reads NZ characters as UTF-8 rather than Latin-1. */
export function downloadCsv(csv: string, filename: string) {
  const BOM = String.fromCharCode(0xfeff); // UTF-8 BOM for Excel/Windows
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, reportFilename(filename, "csv"));
}
