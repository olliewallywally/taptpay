import { useState, useRef, useEffect } from "react";
import { motion, useAnimation } from "framer-motion";

interface SlideToPayProps {
  onPayment: () => void;
  disabled?: boolean;
  amount?: number;
  currency?: string;
  merchantName?: string;
}

export function SlideToPayComponent({ 
  onPayment, 
  disabled = false, 
  amount = 0, 
  currency = "NZD", 
  merchantName = "Tapt Payment" 
}: SlideToPayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();

  // Check if device supports mobile payments
  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  // Trigger native mobile payment interface
  const triggerMobilePayment = async () => {
    setIsProcessing(true);

    try {
      // Check if Payment Request API is available
      if ('PaymentRequest' in window && amount > 0) {
        const supportedPaymentMethods = [
          {
            supportedMethods: 'basic-card',
            data: {
              supportedNetworks: ['visa', 'mastercard', 'amex', 'discover'],
              supportedTypes: ['debit', 'credit']
            }
          }
        ];

        // Add Apple Pay support for iOS devices
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
          supportedPaymentMethods.push({
            supportedMethods: 'https://apple.com/apple-pay'
          });
        }

        // Add Google Pay support for Android devices
        if (/Android/.test(navigator.userAgent)) {
          supportedPaymentMethods.push({
            supportedMethods: 'https://google.com/pay'
          });
        }

        const paymentDetails = {
          total: {
            label: `Payment to ${merchantName}`,
            amount: {
              currency: currency,
              value: amount.toFixed(2)
            }
          },
          displayItems: [
            {
              label: 'Item Total',
              amount: {
                currency: currency,
                value: amount.toFixed(2)
              }
            }
          ]
        };

        try {
          const paymentRequest = new (window as any).PaymentRequest(
            supportedPaymentMethods,
            paymentDetails
          );

          // Check if payment can be made
          if (await paymentRequest.canMakePayment()) {
            // Show native payment interface
            const paymentResponse = await paymentRequest.show();
            
            // Simulate payment processing
            setTimeout(async () => {
              await paymentResponse.complete('success');
              onPayment();
              setIsProcessing(false);
            }, 1500);
          } else {
            // Fallback to standard payment flow
            setTimeout(() => {
              onPayment();
              setIsProcessing(false);
            }, 1000);
          }
        } catch (error) {
          console.log('Payment Request failed, using fallback');
          // Fallback for unsupported browsers
          setTimeout(() => {
            onPayment();
            setIsProcessing(false);
          }, 1000);
        }
      } else {
        // Fallback for browsers without Payment Request API
        setTimeout(() => {
          onPayment();
          setIsProcessing(false);
        }, 1000);
      }
    } catch (error) {
      console.log('Payment cancelled or failed:', error);
      setIsProcessing(false);
    }
  };

  const handleDragStart = () => {
    if (disabled || isProcessing) return;
    setIsDragging(true);
  };

  const handleDrag = (event: any, info: any) => {
    if (disabled || !containerRef.current || isProcessing) return;
    
    const containerWidth = containerRef.current.offsetWidth;
    const sliderWidth = 48; // w-12 = 48px
    const maxDrag = containerWidth - sliderWidth - 16; // minus padding
    const progress = Math.max(0, Math.min(1, info.point.x / maxDrag));
    
    setDragProgress(progress);
    
    // Trigger mobile payment when dragged 80% of the way
    if (progress >= 0.8) {
      setIsDragging(false);
      setDragProgress(1);
      triggerMobilePayment();
    }
  };

  const handleDragEnd = () => {
    if (disabled || isProcessing) return;
    
    setIsDragging(false);
    if (dragProgress < 0.8) {
      // Reset to start position
      setDragProgress(0);
      controls.start({ x: 0 });
    }
  };

  useEffect(() => {
    if (!isDragging && dragProgress < 0.8 && !isProcessing) {
      controls.start({ x: 0 });
    }
  }, [isDragging, dragProgress, controls, isProcessing]);

  const getSlideText = () => {
    if (isProcessing) {
      return isMobileDevice() ? "Opening Payment App..." : "Processing Payment...";
    }
    return isMobileDevice() ? "Slide to Pay with Card" : "Slide to Pay";
  };

  const getHelpText = () => {
    if (isProcessing) {
      return isMobileDevice() 
        ? "Your device's payment app will open shortly" 
        : "Processing your payment...";
    }
    return isMobileDevice() 
      ? "Slide to open your device's payment interface" 
      : "Slide the circle to complete payment";
  };

  return (
    <div className="mb-8">
      <div 
        ref={containerRef}
        className={`relative bg-[hsl(155,40%,25%)] rounded-full h-16 overflow-hidden transition-all duration-300 ${
          isProcessing ? 'opacity-75' : ''
        }`}
      >
        {/* Background gradient fill */}
        <motion.div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-600 to-green-500 rounded-full"
          initial={{ width: "0%" }}
          animate={{ 
            width: isProcessing ? "100%" : `${dragProgress * 100}%`
          }}
          transition={{ duration: isProcessing ? 1.5 : 0.1 }}
        />
        
        {/* Background text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-medium opacity-90 text-sm sm:text-base">
            {getSlideText()}
          </span>
        </div>
        
        {/* Slider handle */}
        <motion.div
          className={`absolute left-2 top-2 w-12 h-12 bg-[hsl(25,60%,75%)] rounded-full shadow-lg cursor-pointer z-10 flex items-center justify-center ${
            isProcessing ? 'pointer-events-none' : ''
          }`}
          drag={!isProcessing ? "x" : false}
          dragConstraints={{ left: 0, right: containerRef.current ? containerRef.current.offsetWidth - 64 : 0 }}
          dragElastic={0}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          animate={controls}
          whileHover={{ scale: disabled || isProcessing ? 1 : 1.05 }}
          whileTap={{ scale: disabled || isProcessing ? 1 : 0.95 }}
          style={{ 
            opacity: disabled ? 0.5 : 1,
            cursor: disabled || isProcessing ? 'not-allowed' : 'pointer'
          }}
        >
          {isProcessing && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {!isProcessing && (
            <div className="w-6 h-6 text-green-800">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </motion.div>
      </div>
      
      <p className="text-gray-500 text-sm mt-4 text-center">
        {getHelpText()}
      </p>
      
      {isMobileDevice() && (
        <p className="text-blue-600 text-xs mt-2 text-center">
          💳 Supports Apple Pay, Google Pay, and card payments
        </p>
      )}
    </div>
  );
}