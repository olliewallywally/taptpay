import "./support/test-env";
import {DatabaseStorage} from "../storage";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/storage.ts"),
  "utf8",
);
const databaseStorage = source.slice(source.indexOf("export class DatabaseStorage"));

function method(name: string, nextName: string): string {
  const start = databaseStorage.indexOf(`async ${name}`);
  const end = databaseStorage.indexOf(`async ${nextName}`, start + 1);
  if (start < 0 || end < 0) throw new Error(`Could not isolate ${name}`);
  return databaseStorage.slice(start, end);
}

describe("subscription provider-call storage safety", () => {
  test("plan upgrade charges after the prepare transaction commits", () => {
    const body = method("changeSubscriptionPlan", "saveSubscriptionCard");
    const prepare = body.indexOf("const prepared = await this.db.transaction");
    const preparedResult = body.indexOf('if (prepared.kind === "done")');
    const provider = body.indexOf("charge = await chargeUpgrade!");


    expect(prepare).toBeGreaterThan(-1);
    expect(preparedResult).toBeGreaterThan(prepare);
    expect(provider).toBeGreaterThan(preparedResult);
    expect(body).not.toContain(".insert(subscriptionBillingHistory)");
    expect(body.slice(prepare, provider)).toContain("billingClaimToken: claimToken");
  });

  test("the retired mutable-session DB port cannot charge or finalize a card",async()=>{
    const transaction=jest.fn(),charge=jest.fn();const repository=new DatabaseStorage({transaction} as any);
    const result=await repository.completeSubscriptionCardSetup(7,'opaque-session',{windcaveCardId:'opaque-card',brand:'Visa',last4:'1234',expiry:'12/40'},charge);
    expect(result).toMatchObject({ok:false,reason:'invalid-state'});expect(charge).not.toHaveBeenCalled();expect(transaction).not.toHaveBeenCalled();
  });

  test("owner password dual-write commits in one database transaction", () => {
    const body = method("updateUserPassword", "setUserResetToken");
    expect(body).toContain("this.db.transaction(async (tx)");
    expect(body).toContain("await tx\n        .update(users)");
    expect(body).toContain("await tx\n          .update(merchants)");
    expect(body).not.toContain("await this.db\n        .update(merchants)");
  });

  test("daily payout summaries use paid records instead of retired platform fees", () => {
    const body = method("getDailyPushPaymentSummaries", "claimPushNotificationDelivery");
    expect(body).toContain("transactions.completedAt");
    expect(body).toContain("splitPayments.paidAt");
    expect(body).toContain("invoicesRentRequests.paidAt");
    expect(body).toContain("jobInvoices.paidAt");
    expect(body).not.toContain("platformFees");
  });
});
