import { useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowRight, Volume2, VolumeX, DollarSign, Smartphone, QrCode, Zap,
  Shield, Wifi, Printer, Palette, Type, CheckCircle, ChevronDown
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import logoImage from "@assets/logo_1762915255857.png";
import dashboardMockup from "@assets/dashboard_3d_1774258691269.png";
import paymentMockup from "@assets/payment_page_1774258691269.png";
import terminalMockup from "@assets/terminal_3d_1774258691270.png";

/* ─────────────────────────────────────────────
   Scramble-text hook
───────────────────────────────────────────── */
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&";

function useScrambleText(text: string) {
  const [displayText, setDisplayText] = useState(text);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scramble = useCallback(() => {
    if (frameRef.current) clearInterval(frameRef.current);
    let iteration = 0;
    frameRef.current = setInterval(() => {
      setDisplayText(
        text
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < iteration) return text[i];
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join("")
      );
      iteration += 0.4;
      if (iteration > text.length) {
        if (frameRef.current) clearInterval(frameRef.current);
        setDisplayText(text);
      }
    }, 35);
  }, [text]);

  useEffect(() => () => { if (frameRef.current) clearInterval(frameRef.current); }, []);

  return { displayText, scramble };
}

/* ─────────────────────────────────────────────
   ScrambleHeading — fires on hover (desktop)
   and on first scroll-into-view (mobile)
───────────────────────────────────────────── */
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
      { threshold: 0.6 }
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

