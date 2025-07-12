import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";

interface PageTransitionProps {
  children: React.ReactNode;
}

// Define page navigation hierarchy for slide direction
const pageHierarchy: { [key: string]: number } = {
  "/": 0,
  "/login": 0,
  "/dashboard": 1,
  "/merchant": 2,
  "/transactions": 3,
  "/nfc": 4,
  "/settings": 5
};

export function PageTransition({ children }: PageTransitionProps) {
  const [location] = useLocation();
  const [displayedLocation, setDisplayedLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState<'stable' | 'exiting' | 'entering'>('stable');
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (location !== displayedLocation) {
      // Clear any pending timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Determine slide direction based on page hierarchy
      const currentLevel = pageHierarchy[displayedLocation] || 0;
      const newLevel = pageHierarchy[location] || 0;
      const newDirection = newLevel > currentLevel ? 'forward' : 'backward';
      
      setDirection(newDirection);
      setTransitionStage('exiting');

      // After exit animation, update content and start enter animation
      timeoutRef.current = setTimeout(() => {
        setDisplayedLocation(location);
        setTransitionStage('entering');
        
        // Complete the transition
        timeoutRef.current = setTimeout(() => {
          setTransitionStage('stable');
        }, 400);
      }, 200);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [location, displayedLocation]);

  // Animation classes based on stage and direction
  const getAnimationClass = () => {
    if (transitionStage === 'stable') return '';
    
    if (transitionStage === 'exiting') {
      return direction === 'forward' ? 'slide-exit-left' : 'slide-exit-right';
    }
    
    if (transitionStage === 'entering') {
      return direction === 'forward' ? 'slide-enter-right' : 'slide-enter-left';
    }
    
    return '';
  };

  return (
    <div className="page-transition-container">
      <div className={`page-wrapper ${getAnimationClass()}`}>
        {children}
      </div>
    </div>
  );
}