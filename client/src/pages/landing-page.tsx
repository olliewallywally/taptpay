import { useLocation } from "wouter";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { HowItWorksSection } from "@/components/HowItWorksSection";
import { CustomerExperienceSection } from "@/components/CustomerExperienceSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { TerminalFeaturesSection } from "@/components/TerminalFeaturesSection";
import { PricingSection } from "@/components/PricingSection";
import { FinalCTASection } from "@/components/FinalCTASection";
import { SEOHead } from "@/components/SEOHead";
import { ArrowRight, Smartphone, DollarSign, Zap, Shield, QrCode, Wifi, Printer, Palette, Type } from "lucide-react";

import logoImage from "@assets/logo_1762915255857.png";

export function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
      <SEOHead
        title="TaptPay – Low Cost EFTPOS & POS System NZ | Digital Point of Sale"
        description="New Zealand's lowest-cost EFTPOS alternative and digital POS system. No hardware, no lock-in contracts. Accept QR code and NFC contactless payments instantly. Perfect POS solution for small business NZ. 100% Kiwi owned."
        keywords="EFTPOS NZ, POS system NZ, digital POS, POS solutions, low cost POS system, point of sale New Zealand, cheap EFTPOS machine, cloud POS NZ, small business POS NZ, contactless payments NZ, mobile POS NZ, QR code payments, NFC payments, EFTPOS alternative, payment terminal NZ"
        ogTitle="TaptPay – NZ's Lowest-Cost EFTPOS & POS System | No Hardware Required"
        ogDescription="Ditch the EFTPOS machine. TaptPay is New Zealand's 100% digital POS system — accept contactless payments via QR code and NFC with no hardware and no lock-in contracts."
        canonicalUrl="https://taptpay.com/"
      />
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#0055FF] px-6">
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto w-full">
          <ImageWithFallback
            src={logoImage}
            alt="TaptPay – New Zealand's low cost EFTPOS and POS system"
            className="h-24 md:h-32 mb-16"
          />

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-light text-white mb-6 leading-tight">
            a <span className="font-semibold">pos</span> system that isn't one
          </h1>
          
          <p className="text-lg md:text-xl text-white/80 mb-4 font-light">
            100% digital point of sale system
          </p>

          <p className="text-sm md:text-base text-[#00E5CC] mb-12 font-medium tracking-wide">
            New Zealand's lowest-cost EFTPOS & POS system — no hardware required
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

      <WhyTaptPaySection onGetStarted={() => setLocation("/login")} />

      <TerminalFeaturesSection />

      <BoardBuilderSection onGetStarted={() => setLocation("/login")} />

      <PricingSection />

      <FinalCTASection onGetStarted={() => setLocation("/login")} />

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
            © 2026 TaptPay. All rights reserved.
          </p>
          <div className="mt-3 flex justify-center space-x-4 text-sm text-gray-500">
            <a href="/terms" className="hover:text-gray-300 transition-colors">Terms of Service</a>
            <span>·</span>
            <a href="/privacy" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function WhyTaptPaySection({ onGetStarted }: { onGetStarted: () => void }) {
  const benefits = [
    {
      icon: DollarSign,
      title: "Lowest-Cost POS System in NZ",
      description: "No monthly fees. No hardware rental. No lock-in contracts. Just a small per-transaction fee — making TaptPay the most affordable EFTPOS alternative in New Zealand.",
    },
    {
      icon: Smartphone,
      title: "No EFTPOS Machine Needed",
      description: "Ditch the bulky EFTPOS terminal. TaptPay is a 100% digital point of sale system that runs on any device you already own — phone, tablet, or laptop.",
    },
    {
      icon: QrCode,
      title: "QR Code & NFC Contactless Payments",
      description: "Your customers pay by scanning a QR code or tapping their phone. Supports Apple Pay, Google Pay, Visa payWave, and Mastercard contactless — all without a card reader.",
    },
    {
      icon: Zap,
      title: "Set Up in Under 5 Minutes",
      description: "Sign up, create your first transaction, and start accepting payments immediately. No waiting for hardware delivery or complex installation — the fastest POS setup in NZ.",
    },
    {
      icon: Shield,
      title: "Secure NZ Payment Processing",
      description: "Payments are processed securely through Windcave, New Zealand's trusted payment gateway. Funds settle directly to your NZ bank account.",
    },
    {
      icon: Wifi,
      title: "Cloud POS Dashboard & Analytics",
      description: "Track every transaction in real time from anywhere. View revenue, manage refunds, export reports for Xero — all from your cloud POS dashboard.",
    },
  ];

  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-light text-center mb-4 text-[#0055FF] lowercase">
          why kiwi businesses choose taptpay
        </h2>
        <p className="text-base md:text-lg text-gray-600 text-center mb-6 max-w-3xl mx-auto">
          The smarter EFTPOS alternative for New Zealand small businesses. A digital POS solution that saves you money and gets you paid faster.
        </p>
        <p className="text-sm text-gray-500 text-center mb-16 max-w-2xl mx-auto">
          Whether you're a café, market stall, food truck, tradie, or service business — TaptPay is the point of sale system built for how NZ businesses work today.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => (
            <div key={index} className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-[#0055FF]/10 rounded-xl flex items-center justify-center mb-5">
                <benefit.icon className="w-6 h-6 text-[#0055FF]" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{benefit.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{benefit.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-14">
          <button
            onClick={onGetStarted}
            className="bg-[#0055FF] hover:bg-[#0044DD] text-white font-medium px-10 py-3.5 rounded-full text-base transition-all transform hover:scale-105 shadow-lg inline-flex items-center gap-2 lowercase"
          >
            start accepting payments today
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-sm text-gray-500 mt-3">No credit card required · Set up in under 5 minutes · 100% Kiwi owned</p>
        </div>
      </div>
    </section>
  );
}

function BoardBuilderSection({ onGetStarted }: { onGetStarted: () => void }) {
  const features = [
    { icon: QrCode,  title: "Your QR, your brand", description: "Choose which Tapt Stone or payment link to display on your board — each stone gets its own unique QR code." },
    { icon: Palette, title: "Custom colours & logo", description: "Match your brand perfectly with a full colour picker and logo upload. Choose from 4 paper layouts: A4 or A6, portrait or landscape." },
    { icon: Type,    title: "Google Fonts & custom fonts", description: "Pick from 10 curated Google Fonts or upload your own .ttf / .otf file to keep your typography on-brand." },
    { icon: Printer, title: "Print-ready PDF", description: "We generate a high-resolution PDF and send it straight to our print team — just approve the preview and hit send." },
  ];
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-[#0055FF] bg-[#0055FF]/10 px-3 py-1 rounded-full mb-4">For merchants</span>
          <h2 className="text-4xl md:text-5xl font-light text-gray-900 mb-4 lowercase">payment board builder</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Design your own printed payment sign in minutes. Live preview, fully customisable, ready to print.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {features.map((f) => (
            <div key={f.title} className="flex gap-4 p-5 rounded-2xl bg-gray-50 border border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-[#0055FF]/10 flex items-center justify-center flex-shrink-0">
                <f.icon className="w-5 h-5 text-[#0055FF]" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <button
            onClick={onGetStarted}
            className="bg-[#0055FF] hover:bg-[#0044DD] text-white font-medium px-10 py-3.5 rounded-full text-base transition-all transform hover:scale-105 shadow-lg inline-flex items-center gap-2 lowercase"
          >
            build your board
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-sm text-gray-400 mt-3">Available to all TaptPay merchants — sign in to get started</p>
        </div>
      </div>
    </section>
  );
}
