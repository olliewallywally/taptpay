import {renderPaymentCommunication} from '../durable-payment-delivery';

describe('durable payment receipt content',()=>{
  test('subscription verification, missing methods and captured parent drift use accurate labels',()=>{
    const base={domain:'subscription' as const,eventId:'event',reference:'SUB-1',businessName:'Example',createdAt:'2026-10-14T00:00:00Z'};
    expect(renderPaymentCommunication({...base,outcome:'card_approved'}).text).toContain('Payment method verified');
    expect(renderPaymentCommunication({...base,outcome:'not_charged',amountCents:799}).text).toContain('No subscription charge was sent');
    expect(renderPaymentCommunication({...base,outcome:'approved',resolutionRequired:true}).text).toContain('access requires review');
    expect(renderPaymentCommunication({...base,outcome:'approved'}).subject).toContain('Subscription payment confirmed');
  });
  test('a split rent receipt names only the actual share and adds no residential GST',()=>{
    const result=renderPaymentCommunication({domain:'property',eventId:'event',reference:'RENT-1',amountCents:333,
      outcome:'approved',shareIndex:2,businessName:'Example',gstRegistered:true,gstNumber:'123',createdAt:'2026-10-13T00:00:00Z'});
    expect(result.text).toContain('NZD 3.33');expect(result.text).toContain('Share 2');
    expect(result.text).not.toContain('Paid in full');expect(result.text).not.toContain('GST');
  });
  test('registered trades receipts use inclusive GST and escape business text',()=>{
    const result=renderPaymentCommunication({domain:'trades',eventId:'event',reference:'JOB-1',amountCents:11500,
      outcome:'approved',businessName:'<script>alert(1)</script>',gstRegistered:true,gstNumber:'123',createdAt:'2026-10-13T00:00:00Z'});
    expect(result.text).toContain('GST (15%) included: NZD 15.00');expect(result.html).not.toContain('<script>');
  });
  test('manual payments and late captures retain truthful labels',()=>{
    const cash=renderPaymentCommunication({domain:'retail',eventId:'event',reference:'SALE-1',amountCents:100,
      outcome:'cash',businessName:'Example',createdAt:'2026-10-13T00:00:00Z'});
    expect(cash.text).toContain('Cash recorded');expect(cash.text).not.toContain('authorised');
    const late=renderPaymentCommunication({domain:'property',eventId:'event',reference:'RENT-1',amountCents:100,
      outcome:'approved',previousStatus:'voided',businessName:'Example',createdAt:'2026-10-13T00:00:00Z'});
    expect(late.text).toContain('previously voided');
  });
});

test('blocked quote notice preserves owned customer/context and escaped billing action',()=>{
  const input={domain:'trades',eventId:'synthetic-event',reference:'QUOTE-123',amountCents:115000,outcome:'quote_blocked',businessName:'Synthetic',createdAt:'2026-10-14',customerName:'<b>Jamie</b> Smith',billingUrl:'https://harness.test/settings?section=billing'};
  const notice=renderPaymentCommunication(input as any);expect(notice.text).toContain('<b>Jamie</b> Smith');expect(notice.html).toContain('&lt;b&gt;Jamie&lt;/b&gt; Smith');expect(notice.html).not.toContain('<b>Jamie</b>');expect(notice.text).toContain(input.billingUrl);expect(notice.text).toContain('NZD 1150.00');
});
