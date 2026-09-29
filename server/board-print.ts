import { z } from "zod";

/**
 * The board builder's Send to Print (POST /api/board-builder/submit). Owner decision
 * 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 2): signed-in
 * businesses only; the business and board come from the sign-in; a larger body limit on this
 * route alone; a few sends an hour; a smaller PDF.
 *
 * The page's PDF was 7.1 MB (a PNG at twice the board's size), sent as 9.5 MB of JSON, so the
 * JSON parser's 100 KB limit refused every send. The page now sends a JPEG-based PDF, well
 * under BOARD_PRINT_PDF_MAX_BYTES.
 */

/** The largest PDF accepted, once decoded. */
export const BOARD_PRINT_PDF_MAX_BYTES = 2 * 1024 * 1024;
/** The same PDF as base64, as the page sends it. */
const BOARD_PRINT_PDF_MAX_BASE64 = Math.ceil(BOARD_PRINT_PDF_MAX_BYTES / 3) * 4;
/**
 * The route's JSON limit: a largest PDF in base64 plus the other fields. Read only after the
 * sign-in is checked (the pipeline's parser leaves this route's body alone, server/app.ts).
 */
export const BOARD_PRINT_JSON_LIMIT = "3mb";
export const BOARD_PRINT_PATH = "/api/board-builder/submit";

export const BOARD_PRINT_LAYOUTS = ["A5 Portrait", "A5 Landscape"] as const;

export const boardPrintRequestSchema = z
  .object({
    pdf: z
      .string()
      .min(1, "The board's PDF is missing")
      .max(BOARD_PRINT_PDF_MAX_BASE64, "The board's PDF must be at most 2 MB")
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "The board's PDF must be base64"),
    stoneId: z.number().int().positive(),
    layout: z.enum(BOARD_PRINT_LAYOUTS),
    submitterName: z.string().trim().min(1, "Enter your name").max(100),
    submitterEmail: z.string().trim().email("Enter a valid email address").max(254),
  })
  .strict();

export type BoardPrintRequest = z.infer<typeof boardPrintRequestSchema>;

/** The PDF's bytes, or null when they are not a PDF of at most BOARD_PRINT_PDF_MAX_BYTES. */
export function decodeBoardPrintPdf(base64: string): Buffer | null {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > BOARD_PRINT_PDF_MAX_BYTES) return null;
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-" ? bytes : null;
}

export interface BoardPrintOrder {
  pdf: Buffer;
  /** The signed-in business's name, from its record. */
  businessName: string;
  /** The board, from its record: its name and number. */
  board: string;
  layout: string;
  submitterName: string;
  submitterEmail: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line of header text: no line breaks, whatever a business or sender typed. */
function headerText(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

/** The print request's email: its subject, bodies and attachment. */
export function boardPrintEmail(order: BoardPrintOrder) {
  const slug = order.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "business";
  const rows: Array<[string, string]> = [
    ["Business", order.businessName],
    ["Submitted by", `${order.submitterName} <${order.submitterEmail}>`],
    ["Layout", order.layout],
    ["Board", order.board],
  ];
  return {
    subject: headerText(`New Payment Board — ${order.businessName} (${order.layout})`),
    html: `
    <h2>Payment Board Print Request</h2>
    <table style="border-collapse:collapse;width:100%;max-width:480px;">
      ${rows
        .map(([label, value]) => `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">${label}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`)
        .join("\n      ")}
    </table>
    <p style="margin-top:16px;color:#374151;">The payment board PDF is attached to this email.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#9ca3af;font-size:12px;">Sent via TaptPay Board Builder</p>
  `,
    text: `Payment Board Print Request from ${order.businessName} (${order.board}, ${order.layout}), submitted by ${order.submitterName} <${order.submitterEmail}>.`,
    filename: `payment-board-${slug}-${Date.now()}.pdf`,
    attachment: order.pdf,
  };
}
