import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import {
  Smartphone, Zap, CreditCard, BarChart3,
  ArrowRight, ChevronLeft, ArrowUpRight,
} from "lucide-react";
import { useLocation } from "wouter";
import logoImage from "@assets/logo_1762915255857.png";

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG       = "#060D1F";
const NAVY2    = "#0A1628";
const PANEL    = "#08121F";
const SKY      = "#38B2FF";
const SKY2     = "#63CBFF";
const WHITE    = "#EBF0FF";
const WHITE55  = "rgba(235,240,255,0.55)";
const WHITE25  = "rgba(235,240,255,0.25)";
const WHITE08  = "rgba(235,240,255,0.08)";
const WHITE06  = "rgba(235,240,255,0.06)";
const SKYG     = "rgba(56,178,255,0.18)";
const SKYG_SM  = "rgba(56,178,255,0.08)";

// ─── Panel data ───────────────────────────────────────────────────────────────
const PANELS = [
  {
    Icon: Smartphone,
    tag: "01",
    title: "Zero Hardware",
    headline: "Your device\nis the terminal.",
    body: "Turn any iPhone or Android into a fully-certified payment point. No EFTPOS machines, no rentals, no courier wait — just tap.",
    cta: "See How It Works",
    angle: "135deg",
  },
  {
    Icon: Zap,
    tag: "02",
    title: "Instant Velocity",
    headline: "Live in minutes,\nnot days.",
    body: "From signup to first transaction in under 10 minutes. Streamlined verification, instant merchant approval, zero setup friction.",
    cta: "Start Onboarding",
    angle: "155deg",
  },
  {
    Icon: CreditCard,
    tag: "03",
    title: "EFTPOS Redefined",
    headline: "No legacy.\nNo compromise.",
    body: "Cut ties with terminal contracts and hidden hardware fees. Tapt Pay is fully software-defined — you own the experience.",
    cta: "View Pricing",
    angle: "120deg",
  },
  {
    Icon: BarChart3,
    tag: "04",
    title: "Full Visibility",
    headline: "Real-time intel,\nevery transaction.",
    body: "A live analytics dashboard gives you instant insight into revenue, settlements, and merchant performance — anywhere.",
    cta: "Explore Dashboard",
    angle: "148deg",
  },
] as const;

// ─── Keyframe block ───────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:${BG};overflow:hidden;}

