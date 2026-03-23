import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import {
  ArrowRight, Volume2, VolumeX, DollarSign, Smartphone, QrCode, Zap,
  Shield, Wifi, Printer, Palette, Type, CheckCircle, ChevronDown,
  UserPlus, Settings, CreditCard, BarChart3, ChevronLeft, ChevronRight
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useScrambleText } from "@/hooks/use-scramble-text";
import logoImage from "@assets/logo_1762915255857.png";
import dashboardMockup from "@assets/dashboard_3d_1774258691269.png";
import paymentMockup from "@assets/payment_page_1774258691269.png";
import terminalMockup from "@assets/terminal_3d_1774258691270.png";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function ScrambleHeading({
  text,
  className,
  tag: Tag = "h2",
}: {
  text: string;
  className?: string;
  tag?: "h1" | "h2" | "h3";
}) {
  const { displayText, scramble } = useScrambleText(text);
  const ref = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired.current) {
          fired.current = true;
          scramble();
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [scramble]);

  return (
    <div ref={ref} onMouseEnter={scramble} className="cursor-default">
      <Tag className={className}>{displayText}</Tag>
    </div>
  );
}

function StickySection({ children, zIndex, peek = true, room = "40vh" }: {
  children: React.ReactNode;
  zIndex: number;
  peek?: boolean;
  room?: string;
}) {
  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex,
      paddingTop: peek ? 12 : 0,
      paddingBottom: room,
    }}>
      {children}
    </div>
  );
}

function MagneticButton({ children, className, onClick, style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const elRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!elRef.current || !textRef.current) return;
    const { left, top, width, height } = elRef.current.getBoundingClientRect();
    const dX = e.clientX - (left + width / 2);
    const dY = e.clientY - (top + height / 2);
    textRef.current.style.transform = `translate(${dX * 0.4}px, ${dY * 0.4}px)`;
  };

  const handleMouseLeave = () => {
    if (textRef.current) textRef.current.style.transform = "translate(0px, 0px)";
  };

  return (
    <button
      ref={elRef}
      className={className}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      {...props}
    >
      <span
        ref={textRef}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "inherit",
          pointerEvents: "none",
          transition: "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        {children}
      </span>
    </button>
  );
}

