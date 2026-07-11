/* Retail report registry — no @react-pdf import, so a page lists reports without
   loading the PDF engine. The Refunds Report is filtered out by the wrapper when
   the data holds no refunds (see RetailReportsButton). */
import type { ReportOption } from "./types";

export const RETAIL_REPORT_OPTIONS: ReportOption[] = [
  {
    id: "sales-summary",
    title: "Sales Summary",
    description: "Period overview — gross, net after refunds, average sale, GST and split totals.",
    formats: ["pdf"],
    periodFiltered: true,
  },
  {
    id: "transaction-ledger",
    title: "Transaction Ledger",
    description: "Every transaction line by line — the document for your accountant.",
    formats: ["pdf", "csv"],
    periodFiltered: true,
  },
  {
    id: "refunds",
    title: "Refunds Report",
    description: "Every refunded transaction with original, refund and net amounts.",
    formats: ["pdf"],
    periodFiltered: true,
  },
];
