import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PropertyTerminalView,
  type PropertyTerminalViewProps,
} from "@/features/terminal/property/PropertyTerminalView";

const viewRoot = join(process.cwd(), "client/src/features/terminal/property");
const viewSources = readdirSync(viewRoot)
  .filter(file => /\.(?:js|jsx|ts|tsx)$/.test(file) && !file.endsWith(".d.ts"))
  .map(file => ({ file, source: readFileSync(join(viewRoot, file), "utf8") }));

const forbidden = [
  { name: "routing", pattern: /from\s+["']wouter["']/ },
  { name: "TanStack Query", pattern: /@tanstack\/react-query/ },
  { name: "production API helper", pattern: /(?:queryClient|apiRequest|propFetch|sseClient)/ },
  { name: "auth", pattern: /(?:authToken|getCurrentMerchantId|\/lib\/auth)/ },
  { name: "network", pattern: /\b(?:fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/ },
  { name: "storage", pattern: /\b(?:localStorage|sessionStorage)\b/ },
  { name: "provider", pattern: /\b(?:PaymentRequest|ApplePaySession|GooglePay|Windcave)\b/ },
  { name: "clipboard", pattern: /navigator\s*\.\s*clipboard/ },
  { name: "navigation", pattern: /window\s*\.\s*(?:open|location)/ },
  { name: "document effect", pattern: /document\s*\.\s*(?:cookie|createElement)/ },
  { name: "external font", pattern: /fonts\.googleapis\.com/ },
];

const tenant = {
  id: "tenant-mia",
  firstName: "Mia",
  lastName: "",
  propertyAddress: "18 Tui St",
  preferredChannel: "email",
  email: "mia@example.test",
};

function viewProps(
  overrides: Partial<PropertyTerminalViewProps> = {},
): PropertyTerminalViewProps {
  const callback = jest.fn();
  return {
    screen: "home",
    contentKey: 0,
    conveyor: null,
    tenants: [tenant],
    invoices: [],
    schedules: [],
    outstanding: 0,
    outstandingExpenses: 0,
    selectedTenant: null,
    amount: 0,
    amountDest: "send",
    frequency: "once",
    splitMode: false,
    chargeType: null,
    chargeLabel: "",
    dueSel: 7,
    chargeDocUrl: null,
    chargeDocName: "",
    uploadingDoc: false,
    reminderSettings: null,
    busyScheduleId: null,
    stackFilter: "all",
    remindMode: false,
    remindBusyId: null,
    feedOpen: false,
    successLabel: "",
    successKind: "rent",
    banner: null,
    toastMessage: null,
    rowAction: null,
    busy: { send: false, bill: false, mark: false, batch: false, row: false },
    onNavigate: callback,
    onTenantSelect: callback,
    onAmountCommit: callback,
    onEditAmount: callback,
    onSendRent: callback,
    onSendBill: callback,
    onFrequencyChange: callback,
    onToggleSplit: callback,
    onChargeTypeChange: callback,
    onChargeLabelChange: callback,
    onDueChange: callback,
    onUploadDocument: callback,
    onClearDocument: callback,
    onStackFilterChange: callback,
    onRemind: callback,
    onToggleFeed: callback,
    onRowTap: callback,
    onMarkExternal: callback,
    onBatchSend: callback,
    onPauseResume: callback,
    onCancelSchedule: callback,
    onUpdateReminders: callback,
    onSubbarPick: callback,
    onCloseRow: callback,
    onEditResend: callback,
    onResendRow: callback,
    onMarkRowReceived: callback,
    onVoidRow: callback,
    ...overrides,
  };
}

function demoControl(container: HTMLElement, id: string): HTMLElement {
  const control = container.querySelector(`[data-demo-id="${id}"]`);
  expect(control).not.toBeNull();
  return control as HTMLElement;
}

describe("PropertyTerminalView extraction boundary", () => {
  test("contains no controller, network, auth, storage, provider, navigation, or external-font effect", () => {
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

  test("the production controller renders the extracted view and retains its API adapter", () => {
    const controller = readFileSync(
      join(process.cwd(), "client/src/pages/property/property-terminal.tsx"),
      "utf8",
    );
    expect(controller).toContain('from "@/features/terminal/property/PropertyTerminalView"');
    expect(controller).toContain("<PropertyTerminalView");
    expect(controller).toContain("usePropertyTenants()");
    expect(controller).toContain("usePropertyInvoices()");
    for (const endpoint of [
      "/api/property/invoices",
      "/api/property/schedules",
      "/api/property/reminder-settings",
    ]) expect(controller).toContain(endpoint);
  });

  test("delegates navigation from the real home control", () => {
    const onNavigate = jest.fn();
    render(<PropertyTerminalView {...viewProps({ onNavigate })} />);
    fireEvent.click(screen.getByRole("button", { name: "new rent request" }));
    expect(onNavigate).toHaveBeenCalledWith("tenants");
  });

  test("exposes stable root, mode, tenant, and amount-keypad anchors", () => {
    const onTenantSelect = jest.fn();
    const { container, rerender } = render(<PropertyTerminalView {...viewProps({
      screen: "tenants",
      onTenantSelect,
    })} />);

    for (const id of [
      "property-terminal",
      "property-mode-tenants",
      "property-mode-send",
      "property-mode-bill",
      "property-mode-external",
    ]) demoControl(container, id);
    fireEvent.click(demoControl(container, "property-tenant-tenant-mia"));
    expect(onTenantSelect).toHaveBeenCalledWith(tenant, 0);

    const onAmountCommit = jest.fn();
    rerender(<PropertyTerminalView {...viewProps({
      screen: "amount",
      selectedTenant: tenant,
      amountDest: "send",
      onAmountCommit,
    })} />);
    for (const id of ["property-amount", "property-key-back", "property-amount-confirm"])
      demoControl(container, id);
    for (const digit of ["6", "2", "0", "0", "0"])
      fireEvent.click(demoControl(container, `property-key-${digit}`));
    fireEvent.click(demoControl(container, "property-amount-confirm"));
    expect(onAmountCommit).toHaveBeenCalledWith(62_000, "send");
  });

  test("exposes deterministic rent controls and delegates weekly send", () => {
    const onFrequencyChange = jest.fn();
    const onSendRent = jest.fn();
    const { container } = render(<PropertyTerminalView {...viewProps({
      screen: "send",
      selectedTenant: tenant,
      amount: 62_000,
      onFrequencyChange,
      onSendRent,
    })} />);

    demoControl(container, "property-rent-amount");
    fireEvent.click(demoControl(container, "property-rent-frequency-weekly"));
    fireEvent.click(demoControl(container, "property-rent-send"));
    expect(onFrequencyChange).toHaveBeenCalledWith("weekly");
    expect(onSendRent).toHaveBeenCalledTimes(1);
  });

  test("renders the deterministic bill fixture and delegates its semantic commit", () => {
    const onSendBill = jest.fn();
    render(<PropertyTerminalView {...viewProps({
      screen: "bill",
      selectedTenant: tenant,
      amount: 8_640,
      amountDest: "bill",
      chargeType: "utilities",
      chargeLabel: "Water / utilities",
      chargeDocUrl: "/demo/water-invoice.pdf",
      chargeDocName: "water-invoice.pdf",
      onSendBill,
    })} />);
    expect(screen.getByText("water-invoice.pdf")).toBeInTheDocument();
    const terminal = screen.getByText("water-invoice.pdf").closest("[data-demo-id='property-terminal']");
    expect(terminal).not.toBeNull();
    const container = terminal as HTMLElement;
    for (const id of [
      "property-bill-amount",
      "property-bill-type-utilities",
      "property-bill-type-late_fee",
      "property-bill-type-cleaning",
      "property-bill-type-damages",
      "property-bill-type-other",
      "property-bill-description",
      "property-bill-document",
      "property-bill-due-0",
      "property-bill-due-7",
      "property-bill-due-14",
      "property-bill-split-toggle",
      "property-bill-send",
    ]) demoControl(container, id);
    fireEvent.click(demoControl(container, "property-bill-send"));
    expect(onSendBill).toHaveBeenCalledTimes(1);
  });
});
