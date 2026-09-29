/* Trades report registry — no @react-pdf import, so a page can list reports
   without loading the PDF engine. Client Statement sets needsClient so the modal
   shows a client selector (populated by the wrapper). */
import type { ReportOption } from "./types";

export const TRADES_REPORT_OPTIONS: ReportOption[] = [
  {
    id: "invoice-summary",
    title: "Invoice Summary",
    description: "Invoices in the period grouped by type, with collection rate and a GST summary.",
    formats: ["pdf", "csv"],
    periodFiltered: true,
  },
  {
    id: "quote-conversion",
    title: "Quote Conversion",
    description: "Quote pipeline — status breakdown, conversion rate and average time to accept.",
    formats: ["pdf"],
    periodFiltered: true,
  },
  {
    id: "aged-receivables",
    title: "Aged Receivables",
    description: "Outstanding invoices grouped into 1–7, 8–30, 31–60 and 60+ day buckets.",
    formats: ["pdf"],
    periodFiltered: false,
  },
  {
    id: "client-statement",
    title: "Client Statement",
    description: "One client or all — every invoice in the period with balance outstanding.",
    formats: ["pdf"],
    periodFiltered: true,
    needsClient: true,
  },
];