@keyframes orb1{0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(50px,-70px) scale(1.1)} 66%{transform:translate(-30px,40px) scale(.95)}}
@keyframes orb2{0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-60px,35px) scale(1.05)} 66%{transform:translate(55px,-45px) scale(1.1)}}
@keyframes orb3{0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(25px,60px) scale(1.15)}}
@keyframes gridPulse{0%,100%{opacity:.03} 50%{opacity:.055}}
@keyframes ringA{from{transform:rotate(0deg)} to{transform:rotate(360deg)}}
@keyframes ringB{from{transform:rotate(0deg)} to{transform:rotate(-360deg)}}
@keyframes orbitDot{0%,100%{opacity:.35;transform:scale(.8)} 50%{opacity:1;transform:scale(1)}}
@keyframes cardFloat{0%,100%{transform:translateY(0) rotate(-4deg)} 50%{transform:translateY(-14px) rotate(-4deg)}}
@keyframes chipFloat{0%,100%{transform:translateY(0) rotate(7deg)} 50%{transform:translateY(-10px) rotate(7deg)}}
@keyframes corePulse{0%,100%{box-shadow:0 0 0 0 rgba(56,178,255,.5),0 0 40px rgba(56,178,255,.2)} 50%{box-shadow:0 0 0 16px rgba(56,178,255,0),0 0 60px rgba(56,178,255,.35)}}
@keyframes nfcPing{0%{transform:scale(.7);opacity:.7} 100%{transform:scale(2.4);opacity:0}}
`;

// ─── Gradient mesh background ─────────────────────────────────────────────────
function Mesh() {
  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
      <div style={{ position:"absolute", top:"-15%", right:"-8%", width:"65vw", height:"65vw",
        maxWidth:760, maxHeight:760, borderRadius:"50%",
        background:`radial-gradient(circle,${SKYG} 0%,rgba(56,178,255,.04) 55%,transparent 72%)`,
        filter:"blur(45px)", animation:"orb1 14s ease-in-out infinite" }} />
      <div style={{ position:"absolute", bottom:"-5%", left:"-12%", width:"55vw", height:"55vw",
        maxWidth:640, maxHeight:640, borderRadius:"50%",
        background:`radial-gradient(circle,rgba(56,178,255,.1) 0%,transparent 70%)`,
        filter:"blur(55px)", animation:"orb2 17s ease-in-out infinite" }} />
      <div style={{ position:"absolute", top:"25%", left:"28%", width:"42vw", height:"42vw",
        maxWidth:520, maxHeight:520, borderRadius:"50%",
        background:`radial-gradient(circle,rgba(14,40,90,.2) 0%,transparent 70%)`,
        filter:"blur(65px)", animation:"orb3 20s ease-in-out infinite" }} />
      <div style={{ position:"absolute", inset:0,
        backgroundImage:"linear-gradient(rgba(235,240,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(235,240,255,.04) 1px,transparent 1px)",
        backgroundSize:"80px 80px", animation:"gridPulse 9s ease-in-out infinite" }} />
    </div>
  );
}

// ─── Hero visual ──────────────────────────────────────────────────────────────
function HeroVisual() {
  return (
    <div style={{ position:"relative", width:300, height:300, flexShrink:0 }}>
      {/* NFC pings */}
      {[0,1,2].map(i => (
        <div key={i} style={{
          position:"absolute", inset:0, margin:"auto",
          width:90, height:90, borderRadius:"50%",
          border:`1px solid ${SKY}`,
          animation:`nfcPing ${2.2}s ease-out infinite`,
          animationDelay:`${i * 0.72}s`,
        }} />
      ))}

      {/* Outer slow-rotating ring */}
      <div style={{
        position:"absolute", inset:0, margin:"auto",
        width:230, height:230, borderRadius:"50%",
        border:"1px solid rgba(56,178,255,.18)",
        borderTopColor: SKY,
        borderRightColor:"rgba(56,178,255,.4)",
        animation:"ringA 12s linear infinite",
      }} />

      {/* Inner counter-rotating dashed ring */}
      <div style={{
        position:"absolute", inset:0, margin:"auto",
        width:175, height:175, borderRadius:"50%",
        border:"1px dashed rgba(56,178,255,.25)",
        animation:"ringB 8s linear infinite",
      }} />

      {/* Orbital dots */}
      {[0,60,120,180,240,300].map((deg,i) => (
        <div key={i} style={{
          position:"absolute", inset:0, margin:"auto",
          width:230, height:230,
          transform:`rotate(${deg}deg)`,
        }}>
          <div style={{
            position:"absolute", top:-4, left:"50%",
            width:8, height:8, marginLeft:-4,
            borderRadius:"50%",
            background: i % 2 === 0 ? SKY : "rgba(56,178,255,.4)",
            boxShadow: i % 2 === 0 ? `0 0 8px ${SKY}` : "none",
            animation:`orbitDot ${2.5 + i*0.3}s ease-in-out infinite`,
            animationDelay:`${i*0.4}s`,
          }} />
        </div>
      ))}

      {/* Core */}
      <div style={{
        position:"absolute", inset:0, margin:"auto",
        width:90, height:90, borderRadius:"50%",
        background:`radial-gradient(circle, rgba(56,178,255,.35) 0%, rgba(56,178,255,.08) 65%, transparent 100%)`,
        border:`1px solid rgba(56,178,255,.5)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        animation:"corePulse 3s ease-in-out infinite",
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M16 4C9.37 4 4 9.37 4 16s5.37 12 12 12 12-5.37 12-12S22.63 4 16 4" stroke={SKY} strokeWidth="1.2" fill="none" opacity=".5" strokeDasharray="5 4"/>
          <path d="M16 9C12.13 9 9 12.13 9 16s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7" stroke={SKY} strokeWidth="1.5" fill="none" opacity=".8"/>
          <circle cx="16" cy="16" r="3.5" fill={SKY}/>
        </svg>
      </div>

      {/* Floating phone card */}
      <div style={{
        position:"absolute", top:10, right:-18,
        width:72, height:120, borderRadius:14,
        background:`linear-gradient(150deg, #0E2040 0%, #091826 100%)`,
        border:"1px solid rgba(56,178,255,.28)",
        boxShadow:"0 18px 50px rgba(0,0,0,.45), 0 0 20px rgba(56,178,255,.1)",
        padding:"10px 9px",
        display:"flex", flexDirection:"column", gap:7,
        animation:"cardFloat 4.2s ease-in-out infinite",
      }}>
        <div style={{ width:"100%", height:3, borderRadius:2, background:"rgba(56,178,255,.5)" }} />
        <div style={{ width:"70%", height:2, borderRadius:1, background:WHITE08 }} />
        <div style={{
          flex:1, borderRadius:8,
          background:"linear-gradient(140deg, rgba(56,178,255,.22), rgba(56,178,255,.04))",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="2" y="4" width="18" height="14" rx="3" stroke={SKY} strokeWidth="1.4" fill="none" opacity=".7"/>
            <path d="M2 8h18" stroke={SKY} strokeWidth="1.2" opacity=".5"/>
          </svg>
        </div>
        <div style={{ width:"100%", height:2, borderRadius:1, background:"rgba(56,178,255,.18)" }} />
        <div style={{ display:"flex", gap:3 }}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{ width:13, height:3, borderRadius:1, background:WHITE08 }} />
          ))}
        </div>
      </div>

      {/* Floating chip card */}
      <div style={{
        position:"absolute", bottom:14, left:-28,
        width:105, height:66, borderRadius:10,
        background:`linear-gradient(130deg, #122540 0%, #0A1628 100%)`,
        border:"1px solid rgba(56,178,255,.22)",
        boxShadow:"0 14px 38px rgba(0,0,0,.5)",
        padding:"9px 11px",
        display:"flex", flexDirection:"column", justifyContent:"space-between",
        animation:"chipFloat 5.1s ease-in-out infinite",
        animationDelay:".6s",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{
            width:22, height:16, borderRadius:3,
            background:`linear-gradient(135deg, rgba(56,178,255,.65), rgba(56,178,255,.2))`,
            border:"1px solid rgba(56,178,255,.3)",
          }} />
          <div style={{
            display:"flex", gap:-4,
          }}>
            {[0,1].map(i=>(
              <div key={i} style={{
                width:18, height:18, borderRadius:"50%",
                background:`rgba(56,178,255,.${i===0?'25':'15'})`,
                border:"1px solid rgba(56,178,255,.3)",
                marginLeft: i===1 ? -8 : 0,
              }} />
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{ width:16, height:3, borderRadius:1.5, background:WHITE08 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Feature panel ────────────────────────────────────────────────────────────
function Panel({
  panel, index, isActive, anyActive, onClick,
}: {
  panel: typeof PANELS[number];
  index: number;
  isActive: boolean;
  anyActive: boolean;
  onClick: () => void;
}) {
  const { Icon, tag, title, headline, body, cta, angle } = panel;
  const [hovered, setHovered] = useState(false);

  const flexVal = isActive ? 5 : anyActive ? 0.55 : 1;

  return (
    <motion.div
      layout
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      transition={{ layout: { duration: 0.58, ease: [0.22, 1, 0.36, 1] } }}
      style={{
        flex: flexVal,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        background: (hovered && !anyActive) ? "#0B1A2E" : PANEL,
        borderRight: index < PANELS.length - 1 ? `1px solid ${WHITE06}` : "none",
        display: "flex",
        flexDirection: "column",
        padding: "36px 28px 32px",
        minWidth: 0,
        transition: "background 0.3s ease, flex 0s",
      }}
    >
      {/* Active accent gradient */}
      <motion.div
        animate={{ opacity: isActive ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(${angle}, rgba(56,178,255,.1) 0%, transparent 55%)`,
        }}
      />

      {/* Top shimmer bar */}
      <motion.div
        animate={{ scaleX: isActive ? 1 : 0, opacity: isActive ? 1 : 0 }}
        initial={{ scaleX: 0, opacity: 0 }}
        transition={{ duration: 0.5, delay: isActive ? 0.08 : 0 }}
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${SKY}, ${SKY2})`,
          transformOrigin: "left",
        }}
      />

      {/* Tag */}
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
        color: SKY, textTransform: "uppercase",
        opacity: anyActive && !isActive ? 0.25 : 0.55,
        transition: "opacity 0.3s",
        marginBottom: "auto",
      }}>
        {tag}
      </span>

      {/* Icon */}
      <motion.div
        animate={{ color: isActive ? SKY : "rgba(235,240,255,0.35)", scale: isActive ? 1.05 : 1 }}
        transition={{ duration: 0.35 }}
        style={{ marginBottom: 14 }}
      >
        <Icon size={28} strokeWidth={1.5} />
      </motion.div>

      {/* Title */}
      <motion.div
        animate={{
          fontSize: isActive ? "10px" : "14px",
          color: isActive ? SKY : WHITE,
          letterSpacing: isActive ? "0.12em" : "0.01em",
        }}
        transition={{ duration: 0.35 }}
        style={{
          fontWeight: isActive ? 600 : 700,
          textTransform: isActive ? "uppercase" : "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          lineHeight: 1.2,
          marginBottom: isActive ? 8 : 0,
        }}
      >
        {title}
      </motion.div>

      {/* Expanded content */}
      <motion.div
        animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 12 }}
        transition={{ duration: 0.38, delay: isActive ? 0.18 : 0 }}
        style={{ overflow: "hidden", pointerEvents: isActive ? "auto" : "none" }}
      >
        <h2 style={{
          fontSize: "clamp(26px, 2.6vw, 40px)",
          fontWeight: 800, lineHeight: 1.1,
          letterSpacing: "-0.03em",
          color: WHITE,
          marginBottom: 18,
          whiteSpace: "pre-line",
        }}>
          {headline}
        </h2>

        <p style={{
          fontSize: 14, color: WHITE55, lineHeight: 1.72,
          marginBottom: 28, maxWidth: 340, fontWeight: 300,
        }}>
          {body}
        </p>

        <PanelCTA label={cta} />
      </motion.div>

      {/* Subtle hover indicator for collapsed panels */}
      {!anyActive && (
        <motion.div
          animate={{ opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "absolute", bottom: 24, right: 20,
            color: "rgba(56,178,255,.5)",
          }}
        >
          <ArrowUpRight size={14} strokeWidth={2} />
        </motion.div>
      )}
    </motion.div>
  );
}

function PanelCTA({ label }: { label: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: hov ? SKY : "transparent",
        border: `1px solid ${SKY}`,
        borderRadius: 100,
        padding: "11px 24px",
        color: hov ? BG : SKY,
        fontSize: 12, fontWeight: 600,
        letterSpacing: "0.07em", textTransform: "uppercase",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.22s ease",
      }}
    >
      {label}
      <ArrowUpRight size={13} strokeWidth={2.5} />
    </button>
  );
}