/* ─────────────────────────────────────────────
   Card wrapper — rounded box on dark page bg
───────────────────────────────────────────── */
function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-3xl overflow-hidden w-full ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Nav
───────────────────────────────────────────── */
function Nav({ onGetStarted }: { onGetStarted: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 transition-all duration-300 ${
        scrolled ? "bg-[#000a36]/80 backdrop-blur-md shadow-xl" : ""
      }`}
    >
      <img src={logoImage} alt="TaptPay" className="h-7 md:h-8" />
      <button
        onClick={onGetStarted}
        className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-5 py-2 rounded-full text-sm transition-all hover:scale-105"
      >
        get started
      </button>
    </nav>
  );
}

/* ─────────────────────────────────────────────
   Hero Card
───────────────────────────────────────────── */
function HeroCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <Card className="bg-[#0055ff] min-h-screen flex flex-col items-center justify-center px-6 text-center relative">
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

        <button
          onClick={onGetStarted}
          className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-10 py-4 rounded-full text-base md:text-lg transition-all hover:scale-105 shadow-lg flex items-center gap-2 lowercase"
          data-testid="button-get-started"
        >
          get started <ArrowRight className="w-5 h-5" />
        </button>

        <p className="mt-5 text-white/40 text-xs tracking-widest uppercase">
          100% KIWI OWNED AND OPERATED
        </p>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 animate-bounce">
        <ChevronDown className="w-6 h-6" />
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Video Card
───────────────────────────────────────────── */
function VideoCard() {
  const [muted, setMuted] = useState(true);
  const desktopRef = useRef<HTMLVideoElement>(null);
  const mobileRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    const next = !muted;
    if (desktopRef.current) desktopRef.current.muted = next;
    if (mobileRef.current) mobileRef.current.muted = next;
    setMuted(next);
  };

  return (
    <Card className="bg-[#000a36] relative overflow-hidden">
      <div className="relative w-full">
        <video
          ref={desktopRef}
          className="w-full hidden md:block"
          autoPlay loop muted playsInline
          src="/videos/web.mp4"
          style={{ display: undefined }}
        />
        <video
          ref={mobileRef}
          className="w-full block md:hidden"
          autoPlay loop muted playsInline
          src="/videos/mobile.mp4"
        />
        <button
          onClick={toggleMute}
          className="absolute bottom-5 right-5 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full p-3 transition-all hover:scale-110 z-10"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Features Card
───────────────────────────────────────────── */
const FEATURES = [
  {
    icon: Smartphone,
    title: "No EFTPOS machine needed",
    description: "Run entirely on any device you already own — phone, tablet or laptop.",
  },
  {
    icon: QrCode,
    title: "QR & NFC contactless",
    description: "Apple Pay, Google Pay, Visa payWave, Mastercard contactless — no card reader.",
  },
  {
    icon: Zap,
    title: "Set up in under 5 minutes",
    description: "Sign up, create your first transaction, and start accepting payments immediately.",
  },
  {
    icon: Wifi,
    title: "Cloud dashboard & analytics",
    description: "Track every transaction in real time from anywhere, export to Xero.",
  },
];

function FeaturesCard() {
  return (
    <Card className="bg-white py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto">
        <ScrambleHeading
          text="everything you need. nothing you don't."
          className="text-3xl md:text-5xl lg:text-6xl font-light text-[#000a36] text-center mb-4 leading-tight"
        />
        <p className="text-center text-gray-500 mb-16 text-lg">
          A complete payment solution designed for modern businesses
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="flex justify-center">
            <img
              src={dashboardMockup}
              alt="TaptPay dashboard on phone"
              className="w-64 md:w-80 drop-shadow-2xl hover:scale-105 transition-transform duration-500"
            />
          </div>
          <div className="flex flex-col gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#0055ff]/10 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-5 h-5 text-[#0055ff]" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   How It Works Card
───────────────────────────────────────────── */
const STEPS = [
  { num: "01", title: "Sign up", desc: "Create your free TaptPay account in under 2 minutes. No credit card required." },
  { num: "02", title: "Set your amount", desc: "Enter a dollar amount on your terminal — by item or total sale." },
  { num: "03", title: "Share the link", desc: "Display your QR code or send a payment link — works anywhere, anytime." },
  { num: "04", title: "Get paid", desc: "Your customer pays by phone. Funds settle to your NZ bank account." },
];

function HowItWorksCard() {
  return (
    <Card className="bg-[#0055ff] py-20 px-6 md:px-16">
      <div className="max-w-5xl mx-auto">
        <ScrambleHeading
          text="how it works"
          className="text-4xl md:text-6xl font-extralight text-[#00f1d7] text-center mb-4 tracking-tight"
        />
        <p className="text-center text-white/60 mb-16 text-lg">
          Get started with TaptPay in 4 simple steps
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {STEPS.map((s) => (
            <div
              key={s.num}
              className="bg-white/10 border border-white/15 rounded-2xl p-7 hover:bg-white/15 transition-all"
            >
              <div className="text-[#00f1d7] text-4xl font-bold mb-3 opacity-80">{s.num}</div>
              <h3 className="text-white text-xl font-semibold mb-2">{s.title}</h3>
              <p className="text-white/65 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Customer Experience Card
───────────────────────────────────────────── */
function CustomerExperienceCard() {
  return (
    <Card className="bg-[#050d38] py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div>
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-[#00f1d7] bg-[#00f1d7]/10 px-3 py-1 rounded-full mb-5">
            For customers
          </span>
          <ScrambleHeading
            text="frictionless for your customers"
            className="text-3xl md:text-5xl font-light text-white leading-tight mb-6"
          />
          <p className="text-white/60 text-lg leading-relaxed mb-8">
            No app downloads, no sign-ups. Your customer opens their camera, scans the QR code, and pays — it's that simple.
          </p>
          <ul className="flex flex-col gap-3">
            {["Apple Pay & Google Pay", "Visa & Mastercard contactless", "Works on any smartphone", "Instant payment confirmation"].map((item) => (
              <li key={item} className="flex items-center gap-3 text-white/80 text-sm">
                <CheckCircle className="w-4 h-4 text-[#00f1d7] flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center">
          <img
            src={paymentMockup}
            alt="Customer payment screen on phone"
            className="w-64 md:w-80 drop-shadow-2xl hover:scale-105 transition-transform duration-500"
          />
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Terminal Features Card
───────────────────────────────────────────── */
const TERMINAL_FEATURES = [
  { icon: Zap, title: "Instant transactions", desc: "Create a sale in seconds — enter amount, charge, done." },
  { icon: Shield, title: "Split bill", desc: "Divide any sale between multiple customers with one tap." },
  { icon: QrCode, title: "Payment stones", desc: "Assign QR codes to specific products or services." },
  { icon: Wifi, title: "Works offline", desc: "Create transactions even with a spotty connection." },
];

function TerminalFeaturesCard() {
  return (
    <Card className="bg-white py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="flex justify-center order-2 lg:order-1">
          <img
            src={terminalMockup}
            alt="TaptPay terminal on phone"
            className="w-64 md:w-80 drop-shadow-2xl hover:scale-105 transition-transform duration-500"
          />
        </div>
        <div className="order-1 lg:order-2">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-[#0055ff] bg-[#0055ff]/10 px-3 py-1 rounded-full mb-5">
            Terminal
          </span>
          <ScrambleHeading
            text="a terminal that lives in your pocket"
            className="text-3xl md:text-5xl font-light text-[#000a36] leading-tight mb-6"
          />
          <p className="text-gray-500 text-lg leading-relaxed mb-8">
            The TaptPay terminal turns any device into a powerful point of sale — with features tradies, cafés, and market sellers love.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TERMINAL_FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#0055ff]/10 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-4 h-4 text-[#0055ff]" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm">{f.title}</h4>
                  <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Why TaptPay Card
───────────────────────────────────────────── */
const BENEFITS = [
  { icon: DollarSign, title: "Lowest-cost POS in NZ", desc: "No monthly fees. No hardware rental. No lock-in contracts." },
  { icon: Smartphone, title: "No EFTPOS machine", desc: "Ditch the bulky terminal — run on your existing device." },
  { icon: QrCode, title: "QR & NFC payments", desc: "Apple Pay, Google Pay, payWave — all without a card reader." },
  { icon: Zap, title: "Set up in under 5 min", desc: "Sign up and start accepting payments immediately." },
  { icon: Shield, title: "Secure NZ processing", desc: "Processed via Windcave — NZ's trusted payment gateway." },
  { icon: Wifi, title: "Cloud POS dashboard", desc: "Track revenue, manage refunds, export to Xero in real time." },
];

function WhyTaptPayCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <Card className="bg-[#0a1040] py-20 px-6 md:px-16">
      <div className="max-w-6xl mx-auto">
        <ScrambleHeading
          text="why kiwi businesses choose taptpay"
          className="text-3xl md:text-5xl font-light text-white text-center mb-4 leading-tight"
        />
        <p className="text-white/50 text-center mb-16 max-w-2xl mx-auto text-lg">
          Whether you're a café, market stall, food truck, tradie, or service business — TaptPay is the POS system built for how NZ businesses work today.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-[#00f1d7]/30 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0055ff]/30 flex items-center justify-center mb-4">
                <b.icon className="w-5 h-5 text-[#00f1d7]" />
              </div>
              <h3 className="text-white font-semibold mb-2 text-base">{b.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-14">
          <button
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-10 py-4 rounded-full text-base transition-all hover:scale-105 shadow-lg inline-flex items-center gap-2 lowercase"
          >
            start accepting payments today <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-white/30 text-sm mt-3">No credit card required · Set up in under 5 minutes · 100% Kiwi owned</p>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Board Builder Card
───────────────────────────────────────────── */
const BOARD_FEATURES = [
  { icon: QrCode, title: "Your QR, your brand", desc: "Display any payment link on your board — each stone gets its own unique QR code." },
  { icon: Palette, title: "Custom colours & logo", desc: "Match your brand perfectly with a full colour picker and logo upload." },
  { icon: Type, title: "Google Fonts & custom fonts", desc: "Pick from curated Google Fonts or upload your own .ttf / .otf file." },
  { icon: Printer, title: "Print-ready PDF", desc: "High-resolution PDF sent to our print team — just approve and hit send." },
];

function BoardBuilderCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <Card className="bg-[#0055ff] py-20 px-6 md:px-16">
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
                <p className="text-white/55 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-10 py-4 rounded-full text-base transition-all hover:scale-105 shadow-lg inline-flex items-center gap-2 lowercase"
          >
            design your board <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-white/40 text-sm mt-3">Available to all TaptPay merchants — sign in to get started</p>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Pricing Card
───────────────────────────────────────────── */
function PricingCard({ onGetStarted }: { onGetStarted: () => void }) {
  const plans = [
    {
      name: "SME",
      subtitle: "1,000 transactions and below per month",
      price: "No monthly system fee",
      perTx: "$0.10 per transaction",
      features: [
        "2 logins per business",
        "2 payment stones ($29.99 normally)",
        "$89.99 set-up kit — 2 design requests (×2 payment stones, 2 signage, magnetic mount)",
      ],
    },
    {
      name: "Enterprise",
      subtitle: "Over 1,000 transactions per month",
      price: "Custom pricing",
      perTx: "Volume discount applies",
      features: [
        "Unlimited logins",
        "Unlimited payment stones",
        "Dedicated account manager",
        "Custom integrations & reporting",
      ],
    },
  ];

  return (
    <Card className="bg-[#000a36] py-20 px-6 md:px-16 border border-white/5">
      <div className="max-w-5xl mx-auto">
        <ScrambleHeading
          text="what does it cost?"
          className="text-4xl md:text-6xl font-extralight text-[#00f1d7] text-center mb-4 tracking-tight"
        />
        <p className="text-white/50 text-center mb-16 max-w-2xl mx-auto text-lg">
          $0.10 per transaction. No monthly fees. No setup costs. Just pay as you go.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="bg-[#0055ff] border-2 border-[#00f1d7]/40 rounded-2xl p-8 flex flex-col"
            >
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
          <button
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-10 py-4 rounded-full text-base transition-all hover:scale-105 shadow-lg inline-flex items-center gap-2 lowercase"
          >
            get started for free <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Final CTA Card
───────────────────────────────────────────── */
function FinalCTACard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <Card className="bg-[#0055ff] py-24 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <ScrambleHeading
          text="ready to ditch the EFTPOS machine?"
          className="text-3xl md:text-5xl lg:text-6xl font-light text-white leading-tight mb-6"
        />
        <p className="text-white/65 text-lg mb-10">
          Join hundreds of Kiwi businesses accepting payments the smart way. Set up in minutes, pay only when you get paid.
        </p>
        <button
          onClick={onGetStarted}
          className="bg-[#00f1d7] hover:bg-[#00d9c0] text-[#000a36] font-semibold px-12 py-4 rounded-full text-lg transition-all hover:scale-105 shadow-xl inline-flex items-center gap-2 lowercase"
        >
          start free today <ArrowRight className="w-6 h-6" />
        </button>
        <p className="text-white/35 text-sm mt-4">No credit card required · No lock-in contracts · 100% Kiwi owned</p>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Footer Card
───────────────────────────────────────────── */
function FooterCard() {
  return (
    <Card className="bg-[#060e38] py-12 px-6">
      <div className="max-w-6xl mx-auto text-center">
        <img src={logoImage} alt="TaptPay" className="h-8 mx-auto mb-5 opacity-70" />
        <p className="text-white/30 text-sm">© 2026 TaptPay. All rights reserved.</p>
        <div className="mt-3 flex justify-center gap-4 text-sm text-white/25">
          <a href="/terms" className="hover:text-white/60 transition-colors">Terms of Service</a>
          <span>·</span>
          <a href="/privacy" className="hover:text-white/60 transition-colors">Privacy Policy</a>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Landing Page — main export
───────────────────────────────────────────── */
export function LandingPage() {
  const [, setLocation] = useLocation();
  const goLogin = () => setLocation("/login");
  const goBoard = () => setLocation("/board-builder");

  return (
    <div
      className="min-h-screen"
      style={{ background: "#000a36", fontFamily: "Outfit, sans-serif" }}
    >
      <SEOHead
        title="TaptPay – Low Cost EFTPOS & POS System NZ | Digital Point of Sale"
        description="New Zealand's lowest-cost EFTPOS alternative and digital POS system. No hardware, no lock-in contracts. Accept QR code and NFC contactless payments instantly. 100% Kiwi owned."
        keywords="EFTPOS NZ, POS system NZ, digital POS, low cost POS system, point of sale New Zealand, cheap EFTPOS machine, cloud POS NZ, small business POS NZ, contactless payments NZ, mobile POS NZ, QR code payments, NFC payments"
        ogTitle="TaptPay – NZ's Lowest-Cost EFTPOS & POS System | No Hardware Required"
        ogDescription="Ditch the EFTPOS machine. TaptPay is New Zealand's 100% digital POS system — accept contactless payments via QR code and NFC with no hardware and no lock-in contracts."
        canonicalUrl="https://taptpay.com/"
      />

      <Nav onGetStarted={goLogin} />

      {/* Stacked cards layout — gap between each shows #000a36 bg */}
      <div className="flex flex-col gap-3 md:gap-4 p-3 md:p-4 pt-0">
        {/* Hero — full screen, flush top (nav is fixed over it) */}
        <div className="pt-0">
          <HeroCard onGetStarted={goLogin} />
        </div>

        <VideoCard />
        <FeaturesCard />
        <HowItWorksCard />
        <CustomerExperienceCard />
        <TerminalFeaturesCard />
        <WhyTaptPayCard onGetStarted={goLogin} />
        <BoardBuilderCard onGetStarted={goBoard} />
        <PricingCard onGetStarted={goLogin} />
        <FinalCTACard onGetStarted={goLogin} />
        <FooterCard />
      </div>
    </div>
  );
}
