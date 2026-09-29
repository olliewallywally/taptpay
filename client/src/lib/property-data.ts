/* Single source of truth for the property vertical's shared data.

   Every page that shows tenants or invoices (dashboard, terminal, analytics,
   tenant directory) MUST use these hooks instead of hand-rolling useQuery:
   one query key + one freshness policy means every chart, stack, and tracker
   reads the identical cache entry, and a mutation invalidating PROPERTY_KEYS
   updates all of them at once. Tenant-scoped queries elsewhere keep keys
   prefixed with PROPERTY_KEYS.invoices[0] so those invalidations reach them
   too. */
import { useQuery } from "@tanstack/react-query";
import { propFetch } from "@/lib/property-api";

export const PROPERTY_KEYS = {
  tenants:   ['/api/property/tenants'] as const,
  invoices:  ['/api/property/invoices'] as const,
  schedules: ['/api/property/schedules'] as const,
};

const fetchList = (path: string) => () =>
  propFetch(path).then(r => { if (!r.ok) throw new Error('load failed'); return r.json(); });

/* Fresh enough to feel live, shared by every consumer. refetchOnWindowFocus
   overrides the app-wide `false` so returning to the tab re-syncs the charts
   (e.g. after a tenant pays through the checkout link in another tab). */
const LIVE_OPTS = { staleTime: 30000, retry: false, refetchOnWindowFocus: true } as const;

export function usePropertyTenants() {
  return useQuery<any[]>({ queryKey: PROPERTY_KEYS.tenants as any, queryFn: fetchList('/api/property/tenants'), ...LIVE_OPTS });
}

export function usePropertyInvoices() {
  return useQuery<any[]>({ queryKey: PROPERTY_KEYS.invoices as any, queryFn: fetchList('/api/property/invoices'), ...LIVE_OPTS });
}

/* Active recurring rent schedules for the merchant — the source of each tenant's
   rent amount + frequency, which the Rent Roll report needs (tenants and invoices
   don't carry it). Hits the existing merchant-wide endpoint; no new API. */
export function usePropertySchedules() {
  return useQuery<any[]>({ queryKey: PROPERTY_KEYS.schedules as any, queryFn: fetchList('/api/property/schedules'), ...LIVE_OPTS });
}
