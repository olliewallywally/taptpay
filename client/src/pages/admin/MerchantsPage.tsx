import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Search, AlertCircle, CheckCircle } from 'lucide-react';

export function MerchantsPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: merchants, isLoading } = useQuery({
    queryKey: ['/api/admin/merchants'],
  });

  const filteredMerchants = (merchants || [])
    .filter(
      (merchant: any) =>
        merchant.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        merchant.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const getStatusColor = (verified: boolean) => {
    return verified ? 'text-[#4ade80]' : 'text-[#f59e0b]';
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
            className="w-full bg-[#24263a] text-[#dbdfea] rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0055FF]"
            data-testid="input-search-merchants"
          />
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Total Merchants</p>
          <p className="text-[#dbdfea] text-2xl">{merchants?.length || 0}</p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Verified</p>
          <p className="text-[#4ade80] text-2xl">
            {merchants?.filter((m: any) => m.verified).length || 0}
          </p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Pending</p>
          <p className="text-[#fbbf24] text-2xl">
            {merchants?.filter((m: any) => !m.verified).length || 0}
          </p>
        </div>
        <div className="bg-[#24263a] rounded-lg p-4">
          <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Active Today</p>
          <p className="text-[#0055FF] text-2xl">{merchants?.length || 0}</p>
        </div>
      </div>

      {/* Merchants List */}
      <div className="bg-[#24263a] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block size-8 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[#dbdfea] text-sm mt-4">Loading merchants...</p>
          </div>
        ) : filteredMerchants.length === 0 ? (
          <div className="p-8 text-center text-[#dbdfea] opacity-60">
            <p>No merchants found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1d1e2c]">
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Business Name</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal hidden md:table-cell">Email</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal hidden lg:table-cell">Director</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal">Status</th>
                  <th className="text-left p-4 text-[#dbdfea] text-xs opacity-60 font-normal hidden sm:table-cell">NZBN</th>
                </tr>
              </thead>
              <tbody>
                {filteredMerchants.map((merchant: any) => (
                  <tr
                    key={merchant.id}
                    onClick={() => setLocation(`/admin/merchants/${merchant.id}`)}
                    className="border-b border-[#1d1e2c] hover:bg-[#1d1e2c] cursor-pointer transition-colors"
                    data-testid={`merchant-row-${merchant.id}`}
                  >
                    <td className="p-4">
                      <p className="text-[#dbdfea] text-sm">{merchant.businessName}</p>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <p className="text-[#dbdfea] text-sm opacity-60">{merchant.email}</p>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <p className="text-[#dbdfea] text-sm opacity-60">{merchant.director || '-'}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {merchant.verified ? (
                          <>
                            <CheckCircle className="size-4 text-[#4ade80]" />
                            <span className={getStatusColor(merchant.verified)}>Verified</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="size-4 text-[#fbbf24]" />
                            <span className={getStatusColor(merchant.verified)}>Pending</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <p className="text-[#dbdfea] text-sm opacity-60">{merchant.nzbn || '-'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
