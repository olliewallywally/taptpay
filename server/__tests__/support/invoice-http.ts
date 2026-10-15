import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {createTestApp,resetTestStorage,storage} from './http-harness';
import {syntheticInvoiceRuntime} from './invoice-runtime';

/** Registered-controller fixture. SQL financial/event/delivery assertions live
 * in verify-r3-http-postgres.ts and verify-r3-delivery-postgres.ts. */
export async function invoiceHttpFixture(vertical:'property'|'trades',over:Record<string,unknown>={}){
  const invoice:any={id:randomUUID(),merchantId:7,token:randomUUID(),checkoutVertical:vertical,status:'sent',amountCents:100001,
    splitCount:null,splitPaidCount:0,splitPaidSessions:[],...over};
  const invoices=[invoice];
  jest.spyOn(storage,'getInvoiceRentRequestByToken').mockImplementation(async token=>invoices.find(i=>i.checkoutVertical==='property'&&i.token===token));
  jest.spyOn(storage,'getJobInvoiceByToken').mockImplementation(async token=>invoices.find(i=>i.checkoutVertical==='trades'&&i.token===token));
  jest.spyOn(storage,'getTenantProfile').mockResolvedValue({email:'tenant@synthetic.test'} as any);
  jest.spyOn(storage,'getClientProfile').mockResolvedValue({email:'client@synthetic.test'} as any);
  const apply=jest.fn(async(binding:any,evidence:any)=>{
    const row=invoices.find(i=>i.id===(binding.rentInvoiceId??binding.jobInvoiceId));
    if(evidence.outcome!=='approved')return;
    row.splitPaidSessions.push(binding.sessionId);
    if(row.splitCount){row.splitPaidCount++;if(row.splitPaidCount===row.splitCount)row.status='paid';}else row.status='paid';
    row.windcaveTransactionId=evidence.transactionId;
  });
  const port=syntheticInvoiceRuntime(async input=>invoices.find(i=>i.id===input.invoiceId&&i.merchantId===input.merchantId),apply);
  const {app}=await createTestApp({paymentRuntime:port.runtime});
  const intent=(shareIndex=0,payerEmail?:string)=>({shareIndex,idempotencyKey:randomUUID(),...(payerEmail?{payerEmail}:{})});
  const open=async(body=intent(),token=invoice.token)=>{const res=await request(app).post(`/api/checkout/${token}/session`).send(body);expect(res.status).toBe(200);return {...body,sessionId:res.body.sessionId,returnState:res.body.returnState};};
  const complete=(command:any,route='hosted-fields-complete',token=invoice.token)=>request(app).post(`/api/checkout/${token}/${route}`).send({idempotencyKey:command.idempotencyKey,shareIndex:command.shareIndex,sessionId:command.sessionId});
  return {app,invoice,invoices,port,apply,intent,open,complete};
}
