import { randomUUID } from "node:crypto";
import { PaymentAttemptService } from "../payment-attempt-service";
import { MemStorage, type TransactionStorageInput } from "../storage";

/**
 * R3 integration (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md): the in-memory
 * attach answers as PostgreSQL's does, so service tests on MemStorage match production.
 */

const now = new Date("2026-10-14T10:00:00Z");

describe("MemStorage attach matches PostgreSQL", () => {
  let repo: MemStorage, service: PaymentAttemptService, clock: Date;
  beforeEach(() => { repo = new MemStorage(); clock = new Date(now); service = new PaymentAttemptService(repo, () => new Date(clock)); });
  async function recorded() {
    const sale = await repo.createTransaction({ merchantId: 11, itemName: "Synthetic", price: "10.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false } as TransactionStorageInput);
    const claimed = await service.claim({ transactionId: sale.id, shareIndex: 0, idempotencyKey: randomUUID() });
    if (claimed.kind !== "claimed") throw new Error("fixture_claim");
    await service.recordExpectedValues({ attemptId: claimed.attempt.id, amountCents: 1000, currency: "NZD", merchantReference: `TAPT_${claimed.attempt.id}`, providerEnvironment: "uat" });
    return claimed.attempt;
  }
  it("a pre-set X-ID refuses another", async () => {
    const attempt = await recorded();
    (repo as any).paymentAttempts.get(attempt.id).processorXId = "preset";
    await expect(service.attachSession({ attemptId: attempt.id, processorSessionId: "s-1", processorXId: "other" })).resolves.toMatchObject({ kind: "conflict" });
  });
  it("an attempt carrying send intent attaches after its lease", async () => {
    const attempt = await recorded();
    (repo as any).paymentAttempts.get(attempt.id).sendStartedAt = new Date(now);
    clock = new Date(now.getTime() + 300_001);
    await expect(service.attachSession({ attemptId: attempt.id, processorSessionId: "s-1", processorXId: "x-1" })).resolves.toMatchObject({ kind: "attached" });
  });
});
