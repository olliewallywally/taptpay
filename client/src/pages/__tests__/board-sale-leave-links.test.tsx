/*
 * Owner decision 2026-09-25 (server/no-board-address.ts): the business-wide
 * no-board page is retired, and no live screen hands its address out. Two
 * customer screens still did: a numbered (board) sale's checkout sent "Cancel
 * payment" to /pay/<business>, and the payment result's "Try Again" fell back
 * to it. A board sale's customer goes back to their board's page; with no
 * board, nowhere is the retired page.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Checkout from "@/pages/checkout";
import PaymentResult from "@/pages/payment-result";

let mockParams: Record<string, string> = {};
let mockSearch = "";
const mockSetLocation = jest.fn();
jest.mock("wouter", () => ({
  useParams: () => mockParams,
  useLocation: () => ["/", mockSetLocation],
  useSearch: () => mockSearch,
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

function serve(sale: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/transactions/5") return reply(sale);
    return reply({});
  });
}

function renderPage(page: JSX.Element) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      {page}
    </QueryClientProvider>,
  );
}

const boardSale = {
  id: 5,
  merchantId: 1,
  taptStoneId: 3,
  itemName: "Coffee",
  price: "5.00",
  status: "pending",
  splitEnabled: false,
};

beforeEach(() => {
  fetchMock.mockReset();
  mockSetLocation.mockClear();
  mockParams = { transactionId: "5" };
  mockSearch = "";
});

describe("leaving a board sale's checkout", () => {
  it("goes back to the board's page, never the retired business-wide page", async () => {
    serve(boardSale);
    renderPage(<Checkout sourceKind="retail-legacy" />);

    await userEvent.click(await screen.findByRole("button", { name: "Cancel payment" }));

    expect(mockSetLocation).toHaveBeenCalledWith("/pay/1/stone/3");
    expect(mockSetLocation).not.toHaveBeenCalledWith("/pay/1");
  });
});

describe("trying again from a declined board sale", () => {
  it("goes back to the board's page", async () => {
    serve({ ...boardSale, status: "failed" });
    mockSearch = "status=declined";
    renderPage(<PaymentResult />);

    await userEvent.click(await screen.findByTestId("button-try-again"));

    expect(mockSetLocation).toHaveBeenCalledWith("/pay/1/stone/3");
  });

  it("with no board, never offers the retired business-wide page", async () => {
    serve({ ...boardSale, taptStoneId: null, status: "failed" });
    mockSearch = "status=declined";
    renderPage(<PaymentResult />);

    await userEvent.click(await screen.findByTestId("button-try-again"));

    expect(mockSetLocation).not.toHaveBeenCalledWith("/pay/1");
  });
});
