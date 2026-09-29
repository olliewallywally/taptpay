/* The signed-in merchant's profile, used to stamp every generated report's
   header (business name, GST number, NZBN, GST-registered flag). Shares the
   ["/api/merchants", id, "profile"] query cache with the settings page, so editing the
   business details there refreshes report headers with no extra fetch. */
import { useQuery } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";

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
  /* The merchant comes from the session token, as on every other page. A
     "merchantId" storage key was written only by Google sign-in, so after a
     password sign-in this never ran and reports printed "TaptPay" with GST in
     the default mode. */
  const merchantId = getCurrentMerchantId();
  return useQuery<MerchantProfile>({
    queryKey: ["/api/merchants", merchantId, "profile"],
    enabled: !!merchantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const r = await fetch(`/api/merchants/${merchantId}/profile`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!r.ok) throw new Error("Failed to load merchant profile");
      return r.json();
    },
  });
}
