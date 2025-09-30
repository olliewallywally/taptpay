import { memo, ReactNode } from 'react';

interface AnimatedBrandBackgroundProps {
  children: ReactNode;
  backgroundColor?: string;
  circleColor?: string;
  shapeColor?: string;
  shapeOpacity?: number;
  largeCirclePosition?: string;
  smallCirclePosition?: string;
  extraLargeCirclePosition?: string;
  extraSmallCirclePosition?: string;
}

export const AnimatedBrandBackground = memo(({
  children,
  backgroundColor = '#00D4D4',
  circleColor = '#0000FF',
  shapeColor = 'white',
  shapeOpacity = 0.6,
  largeCirclePosition = 'bottom-[-120px] right-[-120px]',
  smallCirclePosition = 'bottom-[200px] right-[250px]',
  extraLargeCirclePosition,
  extraSmallCirclePosition,
}: AnimatedBrandBackgroundProps) => {
  return (
    <div className="min-h-screen relative overflow-hidden p-4">
      {/* Background Layer - Fixed */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{ backgroundColor }}
      >
        {/* Large Circle */}
        <div 
          className={`absolute w-96 h-96 rounded-full animate-slow-float-1 ${largeCirclePosition}`}
          style={{ 
            backgroundColor: circleColor,
            willChange: 'transform',
          }}
        />
        
        {/* Smaller Circle */}
        <div 
          className={`absolute w-48 h-48 rounded-full animate-slow-float-2 ${smallCirclePosition}`}
          style={{ 
            backgroundColor: circleColor,
            willChange: 'transform',
          }}
        />
        
        {/* Extra Large Circle (optional) */}
        {extraLargeCirclePosition && (
          <div 
            className={`absolute w-96 h-96 rounded-full animate-slow-float-1 ${extraLargeCirclePosition}`}
            style={{ 
              backgroundColor: circleColor,
              willChange: 'transform',
            }}
          />
        )}
        
        {/* Extra Small Circle (optional) */}
        {extraSmallCirclePosition && (
          <div 
            className={`absolute w-48 h-48 rounded-full animate-slow-float-2 ${extraSmallCirclePosition}`}
            style={{ 
              backgroundColor: circleColor,
              willChange: 'transform',
            }}
          />
        )}
        
        {/* Floating Line-art Shapes */}
        {/* Triangle 1 */}
        <svg 
          className="absolute top-[15%] left-[10%] w-12 h-12 animate-float-shape-1" 
          style={{ 
            color: shapeColor, 
            opacity: shapeOpacity,
            willChange: 'transform',
          }}
        >
          <polygon points="24,4 44,44 4,44" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        {/* Triangle 2 */}
        <svg 
          className="absolute top-[70%] left-[80%] w-10 h-10 animate-float-shape-2"
          style={{ 
            color: shapeColor, 
            opacity: shapeOpacity,
            willChange: 'transform',
          }}
        >
          <polygon points="20,4 36,36 4,36" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        {/* Box 1 */}
        <svg 
          className="absolute top-[25%] right-[15%] w-11 h-11 animate-float-shape-3"
          style={{ 
            color: shapeColor, 
            opacity: shapeOpacity,
            willChange: 'transform',
          }}
        >
          <rect x="4" y="4" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        {/* Box 2 */}
        <svg 
          className="absolute bottom-[30%] left-[20%] w-9 h-9 animate-float-shape-4"
          style={{ 
            color: shapeColor, 
            opacity: shapeOpacity,
            willChange: 'transform',
          }}
        >
          <rect x="4" y="4" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        {/* X 1 */}
        <svg 
          className="absolute top-[60%] right-[25%] w-10 h-10 animate-float-shape-5"
          style={{ 
            color: shapeColor, 
            opacity: shapeOpacity,
            willChange: 'transform',
          }}
        >
          <line x1="6" y1="6" x2="34" y2="34" stroke="currentColor" strokeWidth="2" />
          <line x1="34" y1="6" x2="6" y2="34" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        {/* X 2 */}
        <svg 
          className="absolute top-[40%] left-[15%] w-12 h-12 animate-float-shape-6"
          style={{ 
            color: shapeColor, 
            opacity: shapeOpacity,
            willChange: 'transform',
          }}
        >
          <line x1="8" y1="8" x2="40" y2="40" stroke="currentColor" strokeWidth="2" />
          <line x1="40" y1="8" x2="8" y2="40" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>

      {/* Content Layer */}
      <div className="relative z-10 flex min-h-screen items-center justify-center w-full">
        {children}
      </div>
    </div>
  );
});

AnimatedBrandBackground.displayName = 'AnimatedBrandBackground';
