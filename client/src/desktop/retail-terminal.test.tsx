import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopRetailTerminal from "./pages/retail-terminal";

const mockToast = jest.fn();

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 77 }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

interface BoardFixture {
  id: number;
  name: string;
  stoneNumber: number;
  paymentUrl?: string;
  qrCodeUrl?: string;
}

type Handler = (body: Record<string, unknown>) => Response | Promise<Response>;

const fetchMock = global.fetch as jest.Mock;
const mockWriteText = jest.fn();
const mockOpen = jest.fn();
let boards: BoardFixture[];
let saleBodies: Record<string, unknown>[];
let boardBodies: Record<string, unknown>[];
let boardGetCount: number;
let renameBodies: Record<string, unknown>[];
let saleHandler: Handler;
let boardHandler: Handler;
let renameHandler: Handler;

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function installFetchMock() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/merchants/77/profile") {
      return jsonResponse({
        id: 77,
        businessName: "Test Shop",
        paymentUrl: "https://merchant.example/pay/77",
        qrCodeUrl: "https://merchant.example/pay/77/qr",
      });
    }
    if (method === "GET" && url === "/api/merchants/77/transactions") {
      return jsonResponse([]);
    }
    if (method === "GET" && url === "/api/merchants/77/stock-items") {
      return jsonResponse([]);
    }
    if (method === "GET" && url === "/api/merchants/77/tapt-stones") {
      boardGetCount += 1;
      return jsonResponse(boards);
    }
    if (method === "POST" && url === "/api/transactions") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      saleBodies.push(body);
      return saleHandler(body);
    }
    if (method === "POST" && url === "/api/merchants/77/tapt-stones") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      boardBodies.push(body);
      return boardHandler(body);
    }
    const renameMatch = url.match(/^\/api\/merchants\/77\/tapt-stones\/(\d+)$/);
    if (method === "PUT" && renameMatch) {
      const id = Number(renameMatch[1]);
      const body = JSON.parse(String(init?.body ?? "{}"));
      renameBodies.push({ id, ...body });
      /* Persist into the fixture, as the real server does — the component
         invalidates after a rename, so a non-persisting mock would refetch the
         old name and mask a working update. */
      const target = boards.find((board) => board.id === id);
      if (target && typeof body.name === "string") target.name = body.name;
      return renameHandler(body);
    }
    throw new Error(`Unhandled test request: ${method} ${url}`);
  });
}

function renderTerminal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const user = userEvent.setup();
  /* userEvent installs its own clipboard stub during setup; replace it with the
     assertion spy the component will call at click time. */
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mockWriteText },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <DesktopRetailTerminal deviceClass="desktop" />
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient, user };
}

async function enterFiveDollarSale(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click(screen.getByRole("button", { name: "keypad" }));
  await user.click(screen.getByRole("button", { name: /^\$5$/ }));
  await user.click(screen.getByRole("button", { name: "confirm amount" }));
  await user.clear(screen.getByRole("textbox", { name: "item name" }));
  await user.type(screen.getByRole("textbox", { name: "item name" }), item);
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, "open", { configurable: true, value: mockOpen });

  boards = [
    {
      id: 11,
      name: "Counter board",
      stoneNumber: 1,
      paymentUrl: "https://board.example/11",
      qrCodeUrl: "https://board.example/11/qr",
    },
    {
      id: 22,
      name: "Window board",
      stoneNumber: 2,
      paymentUrl: "https://board.example/22",
      qrCodeUrl: "https://board.example/22/qr",
    },
  ];
  saleBodies = [];
  boardBodies = [];
  renameBodies = [];
  boardGetCount = 0;
  saleHandler = () =>
    jsonResponse({
      id: 1,
      paymentUrl: "https://private.example/sale-1",
      qrCodeUrl: "https://private.example/sale-1/qr",
    });
  boardHandler = () => jsonResponse({});
  renameHandler = (body) => jsonResponse(body);
  installFetchMock();
});

/* The picker is progressive disclosure: engaging boards reveals the picker
   button, and opening the list is a second, deliberate click. */
async function openBoardPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "payment boards" }));
  await user.click(screen.getByRole("button", { name: "select board" }));
}