function MagneticLink({ children, className, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const elRef = useRef<HTMLAnchorElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!elRef.current || !textRef.current) return;
    const { left, top, width, height } = elRef.current.getBoundingClientRect();
    const dX = e.clientX - (left + width / 2);
    const dY = e.clientY - (top + height / 2);
    textRef.current.style.transform = `translate(${dX * 0.4}px, ${dY * 0.4}px)`;
  };

  const handleMouseLeave = () => {
    if (textRef.current) textRef.current.style.transform = "translate(0px, 0px)";
  };

  return (
    <a
      ref={elRef}
      href={href}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <span
        ref={textRef}
        style={{
          display: "inline-block",
          pointerEvents: "none",
          transition: "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        {children}
      </span>
    </a>
  );
}

function Nav({ onGetStarted }: { onGetStarted: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-6 md:px-10 py-4 transition-all duration-300 ${
        scrolled ? "bg-[#000a36]/80 backdrop-blur-md shadow-xl" : ""
      }`}
    >
      <img src={logoImage} alt="TaptPay" className="h-7 md:h-8" />
      <MagneticButton
        onClick={onGetStarted}
        className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-5 py-2 rounded-full text-sm transition-colors"
      >
        get started
      </MagneticButton>
    </nav>
  );
}

function HeroCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="rounded-3xl overflow-hidden bg-[#0055ff] min-h-screen flex flex-col items-center justify-center px-6 text-center relative">
      <div className="flex flex-col items-center max-w-3xl mx-auto">
        <img src={logoImage} alt="TaptPay" className="h-20 md:h-28 mb-14 opacity-95" />
        <ScrambleHeading
          tag="h1"
          text="a pos system that isn't one"
          className="text-4xl md:text-6xl lg:text-7xl font-extralight text-white leading-[1.08] tracking-tight mb-6"
        />
        <p className="text-lg md:text-xl text-white/75 font-light mb-3">
          100% digital point of sale system
        </p>
        <p className="text-sm md:text-base text-[#00f1d7] font-medium tracking-wide mb-12">
          New Zealand's lowest-cost EFTPOS alternative — no hardware required
        </p>
        <MagneticButton
          onClick={onGetStarted}
          className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-10 py-4 rounded-full text-base md:text-lg transition-colors shadow-lg flex items-center gap-2 lowercase"
          data-testid="button-get-started"
        >
          get started <ArrowRight className="w-5 h-5" />
        </MagneticButton>
        <p className="mt-5 text-white/40 text-xs tracking-widest uppercase">
          100% KIWI OWNED AND OPERATED
        </p>
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 animate-bounce">
        <ChevronDown className="w-6 h-6" />
      </div>
    </div>
  );
}

function VideoCard() {
  const isMobile = useIsMobile();
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  const toggleMute = () => setMuted((prev) => !prev);

  return (
    <div className="rounded-3xl overflow-hidden bg-[#000a36] relative">
      <video
        key={isMobile ? "mobile" : "desktop"}
        ref={videoRef}
        className="w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        src={isMobile ? "/videos/mobile.mp4" : "/videos/web.mp4"}
      />
      <button
        onClick={toggleMute}
        className="absolute bottom-5 right-5 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full p-3 transition-all hover:scale-110 z-10"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>
    </div>
  );
}

const FEATURES = [
  {
    icon: Zap,
    title: "Real-Time Dashboard",
    description: "Track active transactions, sales performance, and inventory all in one beautiful interface.",
  },
  {
    icon: BarChart3,
    title: "Visual Analytics",
    description: "Understand your business at a glance with intuitive charts and progress indicators.",
  },
  {
    icon: Smartphone,
    title: "Mobile-First Design",
    description: "Manage your entire business from your phone with our optimized mobile experience.",
  },
  {
    icon: CreditCard,
    title: "NFC Payments",
    description: "Accept contactless payments instantly with secure NFC technology.",
  },
];

function FeaturesCard() {
  return (
    <div className="rounded-3xl overflow-hidden bg-[#050d38] py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto">
        <ScrambleHeading
          text="everything you need. nothing you don't."
          className="text-3xl md:text-5xl lg:text-6xl font-light text-white text-center mb-4 leading-tight"
        />
        <p className="text-center text-white/50 mb-16 text-lg">
          A complete payment solution designed for modern businesses
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="flex justify-center">
            <img
              src={dashboardMockup}
              alt="taptpay active transactions dashboard"
              className="w-64 md:w-80 drop-shadow-2xl hover:scale-105 transition-transform duration-500"
            />
          </div>
          <div className="flex flex-col gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#0055ff]/40 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-5 h-5 text-[#00f1d7]" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const HOW_IT_WORKS_STEPS = [
  {
    number: "1",
    icon: UserPlus,
    iconBg: "#FF6B9D",
    title: "Sign Up & Connect",
    description: "Create your free account and connect your merchant API - no setup fees, ready in minutes.",
  },
  {
    number: "2",
    icon: Settings,
    iconBg: "#FFB800",
    title: "Customize Your Setup",
    description: "Activate payment stones, add products to inventory, and personalize your dashboard to fit your business.",
  },
  {
    number: "3",
    icon: Smartphone,
    iconBg: "#00f1d7",
    title: "Connect & Prepare",
    description: "Use an NFC-capable device, connect to WiFi, and enable notifications for instant updates.",
  },
  {
    number: "4",
    icon: CheckCircle,
    iconBg: "#00FF9D",
    title: "Start Accepting Payments!",
    description: "You're all set! Begin processing payments and managing your business with taptpay.",
  },
];

function HowItWorksCard() {
  return (
    <div className="rounded-3xl overflow-hidden bg-[#0055ff] py-20 px-6 md:px-16">
      <div className="max-w-5xl mx-auto">
        <ScrambleHeading
          text="how it works"
          className="text-4xl md:text-6xl font-extralight text-[#00f1d7] text-center mb-4 tracking-tight"
        />
        <p className="text-center text-white/60 mb-16 text-lg">
          Get started with taptpay in 4 simple steps
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {HOW_IT_WORKS_STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.number} className="bg-white/10 border border-white/15 rounded-2xl p-7 relative hover:bg-white/15 transition-all">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold mb-4"
                  style={{ backgroundColor: s.iconBg }}
                >
                  {s.number}
                </div>
                <Icon className="w-7 h-7 text-white mb-3" />
                <h3 className="text-white text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-white/65 text-sm leading-relaxed">{s.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CustomerExperienceCard() {
  const customerSteps = [
    {
      icon: Smartphone,
      title: "Scan Or Tap the QR or NFC Tag",
      description: "Customers can scan the QR code or tap the NFC tag on your payment stone",
    },
    {
      icon: CreditCard,
      title: "Digital Wallet to Pay",
      description: "Customer is taken to the payment web page and pays with their Apple or Google Pay",
    },
    {
      icon: CheckCircle,
      title: "Done in Seconds",
      description: "Payment processed instantly with confirmation",
    },
  ];

  return (
    <div className="rounded-3xl overflow-hidden bg-[#060e42] py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div>
          <ScrambleHeading
            text="seamless for your customers"
            className="text-3xl md:text-4xl font-light text-white leading-tight mb-3"
          />
          <p className="text-white/55 text-base mb-8">
            Give your customers multiple ways to pay with a beautiful, intuitive interface
          </p>
          <div className="flex flex-col gap-5">
            {customerSteps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#00f1d7] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-[#0055ff]" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm mb-1">{s.title}</h3>
                    <p className="text-white/55 text-sm leading-relaxed">{s.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex justify-center">
          <img
            src={paymentMockup}
            alt="taptpay customer payment page on phone"
            className="w-64 md:w-80 drop-shadow-2xl hover:scale-105 transition-transform duration-500"
          />
        </div>
      </div>
    </div>
  );
}

const TERMINAL_SLIDES = [
  { title: "Quick Payment Entry", description: "Enter amounts with one tap, adjust with custom buttons, and trigger payment stones instantly" },
  { title: "Split Bill", description: "Divide payments evenly among multiple people with automatic calculation" },
  { title: "Share Payment", description: "Send payment links via email, SMS, or QR code for remote payments" },
  { title: "NFC Paywave", description: "Turn your phone into an EFTPOS machine - accept all contactless payment methods directly" },
];

function TerminalFeaturesCard() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCurrent((p) => (p + 1) % TERMINAL_SLIDES.length), 6000);
    return () => clearInterval(id);
  }, []);

  const prev = () => setCurrent((p) => (p - 1 + TERMINAL_SLIDES.length) % TERMINAL_SLIDES.length);
  const next = () => setCurrent((p) => (p + 1) % TERMINAL_SLIDES.length);

  return (
    <div className="rounded-3xl overflow-hidden bg-[#0a1040] py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="flex justify-center order-2 lg:order-1">
          <img
            src={terminalMockup}
            alt="taptpay terminal on phone"
            className="w-64 md:w-80 drop-shadow-2xl hover:scale-105 transition-transform duration-500"
          />
        </div>
        <div className="order-1 lg:order-2">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-[#00f1d7] bg-[#00f1d7]/10 px-3 py-1 rounded-full mb-5">
            Terminal
          </span>
          <ScrambleHeading
            text="the digital terminal"
            className="text-3xl md:text-5xl font-light text-[#00f1d7] leading-tight mb-4"
          />
          <p className="text-white/60 text-lg leading-relaxed mb-10">
            Everything you need to process payments, right from your phone
          </p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
            <div className="mb-4 min-h-[80px]">
              <h3 className="text-white font-semibold text-lg mb-2">{TERMINAL_SLIDES[current].title}</h3>
              <p className="text-white/55 text-sm leading-relaxed">{TERMINAL_SLIDES[current].description}</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {TERMINAL_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`w-2 h-2 rounded-full transition-all ${i === current ? "bg-[#00f1d7] w-4" : "bg-white/30"}`}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={prev} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all" aria-label="Previous">
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button onClick={next} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all" aria-label="Next">
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const BENEFITS = [
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

function WhyTaptPayCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="rounded-3xl overflow-hidden bg-[#050d38] py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto">
        <ScrambleHeading
          text="why kiwi businesses choose taptpay"
          className="text-3xl md:text-5xl font-light text-white text-center mb-4 leading-tight"
        />
        <p className="text-white/50 text-center mb-6 max-w-3xl mx-auto text-lg">
          The smarter EFTPOS alternative for New Zealand small businesses. A digital POS solution that saves you money and gets you paid faster.
        </p>
        <p className="text-white/35 text-center text-sm mb-16 max-w-2xl mx-auto">
          Whether you're a café, market stall, food truck, tradie, or service business — TaptPay is the point of sale system built for how NZ businesses work today.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {BENEFITS.map((b) => (
            <div key={b.title} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-[#00f1d7]/30 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#0055ff]/30 flex items-center justify-center mb-4">
                <b.icon className="w-5 h-5 text-[#00f1d7]" />
              </div>
              <h3 className="text-white font-semibold mb-2 text-base">{b.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-14">
          <MagneticButton
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-10 py-4 rounded-full text-base transition-colors shadow-lg inline-flex items-center gap-2 lowercase"
          >
            start accepting payments today <ArrowRight className="w-5 h-5" />
          </MagneticButton>
          <p className="text-white/30 text-sm mt-3">No credit card required · Set up in under 5 minutes · 100% Kiwi owned</p>
        </div>
      </div>
    </div>
  );
}

const BOARD_FEATURES = [
  { icon: QrCode, title: "Your QR, your brand", description: "Choose which Tapt Stone or payment link to display on your board — each stone gets its own unique QR code." },
  { icon: Palette, title: "Custom colours & logo", description: "Match your brand perfectly with a full colour picker and logo upload. Choose from 4 paper layouts: A4 or A6, portrait or landscape." },
  { icon: Type, title: "Google Fonts & custom fonts", description: "Pick from 10 curated Google Fonts or upload your own .ttf / .otf file to keep your typography on-brand." },
  { icon: Printer, title: "Print-ready PDF", description: "We generate a high-resolution PDF and send it straight to our print team — just approve the preview and hit send." },
];

function BoardBuilderCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="rounded-3xl overflow-hidden bg-[#0055ff] py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-[#000a36] bg-[#00f1d7] px-3 py-1 rounded-full mb-5">
            For merchants
          </span>
          <ScrambleHeading
            text="payment board builder"
            className="text-4xl md:text-6xl font-extralight text-white mb-4 tracking-tight"
          />
          <p className="text-white/65 text-lg max-w-2xl mx-auto">
            Design your own printed payment sign in minutes. Live preview, fully customisable, ready to print.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {BOARD_FEATURES.map((f) => (
            <div key={f.title} className="flex gap-4 p-5 bg-white/10 border border-white/15 rounded-2xl hover:bg-white/15 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#00f1d7]/20 flex items-center justify-center flex-shrink-0">
                <f.icon className="w-5 h-5 text-[#00f1d7]" />
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1 text-sm">{f.title}</h3>
                <p className="text-white/55 text-sm leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <MagneticButton
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-10 py-4 rounded-full text-base transition-colors shadow-lg inline-flex items-center gap-2 lowercase"
          >
            design your board <ArrowRight className="w-5 h-5" />
          </MagneticButton>
          <p className="text-white/40 text-sm mt-3">Available to all TaptPay merchants — sign in to get started</p>
        </div>
      </div>
    </div>
  );
}

const PRICING_PLANS = [
  {
    name: "SME",
    subtitle: "1000 transactions and below per month",
    price: "No monthly system fee",
    perTx: "$0.10 per transaction",
    features: [
      "2 login's per business",
      "2 payment stones ($29.99 normally)",
      "$89.99 for set up kit - 2 design requests. (kit includes x2 payment stones, 2 other info signage, magnetic mount)",
    ],
  },
  {
    name: "Enterprise",
    subtitle: "1000+ transactions and above per month",
    price: "$19.99",
    perTx: "per month system fee",
    features: [
      "10 login's per business",
      "5-10 payment stones ($29.99 normally)",
      "$129.99 for set up kit - 5 design requests. (kit includes x5 payment stones, 3 other info signage, x2 magnetic mount)",
    ],
  },
];

function PricingCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="rounded-3xl overflow-hidden bg-[#060e42] py-20 px-6 md:px-16">
      <div className="max-w-5xl mx-auto">
        <ScrambleHeading
          text="what does it cost?"
          className="text-4xl md:text-6xl font-extralight text-[#00f1d7] text-center mb-4 tracking-tight"
        />
        <p className="text-white/50 text-center mb-16 max-w-2xl mx-auto text-lg">
          you will be charged $0.10 per transaction by adding a credit card/debit card to the system and you will be charged either weekly/bi-weekly/monthly
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PRICING_PLANS.map((plan) => (
            <div key={plan.name} className="bg-[#0055ff] border-2 border-[#00f1d7]/40 rounded-2xl p-8 flex flex-col">
              <h3 className="text-[#00f1d7] text-2xl font-bold mb-1">{plan.name}</h3>
              <p className="text-white/50 text-sm mb-5">{plan.subtitle}</p>
              <div className="border-b border-white/10 pb-5 mb-5">
                <div className="text-white text-2xl font-light">{plan.price}</div>
                <div className="text-[#00f1d7] text-sm mt-1">{plan.perTx}</div>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-white/80 text-sm">
                    <CheckCircle className="w-4 h-4 text-[#00f1d7] flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <MagneticButton
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-10 py-4 rounded-full text-base transition-colors shadow-lg inline-flex items-center gap-2 lowercase"
          >
            get started for free <ArrowRight className="w-5 h-5" />
          </MagneticButton>
        </div>
      </div>
    </div>
  );
}

function FinalCTACard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="rounded-3xl overflow-hidden bg-[#0055ff] py-24 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <ScrambleHeading
          text="ready to ditch the EFTPOS machine?"
          className="text-3xl md:text-5xl lg:text-6xl font-light text-white leading-tight mb-6"
        />
        <p className="text-white/65 text-lg mb-10">
          Join hundreds of Kiwi businesses accepting payments the smart way. Set up in minutes, pay only when you get paid.
        </p>
        <MagneticButton
          onClick={onGetStarted}
          className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-12 py-4 rounded-full text-lg transition-colors shadow-xl inline-flex items-center gap-2 lowercase"
        >
          start free today <ArrowRight className="w-6 h-6" />
        </MagneticButton>
        <p className="text-white/35 text-sm mt-4">No credit card required · No lock-in contracts · 100% Kiwi owned</p>
      </div>
    </div>
  );
}

function FooterCard() {
  return (
    <div className="rounded-3xl overflow-hidden bg-[#060e38] py-12 px-6">
      <div className="max-w-6xl mx-auto text-center">
        <img src={logoImage} alt="TaptPay" className="h-8 mx-auto mb-5 opacity-70" />
        <p className="text-white/30 text-sm">© 2026 TaptPay. All rights reserved.</p>
        <div className="mt-3 flex justify-center gap-4 text-sm text-white/25">
          <MagneticLink href="/terms" className="hover:text-white/60 transition-colors">Terms of Service</MagneticLink>
          <span>·</span>
          <MagneticLink href="/privacy" className="hover:text-white/60 transition-colors">Privacy Policy</MagneticLink>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [, setLocation] = useLocation();
  const goLogin = () => setLocation("/login");
  const goBoard = () => setLocation("/board-builder");

  return (
    <div className="min-h-screen" style={{ background: "#000a36", fontFamily: "Outfit, sans-serif" }}>
      <SEOHead
        title="TaptPay – Low Cost EFTPOS & POS System NZ | Digital Point of Sale"
        description="New Zealand's lowest-cost EFTPOS alternative and digital POS system. No hardware, no lock-in contracts. Accept QR code and NFC contactless payments instantly. Perfect POS solution for small business NZ. 100% Kiwi owned."
        keywords="EFTPOS NZ, POS system NZ, digital POS, POS solutions, low cost POS system, point of sale New Zealand, cheap EFTPOS machine, cloud POS NZ, small business POS NZ, contactless payments NZ, mobile POS NZ, QR code payments, NFC payments, EFTPOS alternative, payment terminal NZ"
        ogTitle="TaptPay – NZ's Lowest-Cost EFTPOS & POS System | No Hardware Required"
        ogDescription="Ditch the EFTPOS machine. TaptPay is New Zealand's 100% digital POS system — accept contactless payments via QR code and NFC with no hardware and no lock-in contracts."
        canonicalUrl="https://taptpay.com/"
      />

      <Nav onGetStarted={goLogin} />

      <div className="px-3 md:px-4 pb-3 md:pb-4">
        <StickySection zIndex={10} peek={false} room="60vh">
          <HeroCard onGetStarted={goLogin} />
        </StickySection>

        <StickySection zIndex={20}>
          <VideoCard />
        </StickySection>

        <StickySection zIndex={30}>
          <FeaturesCard />
        </StickySection>

        <StickySection zIndex={40}>
          <HowItWorksCard />
        </StickySection>

        <StickySection zIndex={50}>
          <CustomerExperienceCard />
        </StickySection>

        <StickySection zIndex={60}>
          <TerminalFeaturesCard />
        </StickySection>

        <StickySection zIndex={70}>
          <WhyTaptPayCard onGetStarted={goLogin} />
        </StickySection>

        <StickySection zIndex={80}>
          <BoardBuilderCard onGetStarted={goBoard} />
        </StickySection>

        <StickySection zIndex={90}>
          <PricingCard onGetStarted={goLogin} />
        </StickySection>

        <StickySection zIndex={100}>
          <FinalCTACard onGetStarted={goLogin} />
        </StickySection>

        <StickySection zIndex={110} room="0">
          <FooterCard />
        </StickySection>
      </div>
    </div>
  );
}
