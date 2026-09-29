/* Drop-in Export control for the property vertical: the header button + the
   report modal, with all the property caches (tenants, invoices, schedules,
   merchant) bound in. A page just renders <PropertyReportsButton /> — it owns
   the open state and the generate dispatch. */
import { useState } from "react";

import { ReportModal, ExportButton } from "./ReportModal";
import { usePropertyTenants, usePropertyInvoices, usePropertySchedules } from "@/lib/property-data";
import { filterByProperty } from "@/lib/property-dashboard-data";
import { useMerchantProfile } from "@/lib/merchant";
import { PROPERTY_REPORT_OPTIONS } from "@/lib/report-pdf/reports/property-options";
import type { PropertyReportData } from "@/lib/report-pdf/reports/property";

export function PropertyReportsButton({
  tone = "onLight",
  style,
  propertyFilter = null,
}: {
  tone?: "onLight" | "onDark";
  style?: React.CSSProperties;
  /** When the page is filtered to one property, its address — reports are then
     scoped to just that property's tenants/invoices/schedules. */
  propertyFilter?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { data: merchant } = useMerchantProfile();
  const { data: tenants = [] } = usePropertyTenants();
  const { data: invoices = [] } = usePropertyInvoices();
  const { data: schedules = [] } = usePropertySchedules();

  // Narrow to the selected property (filterByProperty is a no-op when null), and
  // keep only the schedules whose tenant survived the filter.
  const { invoices: fInvoices, tenants: fTenants } = filterByProperty(invoices, tenants, propertyFilter);
  const tenantIds = new Set(fTenants.map((t: any) => t.id));
  const fSchedules = propertyFilter ? schedules.filter((s: any) => tenantIds.has(s.tenantProfileId)) : schedules;

  const data: PropertyReportData = {
    merchant: merchant ?? {},
    tenants: fTenants,
    invoices: fInvoices,
    schedules: fSchedules,
    scope: propertyFilter ?? undefined,
  };

  return (
    <>
      <ExportButton tone={tone} style={style} onClick={() => setOpen(true)} />
      {open && (
        <ReportModal
          title="Property Reports"
          options={PROPERTY_REPORT_OPTIONS}
          onClose={() => setOpen(false)}
          onGenerate={async (id, format, args) => {
            // Load the PDF engine + report code only now, on first generate.
            const { runPropertyReport } = await import("@/lib/report-pdf/reports/property");
            await runPropertyReport(id, format, data, args.range);
          }}
        />
      )}
    </>
  );
}
