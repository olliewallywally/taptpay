import './support/test-env';
import {randomUUID} from 'node:crypto';import request from 'supertest';
import {createOwnerPrincipal,createTestApp,resetTestStorage,storage} from './support/http-harness';
import {renderPaymentCommunication} from '../durable-payment-delivery';
import * as tradesDelivery from '../trades-delivery';
beforeEach(()=>resetTestStorage());afterEach(()=>jest.restoreAllMocks());
const REFUSAL={code:'QUOTE_ACCEPTANCE_UNAVAILABLE',message:"This quote can't be accepted online right now. Please contact the business to go ahead."};
async function fixture(){
 const owner=await createOwnerPrincipal(),quote={id:randomUUID(),merchantId:owner.merchantId,token:randomUUID(),status:'sent'};
 jest.spyOn(storage,'getQuoteByToken').mockResolvedValue(quote as any);
 const atomic=jest.spyOn(storage,'respondToQuoteForMerchant').mockResolvedValue({kind:'billing-required'});
 const legacy=jest.spyOn(storage,'updateQuote'),dispatch=jest.spyOn(tradesDelivery,'resendTradeInvoiceForMerchant');
 const {app}=await createTestApp();return {owner,quote,atomic,legacy,dispatch,respond:(accept=true)=>request(app).post(`/api/trades/quotes/token/${quote.token}/respond`).send({accept})};
}
test('refusal uses customer wording without disclosing subscription details or creating an invoice',async()=>{
 const f=await fixture(),res=await f.respond();expect(res.status).toBe(402);expect(res.body).toEqual(REFUSAL);expect(JSON.stringify(res.body)).not.toMatch(/subscription|billing/i);expect(f.legacy).not.toHaveBeenCalled();expect(f.dispatch).not.toHaveBeenCalled();
});
test('notice/throttle decision belongs to the scoped atomic command, not a direct route email',async()=>{
 const f=await fixture();await f.respond();expect(f.atomic).toHaveBeenCalledWith(f.quote.id,f.owner.merchantId,true,{allowAccept:false});expect(f.dispatch).not.toHaveBeenCalled();
});
test('repeated acceptance retains the same scoped response choice without re-dispatch',async()=>{
 const f=await fixture();for(let i=0;i<2;i++)expect((await f.respond()).body).toEqual(REFUSAL);expect(f.atomic).toHaveBeenCalledTimes(2);expect(f.dispatch).not.toHaveBeenCalled();
});
test('an unavailable outbound business contact cannot replace the customer refusal',async()=>{
 const f=await fixture();jest.spyOn(storage,'getMerchant').mockRejectedValue(Error('synthetic unavailable'));expect((await f.respond()).body).toEqual(REFUSAL);expect(f.dispatch).not.toHaveBeenCalled();
});
test.each([false,true])('an atomic %s response is projected without independent generic mutation',async accept=>{
 const f=await fixture();f.atomic.mockResolvedValue({kind:'ok',quote:{...f.quote,status:accept?'accepted':'declined'},invoice:null,reused:false} as any);
 expect((await f.respond(accept)).body.quote.status).toBe(accept?'accepted':'declined');expect(f.legacy).not.toHaveBeenCalled();expect(f.dispatch).not.toHaveBeenCalled();
});
test('the actual notice renderer escapes the customer name and retains quote amount and Billing action',()=>{
 const notice=renderPaymentCommunication({domain:'trades',eventId:randomUUID(),reference:'QUOTE-123',amountCents:115000,outcome:'quote_blocked',businessName:'Synthetic',createdAt:'2026-10-14',customerName:'<b>Jamie</b> Smith',billingUrl:'https://harness.test/settings?section=billing'});
 expect(notice.html).toContain('&lt;b&gt;Jamie&lt;/b&gt; Smith');expect(notice.html).not.toContain('<b>Jamie</b>');expect(notice.text).toContain('NZD 1150.00');expect(notice.text).toContain('settings?section=billing');
});
// Actual SQL rolling-24h/outbox and receiver retry tests are in the guarded
// commands/delivery PostgreSQL scripts, using real concrete event identities.
