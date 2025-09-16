import { Clock, Loader2, CheckCircle, XCircle, DollarSign, Users, CreditCard, RefreshCw, AlertTriangle } from "lucide-react";
import type { Transaction } from "@shared/schema";

interface EnhancedPaymentStatusProps {
  transaction: Transaction | null | undefined;
  className?: string;
}

export function EnhancedPaymentStatus({ transaction, className = "" }: EnhancedPaymentStatusProps) {
  if (!transaction) return null;

  const status = transaction.status || "pending";
  const isSplit = Boolean(transaction.isSplit);
  
  // Robust numeric parsing with fallbacks
  const safeParsePrice = (price: string | number | null | undefined): number => {
    if (price === null || price === undefined) return 0;
    const parsed = typeof price === 'string' ? parseFloat(price) : Number(price);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  };
  
  const totalAmount = safeParsePrice(transaction.price);
  const safeSplitAmount = transaction.splitAmount ? safeParsePrice(transaction.splitAmount) : totalAmount;
  
  // Validate split bill data with proper guards
  const completedSplits = Math.max(0, transaction.completedSplits || 0);
  const totalSplits = Math.max(1, transaction.totalSplits || 1);
  const remainingSplits = Math.max(0, totalSplits - completedSplits);
  
  // Calculate split amount with fallback
  const splitAmount = isSplit && safeSplitAmount > 0 ? safeSplitAmount : (totalAmount / totalSplits);
  const remainingAmount = Math.max(0, remainingSplits * splitAmount);
  
  // Validate that split calculations make sense
  const hasValidSplitData = isSplit ? (splitAmount > 0 && totalSplits > 0 && completedSplits <= totalSplits) : true;

  const getStatusInfo = () => {
    switch (status) {
      case "pending":
        return {
          icon: Clock,
          title: "Awaiting Payment",
          color: "blue",
          bgColor: "bg-blue-500/10",
          borderColor: "border-blue-400/30",
          iconColor: "text-blue-300",
          titleColor: "text-blue-200",
          textColor: "text-blue-300"
        };
      case "processing":
        return {
          icon: Loader2,
          title: "Processing Payment",
          color: "orange",
          bgColor: "bg-orange-500/10",
          borderColor: "border-orange-400/30",
          iconColor: "text-orange-300",
          titleColor: "text-orange-200",
          textColor: "text-orange-300"
        };
      case "completed":
      case "approved": // Handle windcave status
        return {
          icon: CheckCircle,
          title: "Payment Accepted",
          color: "green",
          bgColor: "bg-green-500/10",
          borderColor: "border-green-400/30",
          iconColor: "text-green-300",
          titleColor: "text-green-200",
          textColor: "text-green-300"
        };
      case "failed":
      case "declined": // Handle windcave status
        return {
          icon: XCircle,
          title: "Payment Failed",
          color: "red",
          bgColor: "bg-red-500/10",
          borderColor: "border-red-400/30",
          iconColor: "text-red-300",
          titleColor: "text-red-200",
          textColor: "text-red-300"
        };
      case "cancelled":
        return {
          icon: XCircle,
          title: "Payment Cancelled",
          color: "gray",
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-400/30",
          iconColor: "text-gray-300",
          titleColor: "text-gray-200",
          textColor: "text-gray-300"
        };
      case "refunded":
        return {
          icon: RefreshCw,
          title: "Payment Refunded",
          color: "purple",
          bgColor: "bg-purple-500/10",
          borderColor: "border-purple-400/30",
          iconColor: "text-purple-300",
          titleColor: "text-purple-200",
          textColor: "text-purple-300"
        };
      case "partially_refunded":
        return {
          icon: RefreshCw,
          title: "Partially Refunded",
          color: "purple",
          bgColor: "bg-purple-500/10",
          borderColor: "border-purple-400/30",
          iconColor: "text-purple-300",
          titleColor: "text-purple-200",
          textColor: "text-purple-300"
        };
      default:
        return {
          icon: AlertTriangle,
          title: "Unknown Status",
          color: "gray",
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-400/30",
          iconColor: "text-gray-300",
          titleColor: "text-gray-200",
          textColor: "text-gray-300"
        };
    }
  };

  const statusInfo = getStatusInfo();
  const Icon = statusInfo.icon;

  return (
    <div 
      className={`payment-status-box backdrop-blur-sm rounded-2xl border p-4 sm:p-6 ${statusInfo.bgColor} ${statusInfo.borderColor} ${className}`} 
      data-testid="payment-status-box"
      data-transaction-id={transaction.id}
      data-transaction-status={status}
    >
      {/* Header with Icon and Status */}
      <div className="flex items-center justify-center space-x-2 sm:space-x-3 mb-4" data-testid="status-header">
        <Icon 
          className={`w-5 h-5 sm:w-6 sm:h-6 ${statusInfo.iconColor} ${status === 'processing' ? 'animate-spin' : ''}`} 
          data-testid={`status-icon-${status}`}
        />
        <span 
          className={`text-lg sm:text-xl font-semibold ${statusInfo.titleColor}`}
          data-testid="status-title"
        >
          {statusInfo.title}
        </span>
      </div>

      {/* Transaction Details */}
      <div className="space-y-3" data-testid="transaction-details">
        <div className="text-center">
          <h3 
            className={`text-sm font-medium ${statusInfo.textColor} mb-1`}
            data-testid="item-name"
          >
            {transaction.itemName || 'Unknown Item'}
          </h3>
        </div>
        
        {/* Data validation warning */}
        {(!hasValidSplitData && isSplit) && (
          <div className="text-center p-2 bg-yellow-500/10 border border-yellow-400/30 rounded-lg" data-testid="data-warning">
            <AlertTriangle className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
            <p className="text-xs text-yellow-300">Split bill data validation error</p>
          </div>
        )}

        {/* Amount Information */}
        {isSplit ? (
          <div className="space-y-3" data-testid="split-bill-section">
            {/* Split Progress */}
            <div className="text-center" data-testid="split-progress">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Users className={`w-4 h-4 ${statusInfo.iconColor}`} data-testid="split-icon" />
                <span className={`text-sm font-semibold ${statusInfo.titleColor}`}>
                  Split Bill Progress
                </span>
              </div>
              <div className="flex items-center justify-center space-x-1 text-sm">
                <span 
                  className={`font-bold ${statusInfo.titleColor}`}
                  data-testid="completed-splits"
                >
                  {completedSplits} 
                </span>
                <span className={statusInfo.textColor}>of</span>
                <span 
                  className={`font-bold ${statusInfo.titleColor}`}
                  data-testid="total-splits"
                >
                  {totalSplits}
                </span>
                <span className={statusInfo.textColor}>payments completed</span>
              </div>
            </div>

            {/* Split Amount Details */}
            <div className="grid grid-cols-2 gap-3 text-center" data-testid="split-amounts">
              <div 
                className={`p-3 rounded-xl ${statusInfo.bgColor} border ${statusInfo.borderColor}`}
                data-testid="per-person-amount"
              >
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <CreditCard className={`w-3 h-3 ${statusInfo.iconColor}`} />
                  <span className={`text-xs ${statusInfo.textColor}`}>Per Person</span>
                </div>
                <div 
                  className={`text-lg font-bold ${statusInfo.titleColor}`}
                  data-testid="split-amount-value"
                >
                  ${splitAmount.toFixed(2)}
                </div>
              </div>
              
              <div 
                className={`p-3 rounded-xl ${statusInfo.bgColor} border ${statusInfo.borderColor}`}
                data-testid="remaining-amount"
              >
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <DollarSign className={`w-3 h-3 ${statusInfo.iconColor}`} />
                  <span className={`text-xs ${statusInfo.textColor}`}>Remaining</span>
                </div>
                <div 
                  className={`text-lg font-bold ${statusInfo.titleColor}`}
                  data-testid="remaining-amount-value"
                >
                  ${remainingAmount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Total Amount */}
            <div className="text-center pt-2 border-t border-white/10" data-testid="total-amount-section">
              <span className={`text-xs ${statusInfo.textColor}`}>Total Bill: </span>
              <span 
                className={`text-sm font-semibold ${statusInfo.titleColor}`}
                data-testid="total-amount-value"
              >
                ${totalAmount.toFixed(2)}
              </span>
            </div>

            {/* Next Payment Info */}
            {remainingSplits > 0 && status === "pending" && (
              <div className="text-center" data-testid="next-payment-info">
                <p className={`text-xs ${statusInfo.textColor}`}>
                  Waiting for payment {completedSplits + 1} of {totalSplits}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Regular Payment */
          <div className="text-center" data-testid="regular-payment-section">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <DollarSign className={`w-4 h-4 ${statusInfo.iconColor}`} data-testid="amount-icon" />
              <span 
                className={`text-2xl font-bold ${statusInfo.titleColor}`}
                data-testid="payment-amount"
              >
                ${totalAmount.toFixed(2)}
              </span>
            </div>
            {status === "pending" && (
              <p className={`text-xs ${statusInfo.textColor}`} data-testid="pending-message">
                Customer can now scan QR code to pay
              </p>
            )}
            {status === "processing" && (
              <p className={`text-xs ${statusInfo.textColor}`} data-testid="processing-message">
                Payment is being processed...
              </p>
            )}
            {(status === "completed" || status === "approved") && (
              <p className={`text-xs ${statusInfo.textColor}`} data-testid="completed-message">
                Transaction completed successfully!
              </p>
            )}
            {(status === "failed" || status === "declined") && (
              <p className={`text-xs ${statusInfo.textColor}`} data-testid="failed-message">
                Please try again or contact support
              </p>
            )}
            {status === "cancelled" && (
              <p className={`text-xs ${statusInfo.textColor}`} data-testid="cancelled-message">
                Payment was cancelled by customer
              </p>
            )}
            {status === "refunded" && (
              <p className={`text-xs ${statusInfo.textColor}`} data-testid="refunded-message">
                Full refund has been processed
              </p>
            )}
            {status === "partially_refunded" && (
              <p className={`text-xs ${statusInfo.textColor}`} data-testid="partial-refund-message">
                Partial refund has been processed
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}