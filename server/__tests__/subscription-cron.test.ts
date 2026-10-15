const storageMock = {
  expireCancelledSubscriptions: jest.fn(),
  claimSubscriptionsDueForBilling: jest.fn(),
  releaseSubscriptionBillingClaim: jest.fn(),
  finalizeSubscriptionBillingClaim: jest.fn(),
  getMerchant: jest.fn(),
};

jest.mock("../storage",()=>({storage:storageMock,addOneMonth:(value:Date)=>new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate()))}));
jest.mock("../subscription-payment-runtime",()=>({getSubscriptionPaymentRuntime:()=>undefined}));
import {runSubscriptionBillingPass} from "../subscription-cron";
const billing={canInitiate:jest.fn(()=>true),charge:jest.fn(),recordMissingPaymentMethod:jest.fn()};
const now=new Date("2026-09-04T09:00:00Z");
const subscription=(overrides:Record<string,unknown>={})=>({id:41,merchantId:22,planId:"solo",priceCents:799,status:"past_due",
  currentPeriodStart:null,currentPeriodEnd:null,nextBillingDate:new Date("2026-09-01T08:15:00Z"),lastBillingDate:null,
  pendingPlanId:null,cancelAtPeriodEnd:false,windcaveCardId:"synthetic-card",failedPaymentCount:1,billingClaimToken:"claim-token",...overrides} as any);
describe("subscription cron delegates to one durable engine",()=>{
  beforeEach(()=>{jest.clearAllMocks();billing.canInitiate.mockReturnValue(true);storageMock.expireCancelledSubscriptions.mockResolvedValue(0);
    storageMock.releaseSubscriptionBillingClaim.mockResolvedValue(undefined);billing.charge.mockResolvedValue({kind:"processing"});
    billing.recordMissingPaymentMethod.mockResolvedValue({kind:"declined",applied:true});});
  const run=(date=now)=>runSubscriptionBillingPass(date,{storage:storageMock,billing:billing as any});
  test("retry delegates the original period identity and never runs another local finalizer",async()=>{
    storageMock.claimSubscriptionsDueForBilling.mockResolvedValue([subscription()]);
    expect((await run()).errors).toBe(1);await run(new Date("2026-09-05T09:00:00Z"));
    expect(billing.charge).toHaveBeenCalledTimes(2);
    expect(billing.charge.mock.calls.map(([intent])=>intent.idempotencyKey)).toEqual(["sub-41-2026-09-01-a2","sub-41-2026-09-01-a2"]);
    expect(storageMock.finalizeSubscriptionBillingClaim).not.toHaveBeenCalled();
    expect(storageMock.releaseSubscriptionBillingClaim).toHaveBeenCalledTimes(2);
  });
  test.each([{windcaveCardId:null},{cardExpiry:"08/26"}])("unusable card delegates audited policy failure %p",async(overrides)=>{
    storageMock.claimSubscriptionsDueForBilling.mockResolvedValue([subscription({...overrides,status:"active",failedPaymentCount:0})]);
    expect(await run()).toMatchObject({failed:1,charged:0,errors:0});expect(billing.charge).not.toHaveBeenCalled();
    expect(billing.recordMissingPaymentMethod).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:"sub-41-2026-09-01-a1",merchantId:22,subscriptionId:41}));
    expect(storageMock.finalizeSubscriptionBillingClaim).not.toHaveBeenCalled();
  });
  test("disabled initiation does not claim due rows but still expires cancellations",async()=>{
    billing.canInitiate.mockReturnValue(false);await run();expect(storageMock.expireCancelledSubscriptions).toHaveBeenCalled();
    expect(storageMock.claimSubscriptionsDueForBilling).not.toHaveBeenCalled();expect(billing.charge).not.toHaveBeenCalled();
  });
  test("an engine failure releases the scheduling claim and reports an error",async()=>{
    storageMock.claimSubscriptionsDueForBilling.mockResolvedValue([subscription()]);billing.charge.mockRejectedValue(new Error("synthetic"));
    const error=jest.spyOn(console,"error").mockImplementation(()=>{});try{expect((await run()).errors).toBe(1);
    expect(storageMock.releaseSubscriptionBillingClaim).toHaveBeenCalledWith(41,"claim-token");}finally{error.mockRestore();}
  });
  test("a replay of an applied result does not report another charge",async()=>{
    storageMock.claimSubscriptionsDueForBilling.mockResolvedValue([subscription()]);billing.charge.mockResolvedValue({kind:"approved",applied:true,reused:true});
    expect(await run()).toMatchObject({charged:0,skipped:1});
  });
});
