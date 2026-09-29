import fs from "node:fs";
import path from "node:path";

import { configure, fireEvent, render, screen } from "@testing-library/react";

import {
  RetailDashboardView,
  type RetailDashboardViewProps,
} from "@/features/dashboard/RetailDashboardView";

configure({ testIdAttribute: "data-demo-id" });

const viewSourcePath = path.resolve(
  process.cwd(),
  "client/src/features/dashboard/RetailDashboardView.tsx",
);
const viewStylesPath = path.resolve(
  process.cwd(),
  "client/src/features/dashboard/retail-dashboard-view.css",
);
const adapterSourcePath = path.resolve(process.cwd(), "client/src/pages/dashboard.tsx");

const forbiddenViewPatterns = [
  /@tanstack\/react-query/,
  /@\/components\/reports/,
  /@\/lib\/auth/,
  /wouter/,
  /useLocation/,
  /\bfetch\s*\(/,
  /apiRequest/,
  /localStorage/,
  /sessionStorage/,
  /EventSource/,
  /window\.location/,
  /window\.open/,
  /navigator\.clipboard/,
];

function makeProps(
  overrides: Partial<RetailDashboardViewProps> = {},
): RetailDashboardViewProps {
  return {
    merchant: { status: "active" },
    transactions: [
      {
        status: "completed",
        price: "12.50",
        createdAt: "2026-08-07T08:00:00.000Z",
      },
      {
        status: "completed",
        price: "7.50",
        createdAt: "2026-08-06T08:00:00.000Z",
      },
      {
        status: "pending",
        price: "3.00",
        createdAt: "2026-08-07T09:00:00.000Z",
      },
      {
        status: "completed",
        price: "10.00",
        createdAt: "2026-07-31T08:00:00.000Z",
      },
    ],
    transactionLoading: false,
    transactionError: false,
    reportsControl: <button type="button">Reports</button>,
    now: new Date("2026-08-07T12:00:00.000Z"),
    onRetryTransactions: jest.fn(),
    onNavigate: jest.fn(),
    ...overrides,
  };
}

describe("RetailDashboardView boundary", () => {
  it("keeps providers, storage, reports, fetching, and routing in the production adapter", () => {
    const viewSource = fs.readFileSync(viewSourcePath, "utf8");
    const viewStyles = fs.readFileSync(viewStylesPath, "utf8");
    const adapterSource = fs.readFileSync(adapterSourcePath, "utf8");

    for (const pattern of forbiddenViewPatterns) {
      expect(viewSource).not.toMatch(pattern);
    }

    expect(viewStyles).toContain(".retail-dashboard-view");
    expect(viewStyles).not.toMatch(/\.tp-/);
    expect(adapterSource).toContain("<RetailDashboardView");
    expect(adapterSource).toContain("getCurrentMerchantId");
    expect(adapterSource).toContain("useQuery");
    expect(adapterSource).toContain('localStorage.getItem("authToken")');
    expect(adapterSource).toContain("RetailReportsButton");
    expect(adapterSource).toContain("/api/merchants/");
    expect(adapterSource).toContain("/profile");
    expect(adapterSource).toContain("/transactions");
  });

  it("renders deterministic retail overview values from the injected clock and data", () => {
    render(<RetailDashboardView {...makeProps()} />);

    expect(screen.getByTestId("retail-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("retail-dashboard-revenue")).toHaveTextContent("$20");
    expect(screen.getByTestId("retail-dashboard-completed-sales")).toHaveTextContent(
      "2 completed sales",
    );
    expect(screen.getByTestId("retail-dashboard-growth")).toHaveTextContent("+100%");
    expect(screen.getByTestId("retail-dashboard-sales")).toHaveTextContent("2");
    expect(screen.getByTestId("retail-dashboard-active")).toHaveTextContent("1");
  });

  it("delegates dashboard actions and retry behavior to the adapter", () => {
    const onNavigate = jest.fn();
    const onRetryTransactions = jest.fn();
    const { rerender } = render(
      <RetailDashboardView
        {...makeProps({ onNavigate, onRetryTransactions })}
      />,
    );

    fireEvent.click(screen.getByTestId("retail-dashboard-new-sale"));
    fireEvent.click(screen.getByTestId("retail-dashboard-manage-stock"));
    fireEvent.click(screen.getByTestId("retail-dashboard-view-sales"));
    fireEvent.click(screen.getByTestId("retail-dashboard-sales"));

    expect(onNavigate.mock.calls).toEqual([
      ["/terminal"],
      ["/stock"],
      ["/transactions"],
      ["/transactions"],
    ]);

    rerender(
      <RetailDashboardView
        {...makeProps({
          transactionError: true,
          onNavigate,
          onRetryTransactions,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("retail-dashboard-retry"));
    expect(onRetryTransactions).toHaveBeenCalledTimes(1);
  });
});
