import { Search, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import { useState } from 'react';

interface Merchant {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'paused' | 'pending';
  apiHealth: 'healthy' | 'down' | 'warning';
  totalRevenue: number;
  transactions: number;
  subscriptionStatus: 'active' | 'overdue';
  owedAmount: number;
  commissionEarned: number;
}

const mockMerchants: Merchant[] = [
  {
    id: '1',
    name: 'Acme Corp',
    email: 'admin@acme.com',
    status: 'active',
    apiHealth: 'healthy',
    totalRevenue: 24500,
    transactions: 245,
    subscriptionStatus: 'active',
    owedAmount: 0,
    commissionEarned: 24.50,
  },
  {
    id: '2',
    name: 'TechStart Inc',
    email: 'contact@techstart.com',
    status: 'active',
    apiHealth: 'healthy',
    totalRevenue: 18900,
    transactions: 189,
    subscriptionStatus: 'active',
    owedAmount: 0,
    commissionEarned: 18.90,
  },
  {
    id: '3',
    name: 'Global Trade',
    email: 'info@globaltrade.com',
    status: 'active',
    apiHealth: 'down',
    totalRevenue: 32100,
    transactions: 321,
    subscriptionStatus: 'overdue',
    owedAmount: 150,
    commissionEarned: 32.10,
  },
  {
    id: '4',
    name: 'RetailPro',
    email: 'support@retailpro.com',
    status: 'active',
    apiHealth: 'healthy',
    totalRevenue: 15600,
    transactions: 156,
    subscriptionStatus: 'active',
    owedAmount: 0,
    commissionEarned: 15.60,
  },
  {
    id: '5',
    name: 'E-Commerce Hub',
    email: 'hello@ecommercehub.com',
    status: 'paused',
    apiHealth: 'warning',
    totalRevenue: 8900,
    transactions: 89,
    subscriptionStatus: 'active',
    owedAmount: 0,
    commissionEarned: 8.90,
  },
  {
    id: '6',
    name: 'Digital Ventures',
    email: 'team@digitalventures.com',
    status: 'active',
    apiHealth: 'healthy',
    totalRevenue: 41200,
    transactions: 412,
    subscriptionStatus: 'overdue',
    owedAmount: 200,
    commissionEarned: 41.20,
  },
];

interface MerchantsPageProps {
  onSelectMerchant: (id: string) => void;
}

export default function MerchantsPage({ onSelectMerchant }: MerchantsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMerchants = mockMerchants
    .filter(
      (merchant) =>
        merchant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        merchant.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // Priority 1: Merchants owing money come first
      const aOwes = a.owedAmount > 0;
      const bOwes = b.owedAmount > 0;
      if (aOwes && !bOwes) return -1;
      if (!aOwes && bOwes) return 1;

      // Priority 2: Non-active status comes next
      const aInactive = a.status !== 'active';
      const bInactive = b.status !== 'active';
      if (aInactive && !bInactive) return -1;
      if (!aInactive && bInactive) return 1;

      // Default: maintain original order (or sort by name)
      return 0;
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-[#4ade80]';
      case 'paused':
        return 'text-[#f59e0b]';
      case 'pending':
        return 'text-[#94a3b8]';
      default:
        return 'text-[#dbdfea]';
    }
  };

  const getApiHealthIcon = (health: string) => {
    switch (health) {
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

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-4">Merchants</h1>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#dbdfea] opacity-60" />
          <input
            type="text"
            placeholder="Search merchants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#24263a] text-[#dbdfea] rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#e03a45]"
          />
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Total Merchants</p>
          <p className="text-[#dbdfea] text-2xl">{mockMerchants.length}</p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Active</p>
          <p className="text-[#4ade80] text-2xl">{mockMerchants.filter(m => m.status === 'active').length}</p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Owing Money</p>
          <p className="text-[#f59e0b] text-2xl">{mockMerchants.filter(m => m.owedAmount > 0).length}</p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Total Commission</p>
          <p className="text-[#dbdfea] text-2xl">
            ${mockMerchants.reduce((sum, m) => sum + m.commissionEarned, 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Merchants List - Desktop */}
      <div className="hidden md:block bg-[#24263a] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1d1e2c]">
              <tr>
                <th className="text-left text-[#dbdfea] text-xs p-4">Merchant</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Status</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">API Health</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Revenue</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Transactions</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Commission</th>
                <th className="text-left text-[#dbdfea] text-xs p-4">Owed</th>
              </tr>
            </thead>
            <tbody>
              {filteredMerchants.map((merchant) => (
                <tr
                  key={merchant.id}
                  onClick={() => onSelectMerchant(merchant.id)}
                  className="border-t border-[#1d1e2c] hover:bg-[#1d1e2c] cursor-pointer transition-colors"
                >
                  <td className="p-4">
                    <div>
                      <p className="text-[#dbdfea] text-sm">{merchant.name}</p>
                      <p className="text-[#dbdfea] text-xs opacity-60">{merchant.email}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs capitalize ${getStatusColor(merchant.status)}`}>
                      {merchant.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {getApiHealthIcon(merchant.apiHealth)}
                      <span className="text-[#dbdfea] text-xs capitalize">{merchant.apiHealth}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-[#dbdfea] text-sm">${merchant.totalRevenue.toLocaleString()}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-[#dbdfea] text-sm">{merchant.transactions}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-[#4ade80] text-sm">${merchant.commissionEarned.toFixed(2)}</span>
                  </td>
                  <td className="p-4">
                    <span className={merchant.owedAmount > 0 ? 'text-[#ef4444] text-sm' : 'text-[#dbdfea] text-sm opacity-60'}>
                      {merchant.owedAmount > 0 ? `$${merchant.owedAmount}` : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Merchants List - Mobile */}
      <div className="md:hidden space-y-3">
        {filteredMerchants.map((merchant) => (
          <div
            key={merchant.id}
            onClick={() => onSelectMerchant(merchant.id)}
            className="bg-[#24263a] rounded-lg p-4 active:bg-[#1d1e2c] transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <p className="text-[#dbdfea] text-sm mb-1">{merchant.name}</p>
                <p className="text-[#dbdfea] text-xs opacity-60">{merchant.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {getApiHealthIcon(merchant.apiHealth)}
                <span className={`text-xs capitalize ${getStatusColor(merchant.status)}`}>
                  {merchant.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Revenue</p>
                <p className="text-[#dbdfea] text-sm">${merchant.totalRevenue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Transactions</p>
                <p className="text-[#dbdfea] text-sm">{merchant.transactions}</p>
              </div>
              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Commission</p>
                <p className="text-[#4ade80] text-sm">${merchant.commissionEarned.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Owed</p>
                <p className={merchant.owedAmount > 0 ? 'text-[#ef4444] text-sm' : 'text-[#dbdfea] text-sm opacity-60'}>
                  {merchant.owedAmount > 0 ? `$${merchant.owedAmount}` : '-'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}