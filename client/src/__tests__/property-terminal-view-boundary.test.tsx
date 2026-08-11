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
    fireEvent.click(screen.getByRole("button", { name: "send bill" }));
    expect(onSendBill).toHaveBeenCalledTimes(1);
  });
});
