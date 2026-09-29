/*
 * R1-T8 — the seven merchant pages that crashed when the session ended while
 * they were open. Each returned early ("no merchant: go to login") before most
 * of its hooks, so the next render ran fewer hooks and React threw "Rendered
 * fewer hooks than expected". For each page: the session ending mid-view, a page
 * opened with no session, a change of merchant, and unmounting — with no React
 * error of any kind, and the page leaving for /login exactly as it did before.
 */
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationProvider } from "@/components/notification-system";
import { TutorialProvider } from "@/features/tutorial/tutorial";
import { getCurrentMerchantId } from "@/lib/auth";
import Exports from "../exports";
import MerchantTerminal from "../merchant-terminal";
import MerchantTerminalMobile from "../merchant-terminal-mobile";
import PaymentStack from "../payment-stack";
import Settings from "../settings";
import StockManagement from "../stock-management";
import Transactions from "../transactions";

jest.mock("@/lib/auth", () => ({
  getCurrentMerchantId: jest.fn(),
  isAuthenticated: jest.fn(() => true),
  logout: jest.fn(),
}));
jest.mock("@/lib/sse-client", () => ({
  sseClient: {
    connect: jest.fn(), connectCustomer: jest.fn(), connectMerchant: jest.fn(),
    disconnect: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(),
  },
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("recharts", () => ({
  LineChart: ({ children }: any) => <div>{children}</div>, Line: () => null, XAxis: () => null,
  YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("@/components/qr-code-display", () => ({ QRCodeDisplay: () => <div>QR Code</div> }));

const signedIn = getCurrentMerchantId as jest.Mock;

/**
 * How each page leaves when there is no merchant — unchanged by R1-T8:
 * "route" is in-app navigation, "document" a full page load of /login.
 */
const PAGES = [
  { name: "Settings", Page: Settings, leaves: "route", shows: null },
  { name: "Transactions", Page: Transactions, leaves: "route", shows: null },
  { name: "StockManagement", Page: StockManagement, leaves: "route", shows: null },
  { name: "Exports", Page: Exports, leaves: "document", shows: "Redirecting to login..." },
  { name: "MerchantTerminal", Page: MerchantTerminal, leaves: "document", shows: "Redirecting to login..." },
  { name: "MerchantTerminalMobile", Page: MerchantTerminalMobile, leaves: "document", shows: "Redirecting to login..." },
  { name: "PaymentStack", Page: PaymentStack, leaves: "document", shows: null },
] as const;

/** The shape each endpoint answers with — enough for every page to render its loaded state. */
function syntheticResponse(url: string): unknown {
  const path = url.split("?")[0];
  if (/\/(?:transactions|stock-items|tapt-stones)$/.test(path)) return [];
  if (/\/active-transaction$/.test(path)) return null;
  if (/\/analytics\/export$/.test(path)) return { totalTransactions: 0, completedTransactions: 0, totalRevenue: 0 };
  const merchant = /^\/api\/merchants\/(\d+)(?:\/profile)?$/.exec(path);
  if (merchant) return { id: Number(merchant[1]), name: "Synthetic Merchant", businessName: "Synthetic Merchant" };
  return {};
}

let consoleErrors: unknown[][];
let fetchMock: jest.Mock;
beforeEach(() => {
  consoleErrors = [];
  jest.spyOn(console, "error").mockImplementation((...args) => { consoleErrors.push(args); });
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  fetchMock = jest.fn(async (url: unknown) => ({
    ok: true, status: 200, json: async () => syntheticResponse(String(url)),
  }));
  global.fetch = fetchMock as any;
});
afterEach(() => jest.restoreAllMocks());

const describeArgs = (args: unknown[]) => args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
/** jsdom implements no document navigation; it reports each attempt as an error instead. */
const isJsdomNavigation = (args: unknown[]) => describeArgs(args).includes("Not implemented: navigation");
const jsdomNavigations = () => consoleErrors.filter(isJsdomNavigation).length;
/** Everything else logged as an error: React's warnings, render errors, act() complaints. */
const unexpectedErrors = () => consoleErrors.filter((args) => !isJsdomNavigation(args)).map(describeArgs);
const fetchedFor = (merchantId: number) =>
  fetchMock.mock.calls.some(([url]) => String(url).startsWith(`/api/merchants/${merchantId}/`)
    || String(url) === `/api/merchants/${merchantId}`);

function renderPage(Page: React.ComponentType) {
  const location = memoryLocation({ path: "/start", record: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const ui = () => (
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <TutorialProvider enabled={false}>
          <NotificationProvider>
            <TooltipProvider>
              <Page />
            </TooltipProvider>
          </NotificationProvider>
        </TutorialProvider>
      </Router>
    </QueryClientProvider>
  );
  const view = render(ui());
  return { location, rerender: () => view.rerender(ui()), unmount: view.unmount };
}

/** Let queries resolve and effects run inside act(), so React has nothing to warn about. */
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

function expectLeftForLogin(location: ReturnType<typeof memoryLocation>, leaves: "route" | "document") {
  if (leaves === "route") {
    expect(location.history).toEqual(["/start", "/login"]);
    expect(jsdomNavigations()).toBe(0);
  } else {
    expect(location.history).toEqual(["/start"]);
    expect(jsdomNavigations()).toBe(1);
  }
}

describe.each(PAGES)("$name", ({ Page, leaves, shows }) => {
  it("keeps its hooks in order when the session ends while it is open, and leaves for /login", async () => {
    signedIn.mockReturnValue(22);
    const view = renderPage(Page);
    await settle();
    expect(fetchedFor(22)).toBe(true);
    expect(view.location.history).toEqual(["/start"]);

    signedIn.mockReturnValue(null);
    expect(() => view.rerender()).not.toThrow();
    await settle();

    expectLeftForLogin(view.location, leaves);
    expect(unexpectedErrors()).toEqual([]);
  });

  it("opened with no session, renders nothing of the page and leaves for /login", async () => {
    signedIn.mockReturnValue(null);
    const view = renderPage(Page);
    await settle();
    if (shows) expect(screen.getByText(shows)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expectLeftForLogin(view.location, leaves);
    expect(unexpectedErrors()).toEqual([]);
  });

  it("loads the new merchant's data, without an error, when the signed-in merchant changes", async () => {
    signedIn.mockReturnValue(22);
    const view = renderPage(Page);
    await settle();
    signedIn.mockReturnValue(23);
    expect(() => view.rerender()).not.toThrow();
    await settle();
    expect(fetchedFor(23)).toBe(true);
    expect(view.location.history).toEqual(["/start"]);
    expect(unexpectedErrors()).toEqual([]);
  });

  it("unmounts cleanly", async () => {
    signedIn.mockReturnValue(22);
    const view = renderPage(Page);
    await settle();
    view.unmount();
    await settle();
    expect(view.location.history).toEqual(["/start"]);
    expect(unexpectedErrors()).toEqual([]);
  });
});
