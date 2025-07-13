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
      <div className="mb-6">
        {actualQrCodeUrl ? (
          <img 
            src={actualQrCodeUrl} 
            alt="Payment QR Code" 
            className="w-44 h-44 object-contain mx-auto"
          />
        ) : (
          <div className="w-48 h-48 mx-auto flex items-center justify-center">
            <div className="text-center">
              <QrCode className="w-16 h-16 text-white/60 mb-2 mx-auto" />
              <p className="text-sm text-white/70">QR Code will appear<br />when transaction is created</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-white/60 mt-4">
        Customers scan this QR code to pay
      </p>
    </div>
  );
}
