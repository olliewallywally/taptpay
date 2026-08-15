import { useState } from "react";
import { useLocation } from "wouter";
import { PropertyReportsButton } from "@/components/reports/PropertyReportsButton";
import {
  PropertyDashboardView,
} from "@/features/dashboard/PropertyDashboardView";
import {
  usePropertyInvoices,
  usePropertyTenants,
} from "@/lib/property-data";

export default function PropertyDashboard() {
  const [, setLocation] = useLocation();
  const [propertyFilter, setPropertyFilter] = useState<string | null>(null);
  const { data: tenants = [] } = usePropertyTenants();
  const {
    data: invoices = [],
    isLoading: invoiceLoading,
    isError: invoiceError,
    refetch: refetchInvoices,
  } = usePropertyInvoices();

  return (
    <PropertyDashboardView
      tenants={tenants}
      invoices={invoices}
      invoiceLoading={invoiceLoading}
      invoiceError={invoiceError}
      propertyFilter={propertyFilter}
      onPropertyFilterChange={setPropertyFilter}
      onRetryInvoices={() => {
        void refetchInvoices();
      }}
      onNavigate={setLocation}
      reportsControl={(
        <PropertyReportsButton
          tone="onDark"
          propertyFilter={propertyFilter}
        />
      )}
    />
  );
}
