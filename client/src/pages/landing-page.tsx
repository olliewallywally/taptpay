import { useLocation } from "wouter";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { HowItWorksSection } from "@/components/HowItWorksSection";
import { CustomerExperienceSection } from "@/components/CustomerExperienceSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { TerminalFeaturesSection } from "@/components/TerminalFeaturesSection";
import { PricingSection } from "@/components/PricingSection";
import { Check, ArrowRight } from "lucide-react";

import logoImage from "@assets/logo_1762915255857.png";

export function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#0055FF] px-6">
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto w-full">
          <ImageWithFallback
            src={logoImage}
            alt="TaptPay Logo"
            className="h-24 md:h-32 mb-16"
          />

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-light text-white mb-6 leading-tight">
            a pos system that isn't one
          </h1>
          
          <p className="text-lg md:text-xl text-white/80 mb-12 font-light">
            100% digital point of sale system
          </p>

          <button
            onClick={() => setLocation("/login")}
            className="bg-[#00E5CC] hover:bg-[#00d4bc] text-[#0055FF] font-medium px-10 py-3.5 rounded-full text-base md:text-lg transition-all transform hover:scale-105 shadow-lg flex items-center gap-2 lowercase"
            data-testid="button-get-started"
          >
            get started
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        <div className="relative z-10 pb-8">
          <p className="text-white/60 text-xs md:text-sm tracking-wider uppercase font-light">
            100% KIWI OWNED AND OPERATED
          </p>
        </div>
      </section>

      <FeaturesSection />

      <section className="py-20 px-6 bg-[#0055FF]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-center mb-4 text-[#00E5CC] lowercase">
            how it works
          </h2>
          <p className="text-base md:text-lg text-white/80 text-center mb-16">
            Get started with taptpay in 4 simple steps
          </p>

          <HowItWorksSection />
        </div>
      </section>

      <CustomerExperienceSection />

      <TerminalFeaturesSection />

      <PricingSection />

      <section className="py-20 px-6 bg-[#E8E5E0]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
            Ready to Transform Your Payment Experience?
          </h2>
          <p className="text-xl text-gray-700 mb-10 max-w-2xl mx-auto">
            Join thousands of businesses already using TaptPay to accept payments faster and easier.
          </p>

          <button
            onClick={() => setLocation("/login")}
            className="bg-[#0055FF] hover:bg-[#0044CC] text-white font-semibold px-12 py-4 rounded-full text-lg transition-all transform hover:scale-105 shadow-lg"
            data-testid="button-cta-get-started"
          >
            Get Started Free
          </button>

          <p className="text-gray-600 mt-6">
            No credit card required • Set up in minutes
          </p>
        </div>
      </section>

      <footer className="bg-gray-900 text-white py-12 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="mb-6">
            <ImageWithFallback
              src={logoImage}
              alt="TaptPay Logo"
              className="h-10 mx-auto opacity-80"
            />
          </div>
          <p className="text-gray-400">
            © 2025 TaptPay. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
