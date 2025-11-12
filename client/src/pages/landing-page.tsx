import { useLocation } from "wouter";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { HowItWorksSection } from "@/components/HowItWorksSection";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Check } from "lucide-react";

import logoImage from "@assets/logo_1762915255857.png";
import dashboardImage from "@assets/d_1762915045324.png";
import customerPhoneImage from "@assets/pay_1762915045325.png";
import paymentStonesImage from "@assets/pay stone_1762915255862.png";
import terminalReadyImage from "@assets/t_1762915045327.png";
import terminalSplitBillImage from "@assets/sp_1762915045326.png";
import terminalShareImage from "@assets/share_1762915045326.png";
import terminalNfcImage from "@assets/1a013ffb-caa2-4aaf-afd5-e618144eec2a_1762915475067.png";

export function LandingPage() {
  const [, setLocation] = useLocation();

  const carouselSlides = [
    {
      image: terminalReadyImage,
      title: "Ready for Payment",
      description: "Enter amount and generate QR code instantly",
    },
    {
      image: terminalSplitBillImage,
      title: "Split the Bill",
      description: "Easily divide payments among multiple customers",
    },
    {
      image: terminalShareImage,
      title: "Share Payment Link",
      description: "Send payment requests via QR or URL",
    },
    {
      image: terminalNfcImage,
      title: "Tap to Pay",
      description: "Accept contactless NFC payments",
    },
  ];

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0055FF]">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full border-2 border-white animate-pulse" />
          <div className="absolute bottom-40 right-32 w-96 h-96 rounded-full border-2 border-white animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full border-2 border-white animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="mb-12">
            <ImageWithFallback
              src={logoImage}
              alt="TaptPay Logo"
              className="h-16 mx-auto mb-8"
            />
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
            Accept Payments<br />Anywhere, Anytime
          </h1>
          
          <p className="text-xl md:text-2xl text-white/90 mb-12 max-w-3xl mx-auto">
            The modern payment terminal for businesses of all sizes. Get paid instantly with QR codes, NFC, and digital wallets.
          </p>

          <button
            onClick={() => setLocation("/login")}
            className="bg-[#00E5CC] hover:bg-[#00d4bc] text-[#0055FF] font-semibold px-12 py-4 rounded-full text-lg transition-all transform hover:scale-105 shadow-lg"
            data-testid="button-get-started"
          >
            Get Started
          </button>
        </div>
      </section>

      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 text-gray-900">
            Everything You Need to Get Paid
          </h2>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <ImageWithFallback
                src={dashboardImage}
                alt="TaptPay Dashboard"
                className="rounded-2xl shadow-2xl w-full"
              />
            </div>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#0055FF] flex items-center justify-center flex-shrink-0 mt-1">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Real-time Transaction Tracking</h3>
                  <p className="text-gray-600">Monitor all payments as they happen with live updates and detailed analytics.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#0055FF] flex items-center justify-center flex-shrink-0 mt-1">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Multiple Payment Methods</h3>
                  <p className="text-gray-600">Accept QR codes, NFC tap, Apple Pay, Google Pay, and more.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#0055FF] flex items-center justify-center flex-shrink-0 mt-1">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Split Bill Feature</h3>
                  <p className="text-gray-600">Let customers easily divide payments among multiple people.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#0055FF] flex items-center justify-center flex-shrink-0 mt-1">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Secure & Compliant</h3>
                  <p className="text-gray-600">Bank-level encryption and PCI DSS compliance keep your money safe.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 text-gray-900">
            How It Works
          </h2>
          <p className="text-xl text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            Get up and running in three simple steps
          </p>

          <HowItWorksSection />
        </div>
      </section>

      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 text-gray-900">
            Seamless Customer Experience
          </h2>
          <p className="text-xl text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            Your customers will love how easy it is to pay
          </p>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <ImageWithFallback
                src={paymentStonesImage}
                alt="Payment Stones"
                className="rounded-2xl shadow-2xl w-full"
              />
            </div>

            <div>
              <ImageWithFallback
                src={customerPhoneImage}
                alt="Customer Payment Interface"
                className="rounded-2xl shadow-2xl w-full"
              />
            </div>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#0055FF] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">Scan QR Code</h3>
              <p className="text-gray-600">Customer scans the QR code with their phone camera</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#0055FF] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Choose Payment Method</h3>
              <p className="text-gray-600">Select from Apple Pay, Google Pay, or card payment</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#0055FF] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Instant Confirmation</h3>
              <p className="text-gray-600">Both merchant and customer get real-time payment confirmation</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 text-gray-900">
            Powerful Terminal Features
          </h2>
          <p className="text-xl text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            Built for modern businesses with advanced capabilities
          </p>

          <div className="relative max-w-4xl mx-auto">
            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              className="w-full"
            >
              <CarouselContent>
                {carouselSlides.map((slide, index) => (
                  <CarouselItem key={index}>
                    <div className="p-4">
                      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                        <ImageWithFallback
                          src={slide.image}
                          alt={slide.title}
                          className="w-full h-96 object-contain bg-gray-50"
                        />
                        <div className="p-8 text-center">
                          <h3 className="text-2xl font-bold mb-3 text-gray-900">{slide.title}</h3>
                          <p className="text-gray-600 text-lg">{slide.description}</p>
                        </div>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-4" />
              <CarouselNext className="right-4" />
            </Carousel>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 text-gray-900">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-600 text-center mb-16">
            Pay only for what you use, no hidden fees
          </p>

          <div className="bg-gradient-to-br from-[#0055FF] to-[#0044CC] rounded-3xl p-12 text-white shadow-2xl">
            <div className="text-center mb-8">
              <div className="text-6xl font-bold mb-4">$0.50</div>
              <div className="text-2xl opacity-90">per transaction</div>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex items-center gap-3">
                <Check className="w-6 h-6 flex-shrink-0" />
                <span className="text-lg">No monthly fees</span>
              </div>
              <div className="flex items-center gap-3">
                <Check className="w-6 h-6 flex-shrink-0" />
                <span className="text-lg">No setup costs</span>
              </div>
              <div className="flex items-center gap-3">
                <Check className="w-6 h-6 flex-shrink-0" />
                <span className="text-lg">Unlimited payment stones</span>
              </div>
              <div className="flex items-center gap-3">
                <Check className="w-6 h-6 flex-shrink-0" />
                <span className="text-lg">24/7 support</span>
              </div>
            </div>

            <div className="text-center mt-10">
              <button
                onClick={() => setLocation("/login")}
                className="bg-[#00E5CC] hover:bg-[#00d4bc] text-[#0055FF] font-semibold px-12 py-4 rounded-full text-lg transition-all transform hover:scale-105"
                data-testid="button-pricing-get-started"
              >
                Get Started Now
              </button>
            </div>
          </div>
        </div>
      </section>

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
