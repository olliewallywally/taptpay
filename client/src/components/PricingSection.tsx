import { motion } from 'motion/react';
import { CheckCircle } from 'lucide-react';

export function PricingSection() {
  return (
    <motion.section 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8 }}
      className="bg-[#001133] px-[5vw]"
      style={{ paddingTop: 'clamp(5rem, 12vh, 8rem)', paddingBottom: 'clamp(5rem, 12vh, 8rem)' }}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
          style={{ marginBottom: 'clamp(3rem, 6vh, 4rem)' }}
        >
          <h2 className="leading-tight text-[#00E5CC]" style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', marginBottom: 'clamp(1rem, 2vh, 1.5rem)' }}>
            what does it cost?
          </h2>
          <p className="text-white/60" style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1.125rem)', maxWidth: '900px', margin: '0 auto' }}>
            you will be charged $0.10 per transaction by adding a credit card/debit card to the system and you will be charged either weekly/bi-weekly/monthly
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 'clamp(2rem, 4vw, 3rem)' }}>
          {/* SME */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="bg-[#0055FF] border-2 border-[#00E5CC] rounded-2xl text-white"
            style={{ padding: 'clamp(2rem, 4vw, 2.5rem)' }}
          >
            <h3 className="text-[#00E5CC]" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: 'clamp(1rem, 2vh, 1.5rem)' }}>
              SME
            </h3>
            <div className="border-b border-white/10" style={{ paddingBottom: 'clamp(1.5rem, 3vh, 2rem)', marginBottom: 'clamp(1.5rem, 3vh, 2rem)' }}>
              <div style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1rem)', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>
                1000 transactions and below per month
              </div>
              <div className="text-white" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
                No monthly system fee
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 1.5vh, 1rem)', fontSize: 'clamp(0.875rem, 1.75vw, 1rem)' }}>
              <div className="flex items-start gap-2">
                <CheckCircle className="text-[#00E5CC] flex-shrink-0" style={{ width: '1.25em', height: '1.25em', marginTop: '0.125em' }} />
                <span>2 login's per business</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="text-[#00E5CC] flex-shrink-0" style={{ width: '1.25em', height: '1.25em', marginTop: '0.125em' }} />
                <span>2 payment stones ($29.99 normally)</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="text-[#00E5CC] flex-shrink-0" style={{ width: '1.25em', height: '1.25em', marginTop: '0.125em' }} />
                <span>$89.99 for set up kit - 2 design requests. (kit includes x2 payment stones, 2 other info signage, magnetic mount)</span>
              </div>
            </div>
          </motion.div>

          {/* Enterprise */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-[#0055FF] border-2 border-[#00E5CC] rounded-2xl text-white"
            style={{ padding: 'clamp(2rem, 4vw, 2.5rem)' }}
          >
            <h3 className="text-[#00E5CC]" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: 'clamp(1rem, 2vh, 1.5rem)' }}>
              Enterprise
            </h3>
            <div className="border-b border-white/10" style={{ paddingBottom: 'clamp(1.5rem, 3vh, 2rem)', marginBottom: 'clamp(1.5rem, 3vh, 2rem)' }}>
              <div style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1rem)', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem' }}>
                1000+ transactions and above per month
              </div>
              <div className="text-white" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
                $19.99<span style={{ fontSize: '0.6em', color: 'rgba(255, 255, 255, 0.6)' }}> per month system fee</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 1.5vh, 1rem)', fontSize: 'clamp(0.875rem, 1.75vw, 1rem)' }}>
              <div className="flex items-start gap-2">
                <CheckCircle className="text-[#00E5CC] flex-shrink-0" style={{ width: '1.25em', height: '1.25em', marginTop: '0.125em' }} />
                <span>10 login's per business</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="text-[#00E5CC] flex-shrink-0" style={{ width: '1.25em', height: '1.25em', marginTop: '0.125em' }} />
                <span>5-10 payment stones ($29.99 normally)</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="text-[#00E5CC] flex-shrink-0" style={{ width: '1.25em', height: '1.25em', marginTop: '0.125em' }} />
                <span>$129.99 for set up kit - 5 design requests. (kit includes x5 payment stones, 3 other info signage, x2 magnetic mount)</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
