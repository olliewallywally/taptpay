import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, DollarSign, Activity, MapPin, Mail, User, Phone, Building, CreditCard, CheckCircle, Send, Shield, AlertTriangle, Download, Share2, Receipt, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface MerchantDetailProps {
  merchantId: string;
}

export function MerchantDetail({ merchantId }: MerchantDetailProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [isActioning, setIsActioning] = useState(false);

  const fetchPdfBlob = async (txId: number): Promise<Blob> => {
    const response = await fetch(`/api/transactions/${txId}/receipt-pdf`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to generate PDF');
    return response.blob();
  };

  const handleDownload = async (tx: any) => {
    setIsActioning(true);
    try {
      const blob = await fetchPdfBlob(tx.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${tx.id}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Download failed', description: 'Could not generate receipt PDF.', variant: 'destructive' });
    } finally {
      setIsActioning(false);
    }
  };

  const handleShare = async (tx: any, merchantName: string) => {
    setIsActioning(true);
    try {
      const blob = await fetchPdfBlob(tx.id);
      const file = new File([blob], `receipt-${tx.id}.pdf`, { type: 'application/pdf' });
      const amount = `$${parseFloat(tx.price || tx.amount || 0).toFixed(2)}`;
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: `Receipt from ${merchantName}`, text: `Payment receipt for ${amount}`, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: `Receipt from ${merchantName}`, text: `Payment receipt for ${amount}`, url: window.location.href });
      } else {
        await handleDownload(tx);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        toast({ title: 'Share failed', description: 'Could not share receipt.', variant: 'destructive' });
      }
    } finally {
      setIsActioning(false);
    }
  };

  const { data: merchant, isLoading } = useQuery({
    queryKey: ['/api/admin/merchants', merchantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminAuthToken')}` },
      });
      if (!res.ok) throw new Error('Failed to fetch merchant');
      return res.json();
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ['/api/merchants', merchantId, 'transactions'],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}/transactions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminAuthToken')}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('adminAuthToken')}`,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to verify merchant');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Merchant Verified", description: "The merchant account has been verified successfully." });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/merchants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/merchants', merchantId] });
      setShowConfirm(false);
    },
    onError: (error: any) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    },
  });

  const resendEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('adminAuthToken')}`,
        },
        body: JSON.stringify({ email: merchant.email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to resend email');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email Sent", description: "Verification email has been resent to the merchant." });
    },
    onError: (error: any) => {
      toast({ title: "Email Failed", description: error.message, variant: "destructive" });
    },
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
            onClick={() => setLocation('/merchants')}
            className="mt-4 text-[#0055FF] hover:text-[#00E5CC] transition-colors"
          >
            Back to Merchants
          </button>
        </div>
      </div>
    );
  }

  const isVerified = merchant.status === 'verified';
  const totalRevenue = transactions?.reduce((sum: number, tx: any) => sum + parseFloat(tx.amount || 0), 0) || 0;
  const completedTransactions = transactions?.filter((tx: any) => tx.status === 'completed').length || 0;

  return (
    <div className="min-h-screen bg-[#1a1b2e] p-4 md:p-6">
      <div className="mb-6">
        <button
          onClick={() => setLocation('/merchants')}
          className="flex items-center gap-2 text-[#dbdfea] mb-4 hover:text-[#0055FF] transition-colors"
          data-testid="button-back-to-merchants"
        >
          <ArrowLeft className="size-5" />
          <span className="text-sm">Back to Merchants</span>
        </button>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[#dbdfea] text-xl md:text-2xl mb-1">{merchant.businessName}</h1>
            <p className="text-[#dbdfea] opacity-60 text-sm">{merchant.email}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs ${
              isVerified
                ? 'bg-[#4ade80]/20 text-[#4ade80]'
                : 'bg-[#fbbf24]/20 text-[#fbbf24]'
            }`}
          >
            {isVerified ? 'Verified' : 'Pending'}
          </span>
        </div>
      </div>

      {!isVerified && (
        <div className="bg-[#24263a] border border-[#fbbf24]/30 rounded-lg p-5 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="size-5 text-[#fbbf24] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-[#dbdfea] text-sm font-medium mb-1">Merchant Pending Verification</h3>
              <p className="text-[#dbdfea] opacity-60 text-xs">
                This merchant has not been verified yet. You can verify them directly or resend the verification email.
              </p>
            </div>
          </div>

          {showConfirm ? (
            <div className="bg-[#1a1b2e] rounded-lg p-4">
              <p className="text-[#dbdfea] text-sm mb-3">Are you sure you want to verify this merchant?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                  className="flex items-center gap-2 bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1b2e] px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  data-testid="button-confirm-verify"
                >
                  <CheckCircle className="size-4" />
                  {verifyMutation.isPending ? 'Verifying...' : 'Yes, Verify'}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 rounded-lg text-sm text-[#dbdfea] bg-[#24263a] hover:bg-[#2a2c42] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-2 bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1b2e] px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                data-testid="button-verify-merchant"
              >
                <Shield className="size-4" />
                Verify Merchant
              </button>
              <button
                onClick={() => resendEmailMutation.mutate()}
                disabled={resendEmailMutation.isPending}
                className="flex items-center gap-2 bg-[#0055FF] hover:bg-[#0044cc] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                data-testid="button-resend-email"
              >
                <Send className="size-4" />
                {resendEmailMutation.isPending ? 'Sending...' : 'Resend Verification Email'}
              </button>
            </div>
          )}
        </div>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

      {transactions && transactions.length > 0 && (
        <div className="mt-6 bg-[#24263a] rounded-lg p-6">
          <h2 className="text-[#dbdfea] text-lg mb-4">Recent Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1d1e2c]">
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal">Amount</th>
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal hidden md:table-cell">Item</th>
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal">Status</th>
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal hidden sm:table-cell">Date</th>
                  <th className="text-left p-3 text-[#dbdfea] text-xs opacity-60 font-normal hidden sm:table-cell"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map((tx: any) => (
                  <tr
                    key={tx.id}
                    className="border-b border-[#1d1e2c] cursor-pointer hover:bg-[#1d1e2c] transition-colors"
                    onClick={() => setSelectedTx(tx)}
                  >
                    <td className="p-3 text-[#dbdfea] text-sm">${parseFloat(tx.price || tx.amount || 0).toFixed(2)}</td>
                    <td className="p-3 text-[#dbdfea] text-sm opacity-60 hidden md:table-cell">{tx.itemName || tx.type || '-'}</td>
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
                    <td className="p-3 text-[#00E5CC] text-xs hidden sm:table-cell">View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction Receipt Modal */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => { if (!open) setSelectedTx(null); }}>
        <DialogContent className="bg-[#1a1b2e] border border-[#24263a] text-[#dbdfea] max-w-md w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#dbdfea]">
              <Receipt className="w-5 h-5 text-[#00E5CC]" />
              Transaction Receipt
            </DialogTitle>
          </DialogHeader>

          {selectedTx && (() => {
            const effectiveAmount = parseFloat(selectedTx.price || selectedTx.amount || 0);
            const gstAmount = (effectiveAmount * 0.15) / 1.15;
            const netAmount = effectiveAmount - gstAmount;
            const merchantName = merchant?.businessName || merchant?.name || 'Merchant';

            return (
              <div className="space-y-4">
                {/* Transaction Details */}
                <div className="bg-[#24263a] rounded-lg p-4 space-y-2">
                  <p className="text-xs text-[#dbdfea] opacity-50 uppercase tracking-wide font-semibold">Transaction Details</p>
                  <div className="flex justify-between text-sm">
                    <span className="opacity-60">Transaction ID</span>
                    <span className="font-mono">#{selectedTx.id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="opacity-60">Date</span>
                    <span>{new Date(selectedTx.createdAt).toLocaleString('en-NZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="opacity-60">Payment Method</span>
                    <span className="capitalize">{(selectedTx.paymentMethod || 'card').replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="opacity-60">Status</span>
                    <span className={
                      selectedTx.status === 'completed' ? 'text-[#4ade80]' :
                      selectedTx.status === 'pending' ? 'text-[#fbbf24]' :
                      'text-[#ef4444]'
                    }>{selectedTx.status}</span>
                  </div>
                </div>

                {/* Receipt Card */}
                <div className="bg-white rounded-lg p-4 text-gray-800">
                  {/* Business Info */}
                  <div className="text-center border-b border-gray-200 pb-3 mb-3">
                    <h3 className="font-semibold text-base">{merchantName}</h3>
                    {merchant?.businessAddress && (
                      <p className="text-xs text-gray-500 whitespace-pre-line mt-1">{merchant.businessAddress}</p>
                    )}
                    {merchant?.contactPhone && <p className="text-xs text-gray-500">{merchant.contactPhone}</p>}
                    {merchant?.contactEmail && <p className="text-xs text-gray-500">{merchant.contactEmail}</p>}
                    {merchant?.gstNumber && <p className="text-xs text-gray-500 mt-1 font-medium">GST No: {merchant.gstNumber}</p>}
                    {merchant?.nzbn && <p className="text-xs text-gray-500">NZBN: {merchant.nzbn}</p>}
                  </div>

                  {/* Items */}
                  <div className="space-y-1 mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Items</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{selectedTx.itemName || 'Payment'}</span>
                      <span className="font-medium">${effectiveAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-2 space-y-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cost Breakdown</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal (excl. GST)</span>
                      <span>${netAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">GST (15%)</span>
                      <span>${gstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1 mt-1">
                      <span>Total</span>
                      <span>${effectiveAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <p className="text-center text-xs text-gray-400 mt-3">Powered by TaptPay</p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-1">
                  <Button
                    onClick={() => handleDownload(selectedTx)}
                    disabled={isActioning}
                    className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white"
                  >
                    {isActioning ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Working...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />Download Receipt PDF</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleShare(selectedTx, merchantName)}
                    disabled={isActioning}
                    variant="outline"
                    className="w-full border-[#00E5CC] text-[#00E5CC] hover:bg-[#00E5CC]/10 bg-transparent"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share Receipt
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