describe("desktop retail terminal payment destinations", () => {
  it("defaults to no board and sends per-payment mode without a selected board", async () => {
    const { user } = renderTerminal();
    /* Boards start disengaged: neither the picker nor the list exists, so there
       is no board the sale could silently fall back to. */
    const toggle = screen.getByRole("button", { name: "payment boards" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "select board" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "payment boards" })).not.toBeInTheDocument();

    await enterFiveDollarSale(user, "No-board coffee");
    await user.click(screen.getByRole("button", { name: "send payment" }));

    expect(await screen.findByTitle("https://private.example/sale-1")).toBeInTheDocument();
    expect(saleBodies).toEqual([
      {
        merchantId: 77,
        itemName: "No-board coffee",
        price: "5.00",
        status: "pending",
        splitEnabled: false,
        linkMode: "per_payment",
      },
    ]);
    expect(saleBodies[0]).not.toHaveProperty("selectedStoneId");
    expect(screen.queryByText(/merchant\.example\/pay\/77/)).not.toBeInTheDocument();
  });

  it("clears the old credential before a second attempt and shares only the second response", async () => {
    const second = deferred<Response>();
    let requestNumber = 0;
    saleHandler = () => {
      requestNumber += 1;
      return requestNumber === 1
        ? jsonResponse({
            id: 1,
            paymentUrl: "https://private.example/first",
            qrCodeUrl: "https://private.example/first/qr",
          })
        : second.promise;
    };
    const { user } = renderTerminal();

    await enterFiveDollarSale(user, "First sale");
    await user.click(screen.getByRole("button", { name: "send payment" }));
    expect(await screen.findByTitle("https://private.example/first")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "start new sale" }));
    expect(screen.queryByTitle("https://private.example/first")).not.toBeInTheDocument();
    await enterFiveDollarSale(user, "Second sale");
    await user.click(screen.getByRole("button", { name: "send payment" }));
    expect(screen.getByRole("button", { name: "send payment" })).toHaveAttribute("aria-busy", "true");
    await user.click(screen.getByRole("button", { name: "share payment link" }));
    expect(screen.getByRole("status")).toHaveTextContent("No current sale link");
    expect(screen.queryByTitle("https://private.example/first")).not.toBeInTheDocument();

    await act(async () => {
      second.resolve(
        jsonResponse({
          id: 2,
          paymentUrl: "https://private.example/second",
          qrCodeUrl: "https://private.example/second/qr",
        }),
      );
      await second.promise;
    });

    expect(await screen.findByTitle("https://private.example/second")).toBeInTheDocument();
    expect(screen.queryByTitle("https://private.example/first")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "copy link" }));
    await user.click(screen.getByRole("button", { name: "email" }));
    await user.click(screen.getByRole("button", { name: "sms" }));
    await user.click(screen.getByRole("button", { name: "QR code" }));

    expect(mockWriteText).toHaveBeenCalledWith("https://private.example/second");
    expect(mockOpen.mock.calls[0][0]).toContain(encodeURIComponent("https://private.example/second"));
    expect(mockOpen.mock.calls[1][0]).toContain(encodeURIComponent("https://private.example/second"));
    expect(mockOpen.mock.calls[2][0]).toBe("https://private.example/second/qr");
  });

  it("sends a concrete board ID in legacy mode without any first-board fallback", async () => {
    saleHandler = () =>
      jsonResponse({
        id: 3,
        paymentUrl: "https://response.example/board-22-sale",
        qrCodeUrl: "https://response.example/board-22-sale/qr",
      });
    const { user } = renderTerminal();
    await openBoardPicker(user);
    const windowBoard = await screen.findByRole("radio", { name: "Window board, board 2" });

    windowBoard.focus();
    await user.keyboard(" ");
    /* Choosing closes the list and the picker button takes the board's name. */
    expect(
      screen.getByRole("button", { name: "selected board: Window board" }),
    ).toHaveAttribute("aria-expanded", "false");
    await enterFiveDollarSale(user, "Window sale");
    await user.click(screen.getByRole("button", { name: "send payment" }));

    expect(await screen.findByTitle("https://response.example/board-22-sale")).toBeInTheDocument();
    expect(saleBodies[0]).toMatchObject({ selectedStoneId: 22, linkMode: "legacy" });
    expect(saleBodies[0]).not.toHaveProperty("selectedStoneId", 11);
    await user.click(screen.getByRole("button", { name: "copy link" }));
    expect(mockWriteText).toHaveBeenCalledWith("https://response.example/board-22-sale");
    expect(mockWriteText).not.toHaveBeenCalledWith("https://board.example/22");
  });

  it("creates a board, updates the live list and auto-selects the returned board", async () => {
    const created = {
      id: 33,
      /* The server honours the name sent on create, so the row comes back
         named — not as the auto "Stone 3" fallback. */
      name: "Patio board",
      stoneNumber: 3,
      paymentUrl: "https://board.example/33",
      qrCodeUrl: "https://board.example/33/qr",
    };
    const pending = deferred<Response>();
    boardHandler = () => pending.promise;
    const { user } = renderTerminal();
    await openBoardPicker(user);
    await screen.findByRole("radio", { name: "Counter board, board 1" });

    await user.click(screen.getByRole("button", { name: "create new board" }));
    const nameField = screen.getByRole("textbox", { name: "new board name" });
    await user.type(nameField, "Patio board{Enter}");
    /* The name rides along on the create call — no follow-up rename. */
    expect(boardBodies).toEqual([{ name: "Patio board" }]);
    expect(renameBodies).toEqual([]);

    boards.push(created);
    await act(async () => {
      pending.resolve(jsonResponse(created));
      await pending.promise;
    });

    /* Creating selects the new board and closes the list, so its name is what
       the picker button now shows. */
    expect(
      await screen.findByRole("button", { name: "selected board: Patio board" }),
    ).toBeInTheDocument();
  });

  it("renames a board in place and keeps the picker label in step", async () => {
    const { user } = renderTerminal();
    await openBoardPicker(user);
    await user.click(await screen.findByRole("radio", { name: "Counter board, board 1" }));
    await user.click(screen.getByRole("button", { name: "selected board: Counter board" }));

    await user.click(screen.getByRole("button", { name: "rename Counter board" }));
    const field = screen.getByRole("textbox", { name: "rename Counter board" });
    await user.clear(field);
    await user.type(field, "Front counter{Enter}");

    await waitFor(() => expect(renameBodies).toEqual([{ id: 11, name: "Front counter" }]));
    expect(
      await screen.findByRole("button", { name: "selected board: Front counter" }),
    ).toBeInTheDocument();
  });

  it("discards a rename on Escape without calling the server", async () => {
    const { user } = renderTerminal();
    await openBoardPicker(user);
    await user.click(screen.getByRole("button", { name: "rename Counter board" }));
    const field = await screen.findByRole("textbox", { name: "rename Counter board" });
    await user.clear(field);
    await user.type(field, "Abandoned{Escape}");

    expect(renameBodies).toEqual([]);
    expect(await screen.findByRole("radio", { name: "Counter board, board 1" })).toBeInTheDocument();
  });

  it("refreshes after a 409 and surfaces the exact server message", async () => {
    boardHandler = () =>
      jsonResponse(
        { message: "A tapt stone with that number already exists", code: "TAPT_STONE_CONFLICT" },
        409,
      );
    const { user } = renderTerminal();
    await openBoardPicker(user);
    await screen.findByRole("radio", { name: "Counter board, board 1" });
    const readsBefore = boardGetCount;

    await user.click(screen.getByRole("button", { name: "create new board" }));
    await user.type(screen.getByRole("textbox", { name: "new board name" }), "Clash{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A tapt stone with that number already exists",
    );
    await waitFor(() => expect(boardGetCount).toBeGreaterThan(readsBefore));
  });

  it("disables creation at ten boards and displays the exact capacity error", async () => {
    boards = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      name: `Board ${index + 1}`,
      stoneNumber: index + 1,
    }));
    const { user } = renderTerminal();
    await openBoardPicker(user);
    await screen.findByRole("radio", { name: "Board 10, board 10" });

    expect(screen.getByRole("button", { name: "create new board" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Maximum 10 tapt stones allowed per merchant",
    );
  });

  it("announces pending and failed sale creation without exposing a fallback link", async () => {
    const pending = deferred<Response>();
    saleHandler = () => pending.promise;
    const { user } = renderTerminal();
    await enterFiveDollarSale(user, "Failure case");
    await user.click(screen.getByRole("button", { name: "send payment" }));

    const sendButton = screen.getByRole("button", { name: "send payment" });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Creating a private payment link");

    await act(async () => {
      pending.resolve(jsonResponse({ message: "Gateway unavailable" }, 503));
      await pending.promise;
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Gateway unavailable");
    expect(screen.queryByText(/merchant\.example\/pay\/77/)).not.toBeInTheDocument();
  });

  it("rejects a successful response that omits one-time share credentials", async () => {
    saleHandler = () => jsonResponse({ id: 8, paymentUrl: null, qrCodeUrl: null });
    const { user } = renderTerminal();
    await enterFiveDollarSale(user, "Missing response link");
    await user.click(screen.getByRole("button", { name: "send payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The sale was created, but its private share link was not returned",
    );
    expect(screen.queryByText(/merchant\.example\/pay\/77/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "copy link" })).not.toBeInTheDocument();
  });
});
