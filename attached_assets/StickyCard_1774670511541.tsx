import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

interface StickyCardProps {
  children: React.ReactNode;
  index: number;
  backgroundColor?: string;
  isDouble?: boolean;
}

export function StickyCard({ children, index, backgroundColor = "#ffffff", isDouble = false }: StickyCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1, 0.7]);

  return (
    <div
      ref={ref}
      className="sticky top-0 h-screen flex items-center justify-center px-4 md:px-6 lg:px-8"
      style={{ paddingTop: `${index * 30}px` }}
    >
      <motion.div
        style={{
          scale,
          opacity,
          backgroundColor,
        }}
        className={`w-full max-w-7xl rounded-3xl shadow-2xl overflow-hidden ${
          isDouble ? "h-[95vh]" : "h-[90vh]"
        }`}
      >
        {children}
      </motion.div>
    </div>
  );
}
