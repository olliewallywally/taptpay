import {
  BOARD_PRINT_PDF_MAX_BYTES, boardPrintRequestSchema, decodeBoardPrintPdf,
} from "../board-print";

function pdfOf(bytes: number): Buffer {
  const pdf = Buffer.alloc(bytes, 0x41);
  Buffer.from("%PDF-1.3\n").copy(pdf);
  return pdf;
}

function requestWithPdf(pdf: string) {
  return { pdf, stoneId: 1, layout: "A5 Portrait", submitterName: "Jamie", submitterEmail: "jamie@example.test" };
}

describe("board print PDF base64 padding", () => {
  it.each([9, 10, 11, BOARD_PRINT_PDF_MAX_BYTES - 2, BOARD_PRINT_PDF_MAX_BYTES - 1, BOARD_PRINT_PDF_MAX_BYTES])(
    "accepts a standard base64 PDF of %i bytes", (size) => {
      const pdf = pdfOf(size);
      const base64 = pdf.toString("base64");
      expect(boardPrintRequestSchema.safeParse(requestWithPdf(base64)).success).toBe(true);
      expect(decodeBoardPrintPdf(base64)?.equals(pdf)).toBe(true);
    });

  it.each([
    ["missing padding", pdfOf(10).toString("base64").replace(/=+$/, "")],
    ["incomplete padding", pdfOf(10).toString("base64").slice(0, -1)],
    ["unnecessary padding", `${pdfOf(9).toString("base64") }=`],
    ["too much padding", `${pdfOf(10).toString("base64") }=`],
    ["padding in the middle", "JVBE=Ri0xLjMK"],
    ["one trailing sextet", `${pdfOf(9).toString("base64") }A`],
    ["whitespace", `${pdfOf(9).toString("base64") }\n`],
    ["empty input", ""],
  ])("refuses %s", (_description, base64) => {
    expect(boardPrintRequestSchema.safeParse(requestWithPdf(base64)).success).toBe(false);
  });

  it("retains the decoded size limit and PDF header checks", () => {
    expect(decodeBoardPrintPdf(pdfOf(BOARD_PRINT_PDF_MAX_BYTES + 1).toString("base64"))).toBeNull();
    expect(boardPrintRequestSchema.safeParse(requestWithPdf(pdfOf(BOARD_PRINT_PDF_MAX_BYTES + 2).toString("base64"))).success).toBe(false);
    expect(decodeBoardPrintPdf(Buffer.from("not a PDF").toString("base64"))).toBeNull();
    expect(decodeBoardPrintPdf("")).toBeNull();
  });
});
