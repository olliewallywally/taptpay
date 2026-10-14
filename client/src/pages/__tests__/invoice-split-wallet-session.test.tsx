/*
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 1):
 * each share of a split invoice is paid only by a session opened for it. The checkout page readies
 * an Apple Pay session (and a Google Pay one) as it loads, before anyone chooses to split, and it
 * kept that full-amount session after the split was chosen: tapping Apple Pay then charged the
 * whole invoice while the sheet showed a share, and the server now refuses that session for a
 * share. The ready session follows the amount the page would charge.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Checkout from "@/pages/checkout";
let mockSearch='';

jest.mock("wouter", () => ({
  useParams: () => ({ token: "invoice-token" }),
  useLocation: () => ["/r/invoice-token", jest.fn()],
  useSearch: () => mockSearch,
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

let invoice: Record<string, unknown>;
const sessionBodies: unknown[] = [];

beforeEach(() => {
  mockSearch='';
  sessionStorage.clear();let n=0;
  jest.spyOn(crypto,'randomUUID').mockImplementation(()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`);
  sessionBodies.length = 0;
  invoice = {
    invoiceId: "inv-1",
    merchantId: 7,
    amountCents: 10_000,
    splitEnabled: true,
    splitCount: null,
    splitPaidCount: 0,
    alreadyPaid: false,
    vertical: "property",
    kind: "rent",
    propertyAddress: "1 Test Road",
    merchantName: "Kōwhai Rentals",
    customLogoUrl: null,
  };
  (window as any).ApplePaySession = { canMakePayments: () => true };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/checkout/resolve/invoice-token") return reply(invoice);
    if (url === "/api/windcave/env") return reply({ env: "uat", applePayMerchantId: "merchant.test", googlePayMerchantId: "", googlePayEnv: "TEST" });
    if (url === "/api/checkout/invoice-token/split") {
      const { count } = JSON.parse(String(init?.body));
      invoice = { ...invoice, splitCount: count };
      return reply({ splitCount: count, splitPaidCount: 0, shareCents: Math.floor(10_000 / count) });
    }
    if (url === "/api/checkout/invoice-token/session") {
      sessionBodies.push(init?.body ? JSON.parse(String(init.body)) : {});
      return reply({
        sessionId: `ready-${sessionBodies.length}`,
        amountStr: invoice.splitCount ? (100/Number(invoice.splitCount)).toFixed(2) : '100.00',
        shareIndex:invoice.splitCount?1:0,
        returnState:'s'.repeat(43),
        ajaxSubmitCardUrl: "https://uat.windcave.com/card",
        ajaxSubmitApplePayUrl: "https://uat.windcave.com/apple",
        ajaxSubmitGooglePayUrl: "https://uat.windcave.com/google",
      });
    }
    return reply({ message: "Not found" }, 404);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (window as any).ApplePaySession;
});

function renderCheckout() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <Checkout sourceKind="invoice-token" />
    </QueryClientProvider>,
  );
}

it("prepares one share session only after the payer chooses to split", async () => {
  renderCheckout();
  await screen.findByRole('button',{name:'Pay the full bill'});
  expect(sessionBodies).toHaveLength(0);

  fireEvent.click(await screen.findByRole("button", { name: "Split the bill" }));
  fireEvent.click(await screen.findByRole("button", { name: "2" }));

  await waitFor(() => expect(sessionBodies).toHaveLength(1), { timeout: 4_000 });
  await screen.findByRole('button',{name:/pay.*apple/i});
  expect(sessionBodies[0]).toMatchObject({reserveShare:true,idempotencyKey:expect.any(String)});
}, 15_000);

it('prepares the full bill after choosing it and keeps receipt email optional',async()=>{
  renderCheckout();const button=await screen.findByRole('button',{name:'Pay the full bill'});
  expect(sessionBodies).toHaveLength(0);fireEvent.click(button);
  await waitFor(()=>expect(sessionBodies).toHaveLength(1));
  expect(sessionBodies[0]).not.toHaveProperty('payerEmail');
  await screen.findByRole('button',{name:/pay.*apple/i});
});
it('uses the invoice amount even when the URL contains a different amount',async()=>{
  mockSearch='?amount=0.01';renderCheckout();await screen.findByRole('button',{name:'Pay the full bill'});
  expect(screen.getByText('$100')).toBeInTheDocument();expect(screen.queryByText('$0.01')).not.toBeInTheDocument();
});
