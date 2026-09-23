/*
 * GST in the report exports. NZ GST is 15% of the price before GST. Every amount
 * a trades invoice or a retail sale records is what the customer paid, GST
 * included: a quote in "exclusive" mode adds the 15% to its lines before its
 * total is invoiced, and the checkout charges an invoice's amount as it is. So the
 * GST in an amount is always amount − amount ÷ 1.15, never 15% added on top. A
 * business that is not GST registered charges no GST, so there is none to show.
 */
import type { ReactElement, ReactNode } from "react";

jest.mock("@react-pdf/renderer", () => {
  const passthrough = (name: string) => {
    const Component = ({ children }: { children?: ReactNode }) => children ?? null;
    Component.displayName = name;
    return Component;
  };
  return {
    Document: passthrough("Document"),
    Page: passthrough("Page"),
    View: passthrough("View"),
    Text: passthrough("Text"),
    Svg: passthrough("Svg"),
    Rect: passthrough("Rect"),
    Path: passthrough("Path"),
    Circle: passthrough("Circle"),
    G: passthrough("G"),
    StyleSheet: { create: (styles: unknown) => styles },
    Font: { register: jest.fn(), registerHyphenationCallback: jest.fn() },
    pdf: jest.fn(),
  };
});
jest.mock("./savePdf", () => ({ savePdf: jest.fn(), downloadCsv: jest.fn() }));

import { KpiRow, SectionTitle, type Kpi } from "./components";
import { savePdf } from "./savePdf";
import { runTradesReport } from "./reports/trades";
import { runRetailReport } from "./reports/retail";

const savePdfMock = savePdf as jest.Mock;
const JULY = { start: new Date("2026-07-01T00:00:00+12:00"), end: new Date("2026-07-31T23:59:59+12:00") };

/** Every element in the document the export would have saved. */
function elements(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, out);
  } else if (node && typeof node === "object" && "props" in node) {
    out.push(node as ReactElement);
    elements((node as ReactElement<{ children?: unknown }>).props.children, out);
  }
  return out;
}
function savedReport() {
  const all = elements(savePdfMock.mock.calls.at(-1)?.[0]);
  const titles = all
    .filter((element) => element.type === SectionTitle)
    .map((element) => ([] as unknown[]).concat((element.props as { children: unknown }).children).join(""));
  const kpis = all
    .filter((element) => element.type === KpiRow)
    .flatMap((element) => (element.props as { items: Kpi[] }).items);
  const kpi = (label: string) => kpis.find((item) => item.label === label)?.value;
  return { titles, kpis, kpi };
}

beforeEach(() => savePdfMock.mockReset());

describe("trades Invoice Summary GST", () => {
  // $8,626.00 + $2,290.00 = $10,916.00 invoiced in July, GST included.
  const INVOICES = [
    { id: "a", kind: "full", amountCents: 862_600, status: "paid", createdAt: "2026-07-10T10:00:00+12:00" },
    { id: "b", kind: "deposit", amountCents: 229_000, status: "dispatched", createdAt: "2026-07-12T10:00:00+12:00" },
  ];
  const summary = async (merchant: { gstRegistered?: boolean | null }, gstMode?: string) => {
    await runTradesReport(
      "invoice-summary",
      "pdf",
      { merchant: { businessName: "Wallace Electrical", ...merchant }, clients: [], invoices: INVOICES, quotes: [], gstMode } as never,
      JULY,
    );
    return savedReport();
  };

  it.each([["exclusive"], ["inclusive"], [undefined]])(
    "GST-registered (%s mode): the GST is the 15% inside the $10,916.00 invoiced, not 15% on top",
    async (mode) => {
      const report = await summary({ gstRegistered: true }, mode);
      expect(report.kpi("GST")).toBe("$1,423.83"); // 15% of $9,492.17
      expect(report.kpi("Excl. GST")).toBe("$9,492.17");
      expect(report.kpi("Incl. GST")).toBe("$10,916.00"); // what the customers paid
      expect(report.titles).toContain("GST summary (15%)"); // the mode does not change the GST in an amount paid
    },
  );

  it.each([[false], [null], [undefined]])(
    "not GST registered (%s): no GST summary, because there is no GST in the amounts",
    async (gstRegistered) => {
      const report = await summary({ gstRegistered });
      expect(report.titles.some((title) => title.startsWith("GST summary"))).toBe(false);
      expect(report.kpi("GST")).toBeUndefined();
      expect(report.kpi("Invoiced")).toBe("$10,916.00");
    },
  );
});

describe("retail Sales Summary GST", () => {
  const SALES = [
    { id: 1, price: "115.00", totalRefunded: "0", status: "completed", createdAt: "2026-07-10T10:00:00+12:00" },
    { id: 2, price: "57.50", totalRefunded: "0", status: "completed", createdAt: "2026-07-11T10:00:00+12:00" },
  ];
  const summary = async (merchant: { gstRegistered?: boolean | null }) => {
    await runRetailReport("sales-summary", "pdf", { merchant: { businessName: "Ollie's Coffee", ...merchant }, transactions: SALES }, JULY);
    return savedReport();
  };

  it("GST-registered: the GST is the 15% inside the $172.50 taken", async () => {
    expect((await summary({ gstRegistered: true })).kpi("GST (15%) incl.")).toBe("$22.50");
  });

  it.each([[false], [null], [undefined]])("not GST registered (%s): no GST figure", async (gstRegistered) => {
    const report = await summary({ gstRegistered });
    expect(report.kpis.some((item) => item.label.startsWith("GST"))).toBe(false);
    expect(report.kpi("Net After Refunds")).toBe("$172.50");
  });
});
