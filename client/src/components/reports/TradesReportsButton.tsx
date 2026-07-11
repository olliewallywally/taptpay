/* Drop-in Export control for the trades vertical. Binds the clients, invoices and
   quotes caches (+ merchant GST mode), scopes to the selected site, feeds the
   client selector for Client Statement, and dynamically imports the generator. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ReportModal, ExportButton } from "./ReportModal";
import { tradesFetch } from "@/lib/trades-api";
import { useMerchantProfile } from "@/lib/merchant";
import { TRADES_REPORT_OPTIONS } from "@/lib/report-pdf/reports/trades-options";
import type { TradesReportData } from "@/lib/report-pdf/reports/trades";

const load = (path: string) => () => tradesFetch(path).then((r) => (r.ok ? r.json() : []));

/* Job invoices carry no site of their own — resolve it through the client. */
function filterBySite(invoices: any[], clients: any[], addr: string | null) {
  if (!addr) return { invoices, clients };
  const cById = new Map(clients.map((c: any) => [c.id, c]));
  return {
    invoices: invoices.filter((i: any) => cById.get(i.clientProfileId)?.siteAddress === addr),
    clients: clients.filter((c: any) => c.siteAddress === addr),
  };
}

const clientLabel = (c: any) =>
  [[c.firstName, c.lastName].filter(Boolean).join(" ").trim(), c.siteAddress].filter(Boolean).join(" · ") || "Client";

export function TradesReportsButton({
  tone = "onLight",
  style,
  siteFilter = null,
}: {
  tone?: "onLight" | "onDark";
  style?: React.CSSProperties;
  /** Selected site address — reports are scoped to just that site's data. */
  siteFilter?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { data: merchant } = useMerchantProfile();
  const { data: clients = [] } = useQuery<any[]>({ queryKey: ["/api/trades/clients"], queryFn: load("/api/trades/clients"), staleTime: 30000 });
  const { data: invoices = [] } = useQuery<any[]>({ queryKey: ["/api/trades/invoices"], queryFn: load("/api/trades/invoices"), staleTime: 30000 });
  const { data: quotes = [] } = useQuery<any[]>({ queryKey: ["/api/trades/quotes"], queryFn: load("/api/trades/quotes"), staleTime: 30000 });

  const { invoices: fInvoices, clients: fClients } = filterBySite(invoices, clients, siteFilter);
  const clientIds = new Set(fClients.map((c: any) => c.id));
  const fQuotes = siteFilter ? quotes.filter((qq: any) => clientIds.has(qq.clientProfileId)) : quotes;

  const data: TradesReportData = {
    merchant: merchant ?? {},
    clients: fClients,
    invoices: fInvoices,
    quotes: fQuotes,
    gstMode: merchant?.tradeGstMode ?? undefined,
    scope: siteFilter ?? undefined,
  };

  const clientOptions = fClients.filter((c: any) => c.status !== "archived").map((c: any) => ({ id: c.id, label: clientLabel(c) }));

  return (
    <>
      <ExportButton tone={tone} style={style} onClick={() => setOpen(true)} />
      {open && (
        <ReportModal
          title="Trades Reports"
          options={TRADES_REPORT_OPTIONS}
          clients={clientOptions}
          onClose={() => setOpen(false)}
          onGenerate={async (id, format, args) => {
            const { runTradesReport } = await import("@/lib/report-pdf/reports/trades");
            await runTradesReport(id, format, data, args.range, args.clientId);
          }}
        />
      )}
    </>
  );
}
