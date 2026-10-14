import './support/durable-payments-env';
import {randomUUID} from 'node:crypto';import request from 'supertest';
import {invoiceHttpFixture} from './support/invoice-http';
import {resetTestStorage} from './support/http-harness';
import * as gst from '../gst-invoice';
beforeEach(()=>resetTestStorage());afterEach(()=>jest.restoreAllMocks());
describe.each(['property','trades'] as const)('%s concrete split invoice',vertical=>{
  test.each(['hosted-fields-complete','googlepay-complete'])('%s refuses foreign/unprepared sessions before querying',async route=>{
    const f=await invoiceHttpFixture(vertical,{splitCount:3}),mine=await f.open(f.intent(1));
    const queries=f.port.client.querySession.mock.calls.length;
    expect((await f.complete({...mine,sessionId:'foreign'},route)).status).toBe(404);
    f.invoices.push({...f.invoice,id:randomUUID(),token:randomUUID(),splitPaidSessions:[]});
    const other=await f.open(f.intent(1),f.invoices[1].token),after=f.port.client.querySession.mock.calls.length;
    expect((await f.complete({...mine,sessionId:other.sessionId},route)).status).toBe(404);
    expect(f.port.client.querySession.mock.calls.length).toBe(after);expect(after).toBeGreaterThan(queries);expect(f.apply).not.toHaveBeenCalled();
  });
  test.each(['hosted-fields-complete','googlepay-complete'])('%s pays only its exact share, once',async route=>{
    const f=await invoiceHttpFixture(vertical,{splitCount:3}),mine=await f.open(f.intent(2,'Payer@Synthetic.test'));
    f.port.setObservation('approved');
    expect((await f.complete(mine,route)).body).toMatchObject({approved:true,receiptShare:2,splitPaidCount:1});
    expect((await f.complete(mine,route)).body.splitPaidCount).toBe(1);
    expect(f.apply).toHaveBeenCalledTimes(1);expect(f.apply.mock.calls[0][0]).toMatchObject({shareIndex:2,amountCents:33334,payerEmail:'payer@synthetic.test'});
    expect(f.invoice.splitPaidSessions).toEqual([mine.sessionId]);
  });
  test('holds the split count after an attempt exists, including before any share is paid',async()=>{
    const f=await invoiceHttpFixture(vertical,{splitCount:3});
    expect((await request(f.app).post(`/api/checkout/${f.invoice.token}/split`).send({count:4})).status).toBe(200);
    await f.open(f.intent(1));expect((await request(f.app).post(`/api/checkout/${f.invoice.token}/split`).send({count:2})).status).toBe(409);expect(f.invoice.splitCount).toBe(4);
  });
  test('freezes email only on its attempt and refuses changed-email reuse',async()=>{
    const f=await invoiceHttpFixture(vertical,{splitCount:2}),command=f.intent(1,'Payer@Synthetic.test');await f.open(command);
    const res=await request(f.app).post(`/api/checkout/${f.invoice.token}/session`).send({...command,payerEmail:'another@synthetic.test'});
    expect(res.status).toBe(409);expect([...f.port.attempts.values()][0].payerEmail).toBe('payer@synthetic.test');expect(f.invoice.splitPayerEmails).toBeUndefined();expect(f.port.counts().creates).toBe(1);
  });
  test('all shares sum to the invoice; abandoned addresses never reach a financial application or direct email',async()=>{
    const f=await invoiceHttpFixture(vertical,{splitCount:3}),email=jest.spyOn(gst,'sendGstInvoices').mockResolvedValue(0);
    const abandoned=await f.open(f.intent(3,'abandoned@synthetic.test'));
    for(const i of [1,2]){f.port.setObservation('pending');const mine=await f.open(f.intent(i,`payer${i}@synthetic.test`));f.port.setObservation('approved');await f.complete(mine);}
    expect(f.apply.mock.calls.map(([b])=>b.payerEmail)).toEqual(['payer1@synthetic.test','payer2@synthetic.test']);expect(email).not.toHaveBeenCalled();
    f.port.setObservation('approved');await f.complete(abandoned);expect(f.invoice).toMatchObject({status:'paid',splitPaidCount:3});
    expect(f.apply.mock.calls.reduce((sum,[b])=>sum+b.amountCents,0)).toBe(100001);
    const extra=await request(f.app).post(`/api/checkout/${f.invoice.token}/session`).send(f.intent(3));expect(extra.status).toBe(409);expect(f.port.counts().creates).toBe(3);
  });
  test('provider receipt is committed before ACK and reconciles only its own bound session',async()=>{
    const f=await invoiceHttpFixture(vertical,{splitCount:3}),mine=await f.open(f.intent(1));f.port.setObservation('approved');
    const path=vertical==='property'?'rent':'trades';
    expect((await request(f.app).post(`/api/windcave/${path}-notification`).send({sessionId:mine.sessionId})).status).toBe(200);
    expect([...f.port.receipts.values()].some(x=>x.sessionId===mine.sessionId)).toBe(true);
    await f.port.runtime.worker.runOne(randomUUID(),mine.sessionId);expect(f.apply).toHaveBeenCalledTimes(1);
    expect((await request(f.app).get(`/api/windcave/${path}-notification?sessionId=foreign`)).status).toBe(200);
    await f.port.runtime.worker.runOne(randomUUID(),'foreign');expect(f.apply).toHaveBeenCalledTimes(1);
  });
});
