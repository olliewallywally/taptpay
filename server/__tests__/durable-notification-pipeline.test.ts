import './support/test-env';
import request from 'supertest';
import {createTestApp} from './support/http-harness';

describe('served payment notification receipt gate',()=>{
  test.each(['/api/windcave/notification','/api/windcave/rent-notification','/api/windcave/trades-notification','/api/pay/notification/untrusted-state','/api/billing/card/notification'])(
    '%s cannot ACK without durable storage',async path=>{
      const {app}=await createTestApp();
      const get=await request(app).get(path).query({sessionid:'synthetic-session'});
      const post=await request(app).post(path).send({sessionId:'synthetic-session',approved:true});
      expect(get.status).toBe(503);expect(post.status).toBe(503);
      expect(get.headers['retry-after']).toBe('5');
    });
  test('invalid/ambiguous/unbounded hints are refused before storage',async()=>{
    const {app}=await createTestApp();
    expect((await request(app).get('/api/windcave/notification?sessionid=A&sessionid=B')).status).toBe(400);
    expect((await request(app).get('/api/windcave/notification?sessionid=A&sessionId=B')).status).toBe(400);
    expect((await request(app).post('/api/windcave/rent-notification').send({sessionId:'A',padding:'x'.repeat(8192)})).status).toBe(413);
    expect((await request(app).post('/api/windcave/trades-notification').type('text').send('sessionid=A')).status).toBe(415);
    expect((await request(app).put('/api/windcave/notification').send({sessionId:'A'})).status).toBe(405);
  });
});
