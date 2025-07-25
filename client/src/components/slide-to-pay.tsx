import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, useMotionValue } from "framer-motion";

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
  const [isCompleted, setIsCompleted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  
  const [dragProgress, setDragProgress] = useState(0);

  // Optimized progress tracking
  useEffect(() => {
    const updateProgress = () => {
      if (!containerRef.current) return;
      const maxX = containerRef.current.offsetWidth - 56;
      const currentX = x.get();
      const progress = Math.max(0, Math.min(1, currentX / maxX));
      setDragProgress(progress);
    };

    const unsubscribe = x.on("change", updateProgress);
    return unsubscribe;
  }, [x]);

  // Memoized styles for better performance
  const containerStyles = useMemo(() => ({
    position: 'relative' as const,
    height: '56px',
    borderRadius: '28px',
    overflow: 'hidden' as const,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    backdropFilter: 'blur(40px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
  }), []);

  const liquidBackgroundStyles = useMemo(() => ({
    position: 'absolute' as const,
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: '28px',
    background: isCompleted 
      ? 'linear-gradient(90deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.9))'
      : `linear-gradient(90deg, rgba(34, 197, 94, ${0.3 + dragProgress * 0.5}), rgba(22, 163, 74, ${0.4 + dragProgress * 0.5}))`,
    width: `${Math.max(20, dragProgress * 100)}%`,
    transition: isCompleted ? 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'width 0.1s ease-out',
    zIndex: 1
  }), [isCompleted, dragProgress]);

  const handleDragEnd = useCallback(() => {
    if (dragProgress > 0.8 && !disabled) {
      console.log("Slide to pay completed - triggering payment");
      setIsCompleted(true);
      onPayment();
      // Keep the slider at the end position briefly to show completion
      setTimeout(() => {
        x.set(0);
        setIsCompleted(false);
      }, 800);
    } else {
      x.set(0);
    }
  }, [dragProgress, disabled, onPayment, x]);

  return (
    <div className="w-full">
      <div 
        ref={containerRef}
        style={{
          position: 'relative',
          height: '56px',
          borderRadius: '28px',
          overflow: 'hidden',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          backdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
        }}
      >
        {/* Liquid background gradient that follows drag */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            borderRadius: '28px',
            background: isCompleted 
              ? 'linear-gradient(90deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.9))'
              : 'linear-gradient(90deg, rgba(34, 197, 94, 0.6), rgba(22, 163, 74, 0.7))',
            width: isCompleted ? '100%' : `${Math.max(20, dragProgress * 100)}%`,
            transition: isCompleted ? 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'width 0.2s ease-out',
            opacity: dragProgress > 0 || isCompleted ? 1 : 0,
            filter: 'blur(0.5px)'
          }}
        />
        
        {/* Shimmer effect overlay */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
            animation: dragProgress > 0.5 ? 'shimmer 2s infinite' : 'none'
          }}
        />
        
        {/* Slide text with better typography */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <span 
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: dragProgress > 0.3 || isCompleted ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.9)',
              transition: 'color 0.3s ease',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.8)',
              letterSpacing: '0.5px'
            }}
          >
            {isCompleted ? '✓ Payment Started!' : 
             dragProgress > 0.8 ? 'Release to Pay' : 'Slide to Pay →'}
          </span>
        </div>
        
        {/* Enhanced draggable button with liquid glass effect */}
        <motion.div
          style={{
            position: 'absolute',
            left: '4px',
            top: '4px',
            width: '48px',
            height: '48px',
            borderRadius: '24px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'grab',
            opacity: disabled ? 0.5 : 1,
            x
          }}
          drag={disabled ? false : "x"}
          dragConstraints={containerRef}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          whileTap={{ 
            scale: 0.98
          }}
          whileDrag={{
            cursor: 'grabbing',
            scale: 1.02
          }}
        >
          {/* Inner button indicator */}
          <div 
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '12px',
              background: dragProgress > 0.8 || isCompleted 
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(22, 163, 74, 0.95))'
                : 'linear-gradient(135deg, rgba(34, 197, 94, 0.6), rgba(22, 163, 74, 0.7))',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isCompleted && <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
          </div>
        </motion.div>
      </div>
      
      {/* Custom CSS for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}