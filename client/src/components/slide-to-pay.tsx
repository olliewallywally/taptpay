import { useState, useRef } from "react";
import { motion } from "framer-motion";

interface SlideToPayProps {
  onPayment: () => void;
  disabled?: boolean;
  amount?: number;
  currency?: string;
  merchantName?: string;
}

export function SlideToPayComponent({ 
  onPayment, 
  disabled = false 
}: SlideToPayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = () => {
    if (dragProgress > 0.8 && !disabled) {
      onPayment();
    } else {
      setDragProgress(0);
    }
    setIsDragging(false);
  };

  const handleDrag = (event: any, info: any) => {
    if (!containerRef.current || disabled) return;
    
    const containerWidth = containerRef.current.offsetWidth - 60; // Account for button width
    const progress = Math.max(0, Math.min(1, info.point.x / containerWidth));
    setDragProgress(progress);
  };

  return (
    <div className="w-full">
      <div 
        ref={containerRef}
        className="relative bg-gray-100 rounded-full h-14 overflow-hidden border-2 border-gray-200"
      >
        {/* Background gradient based on progress */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-[hsl(155,40%,25%)] to-green-600 transition-all duration-300"
          style={{ 
            width: `${dragProgress * 100}%`,
            opacity: dragProgress > 0 ? 0.8 : 0 
          }}
        />
        
        {/* Slide text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span 
            className={`font-medium transition-all duration-300 ${
              dragProgress > 0.5 ? 'text-white' : 'text-gray-600'
            }`}
          >
            {dragProgress > 0.8 ? 'Release to Pay' : 'Slide to Pay'}
          </span>
        </div>
        
        {/* Draggable button */}
        <motion.div
          className={`absolute left-1 top-1 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center cursor-pointer ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          drag={disabled ? false : "x"}
          dragConstraints={{ left: 0, right: containerRef.current ? containerRef.current.offsetWidth - 60 : 0 }}
          dragElastic={0.1}
          onDragStart={() => setIsDragging(true)}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          animate={{ 
            x: dragProgress * (containerRef.current ? containerRef.current.offsetWidth - 60 : 0),
            backgroundColor: dragProgress > 0.8 ? "#059669" : "#ffffff"
          }}
          whileTap={{ scale: 0.95 }}
        >
          <div className={`w-6 h-6 rounded-full border-2 transition-colors ${
            dragProgress > 0.8 ? 'border-white' : 'border-[hsl(155,40%,25%)]'
          }`}>
            <div className={`w-full h-full rounded-full transition-colors ${
              dragProgress > 0.8 ? 'bg-white' : 'bg-[hsl(155,40%,25%)]'
            }`} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}