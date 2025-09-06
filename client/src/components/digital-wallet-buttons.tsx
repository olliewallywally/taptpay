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
          {/* Apple Pay Button - iOS devices */}
          {applePaySupported && (
            <button
              onClick={handleApplePay}
              disabled={disabled}
              className="w-full h-12 backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <svg width="50" height="20" viewBox="0 0 50 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.9 2.9c-.5.6-.9 1.4-.8 2.2.8.1 1.7-.4 2.2-1 .5-.6.8-1.4.7-2.2-.8 0-1.6.4-2.1 1zm2.1 3.5c-1.2-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.7-3.2 1.8-1.4 2.4-.4 5.9 1 7.8.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6 1.2 0 1.5.6 2.6.6 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-3.2 0-2.1 1.7-3.1 1.8-3.2-1-1.5-2.5-1.6-3.1-1.6-.4-.1-.9-.3-1.4-.3z" fill="white"/>
                <text x="18" y="15" fill="white" fontSize="11" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif">Pay</text>
              </svg>
            </button>
          )}

          {/* Google Pay Button - Non-iOS devices */}
          {googlePaySupported && (
            <button
              onClick={handleGooglePay}
              disabled={disabled}
              className="w-full h-12 backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <svg width="41" height="17" viewBox="0 0 41 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.526 9.731V6.273h4.621c.043.343.068.686.068 1.029 0 3.771-2.522 6.448-5.977 6.448a6.462 6.462 0 01-6.462-6.462c0-3.572 2.896-6.462 6.462-6.462 1.733 0 3.195.571 4.337 1.515l-1.267 1.267c-.686-.657-1.619-1.168-3.07-1.168-2.494 0-4.543 2.074-4.543 4.848s2.049 4.848 4.543 4.848c2.903 0 4.005-2.074 4.164-3.143h-4.164v-.99l-.712-.849z" fill="white"/>
                <path d="M25.713 5.282c1.481 0 2.408 1.04 2.408 2.391v5.232h-1.714V8.074c0-.849-.457-1.354-1.168-1.354-.766 0-1.28.559-1.28 1.434v4.751h-1.714V5.468h1.714v.743c.4-.571 1.04-.929 1.754-.929z" fill="white"/>
                <path d="M33.516 8.951c-.183-1.063-.984-1.594-1.911-1.594-1.063 0-1.834.665-2.017 1.594h3.928zm1.491 1.063c0 .157-.011.297-.034.434h-5.384c.183 1.097 1.063 1.777 2.183 1.777.994 0 1.662-.434 1.937-1.06l1.474.617c-.606 1.234-1.834 1.903-3.411 1.903-2.126 0-3.862-1.554-3.862-3.931 0-2.286 1.691-3.931 3.794-3.931 2.057 0 3.726 1.645 3.726 3.863.011.109-.023.218-.023.328z" fill="white"/>
              </svg>
            </button>
          )}
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