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
    <div className="min-h-screen relative overflow-hidden">
      {/* Dark Moving Gradients Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-black via-gray-900 to-gray-800">
        <div className="absolute inset-0 bg-gradient-to-tr from-gray-900/60 via-black/40 to-gray-700/30 animate-gradient-xy"></div>
        <div className="absolute inset-0 bg-gradient-to-bl from-gray-800/40 via-gray-900/60 to-black/50 animate-gradient-reverse"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-600/20 via-transparent to-gray-900/30 animate-pulse"></div>
      </div>

      {/* Glass Overlay Effect when NFC Payment is Active */}
      {showNfcOverlay && (
        <div className="fixed inset-0 z-50 backdrop-blur-2xl bg-black/60">
          <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-gray-900/30 to-gray-800/20"></div>
          
          <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
            <div className="backdrop-blur-3xl bg-white/[0.02] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
              
              {paymentStatus === "ready" && (
                <div className="space-y-8">
                  <div className="relative">
                    <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-white/20 flex items-center justify-center animate-pulse">
                      <Waves className="h-12 w-12 text-white/80" />
                    </div>
                    <div className="absolute inset-0 w-24 h-24 mx-auto rounded-full border-2 border-white/30 animate-ping"></div>
                  </div>
                  
                  <div>
                    <h2 className="text-2xl font-light text-white mb-2">Ready to Pay</h2>
                    <div className="text-4xl font-thin text-white mb-1">${nfcSession?.amount}</div>
                    <p className="text-white/60 text-sm">{nfcSession?.itemName}</p>
                  </div>
                  
                  <div className="space-y-4">
                    <button
                      onClick={simulateNFCTap}
                      className="w-full py-4 backdrop-blur-sm bg-gradient-to-r from-green-500/80 via-emerald-500/80 to-green-400/80 border border-green-400/50 text-white hover:from-green-400/90 hover:via-emerald-400/90 hover:to-green-300/90 hover:border-green-300/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] rounded-2xl transition-all duration-300 font-light"
                    >
                      Tap to Pay
                    </button>
                    
                    <button
                      onClick={() => setShowNfcOverlay(false)}
                      className="text-white/50 hover:text-white/80 transition-colors text-sm font-light"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              {paymentStatus === "processing" && (
                <div className="space-y-8">
                  <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-white/20 flex items-center justify-center">
                    <Loader2 className="h-12 w-12 text-white/80 animate-spin" />
                  </div>
                  
                  <div>
                    <h2 className="text-xl font-light text-white mb-2">Processing</h2>
                    <p className="text-white/60 text-sm">Please wait...</p>
                  </div>
                </div>
              )}
              
              {paymentStatus === "completed" && (
                <div className="space-y-8">
                  <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30 flex items-center justify-center">
                    <CheckCircle className="h-12 w-12 text-green-400" />
                  </div>
                  
                  <div>
                    <h2 className="text-xl font-light text-white mb-2">Payment Complete</h2>
                    <p className="text-white/60 text-sm">Thank you</p>
                  </div>
                  
                  <button
                    onClick={resetPayment}
                    className="w-full py-4 backdrop-blur-sm bg-gradient-to-r from-green-500/80 via-emerald-500/80 to-green-400/80 border border-green-400/50 text-white hover:from-green-400/90 hover:via-emerald-400/90 hover:to-green-300/90 hover:border-green-300/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] rounded-2xl transition-all duration-300 font-light"
                  >
                    New Payment
                  </button>
                </div>
              )}
              
              {paymentStatus === "failed" && (
                <div className="space-y-8">
                  <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-red-500/20 to-rose-500/20 border border-red-400/30 flex items-center justify-center">
                    <XCircle className="h-12 w-12 text-red-400" />
                  </div>
                  
                  <div>
                    <h2 className="text-xl font-light text-white mb-2">Payment Failed</h2>
                    <p className="text-white/60 text-sm">Please try again</p>
                  </div>
                  
                  <button
                    onClick={resetPayment}
                    className="w-full py-4 backdrop-blur-sm bg-gradient-to-r from-green-500/80 via-emerald-500/80 to-green-400/80 border border-green-400/50 text-white hover:from-green-400/90 hover:via-emerald-400/90 hover:to-green-300/90 hover:border-green-300/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] rounded-2xl transition-all duration-300 font-light"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 p-6 max-w-sm mx-auto min-h-screen flex flex-col justify-center">
        {/* Simple Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-thin text-white mb-3">NFC Payment</h1>
          <p className="text-white/60 font-light">Tap your phone to pay</p>
        </div>

        {/* Clean Payment Form */}
        <div className="space-y-6">
          {/* Amount Input */}
          <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-6">
            <label className="block text-white/70 text-sm font-light mb-3">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/60 text-2xl font-light">$</span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-4 bg-transparent text-white text-2xl font-light placeholder-white/40 focus:outline-none border-b border-white/20 focus:border-white/40 transition-colors"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Item Name Input */}
          <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-6">
            <label className="block text-white/70 text-sm font-light mb-3">Item</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full px-4 py-4 bg-transparent text-white text-lg font-light placeholder-white/40 focus:outline-none border-b border-white/20 focus:border-white/40 transition-colors"
              placeholder="Enter item name"
            />
          </div>

          {/* NFC Status */}
          {nfcCapabilities && (
            <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <span className="text-white/70 font-light">NFC Ready</span>
                <div className={`w-3 h-3 rounded-full ${nfcCapabilities.nfcSupported ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
              </div>
            </div>
          )}

          {/* Create Payment Button */}
          {paymentStatus === "idle" && (
            <button 
              onClick={createNFCPayment}
              disabled={!nfcCapabilities?.nfcSupported || !amount || !itemName}
              className="w-full py-6 backdrop-blur-sm bg-gradient-to-r from-green-500/80 via-emerald-500/80 to-green-400/80 border border-green-400/50 text-white hover:from-green-400/90 hover:via-emerald-400/90 hover:to-green-300/90 hover:border-green-300/60 hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 font-light text-lg"
            >
              Create Payment
            </button>
          )}
        </div>

        {/* Simple Payment Status */}
        {nfcSession && !showNfcOverlay && (
          <div className="mt-8 backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-6 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              {paymentStatus === "ready" && <Waves className="h-5 w-5 text-blue-400 animate-pulse" />}
              {paymentStatus === "processing" && <Loader2 className="h-5 w-5 text-yellow-400 animate-spin" />}
              {paymentStatus === "completed" && <CheckCircle className="h-5 w-5 text-green-400" />}
              {paymentStatus === "failed" && <XCircle className="h-5 w-5 text-red-400" />}
              
              <span className="text-white font-light">
                {paymentStatus === "ready" && "Payment Ready"}
                {paymentStatus === "processing" && "Processing..."}
                {paymentStatus === "completed" && "Success"}
                {paymentStatus === "failed" && "Failed"}
              </span>
            </div>
            
            {paymentStatus === "ready" && (
              <button
                onClick={() => setShowNfcOverlay(true)}
                className="text-blue-400 hover:text-blue-300 transition-colors font-light"
              >
                Open Payment
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}