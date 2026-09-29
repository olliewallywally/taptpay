import "./support/test-env";

import request from "supertest";
import { config } from "../config";
import { createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * The WhatsApp delivery-status webhook with no EVOLUTION_API_KEY configured
 * (the harness clears every provider credential): it must not believe anyone
 * (route review, batch 1 — it used to accept every caller's statuses).
 */
const DELIVERED = { event: "messages.update", data: { key: { id: "wa-message-1" }, update: { status: "READ" } } };

describe("the WhatsApp delivery webhook, with no key configured", () => {
  beforeEach(() => {
    resetTestStorage();
    jest.spyOn(storage, "getInvoiceRentRequestByWhatsappMessageId").mockResolvedValue(undefined);
    jest.spyOn(storage, "getJobInvoiceByWhatsappMessageId").mockResolvedValue({
      id: "job-invoice-1",
      merchantId: 7,
      clientProfileId: "client-1",
      whatsappDeliveredAt: null,
    } as any);
    jest.spyOn(storage, "updateJobInvoice").mockResolvedValue({} as any);
    jest.spyOn(storage, "createJobEvent").mockResolvedValue({} as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it("has no key, as the harness intends", () => {
    expect(config.whatsapp.apiKey).toBeUndefined();
  });

  it.each([
    ["no key", {}],
    ["any key", { apikey: "anything-at-all" }],
  ])("ignores a status sent with %s, and still answers 200", async (_label, headers) => {
    const { app } = await createTestApp();
    const response = await request(app).post("/api/webhooks/whatsapp").set(headers as Record<string, string>).send(DELIVERED);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(response.status).toBe(200);
    expect(storage.getJobInvoiceByWhatsappMessageId).not.toHaveBeenCalled();
    expect(storage.updateJobInvoice).not.toHaveBeenCalled();
    expect(storage.createJobEvent).not.toHaveBeenCalled();
  });
});
