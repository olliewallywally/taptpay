import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { RetailReportsButton } from "@/components/reports/RetailReportsButton";
import { RetailDashboardView } from "@/features/dashboard/RetailDashboardView";
import { getCurrentMerchantId } from "@/lib/auth";
import { sessionFetch } from "@/lib/session";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const merchantId = getCurrentMerchantId();

  useEffect(() => {
    if (!merchantId) setLocation("/login");
  }, [merchantId, setLocation]);

  const { data: merchant } = useQuery<any>({
    queryKey: ["/api/merchants", merchantId, "profile"],
    queryFn: async () => {
      const response = await sessionFetch(`/api/merchants/${merchantId}/profile`);
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
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const response = await sessionFetch(`/api/merchants/${merchantId}/transactions`);
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
