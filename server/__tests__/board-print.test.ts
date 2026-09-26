import "./support/test-env";

import request from "supertest";
import {
  bearer, createAdminPrincipal, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 2):
 * the board builder's Send to Print works for signed-in businesses only. The business and the
 * board come from the sign-in, the route alone takes a larger body (read only once the sign-in
 * is checked), and a business can send a few boards an hour.
 *
 * Before: the route was public with no limit and emailed the print inbox whatever it was sent,
 * under any business's name, while the page's own 9.5 MB request always met the 100 KB JSON
 * limit (413), so Send to Print had never worked.
 */
jest.mock("../email-service-multi", () => ({
  ...jest.requireActual("../email-service-multi"),
  sendBoardBuilderEmail: jest.fn(async () => true),
}));
import * as emailService from "../email-service-multi";

const sendMock = emailService.sendBoardBuilderEmail as unknown as jest.Mock;
const SUBMIT = "/api/board-builder/submit";

/** A PDF's first bytes, then filler: the size of a real board's PDF, or any size asked for. */
function pdfOf(bytes: number): Buffer {
  const pdf = Buffer.alloc(bytes, 0x41);
  Buffer.from("%PDF-1.3\n").copy(pdf);
  return pdf;
}

beforeEach(() => {
  resetTestStorage();
  sendMock.mockReset();
  sendMock.mockResolvedValue(true);
});

async function businessWithBoard(overrides: { businessName?: string } = {}) {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal({ businessName: overrides.businessName ?? "Kōwhai Café" });
  const board = await request(app).post(`/api/merchants/${owner.merchantId}/tapt-stones`).set(bearer(owner)).send({});
  expect(board.status).toBe(200);
  return { app, owner, boardId: board.body.id as number, boardName: board.body.name as string };
}

function send(app: Parameters<typeof request>[0], body: Record<string, unknown>, auth?: { token: string }) {
  const pending = request(app).post(SUBMIT);
  return (auth ? pending.set(bearer(auth)) : pending).send(body);
}

const boardSend = (boardId: number, pdf = pdfOf(1_500_000)) => ({
  pdf: pdf.toString("base64"),
  stoneId: boardId,
  layout: "A5 Portrait",
  submitterName: "Jamie",
  submitterEmail: "jamie@harness.test",
});

describe("Send to Print, for signed-in businesses only", () => {
  it("refuses anyone not signed in, and sends nothing", async () => {
    const { app, boardId } = await businessWithBoard();

    const res = await send(app, { ...boardSend(boardId, pdfOf(2_000)), businessName: "Someone Else Ltd" });

    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends a real board's PDF with the business and board from the sign-in", async () => {
    const { app, owner, boardId, boardName } = await businessWithBoard();
    const pdf = pdfOf(1_500_000);

    const res = await send(app, boardSend(boardId, pdf), owner);

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0];
    expect(sent).toMatchObject({
      businessName: "Kōwhai Café",
      layout: "A5 Portrait",
      submitterName: "Jamie",
      submitterEmail: "jamie@harness.test",
    });
    expect(sent.board).toContain(boardName);
    expect(Buffer.isBuffer(sent.pdf) && sent.pdf.equals(pdf)).toBe(true);

    // The sender cannot name the business: a body that tries is refused, and nothing is sent.
    const naming = await send(app, { ...boardSend(boardId, pdfOf(2_000)), businessName: "Not This Name Ltd" }, owner);
    expect(naming.status).toBe(400);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("lets a teammate send their business's board too", async () => {
    const { app, owner, boardId } = await businessWithBoard();
    const member = await createMemberPrincipal(owner.merchantId);

    expect((await send(app, boardSend(boardId, pdfOf(2_000)), member)).status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("refuses another business's board, as if it did not exist", async () => {
    const { app, boardId } = await businessWithBoard();
    const other = await createOwnerPrincipal();

    const theirs = await send(app, boardSend(boardId, pdfOf(2_000)), other);
    const missing = await send(app, boardSend(boardId + 1000, pdfOf(2_000)), other);

    for (const res of [theirs, missing]) {
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Payment board not found");
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses the platform admin, who has no business to send for", async () => {
    const { app, boardId } = await businessWithBoard();

    const res = await send(app, boardSend(boardId, pdfOf(2_000)), createAdminPrincipal());

    expect(res.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a PDF, one over 2 MB, and a body over the route's limit", async () => {
    const { app, owner, boardId } = await businessWithBoard();

    const notPdf = await send(app, { ...boardSend(boardId), pdf: Buffer.alloc(2_000, 0x41).toString("base64") }, owner);
    const overTwo = await send(app, boardSend(boardId, pdfOf(2 * 1024 * 1024 + 1)), owner);
    const overLimit = await send(app, boardSend(boardId, pdfOf(3 * 1024 * 1024)), owner);
    const extraField = await send(app, { ...boardSend(boardId, pdfOf(2_000)), merchantId: 1 }, owner);
    const oddLayout = await send(app, { ...boardSend(boardId, pdfOf(2_000)), layout: "A3 Poster" }, owner);

    expect(notPdf.status).toBe(400);
    expect(overTwo.status).toBe(400);
    expect(overLimit.status).toBe(413);
    expect(extraField.status).toBe(400);
    expect(oddLayout.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("lets a business send three boards, then asks it to wait", async () => {
    const { app, owner, boardId } = await businessWithBoard();

    for (let i = 0; i < 3; i += 1) expect((await send(app, boardSend(boardId, pdfOf(2_000)), owner)).status).toBe(200);
    const fourth = await send(app, boardSend(boardId, pdfOf(2_000)), owner);

    expect(fourth.status).toBe(429);
    expect(fourth.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(Number(fourth.headers["retry-after"])).toBeGreaterThan(0);
    expect(sendMock).toHaveBeenCalledTimes(3);

    // Another business is counted on its own.
    const other = await businessWithBoard({ businessName: "Other Ltd" });
    expect((await send(app, boardSend(other.boardId, pdfOf(2_000)), other.owner)).status).toBe(200);
  });

  it("gives the count back when the email could not be sent", async () => {
    const { app, owner, boardId } = await businessWithBoard();
    sendMock.mockResolvedValueOnce(false);

    const failed = await send(app, boardSend(boardId, pdfOf(2_000)), owner);
    expect(failed.status).toBe(502);

    for (let i = 0; i < 3; i += 1) expect((await send(app, boardSend(boardId, pdfOf(2_000)), owner)).status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(4);
  });
});

describe("the board's email", () => {
  it("carries the PDF as sent, and nothing the sender typed goes into it as HTML or a header", async () => {
    const { boardPrintEmail } = await import("../board-print");
    const email = boardPrintEmail({
      pdf: pdfOf(2_000),
      businessName: "Kōwhai <Café>\r\nBcc: x@y.z",
      board: "Counter (board 1)",
      layout: "A5 Portrait",
      submitterName: "<b>Jamie</b>",
      submitterEmail: "jamie@harness.test",
    });
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.html).not.toContain("<b>Jamie</b>");
    expect(email.html).not.toContain("<Café>");
    expect(email.filename).toMatch(/^payment-board-[a-z0-9-]+-\d+\.pdf$/);
    expect(email.attachment.equals(pdfOf(2_000))).toBe(true);
  });
});
