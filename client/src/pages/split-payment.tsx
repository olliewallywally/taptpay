import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { sseClient } from '@/lib/sse-client';
import '@/styles/checkout.css';
import { useTokenPagePrivacy } from '@/hooks/use-token-page-privacy';
import {
  checkoutResolveEndpoint,
  currentTokenPaymentAmount,
  tokenPaymentPath,
  tokenSplitEndpoint,
  type CheckoutRouteKind,
} from '@/lib/payment-addressing';
import SplitPaymentView, {
  type SplitPaymentSelection,
} from '@/features/checkout/SplitPaymentView';

export default function SplitPayment({
  sourceKind = 'retail-legacy',
}: {
  sourceKind?: Extract<CheckoutRouteKind, 'retail-legacy' | 'retail-token'>;
}) {
  const { transactionId, token = '' } = useParams<{
    transactionId?: string;
    token?: string;
  }>();
  const [, setLocation] = useLocation();
  const isTokenSource = sourceKind === 'retail-token';
  const txnId = transactionId ? parseInt(transactionId) : 0;
  useTokenPagePrivacy(isTokenSource);

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<any>(null);
  const [splitError, setSplitError] = useState<string | null>(null);

  const {
    data: transaction,
    isLoading,
    refetch: refetchTransaction,
  } = useQuery({
    queryKey: isTokenSource
      ? ['token-payment', token]
      : ['/api/transactions', txnId],
    queryFn: async () => {
      const endpoint = isTokenSource
        ? checkoutResolveEndpoint({ kind: 'retail-token', token })
        : checkoutResolveEndpoint({
            kind: 'retail-legacy',
            transactionId: txnId,
          });
      const response = await fetch(
        endpoint,
        isTokenSource ? { headers: { 'Cache-Control': 'no-cache' } } : undefined
      );
      const body = await response.json().catch(() => ({}));
      if (isTokenSource && response.status === 410 && body?.payment) {
        return { ...body.payment, closed: true };
      }
      if (!response.ok) throw new Error('Transaction not found');
      return body;
    },
    enabled: isTokenSource ? !!token : !!txnId,
    refetchInterval: 3000,
    staleTime: 0,
  });

  const { data: merchant } = useQuery({
    queryKey: ['/api/merchants', transaction?.merchantId],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${transaction.merchantId}`);
      if (!response.ok) throw new Error('Merchant not found');
      return response.json();
    },
    enabled: !isTokenSource && !!transaction?.merchantId,
  });

  useEffect(() => {
    if (transaction) setCurrentTransaction(transaction);
  }, [transaction]);

  useEffect(() => {
    if (isTokenSource || !transaction?.merchantId) return;
    sseClient.connectCustomer(transaction.merchantId, transaction.taptStoneId);
    const handleUpdate = (message: any) => {
      if (message.transaction?.id === txnId) {
        setCurrentTransaction(message.transaction);
        queryClient.setQueryData(
          ['/api/transactions', txnId],
          message.transaction
        );
      }
    };
    sseClient.subscribe('transaction_updated', handleUpdate);
    return () => {
      sseClient.unsubscribe('transaction_updated', handleUpdate);
      sseClient.disconnect();
    };
  }, [isTokenSource, transaction?.merchantId, transaction?.taptStoneId, txnId]);

  const txn = currentTransaction || transaction;
  const totalAmount = txn ? parseFloat(txn.price) : 0;
  const isSplitSetup = txn?.isSplit === true;
  const completedSplits = txn?.completedSplits || 0;
  const transactionTotalSplits = txn?.totalSplits;
  const allDone = ['completed', 'partially_refunded', 'refunded'].includes(
    txn?.status
  );
  const tokenInProgress = isTokenSource && txn?.status === 'processing';
  const tokenClosed =
    isTokenSource &&
    (txn?.closed || ['failed', 'cancelled'].includes(txn?.status));

  const totalPaid =
    isSplitSetup && txn?.splitAmount
      ? parseFloat(txn.splitAmount) * completedSplits
      : 0;
  const remaining = totalAmount - totalPaid;
  const configuredSplitAmount = parseFloat(txn?.splitAmount || '0');
  const subsequentShare = isSplitSetup
    ? isTokenSource
      ? currentTokenPaymentAmount(txn)
      : configuredSplitAmount
        ? configuredSplitAmount.toFixed(2)
        : undefined
    : undefined;

  const handlePay = async ({ amount, splitCount }: SplitPaymentSelection) => {
    if (!txn) return;
    if (isTokenSource && txn.status !== 'pending') return;
    setSplitError(null);
    setIsProcessing(true);
    try {
      if (!isSplitSetup) {
        const response = await apiRequest(
          'POST',
          isTokenSource
            ? tokenSplitEndpoint(token)
            : `/api/transactions/${txnId}/split`,
          {
            totalSplits: splitCount,
          }
        );
        const data = await response.json();
        if (!isTokenSource && data.transaction) {
          setCurrentTransaction(data.transaction);
          queryClient.setQueryData(
            ['/api/transactions', txnId],
            data.transaction
          );
        } else if (isTokenSource) {
          await refetchTransaction();
        }
      }

      if (isTokenSource) {
        setLocation(tokenPaymentPath(token, 'checkout'));
        return;
      }

      const payRes = await fetch(`/api/transactions/${txnId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: txn.merchantId,
          amount: amount.toFixed(2),
        }),
      });
      if (payRes.ok) {
        const payData = await payRes.json();
        if (payData.hppUrl) {
          window.location.href = payData.hppUrl;
          return;
        }
      }
      setLocation(`/checkout/${txnId}?amount=${amount.toFixed(2)}`);
    } catch (error) {
      console.error('Split payment error:', error);
      setSplitError("Couldn't set up the split. Please try again.");
      setIsProcessing(false);
    }
  };

  const handlePayFull = async () => {
    if (!txn) return;
    if (isTokenSource) {
      setLocation(tokenPaymentPath(token, 'checkout'));
      return;
    }
    try {
      const payRes = await fetch(`/api/transactions/${txnId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: txn.merchantId }),
      });
      if (payRes.ok) {
        const payData = await payRes.json();
        if (payData.hppUrl) {
          window.location.href = payData.hppUrl;
          return;
        }
      }
    } catch {}
    setLocation(`/checkout/${txnId}`);
  };

  const customLogoUrl: string | null = isTokenSource
    ? (txn?.merchant?.customLogoUrl ?? null)
    : (merchant?.customLogoUrl ?? null);

  return (
    <SplitPaymentView
      model={{
        customLogoUrl,
        itemName: txn?.itemName,
        totalAmount,
        splitSetup: isSplitSetup,
        completedSplits,
        totalSplits: transactionTotalSplits,
        subsequentShare,
        remainingAmount: remaining,
        allDone,
        closed: tokenClosed,
        processing: isProcessing,
        paymentInProgress: tokenInProgress,
        allowCustomAmount: !isTokenSource,
        truncateEqualShares: isTokenSource,
        error: splitError,
        loading: isLoading,
        notFound: !isLoading && !txn,
      }}
      onPay={handlePay}
      onPayFull={handlePayFull}
      onDone={() => setLocation('/')}
    />
  );
}
