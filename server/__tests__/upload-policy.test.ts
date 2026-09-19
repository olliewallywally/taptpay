import {
  INVOICE_DOCUMENT_FOLDER,
  PUBLIC_UPLOAD_FOLDERS,
  isInvoiceDocumentName,
  isPublicUploadFolder,
  parseInvoiceDocumentRef,
} from "../upload-policy";

/**
 * Gap 13: the only folders the unauthenticated /uploads route may serve, and the
 * only shape of stored reference the invoice/quote create routes may accept.
 * Pure functions — every rule here is what a request handler relies on to keep a
 * client-supplied string from being treated as anything but an opaque, generated
 * document name.
 */
describe("public upload folders", () => {
  it("allows the logos folder and nothing else", () => {
    expect([...PUBLIC_UPLOAD_FOLDERS]).toEqual(["logos"]);
    expect(isPublicUploadFolder("logos")).toBe(true);
  });

  it.each(["invoices", "", "Logos", "logos/", "logos..", "misc", "__proto__", "constructor", "toString"])(
    "rejects %j",
    (folder) => {
      expect(isPublicUploadFolder(folder)).toBe(false);
    },
  );
});

describe("invoice document names (the shape the upload route generates)", () => {
  it.each([
    "invoice-1700000000000-0123456789abcdef.pdf",
    "invoice-1700000000000-0123456789abcdef.jpg",
    "invoice-1700000000000-0123456789abcdef.jpeg",
    "invoice-1700000000000-0123456789abcdef.png",
    "invoice-1700000000000-0123456789abcdef.webp",
    "invoice-1700000000000-0123456789abcdef.heic",
    "invoice-1700000000000-0123456789abcdef", // no client extension
  ])("accepts %s", (name) => {
    expect(isInvoiceDocumentName(name)).toBe(true);
  });

  it.each([
    "",
    ".",
    "..",
    "../invoice-1700000000000-0123456789abcdef.pdf",
    "invoices/invoice-1700000000000-0123456789abcdef.pdf",
    "invoice-1700000000000-0123456789ABCDEF.pdf", // hex is lowercase
    "invoice-1700000000000-0123456789abcde.pdf", // 15 hex chars
    "invoice-1700000000000-0123456789abcdef0.pdf", // 17 hex chars
    "invoice-1700000000000-0123456789abcdef.abcdefghijklmnop", // over-long extension
    "invoice-1700000000000-0123456789abcdef.p<f",
    "invoice-1700000000000-0123456789abcdef.pdf ",
    " invoice-1700000000000-0123456789abcdef.pdf",
    "invoice-1700000000000-0123456789abcdef.pdf\n",
    "merchant-5.png",
    "bill.pdf",
  ])("rejects %j", (name) => {
    expect(isInvoiceDocumentName(name)).toBe(false);
  });

  it("rejects a non-string", () => {
    for (const value of [undefined, null, 5, {}, [], ["invoice-1700000000000-0123456789abcdef.pdf"]]) {
      expect(isInvoiceDocumentName(value as any)).toBe(false);
    }
  });
});

describe("parseInvoiceDocumentRef", () => {
  const good = "invoice-1700000000000-0123456789abcdef.pdf";

  it("resolves the reference the upload route returns to its storage path", () => {
    expect(parseInvoiceDocumentRef(`/uploads/${INVOICE_DOCUMENT_FOLDER}/${good}`)).toEqual({
      name: good,
      relPath: `invoices/${good}`,
    });
  });

  it.each([
    ["an absolute URL", `https://app.example/uploads/invoices/${good}`],
    ["a protocol-relative URL", `//app.example/uploads/invoices/${good}`],
    ["an external URL", "https://evil.example/bill.pdf"],
    ["a javascript: URI", "javascript:alert(1)"],
    ["a data: URI", "data:text/html,<script>alert(1)</script>"],
    ["a logo path", "/uploads/logos/merchant-5.png"],
    ["another folder", `/uploads/misc/${good}`],
    ["a traversal", `/uploads/invoices/../logos/merchant-5.png`],
    ["a query string", `/uploads/invoices/${good}?x=1`],
    ["a fragment", `/uploads/invoices/${good}#x`],
    ["a trailing slash", `/uploads/invoices/${good}/`],
    ["the token-route URL", "/api/checkout/document/abc"],
    ["surrounding whitespace", ` /uploads/invoices/${good}`],
    ["an empty string", ""],
  ])("rejects %s", (_label, ref) => {
    expect(parseInvoiceDocumentRef(ref)).toBeNull();
  });

  it("rejects a non-string", () => {
    for (const value of [undefined, null, 5, {}, []]) {
      expect(parseInvoiceDocumentRef(value)).toBeNull();
    }
  });
});
