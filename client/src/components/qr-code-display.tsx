import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QRCodeDisplayProps {
  paymentUrl?: string;
  qrCodeUrl?: string;
  merchantId?: number;
}

export function QRCodeDisplay({ paymentUrl, qrCodeUrl, merchantId }: QRCodeDisplayProps) {
  const actualQrCodeUrl = qrCodeUrl || (merchantId ? `/api/merchants/${merchantId}/qr` : undefined);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const handleDownloadQR = async () => {
    if (!merchantId || isDownloading) return;

    setIsDownloading(true);
    try {
      // Fetch high-quality QR code for download (800px with download flag)
      const downloadUrl = `/api/merchants/${merchantId}/qr?size=800&download=true`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Failed to fetch QR code');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `tapt-payment-qr-merchant-${merchantId}.png`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "QR Code Downloaded",
        description: "High-quality PNG saved to your downloads folder.",
      });
    } catch (error) {
      console.error('Failed to download QR code:', error);
      toast({
        title: "Download Failed",
        description: "Could not download QR code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };
  return (
    <div className="text-center">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Customer Payment QR</h3>
      
      <div className="bg-gray-50 rounded-2xl p-8 mb-6">
        {actualQrCodeUrl ? (
          <div className="w-48 h-48 mx-auto bg-white rounded-xl shadow-inner flex items-center justify-center">
            <img 
              src={actualQrCodeUrl} 
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

      {actualQrCodeUrl && (
        <div className="mb-6">
          <Button
            onClick={handleDownloadQR}
            disabled={isDownloading}
            variant="outline"
            size="sm"
            className="w-full border-green-200 text-green-800 hover:bg-green-50 hover:border-green-300 disabled:opacity-50"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download QR Code (PNG)
              </>
            )}
          </Button>
        </div>
      )}

      {paymentUrl && (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Payment Link:</p>
            <code className="text-sm text-green-800 font-mono break-all">
              {paymentUrl}
            </code>
          </div>
          
          <Button
            onClick={() => window.open(paymentUrl, '_blank')}
            variant="outline"
            size="sm"
            className="w-full border-blue-200 text-blue-800 hover:bg-blue-50 hover:border-blue-300"
          >
            View Customer Payment Page
          </Button>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-4">
        Customers scan this QR code to pay
      </p>
    </div>
  );
}
