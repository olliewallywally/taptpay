import { QrCode } from "lucide-react";

interface QRCodeDisplayProps {
  paymentUrl?: string;
  qrCodeUrl?: string;
  merchantId?: number;
  stoneId?: number;
}

/**
 * A sale's own QR code (`qrCodeUrl`), or a payment board's (`merchantId` + `stoneId`);
 * otherwise a placeholder. The business-wide no-board QR (/api/merchants/:id/qr) was retired
 * on 2026-09-25 (server/no-board-address.ts), so there is no fallback to it.
 */
export function QRCodeDisplay({ qrCodeUrl, merchantId, stoneId }: QRCodeDisplayProps) {
  const actualQrCodeUrl = qrCodeUrl || (merchantId && stoneId
    ? `/api/merchants/${merchantId}/stone/${stoneId}/qr`
    : undefined);
  return (
    <div className="w-full h-full bg-[#0A1628] rounded-xl flex items-center justify-center p-2">
      {actualQrCodeUrl ? (
        <img 
          src={actualQrCodeUrl} 
          alt="Payment QR Code" 
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <QrCode className="w-8 h-8 text-[#00E5CC]/40" />
        </div>
      )}
    </div>
  );
}
