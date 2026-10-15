import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BoardBuilder from "@/pages/board-builder";

/**
 * Owner decision 2026-09-25 (server/no-board-address.ts): the business-wide no-board QR is
 * retired, so the board builder — which emails a print-ready design to the print team — draws
 * a payment board's own QR, never the business's. It used to default to "Main Payment Link"
 * (/api/merchants/:id/qr), the printed no-board sticker; that address now answers 410, so the
 * print would carry no working QR at all.
 */

jest.mock("wouter", () => ({ useLocation: () => ["/board-builder", jest.fn()] }));
jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 1 }));
const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

const fetchMock = global.fetch as jest.Mock;
let boards: Array<{ id: number; name: string; stoneNumber: number; isActive: boolean }>;

function serve() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/templates/")) {
      return { ok: true, status: 200, text: async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' };
    }
    if (url === "/api/merchants/1/profile") return { ok: true, status: 200, json: async () => ({ businessName: "Corner Cafe" }) };
    if (url === "/api/merchants/1/tapt-stones") return { ok: true, status: 200, json: async () => boards };
    if (/^\/api\/merchants\/1\/(stone\/\d+\/)?qr/.test(url)) {
      return { ok: true, status: 200, blob: async () => new Blob(["png"], { type: "image/png" }) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function renderBuilder() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BoardBuilder />
    </QueryClientProvider>,
  );
}

const qrRequests = () => fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/qr"));

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  serve();
});

it("draws the business's first payment board's QR, never the business-wide one", async () => {
  boards = [
    { id: 7, name: "Counter", stoneNumber: 1, isActive: true },
    { id: 8, name: "Window", stoneNumber: 2, isActive: true },
  ];
  renderBuilder();

  await waitFor(() => expect(qrRequests()).toContain("/api/merchants/1/stone/7/qr?size=600"));
  expect(qrRequests().filter((url) => url.startsWith("/api/merchants/1/qr"))).toEqual([]);
  expect(await screen.findByText("✓ QR code loaded")).toBeInTheDocument();
});

it("with no payment boards, draws no QR, says to add a board, and offers no print", async () => {
  boards = [];
  renderBuilder();

  expect(await screen.findByText("No payment boards yet. Add one from the terminal first; its QR code goes on your print.")).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/merchants/1/tapt-stones", expect.anything()));
  expect(qrRequests()).toEqual([]);
  expect(screen.getByRole("button", { name: "Send to Print" })).toBeDisabled();
});
