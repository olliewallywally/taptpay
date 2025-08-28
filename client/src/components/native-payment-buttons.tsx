import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, CreditCard } from "lucide-react";

interface NativePaymentButtonsProps {
  amount: number;
  currency: string;
  merchantName: string;
  itemName: string;
  onPaymentSuccess: (paymentData: any) => void;
  onPaymentError: (error: string) => void;
  disabled?: boolean;
}

export function NativePaymentButtons({
  amount,
  currency = "USD",
  merchantName,
  itemName,
  onPaymentSuccess,
  onPaymentError,
  disabled = false
}: NativePaymentButtonsProps) {
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [googlePayAvailable, setGooglePayAvailable] = useState(false);
  const [paymentRequestAvailable, setPaymentRequestAvailable] = useState(false);

  useEffect(() => {
    checkPaymentSupport();
  }, []);

  const checkPaymentSupport = async () => {
    // Check Apple Pay support
    if (window.ApplePaySession) {
      try {
        const canMakePayments = await window.ApplePaySession.canMakePayments();
        setApplePayAvailable(canMakePayments);
      } catch (error) {
        console.error('Apple Pay check failed:', error);
      }
    }

    // Check Google Pay support
    if (window.google && window.google.payments && window.google.payments.api) {
      try {
        const paymentsClient = new window.google.payments.api.PaymentsClient({
          environment: 'TEST' // Change to 'PRODUCTION' for live
        });
        
        const isReadyToPay = await paymentsClient.isReadyToPay({
          apiVersion: 2,
          apiVersionMinor: 0,
          allowedPaymentMethods: [{
            type: 'CARD',
            parameters: {
              allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: ['MASTERCARD', 'VISA', 'AMEX']
            }
          }]
        });
        
        setGooglePayAvailable(isReadyToPay.result);
      } catch (error) {
        console.error('Google Pay check failed:', error);
      }
    }

    // Check Payment Request API support
    if (window.PaymentRequest) {
      try {
        // Test if Apple Pay is supported via Payment Request API
        const applePayMethod = {
          supportedMethods: 'https://apple.com/apple-pay',
          data: {
            supportedNetworks: ['visa', 'masterCard', 'amex'],
            countryCode: 'US',
            merchantIdentifier: 'merchant.com.example' // This needs to be configured
          }
        };

        const paymentDetails = {
          total: {
            label: itemName,
            amount: { currency, value: amount.toFixed(2) }
          }
        };

        const request = new PaymentRequest([applePayMethod], paymentDetails);
        const canMakePayment = await request.canMakePayment();
        setPaymentRequestAvailable(canMakePayment || false);
      } catch (error) {
        console.error('Payment Request API check failed:', error);
      }
    }
  };

  const initiateApplePay = async () => {
    if (!window.ApplePaySession) {
      onPaymentError('Apple Pay not supported on this device');
      return;
    }

    try {
      const paymentRequest = {
        countryCode: 'US',
        currencyCode: currency,
        supportedNetworks: ['visa', 'masterCard', 'amex'],
        merchantCapabilities: ['supports3DS'],
        total: {
          label: merchantName,
          amount: amount.toFixed(2)
        },
        lineItems: [{
          label: itemName,
          amount: amount.toFixed(2)
        }]
      };

      const session = new window.ApplePaySession(3, paymentRequest);
      
      session.onvalidatemerchant = async (event: any) => {
        // This requires server-side merchant validation
        try {
          const response = await fetch('/api/payments/apple-pay/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              validationURL: event.validationURL,
              domainName: window.location.hostname
            })
          });
          
          const merchantSession = await response.json();
          session.completeMerchantValidation(merchantSession);
        } catch (error) {
          console.error('Apple Pay validation failed:', error);
          session.abort();
          onPaymentError('Apple Pay validation failed');
        }
      };

      session.onpaymentauthorized = async (event: any) => {
        try {
          // Process payment on server
          const response = await fetch('/api/payments/apple-pay/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentToken: event.payment.token,
              amount,
              currency,
              itemName
            })
          });

          const result = await response.json();
          
          if (result.success) {
            session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
            onPaymentSuccess(result);
          } else {
            session.completePayment(window.ApplePaySession.STATUS_FAILURE);
            onPaymentError(result.error || 'Payment failed');
          }
        } catch (error) {
          session.completePayment(window.ApplePaySession.STATUS_FAILURE);
          onPaymentError('Payment processing failed');
        }
      };

      session.begin();
    } catch (error) {
      console.error('Apple Pay error:', error);
      onPaymentError('Apple Pay initialization failed');
    }
  };

  const initiateGooglePay = async () => {
    if (!window.google || !window.google.payments || !window.google.payments.api) {
      onPaymentError('Google Pay not available');
      return;
    }

    try {
      const paymentsClient = new window.google.payments.api.PaymentsClient({
        environment: 'TEST' // Change to 'PRODUCTION' for live
      });

      const paymentDataRequest = {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [{
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['MASTERCARD', 'VISA', 'AMEX'],
            billingAddressRequired: false
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
              'gateway': 'stripe', // Configure based on your payment processor
              'gatewayMerchantId': 'your-merchant-id' // This needs to be configured
            }
          }
        }],
        transactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPrice: amount.toFixed(2),
          currencyCode: currency,
          displayItems: [{
            label: itemName,
            type: 'LINE_ITEM',
            price: amount.toFixed(2)
          }]
        },
        merchantInfo: {
          merchantName: merchantName,
          merchantId: 'your-google-merchant-id' // This needs to be configured
        }
      };

      const paymentData = await paymentsClient.loadPaymentData(paymentDataRequest);
      
      // Process the payment token on your server
      const response = await fetch('/api/payments/google-pay/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentToken: paymentData.paymentMethodData.tokenizationData.token,
          amount,
          currency,
          itemName
        })
      });

      const result = await response.json();
      
      if (result.success) {
        onPaymentSuccess(result);
      } else {
        onPaymentError(result.error || 'Payment failed');
      }
    } catch (error) {
      console.error('Google Pay error:', error);
      onPaymentError('Google Pay payment failed');
    }
  };

  const initiatePaymentRequest = async () => {
    if (!window.PaymentRequest) {
      onPaymentError('Payment Request API not supported');
      return;
    }

    try {
      const supportedInstruments = [];

      // Add Apple Pay if available
      if (applePayAvailable) {
        supportedInstruments.push({
          supportedMethods: 'https://apple.com/apple-pay',
          data: {
            supportedNetworks: ['visa', 'masterCard', 'amex'],
            countryCode: 'US',
            merchantIdentifier: 'merchant.com.example' // Configure this
          }
        });
      }

      // Add basic card support
      supportedInstruments.push({
        supportedMethods: 'basic-card',
        data: {
          supportedNetworks: ['visa', 'mastercard', 'amex'],
          supportedTypes: ['debit', 'credit']
        }
      });

      const paymentDetails = {
        total: {
          label: merchantName,
          amount: { currency, value: amount.toFixed(2) }
        },
        displayItems: [{
          label: itemName,
          amount: { currency, value: amount.toFixed(2) }
        }]
      };

      const request = new PaymentRequest(supportedInstruments, paymentDetails);
      const response = await request.show();
      
      // Process payment response
      const result = await fetch('/api/payments/payment-request/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentResponse: response,
          amount,
          currency,
          itemName
        })
      });

      const paymentResult = await result.json();
      
      if (paymentResult.success) {
        await response.complete('success');
        onPaymentSuccess(paymentResult);
      } else {
        await response.complete('fail');
        onPaymentError(paymentResult.error || 'Payment failed');
      }
    } catch (error) {
      console.error('Payment Request error:', error);
      onPaymentError('Payment failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Apple Pay Button */}
      {applePayAvailable && (
        <button
          onClick={initiateApplePay}
          disabled={disabled}
          className="w-full h-12 bg-black text-white rounded-lg flex items-center justify-center space-x-2 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '16px',
            fontWeight: '400'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          <span>Pay with Apple Pay</span>
        </button>
      )}

      {/* Google Pay Button */}
      {googlePayAvailable && (
        <button
          onClick={initiateGooglePay}
          disabled={disabled}
          className="w-full h-12 bg-black text-white rounded-lg flex items-center justify-center space-x-2 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"/>
          </svg>
          <span>Pay with Google Pay</span>
        </button>
      )}

      {/* Payment Request Button (fallback) */}
      {paymentRequestAvailable && !applePayAvailable && !googlePayAvailable && (
        <Button
          onClick={initiatePaymentRequest}
          disabled={disabled}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <CreditCard className="w-5 h-5 mr-2" />
          Pay Now
        </Button>
      )}

      {/* Fallback message if no native payment methods available */}
      {!applePayAvailable && !googlePayAvailable && !paymentRequestAvailable && (
        <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
          <Smartphone className="w-8 h-8 mx-auto mb-2 text-amber-600" />
          <p className="text-amber-800 font-medium mb-1">Digital Wallet Not Available</p>
          <p className="text-amber-700 text-sm">
            Apple Pay and Google Pay require compatible devices and browser support.
            Please use the alternative payment method below.
          </p>
        </div>
      )}
    </div>
  );
}

// Add type declarations for payment APIs
declare global {
  interface Window {
    ApplePaySession: any;
    google: any;
    PaymentRequest: any;
  }
}