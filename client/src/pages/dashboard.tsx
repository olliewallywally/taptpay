import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { RetailReportsButton } from "@/components/reports/RetailReportsButton";
import { RetailDashboardView } from "@/features/dashboard/RetailDashboardView";
import { getCurrentMerchantId } from "@/lib/auth";
import { sessionFetch } from "@/lib/session";
import { MERCHANTS_KEY, apiPath } from "@shared/api-path";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const merchantId = getCurrentMerchantId();

  useEffect(() => {
    if (!merchantId) setLocation("/login");
  }, [merchantId, setLocation]);

  const { data: merchant } = useQuery<any>({
    queryKey: [MERCHANTS_KEY, merchantId, "profile"],
    queryFn: async () => {
      const response = await sessionFetch(apiPath("GET /api/merchants/:id/profile", { id: merchantId }));
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
    enabled: !!merchantId,
  });

  const {
    data: transactions = [],
    isLoading: transactionLoading,
    isError: transactionError,
    refetch: refetchTransactions,
  } = useQuery<any[]>({
    queryKey: [MERCHANTS_KEY, merchantId, "transactions"],
    queryFn: async () => {
      const response = await sessionFetch(apiPath("GET /api/merchants/:id/transactions", { id: merchantId }));
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
    staleTime: 30000,
    retry: false,
    enabled: !!merchantId,
  });

  if (!merchantId) return null;

  return (
    <RetailDashboardView
      merchant={merchant}
      transactions={transactions}
      transactionLoading={transactionLoading}
      transactionError={transactionError}
      onRetryTransactions={() => {
        void refetchTransactions();
      }}
      onNavigate={setLocation}
      reportsControl={<RetailReportsButton tone="onDark" />}
    />
  );
}
