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
        title: "Payment Terminal Ready",
        description: "Ask customer to tap their card or digital wallet.",
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
      // Simulate waiting for customer to tap their card/phone
      // In real implementation, this would wait for actual NFC hardware response
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await fetch(`/api/nfc-sessions/${nfcSession.sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethod: 'contactless_card', // Simulate contactless card tap
          cardLast4: '4532',
          deviceId: navigator.userAgent
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete NFC payment');
      }

      const result = await response.json();
      setPaymentStatus("completed");
      
      toast({
        title: "Payment Received!",
        description: `Customer paid $${nfcSession.amount} successfully`,
      });

      // Auto-reset after showing success
      setTimeout(() => {
        resetPayment();
      }, 4000);

    } catch (error) {
      console.error('NFC payment failed:', error);
      setPaymentStatus("failed");
      
      toast({
        title: "Payment Failed",
        description: "Ask customer to try tapping again or use different payment method.",
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

      {/* Minimalist NFC Payment Overlay */}
      {showNfcOverlay && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm">
          <div className="min-h-screen flex items-center justify-center p-8">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-12 max-w-md w-full text-center backdrop-blur-xl shadow-2xl relative">
              
              {paymentStatus === "ready" && (
                <div className="space-y-12">
                  {/* Close Button */}
                  <button
                    onClick={closeNfcOverlay}
                    className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  >
                    <X className="h-5 w-5 text-white/70" />
                  </button>
                  
                  {/* Minimal NFC Icon */}
                  <div className="mx-auto w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Waves className="h-8 w-8 text-white/80" />
                  </div>
                  
                  {/* Clean Typography */}
                  <div className="space-y-2">
                    <div className="text-5xl font-extralight text-white tracking-tight">${nfcSession?.amount}</div>
                    <div className="text-white/60 text-lg font-light">{nfcSession?.itemName}</div>
                  </div>
                  
                  {/* Simple Instruction */}
                  <div className="space-y-6">
                    <div className="text-white/80 text-xl font-light">Tap to Pay</div>
                    <div className="text-white/50 text-sm">Present card or device to terminal</div>
                    
                    {/* Simulation Button - Clean Design */}
                    <button
                      onClick={simulateNFCTap}
                      className="w-full mt-8 py-4 px-6 bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl text-white/90 text-sm font-light transition-all duration-200 hover:border-white/30"
                    >
                      Simulate Payment
                    </button>
                  </div>
                </div>
              )}
              
              {paymentStatus === "processing" && (
                <div className="space-y-12">
                  {/* Minimal Processing Indicator */}
                  <div className="mx-auto w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
                  </div>
                  
                  {/* Clean Processing Text */}
                  <div className="space-y-4">
                    <div className="text-white/90 text-2xl font-light">Processing</div>
                    <div className="text-white/60 text-sm">Please wait...</div>
                  </div>
                </div>
              )}
              
              {paymentStatus === "completed" && (
                <div className="space-y-12">
                  {/* Minimal Success Icon */}
                  <div className="mx-auto w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  </div>
                  
                  {/* Clean Success Message */}
                  <div className="space-y-4">
                    <div className="text-white/90 text-2xl font-light">Payment Complete</div>
                    <div className="text-green-400/80 text-lg font-light">${nfcSession?.amount}</div>
                  </div>
                  
                  {/* Simple Action Button */}
                  <button
                    onClick={resetPayment}
                    className="w-full py-4 px-6 bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl text-white/90 text-sm font-light transition-all duration-200 hover:border-white/30"
                  >
                    New Payment
                  </button>
                </div>
              )}
              
              {paymentStatus === "failed" && (
                <div className="space-y-12">
                  {/* Minimal Error Icon */}
                  <div className="mx-auto w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  
                  {/* Clean Error Message */}
                  <div className="space-y-4">
                    <div className="text-white/90 text-2xl font-light">Payment Failed</div>
                    <div className="text-white/60 text-sm">Please try again</div>
                  </div>
                  
                  {/* Simple Retry Button */}
                  <button
                    onClick={resetPayment}
                    className="w-full py-4 px-6 bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl text-white/90 text-sm font-light transition-all duration-200 hover:border-white/30"
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
          <h1 className="text-3xl font-thin text-white mb-3">NFC Terminal</h1>
          <p className="text-white/60 font-light">Accept contactless payments</p>
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
              style={{
                width: '100%',
                padding: '24px',
                background: (!nfcCapabilities?.nfcSupported || !amount || !itemName) 
                  ? 'rgba(107, 114, 128, 0.5)' 
                  : 'linear-gradient(to right, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8), rgba(34, 197, 94, 0.8))',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                borderRadius: '16px',
                color: 'white',
                fontSize: '18px',
                fontWeight: '300',
                cursor: (!nfcCapabilities?.nfcSupported || !amount || !itemName) ? 'not-allowed' : 'pointer',
                opacity: (!nfcCapabilities?.nfcSupported || !amount || !itemName) ? 0.5 : 1,
                transition: 'all 0.3s ease'
              }}
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
                {paymentStatus === "ready" && "Waiting for Customer"}
                {paymentStatus === "processing" && "Processing Payment..."}
                {paymentStatus === "completed" && "Payment Received"}
                {paymentStatus === "failed" && "Payment Failed"}
              </span>
            </div>
            
            {paymentStatus === "ready" && (
              <button
                onClick={() => setShowNfcOverlay(true)}
                className="text-blue-400 hover:text-blue-300 transition-colors font-light"
              >
                Show Payment Screen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}