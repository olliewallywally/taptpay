import { Search, CheckCircle, AlertCircle, Edit2, Save, X, RefreshCw, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface MerchantAPI {
  id: string;
  merchantName: string;
  webhookUrl: string;
  apiKey: string;
  status: 'healthy' | 'down' | 'warning';
  lastChecked: string;
  responseTime: number;
  successRate: number;
}

const mockAPIs: MerchantAPI[] = [
  {
    id: '1',
    merchantName: 'Acme Corp',
    webhookUrl: 'https://api.acme.com/payments/webhook',
    apiKey: 'sk_live_51H7vK2eZvKYlo2C9JxL...',
    status: 'healthy',
    lastChecked: '2 min ago',
    responseTime: 142,
    successRate: 99.8,
  },
  {
    id: '2',
    merchantName: 'TechStart Inc',
    webhookUrl: 'https://api.techstart.io/webhooks/payments',
    apiKey: 'sk_live_72K9mN3pQrSTo4D8KyM...',
    status: 'healthy',
    lastChecked: '5 min ago',
    responseTime: 89,
    successRate: 100,
  },
  {
    id: '3',
    merchantName: 'Global Trade',
    webhookUrl: 'https://webhooks.globaltrade.com/payments',
    apiKey: 'sk_live_92XYaB5qUvWXp6E9LzN...',
    status: 'down',
    lastChecked: '10 min ago',
    responseTime: 0,
    successRate: 0,
  },
  {
    id: '4',
    merchantName: 'RetailPro',
    webhookUrl: 'https://api.retailpro.com/webhook/payments',
    apiKey: 'sk_live_43ABcD7rTuVYq8F1MaN...',
    status: 'healthy',
    lastChecked: '1 min ago',
    responseTime: 203,
    successRate: 98.5,
  },
  {
    id: '5',
    merchantName: 'E-Commerce Hub',
    webhookUrl: 'https://ecommerce.hub/api/v1/webhooks',
    apiKey: 'sk_live_65EFgH9sWxZAr0G3ObP...',
    status: 'warning',
    lastChecked: '15 min ago',
    responseTime: 456,
    successRate: 95.2,
  },
  {
    id: '6',
    merchantName: 'Digital Ventures',
    webhookUrl: 'https://api.digitalventures.com/payments',
    apiKey: 'sk_live_87IJkL1tYzBCs2H5PcQ...',
    status: 'healthy',
    lastChecked: '3 min ago',
    responseTime: 178,
    successRate: 99.3,
  },
];

export default function APIManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [apis, setApis] = useState<MerchantAPI[]>(mockAPIs);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const filteredAPIs = apis.filter(
    (api) =>
      api.merchantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.webhookUrl.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-[#4ade80]';
      case 'down':
        return 'text-[#ef4444]';
      case 'warning':
        return 'text-[#f59e0b]';
      default:
        return 'text-[#dbdfea]';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="size-4 text-[#4ade80]" />;
      case 'down':
        return <AlertCircle className="size-4 text-[#ef4444]" />;
      case 'warning':
        return <AlertCircle className="size-4 text-[#f59e0b]" />;
      default:
        return null;
    }
  };

  const handleEdit = (api: MerchantAPI) => {
    setEditingId(api.id);
    setEditingUrl(api.webhookUrl);
  };

  const handleSave = (id: string) => {
    setApis(apis.map(api => 
      api.id === id ? { ...api, webhookUrl: editingUrl } : api
    ));
    setEditingId(null);
    setEditingUrl('');
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingUrl('');
  };

  const handleTest = (api: MerchantAPI) => {
    alert(`Testing API for ${api.merchantName}...`);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const healthyCount = apis.filter(api => api.status === 'healthy').length;
  const downCount = apis.filter(api => api.status === 'down').length;
  const warningCount = apis.filter(api => api.status === 'warning').length;

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-4">API Management</h1>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#dbdfea] opacity-60" />
          <input
            type="text"
            placeholder="Search by merchant or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#24263a] text-[#dbdfea] rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#e03a45]"
          />
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Total APIs</p>
          <p className="text-[#dbdfea] text-2xl">{apis.length}</p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="size-2 rounded-full bg-[#4ade80]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Healthy</p>
          </div>
          <p className="text-[#4ade80] text-2xl">{healthyCount}</p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="size-2 rounded-full bg-[#f59e0b]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Warning</p>
          </div>
          <p className="text-[#f59e0b] text-2xl">{warningCount}</p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="size-2 rounded-full bg-[#ef4444]" />
            <p className="text-[#dbdfea] text-xs opacity-60">Down</p>
          </div>
          <p className="text-[#ef4444] text-2xl">{downCount}</p>
        </div>
      </div>

      {/* APIs List - Desktop */}
      <div className="hidden md:block bg-[#24263a] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1d1e2c]">
              <tr>
                <th className="text-left text-[#dbdfea] text-xs p-4">Merchant</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Status</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Webhook URL</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">API Key</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Response Time</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Success Rate</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAPIs.map((api) => (
                <tr
                  key={api.id}
                  className="border-t border-[#1d1e2c] hover:bg-[#1d1e2c] transition-colors"
                >
                  <td className="p-4">
                    <p className="text-[#dbdfea] text-sm">{api.merchantName}</p>
                    <p className="text-[#dbdfea] text-xs opacity-60">{api.lastChecked}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(api.status)}
                      <span className={`text-xs capitalize ${getStatusColor(api.status)}`}>
                        {api.status}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    {editingId === api.id ? (
                      <input
                        type="text"
                        value={editingUrl}
                        onChange={(e) => setEditingUrl(e.target.value)}
                        className="w-full bg-[#1d1e2c] text-[#dbdfea] text-xs px-2 py-1 rounded"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[#dbdfea] text-xs max-w-xs truncate">{api.webhookUrl}</span>
                        <button
                          onClick={() => copyToClipboard(api.webhookUrl, `url-${api.id}`)}
                          className="p-1 hover:bg-[#1d1e2c] rounded"
                        >
                          {copiedField === `url-${api.id}` ? (
                            <Check className="size-3 text-[#4ade80]" />
                          ) : (
                            <Copy className="size-3 text-[#dbdfea]" />
                          )}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[#dbdfea] text-xs max-w-[120px] truncate">{api.apiKey}</span>
                      <button
                        onClick={() => copyToClipboard(api.apiKey, `key-${api.id}`)}
                        className="p-1 hover:bg-[#1d1e2c] rounded"
                      >
                        {copiedField === `key-${api.id}` ? (
                          <Check className="size-3 text-[#4ade80]" />
                        ) : (
                          <Copy className="size-3 text-[#dbdfea]" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-[#dbdfea] text-sm">
                      {api.responseTime > 0 ? `${api.responseTime}ms` : '-'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`text-sm ${api.successRate >= 99 ? 'text-[#4ade80]' : api.successRate >= 95 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
                      {api.successRate > 0 ? `${api.successRate}%` : '-'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {editingId === api.id ? (
                        <>
                          <button
                            onClick={() => handleSave(api.id)}
                            className="p-1.5 bg-[#4ade80] rounded hover:bg-[#4ade80]/80 transition-colors"
                            title="Save"
                          >
                            <Save className="size-3.5 text-white" />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="p-1.5 bg-[#ef4444] rounded hover:bg-[#ef4444]/80 transition-colors"
                            title="Cancel"
                          >
                            <X className="size-3.5 text-white" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(api)}
                            className="p-1.5 bg-[#1d1e2c] rounded hover:bg-[#e03a45] transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="size-3.5 text-[#dbdfea]" />
                          </button>
                          <button
                            onClick={() => handleTest(api)}
                            className="p-1.5 bg-[#1d1e2c] rounded hover:bg-[#894ba9] transition-colors"
                            title="Test API"
                          >
                            <RefreshCw className="size-3.5 text-[#dbdfea]" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* APIs List - Mobile */}
      <div className="md:hidden space-y-3">
        {filteredAPIs.map((api) => (
          <div key={api.id} className="bg-[#24263a] rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <p className="text-[#dbdfea] text-sm mb-1">{api.merchantName}</p>
                <p className="text-[#dbdfea] text-xs opacity-60">{api.lastChecked}</p>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(api.status)}
                <span className={`text-xs capitalize ${getStatusColor(api.status)}`}>
                  {api.status}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Webhook URL</p>
                {editingId === api.id ? (
                  <input
                    type="text"
                    value={editingUrl}
                    onChange={(e) => setEditingUrl(e.target.value)}
                    className="w-full bg-[#1d1e2c] text-[#dbdfea] text-xs px-2 py-2 rounded"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-[#dbdfea] text-xs flex-1 truncate">{api.webhookUrl}</p>
                    <button
                      onClick={() => copyToClipboard(api.webhookUrl, `url-mobile-${api.id}`)}
                      className="p-1.5 bg-[#1d1e2c] rounded"
                    >
                      {copiedField === `url-mobile-${api.id}` ? (
                        <Check className="size-3 text-[#4ade80]" />
                      ) : (
                        <Copy className="size-3 text-[#dbdfea]" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">API Key</p>
                <div className="flex items-center gap-2">
                  <p className="text-[#dbdfea] text-xs flex-1 truncate">{api.apiKey}</p>
                  <button
                    onClick={() => copyToClipboard(api.apiKey, `key-mobile-${api.id}`)}
                    className="p-1.5 bg-[#1d1e2c] rounded"
                  >
                    {copiedField === `key-mobile-${api.id}` ? (
                      <Check className="size-3 text-[#4ade80]" />
                    ) : (
                      <Copy className="size-3 text-[#dbdfea]" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Response Time</p>
                  <p className="text-[#dbdfea] text-sm">
                    {api.responseTime > 0 ? `${api.responseTime}ms` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Success Rate</p>
                  <p className={`text-sm ${api.successRate >= 99 ? 'text-[#4ade80]' : api.successRate >= 95 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
                    {api.successRate > 0 ? `${api.successRate}%` : '-'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                {editingId === api.id ? (
                  <>
                    <button
                      onClick={() => handleSave(api.id)}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#4ade80] text-white px-3 py-2 rounded text-sm"
                    >
                      <Save className="size-4" />
                      Save
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#ef4444] text-white px-3 py-2 rounded text-sm"
                    >
                      <X className="size-4" />
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleEdit(api)}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#1d1e2c] text-[#dbdfea] px-3 py-2 rounded text-sm hover:bg-[#e03a45] hover:text-white transition-colors"
                    >
                      <Edit2 className="size-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleTest(api)}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#1d1e2c] text-[#dbdfea] px-3 py-2 rounded text-sm hover:bg-[#894ba9] hover:text-white transition-colors"
                    >
                      <RefreshCw className="size-4" />
                      Test
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}