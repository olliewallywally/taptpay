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
    // Show consistent UI but detect capabilities behind the scenes
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    
    // Always show consistent button, but determine payment method capability
    setApplePaySupported(isIOS);
    setGooglePaySupported(!isIOS);
    setPaymentRequestSupported(true);
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
      {/* Single Full-Width Digital Wallet Button */}
      {(applePaySupported || googlePaySupported) && (
        <div className="w-full">
          {/* Universal Digital Wallet Button */}
          <button
            onClick={applePaySupported ? handleApplePay : handleGooglePay}
            disabled={disabled}
            className="w-full h-12 backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              <span>Pay with Digital Wallet</span>
            </div>
          </button>
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