import {checkoutCommand,completeCheckoutCommand,rememberCheckoutConfirmation,restoreCheckoutConfirmation,assignInvoiceShare,invoiceCheckoutEmail,readInvoiceCheckoutIntent} from '../checkout-command';
const source={kind:'invoice-token' as const,token:'synthetic-invoice'};
beforeEach(()=>{sessionStorage.clear();let n=0;jest.spyOn(crypto,'randomUUID').mockImplementation(()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`);});
afterEach(()=>jest.restoreAllMocks());
test('a refreshed share count and a reload cannot move an unresolved request to another share',()=>{
  const first=checkoutCommand(source,1);expect(checkoutCommand({...source},2)).toEqual(first);
  expect(JSON.parse(sessionStorage.getItem('taptpay:checkout-command:v1:invoice-token:synthetic-invoice')!)).toEqual(first);
});
test('only its matching terminal answer releases a pending command',()=>{
  const first=checkoutCommand(source,1);completeCheckoutCommand(source,{...first,shareIndex:2});expect(checkoutCommand(source,2)).toEqual(first);
  completeCheckoutCommand(source,first);const next=checkoutCommand(source,2);expect(next.shareIndex).toBe(2);expect(next.idempotencyKey).not.toBe(first.idempotencyKey);
});
test('merchant token and numeric scopes cannot borrow another command',()=>{
  const first=checkoutCommand(source,1);expect(checkoutCommand({kind:'retail-legacy',transactionId:1},1).idempotencyKey).not.toBe(first.idempotencyKey);
  expect(checkoutCommand({...source,token:'another-invoice'},1).idempotencyKey).not.toBe(first.idempotencyKey);
});
test('corrupt pending identity is held rather than replaced',()=>{
  sessionStorage.setItem('taptpay:checkout-command:v1:invoice-token:synthetic-invoice','{"shareIndex":1,"idempotencyKey":"bad"}');expect(()=>checkoutCommand(source,2)).toThrow('retry state');
});
test('an unknown payment restores its exact confirmation state after a reload',()=>{
  const command=checkoutCommand(source,1),state='s'.repeat(43);
  rememberCheckoutConfirmation(source,command,state);
  expect(restoreCheckoutConfirmation({...source})).toEqual({...command,returnState:state});
  completeCheckoutCommand(source,{...command,shareIndex:2});expect(restoreCheckoutConfirmation(source)).toBeDefined();
  completeCheckoutCommand(source,command);expect(restoreCheckoutConfirmation(source)).toBeUndefined();
});
test('a confirmation for a different command cannot replace the original state',()=>{
  const command=checkoutCommand(source,1);rememberCheckoutConfirmation(source,command,'s'.repeat(43));
  rememberCheckoutConfirmation(source,{...command,shareIndex:2},'t'.repeat(43));
  expect(restoreCheckoutConfirmation(source)?.returnState).toBe('s'.repeat(43));
});
test('the server share assignment keeps the same UUID and survives stale-count retries',()=>{
  const first=checkoutCommand(source,1),assigned=assignInvoiceShare(source,first,2);
  expect(assigned).toEqual({...first,shareIndex:2});expect(checkoutCommand(source,3)).toEqual(assigned);
  completeCheckoutCommand(source,assigned);expect(checkoutCommand(source,1).idempotencyKey).not.toBe(first.idempotencyKey);
});
test('receipt email stays frozen across assignment and reload, then releases with its command',()=>{
  const first=checkoutCommand(source,1);expect(invoiceCheckoutEmail(source,first,' Payer@Example.test ')).toBe('payer@example.test');
  const assigned=assignInvoiceShare(source,first,2);
  expect(invoiceCheckoutEmail(source,assigned,'changed@example.test')).toBe('payer@example.test');
  completeCheckoutCommand(source,assigned);const next=checkoutCommand(source,1);expect(invoiceCheckoutEmail(source,next,'')).toBeUndefined();
});
test('a reload can read the frozen email without creating or changing an intent',()=>{
  expect(readInvoiceCheckoutIntent(source)).toBeUndefined();expect(sessionStorage.length).toBe(0);
  const command=checkoutCommand(source,1);invoiceCheckoutEmail(source,command,'payer@example.test');
  expect(readInvoiceCheckoutIntent(source)).toEqual({...command,email:'payer@example.test'});
  expect(invoiceCheckoutEmail(source,command,'changed@example.test')).toBe('payer@example.test');
});
test('submitted confirmation retains the exact session for recovery after state expiry',()=>{
  const command=checkoutCommand(source,1);
  rememberCheckoutConfirmation(source,command,'s'.repeat(43),{sessionId:'synthetic-session',submitted:true});
  expect(restoreCheckoutConfirmation(source)).toEqual({...command,returnState:'s'.repeat(43),sessionId:'synthetic-session',submitted:true});
});
test('only an exact unsent-expiry refusal releases a saved command; unknown/conflicting errors retain it',()=>{
  const {releaseExpiredCheckoutCommand}=require('../checkout-command');
  for(const error of [new Error('503: {"code":"PAYMENT_ATTEMPT_EXPIRED"}'),new Error('409: {"code":"IDEMPOTENCY_CONFLICT"}')]){
    const command=checkoutCommand(source,1);expect(releaseExpiredCheckoutCommand(source,command,error)).toBe(false);expect(checkoutCommand(source,1)).toEqual(command);
  }
  const command=checkoutCommand(source,1);expect(releaseExpiredCheckoutCommand(source,command,new Error('409: {"code":"PAYMENT_ATTEMPT_EXPIRED"}'))).toBe(true);
  expect(checkoutCommand(source,1).idempotencyKey).not.toBe(command.idempotencyKey);
});
