import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  TradesDashboardView,
  type TradesDashboardViewProps,
} from "@/features/dashboard/TradesDashboardView";

const viewPath = path.resolve(
  process.cwd(),
  "client/src/features/dashboard/TradesDashboardView.tsx",
);
const adapterPath = path.resolve(
  process.cwd(),
  "client/src/pages/trades/trades-dashboard.tsx",
);
const forbidden = [
  /@tanstack\/react-query/,
  /@\/lib\/trades-api/,
  /@\/components\/reports/,
  /\bwouter\b|\buseLocation\b/,
  /\bfetch\s*\(|\bapiRequest\b/,
  /\blocalStorage\b|\bsessionStorage\b/,
];

const baseProps = (
  overrides: Partial<TradesDashboardViewProps> = {},
): TradesDashboardViewProps => ({
  clients: [
    { id: 1, name: "Dave Kerr", siteAddress: "12 Rimu Ave", status: "active" },
  ],
  invoices: [],
  invoiceLoading: false,
  invoiceError: false,
  siteFilter: null,
  onSiteFilterChange: jest.fn(),
  onRetryInvoices: jest.fn(),
  onNavigate: jest.fn(),
  reportsControl: <button type="button">reports</button>,
  ...overrides,
});

describe("TradesDashboardView extraction boundary", () => {
  test("keeps production queries, reports, navigation, and storage out of the view", () => {
    const source = fs.readFileSync(viewPath, "utf8");
    for (const rule of forbidden) expect(source).not.toMatch(rule);

    const adapter = fs.readFileSync(adapterPath, "utf8");
    expect(adapter).toContain("<TradesDashboardView");
    expect(adapter).toContain("tradesFetch");
    expect(adapter).toContain("TradesReportsButton");
  });

  test("renders resolved client state and delegates route actions", () => {
    const onNavigate = jest.fn();
    render(<TradesDashboardView {...baseProps({ onNavigate })} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "new quote" }));
    expect(onNavigate).toHaveBeenCalledWith("/trades/quote");
  });

  test("delegates site selection and retry without owning an API", () => {
    const onSiteFilterChange = jest.fn();
    const onRetryInvoices = jest.fn();
    render(
      <TradesDashboardView
        {...baseProps({
          invoiceError: true,
          onSiteFilterChange,
          onRetryInvoices,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(onRetryInvoices).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /all sites/i }));
    fireEvent.click(screen.getByRole("button", { name: "12 Rimu Ave" }));
    expect(onSiteFilterChange).toHaveBeenCalledWith("12 Rimu Ave");
  });
});
