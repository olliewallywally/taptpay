import {logOperation} from "./structured-log";
import {startDrainingLoop,type StopWorker} from './draining-loop';
import {runWithOperationContext} from "./operation-context";
import {randomUUID,createHash} from 'node:crypto';
import {Resend} from 'resend';
import {config} from './config';
import {pool} from './db';
import {DurablePaymentStorage} from './durable-payment-storage';
import {DurablePaymentDelivery,PaymentDestinationChanged,type PaymentDeliveryPorts} from './durable-payment-delivery';
import {PaymentOutboxWorker} from './payment-outbox';
import {sseBroker} from './sse-broker';
import {canSendPaymentPush,sendPaymentPushTarget} from './push';

export async function sendPaymentEmail(resend:Pick<Resend,'emails'>,payload:Parameters<Resend['emails']['send']>[0],key:string,timeoutMs=10000){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{const result=await Promise.race([resend.emails.send(payload,{idempotencyKey:key}),
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('delivery_unknown')),timeoutMs);})]);
    if(result.error||!result.data?.id)throw Error('delivery_unknown');
  }finally{if(timer)clearTimeout(timer);}
}

export function createPaymentDeliveryRuntime(){
  if(!pool)return undefined;
  const database=pool,resend=config.email.provider==='resend'&&config.email.resendApiKey?new Resend(config.email.resendApiKey):undefined;
  const ports:PaymentDeliveryPorts={
    ready:target=>target.kind==='sse'||target.kind==='skip'||(target.kind==='email'?!!resend:canSendPaymentPush(target.payload)),
    send:async(target,key)=>{
      if(target.kind==='sse'){
        let message=target.payload.message;
        if(target.payload.stoneId&&message.transaction&&!message.merchantOnly){
          const client=await database.connect();try{
            const latest=(await client.query('SELECT id FROM transactions WHERE merchant_id=$1 AND tapt_stone_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[target.merchant_id,target.payload.stoneId])).rows[0];
            if(latest?.id!==message.transaction.id)message={...message,merchantOnly:true};
          }finally{client.release();}
        }
        await sseBroker.broadcast(target.payload.merchantId,target.payload.stoneId,message);return;
      }
      if(target.kind==='skip')return;
      if(target.kind==='email'){
        if(!resend)throw Error('delivery_credentials_unavailable');
        await sendPaymentEmail(resend,target.payload,key);return;
      }
      const client=await database.connect();let subscription:any;
      try{subscription=(await client.query('SELECT * FROM push_subscriptions WHERE id=$1 AND merchant_id=$2 AND is_active=true',[target.push_subscription_id,target.merchant_id])).rows[0];}
      finally{client.release();}
      // A removed/rotated destination no longer has permission to receive this
      // frozen message. Never send it to a replacement endpoint.
      if(!subscription||createHash('sha256').update(subscription.endpoint).digest('hex')!==target.payload.endpointDigest)throw new PaymentDestinationChanged();
      await sendPaymentPushTarget(subscription,target.payload.notification);
    },
  };
  const receiver=new DurablePaymentDelivery(database,ports,config.email.fromEmail,()=>new Date(),config.publicOrigin);
  return {receiver,worker:new PaymentOutboxWorker(new DurablePaymentStorage(database),receiver)};
}
/** Explicit bootstrap; no loop or external I/O is started on import. */
export function startPaymentDeliveryLoop(runtime:NonNullable<ReturnType<typeof createPaymentDeliveryRuntime>>,intervalMs=1000):StopWorker{
  const owner=randomUUID(),seen=new Set<string>(),boot=new Date();
  const delivery=startDrainingLoop(async canContinue=>runWithOperationContext({jobId:randomUUID()},async()=>{
    try{for(let i=0;i<10&&canContinue();i++)if(!await runtime.worker.runOne(owner))break;}
    catch{logOperation("error","PAYMENT_DELIVERY_UNAVAILABLE");}
  }),intervalMs);
  const realtime=startDrainingLoop(async canContinue=>runWithOperationContext({jobId:randomUUID()},async()=>{
    try{await runtime.receiver.realtime(new Date(Math.max(boot.getTime()-10000,Date.now()-60000)),seen,canContinue);}
    catch{logOperation("error","PAYMENT_REALTIME_UNAVAILABLE");}
  }),intervalMs);
  return Object.assign(()=>{delivery();realtime();},{drain:async()=>{await Promise.all([delivery.drain(),realtime.drain()]);}});
}
