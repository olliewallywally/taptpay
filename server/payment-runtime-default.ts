import {config,PRODUCTION_WINDCAVE_ENDPOINT,UAT_WINDCAVE_ENDPOINT} from './config';
import {pool} from './db';
import {storage} from './storage';
import {PaymentAttemptService} from './payment-attempt-service';
import {DurablePaymentStorage} from './durable-payment-storage';
import {createRetailReconciliationFinalizer,createRetailSessionRecoveryAttacher} from './retail-reconciliation-adapter';
import {createWindcaveClient} from './windcave-client';
import {createWindcaveReconciliationProvider} from './windcave-reconciliation-provider';
import {PaymentRuntime,type ConfiguredPaymentRuntime} from './payment-runtime';
import {writeSecurityAuditEvent} from './security-audit-log';
import {sanitizeWindcaveAuditDetails} from './windcave';
import {getSubscriptionPaymentRuntime} from './subscription-payment-runtime';

let runtime:ConfiguredPaymentRuntime|undefined;
/** Construction performs no I/O and starts no timers. Query-only reconciliation
 * uses the explicitly configured pinned environment even with initiation off. */
export function getPaymentRuntime():ConfiguredPaymentRuntime|undefined {
  if(runtime) return runtime;
  if(!pool) return undefined;
  const endpoint=config.windcave.endpoint;
  const environment=endpoint===UAT_WINDCAVE_ENDPOINT ? 'uat' : endpoint===PRODUCTION_WINDCAVE_ENDPOINT ? 'production' : undefined;
  const context:ConfiguredPaymentRuntime['context']={providerEnvironment:environment??'uat',accountUsername:config.windcave.username??''};
  const client=createWindcaveClient({config:{mode:environment??'disabled',endpoint:endpoint??'',
    username:config.windcave.username??'',apiKey:config.windcave.apiKey??'',publicOrigin:config.publicOrigin},
    transport:(url,init)=>fetch(url,init),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
    clock:()=>new Date(),audit:(action,details)=>writeSecurityAuditEvent(action,sanitizeWindcaveAuditDetails(details)),retryLimit:0,timeoutMs:10000});
  const repository=new DurablePaymentStorage(pool,createRetailReconciliationFinalizer(new PaymentAttemptService(storage)),createRetailSessionRecoveryAttacher(storage));
  const provider=createWindcaveReconciliationProvider(client,context);
  const subscription=getSubscriptionPaymentRuntime(repository);
  runtime=Object.assign(new PaymentRuntime(repository,provider,()=>new Date(),subscription?claim=>subscription.card.processReceipt(claim):undefined),{repository,client,context});
  return runtime;
}
