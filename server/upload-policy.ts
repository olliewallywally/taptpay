/**
 * Gap 13 (plan §8.5 "uploads", §22.8): what the unauthenticated /uploads route
 * may serve, and what shape of stored reference the invoice/quote create routes
 * may accept as a document attachment.
 *
 * Kept as pure functions so every request handler relies on one definition of
 * "a generated invoice-document name" rather than each re-deriving it, and so a
 * client-supplied string is never treated as anything but an opaque name.
 */

/** Folder the invoice-document upload route writes under (`invoices/<name>`). */
export const INVOICE_DOCUMENT_FOLDER = "invoices";

/**
 * The only folders `GET /uploads/:folder/:name` may serve without
 * authentication. Logos are shown to customers on hosted checkout pages, so
 * public is their intended policy (Oliver, 2026-09-14). Everything else —
 * invoice documents in particular — is served only through a route that
 * authorizes the caller.
 */
export const PUBLIC_UPLOAD_FOLDERS: ReadonlySet<string> = new Set(["logos"]);

export function isPublicUploadFolder(folder: string): boolean {
  return typeof folder === "string" && PUBLIC_UPLOAD_FOLDERS.has(folder);
}

/**
 * `invoice-<Date.now()>-<8 random bytes, hex><MIME-derived extension>` is what
 * POST /api/property/invoices/document now generates. Keep short alphanumeric
 * extensions and extensionless names for legacy references. Older uploads could
 * produce other extensions; those require legacy reconciliation, never a wider
 * path parser. Anchored and with no `.` in the classes so a stored
 * reference can never encode a path, query string or traversal.
 */
const INVOICE_DOCUMENT_NAME = /^invoice-\d{10,16}-[0-9a-f]{16}(?:\.[a-z0-9]{1,10})?$/;

export function isInvoiceDocumentName(name: unknown): name is string {
  return typeof name === "string" && INVOICE_DOCUMENT_NAME.test(name);
}

const INVOICE_DOCUMENT_REF_PREFIX = `/uploads/${INVOICE_DOCUMENT_FOLDER}/`;

/**
 * Resolves the reference the upload route hands back (and the create routes
 * store in `document_url`) to its storage path. Returns null for anything that
 * is not exactly `/uploads/invoices/<generated-name>` — external URLs,
 * `javascript:`/`data:` URIs, other folders (logos), traversal, queries and
 * fragments all fall out here.
 *
 * The stored value is an opaque reference, not a fetchable URL: it is served
 * only through the authenticated merchant route or the checkout-token route.
 */
export function parseInvoiceDocumentRef(ref: unknown): { name: string; relPath: string } | null {
  if (typeof ref !== "string" || !ref.startsWith(INVOICE_DOCUMENT_REF_PREFIX)) return null;
  const name = ref.slice(INVOICE_DOCUMENT_REF_PREFIX.length);
  if (!isInvoiceDocumentName(name)) return null;
  return { name, relPath: `${INVOICE_DOCUMENT_FOLDER}/${name}` };
}
