import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Waves, CreditCard, CheckCircle, XCircle, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NFCPayment() {
  const [nfcCapabilities, setNfcCapabilities] = useState<any>(null);
  const [merchantId, setMerchantId] = useState<string>("22");
  const [amount, setAmount] = useState<string>("10.00");
  const [itemName, setItemName] = useState<string>("Coffee");
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "creating" | "ready" | "processing" | "completed" | "failed">("idle");
  const [nfcSession, setNfcSession] = useState<any>(null);
  const [showNfcOverlay, setShowNfcOverlay] = useState(false);
  const { toast } = useToast();

  // Check NFC capabilities on load
  useEffect(() => {
    const checkCapabilities = async () => {
      try {
        const response = await fetch('/api/nfc/capabilities');
        const capabilities = await response.json();
        setNfcCapabilities(capabilities);
        
        if (!capabilities.nfcSupported) {
          toast({
            title: "NFC Not Supported",
            description: "This device doesn't support NFC payments. Use QR code instead.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Failed to check NFC capabilities:', error);
      }
    };
    
    checkCapabilities();
  }, [toast]);

  const createNFCPayment = async () => {
    if (!amount || !itemName || !merchantId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setPaymentStatus("creating");
    
    try {
      const response = await fetch(`/api/merchants/${merchantId}/nfc-pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          itemName,
          deviceId: navigator.userAgent,
          nfcCapabilities: nfcCapabilities
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create NFC payment session');
      }

      const result = await response.json();
      setNfcSession(result.nfcSession);
      setPaymentStatus("ready");
      setShowNfcOverlay(true);
      
      toast({
        title: "NFC Payment Ready",
        description: "Hold your phone near the merchant's device to pay.",
      });
    } catch (error) {
      console.error('NFC payment creation failed:', error);
      setPaymentStatus("failed");
      toast({
        title: "Payment Failed",
        description: "Could not create NFC payment session.",
        variant: "destructive",
      });
    }
  };

  const simulateNFCTap = async () => {
    if (!nfcSession) return;
    
    setPaymentStatus("processing");
    
    try {
      const response = await fetch(`/api/nfc-sessions/${nfcSession.sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethod: nfcCapabilities?.applePay ? 'apple_pay' : 
                        nfcCapabilities?.googlePay ? 'google_pay' : 'contactless_card',
          paymentData: { 
            deviceFingerprint: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        }),
      });

      if (!response.ok) {
        throw new Error('NFC payment failed');
      }

      // Wait for completion (simulated timing)
      setTimeout(() => {
        const success = Math.random() > 0.1; // 90% success rate
        setPaymentStatus(success ? "completed" : "failed");
        
        if (success) {
          setShowNfcOverlay(false);
        }
        
        toast({
          title: success ? "Payment Successful!" : "Payment Failed",
          description: success ? 
            `$${amount} paid via ${nfcCapabilities?.applePay ? 'Apple Pay' : 'NFC'}` :
            "Payment was declined. Please try again.",
          variant: success ? "default" : "destructive",
        });
      }, 2500);
      
    } catch (error) {
      console.error('NFC payment failed:', error);
      setPaymentStatus("failed");
      toast({
        title: "Payment Failed",
        description: "NFC payment could not be completed.",
        variant: "destructive",
      });
    }
  };

  const resetPayment = () => {
    setPaymentStatus("idle");
    setNfcSession(null);
    setShowNfcOverlay(false);
    setAmount("10.00");
    setItemName("Coffee");
  };

  const closeNfcOverlay = () => {
    setShowNfcOverlay(false);
    setPaymentStatus("idle");
    setNfcSession(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Smartphone className="h-8 w-8 text-blue-600" />
            <Waves className="h-6 w-6 text-blue-500" />
            <CreditCard className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Tap to Pay
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Contactless NFC payments with Apple Pay, Google Pay & more
          </p>
        </div>

        {/* NFC Capabilities Card */}
        {nfcCapabilities && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Device Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {nfcCapabilities.nfcSupported && (
                  <Badge variant="default">NFC Supported</Badge>
                )}
                {nfcCapabilities.applePay && (
                  <Badge variant="secondary">Apple Pay</Badge>
                )}
                {nfcCapabilities.googlePay && (
                  <Badge variant="secondary">Google Pay</Badge>
                )}
                {nfcCapabilities.samsungPay && (
                  <Badge variant="secondary">Samsung Pay</Badge>
                )}
                {nfcCapabilities.contactlessCard && (
                  <Badge variant="outline">Contactless Cards</Badge>
                )}
              </div>
              {nfcCapabilities.recommendations?.length > 0 && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  💡 {nfcCapabilities.recommendations[0]}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payment Setup Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create NFC Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="merchantId">Merchant ID</Label>
                <Input
                  id="merchantId"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  placeholder="Enter merchant ID"
                />
              </div>
              <div>
                <Label htmlFor="amount">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="itemName">Item</Label>
                <Input
                  id="itemName"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Item name"
                />
              </div>
            </div>
            
            {paymentStatus === "idle" && (
              <Button 
                onClick={createNFCPayment}
                className="w-full"
                disabled={!nfcCapabilities?.nfcSupported}
              >
                <Waves className="mr-2 h-4 w-4" />
                Create NFC Payment
              </Button>
            )}
          </CardContent>
        </Card>

        {/* NFC Payment Status Card */}
        {nfcSession && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {paymentStatus === "ready" && <Waves className="h-5 w-5 text-blue-500 animate-pulse" />}
                {paymentStatus === "processing" && <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />}
                {paymentStatus === "completed" && <CheckCircle className="h-5 w-5 text-green-500" />}
                {paymentStatus === "failed" && <XCircle className="h-5 w-5 text-red-500" />}
                
                {paymentStatus === "ready" && "Ready for NFC Tap"}
                {paymentStatus === "processing" && "Processing Payment..."}
                {paymentStatus === "completed" && "Payment Successful!"}
                {paymentStatus === "failed" && "Payment Failed"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <div className="text-lg font-semibold mb-2">Payment Details</div>
                  <div className="space-y-1 text-sm">
                    <div>Amount: <span className="font-medium">${nfcSession.amount}</span></div>
                    <div>Merchant: <span className="font-medium">{nfcSession.merchantName}</span></div>
                    <div>Session: <span className="font-mono text-xs">{nfcSession.sessionId}</span></div>
                  </div>
                </div>

                {paymentStatus === "ready" && (
                  <div className="text-center space-y-4">
                    <div className="text-6xl">📱</div>
                    <p className="text-gray-600 dark:text-gray-400">
                      Hold your phone near the payment terminal or tap the button below to simulate
                    </p>
                    <Button 
                      onClick={simulateNFCTap}
                      className="w-full"
                      size="lg"
                    >
                      <Waves className="mr-2 h-4 w-4" />
                      Simulate NFC Tap
                    </Button>
                  </div>
                )}

                {paymentStatus === "processing" && (
                  <div className="text-center space-y-4">
                    <div className="text-6xl animate-bounce">⚡</div>
                    <p className="text-gray-600 dark:text-gray-400">
                      Processing your payment securely...
                    </p>
                  </div>
                )}

                {(paymentStatus === "completed" || paymentStatus === "failed") && (
                  <div className="text-center space-y-4">
                    <Button 
                      onClick={resetPayment}
                      variant="outline"
                      className="w-full"
                    >
                      Make Another Payment
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Supported Methods */}
        <Card>
          <CardHeader>
            <CardTitle>Supported Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-4 border rounded-lg">
                <div className="text-2xl mb-2">🍎</div>
                <div className="text-sm font-medium">Apple Pay</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl mb-2">🔵</div>
                <div className="text-sm font-medium">Google Pay</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl mb-2">📱</div>
                <div className="text-sm font-medium">Samsung Pay</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl mb-2">💳</div>
                <div className="text-sm font-medium">Contactless Cards</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* NFC Overlay */}
        {showNfcOverlay && (
          <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex flex-col animate-in fade-in duration-300">
            {/* Tap Here Indicator at Top - Slides down smoothly */}
            <div className="bg-gradient-to-r from-green-600 to-green-700 text-white text-center py-6 relative shadow-lg animate-in slide-in-from-top duration-500 ease-out">
              <Button
                onClick={closeNfcOverlay}
                variant="ghost"
                size="sm"
                className="absolute right-4 top-4 text-white hover:bg-green-800 rounded-full w-8 h-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
              
              {/* Tapt Logo and Payment Info */}
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-green-700 font-bold text-sm">T</span>
                </div>
                <span className="text-2xl font-light tracking-wide">TAPT</span>
              </div>
              
              <div className="flex items-center justify-center gap-2 mb-1">
                <Waves className="h-4 w-4 animate-pulse" />
                <span className="text-sm font-medium uppercase tracking-wider">TAP HERE TO PAY</span>
                <Waves className="h-4 w-4 animate-pulse" />
              </div>
              
              <div className="text-xs opacity-90 font-light">
                ${nfcSession?.amount} • {nfcSession?.merchantName}
              </div>
            </div>
            
            {/* Main Overlay Content */}
            <div className="flex-1 flex items-center justify-center p-6">
              <Card className="w-full max-w-md border-0 shadow-2xl animate-in slide-in-from-bottom duration-700 ease-out delay-200">
                <CardContent className="p-8 text-center bg-white/95 backdrop-blur-sm rounded-lg">
                  <div className="space-y-6">
                    {paymentStatus === "ready" && (
                      <>
                        <div className="text-5xl mb-6 animate-pulse">📱</div>
                        <div>
                          <h3 className="text-xl font-semibold mb-3 text-gray-800">Hold Near Device</h3>
                          <p className="text-gray-500 mb-6 text-sm">
                            Position your phone near the payment terminal
                          </p>
                          <div className="flex justify-center space-x-2 mb-8">
                            {nfcCapabilities?.applePay && <Badge variant="secondary" className="text-xs">Apple Pay</Badge>}
                            {nfcCapabilities?.googlePay && <Badge variant="secondary" className="text-xs">Google Pay</Badge>}
                            {nfcCapabilities?.samsungPay && <Badge variant="secondary" className="text-xs">Samsung Pay</Badge>}
                            <Badge variant="outline" className="text-xs">Contactless</Badge>
                          </div>
                          <Button 
                            onClick={simulateNFCTap}
                            className="w-full bg-green-600 hover:bg-green-700 text-white border-0"
                            size="lg"
                          >
                            <Waves className="mr-2 h-4 w-4" />
                            Simulate Tap
                          </Button>
                        </div>
                      </>
                    )}
                    
                    {paymentStatus === "processing" && (
                      <>
                        <div className="text-5xl animate-bounce mb-6">⚡</div>
                        <div>
                          <h3 className="text-xl font-semibold mb-3 text-gray-800">Processing...</h3>
                          <p className="text-gray-500 text-sm mb-6">
                            Securely processing your payment
                          </p>
                          <div className="flex justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-green-600" />
                          </div>
                        </div>
                      </>
                    )}
                    
                    {paymentStatus === "completed" && (
                      <>
                        <div className="text-5xl mb-6">✅</div>
                        <div>
                          <h3 className="text-xl font-semibold text-green-600 mb-3">Payment Successful!</h3>
                          <p className="text-gray-500 text-sm mb-6">
                            ${nfcSession?.amount} charged successfully
                          </p>
                          <Button 
                            onClick={resetPayment}
                            variant="outline"
                            className="w-full border-gray-200"
                          >
                            Make Another Payment
                          </Button>
                        </div>
                      </>
                    )}
                    
                    {paymentStatus === "failed" && (
                      <>
                        <div className="text-5xl mb-6">❌</div>
                        <div>
                          <h3 className="text-xl font-semibold text-red-600 mb-3">Payment Failed</h3>
                          <p className="text-gray-500 text-sm mb-6">
                            Please try again or use another payment method
                          </p>
                          <div className="space-y-3">
                            <Button 
                              onClick={simulateNFCTap}
                              className="w-full bg-green-600 hover:bg-green-700"
                            >
                              Try Again
                            </Button>
                            <Button 
                              onClick={closeNfcOverlay}
                              variant="outline"
                              className="w-full border-gray-200"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}