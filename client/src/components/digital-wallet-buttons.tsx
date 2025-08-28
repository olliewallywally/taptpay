import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, CreditCard } from "lucide-react";

interface DigitalWalletButtonsProps {
  amount: number;
  currency: string;
  merchantName: string;
  itemName: string;
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
        // This would typically validate with your backend
        // For now, we'll simulate the validation
        console.log("Apple Pay merchant validation required", event);
        onPaymentError("Apple Pay merchant validation not configured. Please contact support.");
      };

      session.onpaymentauthorized = (event: any) => {
        console.log("Apple Pay payment authorized", event);
        onPaymentSuccess(event.payment);
        session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
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
                gateway: 'windcave', // Your payment processor
                gatewayMerchantId: 'your-merchant-id'
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
      
      console.log("Google Pay payment response", response);
      onPaymentSuccess(response);
      response.complete('success');
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
      {/* Apple Pay Button */}
      {applePaySupported && (
        <button
          onClick={handleApplePay}
          disabled={disabled}
          className="w-full h-12 bg-black text-white rounded-lg flex items-center justify-center font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <span className="flex items-center space-x-2">
            <span>🍎</span>
            <span>Pay</span>
          </span>
        </button>
      )}

      {/* Google Pay Button */}
      {googlePaySupported && (
        <button
          onClick={handleGooglePay}
          disabled={disabled}
          className="w-full h-12 bg-white text-black rounded-lg flex items-center justify-center font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
        >
          <span className="flex items-center space-x-2">
            <span className="text-blue-600 font-bold">G</span>
            <span className="text-red-600 font-bold">o</span>
            <span className="text-yellow-500 font-bold">o</span>
            <span className="text-blue-600 font-bold">g</span>
            <span className="text-green-600 font-bold">l</span>
            <span className="text-red-600 font-bold">e</span>
            <span className="ml-1">Pay</span>
          </span>
        </button>
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