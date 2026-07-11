/* Drop-in Export control for the retail vertical. Binds the merchant + the
   transactions cache (shared query key with dashboard.tsx), hides the Refunds
   report when there are no refunds, and dynamically imports the PDF generator. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ReportModal, ExportButton } from "./ReportModal";
import { useMerchantProfile } from "@/lib/merchant";
import { getCurrentMerchantId } from "@/lib/auth";
import { dollarsToCents } from "@/lib/report-utils";
import { RETAIL_REPORT_OPTIONS } from "@/lib/report-pdf/reports/retail-options";
import type { RetailReportData } from "@/lib/report-pdf/reports/retail";

export function RetailReportsButton({ tone = "onDark", color = "#00E5CC", style }: { tone?: "onLight" | "onDark"; color?: string; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const merchantId = getCurrentMerchantId();
  const { data: merchant } = useMerchantProfile();
  const { data: transactions = [] } = useQuery<any[]>({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    enabled: !!merchantId,
    staleTime: 30000,
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const r = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!r.ok) throw new Error("Failed to load transactions");
      return r.json();
    },
  });

  const data: RetailReportData = { merchant: merchant ?? {}, transactions };
  const hasRefunds = transactions.some((t: any) => dollarsToCents(t.totalRefunded) > 0);
  const options = hasRefunds ? RETAIL_REPORT_OPTIONS : RETAIL_REPORT_OPTIONS.filter((o) => o.id !== "refunds");

  return (
    <>
      <ExportButton tone={tone} color={color} style={style} onClick={() => setOpen(true)} />
      {open && (
        <ReportModal
          title="Sales Reports"
          options={options}
          onClose={() => setOpen(false)}
          onGenerate={async (id, format, args) => {
            const { runRetailReport } = await import("@/lib/report-pdf/reports/retail");
            await runRetailReport(id, format, data, args.range);
          }}
        />
      )}
    </>
  );
}
