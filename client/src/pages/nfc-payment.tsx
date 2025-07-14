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
                    <h2 className="text-2xl font-light text-white mb-2">Ready for Payment</h2>
                    <div className="text-4xl font-thin text-white mb-1">${nfcSession?.amount}</div>
                    <p className="text-white/60 text-sm">{nfcSession?.itemName}</p>
                    <p className="text-white/40 text-xs mt-2">Ask customer to tap their card or phone</p>
                  </div>
                  
                  <div className="space-y-4">
                    <button
                      onClick={simulateNFCTap}
                      style={{
                        width: '100%',
                        padding: '16px',
                        background: 'linear-gradient(to right, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8), rgba(34, 197, 94, 0.8))',
                        border: '1px solid rgba(34, 197, 94, 0.5)',
                        borderRadius: '16px',
                        color: 'white',
                        fontSize: '16px',
                        fontWeight: '300',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(to right, rgba(34, 197, 94, 0.9), rgba(16, 185, 129, 0.9), rgba(34, 197, 94, 0.9))';
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(to right, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8), rgba(34, 197, 94, 0.8))';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      Simulate Customer Tap
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
                  <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/30 flex items-center justify-center">
                    <Loader2 className="h-12 w-12 text-yellow-400 animate-spin" />
                  </div>
                  
                  <div>
                    <h2 className="text-xl font-light text-white mb-2">Processing Payment</h2>
                    <p className="text-white/60 text-sm">Waiting for customer's tap...</p>
                    <p className="text-white/40 text-xs mt-2">Customer should tap card or digital wallet now</p>
                  </div>
                </div>
              )}
              
              {paymentStatus === "completed" && (
                <div className="space-y-8">
                  <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30 flex items-center justify-center">
                    <CheckCircle className="h-12 w-12 text-green-400" />
                  </div>
                  
                  <div>
                    <h2 className="text-xl font-light text-white mb-2">Payment Successful</h2>
                    <p className="text-white/60 text-sm">Customer payment received</p>
                    <p className="text-white/40 text-xs mt-2">${nfcSession?.amount} charged successfully</p>
                  </div>
                  
                  <button
                    onClick={resetPayment}
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: 'linear-gradient(to right, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8), rgba(34, 197, 94, 0.8))',
                      border: '1px solid rgba(34, 197, 94, 0.5)',
                      borderRadius: '16px',
                      color: 'white',
                      fontSize: '16px',
                      fontWeight: '300',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
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
                    <p className="text-white/60 text-sm">Ask customer to try again</p>
                    <p className="text-white/40 text-xs mt-2">Check card placement or try different payment method</p>
                  </div>
                  
                  <button
                    onClick={resetPayment}
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: 'linear-gradient(to right, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8), rgba(34, 197, 94, 0.8))',
                      border: '1px solid rgba(34, 197, 94, 0.5)',
                      borderRadius: '16px',
                      color: 'white',
                      fontSize: '16px',
                      fontWeight: '300',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
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