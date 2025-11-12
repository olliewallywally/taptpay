import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import terminalReadyImage from 'figma:asset/d12182ce78d26d9b630c403a22b65b9093661f26.png';
import terminalSplitBillImage from 'figma:asset/090149ac5973d338120c349fe8b70a1a18b2edd7.png';
import terminalShareImage from 'figma:asset/fc85a58b2103efe72088b2d7e937ec7833d5fc25.png';
import terminalNfcImage from 'figma:asset/40f125a883ef4cf24b6941c8da3061a6ae26b440.png';

export function TerminalFeaturesSection() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const terminalFeatures = [
    {
      image: terminalReadyImage,
      title: 'Quick Payment Entry',
      description: 'Enter amounts with one tap, adjust with custom buttons, and trigger payment stones instantly',
      maxWidth: '144px'
    },
    {
      image: terminalSplitBillImage,
      title: 'Split Bill',
      description: 'Divide payments evenly among multiple people with automatic calculation',
      maxWidth: '144px'
    },
    {
      image: terminalShareImage,
      title: 'Share Payment',
      description: 'Send payment links via email, SMS, or QR code for remote payments',
      maxWidth: '144px'
    },
    {
      image: terminalNfcImage,
      title: 'NFC Paywave',
      description: 'Turn your phone into an EFTPOS machine - accept all contactless payment methods directly',
      maxWidth: '200px'
    }
  ];

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % terminalFeatures.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + terminalFeatures.length) % terminalFeatures.length);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      nextSlide();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.section 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8 }}
      className="bg-[#0055FF] px-[5vw]"
      style={{ paddingTop: 'clamp(3rem, 8vh, 8rem)', paddingBottom: 'clamp(3rem, 8vh, 8rem)' }}
    >
      <div className="max-w-[1400px] mx-auto">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
          style={{ marginBottom: 'clamp(2.5rem, 6vh, 6rem)' }}
        >
          <h2 className="leading-tight" style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)', marginBottom: 'clamp(0.75rem, 1.5vh, 1.5rem)' }}>
            the digital terminal
          </h2>
          <p className="text-[#00E5CC]/70" style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1.125rem)', maxWidth: '800px', margin: '0 auto', padding: '0 1rem' }}>
            Everything you need to process payments, right from your phone
          </p>
        </motion.div>

        {/* Carousel */}
        <div style={{ maxWidth: '600px', margin: '0 auto', position: 'relative' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex flex-col items-center text-center" style={{ padding: '0 60px' }}>
                <div className="mb-4" style={{ width: '100%', maxWidth: terminalFeatures[currentSlide].maxWidth, margin: '0 auto' }}>
                  <img
                    src={terminalFeatures[currentSlide].image}
                    alt={terminalFeatures[currentSlide].title}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
                <h3 className="text-[#00E5CC]" style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', marginBottom: 'clamp(0.5rem, 1vh, 0.75rem)' }}>
                  {terminalFeatures[currentSlide].title}
                </h3>
                <p className="text-white/70" style={{ fontSize: 'clamp(0.8rem, 1.5vw, 0.875rem)', lineHeight: '1.5', padding: '0 0.5rem' }}>
                  {terminalFeatures[currentSlide].description}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-[#00E5CC]/20 hover:bg-[#00E5CC]/40 text-[#00E5CC] rounded-full p-2 transition-all duration-300"
            style={{ zIndex: 10 }}
          >
            <ChevronLeft style={{ width: '24px', height: '24px' }} />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-[#00E5CC]/20 hover:bg-[#00E5CC]/40 text-[#00E5CC] rounded-full p-2 transition-all duration-300"
            style={{ zIndex: 10 }}
          >
            <ChevronRight style={{ width: '24px', height: '24px' }} />
          </button>

          {/* Dots Navigation */}
          <div className="flex justify-center gap-2 mt-8">
            {terminalFeatures.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className="rounded-full transition-all duration-300"
                style={{
                  width: currentSlide === index ? '24px' : '8px',
                  height: '8px',
                  backgroundColor: currentSlide === index ? '#00E5CC' : 'rgba(0, 229, 204, 0.3)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
