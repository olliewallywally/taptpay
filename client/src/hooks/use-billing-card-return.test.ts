import { confirmBillingCardSession } from "./use-billing-card-return";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("hosted billing-card confirmation", () => {
  it("retries a pending Windcave session and then succeeds", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(response(202, { pending: true }))
      .mockResolvedValueOnce(response(202, { pending: true }))
      .mockResolvedValueOnce(response(200, { success: true }));
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(confirmBillingCardSession("session-42", { request, wait, delayMs: 1 }))
      .resolves.toEqual({ status: "saved" });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenNthCalledWith(1, "session-42");
    expect(wait).toHaveBeenNthCalledWith(1, 1);
    expect(wait).toHaveBeenNthCalledWith(2, 2);
  });

  it("returns pending without treating 202 as a decline", async () => {
    const request = jest.fn().mockResolvedValue(response(202, { pending: true }));
    const result = await confirmBillingCardSession("session-42", {
      request,
      attempts: 2,
      wait: async () => undefined,
    });

    expect(result).toEqual({ status: "pending" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("marks server failures retryable and card rejections terminal", async () => {
    await expect(confirmBillingCardSession("session-42", {
      request: async () => response(502, { message: "Provider unavailable" }),
    })).resolves.toEqual({ status: "failed", message: "Provider unavailable", retryable: true });

    await expect(confirmBillingCardSession("session-42", {
      request: async () => response(400, { message: "Card declined" }),
    })).resolves.toEqual({ status: "failed", message: "Card declined", retryable: false });
  });

  it("classifies errors thrown by the shared request helper", async () => {
    await expect(confirmBillingCardSession("session-42", {
      request: async () => { throw new Error('400: {"message":"That card was declined"}'); },
    })).resolves.toEqual({
      status: "failed",
      message: "That card was declined",
      retryable: false,
    });

    await expect(confirmBillingCardSession("session-42", {
      request: async () => { throw new Error('502: {"message":"Provider unavailable"}'); },
    })).resolves.toEqual({
      status: "failed",
      message: "Provider unavailable",
      retryable: true,
    });
  });
});
