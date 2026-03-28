import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import { ArrowRight, CheckCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useScrambleText } from "@/hooks/use-scramble-text";
import logoImage from "@assets/logo_1762915255857.png";
import dashboardMockup from "@assets/dashboard_3d_1774258691269.png";
import paymentMockup from "@assets/payment_page_1774258691269.png";
import paymentBoardMockup from "@assets/payment_board_3d_v2_1774674925840.png";
import paymentPageMockup from "@assets/payment_page_1774675283693.png";
import terminalMockup from "@assets/terminal_3d_1774258691270.png";
import welcomeVideo from "@assets/welcome_to_tapt_-_web_1774671768422.mp4";

function MagneticButton({ children, className, onClick, style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const elRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!elRef.current || !textRef.current) return;
    const { left, top, width, height } = elRef.current.getBoundingClientRect();
    textRef.current.style.transform = `translate(${(e.clientX - (left + width / 2)) * 0.4}px, ${(e.clientY - (top + height / 2)) * 0.4}px)`;
  };
  const handleMouseLeave = () => { if (textRef.current) textRef.current.style.transform = "translate(0px, 0px)"; };
  return (
    <button ref={elRef} className={className} onClick={onClick} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={style} {...props}>
      <span ref={textRef} style={{ display: "inline-flex", alignItems: "center", gap: "inherit", pointerEvents: "none", transition: "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)" }}>
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
    textRef.current.style.transform = `translate(${(e.clientX - (left + width / 2)) * 0.4}px, ${(e.clientY - (top + height / 2)) * 0.4}px)`;
  };
  const handleMouseLeave = () => { if (textRef.current) textRef.current.style.transform = "translate(0px, 0px)"; };
  return (
    <a ref={elRef} href={href} className={className} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} {...props}>
      <span ref={textRef} style={{ display: "inline-block", pointerEvents: "none", transition: "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)" }}>
        {children}
      </span>
    </a>
  );
}

function ScrambleHeading({ text, className, tag: Tag = "h2" }: { text: string; className?: string; tag?: "h1" | "h2" | "h3" }) {
  const { displayText, scramble } = useScrambleText(text);
  const ref = useRef<HTMLDivElement>(null);
  const fired = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && !fired.current) { fired.current = true; scramble(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [scramble]);
  return <div ref={ref} className="cursor-default"><Tag className={className}>{displayText}</Tag></div>;
}

function StickyCard({ children, index, backgroundColor = "#ffffff", isDouble = false }: {
  children: React.ReactNode;
  index: number;
  backgroundColor?: string;
  isDouble?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1, 0.7]);

  return (
    <div ref={ref} className="sticky top-0 h-screen flex items-center justify-center px-3 md:px-4" style={{ paddingTop: `${index * 30}px` }}>
      <motion.div
        style={{ scale, opacity, backgroundColor }}
        className={`w-full max-w-7xl rounded-3xl shadow-2xl overflow-hidden ${isDouble ? "h-[95vh]" : "h-[90vh]"}`}
      >
        {children}
      </motion.div>
    </div>
  );
}

function FixedNav({ onGetStarted }: { onGetStarted: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav className="fixed top-0 left-0 right-0 z-[200] flex justify-center pt-5 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`pointer-events-auto bg-[#000a36] rounded-full px-6 py-3 flex gap-6 md:gap-8 items-center transition-all duration-300 ${scrolled ? "shadow-2xl" : "shadow-lg"}`}
      >
        <button onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })} className="text-white hover:text-[#00f1d7] transition-colors text-xs md:text-sm uppercase tracking-wider">services</button>
        <button onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })} className="text-white hover:text-[#00f1d7] transition-colors text-xs md:text-sm uppercase tracking-wider">about</button>
        <button onClick={onGetStarted} className="text-white hover:text-[#00f1d7] transition-colors text-xs md:text-sm uppercase tracking-wider">login</button>
        <MagneticButton onClick={onGetStarted} className="bg-[#00f1d7] text-[#000a36] font-semibold px-4 py-1.5 rounded-full text-xs md:text-sm uppercase tracking-wider hover:bg-white transition-colors">
          get started
        </MagneticButton>
      </motion.div>
    </nav>
  );
}

