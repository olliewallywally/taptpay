import {PaymentOutboxWorker} from '../payment-outbox';
test('repeated expired delivery leases cannot evade the retry cap or invoke another send',async()=>{
  const now=new Date(),claim={attemptCount:21},repository={claimOutbox:jest.fn(async()=>claim),finishOutbox:jest.fn(async()=>true)},receiver={deliver:jest.fn()};
  expect(await new PaymentOutboxWorker(repository as any,receiver,()=>now).runOne('synthetic-owner')).toBe(true);
  expect(receiver.deliver).not.toHaveBeenCalled();expect(repository.finishOutbox).toHaveBeenCalledWith(claim,'dead_letter',now);
});
