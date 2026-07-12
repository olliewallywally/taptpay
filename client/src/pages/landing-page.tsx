import { useLocation } from "wouter";
import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, ArrowRight, Check } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import skyLogo from "@assets/Logo_-_sky_blue_1780811546035.png";

// ─── Brand palette (sampled from the uploaded artboards) ───────────────────────
const NAVY = "#070D51";
const SKY = "#58ABFF";
const GREY = "#E6E6E6";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
html{scroll-behavior:smooth;}
.tp-root{font-family:'Outfit','Inter',system-ui,sans-serif;}
@keyframes tpBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
.tp-bounce{animation:tpBounce 1.8s ease-in-out infinite;}
`;

const fadeUp = {
  initial: { opacity: 0, y: 28, filter: "blur(8px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

// ─── Top navigation ────────────────────────────────────────────────────────────
function Nav() {
  const [, setLocation] = useLocation();
  const links: [string, () => void][] = [
    ["home", () => window.scrollTo({ top: 0, behavior: "smooth" })],
    ["products", () => scrollTo("verticals")],
    ["services", () => scrollTo("verticals")],
    ["pricing", () => scrollTo("pricing")],
    ["about us", () => scrollTo("tech")],
    ["contact", () => scrollTo("contact")],
  ];
  return (
    <nav className="fixed top-0 inset-x-0 z-50 flex justify-center pt-5 md:pt-7 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 sm:gap-5 md:gap-7">
        {links.map(([label, fn], i) => (
          <button
            key={label}
            onClick={fn}
            className={`${i < 2 ? "hidden sm:inline" : ""} text-[#58ABFF]/90 hover:text-white transition-colors text-[11px] md:text-sm tracking-wide lowercase`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={() => setLocation("/login")}
        className="pointer-events-auto absolute right-4 md:right-6 top-5 md:top-7 rounded-full bg-[#58ABFF] text-[#070D51] hover:bg-white transition-colors font-semibold lowercase text-[11px] md:text-sm px-4 md:px-5 py-1.5 md:py-2"
      >
        log in
      </button>
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section
      className="relative h-screen w-full flex flex-col items-center justify-center text-center px-6"
      style={{ backgroundColor: NAVY }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="flex items-end justify-center"
      >
        <img
          src={skyLogo}
          alt="taptpay"
          className="h-16 sm:h-24 md:h-32 lg:h-36 w-auto select-none"
          draggable={false}
        />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.45 }}
        className="mt-6 md:mt-8 text-white/85 text-base sm:text-xl md:text-2xl font-light tracking-wide"
      >
        multi-stack digital payment solution
      </motion.p>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.9 }}
        onClick={() => scrollTo("tech")}
        className="absolute bottom-10 md:bottom-12 flex flex-col items-center gap-2 text-[#58ABFF] hover:text-white transition-colors"
      >
        <span className="text-base md:text-xl font-light">what can i use tapt for?</span>
        <ChevronDown className="w-5 h-5 md:w-6 md:h-6 tp-bounce" strokeWidth={2.4} />
      </motion.button>
    </section>
  );
}

