import {createOperationUuid} from './payment-addressing';
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type CashDraft={merchantId:number;itemName:string;price:string;stoneId?:number|null};
const prefix='taptpay:cash-command:v1:';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Save before sending. A failed or lost answer retains the command across
 * navigation/reload. Keep the same key after edits: the server fingerprint
 * decides whether the details conflict with a previously committed sale. */
export function cashCommandKey(draft:CashDraft,storage:StorageLike=window.sessionStorage):string {
  const slot=`${prefix}${draft.merchantId}`;
  const existing=storage.getItem(slot);
  if(existing!==null) {
    let saved:{key:string};
    try {saved=JSON.parse(existing);if(!uuid.test(saved.key))throw new Error();}
    catch {throw new Error('Cash retry state is invalid. Check your sales before recording another cash sale.');}
    return saved.key;
  }
  const key=createOperationUuid();storage.setItem(slot,JSON.stringify({key}));return key;
}
export function completeCashCommand(merchantId:number,key:string,storage:StorageLike=window.sessionStorage):void {
  const slot=`${prefix}${merchantId}`,value=storage.getItem(slot);if(value===null)return;
  try {if(JSON.parse(value).key===key)storage.removeItem(slot);} catch {/* preserve uncertainty */}
}
