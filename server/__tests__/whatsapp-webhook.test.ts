import "./support/test-env";
import { HARNESS_EVOLUTION_KEY } from "./support/whatsapp-test-env";

import request from "supertest";
import { createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * The WhatsApp (Evolution API) delivery-status webhook, with its shared key
 * configured: only a caller presenting that key changes anything (route
 * review, batch 1).
 */
const DELIVERED = { event: "messages.update", data: { key: { id: "wa-message-1" }, update: { status: "READ" } } };
const TRADES_INVOICE = {
  id: "job-invoice-1",
  merchantId: 7,
  clientProfileId: "client-1",
  whatsappDeliveredAt: null,
};

/** The webhook answers first and works after; let it finish. */
const afterTheHandlerFinishes = () => new Promise((resolve) => setTimeout(resolve, 25));

describe("the WhatsApp delivery webhook, with its key configured", () => {
  beforeEach(() => {
    resetTestStorage();
    jest.spyOn(storage, "getInvoiceRentRequestByWhatsappMessageId").mockResolvedValue(undefined);
    jest.spyOn(storage, "getJobInvoiceByWhatsappMessageId").mockResolvedValue(TRADES_INVOICE as any);
    jest.spyOn(storage, "updateJobInvoice").mockResolvedValue(TRADES_INVOICE as any);
    jest.spyOn(storage, "createJobEvent").mockResolvedValue({} as any);
  });
  afterEach(() => jest.restoreAllMocks());

  async function deliver(headers: Record<string, string>) {
    const { app } = await createTestApp();
    const response = await request(app).post("/api/webhooks/whatsapp").set(headers).send(DELIVERED);
    await afterTheHandlerFinishes();
    return response;
  }

  it("records a status sent with the key", async () => {
    const response = await deliver({ apikey: HARNESS_EVOLUTION_KEY! });
    expect(response.status).toBe(200);
    expect(storage.updateJobInvoice).toHaveBeenCalledWith("job-invoice-1", { whatsappDeliveredAt: expect.any(Date) });
    expect(storage.createJobEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no key", {}],
    ["a wrong key of the same length", { apikey: "x".repeat(HARNESS_EVOLUTION_KEY!.length) }],
    ["a wrong key of another length", { apikey: "short" }],
  ])("ignores a status sent with %s, and still answers 200", async (_label, headers) => {
    const response = await deliver(headers as Record<string, string>);
    expect(response.status).toBe(200);
    expect(storage.getJobInvoiceByWhatsappMessageId).not.toHaveBeenCalled();
    expect(storage.updateJobInvoice).not.toHaveBeenCalled();
    expect(storage.createJobEvent).not.toHaveBeenCalled();
  });
});
