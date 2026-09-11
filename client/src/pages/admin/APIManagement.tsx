import { Key } from 'lucide-react';

/**
 * R0-T5 disposition for the e-commerce API: "FEATURE_ECOMMERCE_API=false; strip
 * mock success data; public surface 404."
 *
 * The five admin endpoints behind this screen now return 404 rather than
 * fabricated keys, metrics and revoke-success. This screen previously rendered
 * that fabricated data, and its "Create API Key" and "Revoke" buttons never had
 * handlers at all — so what is deleted here is a surface that only ever
 * appeared to work. Rule 5: deleting is the fix, not flagging.
 */
export function APIManagement() {
  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-[#dbdfea] mb-2">API Management</h1>
          <p className="text-sm text-[#dbdfea]/60">Manage API keys and integrations</p>
        </div>

        <div className="bg-[#24263a] rounded-lg p-12 text-center" data-testid="api-management-unavailable">
          <Key className="size-12 text-[#dbdfea]/30 mx-auto mb-4" aria-hidden="true" />
          <p className="text-[#dbdfea] text-lg mb-2">The e-commerce API is not available</p>
          <p className="text-[#dbdfea]/60 text-sm max-w-md mx-auto">
            API key issuing, usage reporting and revocation are turned off. This screen will
            return once the integration is built and reviewed.
          </p>
        </div>
      </div>
    </div>
  );
}
