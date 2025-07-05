import { Card } from "@/components/ui/card";
import { QrCode } from "lucide-react";

interface QRCodeDisplayProps {
  paymentUrl?: string;
  qrCodeUrl?: string;
}

export function QRCodeDisplay({ paymentUrl, qrCodeUrl }: QRCodeDisplayProps) {
  return (
    <div className="text-center">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Customer Payment QR</h3>
      
      <div className="bg-gray-50 rounded-2xl p-8 mb-6">
        {qrCodeUrl ? (
          <div className="w-48 h-48 mx-auto bg-white rounded-xl shadow-inner flex items-center justify-center">
            <img 
              src={qrCodeUrl} 
              alt="Payment QR Code" 
              className="w-44 h-44 object-contain"
            />
          </div>
        ) : (
          <div className="w-48 h-48 mx-auto bg-white rounded-xl shadow-inner flex items-center justify-center border-2 border-dashed border-gray-300">
            <div className="text-center">
              <QrCode className="w-16 h-16 text-gray-400 mb-2 mx-auto" />
              <p className="text-sm text-gray-500">QR Code will appear<br />when transaction is created</p>
            </div>
          </div>
        )}
      </div>

      {paymentUrl && (
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-500 mb-1">Payment Link:</p>
          <code className="text-sm text-[hsl(155,40%,25%)] font-mono break-all">
            {paymentUrl}
          </code>
        </div>
      )}
    </div>
  );
}
