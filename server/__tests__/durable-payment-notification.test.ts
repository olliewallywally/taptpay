import express from 'express';
import request from 'supertest';
import {createDurablePaymentNotificationHandlers} from '../durable-payment-notification';

function appWith(receive=jest.fn(async()=> 'receipt')) {
  const app=express();app.use('/notification',...createDurablePaymentNotificationHandlers({receive},(body:any)=>body?.sessionId));
  return {app,receive};
}
describe('durable provider receipt adapter',()=>{
  test('commits before acknowledging; does not interpret approval fields',async()=>{
    let release!:()=>void,started!:()=>void;
    const waitStarted=new Promise<void>(resolve=>{started=resolve;});
    const write=new Promise<void>(resolve=>{release=resolve;});
    const receive=jest.fn(async()=>{started();await write;return 'receipt';});
    const {app}=appWith(receive);let acknowledged=false;
    const response=request(app).post('/notification').send({sessionId:'session-A',approved:true,amount:99999}).then(result=>{acknowledged=true;return result;});
    await waitStarted;expect(acknowledged).toBe(false);release();
    expect((await response).status).toBe(200);expect(receive).toHaveBeenCalledWith('session-A','fprn');
  });
  test('database failure asks the provider to retry',async()=>{
    const {app}=appWith(jest.fn(async()=>{throw new Error('private database error');}));
    const response=await request(app).post('/notification').send({sessionId:'session-A'});
    expect(response.status).toBe(503);expect(response.headers['retry-after']).toBe('5');expect(response.text).not.toContain('private');
  });
  test.each([undefined,123,{},['session-A'],'','A'.repeat(201),'session/secret'])('invalid session shape %p never persists',async(sessionId)=>{
    const {app,receive}=appWith();expect((await request(app).post('/notification').send({sessionId})).status).toBe(400);expect(receive).not.toHaveBeenCalled();
  });
  test('wrong method, content type, compressed payload and oversize payload never persist',async()=>{
    const {app,receive}=appWith();
    expect((await request(app).get('/notification')).status).toBe(405);
    expect((await request(app).post('/notification').type('text').send('session-A')).status).toBe(415);
    expect((await request(app).post('/notification').set('Content-Encoding','gzip').send({sessionId:'session-A'})).status).toBe(415);
    expect((await request(app).post('/notification').send({sessionId:'session-A',padding:'A'.repeat(8192)})).status).toBe(413);
    expect(receive).not.toHaveBeenCalled();
  });
  test('rejects a body parsed earlier with a different size limit',async()=>{
    const {receive}=appWith();const app=express();app.use(express.json());
    app.use('/notification',...createDurablePaymentNotificationHandlers({receive},()=> 'session-A'));
    expect((await request(app).post('/notification').send({sessionId:'session-A'})).status).toBe(503);
    expect(receive).not.toHaveBeenCalled();
  });
});
