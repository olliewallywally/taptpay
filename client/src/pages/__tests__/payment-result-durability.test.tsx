import {render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import PaymentResult from '../payment-result';
let mockSearch='?status=approved';
const mockNavigate=jest.fn();
jest.mock('wouter',()=>({useParams:()=>({transactionId:'12'}),useLocation:()=>['/',mockNavigate],useSearch:()=>mockSearch}));
const fetchMock=global.fetch as jest.Mock;
const reply=(body:unknown)=>({ok:true,json:async()=>body});
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  return render(<QueryClientProvider client={client}><PaymentResult/></QueryClientProvider>);}
beforeEach(()=>{fetchMock.mockReset();mockNavigate.mockReset();mockSearch='?status=approved';});
test('a browser supplied approval cannot show success or redirect to a receipt',async()=>{
  fetchMock.mockResolvedValue(reply({id:12,price:'10.00',status:'pending'}));mount();
  await screen.findByText('Checking your payment');
  expect(screen.queryByText('Payment Successful!')).not.toBeInTheDocument();expect(mockNavigate).not.toHaveBeenCalled();
});
test('a processing return polls its exact state and uses its confirmed receipt share',async()=>{
  mockSearch='?status=approved&state='+ 's'.repeat(43);let approved=false;
  fetchMock.mockImplementation(async(url:string)=>url.includes('/api/pay/return/')
    ?reply({transactionId:12,outcome:approved?'approved':'pending',receiptShare:2,receiptSplitId:approved?45:null}):reply({id:12,price:'10.00',status:'pending'}));
  mount();await screen.findByText('Checking your payment');approved=true;
  await screen.findByText('Payment Successful!',{}, {timeout:4000});
  await waitFor(()=>expect(mockNavigate).toHaveBeenCalledWith('/receipt/12?splitId=45'),{timeout:4000});
});
