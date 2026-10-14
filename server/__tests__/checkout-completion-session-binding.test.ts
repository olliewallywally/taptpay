import './support/durable-payments-env';
import {randomUUID} from 'node:crypto';import request from 'supertest';
import {createApp} from '../app';import {createInvoiceCheckoutHandlers} from '../invoice-checkout-handlers';
import {syntheticInvoiceRuntime} from './support/invoice-runtime';
async function fixture(vertical:'property'|'trades'){
  const invoice={id:randomUUID(),merchantId:7,checkoutVertical:vertical,status:'sent',amountCents:1001,splitCount:null},token='synthetic-bearer',apply=jest.fn(async()=>{invoice.status='paid';});
  const port=syntheticInvoiceRuntime(async input=>input.invoiceId===invoice.id&&input.merchantId===invoice.merchantId?invoice:undefined,apply),app=createApp({writeRequestLog:()=>{}});
  const h=createInvoiceCheckoutHandlers({runtime:port.runtime,getCheckoutInvoiceByToken:async value=>value===token?invoice:undefined,customerEmail:async()=> 'payer@synthetic.test',baseUrl:()=> 'https://harness.test',checkRateLimit:()=>true});
  app.post('/api/checkout/:token/session',h.session);app.post('/api/checkout/:token/hosted-fields-complete',h.complete());app.post('/api/checkout/:token/googlepay-complete',h.complete(true));
  return {invoice,token,port,app,apply,intent:{idempotencyKey:randomUUID(),shareIndex:0}};
}
describe.each(['property','trades'] as const)('%s concrete invoice session binding',vertical=>{
  test.each(['hosted-fields-complete','googlepay-complete'])('%s refuses an unprepared session before provider I/O',async method=>{
    const f=await fixture(vertical),res=await request(f.app).post(`/api/checkout/${f.token}/${method}`).send({...f.intent,sessionId:'foreign-session'});
    expect(res.status).toBe(404);expect(f.port.client.querySession).not.toHaveBeenCalled();expect(f.apply).not.toHaveBeenCalled();expect(f.invoice.status).toBe('sent');
  });
  test.each(['hosted-fields-complete','googlepay-complete'])('%s serves only its exact prepared session and UUID',async method=>{
    const f=await fixture(vertical),opened=await request(f.app).post(`/api/checkout/${f.token}/session`).send(f.intent);expect(opened.status).toBe(200);
    f.port.setObservation('approved');const queries=f.port.client.querySession.mock.calls.length;
    expect((await request(f.app).post(`/api/checkout/${f.token}/${method}`).send({...f.intent,sessionId:'another-session'})).status).toBe(404);
    expect((await request(f.app).post(`/api/checkout/${f.token}/${method}`).send({...f.intent,idempotencyKey:randomUUID(),sessionId:opened.body.sessionId})).status).toBe(404);
    expect(f.port.client.querySession.mock.calls.length).toBe(queries);
    const body={...f.intent,sessionId:opened.body.sessionId};expect((await request(f.app).post(`/api/checkout/${f.token}/${method}`).send(body)).body.approved).toBe(true);
    expect((await request(f.app).post(`/api/checkout/${f.token}/${method}`).send(body)).body.approved).toBe(true);expect(f.apply).toHaveBeenCalledTimes(1);expect(f.invoice.status).toBe('paid');
  });
  test('a missing command is malformed even with a session, and causes no side effects',async()=>{
    const f=await fixture(vertical);expect((await request(f.app).post(`/api/checkout/${f.token}/hosted-fields-complete`).send({sessionId:'foreign'})).status).toBe(400);expect(f.apply).not.toHaveBeenCalled();expect(f.port.client.querySession).not.toHaveBeenCalled();
  });
});
