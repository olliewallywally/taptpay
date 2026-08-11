import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  QuoteView,
  TradesTerminalView,
  type QuoteViewProps,
  type TradesTerminalViewProps,
} from "@/features/terminal/trades/TradesTerminalView";

const viewRoot = join(process.cwd(), "client/src/features/terminal/trades");
const viewSources = readdirSync(viewRoot)
  .filter(file => /\.(?:css|js|jsx|ts|tsx)$/.test(file) && !file.endsWith(".d.ts"))
  .map(file => ({ file, source: readFileSync(join(viewRoot, file), "utf8") }));

const forbidden = [
  { name: "routing", pattern: /from\s+["']wouter["']/ },
  { name: "TanStack Query", pattern: /@tanstack\/react-query/ },
  { name: "production API helper", pattern: /(?:queryClient|apiRequest|tradesFetch|tradesHeaders|sseClient)/ },
  { name: "auth", pattern: /(?:authToken|getCurrentMerchantId|\/lib\/auth)/ },
  { name: "network", pattern: /\b(?:fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/ },
  { name: "storage", pattern: /\b(?:localStorage|sessionStorage)\b/ },
  { name: "provider", pattern: /\b(?:PaymentRequest|ApplePaySession|GooglePay|Windcave)\b/ },
  { name: "clipboard", pattern: /navigator\s*\.\s*clipboard/ },
  { name: "navigation", pattern: /window\s*\.\s*(?:open|location)/ },
  { name: "PDF or document effect", pattern: /document\s*\.\s*(?:cookie|createElement)/ },
  { name: "external font", pattern: /fonts\.googleapis\.com/ },
];

const client = {
  id: "client-dave",
  firstName: "Dave",
  lastName: "Kerr",
  siteAddress: "12 Rimu Ave",
  preferredChannel: "email",
  email: "dave@example.test",
  status: "active",
};

function terminalProps(
  overrides: Partial<TradesTerminalViewProps> = {},
): TradesTerminalViewProps {
  const callback = jest.fn();
  return {
    screen: "home",
    contentKey: 0,
    conveyor: null,
    clients: [client],
    invoices: [],
    stackRows: [],
    outstanding: 0,
    selectedClient: null,
    amount: 0,
    jobNote: "",
    splitEnabled: false,
    quickMode: false,
    recipient: { name: "", email: "", phone: "", channel: "email" },
    allowQuickInvoice: false,
    successLabel: "",
    showAddClient: false,
    addClientState: "idle",
    banner: null,
    toastMessage: null,
    rowAction: null,
    quoteView: <div>quote fixture</div>,
    profileView: <div>profile fixture</div>,
    busy: { invoice: false, mark: false, row: false },
    onNavigate: callback,
    onClientSelect: callback,
    onQuickInvoice: callback,
    onAmountCommit: callback,
    onRecipientChange: callback,
    onJobNoteChange: callback,
    onSplitEnabledChange: callback,
    onSendInvoice: callback,
    onEditAmount: callback,
    onRowTap: callback,
    onMarkExternal: callback,
    onSubbarPick: callback,
    onSendShortcut: callback,
    onAddClient: callback,
    onCloseRow: callback,
    onSendBalance: callback,
    onCompleteRow: callback,
    onMarkRowReceived: callback,
    onVoidRow: callback,
    ...overrides,
  };
}

function quoteProps(overrides: Partial<QuoteViewProps> = {}): QuoteViewProps {
  const callback = jest.fn();
  return {
    clients: [client],
    clientId: client.id,
    lines: [{ id: 1, description: "Kitchen tap replacement", qty: "1", unitPrice: "240" }],
    depositEnabled: true,
    depositType: "percent",
    depositValue: "20",
    notes: "",
    created: null,
    error: "",
    gstRegistered: true,
    gstMode: "inclusive",
    totals: { total: 24_000, gst: 3_130, net: 20_870, deposit: 4_800 },
    publicUrl: "",
    isCreating: false,
    onClientIdChange: callback,
    onLineChange: callback,
    onRemoveLine: callback,
    onAddLine: callback,
    onDepositEnabledChange: callback,
    onDepositTypeChange: callback,
    onDepositValueChange: callback,
    onNotesChange: callback,
    onCreate: callback,
    onCopyLink: callback,
    onDownloadPdf: callback,
    onCancel: callback,
    onExit: callback,
    ...overrides,
  };
}

describe("TradesTerminalView extraction boundary", () => {
  test("contains no controller, network, auth, storage, provider, navigation, PDF, or external-font effect", () => {
    for (const { file, source } of viewSources) {
      for (const rule of forbidden) {
        expect({ file, boundary: rule.name, match: source.match(rule.pattern)?.[0] }).toEqual({
          file,
          boundary: rule.name,
          match: undefined,
        });
      }
    }
  });

  test("the production controller renders both extracted views and retains its API adapter", () => {
    const controller = readFileSync(
      join(process.cwd(), "client/src/pages/trades/trades-terminal.tsx"),
      "utf8",
    );
    expect(controller).toContain('from "@/features/terminal/trades/TradesTerminalView"');
    expect(controller).toContain("<TradesTerminalView");
    expect(controller).toContain("<QuoteView");
    for (const endpoint of [
      "/api/trades/clients",
      "/api/trades/invoices",
      "/api/trades/quotes",
    ]) expect(controller).toContain(endpoint);
  });

  test("delegates navigation from the real home control", () => {
    const onNavigate = jest.fn();
    render(<TradesTerminalView {...terminalProps({ onNavigate })} />);
    fireEvent.click(screen.getByRole("button", { name: "new invoice" }));
    expect(onNavigate).toHaveBeenCalledWith("clients");
  });

  test("QuoteView delegates semantic create and deposit actions without production providers", () => {
    const onCreate = jest.fn();
    const onDepositEnabledChange = jest.fn();
    render(<QuoteView {...quoteProps({ onCreate, onDepositEnabledChange })} />);

    expect(screen.getAllByText("$240.00")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "create quote" }));
    expect(onCreate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "require deposit" }));
    expect(onDepositEnabledChange).toHaveBeenCalledWith(false);
  });
});
