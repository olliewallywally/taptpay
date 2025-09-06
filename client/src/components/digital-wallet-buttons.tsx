import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, CreditCard } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface DigitalWalletButtonsProps {
  amount: number;
  currency: string;
  merchantName: string;
  itemName: string;
  transactionId?: number;
  onPaymentStart: () => void;
  onPaymentSuccess: (paymentData: any) => void;
  onPaymentError: (error: string) => void;
  disabled?: boolean;
}

export function DigitalWalletButtons({
  amount,
  currency = "NZD",
  merchantName,
  itemName,
  transactionId,
  onPaymentStart,
  onPaymentSuccess,
  onPaymentError,
  disabled = false
}: DigitalWalletButtonsProps) {
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  const [paymentRequestSupported, setPaymentRequestSupported] = useState(false);

  useEffect(() => {
    // Check Apple Pay support
    if (window.ApplePaySession) {
      const isApplePaySupported = window.ApplePaySession.canMakePayments();
      setApplePaySupported(isApplePaySupported);
    }

    // Check Payment Request API support
    if (window.PaymentRequest) {
      setPaymentRequestSupported(true);
      
      // Check Google Pay support (works best in Chrome)
      const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
      setGooglePaySupported(isChrome);
    }
  }, []);

  const handleApplePay = async () => {
    if (!window.ApplePaySession || !applePaySupported) {
      onPaymentError("Apple Pay is not supported on this device");
      return;
    }

    if (!transactionId) {
      onPaymentError("Transaction ID is required for Apple Pay");
      return;
    }

    try {
      onPaymentStart();

      const paymentRequest = {
        countryCode: 'NZ',
        currencyCode: currency,
        supportedNetworks: ['visa', 'masterCard', 'amex', 'eftpos'],
        merchantCapabilities: ['supports3DS'],
        total: {
          label: merchantName,
          amount: amount.toFixed(2),
          type: 'final'
        },
        lineItems: [{
          label: itemName,
          amount: amount.toFixed(2),
          type: 'final'
        }]
      };

      const session = new window.ApplePaySession(3, paymentRequest);

      session.onvalidatemerchant = async (event: any) => {
        try {
          // Call backend for merchant validation
          const response = await apiRequest("POST", "/api/payments/apple-pay/validate", {
            validationURL: event.validationURL,
            displayName: merchantName
          });
          
          const merchantSession = await response.json();
          session.completeMerchantValidation(merchantSession);
        } catch (error) {
          console.error("Merchant validation failed:", error);
          onPaymentError("Apple Pay merchant validation failed");
          session.abort();
        }
      };

      session.onpaymentauthorized = async (event: any) => {
        try {
          // Process payment through backend
          const response = await apiRequest("POST", "/api/payments/apple-pay/process", {
            payment: event.payment,
            transactionId: transactionId,
            amount: amount,
            currency: currency
          });

          const result = await response.json();
          
          if (result.success) {
            onPaymentSuccess(result);
            session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
          } else {
            onPaymentError("Apple Pay payment failed");
            session.completePayment(window.ApplePaySession.STATUS_FAILURE);
          }
        } catch (error) {
          console.error("Payment processing failed:", error);
          onPaymentError("Apple Pay payment processing failed");
          session.completePayment(window.ApplePaySession.STATUS_FAILURE);
        }
      };

      session.oncancel = () => {
        onPaymentError("Apple Pay payment cancelled");
      };

      session.begin();
    } catch (error) {
      console.error("Apple Pay error:", error);
      onPaymentError("Apple Pay payment failed");
    }
  };

  const handleGooglePay = async () => {
    if (!paymentRequestSupported || !googlePaySupported) {
      onPaymentError("Google Pay is not supported in this browser");
      return;
    }

    if (!transactionId) {
      onPaymentError("Transaction ID is required for Google Pay");
      return;
    }

    try {
      onPaymentStart();

      const paymentMethods = [{
        supportedMethods: 'https://google.com/pay',
        data: {
          environment: 'TEST', // Change to 'PRODUCTION' for live
          apiVersion: 2,
          apiVersionMinor: 0,
          allowedPaymentMethods: [{
            type: 'CARD',
            parameters: {
              allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: ['MASTERCARD', 'VISA', 'AMEX']
            },
            tokenizationSpecification: {
              type: 'PAYMENT_GATEWAY',
              parameters: {
                gateway: 'windcave',
                gatewayMerchantId: 'test-merchant'
              }
            }
          }]
        }
      }];

      const paymentDetails = {
        total: {
          label: itemName,
          amount: {
            currency: currency,
            value: amount.toFixed(2)
          }
        }
      };

      const request = new PaymentRequest(paymentMethods, paymentDetails);
      const response = await request.show();
      
      try {
        // Process payment through backend
        const backendResponse = await apiRequest("POST", "/api/payments/google-pay/process", {
          paymentMethodData: response.details,
          transactionId: transactionId,
          amount: amount,
          currency: currency
        });

        const result = await backendResponse.json();
        
        if (result.success) {
          onPaymentSuccess(result);
          response.complete('success');
        } else {
          onPaymentError("Google Pay payment failed");
          response.complete('fail');
        }
      } catch (error) {
        console.error("Payment processing failed:", error);
        onPaymentError("Google Pay payment processing failed");
        response.complete('fail');
      }
    } catch (error) {
      console.error("Google Pay error:", error);
      onPaymentError("Google Pay payment failed");
    }
  };

  const handleFallbackPayment = () => {
    onPaymentStart();
    // This would redirect to your standard payment flow
    console.log("Fallback payment initiated");
  };

  return (
    <div className="space-y-3">
      {/* Digital Wallet Buttons - Side by Side */}
      {(applePaySupported || googlePaySupported) && (
        <div className="flex space-x-3 mb-3">
          {/* Apple Pay Button */}
          {applePaySupported && (
            <button
              onClick={handleApplePay}
              disabled={disabled}
              className="flex-1 h-12 bg-black text-white rounded-lg flex items-center justify-center font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <svg width="50" height="20" viewBox="0 0 50 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.9 2.9c-.5.6-.9 1.4-.8 2.2.8.1 1.7-.4 2.2-1 .5-.6.8-1.4.7-2.2-.8 0-1.6.4-2.1 1zm2.1 3.5c-1.2-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.7-3.2 1.8-1.4 2.4-.4 5.9 1 7.8.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6 1.2 0 1.5.6 2.6.6 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-3.2 0-2.1 1.7-3.1 1.8-3.2-1-1.5-2.5-1.6-3.1-1.6-.4-.1-.9-.3-1.4-.3z" fill="white"/>
                <text x="18" y="15" fill="white" fontSize="11" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif">Pay</text>
              </svg>
            </button>
          )}

          {/* Google Pay Button */}
          {googlePaySupported && (
            <button
              onClick={handleGooglePay}
              disabled={disabled}
              className="flex-1 h-12 bg-white text-black rounded-lg flex items-center justify-center font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
            >
              <svg width="70" height="20" viewBox="0 0 70 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M31.9 8.6c0 2.7-2.1 4.7-4.7 4.7-2.6 0-4.7-2-4.7-4.7 0-2.6 2.1-4.7 4.7-4.7 2.6 0 4.7 2.1 4.7 4.7zm-2.1 0c0-1.5-1.1-2.5-2.6-2.5s-2.6 1-2.6 2.5c0 1.5 1.1 2.5 2.6 2.5s2.6-1 2.6-2.5z" fill="#4285F4"/>
                <path d="M42.4 8.6c0 2.7-2.1 4.7-4.7 4.7-2.6 0-4.7-2-4.7-4.7 0-2.6 2.1-4.7 4.7-4.7 2.6 0 4.7 2.1 4.7 4.7zm-2.1 0c0-1.5-1.1-2.5-2.6-2.5s-2.6 1-2.6 2.5c0 1.5 1.1 2.5 2.6 2.5s2.6-1 2.6-2.5z" fill="#EA4335"/>
                <path d="M52.4 4.1v8.5c0 3.5-2.1 4.9-4.5 4.9-2.3 0-3.7-1.5-4.2-2.8l1.8-.8c.3.8 1.1 1.7 2.4 1.7 1.6 0 2.5-1 2.5-2.8v-.7h-.1c-.5.6-1.4 1.1-2.5 1.1-2.4 0-4.6-2.1-4.6-4.7s2.2-4.7 4.6-4.7c1.1 0 2 .5 2.5 1.1h.1V4.1h2zm-1.9 4.5c0-1.5-1-2.5-2.3-2.5-1.3 0-2.4 1-2.4 2.5s1.1 2.5 2.4 2.5c1.3 0 2.3-1 2.3-2.5z" fill="#4285F4"/>
                <path d="M55.2 1v12.1h-2.1V1h2.1z" fill="#34A853"/>
                <path d="M62.4 10.4l1.7 1.1c-.6.8-1.9 2.2-4.2 2.2-2.9 0-5-2.2-5-4.7 0-2.8 2.1-4.7 4.8-4.7 2.6 0 3.9 2.1 4.3 3.2l.2.6L58 9.8c.5 1 1.3 1.5 2.4 1.5 1.1 0 1.9-.5 2.4-1.3zm-6.2-2.1h5.1c-.3-.9-1.1-1.4-2.1-1.4-1.3 0-2.4.6-3 1.4z" fill="#EA4335"/>
                <path d="M8.4 6.2v2h4.8c-.2 1.1-.8 1.9-1.6 2.5-.7.6-1.7.9-3.2.9-2.5 0-4.5-2-4.5-4.5S5.9 2.6 8.4 2.6c1.4 0 2.4.5 3.1 1.2l1.4-1.4c-1.1-1-2.5-1.8-4.5-1.8-3.6 0-6.6 3-6.6 6.6s3 6.6 6.6 6.6c1.9 0 3.4-.6 4.5-1.8 1.2-1.2 1.5-2.8 1.5-4.1 0-.4 0-.8-.1-1.1H8.4v-.6z" fill="#4285F4"/>
              </svg>
            </button>
          )}

          {/* If only one digital wallet is supported, fill the space */}
          {applePaySupported && !googlePaySupported && (
            <div className="flex-1"></div>
          )}
          {!applePaySupported && googlePaySupported && (
            <div className="flex-1"></div>
          )}
        </div>
      )}

      {/* Fallback/Manual Payment Button */}
      <button
        onClick={handleFallbackPayment}
        disabled={disabled}
        className="w-full h-12 backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex items-center justify-center space-x-2">
          <CreditCard className="w-4 h-4" />
          <span>Pay with Card</span>
        </span>
      </button>

      {/* NFC/Tap to Pay Option */}
      <button
        onClick={handleFallbackPayment}
        disabled={disabled}
        className="w-full h-12 backdrop-blur-xl bg-emerald-500/10 border border-emerald-400/30 rounded-lg text-emerald-200 font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex items-center justify-center space-x-2">
          <Smartphone className="w-4 h-4" />
          <span>Tap to Pay</span>
        </span>
      </button>

      {/* Warning Message */}
      {!applePaySupported && !googlePaySupported && (
        <div className="text-xs text-white/60 text-center mt-4 p-3 backdrop-blur-xl bg-yellow-500/10 border border-yellow-400/30 rounded-lg">
          <p>Digital wallets not available on this device.</p>
          <p>Use card payment or NFC instead.</p>
        </div>
      )}
    </div>
  );
}

// Type declarations for Apple Pay
declare global {
  interface Window {
    ApplePaySession: any;
  }
}