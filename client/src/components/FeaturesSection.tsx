import { motion } from 'motion/react';
import { Smartphone, Zap, CreditCard, BarChart3 } from 'lucide-react';
import { ImageWithFallback } from './ImageWithFallback';
import activeTransactionsImage from "@assets/d_1762915045324.png";

export function FeaturesSection() {
  return (
    <motion.section 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6 }}
      style={{ 
        backgroundColor: 'white',
        color: '#0055FF',
        padding: 'clamp(3rem, 8vh, 6rem) clamp(1.5rem, 5vw, 3rem)',
      }}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
          style={{ marginBottom: 'clamp(3rem, 6vh, 5rem)' }}
        >
          <h2 style={{ fontSize: 'clamp(1.75rem, 4.5vw, 4rem)', marginBottom: 'clamp(0.75rem, 2vh, 1.5rem)' }}>
            everything you need. nothing you don't.
          </h2>
          <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1.25rem)', maxWidth: '700px', margin: '0 auto' }}>
            A complete payment solution designed for modern businesses
          </p>
        </motion.div>

        <div className="hidden lg:grid grid-cols-2 gap-8 lg:gap-16 items-start">
          {/* Phone Mockup - Hidden on mobile, shown on desktop */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex justify-center lg:justify-end items-center"
            style={{ minHeight: '600px', marginLeft: '-15%' }}
          >
            <div 
              style={{ 
                width: '100%', 
                maxWidth: '360px',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}
              className="hover:scale-105"
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0 0 30px rgba(0, 229, 204, 0.6))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none';
              }}
            >
              <ImageWithFallback
                src={activeTransactionsImage}
                alt="taptpay active transactions dashboard"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </motion.div>

          {/* Features List */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1.5rem, 3vh, 2.5rem)' }}>
              {/* Feature 1 */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="border-t-2 border-[#00E5CC]"
                style={{ paddingTop: 'clamp(1.25rem, 2.5vh, 2rem)' }}
              >
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center" style={{ width: 'clamp(2.5rem, 5vw, 3.5rem)', height: 'clamp(2.5rem, 5vw, 3.5rem)', marginBottom: 'clamp(0.75rem, 1.5vh, 1.5rem)' }}>
                  <Zap className="text-[#0055FF]" style={{ width: '45%', height: '45%' }} />
                </div>
                <h3 style={{ fontSize: 'clamp(1.125rem, 2.25vw, 1.875rem)', marginBottom: 'clamp(0.5rem, 1vh, 1rem)' }}>Real-Time Dashboard</h3>
                <p className="text-[#0055FF]/70 leading-relaxed" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)' }}>
                  Track active transactions, sales performance, and inventory all in one beautiful interface.
                </p>
              </motion.div>

              {/* Feature 2 */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="border-t-2 border-[#00E5CC]"
                style={{ paddingTop: 'clamp(1.25rem, 2.5vh, 2rem)' }}
              >
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center" style={{ width: 'clamp(2.5rem, 5vw, 3.5rem)', height: 'clamp(2.5rem, 5vw, 3.5rem)', marginBottom: 'clamp(0.75rem, 1.5vh, 1.5rem)' }}>
                  <BarChart3 className="text-[#0055FF]" style={{ width: '45%', height: '45%' }} />
                </div>
                <h3 style={{ fontSize: 'clamp(1.125rem, 2.25vw, 1.875rem)', marginBottom: 'clamp(0.5rem, 1vh, 1rem)' }}>Visual Analytics</h3>
                <p className="text-[#0055FF]/70 leading-relaxed" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)' }}>
                  Understand your business at a glance with intuitive charts and progress indicators.
                </p>
              </motion.div>

              {/* Feature 3 */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="border-t-2 border-[#00E5CC]"
                style={{ paddingTop: 'clamp(1.25rem, 2.5vh, 2rem)' }}
              >
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center" style={{ width: 'clamp(2.5rem, 5vw, 3.5rem)', height: 'clamp(2.5rem, 5vw, 3.5rem)', marginBottom: 'clamp(0.75rem, 1.5vh, 1.5rem)' }}>
                  <Smartphone className="text-[#0055FF]" style={{ width: '45%', height: '45%' }} />
                </div>
                <h3 style={{ fontSize: 'clamp(1.125rem, 2.25vw, 1.875rem)', marginBottom: 'clamp(0.5rem, 1vh, 1rem)' }}>Mobile-First Design</h3>
                <p className="text-[#0055FF]/70 leading-relaxed" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)' }}>
                  Manage your entire business from your phone with our optimized mobile experience.
                </p>
              </motion.div>

              {/* Feature 4 */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="border-t-2 border-[#00E5CC]"
                style={{ paddingTop: 'clamp(1.25rem, 2.5vh, 2rem)' }}
              >
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center" style={{ width: 'clamp(2.5rem, 5vw, 3.5rem)', height: 'clamp(2.5rem, 5vw, 3.5rem)', marginBottom: 'clamp(0.75rem, 1.5vh, 1.5rem)' }}>
                  <CreditCard className="text-[#0055FF]" style={{ width: '45%', height: '45%' }} />
                </div>
                <h3 style={{ fontSize: 'clamp(1.125rem, 2.25vw, 1.875rem)', marginBottom: 'clamp(0.5rem, 1vh, 1rem)' }}>NFC Payments</h3>
                <p className="text-[#0055FF]/70 leading-relaxed" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)' }}>
                  Accept contactless payments instantly with secure NFC technology.
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Mobile-Only Layout */}
        <div className="lg:hidden">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Phone Image - Left Side */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="flex justify-center md:justify-start flex-shrink-0"
            >
              <div className="relative">
                {/* Glow effect behind phone */}
                <div 
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '120%',
                    height: '120%',
                    background: 'radial-gradient(circle, rgba(0, 229, 204, 0.3) 0%, transparent 70%)',
                    filter: 'blur(60px)',
                    zIndex: 0,
                  }}
                />
                <div 
                  style={{ 
                    width: '250px', 
                    maxWidth: '250px', 
                    position: 'relative', 
                    zIndex: 1,
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }}
                  className="hover:scale-105"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.filter = 'drop-shadow(0 0 30px rgba(0, 229, 204, 0.6))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = 'none';
                  }}
                >
                  <ImageWithFallback
                    src={activeTransactionsImage}
                    alt="taptpay active transactions dashboard"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
              </div>
            </motion.div>

            {/* Features Icons - Right Side */}
            <div className="grid grid-cols-2 gap-6 md:gap-8 w-full md:w-auto">
              {/* Feature 1 */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="group relative flex flex-col items-center text-center cursor-pointer"
              >
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-[#00E5CC]/50" 
                     style={{ width: 'clamp(4rem, 10vw, 6rem)', height: 'clamp(4rem, 10vw, 6rem)' }}>
                  <Zap className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
                </div>
                <h3 className="mt-3 transition-colors group-hover:text-[#00E5CC]" 
                    style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
                  Real-Time Dashboard
                </h3>
                {/* Hover Description */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-10">
                  <div className="bg-[#0055FF] border-2 border-[#00E5CC] rounded-lg p-3 shadow-xl">
                    <p className="text-white text-sm leading-relaxed">
                      Track active transactions, sales performance, and inventory all in one beautiful interface.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Feature 2 */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="group relative flex flex-col items-center text-center cursor-pointer"
              >
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-[#00E5CC]/50" 
                     style={{ width: 'clamp(4rem, 10vw, 6rem)', height: 'clamp(4rem, 10vw, 6rem)' }}>
                  <BarChart3 className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
                </div>
                <h3 className="mt-3 transition-colors group-hover:text-[#00E5CC]" 
                    style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
                  Visual Analytics
                </h3>
                {/* Hover Description */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-10">
                  <div className="bg-[#0055FF] border-2 border-[#00E5CC] rounded-lg p-3 shadow-xl">
                    <p className="text-white text-sm leading-relaxed">
                      Understand your business at a glance with intuitive charts and progress indicators.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Feature 3 */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="group relative flex flex-col items-center text-center cursor-pointer"
              >
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-[#00E5CC]/50" 
                     style={{ width: 'clamp(4rem, 10vw, 6rem)', height: 'clamp(4rem, 10vw, 6rem)' }}>
                  <Smartphone className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
                </div>
                <h3 className="mt-3 transition-colors group-hover:text-[#00E5CC]" 
                    style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
                  Mobile-First Design
                </h3>
                {/* Hover Description */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-10">
                  <div className="bg-[#0055FF] border-2 border-[#00E5CC] rounded-lg p-3 shadow-xl">
                    <p className="text-white text-sm leading-relaxed">
                      Manage your entire business from your phone with our optimized mobile experience.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Feature 4 */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="group relative flex flex-col items-center text-center cursor-pointer"
              >
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-[#00E5CC]/50" 
                     style={{ width: 'clamp(4rem, 10vw, 6rem)', height: 'clamp(4rem, 10vw, 6rem)' }}>
                  <CreditCard className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
                </div>
                <h3 className="mt-3 transition-colors group-hover:text-[#00E5CC]" 
                    style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
                  NFC Payments
                </h3>
                {/* Hover Description */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-10">
                  <div className="bg-[#0055FF] border-2 border-[#00E5CC] rounded-lg p-3 shadow-xl">
                    <p className="text-white text-sm leading-relaxed">
                      Accept contactless payments instantly with secure NFC technology.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
