import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DesktopRetailAnalytics from './pages/retail-analytics';
import DesktopRetailTerminal from './pages/retail-terminal';

jest.mock('@/lib/auth', () => ({getCurrentMerchantId: () => 77}));
jest.mock('@/hooks/use-toast', () => ({useToast: () => ({toast:jest.fn()})}));
jest.mock('./DesktopPageScaffold', () => ({DesktopPageScaffold: ({children}:any) => children}));
const fetchMock = global.fetch as jest.Mock;
const reply = (body:unknown) => ({ok:true,status:200,json:async()=>body,text:async()=>JSON.stringify(body)}) as Response;
const settle = () => act(async () => {for(let i=0;i<8;i++) await new Promise(r=>setTimeout(r,0));});
beforeEach(() => {
  fetchMock.mockReset();
});
function mount(Page:any,sales:()=>Response|Promise<Response>) {
  fetchMock.mockImplementation(async (input:RequestInfo|URL) => {
    if(String(input).endsWith('/transactions')) return sales();
    if(String(input).endsWith('/profile')) return reply({id:77,businessName:'Review business',gstRegistered:true});
    return reply([]);
  });
  const client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  render(<QueryClientProvider client={client}><Page deviceClass="desktop"/></QueryClientProvider>);
  return client;
}
test.each([null, {}, [null], [{}], [{id: 1, status: 'completed', createdAt: '2026-09-29', price: 'bad'}]])('malformed sales %j cannot become a zero-value report',async(body)=>{
  mount(DesktopRetailAnalytics,()=>reply(body)); await settle();
  expect({zero:screen.queryByText('$0.00')!==null,alert:screen.queryByRole('alert')!==null,
    exportDisabled:screen.getByRole('button',{name:'Export'}).hasAttribute('disabled')})
    .toEqual({zero:false,alert:true,exportDisabled:true});
});
test('REVIEW T9: null sales body cannot enable a new payment',async()=>{
  mount(DesktopRetailTerminal,()=>reply(null)); await settle();
  expect({alert:screen.queryByRole('alert')!==null,paymentDisabled:screen.getByRole('button',{name:'send payment'}).hasAttribute('disabled')})
    .toEqual({alert:true,paymentDisabled:true});
});
