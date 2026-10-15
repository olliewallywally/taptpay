import {billingCardCommandKey,releaseBillingCardCommand} from '../billing-card-command';
beforeEach(()=>{sessionStorage.clear();let n=0;jest.spyOn(crypto,'randomUUID').mockImplementation(()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`);});
afterEach(()=>jest.restoreAllMocks());
test('card setup holds the same command across timeout, reload and account scope',()=>{
  const key=billingCardCommandKey(7);expect(billingCardCommandKey(7)).toBe(key);expect(billingCardCommandKey(8)).not.toBe(key);
  releaseBillingCardCommand(8);expect(billingCardCommandKey(7)).toBe(key);
  releaseBillingCardCommand(7);expect(billingCardCommandKey(7)).not.toBe(key);
});
test('a corrupt held command is never replaced by another setup',()=>{
  sessionStorage.setItem('taptpay:billing-card-command:v1:7','invalid');expect(()=>billingCardCommandKey(7)).toThrow('original card setup');
  expect(sessionStorage.getItem('taptpay:billing-card-command:v1:7')).toBe('invalid');
});
