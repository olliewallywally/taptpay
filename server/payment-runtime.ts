import {logOperation} from "./structured-log";
import {runWithOperationContext} from "./operation-context";
import {randomUUID} from 'node:crypto';
import type {DurablePaymentStorage} from './durable-payment-storage';
import {PaymentReconciliationWorker} from './payment-reconciliation';
import type {WindcaveClient} from './windcave-client';
import type {ReconciliationRepository,ReconciliationProvider,InboxClaim} from './durable-payment-contract';

export class PaymentRuntime {
  readonly worker:PaymentReconciliationWorker;
  constructor(readonly repository:ReconciliationRepository & {receive(sessionId:string,kind:'fprn'|'browser'|'poll',now?:Date):Promise<string>},
    provider:ReconciliationProvider,readonly clock=()=>new Date(),separateDomain?:(claim:InboxClaim)=>Promise<boolean>) {
    this.worker=new PaymentReconciliationWorker(repository,provider,clock,Math.random,separateDomain);
  }
  async reconcile(sessionId:string,kind:'browser'|'poll'):Promise<void> {
    await this.repository.receive(sessionId,kind,this.clock());
    await this.worker.runOne(randomUUID(),sessionId);
  }
}

export type ConfiguredPaymentRuntime=PaymentRuntime & {
  repository:DurablePaymentStorage;client:WindcaveClient;
  context:{providerEnvironment:'uat'|'production';accountUsername:string};
};
/** Explicit bootstrap only. Work remains durable across process stop/crash;
 * multiple instances use the same fenced SKIP LOCKED claims. */
export function startPaymentReconciliationLoop(service:PaymentRuntime,intervalMs=1000):()=>void {
  let busy=false,stopped=false;
  const owner=randomUUID();
  const tick=async()=>runWithOperationContext({jobId:randomUUID()},async()=>{
    if(busy || stopped) return;busy=true;
    try {for(let i=0;i<10 && !stopped;i++)if(!await service.worker.runOne(owner))break;}
    catch {logOperation("error","PAYMENT_RECONCILIATION_UNAVAILABLE");}
    finally {busy=false;}
  });
  const timer=setInterval(()=>void tick(),intervalMs);timer.unref();
  return ()=>{stopped=true;clearInterval(timer);};
}
