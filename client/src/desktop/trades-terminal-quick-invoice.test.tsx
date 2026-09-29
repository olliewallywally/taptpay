/*
 * The desktop trades terminal's quick invoice: after sending one to someone who is
 * not yet a client, "add client" saves them as one. It posted to
 * /api/trades/clients//promote, with the client id missing, so it could never work.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopTradesTerminal from "./pages/trades-terminal";

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 77 }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url === "/api/trades/invoices") {
      return reply({ id: "inv-9", clientProfileId: "prospect-9", amountCents: 12_000, status: "dispatched" });
    }
    if (method === "POST" && url.endsWith("/promote")) return reply({ id: "prospect-9", status: "active" });
    if (url === "/api/trades/reminder-settings") return reply({ tradeRemindersEnabled: true });
    if (url === "/api/merchants/77/profile") return reply({ id: 77, businessName: "Test Trades" });
    return reply([]);
  });
  localStorage.setItem("authToken", "h.e30.s");
  window.history.pushState({}, "", "/trades/terminal?quick=1");
});

afterEach(() => {
  window.history.pushState({}, "", "/");
});

it("add client saves the quick invoice's customer as a client", async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <DesktopTradesTerminal deviceClass="desktop" />
    </QueryClientProvider>,
  );
  await settle();

  await userEvent.type(screen.getByRole("textbox", { name: "customer name" }), "Hemi Walker");
  await userEvent.type(screen.getByRole("textbox", { name: "customer email" }), "hemi@example.invalid");
  await userEvent.click(screen.getByRole("button", { name: "edit>" }));
  for (const key of ["1", "2", "0"]) await userEvent.click(screen.getByRole("button", { name: key }));
  await userEvent.click(screen.getByRole("button", { name: "confirm amount" }));
  await userEvent.click(screen.getByRole("button", { name: "send quick invoice" }));
  await settle();

  await userEvent.click(screen.getByRole("button", { name: "add client" }));
  await settle();

  const promoteUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("promote"));
  expect(promoteUrls).toEqual(["/api/trades/clients/prospect-9/promote"]);
  expect(screen.getByRole("button", { name: "client saved ✓" })).toBeDisabled();
});