// ─── About the tech ────────────────────────────────────────────────────────────
function TechSection() {
  const tiles = [
    {
      title: "tap to pay",
      body: "Turn any phone into a terminal. Accept Apple Pay, Google Pay and contactless cards — no hardware, no rentals.",
    },
    {
      title: "qr & payment links",
      body: "Send a link or show a QR. Customers pay instantly from their own device, wherever they are.",
    },
    {
      title: "multi-stack payments",
      body: "Run unlimited payments at once. Stack jobs, tabs and tickets and collect them all from one live screen.",
    },
    {
      title: "real-time dashboard",
      body: "Every transaction, settlement and GST receipt — tracked live. Everything you need, nothing you don't.",
    },
  ];
  return (
    <section id="tech" className="w-full py-24 md:py-32 px-6 md:px-12" style={{ backgroundColor: NAVY }}>
      <div className="max-w-6xl mx-auto">
        <motion.p {...fadeUp} className="text-[#58ABFF] text-xs md:text-sm tracking-[0.28em] uppercase mb-5">
          the tech
        </motion.p>
        <motion.h2
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.08 }}
          className="text-white font-bold leading-[1.05] tracking-tight text-4xl md:text-6xl lg:text-7xl max-w-4xl"
        >
          one app.{" "}
          <span style={{ color: SKY }}>every way to get paid.</span>
        </motion.h2>
        <motion.p
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.16 }}
          className="mt-6 text-white/70 text-base md:text-xl font-light max-w-2xl leading-relaxed"
        >
          Tapt replaces clunky EFTPOS machines and expensive POS systems with one piece of
          software. Powered by Windcave and PCI-DSS compliant — bank-grade security, none of
          the hardware.
        </motion.p>

        <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-2 gap-px rounded-3xl overflow-hidden" style={{ backgroundColor: "rgba(88,171,255,0.18)" }}>
          {tiles.map((t, i) => (
            <motion.div
              key={t.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 + i * 0.08 }}
              className="p-8 md:p-10"
              style={{ backgroundColor: NAVY }}
            >
              <h3 className="text-2xl md:text-3xl font-semibold lowercase" style={{ color: SKY }}>
                {t.title}
              </h3>
              <p className="mt-3 text-white/65 text-sm md:text-base font-light leading-relaxed">
                {t.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Vertical (reusable feature block) ─────────────────────────────────────────
function Vertical({
  id,
  heading,
  sub,
  lead,
  perfectFor,
  bullets,
  phone,
  onLearnMore,
}: {
  id?: string;
  heading: React.ReactNode;
  sub: string;
  lead?: string;
  perfectFor?: string[];
  bullets: string[];
  phone: string;
  onLearnMore: () => void;
}) {
  return (
    <section
      id={id}
      className="w-full min-h-screen flex items-center py-20 md:py-24 px-6 md:px-12"
      style={{ backgroundColor: GREY }}
    >
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* Copy */}
        <motion.div {...fadeUp} className="order-2 lg:order-1">
          <h2
            className="font-bold leading-[0.95] tracking-tight lowercase text-4xl sm:text-5xl md:text-6xl"
            style={{ color: NAVY }}
          >
            {heading}
          </h2>
          <p className="mt-4 text-lg md:text-2xl font-medium" style={{ color: SKY }}>
            {sub}
          </p>

          {lead && (
            <p className="mt-5 max-w-md text-base md:text-lg font-light leading-relaxed" style={{ color: NAVY }}>
              {lead}
            </p>
          )}

          {perfectFor && (
            <div className="mt-7">
              <p className="text-lg md:text-xl font-semibold" style={{ color: NAVY }}>
                perfect for
              </p>
              <ul className="mt-3 space-y-1.5">
                {perfectFor.map((p) => (
                  <li key={p} className="flex items-center gap-3 text-lg md:text-xl font-medium" style={{ color: SKY }}>
                    <span className="font-bold">&gt;</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="mt-7 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-base md:text-lg" style={{ color: NAVY }}>
                <span className="font-bold mt-0.5" style={{ color: SKY }}>
                  &gt;
                </span>
                <span className="font-light">{b}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={onLearnMore}
            className="mt-9 inline-flex items-center gap-2 rounded-full border-2 px-7 py-2.5 text-sm md:text-base font-medium transition-colors duration-300 hover:text-white"
            style={{ borderColor: NAVY, color: NAVY }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = NAVY)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            learn more
          </button>
        </motion.div>

        {/* Phone */}
        <motion.div
          initial={{ opacity: 0, y: 36, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="order-1 lg:order-2 flex justify-center lg:justify-end"
        >
          <img
            src={phone}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-auto w-[230px] sm:w-[270px] md:w-[300px] select-none"
            style={{ filter: "drop-shadow(0 30px 50px rgba(7,13,81,0.22))" }}
          />
        </motion.div>
      </div>
    </section>
  );
}

// ─── Pricing ───────────────────────────────────────────────────────────────────
function Pricing({ onGetStarted }: { onGetStarted: () => void }) {
  const items = [
    "$0.10 per transaction",
    "Flexible software fee — pay $9.99 only if you go over 100 transactions in a month",
    "No contract, cancel anytime",
    "Free technical support",
    "$25.99 per A5 payment board — design service free for your first two",
    "Custom payment board sizes priced on request",
  ];
  return (
    <section id="pricing" className="w-full py-24 md:py-32 px-6 md:px-12" style={{ backgroundColor: NAVY }}>
      <div className="max-w-5xl mx-auto">
        <motion.p {...fadeUp} className="text-[#58ABFF] text-xs md:text-sm tracking-[0.28em] uppercase mb-5">
          pricing
        </motion.p>
        <motion.h2
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.08 }}
          className="text-white font-bold leading-[1.05] tracking-tight text-4xl md:text-6xl lg:text-7xl"
        >
          simple, honest <span style={{ color: SKY }}>pricing.</span>
        </motion.h2>
        <motion.p
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.16 }}
          className="mt-5 text-white/70 text-base md:text-xl font-light max-w-2xl"
        >
          No hardware to buy, no monthly lock-in. Pay as you grow.
        </motion.p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {items.map((item, i) => (
            <motion.div
              key={item}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.08 + i * 0.06 }}
              className="flex items-start gap-4 rounded-2xl p-6"
              style={{ backgroundColor: "rgba(88,171,255,0.08)", border: "1px solid rgba(88,171,255,0.18)" }}
            >
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: SKY }}
              >
                <Check className="h-4 w-4" strokeWidth={3} style={{ color: NAVY }} />
              </span>
              <span className="text-white/90 text-sm md:text-base font-light leading-relaxed">{item}</span>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }} className="mt-12">
          <button
            onClick={onGetStarted}
            className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm md:text-base font-semibold uppercase tracking-wide transition-transform hover:scale-105"
            style={{ backgroundColor: SKY, color: NAVY }}
          >
            get started <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Contact ───────────────────────────────────────────────────────────────────
function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Enquiry from ${form.name || "the TaptPay site"}`);
    const body = encodeURIComponent(`${form.message}\n\n— ${form.name}\n${form.email}`);
    window.location.href = `mailto:hello@taptpay.co.nz?subject=${subject}&body=${body}`;
  };

  const field =
    "w-full rounded-xl border-2 bg-transparent px-4 py-3 text-base outline-none transition-colors placeholder:text-[#070D51]/40 focus:border-[#58ABFF]";

  return (
    <section id="contact" className="w-full py-24 md:py-32 px-6 md:px-12" style={{ backgroundColor: GREY }}>
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <motion.div {...fadeUp}>
          <p className="text-xs md:text-sm tracking-[0.28em] uppercase mb-5" style={{ color: SKY }}>
            contact us
          </p>
          <h2 className="font-bold leading-[0.95] tracking-tight lowercase text-4xl md:text-6xl" style={{ color: NAVY }}>
            let&apos;s get you<br />paid.
          </h2>
          <p className="mt-6 text-base md:text-lg font-light max-w-md leading-relaxed" style={{ color: NAVY }}>
            Tell us a little about your business and we&apos;ll get you set up. 100% kiwi owned and operated.
          </p>
          <a
            href="mailto:hello@taptpay.co.nz"
            className="mt-6 inline-block text-lg md:text-xl font-medium"
            style={{ color: SKY }}
          >
            hello@taptpay.co.nz
          </a>
        </motion.div>

        <motion.form
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.12 }}
          onSubmit={submit}
          className="space-y-4"
        >
          <input
            required
            placeholder="your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={field}
            style={{ borderColor: "rgba(7,13,81,0.18)", color: NAVY }}
          />
          <input
            required
            type="email"
            placeholder="your email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={field}
            style={{ borderColor: "rgba(7,13,81,0.18)", color: NAVY }}
          />
          <textarea
            required
            rows={4}
            placeholder="how can we help?"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className={`${field} resize-none`}
            style={{ borderColor: "rgba(7,13,81,0.18)", color: NAVY }}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm md:text-base font-semibold uppercase tracking-wide transition-transform hover:scale-105"
            style={{ backgroundColor: NAVY, color: "#fff" }}
          >
            send message <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
          </button>
        </motion.form>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="w-full py-10 px-6 md:px-12 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ backgroundColor: NAVY }}>
      <img src={skyLogo} alt="taptpay" className="h-7 w-auto" draggable={false} />
      <p className="text-white/45 text-xs tracking-wide">
        © {new Date().getFullYear()} TaptPay · 100% kiwi owned and operated
      </p>
    </footer>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export function LandingPage() {
  const [, setLocation] = useLocation();
  const start = () => setLocation("/signup");

  return (
    <div className="tp-root" style={{ backgroundColor: NAVY }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SEOHead
        title="TaptPay — multi-stack digital payment solution"
        description="TaptPay turns any phone into a payment terminal. Tap to pay, QR, invoicing and multi-stack POS for property management, trades, hospitality and retail. No hardware, no contracts."
        keywords="tap to pay, digital eftpos, POS New Zealand, payment terminal app, invoicing, split bill, Windcave"
      />

      <Nav />
      <Hero />
      <TechSection />

      <div id="verticals">
        <Vertical
          id="property"
          heading="property management"
          sub="automated rent & bill collection"
          bullets={[
            "Track rent & bill payment links as they're sent out",
            "Tenants pay instantly with their digital wallet",
            "Auto-generated GST receipts for every payment",
          ]}
          phone="/design/phones/phone-property.png"
          onLearnMore={start}
        />

        <Vertical
          id="trades"
          heading={<>trades, industries<br />&amp; hospo</>}
          sub="quote, invoice & collect payment digitally"
          perfectFor={["the trades", "industries", "retail", "hospitality"]}
          bullets={[
            "Send quotes & invoices in seconds",
            "Customers pay instantly — tap, QR or link",
            "Auto-generated GST receipts",
          ]}
          phone="/design/phones/phone-invoicing.png"
          onLearnMore={start}
        />

        <Vertical
          id="retail"
          heading="retail"
          sub="digital p.o.s & eftpos system"
          lead="Throw out your old brick. Tapt's digital POS & EFTPOS is perfect for collecting payments when you're on the go."
          bullets={[
            "Multi-stack payments — unlimited payments at once",
            "Auto-generated GST receipts",
            "Live dashboard to track everything you need, nothing you don't",
          ]}
          phone="/design/phones/phone-pos.png"
          onLearnMore={start}
        />
      </div>

      <Pricing onGetStarted={start} />
      <Contact />
      <Footer />
    </div>
  );
}

export default LandingPage;
