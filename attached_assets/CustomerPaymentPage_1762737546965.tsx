import { useState, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import taptpayLogo from 'figma:asset/987108cf9c4e186fbd1d468c6f1509d644b9173e.png';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface CustomerPaymentPageProps {
  onNavigate: (page: string) => void;
}

export function CustomerPaymentPage({ onNavigate }: CustomerPaymentPageProps) {
  const [itemName] = useState('latte');
  const [amount, setAmount] = useState('8.99');
  const [showCardDetails, setShowCardDetails] = useState(false);
  const [showSplitBill, setShowSplitBill] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [paymentType, setPaymentType] = useState<'apple' | 'google'>('apple');
  const [canMakePayment, setCanMakePayment] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const splitAmount = (parseFloat(amount) / splitCount).toFixed(2);

  // Update payment status on backend
  const updatePaymentStatus = async (status: 'ready' | 'processing' | 'accepted' | 'failed' | 'declined') => {
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/payment-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ status }),
        }
      );
    } catch (error) {
      console.error('Error updating payment status:', error);
    }
  };

  // Detect platform and check for payment availability
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod|macintosh/.test(userAgent) && 'ApplePaySession' in window;
    const isAndroid = /android/.test(userAgent);
    
    // Check if we're in an iframe (demo mode)
    const isInIframe = window.self !== window.top;
    const hasPaymentAPI = 'PaymentRequest' in window || 'ApplePaySession' in window;
    
    const demoMode = isInIframe || !hasPaymentAPI;
    setIsDemoMode(demoMode);
    
    if (isAppleDevice) {
      setPaymentType('apple');
      // Check if Apple Pay is available
      if ((window as any).ApplePaySession && (window as any).ApplePaySession.canMakePayments()) {
        setCanMakePayment(true);
      }
    } else if (isAndroid) {
      setPaymentType('google');
      setCanMakePayment(true);
    } else {
      // Default to Apple Pay for desktop Safari, Google Pay for Chrome
      setPaymentType(/safari/.test(userAgent) && !/chrome/.test(userAgent) ? 'apple' : 'google');
      setCanMakePayment(true);
    }

    // Show info message if in demo mode
    if (demoMode && isInIframe) {
      setTimeout(() => {
        toast.info('Running in demo mode - payment buttons will simulate transactions', {
          duration: 4000,
        });
      }, 500);
    }
  }, []);

  const handleDigitalPayment = async () => {
    // Set to processing
    await updatePaymentStatus('processing');
    
    if (paymentType === 'apple') {
      handleApplePay();
    } else {
      handleGooglePay();
    }
  };

  const handleApplePay = () => {
    // Check if we're in an iframe (common in development environments)
    if (window.self !== window.top) {
      toast.info('Demo: Payment would process via Apple Pay');
      simulatePaymentSuccess();
      return;
    }

    if ('ApplePaySession' in window) {
      try {
        // Check if Apple Pay is available
        if (!(window as any).ApplePaySession.canMakePayments()) {
          toast.info('Demo: Apple Pay payment simulated');
          simulatePaymentSuccess();
          return;
        }

        const request = {
          countryCode: 'US',
          currencyCode: 'USD',
          supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
          merchantCapabilities: ['supports3DS'],
          total: {
            label: `${itemName} - taptpay`,
            amount: amount,
          },
        };

        const session = new (window as any).ApplePaySession(3, request);

        session.onvalidatemerchant = (event: any) => {
          // In production, validate with your server
          console.log('Apple Pay validation required');
          toast.info('Apple Pay merchant validation needed');
        };

        session.onpaymentauthorized = (event: any) => {
          // Process payment
          console.log('Apple Pay payment authorized', event.payment);
          toast.success('Payment processed successfully!');
          session.completePayment((window as any).ApplePaySession.STATUS_SUCCESS);
        };

        session.begin();
      } catch (error: any) {
        console.error('Apple Pay error:', error);
        
        // Handle different error cases
        if (error.name === 'SecurityError') {
          toast.info('Demo: Payment simulated successfully');
          simulatePaymentSuccess();
        } else {
          toast.info('Demo: Apple Pay payment simulated');
          simulatePaymentSuccess();
        }
      }
    } else {
      // Apple Pay not available - use demo mode
      toast.info('Demo: Apple Pay payment simulated');
      simulatePaymentSuccess();
    }
  };

  const handleGooglePay = async () => {
    // Check if we're in a secure context and top-level browsing context
    if (!window.isSecureContext) {
      toast.error('Payment requires HTTPS connection');
      simulatePaymentSuccess();
      return;
    }

    // Check if we're in an iframe (common in development environments)
    if (window.self !== window.top) {
      toast.info('Demo: Payment would process via Google Pay');
      simulatePaymentSuccess();
      return;
    }

    try {
      // Check if PaymentRequest is supported
      if (!window.PaymentRequest) {
        toast.info('Demo: Google Pay payment simulated');
        simulatePaymentSuccess();
        return;
      }

      const paymentRequest = new (window as any).PaymentRequest(
        [
          {
            supportedMethods: 'https://google.com/pay',
            data: {
              environment: 'TEST',
              apiVersion: 2,
              apiVersionMinor: 0,
              merchantInfo: {
                merchantName: 'taptpay',
              },
              allowedPaymentMethods: [
                {
                  type: 'CARD',
                  parameters: {
                    allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                    allowedCardNetworks: ['MASTERCARD', 'VISA', 'AMEX'],
                  },
                  tokenizationSpecification: {
                    type: 'PAYMENT_GATEWAY',
                    parameters: {
                      gateway: 'example',
                      gatewayMerchantId: 'exampleMerchantId',
                    },
                  },
                },
              ],
            },
          },
        ],
        {
          total: {
            label: `${itemName}`,
            amount: {
              currency: 'USD',
              value: amount,
            },
          },
        }
      );

      const paymentResponse = await paymentRequest.show();
      console.log('Google Pay payment response:', paymentResponse);
      await paymentResponse.complete('success');
      toast.success('Payment processed successfully!');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Payment cancelled by user');
        return;
      }
      
      console.error('Google Pay error:', error);
      
      // Handle SecurityError specifically
      if (error.name === 'SecurityError') {
        console.warn('Payment API security restriction. Using demo mode.');
        toast.info('Demo: Payment simulated successfully');
        simulatePaymentSuccess();
      } else {
        toast.error('Payment failed. Please try card payment.');
      }
    }
  };

  const simulatePaymentSuccess = () => {
    setTimeout(async () => {
      // Randomly simulate success or failure (80% success rate)
      const isSuccess = Math.random() > 0.2;
      
      if (isSuccess) {
        await updatePaymentStatus('accepted');
        toast.success('✓ Payment successful! ($' + amount + ')');
        console.log('Demo payment processed:', {
          amount,
          itemName,
          method: paymentType === 'apple' ? 'Apple Pay' : 'Google Pay',
        });
        
        // Reset to ready after 3 seconds
        setTimeout(async () => {
          await updatePaymentStatus('ready');
        }, 3000);
      } else {
        await updatePaymentStatus('failed');
        toast.error('✗ Payment failed. Please try again.');
        
        // Reset to ready after 3 seconds
        setTimeout(async () => {
          await updatePaymentStatus('ready');
        }, 3000);
      }
    }, 1500);
  };

  const handleConfirmSplit = () => {
    setAmount(splitAmount);
    setShowSplitBill(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {/* Payment Card Container */}
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg">
        <div className="rounded-[48px] md:rounded-[60px] overflow-hidden shadow-2xl">
          {/* Blue section with payment content */}
          <div 
            className="bg-[#0055FF] px-8 md:px-12 rounded-b-[48px] md:rounded-b-[60px] relative z-10 transition-all duration-500 ease-in-out"
            style={{
              paddingTop: showCardDetails ? '2rem' : '2rem',
              paddingBottom: showCardDetails ? '1.5rem' : showSplitBill ? '20rem' : '6rem'
            }}
          >
            {/* Logo/Brand */}
            <div className="text-center mb-8 md:mb-10">
              <img 
                src={taptpayLogo} 
                alt="taptpay" 
                className="h-24 sm:h-28 md:h-32 mx-auto"
              />
            </div>

            {/* Payment options - Hidden when card details shown */}
            <div 
              className="transition-all duration-500 ease-in-out"
              style={{
                maxHeight: showCardDetails ? '0px' : '800px',
                opacity: showCardDetails ? 0 : 1,
                overflow: showCardDetails ? 'hidden' : 'visible'
              }}
            >
              {/* Item Name */}
              <div className="text-center mb-3 sm:mb-4 md:mb-5">
                <p className="text-white/60 text-lg sm:text-xl md:text-2xl">{itemName}</p>
              </div>

              {/* Amount */}
              <div className="text-center mb-8 sm:mb-10 md:mb-12">
                <p className="text-[#00E5CC] text-5xl sm:text-6xl md:text-7xl font-bold">${amount}</p>
              </div>

              {/* Apple Pay / Google Pay Button */}
              {paymentType === 'apple' ? (
                <div className="relative mb-4 sm:mb-5">
                  {isDemoMode && (
                    <div className="absolute -top-2 -right-2 bg-[#00E5CC] text-[#0055FF] text-xs font-semibold px-3 py-1 rounded-full z-10 shadow-lg border-2 border-white">
                      DEMO
                    </div>
                  )}
                  <button 
                    onClick={handleDigitalPayment}
                    className="w-full bg-black hover:bg-gray-900 rounded-[12px] sm:rounded-[14px] py-3 sm:py-4 flex items-center justify-center transition-colors"
                    style={{
                      WebkitAppearance: 'none',
                      appearance: 'none',
                    }}
                  >
                  <svg className="h-10 sm:h-12" viewBox="0 0 165.521 105.965" xmlns="http://www.w3.org/2000/svg">
                    <g fill="#fff">
                      <path d="M150.698 0H14.823C6.633 0 0 6.633 0 14.823v76.318c0 8.19 6.633 14.824 14.823 14.824h135.875c8.19 0 14.823-6.633 14.823-14.824V14.823C165.521 6.633 158.888 0 150.698 0z"/>
                      <path d="M150.698 3.532c6.24 0 11.291 5.052 11.291 11.291v76.318c0 6.24-5.052 11.291-11.291 11.291H14.823c-6.24 0-11.291-5.052-11.291-11.291V14.823c0-6.24 5.052-11.291 11.291-11.291h135.875m0-3.532H14.823C6.633 0 0 6.633 0 14.823v76.318c0 8.19 6.633 14.824 14.823 14.824h135.875c8.19 0 14.823-6.633 14.823-14.824V14.823C165.521 6.633 158.888 0 150.698 0z" fill="#000"/>
                    </g>
                    <g>
                      <g fill="#fff">
                        <path d="M43.508 35.77c1.404-1.755 2.356-4.112 2.105-6.52-2.054.102-4.56 1.403-6.014 3.157-1.303 1.504-2.456 3.86-2.155 6.166 2.307.051 4.611-1.152 6.064-2.803M45.587 39.068c-3.359-.204-6.214 1.908-7.82 1.908-1.608 0-4.056-1.81-6.717-1.759-3.462.051-6.62 2-8.431 5.11-3.562 6.166-1.002 15.31 2.609 20.318 1.757 2.504 3.818 5.212 6.572 5.11 2.56-.102 3.564-1.655 6.671-1.655 3.16 0 4.062 1.655 6.72 1.604 2.763-.051 4.664-2.454 6.421-4.957 2.003-2.858 2.813-5.665 2.865-5.816-.051-.051-5.513-2.1-5.564-8.318-.051-5.212 4.257-7.72 4.461-7.873-2.409-3.562-6.162-3.918-7.566-4.01M67.162 32.198h5.136l-11.99 38.519h-4.862l-8.379-27.323-8.07 27.323h-4.862l-11.834-38.519h5.085l9.125 29.544 8.273-29.544h4.708l8.016 29.75zM75.699 51.212c0 1.269.154 2.538.616 3.652.462 1.115 1.115 2.077 1.923 2.887.808.808 1.769 1.461 2.887 1.923 1.115.462 2.384.616 3.654.616 1.269 0 2.539-.154 3.652-.616 1.115-.462 2.077-1.115 2.887-1.923.808-.808 1.462-1.769 1.923-2.887.462-1.115.616-2.383.616-3.652 0-1.269-.154-2.538-.616-3.653-.462-1.115-1.115-2.077-1.923-2.887-.808-.808-1.769-1.461-2.887-1.923-1.115-.462-2.384-.616-3.652-.616-1.269 0-2.539.154-3.654.616-1.115.462-2.077 1.115-2.887 1.923-.808.808-1.462 1.769-1.923 2.887-.462 1.115-.616 2.384-.616 3.653m-4.708 0c0-1.885.308-3.615.923-5.192.616-1.577 1.462-2.923 2.539-4.077 1.077-1.154 2.384-2.077 3.922-2.693 1.538-.616 3.154-.923 4.885-.923s3.346.308 4.885.923c1.538.616 2.846 1.538 3.922 2.693 1.077 1.154 1.923 2.5 2.539 4.077.616 1.577.923 3.308.923 5.192s-.308 3.615-.923 5.192c-.616 1.577-1.462 2.923-2.539 4.077-1.077 1.154-2.384 2.077-3.922 2.693-1.538.616-3.154.923-4.885.923s-3.346-.308-4.885-.923c-1.538-.616-2.846-1.538-3.922-2.693-1.077-1.154-1.923-2.5-2.539-4.077-.615-1.577-.923-3.307-.923-5.192M119.999 51.212c0 1.269-.154 2.538-.616 3.652-.462 1.115-1.115 2.077-1.923 2.887-.808.808-1.769 1.461-2.887 1.923-1.115.462-2.384.616-3.652.616-1.269 0-2.539-.154-3.654-.616-1.115-.462-2.077-1.115-2.887-1.923-.808-.808-1.462-1.769-1.923-2.887-.462-1.115-.616-2.383-.616-3.652 0-1.269.154-2.538.616-3.653.462-1.115 1.115-2.077 1.923-2.887.808-.808 1.769-1.461 2.887-1.923 1.115-.462 2.384-.616 3.654-.616 1.269 0 2.538.154 3.652.616 1.115.462 2.077 1.115 2.887 1.923.808.808 1.462 1.769 1.923 2.887.462 1.115.616 2.384.616 3.653m4.709 0c0-1.885-.308-3.615-.923-5.192-.616-1.577-1.462-2.923-2.539-4.077-1.077-1.154-2.384-2.077-3.922-2.693-1.538-.616-3.154-.923-4.885-.923s-3.346.308-4.885.923c-1.538.616-2.846 1.538-3.922 2.693-1.077 1.154-1.923 2.5-2.539 4.077-.616 1.577-.923 3.308-.923 5.192s.308 3.615.923 5.192c.616 1.577 1.462 2.923 2.539 4.077 1.077 1.154 2.384 2.077 3.922 2.693 1.538.616 3.154.923 4.885.923s3.346-.308 4.885-.923c1.538-.616 2.846-1.538 3.922-2.693 1.077-1.154 1.923-2.5 2.539-4.077.615-1.577.923-3.307.923-5.192"/>
                      </g>
                    </g>
                  </svg>
                  </button>
                </div>
              ) : (
                <div className="relative mb-4 sm:mb-5">
                  <button 
                    onClick={handleDigitalPayment}
                    className="w-full bg-white hover:bg-gray-100 rounded-[4px] py-3 sm:py-4 flex items-center justify-center transition-colors shadow-md"
                  >
                  <svg className="h-6 sm:h-7 md:h-8" viewBox="0 0 41 17" xmlns="http://www.w3.org/2000/svg">
                    <g fill="none" fillRule="evenodd">
                      <path d="M19.526 2.635v4.083h2.518c.6 0 1.096-.202 1.488-.605.403-.402.605-.882.605-1.437 0-.544-.202-1.018-.605-1.422-.392-.413-.888-.62-1.488-.62h-2.518zm0 5.52v4.736h-1.504V1.198h3.99c1.013 0 1.873.337 2.582 1.012.72.675 1.08 1.497 1.08 2.466 0 .991-.36 1.819-1.08 2.482-.697.665-1.559.996-2.583.996h-2.485v.001zm7.668 2.287c0 .392.166.718.499.98.332.26.722.391 1.168.391.633 0 1.196-.234 1.692-.701.497-.469.744-1.019.744-1.65-.469-.37-1.123-.555-1.962-.555-.61 0-1.12.148-1.528.442-.409.294-.613.657-.613 1.093m1.946-5.815c1.112 0 1.989.297 2.633.89.642.594.964 1.408.964 2.442v4.932h-1.439v-1.11h-.065c-.622.914-1.45 1.372-2.486 1.372-.882 0-1.621-.262-2.215-.784-.594-.523-.891-1.176-.891-1.96 0-.828.313-1.486.94-1.976s1.463-.735 2.51-.735c.892 0 1.629.163 2.206.49v-.344c0-.522-.207-.966-.621-1.33-.414-.366-.9-.548-1.457-.548-.756 0-1.399.261-1.93.784l-.932-1.177c.719-.68 1.651-1.02 2.799-1.02l-.016.024zM40.24 11.89c-.489.685-1.31 1.027-2.462 1.027-1.152 0-2.119-.373-2.901-1.117-.783-.744-1.174-1.658-1.174-2.743 0-1.084.39-1.998 1.174-2.742.782-.744 1.749-1.117 2.9-1.117 1.153 0 1.975.342 2.463 1.027V5.09h1.488v7.801H40.24v-1.001zm-2.397.261c.685 0 1.27-.237 1.754-.711.483-.473.726-1.044.726-1.711 0-.667-.243-1.237-.726-1.71-.485-.474-1.069-.711-1.754-.711-.685 0-1.27.237-1.754.71-.483.474-.725 1.044-.725 1.711 0 .667.242 1.238.725 1.71.484.475 1.069.712 1.754.712z" fill="#5F6368"/>
                      <path d="M13.448 7.134c0-.473-.04-.93-.116-1.366H6.988v2.588h3.634a3.11 3.11 0 0 1-1.344 2.042v1.68h2.169c1.27-1.17 2.001-2.9 2.001-4.944z" fill="#4285F4"/>
                      <path d="M6.988 13.7c1.816 0 3.344-.595 4.459-1.621l-2.169-1.681c-.603.406-1.38.643-2.29.643-1.754 0-3.244-1.182-3.776-2.774H.978v1.731a6.728 6.728 0 0 0 6.01 3.703z" fill="#34A853"/>
                      <path d="M3.212 8.267a4.034 4.034 0 0 1 0-2.572V3.964H.978a6.678 6.678 0 0 0 0 6.034l2.234-1.731z" fill="#FBBC05"/>
                      <path d="M6.988 2.921c.992 0 1.88.34 2.58 1.008v.001l1.92-1.918C10.324.928 8.804.262 6.989.262a6.728 6.728 0 0 0-6.01 3.702l2.234 1.731c.532-1.592 2.022-2.774 3.776-2.774z" fill="#EA4335"/>
                    </g>
                  </svg>
                  </button>
                </div>
              )}

              {/* Split the Bill Button with Dropdown */}
              <div className="relative mb-4 md:mb-6">
                <button 
                  onClick={() => setShowSplitBill(!showSplitBill)}
                  className="w-full bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF] rounded-[20px] sm:rounded-[24px] md:rounded-[28px] py-4 sm:py-5 md:py-6 flex items-center justify-center gap-2 transition-colors relative z-10"
                  style={{
                    borderBottomLeftRadius: showSplitBill ? '0' : '',
                    borderBottomRightRadius: showSplitBill ? '0' : ''
                  }}
                >
                  <span className="text-base sm:text-lg md:text-xl">split the bill</span>
                  {showSplitBill ? (
                    <ChevronUp size={20} className="text-[#0055FF]" />
                  ) : (
                    <ChevronDown size={20} className="text-[#0055FF]" />
                  )}
                </button>

                {/* Split Bill Dropdown */}
                <div 
                  className="transition-all duration-500 ease-in-out overflow-hidden absolute top-full left-0 right-0 z-0"
                  style={{
                    maxHeight: showSplitBill ? '300px' : '0px',
                    opacity: showSplitBill ? 1 : 0
                  }}
                >
                  <div className="bg-white rounded-b-[48px] px-6 py-8">
                    {/* Counter Controls */}
                    <div className="flex items-center justify-center gap-8 mb-4">
                      {/* Minus Button */}
                      <button
                        onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                        className="w-14 h-14 bg-[#00E5CC] hover:bg-[#00c9b3] rounded-full flex items-center justify-center transition-colors"
                        disabled={splitCount <= 2}
                      >
                        <Minus size={24} className="text-white" />
                      </button>

                      {/* Count Display */}
                      <div className="text-[#0055FF] text-5xl">
                        {splitCount}
                      </div>

                      {/* Plus Button */}
                      <button
                        onClick={() => setSplitCount(splitCount + 1)}
                        className="w-14 h-14 bg-[#00E5CC] hover:bg-[#00c9b3] rounded-full flex items-center justify-center transition-colors"
                      >
                        <Plus size={24} className="text-white" />
                      </button>
                    </div>

                    {/* Split Amount */}
                    <div className="text-center mb-6">
                      <p className="text-[#0055FF] text-3xl">${splitAmount}</p>
                    </div>

                    {/* Confirm Button */}
                    <div className="flex justify-center">
                      <button 
                        onClick={handleConfirmSplit}
                        className="w-1/2 bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF] rounded-[20px] py-4 transition-colors text-center"
                      >
                        <span className="text-base sm:text-lg">confirm</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cyan section - Card Details Form */}
          <div 
            className="bg-[#00E5CC] px-8 relative z-0 transition-all duration-500 ease-in-out" 
            style={{ 
              paddingTop: showCardDetails ? '5rem' : '4rem',
              paddingBottom: showCardDetails ? '2rem' : '0.75rem',
              marginTop: '-4rem'
            }}
          >
            {/* Card Details Form - Hidden by default */}
            <div 
              className="transition-all duration-500 ease-in-out overflow-hidden"
              style={{
                maxHeight: showCardDetails ? '600px' : '0px',
                opacity: showCardDetails ? 1 : 0,
                marginTop: showCardDetails ? '0px' : '0px'
              }}
            >
              <div className="space-y-4 mb-6">
                {/* Card Number */}
                <Input
                  type="text"
                  placeholder="Card Number"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="bg-gray-100 border-0 rounded-[16px] py-6 text-[#0055FF] placeholder:text-gray-400"
                  maxLength={16}
                />

                {/* Card Name */}
                <Input
                  type="text"
                  placeholder="Name on Card"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  className="bg-gray-100 border-0 rounded-[16px] py-6 text-[#0055FF] placeholder:text-gray-400"
                />

                {/* Expiry and CVV */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="text"
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="bg-gray-100 border-0 rounded-[16px] py-6 text-[#0055FF] placeholder:text-gray-400"
                    maxLength={5}
                  />
                  <Input
                    type="text"
                    placeholder="CVV"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    className="bg-gray-100 border-0 rounded-[16px] py-6 text-[#0055FF] placeholder:text-gray-400"
                    maxLength={3}
                  />
                </div>
              </div>

              {/* Pay Now Button */}
              <Button 
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] rounded-[20px] py-6 text-lg mb-6"
                onClick={async () => {
                  // Handle payment
                  console.log('Processing payment...');
                  await updatePaymentStatus('processing');
                  
                  // Simulate card payment processing
                  setTimeout(async () => {
                    const isSuccess = Math.random() > 0.2;
                    
                    if (isSuccess) {
                      await updatePaymentStatus('accepted');
                      toast.success('✓ Payment successful! ($' + amount + ')');
                      
                      // Reset form and status
                      setCardNumber('');
                      setCardName('');
                      setExpiry('');
                      setCvv('');
                      setShowCardDetails(false);
                      
                      setTimeout(async () => {
                        await updatePaymentStatus('ready');
                      }, 3000);
                    } else {
                      await updatePaymentStatus('failed');
                      toast.error('✗ Payment failed. Please check your card details.');
                      
                      setTimeout(async () => {
                        await updatePaymentStatus('ready');
                      }, 3000);
                    }
                  }, 1500);
                }}
              >
                pay now.
              </Button>
            </div>

            {/* Enter Card Details Toggle */}
            <div 
              className="cursor-pointer hover:opacity-80 transition-all duration-500 py-2"
              onClick={() => setShowCardDetails(!showCardDetails)}
              style={{
                marginTop: showCardDetails ? '0px' : '0px'
              }}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-[#0055FF] text-base sm:text-lg">enter card details</span>
                {showCardDetails ? (
                  <ChevronUp size={20} className="text-[#0055FF]" />
                ) : (
                  <ChevronDown size={20} className="text-[#0055FF]" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Back Button (Optional - for easy navigation during development) */}
      <button
        onClick={() => onNavigate('settings')}
        className="absolute top-4 left-4 text-[#0055FF] bg-white rounded-full p-2 hover:bg-gray-100 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    </div>
  );
}
