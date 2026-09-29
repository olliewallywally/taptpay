/* The property report registry, kept in its OWN module — free of any @react-pdf
   import — so a page's Export button can list the reports without pulling the
   ~1 MB PDF engine into its initial bundle. The heavy generator (property.tsx)
   is dynamically imported only when the merchant actually generates a report. */
import type { ReportOption } from "./types";

export const PROPERTY_REPORT_OPTIONS: ReportOption[] = [
  {
    id: "rent-roll",
    title: "Rent Roll",
    description: "Snapshot of every active tenancy — rent, last payment, status and outstanding balance.",
    formats: ["pdf"],
    periodFiltered: false,
  },
  {
    id: "collection-statement",
    title: "Collection Statement",
    description: "Every invoice in the selected period with totals and collection rate.",
    formats: ["pdf", "csv"],
    periodFiltered: true,
  },
  {
    id: "aged-arrears",
    title: "Aged Arrears",
    description: "Overdue invoices grouped into 1–7, 8–30, 31–60 and 60+ day buckets.",
    formats: ["pdf"],
    periodFiltered: false,
  },
  {
    id: "annual-income",
    title: "Annual Income Statement",
    description: "Rent collected per property, month by month, for the calendar year.",
    formats: ["pdf"],
    periodFiltered: false,
  },
];
