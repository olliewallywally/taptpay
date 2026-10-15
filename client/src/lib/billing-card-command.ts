import {createOperationUuid} from './payment-addressing';
const slot=(merchantId:number)=>`taptpay:billing-card-command:v1:${merchantId}`;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function billingCardCommandKey(merchantId:number|null):string {
  if(!Number.isSafeInteger(merchantId)||merchantId!<1)throw new Error('Reload Settings before starting card setup');
  const saved=sessionStorage.getItem(slot(merchantId!));if(saved){if(!uuid.test(saved))throw new Error('Your original card setup needs confirmation');return saved;}
  const key=createOperationUuid();if(!uuid.test(key))throw new Error('Secure card setup identity is unavailable');sessionStorage.setItem(slot(merchantId!),key);return key;
}
export function releaseBillingCardCommand(merchantId:number|undefined|null):void {
  if(Number.isSafeInteger(merchantId)&&merchantId!>0)sessionStorage.removeItem(slot(merchantId!));
}
