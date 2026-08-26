import { apiV1CreateTransactionSchema } from "../api-v1-contracts";

describe("API-v1 transaction contract", () => {
  const valid = {
    amount: "10.50",
    currency: "NZD" as const,
    item_name: "Coffee",
    customer_email: "customer@example.test",
    return_url: "https://shop.example.test/success",
    webhook_url: "https://shop.example.test/webhooks/tapt",
  };

  test("accepts the documented snake_case body and defaults NZD", () => {
    expect(apiV1CreateTransactionSchema.parse(valid)).toEqual(valid);
    expect(apiV1CreateTransactionSchema.parse({
      amount: "1.00",
      item_name: "Item",
    }).currency).toBe("NZD");
  });

  test.each([
    { ...valid, amount: "0.00" },
    { ...valid, amount: "1.001" },
    { ...valid, currency: "USD" },
    { ...valid, item_name: "" },
    { ...valid, paymentTokenHash: "a".repeat(64) },
    { ...valid, transaction_id: 12 },
    { ...valid, tapt_stone_id: 4 },
  ])("rejects invalid or storage-owned input %#", (body) => {
    expect(apiV1CreateTransactionSchema.safeParse(body).success).toBe(false);
  });
});
