import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import Checkout from '../checkout';
import {checkoutCommand,rememberCheckoutConfirmation} from '@/lib/checkout-command';
const token='t'.repeat(43),state='s'.repeat(43);
let mockParams:Record<string,string>={token};
let mockSearch='';
const mockNavigate=jest.fn();
jest.mock('wouter',()=>({useParams:()=>mockParams,useLocation:()=>['/',mockNavigate],useSearch:()=>mockSearch}));
jest.mock('@/lib/analytics',()=>({trackEvent:jest.fn()}));
jest.mock('@/features/checkout/CheckoutView',()=>({CheckoutView:(props:any)=><div data-testid="checkout-controller" data-kind={props.kind} data-state={props.state??props.status}>
  <button onClick={props.onCardPay}>pay</button><span>{props.errorMessage??''}</span></div>}));
const fetchMock=global.fetch as jest.Mock;
function response(body:unknown,status=200){return {ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)} as Response;}
function mount(kind:'retail-token'|'invoice-token') {
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  const view=render(<QueryClientProvider client={client}><Checkout sourceKind={kind}/></QueryClientProvider>);return {...view,client};
}
beforeEach(()=>{sessionStorage.clear();fetchMock.mockReset();mockNavigate.mockReset();mockParams={token};mockSearch='';let n=0;
  jest.spyOn(crypto,'randomUUID').mockImplementation(()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`);
});
afterEach(()=>jest.restoreAllMocks());
test('a processing session stays processing until its local hashed-state poll confirms approval',async()=>{
  let final=false;const bodies:any[]=[];
  fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>{
    if(url==='/api/windcave/env')return response({env:'uat'});
    if(url===`/api/pay/t/${token}`)return response({price:'10.01',itemName:'Synthetic',status:'pending',isSplit:false,merchant:{businessName:'Test'}});
    if(url===`/api/pay/t/${token}/session`){bodies.push(JSON.parse(String(init?.body)));return response({processing:true,outcome:'pending',returnState:state,shareIndex:0},202);}
    if(url===`/api/pay/return/${state}`)return response({outcome:final?'approved':'pending',receiptShare:null});
    throw new Error('Unexpected request');
  });
  mount('retail-token');await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-kind','payment'));
  fireEvent.click(screen.getByText('pay'));await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','processing'));
  await waitFor(()=>expect(bodies).toHaveLength(1));expect(bodies[0]).toMatchObject({shareIndex:0,idempotencyKey:expect.any(String)});
  expect(screen.getByTestId('checkout-controller')).not.toHaveAttribute('data-state','payment-success');
  final=true;await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','payment-success'),{timeout:4000});
});
test('lost invoice reply and a reload after another share settles reuse the original share and UUID',async()=>{
  let paid=0,requestCount=0;const bodies:any[]=[];
  fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>{
    if(url==='/api/windcave/env')return response({env:'uat'});
    if(url===`/api/checkout/resolve/${token}`)return response({invoiceId:'synthetic',merchantId:1,vertical:'property',amountCents:1001,splitEnabled:true,splitCount:2,splitPaidCount:paid,status:'dispatched'});
    if(url===`/api/checkout/${token}/session`){bodies.push(JSON.parse(String(init?.body)));if(++requestCount===1)throw new Error('Lost response');return response({attemptState:'approved',outcome:'approved',shareIndex:1});}
    throw new Error('Unexpected request');
  });
  const first=mount('invoice-token');await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-kind','payment'));
  fireEvent.click(screen.getByText('pay'));await waitFor(()=>expect(bodies).toHaveLength(1));first.unmount();paid=1;
  mount('invoice-token');await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-kind','payment'));
  fireEvent.click(screen.getByText('pay'));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[1]).toEqual(bodies[0]);expect(bodies[1].shareIndex).toBe(1);
  await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','payment-success'));
});
test('refreshing an unknown payment resumes confirmation without opening another session',async()=>{
  let sessions=0,final=false;
  fetchMock.mockImplementation(async(url:string)=>{
    if(url==='/api/windcave/env')return response({env:'uat'});
    if(url===`/api/pay/t/${token}`)return response({price:'10.01',itemName:'Synthetic',status:'pending',isSplit:false,merchant:{businessName:'Test'}});
    if(url===`/api/pay/t/${token}/session`){sessions++;return response({processing:true,outcome:'pending',returnState:state,shareIndex:0},202);}
    if(url===`/api/pay/return/${state}`)return response({outcome:final?'approved':'pending',receiptShare:null});
    throw new Error('Unexpected request');
  });
  const first=mount('retail-token');await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-kind','payment'));
  fireEvent.click(screen.getByText('pay'));await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','processing'));
  first.unmount();mount('retail-token');await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','processing'));
  expect(sessions).toBe(1);final=true;
  await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','payment-success'),{timeout:4000});
  expect(sessions).toBe(1);
});
test.each(['synthetic','another-invoice'])('invoice return state confirms only its concrete invoice (%s)',async invoiceId=>{
  mockSearch=`paymentState=${state}`;let sessions=0;
  fetchMock.mockImplementation(async(url:string)=>{
    if(url==='/api/windcave/env')return response({env:'uat'});
    if(url===`/api/checkout/resolve/${token}`)return response({invoiceId:'synthetic',merchantId:1,vertical:'property',amountCents:1001,status:'dispatched'});
    if(url===`/api/pay/return/${state}`)return response({outcome:'approved',invoiceId,receiptShare:null});
    if(url===`/api/checkout/${token}/session`){sessions++;throw new Error('Return must not start a payment');}
    throw new Error('Unexpected request');
  });
  mount('invoice-token');
  if(invoiceId==='synthetic')await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','payment-success'));
  else await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','processing'));
  expect(sessions).toBe(0);
});
test('expired return state recovers through the same token/session/key without a new initiation',async()=>{
  const source={kind:'retail-token' as const,token},command=checkoutCommand(source,0),bodies:any[]=[];let sessions=0;
  rememberCheckoutConfirmation(source,command,state,{sessionId:'synthetic-session',submitted:true});
  fetchMock.mockImplementation(async(url:string,init?:RequestInit)=>{
    if(url==='/api/windcave/env')return response({env:'uat'});
    if(url===`/api/pay/t/${token}`)return response({price:'10.01',itemName:'Synthetic',status:'pending',isSplit:false,merchant:{businessName:'Test'}});
    if(url===`/api/pay/return/${state}`)return response({message:'Expired'},410);
    if(url===`/api/pay/t/${token}/hosted-fields-complete`){bodies.push(JSON.parse(String(init?.body)));return response({outcome:'approved',receiptShare:null});}
    if(url===`/api/pay/t/${token}/session`){sessions++;throw new Error('Recovery must not initiate');}
    throw new Error('Unexpected request');
  });
  mount('retail-token');await waitFor(()=>expect(screen.getByTestId('checkout-controller')).toHaveAttribute('data-state','payment-success'));
  expect(bodies).toEqual([{...command,sessionId:'synthetic-session'}]);expect(sessions).toBe(0);
});
