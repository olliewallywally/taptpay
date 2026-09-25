import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MerchantDetail } from "@/pages/admin/MerchantDetail";

/**
 * Owner decision 2026-09-25 (server/no-board-address.ts): the business-wide no-board address
 * is retired and the admin view of a business no longer carries it (adminMerchantDto), so the
 * admin page has no "Payment URL" row that could only ever show a dash.
 */

jest.mock("wouter", () => ({ useLocation: () => ["/admin/merchants/1", jest.fn()] }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));

const fetchMock = global.fetch as jest.Mock;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/admin/merchants/1") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: "Jo Bloggs", businessName: "Corner Cafe", email: "jo@cafe.example", status: "active", windcaveApiConfigured: false }),
      };
    }
    if (url === "/api/admin/merchants/1/transactions") return { ok: true, status: 200, json: async () => [] };
    throw new Error(`unexpected fetch: ${url}`);
  });
});

it("shows a business without a Payment URL row", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MerchantDetail merchantId="1" />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Windcave integration")).toBeInTheDocument();
  expect(screen.queryByText("Payment URL")).toBeNull();
});
