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

function demoControl(container: HTMLElement, id: string): HTMLElement {
  const control = container.querySelector(`[data-demo-id="${id}"]`);
  expect(control).not.toBeNull();
  return control as HTMLElement;
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

  test("exposes stable root, mode, client, quick-invoice, and keypad anchors", () => {
    const onClientSelect = jest.fn();
    const { container, rerender } = render(<TradesTerminalView {...terminalProps({
      screen: "clients",
      allowQuickInvoice: true,
      onClientSelect,
    })} />);

    for (const id of [
      "trades-terminal",
      "trades-mode-clients",
      "trades-mode-quote",
      "trades-mode-invoice",
      "trades-mode-external",
      "trades-quick-invoice",
    ]) demoControl(container, id);
    fireEvent.click(demoControl(container, "trades-client-client-dave"));
    expect(onClientSelect).toHaveBeenCalledWith(client);

    const onAmountCommit = jest.fn();
    rerender(<TradesTerminalView {...terminalProps({
      screen: "amount",
      selectedClient: client,
      onAmountCommit,
    })} />);
    for (const id of ["trades-amount", "trades-key-back", "trades-amount-confirm"])
      demoControl(container, id);
    for (const digit of ["4", "8", "0", "0", "0"])
      fireEvent.click(demoControl(container, `trades-key-${digit}`));
    fireEvent.click(demoControl(container, "trades-amount-confirm"));
    expect(onAmountCommit).toHaveBeenCalledWith(48_000);
  });

  test("exposes fixed-client and quick-recipient invoice controls", () => {
    const onJobNoteChange = jest.fn();
    const onSplitEnabledChange = jest.fn();
    const onSendInvoice = jest.fn();
    const { container, rerender } = render(<TradesTerminalView {...terminalProps({
      screen: "invoice",
      selectedClient: client,
      amount: 48_000,
      onJobNoteChange,
      onSplitEnabledChange,
      onSendInvoice,
    })} />);

    demoControl(container, "trades-invoice-amount");
    fireEvent.change(demoControl(container, "trades-job-note"), {
      target: { value: "emergency callout" },
    });
    fireEvent.click(demoControl(container, "trades-split-toggle"));
    fireEvent.click(demoControl(container, "trades-invoice-send"));
    expect(onJobNoteChange).toHaveBeenCalledWith("emergency callout");
    expect(onSplitEnabledChange).toHaveBeenCalled();
    expect(onSendInvoice).toHaveBeenCalledTimes(1);

    rerender(<TradesTerminalView {...terminalProps({
      screen: "invoice",
      quickMode: true,
      amount: 48_000,
      recipient: {
        name: "Walk-in customer",
        email: "customer@example.test",
        phone: "0210000000",
        channel: "email",
      },
    })} />);
    for (const id of [
      "trades-recipient-name",
      "trades-recipient-channel-email",
      "trades-recipient-channel-sms",
      "trades-recipient-email",
    ]) demoControl(container, id);
    fireEvent.click(demoControl(container, "trades-recipient-channel-sms"));
  });

  test("QuoteView delegates semantic create and deposit actions without production providers", () => {
    const onCreate = jest.fn();
    const onDepositEnabledChange = jest.fn();
    const { container, rerender } = render(<QuoteView {...quoteProps({ onCreate, onDepositEnabledChange })} />);

    for (const id of [
      "trades-quote",
      "trades-quote-client",
      "trades-quote-line-0-description",
      "trades-quote-line-0-quantity",
      "trades-quote-line-0-price",
      "trades-quote-add-line",
      "trades-quote-deposit",
      "trades-quote-deposit-type",
      "trades-quote-deposit-value",
      "trades-quote-notes",
      "trades-quote-create",
    ]) demoControl(container, id);

    expect(screen.getAllByText("$240.00")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "create quote" }));
    expect(onCreate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "require deposit" }));
    expect(onDepositEnabledChange).toHaveBeenCalledWith(false);

    rerender(<QuoteView {...quoteProps({
      created: { delivered: true },
      publicUrl: "https://example.test/q/demo",
    })} />);
    for (const id of [
      "trades-quote",
      "trades-quote-copy",
      "trades-quote-pdf",
      "trades-quote-done",
    ]) demoControl(container, id);
  });
});
