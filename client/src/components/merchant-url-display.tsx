import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MerchantUrlDisplayProps {
  merchantId: number;
  paymentUrl: string;
  qrCodeUrl: string;
  businessName: string;
}

export function MerchantUrlDisplay({ merchantId, paymentUrl, qrCodeUrl, businessName }: MerchantUrlDisplayProps) {
  const { toast } = useToast();

  const handleCopyUrl = async (url: string, type: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Copied!",
        description: `${type} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the URL manually",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          Payment Links for {businessName}
        </CardTitle>
        <CardDescription>
          Share these links with customers for payments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Merchant ID</label>
            <Badge variant="outline">#{merchantId}</Badge>
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Customer Payment URL</label>
          <div className="flex items-center space-x-2">
            <Input value={paymentUrl} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyUrl(paymentUrl, "Payment URL")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(paymentUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">QR Code URL</label>
          <div className="flex items-center space-x-2">
            <Input value={qrCodeUrl} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyUrl(qrCodeUrl, "QR Code URL")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(qrCodeUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}