// ─── Wipe overlay ─────────────────────────────────────────────────────────────
function WipeOverlay({ phase }: { phase: "in" | "out" }) {
  return (
    <motion.div
      initial={{ y: phase === "in" ? "100%" : "0%" }}
      animate={{ y: phase === "in" ? "0%" : "-100%" }}
      transition={{ duration: 0.46, ease: [0.76, 0, 0.24, 1] }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: `linear-gradient(145deg, #1A6FBF 0%, ${SKY} 45%, ${SKY2} 75%, #88EDFF 100%)`,
      }}
    />
  );
}

// ─── Hero section ─────────────────────────────────────────────────────────────
function HeroSection({ onExplore }: { onExplore: () => void }) {
  const [, setLocation] = useLocation();
  const [btnHov, setBtnHov] = useState(false);
  const [signHov, setSignHov] = useState(false);
  const [startHov, setStartHov] = useState(false);

  return (
    <motion.div
      key="hero"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      style={{
        position: "fixed", inset: 0,
        background: BG,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      }}
    >
      <Mesh />

      {/* Header */}
      <header style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "22px 44px",
      }}>
        <motion.img
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          src={logoImage}
          alt="Tapt Pay"
          style={{ height: 30, width: "auto" }}
        />
        <motion.nav
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ display: "flex", alignItems: "center", gap: 28 }}
        >
          <button
            onMouseEnter={() => setSignHov(true)}
            onMouseLeave={() => setSignHov(false)}
            onClick={() => setLocation("/login")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: signHov ? WHITE : WHITE55,
              fontSize: 12, fontWeight: 500,
              letterSpacing: "0.09em", textTransform: "uppercase",
              fontFamily: "inherit",
              transition: "color 0.2s",
            }}
          >
            Sign In
          </button>
          <button
            onMouseEnter={() => setStartHov(true)}
            onMouseLeave={() => setStartHov(false)}
            onClick={() => setLocation("/signup")}
            style={{
              background: startHov ? SKY2 : SKY,
              color: BG,
              border: "none", borderRadius: 100,
              padding: "9px 22px",
              fontSize: 12, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              cursor: "pointer", fontFamily: "inherit",
              transform: startHov ? "scale(1.04)" : "scale(1)",
              transition: "all 0.22s ease",
            }}
          >
            Get Started
          </button>
        </motion.nav>
      </header>

      {/* Main */}
      <main style={{
        flex: 1, position: "relative", zIndex: 5,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "0 24px", gap: 44, textAlign: "center",
      }}>
        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}
        >
          {/* Pill badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: SKYG_SM,
            border: "1px solid rgba(56,178,255,.22)",
            borderRadius: 100, padding: "6px 16px",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: SKY,
              boxShadow: `0 0 8px ${SKY}`,
              display: "inline-block",
            }} />
            <span style={{
              color: SKY, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase",
            }}>
              Software-First Payments
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(50px, 8.5vw, 116px)",
            fontWeight: 900, lineHeight: 0.96,
            letterSpacing: "-0.045em",
            color: WHITE, margin: 0,
          }}>
            Replacing
            <br />
            the{" "}
            <span style={{
              background: `linear-gradient(130deg, ${SKY} 0%, ${SKY2} 55%, #9FEFFF 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Terminal.
            </span>
          </h1>

          {/* Sub */}
          <p style={{
            fontSize: "clamp(14px, 1.7vw, 18px)",
            color: WHITE55, maxWidth: 460,
            lineHeight: 1.65, fontWeight: 300, margin: 0,
          }}>
            No hardware. No legacy contracts. Accept payments instantly — your phone is the terminal.
          </p>
        </motion.div>

        {/* Visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.78 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <HeroVisual />
        </motion.div>

        {/* CTA block */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.62, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        >
          <button
            onMouseEnter={() => setBtnHov(true)}
            onMouseLeave={() => setBtnHov(false)}
            onClick={onExplore}
            style={{
              background: `linear-gradient(130deg, ${SKY} 0%, ${SKY2} 100%)`,
              color: BG, border: "none", borderRadius: 100,
              padding: "15px 42px",
              fontSize: 14, fontWeight: 800,
              letterSpacing: "0.07em", textTransform: "uppercase",
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: btnHov
                ? `0 0 70px rgba(56,178,255,.55), 0 18px 55px rgba(0,0,0,.35)`
                : `0 0 40px rgba(56,178,255,.3), 0 10px 35px rgba(0,0,0,.3)`,
              transform: btnHov ? "scale(1.055) translateY(-3px)" : "scale(1) translateY(0)",
              transition: "all 0.32s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            Explore the Platform
            <ArrowRight size={15} strokeWidth={2.8} />
          </button>
          <p style={{
            color: WHITE25, fontSize: 10,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            No credit card required · Instant setup
          </p>
        </motion.div>
      </main>

      {/* Bottom status bar */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1 }}
        style={{
          position: "relative", zIndex: 5,
          display: "flex", justifyContent: "center",
          gap: 36, padding: "16px 44px",
          borderTop: `1px solid ${WHITE06}`,
        }}
      >
        {[["10k+", "Active Merchants"], ["< 10min", "Onboarding Time"], ["0", "Hardware Required"]].map(([v, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: SKY, letterSpacing: "-0.02em" }}>{v}</div>
            <div style={{ fontSize: 10, color: WHITE25, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </motion.footer>
    </motion.div>
  );
}

// ─── Feature section ──────────────────────────────────────────────────────────
function FeatureSection({ onBack }: { onBack: () => void }) {
  const [active, setActive] = useState<number | null>(null);
  const [backHov, setBackHov] = useState(false);

  return (
    <motion.div
      key="features"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      style={{
        position: "fixed", inset: 0,
        background: BG,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      }}
    >
      {/* Subtle top glow */}
      <div style={{
        position: "absolute", top: -80, left: "50%",
        transform: "translateX(-50%)",
        width: 600, height: 200, borderRadius: "50%",
        background: `radial-gradient(ellipse, rgba(56,178,255,.07) 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Header */}
      <header style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 32px",
        borderBottom: `1px solid ${WHITE06}`,
      }}>
        <button
          onMouseEnter={() => setBackHov(true)}
          onMouseLeave={() => setBackHov(false)}
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: backHov ? WHITE08 : "transparent",
            border: `1px solid ${backHov ? "rgba(235,240,255,.18)" : WHITE06}`,
            borderRadius: 100,
            padding: "8px 18px",
            color: backHov ? WHITE : WHITE55,
            fontSize: 12, fontWeight: 500,
            letterSpacing: "0.06em",
            cursor: "pointer", fontFamily: "inherit",
            transition: "all 0.2s ease",
          }}
        >
          <ChevronLeft size={15} strokeWidth={2.2} />
          Back
        </button>

        <img src={logoImage} alt="Tapt Pay" style={{ height: 26, width: "auto", opacity: 0.6 }} />

        <div style={{ width: 88 }} />
      </header>

      {/* Section heading */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        style={{ padding: "26px 36px 16px", flexShrink: 0 }}
      >
        <span style={{
          color: SKY, fontSize: 10, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase",
        }}>
          The Platform
        </span>
        <h2 style={{
          fontSize: "clamp(22px, 2.8vw, 34px)",
          fontWeight: 800, color: WHITE,
          letterSpacing: "-0.03em",
          margin: "7px 0 0", lineHeight: 1.15,
        }}>
          Everything you need.{" "}
          <span style={{ color: WHITE25 }}>Nothing you don't.</span>
        </h2>
      </motion.div>

      {/* Panels */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.16 }}
        style={{
          flex: 1,
          display: "flex",
          margin: "0 20px 20px",
          borderRadius: 18,
          overflow: "hidden",
          border: `1px solid ${WHITE06}`,
          minHeight: 0,
        }}
      >
        <LayoutGroup>
          {PANELS.map((panel, i) => (
            <Panel
              key={panel.tag}
              panel={panel}
              index={i}
              isActive={active === i}
              anyActive={active !== null}
              onClick={() => setActive(active === i ? null : i)}
            />
          ))}
        </LayoutGroup>
      </motion.div>

      {/* Hint */}
      <AnimatePresence>
        {active === null && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              textAlign: "center", color: WHITE25,
              fontSize: 10, letterSpacing: "0.1em",
              textTransform: "uppercase",
              paddingBottom: 14, flexShrink: 0,
            }}
          >
            Click any panel to explore
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export function LandingPage() {
  const [view, setView] = useState<"hero" | "features">("hero");
  const [wipe, setWipe] = useState<"in" | "out" | null>(null);

  const transition = (next: "hero" | "features") => {
    if (wipe) return;
    setWipe("in");
    setTimeout(() => {
      setView(next);
      setWipe("out");
    }, 460);
    setTimeout(() => setWipe(null), 920);
  };

  return (
    <div style={{ height: "100vh", overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <AnimatePresence mode="wait">
        {view === "hero"
          ? <HeroSection key="hero" onExplore={() => transition("features")} />
          : <FeatureSection key="features" onBack={() => transition("hero")} />
        }
      </AnimatePresence>

      <AnimatePresence>
        {wipe && <WipeOverlay key={`wipe-${wipe}`} phase={wipe} />}
      </AnimatePresence>
    </div>
  );
}

export default LandingPage;
