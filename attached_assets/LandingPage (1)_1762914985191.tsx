import { ArrowRight, CheckCircle, Smartphone, Zap, CreditCard, BarChart3, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import logo from 'figma:asset/987108cf9c4e186fbd1d468c6f1509d644b9173e.png';
import { HowItWorksSection } from './HowItWorksSection';
import { ImageWithFallback } from './figma/ImageWithFallback';
import dashboardImage from 'figma:asset/3ee5e900850d85ab913c8789a6b9c8e8d50ae75f.png';
import activeTransactionsImage from 'figma:asset/f1a904a091b7273f7f0081b7e3848edbecad2379.png';
import paymentStonesImage from 'figma:asset/3de5b7890d7c826f4a87008c193ce03eb740fdbb.png';
import customerPhoneImage from 'figma:asset/a1bb2d782180f000cbed413c87303677cffe9cd9.png';
import terminalReadyImage from 'figma:asset/d12182ce78d26d9b630c403a22b65b9093661f26.png';
import terminalSplitBillImage from 'figma:asset/090149ac5973d338120c349fe8b70a1a18b2edd7.png';
import terminalShareImage from 'figma:asset/fc85a58b2103efe72088b2d7e937ec7833d5fc25.png';
import terminalNfcImage from 'figma:asset/40f125a883ef4cf24b6941c8da3061a6ae26b440.png';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
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
    <div className="min-h-screen bg-[#0055FF] text-white font-['Outfit']" style={{ fontSize: 'clamp(14px, 1.5vw, 18px)' }}>
      {/* Hero Section */}
      <motion.section 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative min-h-screen flex items-center justify-center px-[5vw] py-[10vh]"
      >
        <div className="max-w-[1200px] w-full mx-auto text-center">
          {/* Logo */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-[1vh]"
          >
            <img 
              src={logo} 
              alt="taptpay" 
              className="mx-auto" 
              style={{ height: 'clamp(200px, 35vh, 480px)', width: 'auto', objectFit: 'contain' }}
            />
          </motion.div>

          {/* Hero Text */}
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-[1vh] font-light text-white"
            style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.75rem)' }}
          >
            a <span className="font-medium">pos</span> system that isn't one
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-white/80 mb-[8vh]"
            style={{ fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)' }}
          >
            100% digital point of sale system
          </motion.p>

          {/* CTA Button */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            onClick={onGetStarted}
            className="bg-[#00E5CC] text-[#0055FF] rounded-full hover:bg-[#00FFE5] transition-all duration-300 inline-flex items-center gap-[1em] group shadow-lg hover:shadow-xl transform hover:scale-105 mb-[8vh]"
            style={{ 
              padding: 'clamp(1rem, 1.5vw, 1.5rem) clamp(2.5rem, 4vw, 4rem)',
              fontSize: 'clamp(1.125rem, 2vw, 1.5rem)'
            }}
          >
            <span>get started</span>
            <ArrowRight className="group-hover:translate-x-1 transition-transform" style={{ width: '1.5em', height: '1.5em' }} />
          </motion.button>

          {/* Trust Indicator */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="text-[#00E5CC]/60 uppercase tracking-wider"
            style={{ fontSize: 'clamp(0.75rem, 1.5vw, 1rem)' }}
          >
            100% kiwi owned and operated
          </motion.div>
        </div>
      </motion.section>

      {/* Everything You Need Section */}
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
        {/* Section content - see full file for complete code */}
      </motion.section>

      {/* How It Works Section */}
      <HowItWorksSection />

      {/* Customer Experience Section */}
      {/* See full file for complete code */}

      {/* Digital Terminal Features Section */}
      {/* See full file for complete code */}

      {/* Pricing Section */}
      {/* See full file for complete code */}

      {/* Final CTA Section */}
      {/* See full file for complete code */}

      {/* Footer */}
      {/* See full file for complete code */}
    </div>
  );
}
