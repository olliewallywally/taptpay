import './support/test-env';
import {Resend} from 'resend';
import {sendPaymentEmail} from '../payment-delivery-runtime';

test('the installed Resend SDK sends the stable key and exact frozen body on retry',async()=>{
  const fetch=jest.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({id:'synthetic-email-id'}),{status:200,headers:{'content-type':'application/json'}}));
  try{
    const sdk=new Resend('synthetic-api-key'),payload={from:'billing@synthetic.test',to:'payer@synthetic.test',subject:'Receipt',text:'NZD 3.33'},key='taptpay-r3/11111111-1111-4111-8111-111111111111';
    await sendPaymentEmail(sdk,payload,key);await sendPaymentEmail(sdk,payload,key);
    expect(fetch).toHaveBeenCalledTimes(2);
    for(const [url,init] of fetch.mock.calls){expect(url).toBe('https://api.resend.com/emails');expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(key);expect(JSON.parse(String(init?.body))).toMatchObject(payload);}
  }finally{fetch.mockRestore();}
});
test('a missing acceptance ID, API refusal or timed-out response remains uncertain',async()=>{
  for(const response of [{data:null,error:{message:'refused'}},{data:{},error:null}]){
    await expect(sendPaymentEmail({emails:{send:async()=>response}} as any,{} as any,'stable-key')).rejects.toThrow('delivery_unknown');
  }
  await expect(sendPaymentEmail({emails:{send:()=>new Promise(()=>{})}} as any,{} as any,'stable-key',1)).rejects.toThrow('delivery_unknown');
});
