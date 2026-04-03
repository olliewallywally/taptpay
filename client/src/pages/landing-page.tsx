import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import { ArrowRight, CheckCircle, ChevronLeft, ChevronRight, X, Volume2, VolumeX } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useScrambleText } from "@/hooks/use-scramble-text";
import logoImage from "@assets/logo_1762915255857.png";
import dashboardMockup from "@assets/dashboard_3d_1774258691269.png";
import paymentMockup from "@assets/payment_page_1774258691269.png";
import paymentBoardMockup from "@assets/payment_board_3d_v2_1774674925840.png";
import paymentPageMockup from "@assets/payment_page_1774675283693.png";
import terminalMockup from "@assets/terminal_3d_1774258691270.png";
import welcomeVideo from "@assets/welcome_to_tapt_-_web_1774671768422.mp4";
import welcomeVideoMobile from "@assets/welcome_to_tapt_-_mobile_clean_version_1775256304347.mp4";
import featureSplitPayment from "@assets/split_payment_1774675808091.png";
import featureMerchantSplit from "@assets/merchant_split_payment_1774675808089.png";
import featureSharePayment from "@assets/share_payment_1774675808091.png";
import featureReceipt from "@assets/recipt_generation_1774675808090.png";

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

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn, { passive: true });
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
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

function StickyCard({ children, index, backgroundColor = "#ffffff", isDouble = false, cardClassName }: {
  children: React.ReactNode;
  index: number;
  backgroundColor?: string;
  isDouble?: boolean;
  cardClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1, 0.7]);

  return (
    <div ref={ref} className="sticky top-0 h-screen flex items-center justify-center px-3 md:px-4" style={{ paddingTop: `${index * (isMobile ? 12 : 28)}px` }}>
      <motion.div
        style={{ scale, opacity, backgroundColor }}
        className={cardClassName ?? `w-full max-w-7xl rounded-3xl shadow-2xl overflow-hidden ${isDouble ? "h-[95vh]" : "h-[90vh]"}`}
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
        className={`pointer-events-auto bg-[#000a36] rounded-full px-4 md:px-6 py-3 flex gap-3 md:gap-8 items-center transition-all duration-300 ${scrolled ? "shadow-2xl" : "shadow-lg"}`}
      >
        <button onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })} className="hidden sm:block text-white hover:text-[#00f1d7] transition-colors text-xs md:text-sm uppercase tracking-wider">services</button>
        <button onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })} className="hidden sm:block text-white hover:text-[#00f1d7] transition-colors text-xs md:text-sm uppercase tracking-wider">about</button>
        <button onClick={onGetStarted} className="text-white hover:text-[#00f1d7] transition-colors text-xs md:text-sm uppercase tracking-wider">login</button>
        <MagneticButton onClick={onGetStarted} className="bg-[#00f1d7] text-[#000a36] font-semibold px-3 py-1 rounded-full text-[10px] md:text-xs uppercase tracking-wider hover:bg-white transition-colors">
          get started
        </MagneticButton>
      </motion.div>
    </nav>
  );
}

