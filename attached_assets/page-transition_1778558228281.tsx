import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        initial={{ opacity: 0, y: 14, scale: 0.982 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.988 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: "opacity, transform" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
