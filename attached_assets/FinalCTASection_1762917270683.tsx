import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

interface FinalCTASectionProps {
  onGetStarted: () => void;
}

export function FinalCTASection({ onGetStarted }: FinalCTASectionProps) {
  return (
    <motion.section 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8 }}
      className="bg-[#0055FF] px-[5vw]"
      style={{ paddingTop: 'clamp(5rem, 12vh, 8rem)', paddingBottom: 'clamp(5rem, 12vh, 8rem)' }}
    >
      <div className="max-w-[1000px] mx-auto text-center">
        <motion.h2 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="leading-tight"
          style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)', marginBottom: 'clamp(1.5rem, 3vh, 2rem)' }}
        >
          ready to simplify payments?
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-[#00E5CC]"
          style={{ fontSize: 'clamp(1.125rem, 2.25vw, 1.5rem)', marginBottom: 'clamp(3rem, 6vh, 4rem)' }}
        >
          join thousands of merchants who've ditched traditional pos systems
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          onClick={onGetStarted}
          className="bg-[#00E5CC] text-[#0055FF] rounded-full hover:bg-[#00FFE5] transition-all duration-300 inline-flex items-center group shadow-2xl hover:shadow-[#00E5CC]/20 transform hover:scale-105"
          style={{ 
            padding: 'clamp(1.25rem, 2vw, 1.75rem) clamp(3rem, 5vw, 5rem)',
            gap: 'clamp(0.75rem, 1.5vw, 1rem)',
            fontSize: 'clamp(1.125rem, 2.25vw, 1.5rem)'
          }}
        >
          <span>start now</span>
          <ArrowRight className="group-hover:translate-x-2 transition-transform" style={{ width: '1.75em', height: '1.75em' }} />
        </motion.button>
      </div>
    </motion.section>
  );
}