function HeroSection({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="w-full bg-[#0055ff] rounded-3xl overflow-hidden">
      {/* Top half — centred hero */}
      <div className="flex flex-col items-center justify-center text-center px-6 space-y-6 pt-20" style={{ minHeight: "80vh" }}>
        <motion.img
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          src={logoImage}
          alt="TaptPay"
          className="w-56 md:w-80 lg:w-[420px] h-auto"
        />
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg md:text-2xl lg:text-3xl text-white font-light tracking-[0.2em] uppercase"
        >
          100% digital pos &amp; eftpos solution
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col items-center gap-3"
        >
          <MagneticButton
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold px-8 py-3 rounded-full text-sm md:text-base uppercase tracking-wider transition-colors shadow-lg flex items-center gap-2"
            data-testid="button-get-started"
          >
            get started <ArrowRight className="w-4 h-4" />
          </MagneticButton>
          <p className="text-white/40 text-xs tracking-widest uppercase">100% kiwi owned and operated</p>
        </motion.div>
      </div>

      {/* Bottom half — text left, video right */}
      <div className="flex flex-col lg:flex-row" style={{ minHeight: "35vh" }}>
        {/* Left — each element has its own whileInView so reverse-on-scroll-up works */}
        <div className="flex-1 flex flex-col justify-end px-10 md:px-16 lg:px-20 pt-6 pb-10 gap-7">
          <motion.h2
            initial={{ opacity: 0, y: -20, filter: "blur(12px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: false, amount: 0.6 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0 }}
            className="text-5xl md:text-6xl lg:text-7xl font-medium text-[#00f1d7] leading-tight"
          >
            what<br />is tapt?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: -20, filter: "blur(12px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
            className="text-[#00f1d7]/80 text-base md:text-lg leading-relaxed max-w-lg"
          >
            We've set out to change how merchants of all industries collect payments.<br /><br />
            No need for those clunky EFTPOS machines or expensive pos systems, all you need is your phone and if you're a store, then one of our payment boards as well.<br /><br />
            Perfect for merchants on the move or operating where you need a quick and painless set up.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: -20, filter: "blur(12px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: false, amount: 0.8 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.22 }}
          >
            <MagneticButton
              onClick={onGetStarted}
              className="bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold px-8 py-3 rounded-full text-sm uppercase tracking-wider transition-colors shadow-lg inline-flex items-center gap-2"
            >
              get started <ArrowRight className="w-4 h-4" />
            </MagneticButton>
          </motion.div>
        </div>

        {/* Right — video */}
        <motion.div
          initial={{ opacity: 0, filter: "blur(12px)" }}
          whileInView={{ opacity: 1, filter: "blur(0px)" }}
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          className="flex-1 overflow-hidden self-end"
          style={{ minHeight: "35vh", transform: "translateX(-15%) scale(0.8)", transformOrigin: "bottom center" }}
        >
          <video
            className="w-full h-full object-cover block"
            style={{ minHeight: "35vh" }}
            autoPlay
            loop
            playsInline
            muted
          >
            <source src="/hero-phone.mp4" type="video/mp4" />
          </video>
        </motion.div>
      </div>
    </div>
  );
}

function VideoCard() {
  return (
    <div className="h-full w-full relative overflow-hidden">
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src={welcomeVideo}
        autoPlay
        loop
        playsInline
      />
    </div>
  );
}

function AboutSection() {
  return (
    <div id="about" className="h-full w-full flex flex-col items-center justify-center p-8 md:p-12 lg:p-16 overflow-y-auto">
      <div className="max-w-5xl w-full space-y-10 md:space-y-14">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center space-y-5"
        >
          <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-[#00f1d7] font-medium" style={{ color: "#0055ff" }}>
            What is Tapt Pay
          </p>
          <h2 className="text-3xl md:text-5xl lg:text-6xl text-[#000a36] leading-tight">
            The fastest, most <span className="font-bold">premium</span> path to <span className="font-bold">payment freedom</span>
          </h2>
          <p className="text-base md:text-xl text-[#000a36]/70 max-w-3xl mx-auto leading-relaxed">
            Transform how you accept payments with New Zealand's first truly digital POS and EFTPOS solution. No hardware. No hassle. Just seamless payments.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8"
        >
          {[
            { color: "#00f1d7", title: "Get started in 5 minutes", body: "No hardware required. Download the app, create your account, and start accepting payments immediately. No credit checks, no minimum deposits." },
            { color: "#0055ff", title: "Build your business", body: "Track every transaction, analyse revenue trends, and grow your business with powerful analytics. Get paid fast with settlements in 2 business days." },
            { color: "#00f1d7", title: "Bank-grade security", body: "PCI DSS compliant and powered by Windcave, New Zealand's most trusted payment provider. Every transaction is encrypted and secure." },
            { color: "#0055ff", title: "24/7 support", body: "Get help when you need it with our dedicated support team. In-app chat, email, and phone support available around the clock." },
          ].map((item) => (
            <div key={item.title} className="space-y-4 pt-6 md:pt-8 border-t-2" style={{ borderColor: item.color }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: item.color }}>
                <CheckCircle className="w-5 h-5" style={{ color: item.color === "#0055ff" ? "#ffffff" : "#000a36" }} />
              </div>
              <h3 className="text-xl md:text-2xl text-[#000a36] font-medium">{item.title}</h3>
              <p className="text-sm md:text-base text-[#000a36]/70 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function FeatureSection({
  title,
  image,
  description,
  details,
  imagePosition,
  titleStyle = "normal",
  titleColor = "#000a36",
  imageScale = "normal",
  showButton = false,
  buttonText = "more",
  textColor = "default",
  smallTextSize = "2.5rem",
  largeTitleSize = "5rem",
  smallTextMarginBottom = "0",
  imageStyle,
  imageContainerStyle,
  onButton,
}: {
  title: string;
  image: string;
  description: string;
  details: string;
  imagePosition: "left" | "right";
  titleStyle?: "normal" | "split";
  titleColor?: string;
  imageScale?: "normal" | "large";
  showButton?: boolean;
  buttonText?: string;
  textColor?: "default" | "white";
  smallTextSize?: string;
  largeTitleSize?: string;
  smallTextMarginBottom?: string;
  imageStyle?: React.CSSProperties;
  imageContainerStyle?: React.CSSProperties;
  onButton?: () => void;
}) {
  const titleWords = titleStyle === "split" ? title.split(" ") : [title];
  const textClass = textColor === "white" ? "text-white" : "text-[#000a36]";
  const mutedClass = textColor === "white" ? "text-white/70" : "text-[#000a36]/70";

  return (
    <div className="h-full w-full flex items-center justify-center p-6 md:p-10 lg:p-16 overflow-y-auto">
      <div className="w-full max-w-6xl">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center ${imagePosition === "right" ? "lg:grid-flow-col-dense" : ""}`}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className={`flex ${imagePosition === "right" ? "lg:col-start-2 justify-end" : "justify-center"}`}
            style={imageContainerStyle}
          >
            <img
              src={image}
              alt={title}
              className={`h-auto object-contain ${imageScale === "large" ? "w-full max-w-none lg:translate-x-8" : "w-full max-w-xs md:max-w-sm"}`}
              style={imageStyle}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className={`space-y-5 ${imagePosition === "right" ? "lg:col-start-1 lg:row-start-1" : ""}`}
          >
            <h2 className="leading-tight font-medium" style={{ color: titleColor }}>
              {titleStyle === "split" ? (
                <>
                  {titleWords.map((word, i) => (
                    <span key={i} className="block" style={{ fontSize: i === 0 ? smallTextSize : largeTitleSize, lineHeight: i === 0 ? "1.3" : "0.9", marginBottom: i === 0 ? smallTextMarginBottom : undefined }}>
                      {word}
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-3xl md:text-4xl lg:text-5xl">{title}</span>
              )}
            </h2>
            <p className={`${textClass} leading-relaxed text-base md:text-lg`}>{description}</p>
            <p className={`${mutedClass} leading-relaxed text-sm md:text-base`}>{details}</p>
            {showButton && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onButton}
                className={`mt-4 px-8 py-3 rounded-full text-sm uppercase tracking-[0.2em] font-medium transition-colors duration-300 ${textColor === "white" ? "bg-[#00f1d7] text-[#000a36] hover:bg-white" : "bg-[#0055ff] text-white hover:bg-[#000a36]"}`}
              >
                {buttonText}
              </motion.button>
            )}
          </motion.div>
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

const FEATURES = [
  {
    title: "Split Bill Payments",
    image: dashboardMockup,
    description: "Make splitting bills effortless. Enable split payment functionality and track who has paid their share in real-time.",
    details: "Perfect for group dining, shared services, or any situation where multiple people need to contribute to a single payment.",
  },
  {
    title: "Share Payment Requests",
    image: paymentMockup,
    description: "Send payment requests instantly via Email, SMS, or QR Code. Your customers can pay with a single tap, no app download required.",
    details: "Copy and share payment links anywhere. Track payment status and get notified when customers complete their payment.",
  },
  {
    title: "Smart Bill Splitting",
    image: terminalMockup,
    description: "Divide bills evenly or customise amounts for each person. Track payments in real-time and see exactly who still needs to pay.",
    details: "Whether it's lunch with colleagues or a group event, make splitting the bill simple and transparent for everyone involved.",
  },
  {
    title: "Professional Receipts",
    image: dashboardMockup,
    description: "Generate detailed transaction receipts automatically. Every payment includes a professional receipt with full transaction details.",
    details: "Download PDFs or share receipts instantly. Fully compliant receipts with business name, itemised costs and GST breakdown.",
  },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
};

function FeaturesCard() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const goTo = (i: number) => {
    setDirection(i > activeIndex ? 1 : -1);
    setActiveIndex(i);
  };
  const prev = () => { const i = (activeIndex - 1 + FEATURES.length) % FEATURES.length; setDirection(-1); setActiveIndex(i); };
  const next = () => { const i = (activeIndex + 1) % FEATURES.length; setDirection(1); setActiveIndex(i); };

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center px-8 md:px-14 py-10 gap-5 overflow-hidden bg-white">
      <h2 className="text-5xl md:text-6xl font-medium text-[#000a36] self-start w-full">features</h2>

      {/* Carousel row */}
      <div className="relative w-full flex items-center gap-3 px-[10%]">
        <button onClick={prev} className="flex-shrink-0 w-10 h-10 rounded-full bg-[#000a36]/10 hover:bg-[#0055ff] hover:text-white flex items-center justify-center transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div
          className="relative flex-1 overflow-hidden rounded-2xl cursor-pointer bg-gray-50"
          style={{ aspectRatio: "16/9" }}
          onClick={() => setExpandedIndex(activeIndex)}
        >
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={activeIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex items-center justify-center p-6"
            >
              <img src={FEATURES[activeIndex].image} alt={FEATURES[activeIndex].title} className="w-full h-full object-contain" />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-0 bg-[#0055ff]/0 hover:bg-[#0055ff]/5 transition-colors rounded-2xl" />
        </div>

        <button onClick={next} className="flex-shrink-0 w-10 h-10 rounded-full bg-[#000a36]/10 hover:bg-[#0055ff] hover:text-white flex items-center justify-center transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Current feature label */}
      <AnimatePresence mode="wait">
        <motion.p
          key={activeIndex}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="text-base font-medium text-[#000a36]"
        >
          {FEATURES[activeIndex].title}
        </motion.p>
      </AnimatePresence>

      {/* Pill dots */}
      <div className="flex items-center gap-2">
        {FEATURES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all duration-300 h-2 ${i === activeIndex ? "w-8 bg-[#0055ff]" : "w-2 bg-[#000a36]/20 hover:bg-[#000a36]/40"}`}
          />
        ))}
      </div>

      {/* Expanded widget */}
      <AnimatePresence>
        {expandedIndex !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/25 rounded-3xl"
              onClick={() => setExpandedIndex(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 20 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-6 z-50 bg-white rounded-2xl shadow-2xl flex flex-col lg:flex-row overflow-hidden"
            >
              <button
                onClick={() => setExpandedIndex(null)}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-[#000a36]/10 hover:bg-[#000a36]/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-[#000a36]" />
              </button>
              <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
                <img src={FEATURES[expandedIndex].image} alt={FEATURES[expandedIndex].title} className="w-full h-auto max-h-64 lg:max-h-full object-contain" />
              </div>
              <div className="flex-1 flex flex-col justify-center p-8 md:p-12 gap-5">
                <h3 className="text-3xl md:text-4xl font-medium text-[#000a36] leading-tight">{FEATURES[expandedIndex].title}</h3>
                <p className="text-[#000a36] leading-relaxed text-base md:text-lg">{FEATURES[expandedIndex].description}</p>
                <p className="text-[#000a36]/60 leading-relaxed text-sm md:text-base">{FEATURES[expandedIndex].details}</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function PricingCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center py-16 px-6 md:px-16 overflow-y-auto">
      <div className="max-w-5xl w-full">
        <ScrambleHeading
          text="what does it cost?"
          className="text-4xl md:text-6xl font-extralight text-[#00f1d7] text-center mb-4 tracking-tight"
        />
        <p className="text-white/50 text-center mb-12 max-w-2xl mx-auto text-base md:text-lg">
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
        <div className="text-center mt-10">
          <MagneticButton
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold px-10 py-4 rounded-full text-base transition-colors shadow-lg inline-flex items-center gap-2 lowercase"
          >
            get started for free <ArrowRight className="w-5 h-5" />
          </MagneticButton>
        </div>
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

  return (
    <div className="min-h-screen" style={{ background: "#ececec", fontFamily: "Outfit, sans-serif" }}>
      <SEOHead
        title="TaptPay – Low Cost EFTPOS & POS System NZ | Digital Point of Sale"
        description="New Zealand's lowest-cost EFTPOS alternative and digital POS system. No hardware, no lock-in contracts. Accept QR code and NFC contactless payments instantly. 100% Kiwi owned."
        keywords="EFTPOS NZ, POS system NZ, digital POS, POS solutions, low cost POS system, point of sale New Zealand, cheap EFTPOS machine, cloud POS NZ, small business POS NZ, contactless payments NZ, mobile POS NZ, QR code payments, NFC payments, EFTPOS alternative, payment terminal NZ"
        ogTitle="TaptPay – NZ's Lowest-Cost EFTPOS & POS System | No Hardware Required"
        ogDescription="Ditch the EFTPOS machine. TaptPay is New Zealand's 100% digital POS system — accept contactless payments via QR code and NFC with no hardware and no lock-in contracts."
        canonicalUrl="https://taptpay.com/"
      />

      <FixedNav onGetStarted={goLogin} />

      <div>
        {/* Hero — no sticky, doubled height */}
        <div className="px-3 md:px-4 pb-3 md:pb-4">
          <HeroSection onGetStarted={goLogin} />
        </div>

        {/* Video */}
        <StickyCard index={0} backgroundColor="#000000">
          <VideoCard />
        </StickyCard>

        {/* Digital Terminal */}
        <StickyCard index={1} backgroundColor="#00f1d7">
          <FeatureSection
            title="the terminal"
            image={terminalMockup}
            description="Transform your smartphone into a powerful payment terminal. The Tapt Pay app provides a complete point-of-sale experience with real-time transaction tracking, analytics, and revenue insights."
            details="View your daily transactions, monitor average transaction values, and track your business growth — all from one beautiful, intuitive interface."
            imagePosition="right"
            titleStyle="split"
            titleColor="#0055ff"
            imageScale="large"
            smallTextSize="3rem"
            largeTitleSize="6rem"
            imageStyle={{ transform: "scale(2)", transformOrigin: "center center" }}
            showButton
            buttonText="more"
            onButton={goLogin}
          />
        </StickyCard>

        {/* Payment Board */}
        <StickyCard index={2} backgroundColor="#000a36">
          <FeatureSection
            title="the payment board"
            image={paymentBoardMockup}
            description="Display your custom QR code and NFC payment option for customers. Our physical payment boards make it easy for customers to pay using their preferred method."
            details="Perfect for cafes, retail stores, food trucks, and any business that wants to offer a modern, contactless payment experience."
            imagePosition="right"
            titleStyle="split"
            titleColor="#ffffff"
            imageScale="large"
            showButton
            buttonText="more"
            onButton={goLogin}
            textColor="white"
            smallTextSize="3.2rem"
            largeTitleSize="7rem"
            smallTextMarginBottom="-1rem"
          />
        </StickyCard>

        {/* Customer Payment Page */}
        <StickyCard index={3} backgroundColor="#0055ff">
          <FeatureSection
            title="the payment page"
            image={paymentPageMockup}
            description="Display your custom QR code and NFC payment option for customers. Our physical payment boards make it easy for customers to pay using their preferred method."
            details="Perfect for cafes, retail stores, food trucks, and any business that wants to offer a modern, contactless payment experience."
            imagePosition="right"
            titleStyle="split"
            titleColor="#000a36"
            imageScale="large"
            showButton
            buttonText="more"
            onButton={goLogin}
            textColor="default"
            smallTextSize="3.2rem"
            largeTitleSize="7rem"
            smallTextMarginBottom="-1rem"
            imageContainerStyle={{ overflow: "hidden" }}
            imageStyle={{ transform: "scale(2)", transformOrigin: "center center" }}
          />
        </StickyCard>

        {/* Features carousel */}
        <StickyCard index={4} backgroundColor="#ffffff">
          <FeaturesCard />
        </StickyCard>

        {/* Pricing */}
        <StickyCard index={5} backgroundColor="#060e42">
          <PricingCard onGetStarted={goLogin} />
        </StickyCard>

        {/* Spacer so final card unsticks cleanly */}
        <div className="h-screen" style={{ backgroundColor: "#ececec" }}>
          <div className="pt-4 px-3 md:px-4">
            <FooterCard />
          </div>
        </div>
      </div>
    </div>
  );
}
