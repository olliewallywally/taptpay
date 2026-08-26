import {
  createRetailTransaction,
  PaymentCredentialCollisionError,
} from "../retail-transaction-service";

const base = {
  merchantId: 7,
  taptStoneId: null,
  itemName: "Coffee",
  price: "5.00",
  status: "pending" as const,
  paymentMethod: "qr_code" as const,
  splitEnabled: false,
};

const stored = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  ...base,
  paymentTokenHash: null,
  windcaveTransactionId: null,
  nfcSessionId: null,
  deviceId: null,
  isSplit: false,
  totalSplits: 1,
  completedSplits: 0,
  splitAmount: null,
  windcaveFeeRate: "0.0290",
  windcaveFeeAmount: null,
  platformFeeRate: "0.0050",
  platformFeeAmount: null,
  merchantNet: "5.00",
  totalRefunded: "0.00",
  refundableAmount: "5.00",
  windcaveSessionId: null,
  windcaveSessionState: null,
  windcaveXId: null,
  createdAt: new Date(),
  ...extra,
}) as any;

describe("createRetailTransaction", () => {
  test("legacy mode never generates or persists a credential", async () => {
    const writer = { createTransaction: jest.fn(async (_input: any) => stored()) };
    const credentialFactory = jest.fn();
    await expect(
      createRetailTransaction(writer, base, "legacy", { credentialFactory }),
    ).resolves.toEqual({ transaction: expect.objectContaining({ id: 1 }) });
    expect(credentialFactory).not.toHaveBeenCalled();
    expect(writer.createTransaction.mock.calls[0][0]).not.toHaveProperty("paymentTokenHash");
  });

  test("per-payment mode stores only the digest and returns raw token once", async () => {
    const credential = { rawToken: "r".repeat(43), hash: "a".repeat(64) };
    const writer = {
      createTransaction: jest.fn(async (input) =>
        stored({ paymentTokenHash: input.paymentTokenHash })),
    };
    const result = await createRetailTransaction(writer, base, "per_payment", {
      credentialFactory: () => credential,
    });
    expect(result.rawToken).toBe(credential.rawToken);
    expect(writer.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ paymentTokenHash: credential.hash }),
    );
    expect(writer.createTransaction.mock.calls[0][0]).not.toHaveProperty("rawToken");
  });

  test("re-mints after a token-index collision and bounds retries", async () => {
    const collision = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "transactions_payment_token_hash_uq",
    });
    const credentials = [
      { rawToken: "a".repeat(43), hash: "1".repeat(64) },
      { rawToken: "b".repeat(43), hash: "2".repeat(64) },
    ];
    const writer = {
      createTransaction: jest
        .fn()
        .mockRejectedValueOnce(collision)
        .mockResolvedValueOnce(stored({ paymentTokenHash: credentials[1].hash })),
    };
    const result = await createRetailTransaction(writer, base, "per_payment", {
      credentialFactory: () => credentials.shift()!,
      maxCredentialAttempts: 2,
    });
    expect(result.rawToken).toBe("b".repeat(43));
    expect(writer.createTransaction).toHaveBeenCalledTimes(2);

    await expect(
      createRetailTransaction(
        { createTransaction: jest.fn(async () => { throw collision; }) },
        base,
        "per_payment",
        {
          credentialFactory: () => ({ rawToken: "c".repeat(43), hash: "3".repeat(64) }),
          maxCredentialAttempts: 1,
        },
      ),
    ).rejects.toBeInstanceOf(PaymentCredentialCollisionError);
  });

  test("does not retry unrelated inserts and rejects board/token combinations", async () => {
    const failure = new Error("database unavailable");
    await expect(
      createRetailTransaction(
        { createTransaction: jest.fn(async () => { throw failure; }) },
        base,
        "per_payment",
      ),
    ).rejects.toBe(failure);
    await expect(
      createRetailTransaction(
        { createTransaction: jest.fn() },
        { ...base, taptStoneId: 3 },
        "per_payment",
      ),
    ).rejects.toThrow("cannot use a payment board");
  });
});
