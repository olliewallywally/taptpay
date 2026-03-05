import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QRCodeDisplayProps {
  paymentUrl?: string;
  qrCodeUrl?: string;
  merchantId?: number;
  stoneId?: number;
}

export function QRCodeDisplay({ paymentUrl, qrCodeUrl, merchantId, stoneId }: QRCodeDisplayProps) {
  const actualQrCodeUrl = qrCodeUrl || (merchantId ? 
    (stoneId ? `/api/merchants/${merchantId}/stone/${stoneId}/qr` : `/api/merchants/${merchantId}/qr`) 
    : undefined);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const handleDownloadQR = async () => {
    if (!merchantId || isDownloading) return;

    setIsDownloading(true);
    try {
      // Fetch high-quality QR code for download (800px with download flag)
      const downloadUrl = stoneId 
        ? `/api/merchants/${merchantId}/stone/${stoneId}/qr?size=800&download=true`
        : `/api/merchants/${merchantId}/qr?size=800&download=true`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Failed to fetch QR code');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = stoneId 
        ? `tapt-payment-qr-merchant-${merchantId}-stone-${stoneId}.png`
        : `tapt-payment-qr-merchant-${merchantId}.png`;
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
