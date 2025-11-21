import { ArrowLeft, Activity, DollarSign, CreditCard, Lock, Pause, Play, Copy, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface MerchantDetailProps {
  merchantId: string;
  onBack: () => void;
}

// Mock merchant data
const getMerchantData = (id: string) => {
  const merchants: Record<string, any> = {
    '1': {
      name: 'Acme Corp',
      email: 'admin@acme.com',
      status: 'active',
      apiHealth: 'healthy',
      apiUrl: 'https://api.acme.com/payments/webhook',
      apiKey: 'sk_live_51H7...',
      totalRevenue: 24500,
      transactions: 245,
      subscriptionPlan: 'Professional',
      subscriptionStatus: 'active',
      monthlyFee: 49.99,
      owedAmount: 0,
      commissionEarned: 24.50,
      paymentPageUrl: 'https://pay.acme.com',
      cardOnFile: '**** **** **** 4242',
      cardExpiry: '12/2025',
      recentTransactions: [
        { id: 't1', amount: 125.50, status: 'completed', date: '2024-11-12', customer: 'John Doe' },
        { id: 't2', amount: 89.99, status: 'completed', date: '2024-11-12', customer: 'Jane Smith' },
        { id: 't3', amount: 250.00, status: 'pending', date: '2024-11-11', customer: 'Bob Johnson' },
        { id: 't4', amount: 175.25, status: 'completed', date: '2024-11-11', customer: 'Alice Brown' },
        { id: 't5', amount: 99.99, status: 'completed', date: '2024-11-10', customer: 'Charlie Wilson' },
      ],
    },
    '2': {
      name: 'TechStart Inc',
      email: 'contact@techstart.com',
      status: 'active',
      apiHealth: 'healthy',
      apiUrl: 'https://api.techstart.io/webhooks/payments',
      apiKey: 'sk_live_72K9...',
      totalRevenue: 18900,
      transactions: 189,
      subscriptionPlan: 'Basic',
      subscriptionStatus: 'active',
      monthlyFee: 29.99,
      owedAmount: 0,
      commissionEarned: 18.90,
      paymentPageUrl: 'https://checkout.techstart.io',
      cardOnFile: '**** **** **** 5555',
      cardExpiry: '08/2026',
      recentTransactions: [
        { id: 't1', amount: 99.00, status: 'completed', date: '2024-11-12', customer: 'David Lee' },
        { id: 't2', amount: 149.99, status: 'completed', date: '2024-11-11', customer: 'Emma Davis' },
        { id: 't3', amount: 79.50, status: 'completed', date: '2024-11-10', customer: 'Frank Miller' },
      ],
    },
    '3': {
      name: 'Global Trade',
      email: 'info@globaltrade.com',
      status: 'active',
      apiHealth: 'down',
      apiUrl: 'https://webhooks.globaltrade.com/payments',
      apiKey: 'sk_live_92XY...',
      totalRevenue: 32100,
      transactions: 321,
      subscriptionPlan: 'Enterprise',
      subscriptionStatus: 'overdue',
      monthlyFee: 99.99,
      owedAmount: 150,
      commissionEarned: 32.10,
      paymentPageUrl: 'https://pay.globaltrade.com',
      cardOnFile: '**** **** **** 1234',
      cardExpiry: '03/2024',
      recentTransactions: [
        { id: 't1', amount: 450.00, status: 'completed', date: '2024-11-12', customer: 'Global Corp' },
        { id: 't2', amount: 325.75, status: 'failed', date: '2024-11-11', customer: 'Tech Solutions' },
        { id: 't3', amount: 199.99, status: 'completed', date: '2024-11-10', customer: 'Retail Inc' },
      ],
    },
  };

  return merchants[id] || merchants['1'];
};

export default function MerchantDetail({ merchantId, onBack }: MerchantDetailProps) {
  const merchant = getMerchantData(merchantId);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePauseAccount = () => {
    alert(`${merchant.status === 'active' ? 'Pausing' : 'Activating'} account for ${merchant.name}`);
  };

  const handleResetPassword = () => {
    alert(`Password reset email sent to ${merchant.email}`);
    setShowResetPassword(false);
  };

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#dbdfea] mb-4 hover:text-[#e03a45] transition-colors"
        >
          <ArrowLeft className="size-5" />
          <span className="text-sm">Back to Merchants</span>
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-1">{merchant.name}</h1>
            <p className="text-[#dbdfea] opacity-60 text-sm">{merchant.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs ${
                merchant.status === 'active'
                  ? 'bg-[#4ade80]/20 text-[#4ade80]'
                  : 'bg-[#f59e0b]/20 text-[#f59e0b]'
              }`}
            >
              {merchant.status}
            </span>
            {merchant.apiHealth === 'down' && (
              <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-[#ef4444]/20 text-[#ef4444]">
                <AlertCircle className="size-3" />
                API Down
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-gradient-to-r from-[#dc2430] to-[#7b4397] flex items-center justify-center">
              <DollarSign className="size-5 text-white" />
            </div>
            <div>
              <p className="text-[#dbdfea] text-xs opacity-60">Total Revenue</p>
              <p className="text-[#dbdfea] text-lg">${merchant.totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
              <Activity className="size-5 text-[#894ba9]" />
            </div>
            <div>
              <p className="text-[#dbdfea] text-xs opacity-60">Transactions</p>
              <p className="text-[#dbdfea] text-lg">{merchant.transactions}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center">
              <DollarSign className="size-5 text-[#4ade80]" />
            </div>
            <div>
              <p className="text-[#dbdfea] text-xs opacity-60">Your Commission</p>
              <p className="text-[#4ade80] text-lg">${merchant.commissionEarned}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#24263a] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-full bg-[#1d1e2c] flex items-center justify-center`}>
              <AlertCircle className={`size-5 ${merchant.owedAmount > 0 ? 'text-[#ef4444]' : 'text-[#dbdfea] opacity-40'}`} />
            </div>
            <div>
              <p className="text-[#dbdfea] text-xs opacity-60">Amount Owed</p>
              <p className={merchant.owedAmount > 0 ? 'text-[#ef4444] text-lg' : 'text-[#dbdfea] text-lg opacity-60'}>
                {merchant.owedAmount > 0 ? `$${merchant.owedAmount}` : '$0'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Left Column - API & Payment Info */}
        <div className="lg:col-span-2 space-y-4">
          {/* API Configuration */}
          <div className="bg-[#24263a] rounded-lg p-4 md:p-6">
            <h3 className="text-[#dbdfea] text-base mb-4">API Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[#dbdfea] text-xs opacity-60 mb-2 block">Webhook URL</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={merchant.apiUrl}
                    readOnly
                    className="flex-1 bg-[#1d1e2c] text-[#dbdfea] text-sm px-3 py-2 rounded"
                  />
                  <button
                    onClick={() => copyToClipboard(merchant.apiUrl, 'url')}
                    className="size-9 bg-[#1d1e2c] rounded flex items-center justify-center hover:bg-[#e03a45] transition-colors"
                  >
                    {copiedField === 'url' ? (
                      <Check className="size-4 text-[#4ade80]" />
                    ) : (
                      <Copy className="size-4 text-[#dbdfea]" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[#dbdfea] text-xs opacity-60 mb-2 block">API Key</label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={merchant.apiKey}
                    readOnly
                    className="flex-1 bg-[#1d1e2c] text-[#dbdfea] text-sm px-3 py-2 rounded"
                  />
                  <button
                    onClick={() => copyToClipboard(merchant.apiKey, 'key')}
                    className="size-9 bg-[#1d1e2c] rounded flex items-center justify-center hover:bg-[#e03a45] transition-colors"
                  >
                    {copiedField === 'key' ? (
                      <Check className="size-4 text-[#4ade80]" />
                    ) : (
                      <Copy className="size-4 text-[#dbdfea]" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[#dbdfea] text-xs opacity-60 mb-2 block">Payment Page</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={merchant.paymentPageUrl}
                    readOnly
                    className="flex-1 bg-[#1d1e2c] text-[#dbdfea] text-sm px-3 py-2 rounded"
                  />
                  <a
                    href={merchant.paymentPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="size-9 bg-[#1d1e2c] rounded flex items-center justify-center hover:bg-[#e03a45] transition-colors"
                  >
                    <ExternalLink className="size-4 text-[#dbdfea]" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-[#24263a] rounded-lg p-4 md:p-6">
            <h3 className="text-[#dbdfea] text-base mb-4">Recent Transactions</h3>
            <div className="space-y-3">
              {merchant.recentTransactions.map((transaction: any) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between py-3 border-b border-[#1d1e2c] last:border-0"
                >
                  <div className="flex-1">
                    <p className="text-[#dbdfea] text-sm">{transaction.customer}</p>
                    <p className="text-[#dbdfea] text-xs opacity-60">{transaction.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#dbdfea] text-sm">${transaction.amount.toFixed(2)}</p>
                    <span
                      className={`text-xs ${
                        transaction.status === 'completed'
                          ? 'text-[#4ade80]'
                          : transaction.status === 'pending'
                          ? 'text-[#f59e0b]'
                          : 'text-[#ef4444]'
                      }`}
                    >
                      {transaction.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Account Management */}
        <div className="space-y-4">
          {/* Subscription Info */}
          <div className="bg-[#24263a] rounded-lg p-4 md:p-6">
            <h3 className="text-[#dbdfea] text-base mb-4">Subscription</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Plan</p>
                <p className="text-[#dbdfea] text-sm">{merchant.subscriptionPlan}</p>
              </div>
              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Monthly Fee</p>
                <p className="text-[#dbdfea] text-sm">${merchant.monthlyFee}</p>
              </div>
              <div>
                <p className="text-[#dbdfea] text-xs opacity-60 mb-1">Status</p>
                <span
                  className={`inline-block px-2 py-1 rounded text-xs ${
                    merchant.subscriptionStatus === 'active'
                      ? 'bg-[#4ade80]/20 text-[#4ade80]'
                      : 'bg-[#ef4444]/20 text-[#ef4444]'
                  }`}
                >
                  {merchant.subscriptionStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Card */}
          <div className="bg-[#24263a] rounded-lg p-4 md:p-6">
            <h3 className="text-[#dbdfea] text-base mb-4">Payment Method</h3>
            <div className="bg-[#1d1e2c] rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <CreditCard className="size-5 text-[#dbdfea]" />
                <p className="text-[#dbdfea] text-sm">{merchant.cardOnFile}</p>
              </div>
              <p className="text-[#dbdfea] text-xs opacity-60">Expires: {merchant.cardExpiry}</p>
            </div>
          </div>

          {/* Account Actions */}
          <div className="bg-[#24263a] rounded-lg p-4 md:p-6">
            <h3 className="text-[#dbdfea] text-base mb-4">Account Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowResetPassword(true)}
                className="w-full flex items-center justify-center gap-2 bg-[#1d1e2c] text-[#dbdfea] px-4 py-3 rounded-lg hover:bg-[#e03a45] hover:text-white transition-colors text-sm"
              >
                <Lock className="size-4" />
                Reset Password
              </button>
              <button
                onClick={handlePauseAccount}
                className="w-full flex items-center justify-center gap-2 bg-[#1d1e2c] text-[#dbdfea] px-4 py-3 rounded-lg hover:bg-[#f59e0b] hover:text-white transition-colors text-sm"
              >
                {merchant.status === 'active' ? (
                  <>
                    <Pause className="size-4" />
                    Pause Account
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    Activate Account
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Commission Details */}
          <div className="bg-[#24263a] rounded-lg p-4 md:p-6">
            <h3 className="text-[#dbdfea] text-base mb-4">Commission Breakdown</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[#dbdfea] text-xs opacity-60">Rate per transaction</p>
                <p className="text-[#dbdfea] text-sm">$0.10</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[#dbdfea] text-xs opacity-60">Total transactions</p>
                <p className="text-[#dbdfea] text-sm">{merchant.transactions}</p>
              </div>
              <div className="pt-3 border-t border-[#1d1e2c]">
                <div className="flex items-center justify-between">
                  <p className="text-[#dbdfea] text-sm">Total earned</p>
                  <p className="text-[#4ade80] text-lg">${merchant.commissionEarned}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#24263a] rounded-lg p-6 max-w-md w-full">
            <h3 className="text-[#dbdfea] text-lg mb-4">Reset Password</h3>
            <p className="text-[#dbdfea] text-sm opacity-60 mb-6">
              Send a password reset email to {merchant.email}?
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowResetPassword(false)}
                className="flex-1 bg-[#1d1e2c] text-[#dbdfea] px-4 py-2 rounded-lg hover:bg-[#1d1e2c]/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                className="flex-1 bg-gradient-to-r from-[#dc2430] to-[#7b4397] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
              >
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
