import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bitcoin, Copy, Check, Loader2, ExternalLink, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import QRCode from "qrcode";
import { AnimatedBrandBackground } from "@/components/backgrounds/AnimatedBrandBackground";

export default function CryptoPayment() {
  const { transactionId } = useParams();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const { toast } = useToast();

  // Get transaction details
  const { data: transaction } = useQuery({
    queryKey: ["/api/transactions", transactionId],
    queryFn: async () => {
      const response = await fetch(`/api/transactions/${transactionId}`);
      if (!response.ok) throw new Error("Failed to fetch transaction");
      return response.json();
    },
    enabled: !!transactionId,
  });

  // Get crypto transaction details
  const { data: cryptoTx, isLoading } = useQuery({
    queryKey: ["/api/transactions", transactionId, "crypto"],
    queryFn: async () => {
      const response = await fetch(`/api/transactions/${transactionId}/crypto`);
      if (!response.ok) throw new Error("Failed to fetch crypto transaction");
      return response.json();
    },
    enabled: !!transactionId,
  });

  // Generate QR code
  useEffect(() => {
    if (cryptoTx?.walletAddress) {
      QRCode.toDataURL(cryptoTx.walletAddress, {
        width: 350,
        margin: 2,
      }).then(setQrDataUrl).catch(console.error);
    }
  }, [cryptoTx]);

  const copyAddress = () => {
    if (cryptoTx?.walletAddress) {
      navigator.clipboard.writeText(cryptoTx.walletAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      });
    }
  };

  const getCryptoIcon = (crypto: string) => {
    const icons: { [key: string]: string } = {
      BTC: "₿",
      ETH: "Ξ",
      USDC: "$",
      USDT: "₮",
      LTC: "Ł",
      BCH: "฿",
    };
    return icons[crypto] || "₿";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <Loader2 className="h-12 w-12 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (!cryptoTx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <Card className="bg-gray-800 border-gray-700 max-w-md">
          <CardContent className="p-8 text-center">
            <p className="text-white text-lg">Crypto payment not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <AnimatedBrandBackground 
        backgroundColor="#1a1f2e"
        circleColor="rgba(255, 140, 0, 0.15)"
      />
      
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="text-5xl">{getCryptoIcon(cryptoTx.cryptocurrency)}</div>
            <h1 className="text-3xl font-bold text-white">Pay with Crypto</h1>
          </div>
          <p className="text-gray-400">{transaction?.itemName}</p>
        </div>

        <Card className="bg-gray-800/90 backdrop-blur-sm border-gray-700">
          <CardContent className="p-6 sm:p-8">
            {/* Amount */}
            <div className="text-center mb-6">
              <p className="text-gray-400 text-sm mb-2">Amount to Pay</p>
              <div className="space-y-1">
                <p className="text-4xl sm:text-5xl font-bold text-white" data-testid="text-payment-crypto-amount">
                  {cryptoTx.cryptoAmount} {cryptoTx.cryptocurrency}
                </p>
                <p className="text-gray-400 text-lg">≈ ${cryptoTx.fiatAmount} NZD</p>
              </div>
            </div>

            {/* QR Code */}
            {qrDataUrl && (
              <div className="bg-white p-6 rounded-2xl mb-6 flex justify-center">
                <img 
                  src={qrDataUrl} 
                  alt="Payment QR Code" 
                  className="w-full max-w-xs" 
                  data-testid="img-payment-qr-code"
                />
              </div>
            )}

            {/* Wallet Address */}
            <div className="bg-gray-700/50 p-4 rounded-lg mb-6">
              <p className="text-gray-400 text-sm mb-2">Send to Address</p>
              <div className="flex items-center space-x-2">
                <p className="text-white text-xs sm:text-sm font-mono flex-1 break-all" data-testid="text-payment-wallet-address">
                  {cryptoTx.walletAddress}
                </p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={copyAddress}
                  className="border-gray-600 text-gray-300 shrink-0"
                  data-testid="button-copy-wallet-address"
                >
                  {copiedAddress ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-900/30 border border-blue-700 p-4 rounded-lg mb-6">
              <h3 className="text-blue-300 font-semibold mb-2">How to Pay</h3>
              <ol className="text-blue-200 text-sm space-y-1 list-decimal list-inside">
                <li>Open your crypto wallet app</li>
                <li>Scan the QR code or copy the address</li>
                <li>Send exactly {cryptoTx.cryptoAmount} {cryptoTx.cryptocurrency}</li>
                <li>Wait for confirmation (this page will update automatically)</li>
              </ol>
            </div>

            {/* Wallet Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button 
                className="w-full bg-orange-600 hover:bg-orange-700"
                data-testid="button-open-wallet"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Open Wallet
              </Button>
              <Button 
                variant="outline" 
                className="w-full border-gray-600 text-gray-300"
                onClick={() => window.open(cryptoTx.hostedUrl, '_blank')}
                data-testid="button-payment-link"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Share Link
              </Button>
            </div>

            {/* Status */}
            <div className="mt-6 text-center">
              <div className="flex items-center justify-center space-x-2 text-yellow-500">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <p className="text-sm" data-testid="text-payment-status">Waiting for payment...</p>
              </div>
              <p className="text-gray-500 text-xs mt-1">Payment expires in 60 minutes</p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-gray-500 text-sm">
            Powered by <span className="text-orange-500 font-semibold">Crypto Terminal</span>
          </p>
        </div>
      </div>
    </div>
  );
}
