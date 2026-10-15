import { randomUUID } from "node:crypto";
import { PaymentOutboxWorker } from "../payment-outbox";

/**
 * R3 integration D4 (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md): a delivery that
 * dead-letters raises one sanitized signal after the dead-letter commits, and none otherwise.
 */
const now = new Date("2026-10-15T10:00:00Z");
const claim = (attemptCount: number) => ({ id: randomUUID(), eventId: randomUUID(), channel: "payer_receipt" as const,
  owner: randomUUID(), attemptCount, leaseExpiresAt: new Date(now.getTime() + 60000), eventSource: "provider_settlement" as const });

test.each([
  ["the attempt cap", 21, async () => undefined],
  ["the last failed delivery", 20, async () => { throw new Error("synthetic delivery failure SECRET-VALUE"); }],
])("dead-lettering at %s raises PAYMENT_DELIVERY_DEAD_LETTER once, with no value", async (_name, attempts, deliver) => {
  const finishOutbox = jest.fn(async () => true), audit = jest.fn();
  await new PaymentOutboxWorker({ claimOutbox: async () => claim(attempts), finishOutbox }, { deliver }, () => now, audit).runOne(randomUUID());
  expect(finishOutbox).toHaveBeenCalledWith(expect.anything(), "dead_letter", now, ...(attempts === 20 ? [expect.any(Date)] : []));
  expect(audit).toHaveBeenCalledTimes(1);
  expect(audit).toHaveBeenCalledWith("PAYMENT_DELIVERY_DEAD_LETTER", { channel: "payer_receipt" });
  expect(JSON.stringify(audit.mock.calls)).not.toContain("SECRET-VALUE");
});

test("a dead-letter that did not commit, a retry and a delivery raise nothing", async () => {
  const audit = jest.fn();
  await new PaymentOutboxWorker({ claimOutbox: async () => claim(21), finishOutbox: async () => false }, { deliver: async () => undefined }, () => now, audit).runOne(randomUUID());
  await new PaymentOutboxWorker({ claimOutbox: async () => claim(3), finishOutbox: async () => true }, { deliver: async () => { throw new Error("x"); } }, () => now, audit).runOne(randomUUID());
  await new PaymentOutboxWorker({ claimOutbox: async () => claim(1), finishOutbox: async () => true }, { deliver: async () => undefined }, () => now, audit).runOne(randomUUID());
  expect(audit).not.toHaveBeenCalled();
});
