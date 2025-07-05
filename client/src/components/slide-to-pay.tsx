import { useState, useRef, useEffect } from "react";
import { motion, useAnimation } from "framer-motion";

interface SlideToPayProps {
  onPayment: () => void;
  disabled?: boolean;
}

export function SlideToPayComponent({ onPayment, disabled = false }: SlideToPayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();

  const handleDragStart = () => {
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDrag = (event: any, info: any) => {
    if (disabled || !containerRef.current) return;
    
    const containerWidth = containerRef.current.offsetWidth;
    const sliderWidth = 48; // w-12 = 48px
    const maxDrag = containerWidth - sliderWidth - 16; // minus padding
    const progress = Math.max(0, Math.min(1, info.point.x / maxDrag));
    
    setDragProgress(progress);
    
    // Trigger payment when dragged 80% of the way
    if (progress >= 0.8) {
      setIsDragging(false);
      setDragProgress(1);
      onPayment();
    }
  };

  const handleDragEnd = () => {
    if (disabled) return;
    
    setIsDragging(false);
    if (dragProgress < 0.8) {
      // Reset to start position
      setDragProgress(0);
      controls.start({ x: 0 });
    }
  };

  useEffect(() => {
    if (!isDragging && dragProgress < 0.8) {
      controls.start({ x: 0 });
    }
  }, [isDragging, dragProgress, controls]);

  return (
    <div className="mb-8">
      <div 
        ref={containerRef}
        className="relative bg-[hsl(155,40%,25%)] rounded-full h-16 overflow-hidden"
      >
        {/* Background text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-medium opacity-75">
            Slide to Pay
          </span>
        </div>
        
        {/* Slider handle */}
        <motion.div
          className="absolute left-2 top-2 w-12 h-12 bg-[hsl(25,60%,75%)] rounded-full shadow-lg cursor-pointer z-10"
          drag="x"
          dragConstraints={{ left: 0, right: containerRef.current ? containerRef.current.offsetWidth - 64 : 0 }}
          dragElastic={0}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          animate={controls}
          whileHover={{ scale: disabled ? 1 : 1.05 }}
          whileTap={{ scale: disabled ? 1 : 0.95 }}
          style={{ 
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        />
      </div>
      
      <p className="text-gray-500 text-sm mt-4 text-center">
        Slide the circle to complete payment
      </p>
    </div>
  );
}
