import { useLocation } from "wouter";

import RetailTerminalView from "@/features/terminal/retail/RetailTerminalView";

const QR_SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 60 60" fill="none"><rect width="60" height="60" fill="#040D6D"/><path d="M6 14V8a2 2 0 012-2h6" stroke="#58ABFF" stroke-width="3" stroke-linecap="round"/><path d="M54 14V8a2 2 0 00-2-2h-6" stroke="#58ABFF" stroke-width="3" stroke-linecap="round"/><path d="M6 46v6a2 2 0 002 2h6" stroke="#58ABFF" stroke-width="3" stroke-linecap="round"/><path d="M54 46v6a2 2 0 01-2 2h-6" stroke="#58ABFF" stroke-width="3" stroke-linecap="round"/><rect x="18" y="18" width="9" height="9" rx="1.5" fill="#58ABFF"/><rect x="33" y="18" width="9" height="9" rx="1.5" fill="#58ABFF"/><rect x="18" y="33" width="9" height="9" rx="1.5" fill="#58ABFF"/><rect x="33" y="33" width="3" height="3" fill="#58ABFF"/><rect x="38" y="33" width="3" height="3" fill="#58ABFF"/><rect x="33" y="38" width="3" height="3" fill="#58ABFF"/><rect x="38" y="38" width="3" height="3" fill="#58ABFF"/></svg>`;

const downloadQr = (kind) => {
  const blob = new Blob([QR_SVG_CONTENT], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${kind}-qr.svg`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const browserShare = async (intent) => {
  if (intent.channel === "copy") {
    await navigator.clipboard?.writeText(intent.url).catch(() => {});
    return;
  }

  if (intent.channel === "download-qr") {
    downloadQr(intent.kind);
    return;
  }

  const title = intent.kind === "receipt" ? "Your Receipt" : `Payment Request — $${(intent.amountCents / 100).toFixed(2)}`;
  const body = intent.kind === "receipt" ? `Your receipt: ${intent.url}` : `Pay here: ${intent.url}`;
  if (intent.channel === "email") {
    window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`);
    return;
  }

  const isAppleDevice = /Mac|iPhone|iPad/.test(navigator.userAgent);
  window.open(`sms:${isAppleDevice ? "&" : "?"}body=${encodeURIComponent(body)}`);
};

const productionRefund = async (intent) => {
  const token = localStorage.getItem("authToken");
  const response = await fetch(`/api/transactions/${intent.transactionId}/refunds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      refundAmount: intent.refundAmount,
      refundReason: intent.refundReason,
      refundMethod: intent.refundMethod,
    }),
  });
  if (response.ok) return;
  const data = await response.json().catch(() => ({}));
  throw new Error(data.message || "Refund failed");
};

/**
 * Compatibility controller for the historical SmartTransitions import path.
 * Browser/network effects stay here; the shared RetailTerminalView is pure.
 */
export default function SmartTransitions(props = {}) {
  const [, setLocation] = useLocation();
  const {
    onLiveCommit,
    onLiveStockCommit,
    onLiveDetailsCommit,
    onLiveCancel,
    onLivePaywave,
    onLiveSend,
  } = props;

  const createSale = props.onCreateSale ?? (async (draft, options) => {
    if (options.existing && options.paywave && onLivePaywave) {
      return onLivePaywave(draft);
    }
    if (onLiveSend) return onLiveSend(draft, options);
    return onLiveCommit?.(draft, options);
  });

  return (
    <RetailTerminalView
      {...props}
      onCreateSale={createSale}
      onCreateSplit={props.onCreateSplit ?? createSale}
      onCancel={props.onCancel ?? (() => onLiveCancel?.())}
      onPickStock={props.onPickStock ?? onLiveStockCommit}
      onShare={props.onShare ?? browserShare}
      onCashSale={props.onCashSale ?? onLiveDetailsCommit}
      onRefund={props.onRefund ?? productionRefund}
      onOpenReceipt={props.onOpenReceipt ?? ((transaction) => setLocation(`/receipt/${transaction.id}`))}
      onNavigate={props.onNavigate}
    />
  );
}
