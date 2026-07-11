/* The signed-in merchant's profile, used to stamp every generated report's
   header (business name, GST number, NZBN, GST-registered flag). Shares the
   ["/api/merchants", id] query cache with the settings page, so editing the
   business details there refreshes report headers with no extra fetch. */
import { useQuery } from "@tanstack/react-query";

export interface MerchantProfile {
  id: number;
  businessName?: string | null;
  name?: string | null;
  gstNumber?: string | null;
  nzbn?: string | null;
  gstRegistered?: boolean | null;
  tradeGstMode?: "inclusive" | "exclusive" | null;
}

export function useMerchantProfile() {
  const merchantId = typeof localStorage !== "undefined" ? localStorage.getItem("merchantId") : null;
  return useQuery<MerchantProfile>({
    queryKey: ["/api/merchants", merchantId],
    enabled: !!merchantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const r = await fetch(`/api/merchants/${merchantId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!r.ok) throw new Error("Failed to load merchant profile");
      return r.json();
    },
  });
}
