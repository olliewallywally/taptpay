import { cancelRefusalMessage } from "../cancel-refusal";

describe("cancelRefusalMessage (OI-1)", () => {
  it("shows the server's reason when money was taken or a payment just completed", () => {
    expect(cancelRefusalMessage(new Error('409: {"code":"PAYMENT_CAPTURED","message":"A payment has already been taken on this sale. Refund it instead of cancelling."}')))
      .toBe("A payment has already been taken on this sale. Refund it instead of cancelling.");
    expect(cancelRefusalMessage(new Error('409: {"code":"PAYMENT_COMPLETED","message":"This sale has just been paid"}')))
      .toBe("This sale has just been paid");
  });
  it("explains R3's money-taken refusal, whose server message also covers invoices (R3 integration)", () => {
    expect(cancelRefusalMessage(new Error('409: {"code":"PAYMENT_ACTIVE","message":"Payment is in progress or a share is already paid"}')))
      .toBe("A payment has already been taken on this sale. Refund it instead of cancelling.");
  });
  it("leaves every other failure to the generic message", () => {
    for (const error of [new Error('409: {"message":"other"}'), new Error("500: {}"), new Error("409: not json"), "409: x", null])
      expect(cancelRefusalMessage(error)).toBeNull();
  });
});
