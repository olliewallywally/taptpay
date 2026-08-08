// @ts-nocheck — ported verbatim from the July 2026 prototype export; inline
// styles use string values (fontWeight:"500", rows:"3", …) for 1:1 fidelity.
import { useEffect } from 'react';
import './landing.css';
import { PLANS, formatPlanPrice } from "@shared/plans";

export interface LandingPageProps {
  /** hero coin density (0.4–2) */
  coinDensity?: number;
  defaultIndustry?: 'property' | 'trades' | 'retail';
  reducedMotion?: boolean;
}

/**
 * Taptpay marketing landing page.
 * Markup is kept in this single component intentionally: the runtime's
 * scroll rig spans every section (shared scroll-linked camera + progress
 * state), so splitting sections into files would only scatter ids it
 * queries. All behavior lives in ./landingRuntime.ts.
 * Mount once as a full page (e.g. a wouter route).
 */
export function LandingPage({ coinDensity = 1.4, defaultIndustry = 'property', reducedMotion = false }: LandingPageProps) {
  useEffect(() => {
    // The runtime pulls in three.js (~1.2 MB min), so it's loaded on demand:
    // the static markup paints immediately and the scroll/3D rig attaches a
    // beat later. Keeping it out of the entry chunk means app users who never
    // see the landing page never download three.js.
    let cancelled = false;
    import('./landingRuntime').then(({ LandingRuntime }) => {
      if (cancelled) return;
      const rt = new LandingRuntime({ coinDensity, defaultIndustry, reducedMotion });
      rt.init();
    });
    // Prototype parity: the runtime registers window-level listeners and rAF
    // loops once and does not tear down — mount this page once per app load.
    // The cancelled flag only guards the unmount-before-load race.
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div id="tp-root" style={{ position: "relative", background: "#040D6D", color: "#F4F1E8", fontFamily: "'Outfit',system-ui,sans-serif", fontWeight: "400", WebkitFontSmoothing: "antialiased", overflowX: "clip" }}>
      {' '}
      {/* ====== fixed chrome ====== */}
      {' '}
      <div style={{ position: "fixed", top: "0", left: "0", width: "100%", height: "2px", zIndex: "120", background: "rgba(244,241,232,0.08)" }}>
        {' '}
        <div id="tp-bar" style={{ height: "100%", width: "0%", background: "#5E9DFF" }} />
        {' '}
      </div>
      {' '}
      <div id="tp-grain" style={{ position: "fixed", inset: "0", pointerEvents: "none", zIndex: "95", opacity: "0.04", mixBlendMode: "overlay", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      {' '}
      {/* ====== nav (fades away on scroll) ====== */}
      {' '}
      <nav id="tp-nav" data-screen-label="nav" style={{ position: "fixed", top: "2px", left: "0", width: "100%", zIndex: "110", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px clamp(20px,4vw,48px)", transition: "opacity .4s ease,transform .4s ease" }}>
        {' '}
        <a href="#tp-hero" className="tp-anchor" style={{ textDecoration: "none", display: "flex", alignItems: "baseline", fontSize: "26px", lineHeight: "1", cursor: "pointer" }}>
          {' '}
          <span style={{ fontFamily: "'Larken'", fontWeight: "900", color: "#5E9DFF" }}>{"tapt"}</span>
          <span style={{ fontFamily: "'Larken'", fontWeight: "900", fontStyle: "italic", color: "#5E9DFF" }}>{"pay."}</span>
          {' '}
        </a>
        {' '}
        <div id="tp-nav-links" style={{ display: "flex", alignItems: "center", gap: "clamp(16px,2.2vw,30px)" }}>
          {' '}
          <a href="#tp-story" className="tp-anchor tp-navlink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "14px", letterSpacing: "0.04em", color: "rgba(244,241,232,0.66)", cursor: "pointer", transition: "color .2s ease" }}>{"the tech"}</a>
          {' '}
          <a href="#tp-industries" className="tp-anchor tp-navlink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "14px", letterSpacing: "0.04em", color: "rgba(244,241,232,0.66)", cursor: "pointer", transition: "color .2s ease" }}>{"industries"}</a>
          {' '}
          <a href="#tp-pricing" className="tp-anchor tp-navlink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "14px", letterSpacing: "0.04em", color: "rgba(244,241,232,0.66)", cursor: "pointer", transition: "color .2s ease" }}>{"pricing"}</a>
          {' '}
          <a href="/login" className="tp-navlink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "14px", letterSpacing: "0.04em", color: "rgba(244,241,232,0.66)", cursor: "pointer", transition: "color .2s ease" }}>{"log in"}</a>
          {' '}
          <a href="#tp-contact" className="tp-anchor tp-wire" data-solid="0" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", padding: "11px 22px", borderRadius: "9999px", border: "1.5px solid #5E9DFF", color: "#5E9DFF", background: "transparent", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "14px", cursor: "pointer", transition: "background .25s ease,color .25s ease" }}>{"get started"}</a>
          {' '}
        </div>
        {' '}
        <button id="tp-burger" aria-label="menu" style={{ display: "none", background: "transparent", border: "none", cursor: "pointer", padding: "10px" }}>
          {' '}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F4F1E8" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          {' '}
        </button>
        {' '}
      </nav>
      {' '}
      {/* mobile menu overlay */}
      {' '}
      <div id="tp-menu" style={{ position: "fixed", inset: "0", zIndex: "115", background: "rgba(3,9,74,0.97)", backdropFilter: "blur(14px)", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: "6px", padding: "0 10vw", opacity: "0", pointerEvents: "none", transition: "opacity .35s ease" }}>
        {' '}
        <button id="tp-menu-close" aria-label="close menu" style={{ position: "absolute", top: "20px", right: "20px", background: "transparent", border: "none", cursor: "pointer", padding: "12px" }}>
          {' '}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F4F1E8" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          {' '}
        </button>
        {' '}
        <a href="#tp-story" className="tp-anchor tp-menulink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(32px,8.4vw,50px)", color: "#F4F1E8", padding: "9px 0" }}>{"the tech"}</a>
        {' '}
        <a href="#tp-industries" className="tp-anchor tp-menulink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(32px,8.4vw,50px)", color: "#F4F1E8", padding: "9px 0" }}>{"industries"}</a>
        {' '}
        <a href="#tp-pricing" className="tp-anchor tp-menulink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(32px,8.4vw,50px)", color: "#F4F1E8", padding: "9px 0" }}>{"pricing"}</a>
        {' '}
        <a href="/login" className="tp-menulink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(32px,8.4vw,50px)", color: "rgba(244,241,232,0.7)", padding: "9px 0" }}>{"log in"}</a>
        {' '}
        <a href="#tp-contact" className="tp-anchor tp-menulink" style={{ textDecoration: "none", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "clamp(32px,8.4vw,50px)", color: "#5E9DFF", padding: "9px 0" }}>{"get started"}</a>
        {' '}
      </div>
      {' '}
      {/* ====== ACT 1 · HERO ====== */}
      {' '}
      <section id="tp-hero" data-screen-label="hero" style={{ position: "relative", minHeight: "112vh", overflow: "hidden", display: "flex", alignItems: "center" }}>
        {' '}
        <div style={{ position: "absolute", top: "-20vh", right: "-15vw", width: "60vw", height: "60vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(47,87,255,0.28) 0%,rgba(47,87,255,0) 65%)", pointerEvents: "none" }} />
        {' '}
        <div style={{ position: "absolute", bottom: "-25vh", left: "-18vw", width: "55vw", height: "55vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(94,157,255,0.16) 0%,rgba(94,157,255,0) 65%)", pointerEvents: "none" }} />
        {' '}
        <canvas id="tp-coins" style={{ position: "fixed", inset: "0", width: "100%", height: "100%", display: "block", pointerEvents: "none", zIndex: "0" }} />
        {' '}
        <div id="tp-hero-content" style={{ position: "relative", zIndex: "4", padding: "0 clamp(20px,7vw,9vw)", maxWidth: "1100px", willChange: "transform,opacity" }}>
          {' '}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "26px", height: "124px" }}>
            {' '}
            <span style={{ width: "30px", height: "1px", background: "#5E9DFF", position: "absolute", top: "109.5px", left: "116.5px" }} />
            {' '}
            <span style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.32em", textTransform: "uppercase", color: "#5E9DFF", height: "13px", position: "absolute", top: "104px", left: "165px" }}>{"digital multi-stack payment system"}</span>
            {' '}
          </div>
          {' '}
          <h1 style={{ margin: "0", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(46px,8.4vw,138px)", lineHeight: "0.98", letterSpacing: "-0.03em", color: "#F4F1E8", textWrap: "balance" }}>
            {"payments without"}
            <br />
            <span style={{ color: "#5E9DFF", fontWeight: "400" }}>{"the bullsh*t."}</span>
          </h1>
          {' '}
          <p style={{ margin: "30px 0 0", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "clamp(16px,1.4vw,21px)", lineHeight: "1.65", color: "rgba(244,241,232,0.66)", maxWidth: "31em" }}>
            {"taptpay turns the phone you already own into a full payment terminal — "}
            <span style={{ color: "#F4F1E8", fontWeight: "500" }}>{"and the entire billing system behind it."}</span>
            {" rent, quotes, invoices, point of sale. no hardware, ever."}
          </p>
          {' '}
          <div style={{ marginTop: "40px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
            {' '}
            <a href="#tp-story" className="tp-anchor tp-wire" data-solid="0" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "9px", padding: "15px 28px", borderRadius: "9999px", border: "1.5px solid #5E9DFF", color: "#5E9DFF", background: "transparent", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "15px", cursor: "pointer", transition: "background .25s ease,color .25s ease" }}>
              {"see it in action "}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
              {' '}
            </a>
            {' '}
            <a href="#tp-pricing" className="tp-anchor" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px", padding: "15px 10px", color: "rgba(244,241,232,0.62)", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "15px", cursor: "pointer" }}>
              {`pricing: from ${formatPlanPrice(PLANS.solo.priceCents)} a month · no transaction fees `}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              {' '}
            </a>
            {' '}
          </div>
          {' '}
          <div style={{ marginTop: "56px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 22px", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "12px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(244,241,232,0.4)", maxWidth: "921px" }}>
            {' '}
            <span>{"apple pay"}</span>
            <span style={{ opacity: ".4" }}>{"·"}</span>
            <span>{"google pay"}</span>
            <span style={{ opacity: ".4" }}>{"·"}</span>
            <span>{"afterpay"}</span>
            <span style={{ opacity: ".4" }}>{"·"}</span>
            <span>{"credit & debit cards"}</span>
            <span style={{ opacity: ".4" }}>{"·"}</span>
            <span>{"same-day payouts by windcave"}</span>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
        <div style={{ position: "absolute", bottom: "34px", left: "clamp(20px,7vw,9vw)", zIndex: "4", display: "flex", alignItems: "center", gap: "10px", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "12px", letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(244,241,232,0.45)" }}>
          {' '}
          <span>{"scroll"}</span>
          {' '}
          <span style={{ display: "inline-block", animation: "tpHint 1.6s ease-in-out infinite" }}>{"↓"}</span>
          {' '}
        </div>
        {' '}
      </section>
      {' '}
      {/* ====== ACT 2 · THE CINEMATIC PHONE JOURNEY (3d environment) ====== */}
      {' '}
      <div id="tp-story-wrap" style={{ position: "relative", height: "960vh" }}>
        {' '}
        <div id="tp-story" data-screen-label="the tech · phone journey" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden" }}>
          {' '}
          <div id="tp-cine-vp" style={{ position: "absolute", inset: "0", perspective: "1500px", perspectiveOrigin: "50% 46%" }}>
            {' '}
            <div id="tp-cine-world" style={{ position: "absolute", top: "50%", left: "50%", width: "0", height: "0", transformStyle: "preserve-3d", willChange: "transform" }}>
              {' '}
              {/* ghost words · world objects */}
              {' '}
              <span className="tp-gword" style={{ position: "absolute", top: "0", left: "0", fontFamily: "'Outfit'", fontWeight: "600", fontSize: "clamp(34px,5.2vw,80px)", letterSpacing: "-0.02em", color: "rgba(94,157,255,0.15)", opacity: "0", whiteSpace: "nowrap", willChange: "opacity,transform" }}>{"invoicing"}</span>
              {' '}
              <span className="tp-gword" style={{ position: "absolute", top: "0", left: "0", fontFamily: "'Outfit'", fontWeight: "600", fontSize: "clamp(34px,5.2vw,80px)", letterSpacing: "-0.02em", color: "rgba(94,157,255,0.15)", opacity: "0", whiteSpace: "nowrap", willChange: "opacity,transform" }}>{"terminal"}</span>
              {' '}
              <span className="tp-gword" style={{ position: "absolute", top: "0", left: "0", fontFamily: "'Outfit'", fontWeight: "600", fontSize: "clamp(34px,5.2vw,80px)", letterSpacing: "-0.02em", color: "rgba(94,157,255,0.15)", opacity: "0", whiteSpace: "nowrap", willChange: "opacity,transform" }}>{"rent collection"}</span>
              {' '}
              <span className="tp-gword" style={{ position: "absolute", top: "0", left: "0", fontFamily: "'Outfit'", fontWeight: "600", fontSize: "clamp(34px,5.2vw,80px)", letterSpacing: "-0.02em", color: "rgba(94,157,255,0.15)", opacity: "0", whiteSpace: "nowrap", willChange: "opacity,transform" }}>{"management"}</span>
              {' '}
              {/* THE phone · a real 3d body */}
              {' '}
              <div id="tp-cine-rig" style={{ position: "absolute", top: "0", left: "0", willChange: "transform", transform: "translate3d(0,900px,0) translate(-50%,-50%)" }}>
                {' '}
                <div id="tp-cine-glow" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "175%", height: "122%", borderRadius: "50%", background: "radial-gradient(circle,rgba(94,157,255,0.3) 0%,rgba(94,157,255,0) 70%)", opacity: "0", transition: "opacity 1s ease" }} />
                {' '}
                <div id="tp-cine-turn" style={{ willChange: "transform" }}>
                  {' '}
                  <div id="tp3" style={{ position: "relative", width: "clamp(190px,29vh,306px)", aspectRatio: "473/969" }}>
                    {' '}
                    <div style={{ position: "absolute", left: "50%", top: "103%", width: "130%", height: "24%", transform: "translate(-50%,-50%)", background: "radial-gradient(ellipse 50% 50% at 50% 50%,rgba(1,3,34,0.6) 0%,rgba(1,3,34,0) 70%)", pointerEvents: "none" }} />
                    {' '}
                    <canvas id="tp3-gl" style={{ position: "absolute", left: "50%", top: "50%", width: "230%", height: "124%", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />
                    {' '}
                    <div id="tp3-css" style={{ position: "absolute", inset: "0", perspective: "1100px", perspectiveOrigin: "50% 50%" }}>
                      {' '}
                      <div id="tp3-spin" style={{ position: "absolute", inset: "0", transformStyle: "preserve-3d", willChange: "transform" }}>
                        {' '}
                        <div id="tp3-face" style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden" }}>
                          {' '}
                          <div style={{ position: "absolute", left: "2.75%", right: "2.54%", top: "0.83%", bottom: "0.83%", borderRadius: "13%/6.1%", background: "#050508" }} />
                          {' '}
                          <div className="tp-phone-scale" style={{ position: "absolute", left: "4.4%", right: "4.2%", top: "1.75%", bottom: "1.75%", borderRadius: "11%/5.2%", overflow: "hidden", background: "#fff" }}>
                            {' '}
                            <iframe id="tp-cine-frame" className="tp-app-frame" data-late-src="app/embed.html?mode=property&route=/property" title="taptpay live app" style={{ width: "390px", height: "844px", border: "none", transformOrigin: "top left", pointerEvents: "none", display: "block", background: "#fff" }} />
                            {' '}
                          </div>
                          {' '}
                          <div style={{ position: "absolute", top: "2.5%", left: "50%", transform: "translateX(-50%)", width: "25%", height: "2.9%", borderRadius: "9999px", background: "#05070f", zIndex: "5" }}>
                            {' '}
                            <div style={{ position: "absolute", top: "26%", right: "9%", width: "15%", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(circle at 35% 35%,#1d2b52 0%,#04060f 70%)" }} />
                            {' '}
                          </div>
                          {' '}
                          <div style={{ position: "absolute", left: "2.75%", right: "2.54%", top: "0.83%", bottom: "0.83%", borderRadius: "13%/6.1%", overflow: "hidden", pointerEvents: "none", zIndex: "6" }}>
                            {' '}
                            <div id="tp3-glare" style={{ position: "absolute", top: "-20%", bottom: "-20%", left: "0", width: "55%", background: "linear-gradient(100deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.13) 45%,rgba(255,255,255,0.03) 60%,rgba(255,255,255,0) 100%)", transform: "translateX(-170%) skewX(-14deg)" }} />
                            {' '}
                          </div>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
          {/* intro headlines (screen-space) */}
          {' '}
          <div style={{ position: "absolute", top: "9vh", left: "0", width: "100%", textAlign: "center", padding: "0 6vw", zIndex: "20", pointerEvents: "none" }}>
            {' '}
            <div id="tp-s-head-a" style={{ willChange: "transform,opacity" }}>
              {' '}
              <div style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(244,241,232,0.45)", marginBottom: "16px" }}>{"the tech"}</div>
              {' '}
              <h2 style={{ margin: "0", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(30px,4.4vw,68px)", lineHeight: "1.05", letterSpacing: "-0.02em", color: "#F4F1E8" }}>
                {"every other payment tool"}
                <br />
                {"is built for "}
                <span style={{ fontWeight: "500", color: "#5E9DFF" }}>{"one"}</span>
                {" job."}
              </h2>
              {' '}
            </div>
            {' '}
            <div id="tp-s-head-b" style={{ position: "absolute", top: "0", left: "0", width: "100%", padding: "0 6vw", opacity: "0", willChange: "transform,opacity" }}>
              {' '}
              <div style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.32em", textTransform: "uppercase", color: "#5E9DFF", marginBottom: "16px" }}>{"one app"}</div>
              {' '}
              <h2 style={{ margin: "0", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(30px,4.4vw,68px)", lineHeight: "1.05", letterSpacing: "-0.02em", color: "#F4F1E8" }}>
                {"taptpay collapses the stack"}
                <br />
                <span style={{ fontWeight: "500", color: "#5E9DFF" }}>{"into your phone."}</span>
              </h2>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
          {/* mobile HUD panel */}
          {' '}
          <div id="tp-cine-hud" style={{ position: "absolute", zIndex: "14", bottom: "8vh", left: "5vw", right: "5vw", display: "none", opacity: "0", pointerEvents: "none", maxHeight: "38vh", overflow: "hidden", willChange: "transform,opacity" }} />
          {' '}
          {/* progress */}
          {' '}
          <div id="tp-cine-dots" style={{ position: "absolute", bottom: "5vh", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "8px", zIndex: "20" }} />
          {' '}
          <div id="tp-cine-cap" style={{ position: "absolute", top: "7vh", left: "0", width: "100%", textAlign: "center", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "12px", letterSpacing: "0.3em", textTransform: "uppercase", color: "rgba(244,241,232,0.4)", opacity: "0", transition: "opacity .5s ease", zIndex: "20" }}>{"this is the real app — live in the phone"}</div>
          {' '}
        </div>
        {' '}
      </div>
      {' '}
      {/* ====== ACT 4 · manifesto ====== */}
      {' '}
      <div id="tp-words-wrap" style={{ position: "relative", height: "280vh" }}>
        {' '}
        <div id="tp-words" data-screen-label="why taptpay" style={{ position: "sticky", top: "0", height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {' '}
          <div className="tp-word" style={{ position: "absolute", left: "0", width: "100%", textAlign: "center", padding: "0 4vw", opacity: "0", willChange: "transform,opacity" }}>
            {' '}
            <span style={{ position: "relative", display: "inline-block", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(56px,12vw,190px)", lineHeight: "1", letterSpacing: "-0.04em", color: "#F4F1E8" }}>
              {"no hardware."}
              <span className="tp-wline" style={{ position: "absolute", top: "52%", left: "-2%", height: "clamp(4px,0.6vw,9px)", width: "0%", background: "#5E9DFF", borderRadius: "4px" }} />
            </span>
            {' '}
          </div>
          {' '}
          <div className="tp-word" style={{ position: "absolute", left: "0", width: "100%", textAlign: "center", padding: "0 4vw", opacity: "0", willChange: "transform,opacity" }}>
            {' '}
            <span style={{ position: "relative", display: "inline-block", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(56px,12vw,190px)", lineHeight: "1", letterSpacing: "-0.04em", color: "#F4F1E8" }}>
              {"no chasing."}
              <span className="tp-wline" style={{ position: "absolute", top: "52%", left: "-2%", height: "clamp(4px,0.6vw,9px)", width: "0%", background: "#5E9DFF", borderRadius: "4px" }} />
            </span>
            {' '}
          </div>
          {' '}
          <div className="tp-word" style={{ position: "absolute", left: "0", width: "100%", textAlign: "center", padding: "0 4vw", opacity: "0", willChange: "transform,opacity" }}>
            {' '}
            <span style={{ position: "relative", display: "inline-block", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(56px,12vw,190px)", lineHeight: "1", letterSpacing: "-0.04em", color: "#F4F1E8" }}>
              {"no waiting."}
              <span className="tp-wline" style={{ position: "absolute", top: "52%", left: "-2%", height: "clamp(4px,0.6vw,9px)", width: "0%", background: "#5E9DFF", borderRadius: "4px" }} />
            </span>
            {' '}
          </div>
          {' '}
          <div className="tp-word" style={{ position: "absolute", left: "0", width: "100%", textAlign: "center", padding: "0 4vw", opacity: "0", willChange: "transform,opacity" }}>
            {' '}
            <span style={{ display: "inline-block", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "clamp(56px,12vw,190px)", lineHeight: "1", letterSpacing: "-0.04em", color: "#5E9DFF" }}>{"just your phone."}</span>
            {' '}
            <div style={{ marginTop: "26px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "clamp(14px,1.3vw,18px)", letterSpacing: "0.04em", color: "rgba(244,241,232,0.5)" }}>{"one app. the whole payment stack."}</div>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
      </div>
      {' '}
      {/* ====== ACT 5 · INDUSTRIES ====== */}
      {' '}
      <section id="tp-industries" data-screen-label="industries" style={{ position: "relative", minHeight: "130vh", padding: "16vh clamp(20px,7vw,9vw)", overflow: "hidden" }}>
        {' '}
        <div id="tp-ind-glow" style={{ position: "absolute", top: "20%", right: "-20vw", width: "70vw", height: "70vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(47,87,255,0.22) 0%,rgba(47,87,255,0) 65%)", pointerEvents: "none", transition: "opacity .6s ease" }} />
        {' '}
        <div className="tp-rev" style={{ position: "relative", zIndex: "2", maxWidth: "900px" }}>
          {' '}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "22px" }}>
            {' '}
            <span style={{ width: "30px", height: "1px", background: "#5E9DFF" }} />
            {' '}
            <span style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.32em", textTransform: "uppercase", color: "#5E9DFF" }}>{"industries"}</span>
            {' '}
          </div>
          {' '}
          <h2 style={{ margin: "0", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(36px,5vw,80px)", lineHeight: "1.02", letterSpacing: "-0.02em", color: "#F4F1E8" }}>
            {"built for the way"}
            <br />
            <span style={{ fontWeight: "500", color: "#5E9DFF" }}>{"you get paid."}</span>
          </h2>
          {' '}
        </div>
        {' '}
        <div className="tp-rev" style={{ position: "relative", zIndex: "2", marginTop: "44px", display: "inline-flex", padding: "5px", borderRadius: "9999px", background: "rgba(244,241,232,0.05)", border: "1px solid rgba(244,241,232,0.12)", gap: "5px", flexWrap: "wrap" }}>
          {' '}
          <button id="tp-tab-property" className="tp-tab" data-ind="property" style={{ padding: "13px 26px", borderRadius: "9999px", border: "none", background: "#5E9DFF", color: "#040D6D", fontFamily: "'Outfit'", fontWeight: "600", fontSize: "14px", cursor: "pointer", transition: "background .3s ease,color .3s ease" }}>{"property"}</button>
          {' '}
          <button id="tp-tab-trades" className="tp-tab" data-ind="trades" style={{ padding: "13px 26px", borderRadius: "9999px", border: "none", background: "transparent", color: "rgba(244,241,232,0.6)", fontFamily: "'Outfit'", fontWeight: "600", fontSize: "14px", cursor: "pointer", transition: "background .3s ease,color .3s ease" }}>{"trades"}</button>
          {' '}
          <button id="tp-tab-retail" className="tp-tab" data-ind="retail" style={{ padding: "13px 26px", borderRadius: "9999px", border: "none", background: "transparent", color: "rgba(244,241,232,0.6)", fontFamily: "'Outfit'", fontWeight: "600", fontSize: "14px", cursor: "pointer", transition: "background .3s ease,color .3s ease" }}>{"retail"}</button>
          {' '}
        </div>
        {' '}
        <div id="tp-ind-panel" style={{ position: "relative", zIndex: "2", marginTop: "26px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6vw", transition: "opacity .35s ease,transform .35s ease" }}>
          {' '}
          <div style={{ flex: "1 1 420px", minWidth: "300px" }}>
            {' '}
            <div id="tp-ind-tag" style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(244,241,232,0.45)" }}>{"property management"}</div>
            {' '}
            <h3 id="tp-ind-h" style={{ margin: "14px 0 0", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(28px,3.4vw,52px)", lineHeight: "1.06", letterSpacing: "-0.02em", color: "#F4F1E8" }}>{"rent that collects itself."}</h3>
            {' '}
            <p id="tp-ind-sub" style={{ margin: "20px 0 0", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "clamp(15px,1.25vw,18px)", lineHeight: "1.65", color: "rgba(244,241,232,0.62)", maxWidth: "28em" }}>{"set the schedule once. taptpay invoices every cycle, chases every late payment, and marks every dollar the moment it lands."}</p>
            {' '}
            <div style={{ marginTop: "30px", display: "flex", gap: "clamp(18px,3vw,44px)", flexWrap: "wrap" }}>
              {' '}
              <div>
                <div id="tp-ind-s1v" style={{ fontFamily: "'Outfit'", fontWeight: "700", fontSize: "clamp(26px,2.6vw,38px)", color: "#5E9DFF" }}>{"$0"}</div>
                <div id="tp-ind-s1l" style={{ marginTop: "4px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.5)" }}>{"per transaction"}</div>
              </div>
              {' '}
              <div>
                <div id="tp-ind-s2v" style={{ fontFamily: "'Outfit'", fontWeight: "700", fontSize: "clamp(26px,2.6vw,38px)", color: "#5E9DFF" }}>{"2–10"}</div>
                <div id="tp-ind-s2l" style={{ marginTop: "4px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.5)" }}>{"way rent splits"}</div>
              </div>
              {' '}
              <div>
                <div id="tp-ind-s3v" style={{ fontFamily: "'Outfit'", fontWeight: "700", fontSize: "clamp(26px,2.6vw,38px)", color: "#5E9DFF" }}>{"auto"}</div>
                <div id="tp-ind-s3l" style={{ marginTop: "4px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.5)" }}>{"reminders, never duplicated"}</div>
              </div>
              {' '}
            </div>
            {' '}
            <div id="tp-ind-feats" style={{ marginTop: "30px", display: "flex", flexDirection: "column", gap: "12px" }} />
            {' '}
          </div>
          {' '}
          <div style={{ flex: "1 1 320px", minWidth: "280px", display: "flex", justifyContent: "center" }}>
            {' '}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
              {' '}
              <div className="tp-tilt" style={{ perspective: "1100px" }}>
                {' '}
                <div className="tp-tilt-inner" style={{ transformStyle: "preserve-3d", transition: "transform .25s ease" }}>
                  {' '}
                  <div className="tp-phone" style={{ position: "relative", width: "255px", aspectRatio: "390/844", borderRadius: "clamp(32px,4.2vh,46px)", background: "#0b0b14", padding: "clamp(6px,0.9vh,9px)", boxShadow: "0 40px 70px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(120,140,220,0.35)", top: "-114px", height: "545px" }}>
                    {' '}
                    <div className="tp-phone-scale" style={{ position: "absolute", inset: "clamp(6px,0.9vh,9px)", borderRadius: "clamp(26px,3.4vh,38px)", overflow: "hidden", background: "#fff" }}>
                      {' '}
                      <iframe id="tp-ind-frame" className="tp-app-frame" data-defer-src="app/embed.html?mode=property&route=/property" title="taptpay live app" style={{ width: "390px", height: "844px", border: "none", transformOrigin: "top left", pointerEvents: "none", display: "block", background: "#fff" }} />
                      {' '}
                    </div>
                    {' '}
                  </div>
                  <button className="tp-phone-live" type="button" style={{ padding: "11px 22px", borderRadius: "9999px", border: "1.5px solid #5E9DFF", background: "transparent", color: "#5E9DFF", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "14px", cursor: "pointer", transition: "background .25s ease,color .25s ease", position: "absolute", top: "472px", left: "80px" }}>{"try it live"}</button>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
      </section>
      {' '}
      {/* ====== ACT 6 · PRICING ====== */}
      {' '}
      <section id="tp-pricing" data-screen-label="pricing" style={{ position: "relative", minHeight: "120vh", padding: "18vh clamp(20px,7vw,9vw) 12vh", overflow: "hidden" }}>
        {' '}
        <div style={{ position: "absolute", bottom: "-30vh", right: "-15vw", width: "65vw", height: "65vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(94,157,255,0.14) 0%,rgba(94,157,255,0) 65%)", pointerEvents: "none" }} />
        {' '}
        <div className="tp-rev" style={{ maxWidth: "900px" }}>
          {' '}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "22px" }}>
            {' '}
            <span style={{ width: "30px", height: "1px", background: "#5E9DFF" }} />
            {' '}
            <span style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.32em", textTransform: "uppercase", color: "#5E9DFF" }}>{"pricing"}</span>
            {' '}
          </div>
          {' '}
          <h2 style={{ margin: "0", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(36px,5vw,80px)", lineHeight: "1.02", letterSpacing: "-0.02em", color: "#F4F1E8" }}>
            {"numbers that"}
            <br />
            <span style={{ fontWeight: "500", color: "#5E9DFF" }}>{"end the argument."}</span>
          </h2>
          {' '}
        </div>
        {' '}
        <div style={{ marginTop: "60px", display: "flex", flexWrap: "wrap", gap: "24px", maxWidth: "1150px" }}>
          {' '}
          <div className="tp-rev" style={{ flex: "1 1 400px", minWidth: "300px", padding: "clamp(30px,3.4vw,48px)", borderRadius: "28px", background: "rgba(94,157,255,0.07)", border: "1px solid rgba(94,157,255,0.28)" }}>
            {' '}
            <div style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(244,241,232,0.5)" }}>{"every transaction"}</div>
            {' '}
            <div style={{ marginTop: "18px", display: "flex", alignItems: "baseline", gap: "12px" }}>
              {' '}
              <span style={{ fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(88px,9vw,150px)", lineHeight: "0.9", letterSpacing: "-0.04em", color: "#F4F1E8" }}>{"$0"}</span>
              {' '}
            </div>
            {' '}
            <div style={{ marginTop: "14px", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "clamp(16px,1.4vw,20px)", color: "#5E9DFF" }}>{"no transaction fee. not a cent. not a percentage."}</div>
            {' '}
            <p style={{ margin: "18px 0 0", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "clamp(14px,1.15vw,16px)", lineHeight: "1.6", color: "rgba(244,241,232,0.6)" }}>{"taptpay adds nothing per sale — no flat fee and no percentage. keypad, stock, splits and analytics included."}</p>
            {' '}
          </div>
          {' '}
          <div className="tp-rev" style={{ flex: "1 1 400px", minWidth: "300px", padding: "clamp(30px,3.4vw,48px)", borderRadius: "28px", background: "rgba(94,157,255,0.07)", border: "1px solid rgba(94,157,255,0.28)" }}>
            {' '}
            <div style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(244,241,232,0.5)" }}>{"every vertical"}</div>
            {' '}
            <div style={{ marginTop: "18px", display: "flex", alignItems: "baseline", gap: "12px" }}>
              {' '}
              <span style={{ fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(88px,9vw,150px)", lineHeight: "0.9", letterSpacing: "-0.04em", color: "#F4F1E8" }}>
                {"3"}
                <span style={{ fontSize: "0.5em", color: "#5E9DFF" }}>{"-in-1"}</span>
              </span>
              {' '}
            </div>
            {' '}
            <div style={{ marginTop: "14px", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "clamp(16px,1.4vw,20px)", color: "#5E9DFF" }}>{"retail, property and trades. one subscription."}</div>
            {' '}
            <p style={{ margin: "18px 0 0", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "clamp(14px,1.15vw,16px)", lineHeight: "1.6", color: "rgba(244,241,232,0.6)" }}>
              {"collecting $2,400 rent costs nothing extra — while rent platforms and job apps charge subscriptions "}
              <span style={{ fontStyle: "italic" }}>{"plus"}</span>
              {" card fees for less."}
            </p>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
        {/* subscription tiers */}
        {' '}
        <div className="tp-rev" style={{ marginTop: "54px", maxWidth: "1150px" }}>
          {' '}
          <div style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(244,241,232,0.5)" }}>{"one simple subscription"}</div>
          {' '}
          <div style={{ marginTop: "22px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "16px" }}>
            {' '}
            <div style={{ padding: "26px", borderRadius: "22px", background: "rgba(244,241,232,0.04)", border: "1px solid rgba(244,241,232,0.12)" }}>
              {' '}
              <div style={{ fontFamily: "'Outfit'", fontWeight: "600", fontSize: "15px", color: "#F4F1E8" }}>{PLANS.solo.name.toLowerCase()}</div>
              {' '}
              <div style={{ marginTop: "14px", display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontFamily: "'Outfit'", fontWeight: "300", fontSize: "40px", letterSpacing: "-0.02em", color: "#F4F1E8" }}>{formatPlanPrice(PLANS.solo.priceCents)}</span>
                <span style={{ fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.5)" }}>{"/mo"}</span>
              </div>
              {' '}
              <div style={{ marginTop: "10px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.55)" }}>{PLANS.solo.blurb}</div>
              {' '}
            </div>
            {' '}
            <div style={{ padding: "26px", borderRadius: "22px", background: "rgba(94,157,255,0.08)", border: "1px solid rgba(94,157,255,0.35)" }}>
              {' '}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Outfit'", fontWeight: "600", fontSize: "15px", color: "#F4F1E8" }}>{PLANS.team.name.toLowerCase()}</span>
                {PLANS.team.popular && <span style={{ padding: "5px 12px", borderRadius: "9999px", background: "rgba(94,157,255,0.16)", fontFamily: "'Outfit'", fontWeight: "600", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#5E9DFF" }}>{"most popular"}</span>}
              </div>
              {' '}
              <div style={{ marginTop: "14px", display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontFamily: "'Outfit'", fontWeight: "300", fontSize: "40px", letterSpacing: "-0.02em", color: "#F4F1E8" }}>{formatPlanPrice(PLANS.team.priceCents)}</span>
                <span style={{ fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.5)" }}>{"/mo"}</span>
              </div>
              {' '}
              <div style={{ marginTop: "10px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.55)" }}>{PLANS.team.blurb}</div>
              {' '}
            </div>
            {' '}
            <div style={{ padding: "26px", borderRadius: "22px", background: "rgba(244,241,232,0.04)", border: "1px solid rgba(244,241,232,0.12)" }}>
              {' '}
              <div style={{ fontFamily: "'Outfit'", fontWeight: "600", fontSize: "15px", color: "#F4F1E8" }}>{PLANS.crew.name.toLowerCase()}</div>
              {' '}
              <div style={{ marginTop: "14px", display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontFamily: "'Outfit'", fontWeight: "300", fontSize: "40px", letterSpacing: "-0.02em", color: "#F4F1E8" }}>{formatPlanPrice(PLANS.crew.priceCents)}</span>
                <span style={{ fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.5)" }}>{"/mo"}</span>
              </div>
              {' '}
              <div style={{ marginTop: "10px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.55)" }}>{PLANS.crew.blurb}</div>
              {' '}
            </div>
            {' '}
            <div style={{ padding: "26px", borderRadius: "22px", background: "rgba(244,241,232,0.04)", border: "1px solid rgba(244,241,232,0.12)", display: "flex", flexDirection: "column" }}>
              {' '}
              <div style={{ fontFamily: "'Outfit'", fontWeight: "600", fontSize: "15px", color: "#F4F1E8" }}>{"enterprise"}</div>
              {' '}
              <div style={{ marginTop: "14px", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "30px", letterSpacing: "-0.02em", color: "#F4F1E8" }}>{"let's talk"}</div>
              {' '}
              <div style={{ marginTop: "10px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "13px", color: "rgba(244,241,232,0.55)" }}>{"10+ logins · tailored setup"}</div>
              {' '}
              <a href="#tp-contact" className="tp-anchor tp-wire" data-solid="0" style={{ marginTop: "16px", alignSelf: "flex-start", textDecoration: "none", display: "inline-flex", alignItems: "center", padding: "10px 20px", borderRadius: "9999px", border: "1.5px solid #5E9DFF", color: "#5E9DFF", background: "transparent", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", cursor: "pointer", transition: "background .25s ease,color .25s ease" }}>{"enquire"}</a>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
        <div className="tp-rev" style={{ marginTop: "34px", display: "flex", flexWrap: "wrap", gap: "10px 26px", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "14px", color: "rgba(244,241,232,0.55)" }}>
          {' '}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#5E9DFF" }}>{"✓"}</span>
            {" no terminal to buy"}
          </span>
          {' '}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#5E9DFF" }}>{"✓"}</span>
            {" no lock-in contract"}
          </span>
          {' '}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#5E9DFF" }}>{"✓"}</span>
            {" same-day payouts"}
          </span>
          {' '}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#5E9DFF" }}>{"✓"}</span>
            {" unlimited payment points"}
          </span>
          {' '}
        </div>
        {' '}
      </section>
      {' '}
      {/* ====== ACT 7 · CONTACT ====== */}
      {' '}
      <section id="tp-contact" data-screen-label="contact" style={{ position: "relative", minHeight: "110vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "16vh 8vw 10vh", overflow: "hidden" }}>
        {' '}
        <div style={{ position: "absolute", top: "10%", left: "-18vw", width: "55vw", height: "55vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(47,87,255,0.18) 0%,rgba(47,87,255,0) 65%)", pointerEvents: "none" }} />
        {' '}
        <div style={{ position: "relative", zIndex: "5", width: "100%", maxWidth: "560px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {' '}
          <div className="tp-rev" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "26px" }}>
            {' '}
            <span style={{ width: "30px", height: "1px", background: "#5E9DFF" }} />
            {' '}
            <span style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px", letterSpacing: "0.32em", textTransform: "uppercase", color: "#5E9DFF" }}>{"get in touch"}</span>
            {' '}
          </div>
          {' '}
          <h2 className="tp-rev" style={{ margin: "0", fontFamily: "'Outfit'", fontWeight: "300", fontSize: "clamp(44px,6.4vw,96px)", lineHeight: "1", letterSpacing: "-0.02em", color: "#F4F1E8" }}>{"let’s talk."}</h2>
          {' '}
          <p className="tp-rev" style={{ margin: "26px 0 0", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "clamp(17px,1.5vw,22px)", lineHeight: "1.55", color: "rgba(244,241,232,0.66)", maxWidth: "24em" }}>
            {"ready to throw out your old eftpos machine? "}
            <span style={{ color: "#F4F1E8", fontWeight: "500" }}>{"i’ll get you set up."}</span>
          </p>
          {' '}
          <div className="tp-rev" style={{ marginTop: "44px" }}>
            {' '}
            <div style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "clamp(26px,2.6vw,36px)", color: "#F4F1E8", letterSpacing: "-0.01em" }}>{"oliver leonard"}</div>
            {' '}
          </div>
          {' '}
          <div className="tp-rev" style={{ marginTop: "28px", display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center" }}>
            {' '}
            <a className="tp-wire" data-solid="0" href="tel:0212094672" style={{ display: "inline-flex", alignItems: "center", gap: "9px", padding: "14px 24px", borderRadius: "9999px", background: "transparent", border: "1.5px solid #5E9DFF", color: "#5E9DFF", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "15px", cursor: "pointer", textDecoration: "none", transition: "background .25s ease,color .25s ease" }}>
              {' '}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
              </svg>
              {" 021 209 4672 "}
            </a>
            {' '}
            <a className="tp-wire" data-solid="0" href="mailto:oliverleonard@taptpay.co.nz" style={{ display: "inline-flex", alignItems: "center", gap: "9px", padding: "14px 24px", borderRadius: "9999px", background: "transparent", border: "1.5px solid #5E9DFF", color: "#5E9DFF", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "14px", cursor: "pointer", textDecoration: "none", transition: "background .25s ease,color .25s ease" }}>
              {' '}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              {" oliverleonard@taptpay.co.nz "}
            </a>
            {' '}
          </div>
          {' '}
          <div className="tp-rev" style={{ marginTop: "28px", display: "flex", justifyContent: "center", width: "100%" }}>
            {' '}
            <div id="tpc-form" style={{ width: "248px", height: "58px", borderRadius: "9999px", overflow: "hidden", background: "rgba(244,241,232,0.05)", border: "1.5px solid rgba(94,157,255,0.55)", textAlign: "left" }}>
              {' '}
              <div id="tpc-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", height: "58px", padding: "0 22px 0 26px", cursor: "pointer", flex: "0 0 auto" }}>
                {' '}
                <span style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "15px", color: "#5E9DFF" }}>{"send a message"}</span>
                {' '}
                <svg id="tpc-plus" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5E9DFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform .45s cubic-bezier(.22,1,.36,1)", flex: "0 0 auto" }}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {' '}
              </div>
              {' '}
              <div id="tpc-body" style={{ opacity: "0", pointerEvents: "none" }}>
                {' '}
                <div id="tpc-fields" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "4px 26px 26px" }}>
                  {' '}
                  <input type="text" placeholder="your name" style={{ width: "100%", background: "rgba(244,241,232,0.06)", border: "1px solid rgba(244,241,232,0.14)", borderRadius: "12px", padding: "14px 16px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "15px", color: "#F4F1E8", outline: "none", transition: "border-color .2s ease,background .2s ease" }} />
                  {' '}
                  <input type="email" placeholder="your email" style={{ width: "100%", background: "rgba(244,241,232,0.06)", border: "1px solid rgba(244,241,232,0.14)", borderRadius: "12px", padding: "14px 16px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "15px", color: "#F4F1E8", outline: "none", transition: "border-color .2s ease,background .2s ease" }} />
                  {' '}
                  <textarea placeholder="what do you need?" rows="3" style={{ width: "100%", resize: "none", background: "rgba(244,241,232,0.06)", border: "1px solid rgba(244,241,232,0.14)", borderRadius: "12px", padding: "14px 16px", fontFamily: "'Outfit'", fontWeight: "400", fontSize: "15px", color: "#F4F1E8", outline: "none", transition: "border-color .2s ease,background .2s ease" }} />
                  {' '}
                  <button id="tpc-send" className="tp-wire" data-solid="0" type="button" style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", padding: "15px 24px", marginTop: "4px", borderRadius: "9999px", background: "transparent", border: "1.5px solid #5E9DFF", color: "#5E9DFF", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "15px", cursor: "pointer", transition: "background .25s ease,color .25s ease" }}>
                    {" send message "}
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                    {' '}
                  </button>
                  {' '}
                </div>
                {' '}
                <div id="tpc-thanks" style={{ display: "none", flexDirection: "column", alignItems: "center", gap: "14px", padding: "34px 26px 40px", textAlign: "center" }}>
                  {' '}
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#5E9DFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m8.5 12 2.5 2.5 4.5-5" />
                  </svg>
                  {' '}
                  <div style={{ fontFamily: "'Outfit'", fontWeight: "500", fontSize: "18px", color: "#F4F1E8" }}>{"got it — i’ll be in touch."}</div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
        {/* footer */}
        {' '}
        <div style={{ position: "relative", zIndex: "5", width: "100%", maxWidth: "1150px", marginTop: "14vh", paddingTop: "34px", borderTop: "1px solid rgba(244,241,232,0.1)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "18px" }}>
          {' '}
          <div style={{ display: "flex", alignItems: "baseline", fontSize: "22px", lineHeight: "1" }}>
            {' '}
            <span style={{ fontFamily: "'Larken'", fontWeight: "900", color: "#5E9DFF" }}>{"tapt"}</span>
            <span style={{ fontFamily: "'Larken'", fontWeight: "900", fontStyle: "italic", color: "#5E9DFF" }}>{"pay."}</span>
            {' '}
          </div>
          {' '}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", fontFamily: "'Outfit'", fontWeight: "500", fontSize: "13px" }}>
            {' '}
            <a href="#tp-story" className="tp-anchor" style={{ textDecoration: "none", color: "rgba(244,241,232,0.5)", cursor: "pointer" }}>{"the tech"}</a>
            {' '}
            <a href="#tp-industries" className="tp-anchor" style={{ textDecoration: "none", color: "rgba(244,241,232,0.5)", cursor: "pointer" }}>{"industries"}</a>
            {' '}
            <a href="#tp-pricing" className="tp-anchor" style={{ textDecoration: "none", color: "rgba(244,241,232,0.5)", cursor: "pointer" }}>{"pricing"}</a>
            {' '}
          </div>
          {' '}
          <div style={{ fontFamily: "'Outfit'", fontWeight: "400", fontSize: "12px", letterSpacing: "0.06em", color: "rgba(244,241,232,0.35)" }}>{"all software, no hardware · © 2026 taptpay"}</div>
          {' '}
        </div>
        {' '}
      </section>
      {' '}
    </div>
  );
}

export default LandingPage;
