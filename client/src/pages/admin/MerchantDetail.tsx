import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, DollarSign, Activity, MapPin, Mail, User, Phone, Building, CreditCard } from 'lucide-react';

interface MerchantDetailProps {
  merchantId: string;
}

export function MerchantDetail({ merchantId }: MerchantDetailProps) {
  const [, setLocation] = useLocation();

  const { data: merchant, isLoading } = useQuery({
    queryKey: [`/api/admin/merchants/${merchantId}`],
  });

  const { data: transactions } = useQuery({
    queryKey: [`/api/merchants/${merchantId}/transactions`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block size-12 border-4 border-[#0055FF] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[#dbdfea]">Loading merchant details...</p>
        </div>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="min-h-screen bg-[#1a1b2e] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#dbdfea]">Merchant not found</p>
          <button
            onClick={() => setLocation('/admin/merchants')}
            className="mt-4 text-[#0055FF] hover:text-[#00E5CC] transition-colors"
          >
            Back to Merchants
          </button>
        </div>
      </div>
    );
  }

  const totalRevenue = transactions?.reduce((sum: number, tx: any) => sum + parseFloat(tx.amount || 0), 0) || 0;
  const completedTransactions = transactions?.filter((tx: any) => tx.status === 'completed').length || 0;

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => setLocation('/admin/merchants')}
          className="flex items-center gap-2 text-[#dbdfea] mb-4 hover:text-[#0055FF] transition-colors"
          data-testid="button-back-to-merchants"
        >
          <ArrowLeft className="size-5" />
          <span className="text-sm">Back to Merchants</span>
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-1">{merchant.businessName}</h1>
            <p className="text-[#dbdfea] opacity-60 text-sm">{merchant.email}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs ${
              merchant.verified
                ? 'bg-[#4ade80]/20 text-[#4ade80]'
                : 'bg-[#fbbf24]/20 text-[#fbbf24]'
            }`}
          >
            {merchant.verified ? 'Verified' : 'Pending'}
          </span>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-gradient-to-r from-[#0055FF] to-[#00E5CC] flex items-center justify-center">
              <DollarSign className="size-5 text-white" />
            </div>
            <div>
              <p className="text-[#dbdfea] text-xs opacity-60">Total Revenue</p>
              <p className="text-[#dbdfea] text-lg">${totalRevenue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
              <Activity className="size-5 text-[#0055FF]" />
            </div>
            <div>
              <p className="text-[#dbdfea] text-xs opacity-60">Transactions</p>
              <p className="text-[#dbdfea] text-lg">{transactions?.length || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
              <CreditCard className="size-5 text-[#4ade80]" />
            </div>
            <div>
              <p className="text-[#dbdfea] text-xs opacity-60">Completed</p>
              <p className="text-[#dbdfea] text-lg">{completedTransactions}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
              <DollarSign className="size-5 text-[#00E5CC]" />
            </div>
            <div>
              <p className="text-[#dbdfea] text-xs opacity-60">Avg Transaction</p>
              <p className="text-[#dbdfea] text-lg">
                ${transactions?.length ? (totalRevenue / transactions.length).toFixed(2) : '0.00'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Merchant Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business Information */}
        <div className="bg-[#24263a] rounded-lg p-6">
          <h2 className="text-[#dbdfea] text-lg mb-4">Business Information</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Building className="size-5 text-[#0055FF] mt-0.5" />
              <div className="flex-1">
                <p className="text-[#dbdfea] text-xs opacity-60">Business Name</p>
                <p className="text-[#dbdfea] text-sm">{merchant.businessName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="size-5 text-[#0055FF] mt-0.5" />
              <div className="flex-1">
                <p className="text-[#dbdfea] text-xs opacity-60">Director</p>
                <p className="text-[#dbdfea] text-sm">{merchant.director || '-'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="size-5 text-[#0055FF] mt-0.5" />
              <div className="flex-1">
                <p className="text-[#dbdfea] text-xs opacity-60">Address</p>
                <p className="text-[#dbdfea] text-sm">{merchant.address || '-'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard className="size-5 text-[#0055FF] mt-0.5" />
              <div className="flex-1">
                <p className="text-[#dbdfea] text-xs opacity-60">NZBN</p>
                <p className="text-[#dbdfea] text-sm">{merchant.nzbn || '-'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-[#24263a] rounded-lg p-6">
          <h2 className="text-[#dbdfea] text-lg mb-4">Contact Information</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="size-5 text-[#00E5CC] mt-0.5" />
              <div className="flex-1">
                <p className="text-[#dbdfea] text-xs opacity-60">Email</p>
                <p className="text-[#dbdfea] text-sm">{merchant.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="size-5 text-[#00E5CC] mt-0.5" />
              <div className="flex-1">
                <p className="text-[#dbdfea] text-xs opacity-60">Phone</p>
                <p className="text-[#dbdfea] text-sm">{merchant.phone || '-'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard className="size-5 text-[#00E5CC] mt-0.5" />
              <div className="flex-1">
                <p className="text-[#dbdfea] text-xs opacity-60">GST Number</p>
                <p className="text-[#dbdfea] text-sm">{merchant.gstNumber || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      {transactions && transactions.length > 0 && (
        <div className="mt-6 bg-[#24263a] rounded-lg p-6">
          <h2 className="text-[#dbdfea] text-lg mb-4">Recent Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1d1e2c]">
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal">Amount</th>
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal hidden md:table-cell">Type</th>
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal">Status</th>
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map((tx: any) => (
                  <tr key={tx.id} className="border-b border-[#1d1e2c]">
                    <td className="p-3 text-[#dbdfea] text-sm">${parseFloat(tx.amount).toFixed(2)}</td>
                    <td className="p-3 text-[#dbdfea] text-sm opacity-60 hidden md:table-cell">{tx.type || '-'}</td>
                    <td className="p-3">
                      <span className={`text-xs ${
                        tx.status === 'completed' ? 'text-[#4ade80]' :
                        tx.status === 'pending' ? 'text-[#fbbf24]' :
                        'text-[#ef4444]'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="p-3 text-[#dbdfea] text-sm opacity-60 hidden sm:table-cell">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
