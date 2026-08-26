import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  PropertyDashboardView,
  type PropertyDashboardViewProps,
} from "@/features/dashboard/PropertyDashboardView";

const viewPath = path.resolve(
  process.cwd(),
  "client/src/features/dashboard/PropertyDashboardView.tsx",
);
const adapterPath = path.resolve(
  process.cwd(),
  "client/src/pages/property/property-dashboard.tsx",
);

const forbidden = [
  /@tanstack\/react-query/,
  /@\/lib\/property-data/,
  /@\/components\/reports/,
  /\bwouter\b|\buseLocation\b/,
  /\bfetch\s*\(|\bapiRequest\b/,
  /\blocalStorage\b|\bsessionStorage\b/,
];

const baseProps = (
  overrides: Partial<PropertyDashboardViewProps> = {},
): PropertyDashboardViewProps => ({
  tenants: [
    { id: 1, name: "Mia", propertyAddress: "18 Tui St", status: "active" },
  ],
  invoices: [],
  invoiceLoading: false,
  invoiceError: false,
  propertyFilter: null,
  onPropertyFilterChange: jest.fn(),
  onRetryInvoices: jest.fn(),
  onNavigate: jest.fn(),
  reportsControl: <button type="button">reports</button>,
  ...overrides,
});

describe("PropertyDashboardView extraction boundary", () => {
  test("keeps production queries, reports, navigation, and storage out of the view", () => {
    const source = fs.readFileSync(viewPath, "utf8");
    for (const rule of forbidden) expect(source).not.toMatch(rule);

    const adapter = fs.readFileSync(adapterPath, "utf8");
    expect(adapter).toContain("<PropertyDashboardView");
    expect(adapter).toContain("usePropertyInvoices");
    expect(adapter).toContain("PropertyReportsButton");
  });

  test("renders deterministic resolved rows and delegates route actions", () => {
    const onNavigate = jest.fn();
    render(<PropertyDashboardView {...baseProps({ onNavigate })} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "set up rent payment" }));
    expect(onNavigate).toHaveBeenCalledWith("/property/terminal?screen=tenants");
  });

  test("delegates scope selection and retry without owning an API", () => {
    const onPropertyFilterChange = jest.fn();
    const onRetryInvoices = jest.fn();
    render(
      <PropertyDashboardView
        {...baseProps({
          invoiceError: true,
          onPropertyFilterChange,
          onRetryInvoices,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(onRetryInvoices).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /all properties/i }));
    fireEvent.click(screen.getByRole("button", { name: "18 Tui St" }));
    expect(onPropertyFilterChange).toHaveBeenCalledWith("18 Tui St");
  });
});
