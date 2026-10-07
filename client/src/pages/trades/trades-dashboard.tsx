import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TradesReportsButton } from "@/components/reports/TradesReportsButton";
import { TradesDashboardView } from "@/features/dashboard/TradesDashboardView";
import { tradesFetch } from "@/lib/trades-api";
import { apiPath } from "@shared/api-path";

export default function TradesDashboard() {
  const [, setLocation] = useLocation();
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const { data: clients = [] } = useQuery<any[]>({
    queryKey: [apiPath("GET /api/trades/clients")],
    queryFn: () =>
      tradesFetch(apiPath("GET /api/trades/clients")).then((response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json();
      }),
    staleTime: 60_000,
    retry: false,
  });
  const {
    data: invoices = [],
    isLoading: invoiceLoading,
    isError: invoiceError,
    refetch: refetchInvoices,
  } = useQuery<any[]>({
    queryKey: [apiPath("GET /api/trades/invoices")],
    queryFn: () =>
      tradesFetch(apiPath("GET /api/trades/invoices")).then((response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json();
      }),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <TradesDashboardView
      clients={clients}
      invoices={invoices}
      invoiceLoading={invoiceLoading}
      invoiceError={invoiceError}
      siteFilter={siteFilter}
      onSiteFilterChange={setSiteFilter}
      onRetryInvoices={() => {
        void refetchInvoices();
      }}
      onNavigate={setLocation}
      reportsControl={(
        <TradesReportsButton tone="onDark" siteFilter={siteFilter} />
      )}
    />
  );
}
