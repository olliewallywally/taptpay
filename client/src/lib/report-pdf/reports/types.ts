/* The contract between the (vertical-agnostic) ReportModal and each vertical's
   report bundle. The modal renders a list of ReportOptions and, on Generate,
   calls back with the chosen id/format/range — it never touches invoice or
   tenant data itself, so one modal serves retail, property and trades. */

export type ReportFormat = "pdf" | "csv";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ReportOption {
  id: string;
  title: string;
  description: string;
  formats: ReportFormat[];
  /** false → the report is a point-in-time snapshot; the modal disables its
      date picker (e.g. Rent Roll, Aged Arrears, Annual Income Statement). */
  periodFiltered: boolean;
  /** true → the modal shows a client/tenant selector (trades Client Statement). */
  needsClient?: boolean;
}