function HeroSection({ onGetStarted }: { onGetStarted: () => void }) {
  const isMobile = useIsMobile();
  return (
    <div className="w-full bg-[#0055ff] rounded-3xl overflow-hidden flex flex-col">

      {/* ── Screen 1: Logo / tagline / CTA — full viewport height ── */}
      <div className="h-screen flex flex-col items-center justify-center text-center px-6 gap-4 md:gap-6">
        <motion.img
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          src={logoImage}
          alt="TaptPay"
          className="w-52 md:w-80 lg:w-[420px] h-auto"
        />
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-xs md:text-2xl lg:text-3xl text-white font-light tracking-[0.2em] uppercase"
        >
          100% digital pos &amp; eftpos solution
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col items-center gap-2"
        >
          <MagneticButton
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold px-4 py-1.5 md:px-6 md:py-2 rounded-full text-[10px] md:text-sm uppercase tracking-wider transition-colors shadow-lg flex items-center gap-1 md:gap-1.5"
            data-testid="button-get-started"
          >
            get started <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
          </MagneticButton>
          <p className="text-white/40 text-[10px] md:text-xs tracking-widest uppercase">100% kiwi owned and operated</p>
        </motion.div>
      </div>

      {/* ── Screen 2: What is tapt? — always row, text left z-10, video right z-0 ── */}
      <div className="h-screen flex flex-row relative overflow-hidden">

        {/* Left — text pinned to bottom, above the phone */}
        <div className="relative z-10 flex flex-col justify-end px-5 md:px-12 lg:px-20 pb-[22%] gap-3 md:gap-5 w-[52%] md:w-[48%] lg:w-[45%] shrink-0">
          <motion.h2
            initial={{ opacity: 0, y: 24, filter: "blur(14px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: false, amount: 0.2 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0 }}
            className="text-4xl md:text-6xl lg:text-8xl font-medium text-[#00f1d7] leading-tight"
          >
            what<br />is tapt?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 24, filter: "blur(14px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: false, amount: 0.2 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.14 }}
            className="text-[#00f1d7]/80 text-xs md:text-base lg:text-lg leading-relaxed"
          >
            We've set out to change how merchants of all industries collect payments.<br /><br className="hidden md:block" />
            <span className="hidden md:inline">No need for those clunky EFTPOS machines or expensive POS systems — all you need is your phone, and if you're a store, one of our payment boards.<br /><br />Perfect for merchants on the move or where you need a quick, painless setup.</span>
            <span className="md:hidden">No clunky EFTPOS machines — just your phone. Perfect for merchants on the move.</span>
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24, filter: "blur(14px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: false, amount: 0.2 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.26 }}
          >
            <MagneticButton
              onClick={onGetStarted}
              className="bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold px-4 py-1.5 md:px-6 md:py-2 rounded-full text-[10px] md:text-sm uppercase tracking-wider transition-colors shadow-lg inline-flex items-center gap-1 md:gap-1.5"
            >
              get started <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
            </MagneticButton>
          </motion.div>
        </div>

        {/* Right — phone video, bottom layer, pinned to bottom of card */}
        <motion.div
          initial={{ opacity: 0, filter: "blur(14px)" }}
          whileInView={{ opacity: 1, filter: "blur(0px)" }}
          viewport={{ once: false, amount: 0.2 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          className="relative z-0 flex-1 self-end overflow-hidden"
          style={{ transformOrigin: "bottom center", transform: isMobile ? "translateX(-14%) scale(1.05)" : "translateX(-14%) scale(0.79)" }}
        >
          <video
            className="w-full h-full object-cover block"
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
  const isMobile = useIsMobile();
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  };

  if (isMobile) {
    return (
      <div className="w-full relative">
        <video
          ref={videoRef}
          key="mobile"
          className="w-full h-auto block"
          src={welcomeVideoMobile}
          autoPlay
          loop
          playsInline
          muted
        />
        <button
          onClick={toggleMute}
          aria-label={muted ? "Unmute video" : "Mute video"}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200"
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      <video
        ref={videoRef}
        key="desktop"
        className="absolute inset-0 w-full h-full object-cover"
        src={welcomeVideo}
        autoPlay
        loop
        playsInline
        muted
      />
      <button
        onClick={toggleMute}
        aria-label={muted ? "Unmute video" : "Mute video"}
        className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200"
      >
        {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        {muted ? "Unmute" : "Mute"}
      </button>
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
  buttonClassName,
  imageStyle,
  imageContainerStyle,
  bodyTextSmall = false,
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
  buttonClassName?: string;
  imageStyle?: React.CSSProperties;
  imageContainerStyle?: React.CSSProperties;
  bodyTextSmall?: boolean;
  onButton?: () => void;
}) {
  const titleWords = titleStyle === "split" ? title.split(" ") : [title];
  const textClass = textColor === "white" ? "text-white" : "text-[#000a36]";
  const mutedClass = textColor === "white" ? "text-white/70" : "text-[#000a36]/70";

  return (
    <div className="h-full w-full flex items-center justify-center p-6 md:p-10 lg:p-16 overflow-y-auto">
      <div className="w-full max-w-6xl">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16 items-center ${imagePosition === "right" ? "lg:grid-flow-col-dense" : ""}`}>
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
              className={`h-auto object-contain ${imageScale === "large" ? "w-full max-w-[70%] md:max-w-none mx-auto md:mx-0 lg:translate-x-8" : "w-full max-w-xs md:max-w-sm"}`}
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
            <p className={`${textClass} leading-relaxed ${bodyTextSmall ? "text-xs md:text-sm" : "text-base md:text-lg"}`}>{description}</p>
            <p className={`${mutedClass} leading-relaxed ${bodyTextSmall ? "text-[10px] md:text-xs" : "text-sm md:text-base"}`}>{details}</p>
            {showButton && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onButton}
                className={buttonClassName ?? `mt-2 px-5 py-2 rounded-full text-xs uppercase tracking-[0.15em] font-medium transition-colors duration-300 ${textColor === "white" ? "bg-[#00f1d7] text-[#000a36] hover:bg-white" : "bg-[#0055ff] text-white hover:bg-[#000a36]"}`}
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

const PRICING_ITEMS = [
  { label: "$0.10 per transaction" },
  { label: "Flexible monthly software fee — only pay $9.99 if you go over 100 transactions in a month" },
  { label: "No contract" },
  { label: "Free technical support" },
  { label: "$25.99 per payment board A5 (design service free for first 2 boards)" },
  { label: "Custom payment board size — priced on request" },
];

const FEATURES = [
  {
    title: "Split Bill Payments",
    image: featureSplitPayment,
    description: "Make splitting bills effortless for your customers. They can divide any amount evenly or set custom amounts per person.",
    details: "Perfect for group dining, shared services, or any situation where multiple people need to contribute to a single payment.",
  },
  {
    title: "Merchant Split Payment",
    image: featureMerchantSplit,
    description: "Enable split bill mode directly from the terminal. Track each partial payment as it comes in and see the total in real-time.",
    details: "Toggle split bill on per transaction, monitor who has paid their share, and accept payments via QR, NFC, or payment board.",
  },
  {
    title: "Share Payment Requests",
    image: featureSharePayment,
    description: "Send payment requests instantly via Email, SMS, or QR Code. Your customers can pay with a single tap, no app download required.",
    details: "Copy and share payment links anywhere. Track payment status and get notified when customers complete their payment.",
  },
  {
    title: "Professional Receipts",
    image: featureReceipt,
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
    <div className="relative h-full w-full flex flex-col px-4 md:px-14 pt-5 md:pt-10 pb-5 md:pb-8 gap-3 md:gap-4 overflow-hidden bg-white">
      <h2 className="text-2xl md:text-6xl font-medium text-[#000a36] shrink-0">features</h2>

      {/* Carousel row — flex-1 so image fills remaining card height */}
      <div className="relative flex-1 min-h-0 flex items-stretch gap-2 md:gap-3 md:px-[10%]">
        <button onClick={prev} className="flex-shrink-0 self-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#000a36]/10 hover:bg-[#0055ff] hover:text-white flex items-center justify-center transition-colors">
          <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
        </button>

        <div
          className="relative flex-1 overflow-hidden rounded-2xl cursor-pointer bg-gray-50"
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
              className="absolute inset-0 flex items-center justify-center p-4 md:p-6"
            >
              <img src={FEATURES[activeIndex].image} alt={FEATURES[activeIndex].title} className="w-full h-full object-contain" />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-0 bg-[#0055ff]/0 hover:bg-[#0055ff]/5 transition-colors rounded-2xl" />
        </div>

        <button onClick={next} className="flex-shrink-0 self-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#000a36]/10 hover:bg-[#0055ff] hover:text-white flex items-center justify-center transition-colors">
          <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
        </button>
      </div>

      {/* Current feature label + pill dots */}
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <AnimatePresence mode="wait">
          <motion.p
            key={activeIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="text-sm md:text-base font-medium text-[#000a36]"
          >
            {FEATURES[activeIndex].title}
          </motion.p>
        </AnimatePresence>

        {/* Smaller pill dots */}
        <div className="flex items-center gap-1.5">
          {FEATURES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-300 h-1.5 ${i === activeIndex ? "w-5 bg-[#0055ff]" : "w-1.5 bg-[#000a36]/20 hover:bg-[#000a36]/40"}`}
            />
          ))}
        </div>
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
              className="absolute inset-3 md:inset-6 z-50 bg-white rounded-2xl shadow-2xl flex flex-col lg:flex-row overflow-y-auto"
            >
              <button
                onClick={() => setExpandedIndex(null)}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#000a36]/10 hover:bg-[#000a36]/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-[#000a36]" />
              </button>
              <div className="flex items-center justify-center p-6 md:p-8 bg-gray-50 lg:flex-1">
                <img src={FEATURES[expandedIndex].image} alt={FEATURES[expandedIndex].title} className="w-auto h-auto max-h-40 md:max-h-56 lg:max-h-full object-contain" />
              </div>
              <div className="flex flex-col justify-center p-6 md:p-12 gap-4 lg:flex-1">
                <h3 className="text-2xl md:text-4xl font-medium text-[#000a36] leading-tight">{FEATURES[expandedIndex].title}</h3>
                <p className="text-[#000a36] leading-relaxed text-sm md:text-lg">{FEATURES[expandedIndex].description}</p>
                <p className="text-[#000a36]/60 leading-relaxed text-xs md:text-base">{FEATURES[expandedIndex].details}</p>
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
    <div className="h-full w-full flex flex-col items-center justify-center py-10 md:py-16 px-5 md:px-16 overflow-y-auto">
      <div className="max-w-5xl w-full">
        <ScrambleHeading
          text="what does it cost?"
          className="text-3xl md:text-6xl font-extralight text-[#00f1d7] text-center mb-4 tracking-tight"
        />
        <div className="max-w-xl mx-auto">
          <div className="bg-[#0055ff] border border-[#00f1d7]/30 rounded-3xl p-8 md:p-10">
            <ul className="flex flex-col gap-4">
              {PRICING_ITEMS.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#00f1d7] flex-shrink-0 mt-0.5" />
                  <span className="text-white/90 text-sm md:text-base leading-relaxed">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="text-center mt-10">
          <MagneticButton
            onClick={onGetStarted}
            className="bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold px-6 py-2.5 rounded-full text-sm transition-colors shadow-lg inline-flex items-center gap-2 lowercase"
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
  const isMobile = useIsMobile();
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
        <div className="px-3 md:px-4 pt-3 md:pt-4 pb-3 md:pb-4">
          <div className="max-w-7xl mx-auto">
            <HeroSection onGetStarted={goLogin} />
          </div>
        </div>

        {/* Video */}
        <StickyCard index={0} backgroundColor="#000000" cardClassName="w-full max-w-7xl rounded-3xl shadow-2xl overflow-hidden md:h-[90vh]">
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
            smallTextSize="clamp(1.6rem, 4.5vw, 3rem)"
            largeTitleSize="clamp(2.5rem, 8vw, 6rem)"
            imageStyle={{ transform: isMobile ? "translateY(-10%) scale(2.0)" : "translateY(-10%) scale(2.25)", transformOrigin: "center center" }}
            showButton
            buttonText="more"
            onButton={goLogin}
            bodyTextSmall
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
            smallTextSize="clamp(1.6rem, 4.5vw, 3.2rem)"
            largeTitleSize="clamp(2.5rem, 9vw, 7rem)"
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
            smallTextSize="clamp(1.6rem, 4.5vw, 3.2rem)"
            largeTitleSize="clamp(2.5rem, 9vw, 7rem)"
            smallTextMarginBottom="-1rem"
            imageStyle={{ transform: isMobile ? "translateY(-10%) scale(2.0)" : "translateY(-10%) scale(2.25)", transformOrigin: "center center" }}
            buttonClassName="mt-2 px-5 py-2 rounded-full text-xs uppercase tracking-[0.15em] font-medium transition-colors duration-300 bg-[#000a36] text-white hover:bg-white hover:text-[#000a36]"
            bodyTextSmall
          />
        </StickyCard>

        {/* Dashboard */}
        <StickyCard index={4} backgroundColor="#000a36">
          <FeatureSection
            title="dashboard"
            image={dashboardMockup}
            description="Get a complete overview of your business performance with real-time analytics, transaction history, and revenue insights all in one place."
            details="Track daily sales, monitor trends, and make data-driven decisions — all from a beautifully designed dashboard built for modern merchants."
            imagePosition="right"
            titleStyle="split"
            titleColor="#00f1d7"
            imageScale="large"
            showButton
            buttonText="more"
            onButton={goLogin}
            textColor="white"
            smallTextSize="clamp(2rem, 6vw, 4rem)"
            largeTitleSize="clamp(3rem, 10vw, 8rem)"
            smallTextMarginBottom="-1rem"
            imageStyle={{ transform: isMobile ? "translateY(-8%) scale(1.6)" : "translateY(-12%) scale(2.2)", transformOrigin: "center center" }}
            bodyTextSmall
          />
        </StickyCard>

        {/* Features carousel — full-width, non-sticky */}
        <div className="relative z-10 h-screen w-full" style={{ backgroundColor: "#ffffff" }}>
          <FeaturesCard />
        </div>

        {/* Pricing — full-screen, non-sticky */}
        <div className="relative z-10 h-screen flex items-center justify-center px-3 md:px-4" style={{ backgroundColor: "#ececec" }}>
          <div className="w-full max-w-7xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden" style={{ backgroundColor: "#060e42" }}>
            <PricingCard onGetStarted={goLogin} />
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 pt-4 px-3 md:px-4 pb-8" style={{ backgroundColor: "#ececec" }}>
          <FooterCard />
        </div>
      </div>
    </div>
  );
}
