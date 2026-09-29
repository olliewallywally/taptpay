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

jest.mock("wouter", () => ({
  useParams: () => ({ token: "invoice-token" }),
  useLocation: () => ["/r/invoice-token", jest.fn()],
  useSearch: () => "",
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
        amountStr: "?",
        ajaxSubmitCardUrl: "https://uat.windcave.com/card",
        ajaxSubmitApplePayUrl: "https://uat.windcave.com/apple",
        ajaxSubmitGooglePayUrl: "https://uat.windcave.com/google",
      });
    }
    return reply({ message: "Not found" }, 404);
  });
});

afterEach(() => {
  delete (window as any).ApplePaySession;
});

function renderCheckout() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <Checkout sourceKind="invoice-token" />
    </QueryClientProvider>,
  );
}

it("readies a new Apple Pay session for the share once the payer chooses to split", async () => {
  renderCheckout();
  // The page readies one for the whole invoice as it loads.
  await waitFor(() => expect(sessionBodies).toHaveLength(1));

  fireEvent.click(await screen.findByRole("button", { name: "Split the bill" }));
  fireEvent.click(await screen.findByRole("button", { name: "2" }));

  // Once the invoice reads as split, the ready session is renewed for the share.
  await waitFor(() => expect(sessionBodies).toHaveLength(2), { timeout: 4_000 });
}, 15_000);
