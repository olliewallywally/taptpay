import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Key, Copy, Check, Plus, AlertTriangle } from 'lucide-react';

export function APIManagement() {
  const [copiedKey, setCopiedKey] = useState<number | null>(null);

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['/api/admin/api-keys'],
  });

  const copyToClipboard = (text: string, keyId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-[#dbdfea] mb-2">API Management</h1>
            <p className="text-sm text-[#dbdfea]/60">Manage API keys and integrations</p>
          </div>
          <button
            className="flex items-center gap-2 bg-[#0055FF] hover:bg-[#0044DD] text-white px-4 py-2 rounded-lg transition-colors"
            data-testid="button-create-api-key"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Create API Key</span>
          </button>
        </div>

        {isLoading ? (
          <div className="bg-[#24263a] rounded-lg p-8 text-center">
            <div className="inline-block size-8 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[#dbdfea] text-sm mt-4">Loading API keys...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {apiKeys && apiKeys.length > 0 ? (
              apiKeys.map((key: any) => (
                <div
                  key={key.id}
                  className="bg-[#24263a] rounded-lg p-6"
                  data-testid={`api-key-${key.id}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center mt-1">
                        <Key className="size-5 text-[#0055FF]" />
                      </div>
                      <div>
                        <h3 className="text-[#dbdfea] text-lg">{key.keyName}</h3>
                        <p className="text-[#dbdfea]/60 text-sm">{key.environment}</p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs ${
                        key.status === 'active'
                          ? 'bg-[#4ade80]/20 text-[#4ade80]'
                          : 'bg-[#ef4444]/20 text-[#ef4444]'
                      }`}
                    >
                      {key.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-[#dbdfea]/60 text-xs mb-1">API Key</p>
                      <div className="flex items-center gap-2 bg-[#1d1e2c] rounded-lg p-3">
                        <code className="text-[#dbdfea] text-sm flex-1 truncate">
                          {key.keyPrefix}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(key.keyPrefix, key.id)}
                          className="text-[#0055FF] hover:text-[#00E5CC] transition-colors"
                          data-testid={`button-copy-key-${key.id}`}
                        >
                          {copiedKey === key.id ? (
                            <Check className="size-4" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[#dbdfea]/60 text-xs mb-1">Rate Limit</p>
                      <div className="bg-[#1d1e2c] rounded-lg p-3">
                        <p className="text-[#dbdfea] text-sm">{key.rateLimitPerHour} requests/hour</p>
                      </div>
                    </div>
                  </div>

                  {key.webhookUrl && (
                    <div className="mb-4">
                      <p className="text-[#dbdfea]/60 text-xs mb-1">Webhook URL</p>
                      <div className="bg-[#1d1e2c] rounded-lg p-3">
                        <code className="text-[#dbdfea] text-sm break-all">{key.webhookUrl}</code>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-[#1d1e2c]">
                    <div className="text-xs text-[#dbdfea]/60">
                      Created {new Date(key.createdAt).toLocaleDateString()} •{' '}
                      {key.lastUsedAt
                        ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                        : 'Never used'}
                    </div>
                    <button
                      className="text-[#ef4444] hover:text-[#dc2626] text-sm transition-colors"
                      data-testid={`button-revoke-key-${key.id}`}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-[#24263a] rounded-lg p-12 text-center">
                <Key className="size-12 text-[#dbdfea]/30 mx-auto mb-4" />
                <p className="text-[#dbdfea] text-lg mb-2">No API Keys</p>
                <p className="text-[#dbdfea]/60 text-sm mb-6">Create your first API key to get started</p>
                <button className="bg-[#0055FF] hover:bg-[#0044DD] text-white px-6 py-2 rounded-lg transition-colors">
                  Create API Key
                </button>
              </div>
            )}
          </div>
        )}

        {/* API Documentation Link */}
        <div className="mt-8 bg-[#0055FF]/10 border border-[#0055FF]/20 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-[#0055FF] mt-0.5" />
            <div>
              <h3 className="text-[#dbdfea] font-medium mb-1">API Documentation</h3>
              <p className="text-[#dbdfea]/60 text-sm">
                View the complete API documentation for integration guides, endpoints, and best practices.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
