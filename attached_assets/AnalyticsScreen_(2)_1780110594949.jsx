import { useState, useEffect, useRef } from "react";

/* ═══ DESIGN TOKENS ═══ */
const C = {
  base: "#040D6D",
  accent: "#58ABFF",
  accentDim: "rgba(88,171,255,0.3)",
  white: "#FFFFFF",
  sheet: "#F4F4F4",
  handle: "rgba(0,0,0,0.08)",
  textDark: "#1a1a1a",
  textMuted: "rgba(0,0,0,0.35)",
  green: "#22C55E",
  red: "#EF4444",
};

/* ═══ DATA PER TIMEFRAME ═══ */
const DATA = {
  day: {
    total: "$1,245.00",
    primary: [65, 40, 55, 30, 50, 70, 45, 60, 35, 55],
    secondary: [45, 55, 35, 50, 40, 55, 35, 45, 50, 40],
    tipIdx: 7, tip: "$42.00",
  },
  week: {
    total: "$6,340.00",
    primary: [40, 55, 35, 60, 45, 70, 50, 65, 38, 58],
    secondary: [55, 40, 50, 35, 55, 42, 60, 48, 52, 42],
    tipIdx: 7, tip: "$69.00",
  },
  month: {
    total: "$24,890.00",
    primary: [30, 45, 55, 40, 65, 50, 70, 55, 45, 60],
    secondary: [50, 35, 45, 55, 40, 55, 45, 60, 50, 45],
    tipIdx: 6, tip: "$312.00",
  },
  year: {
    total: "$142,500.00",
    primary: [20, 35, 45, 40, 55, 50, 65, 70, 60, 75],
    secondary: [40, 30, 35, 45, 40, 45, 50, 55, 48, 55],
    tipIdx: 9, tip: "$1,840.00",
  },
};

const TX = {
  today: [
    { id: "HL", name: "Honey Latte", time: "10:30 AM", amount: "+$6.99", status: "Paid", positive: true },
    { id: "BM", name: "Berry Muffin", time: "08:25 AM", amount: "+$12.00", status: "Paid", positive: true },
    { id: "CI", name: "Custom Item", time: "09:45 AM", amount: "+$25.00", status: "Paid", positive: true },
  ],
  yesterday: [
    { id: "OW", name: "Oat Flat White", time: "29 May, 2026", amount: "+$5.50", status: "Paid", positive: true },
    { id: "SC", name: "Salad Combo", time: "29 May, 2026", amount: "+$14.50", status: "Paid", positive: true },
    { id: "RF", name: "Refund — Pastry", time: "29 May, 2026", amount: "-$3.25", status: "Refund", positive: false },
  ],
};

/* ═══ CUBIC BEZIER SVG PATHS ═══ */
function toSmooth(pts, W, H, pad = 8) {
  const n = pts.length;
  const sx = (W - pad * 2) / (n - 1);
  const coords = pts.map((v, i) => ({ x: pad + i * sx, y: pad + ((100 - v) / 100) * (H - pad * 2) }));
  let d = `M${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  return { d, coords };
}

function toArea(pts, W, H, pad = 8) {
  const { d } = toSmooth(pts, W, H, pad);
  return d + ` L${W - pad},${H} L${pad},${H} Z`;
}

/* ═══ CHART ═══ */
function RevenueChart({ data, animKey }) {
  const W = 342, H = 100, pad = 8;
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    setReveal(false);
    const t = setTimeout(() => setReveal(true), 80);
    return () => clearTimeout(t);
  }, [animKey]);

  const { d: pLine, coords: pCoords } = toSmooth(data.primary, W, H, pad);
  const { d: sLine } = toSmooth(data.secondary, W, H, pad);
  const pArea = toArea(data.primary, W, H, pad);
  const sArea = toArea(data.secondary, W, H, pad);

  const tipPt = pCoords[data.tipIdx];

  return (
    <div style={{ position: "relative", margin: "8px 0 4px", padding: "0 4px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: "block" }}>
        <defs>
          <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={C.accent} stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.08" />
            <stop offset="100%" stopColor={C.accent} stopOpacity="0.0" />
          </linearGradient>
          <clipPath id="rc">
            <rect x="0" y="0" width={reveal ? W : 0} height={H}
              style={{ transition: `width 1.6s cubic-bezier(0.22,1,0.36,1)` }} />
          </clipPath>
        </defs>

        {/* Grid */}
        {[20, 40, 60, 80].map(y => (
          <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="rgba(88,171,255,0.06)" strokeWidth="0.5" />
        ))}

        <g clipPath="url(#rc)">
          {/* Secondary */}
          <path d={sArea} fill="url(#ag2)" />
          <path d={sLine} fill="none" stroke={C.accentDim} strokeWidth="1.5" strokeLinecap="round" />

          {/* Primary */}
          <path d={pArea} fill="url(#ag1)" />
          <path d={pLine} fill="none" stroke={C.accent} strokeWidth="2.2" strokeLinecap="round" />

          {/* Tooltip line */}
          <line x1={tipPt.x} y1={tipPt.y} x2={tipPt.x} y2={H}
            stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="2 2" />

          {/* Tooltip dot */}
          <circle cx={tipPt.x} cy={tipPt.y} r="8" fill="rgba(88,171,255,0.15)" />
          <circle cx={tipPt.x} cy={tipPt.y} r="4" fill={C.white} stroke={C.accent} strokeWidth="2" />
        </g>
      </svg>

      {/* Tooltip tag */}
      <div style={{
        position: "absolute",
        left: `${(tipPt.x / W) * 100}%`,
        top: `${(tipPt.y / H) * 100 - 18}%`,
        transform: "translate(-50%, -100%)",
        background: C.accent,
        color: C.base,
        padding: "4px 10px",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
        boxShadow: "0 4px 12px rgba(88,171,255,0.3)",
        opacity: reveal ? 1 : 0,
        transition: "opacity 0.5s ease 1.2s",
      }}>
        {data.tip}
      </div>

      {/* Bottom scrubber */}
      <div style={{
        position: "absolute",
        left: `${(tipPt.x / W) * 100}%`,
        bottom: -6,
        transform: "translateX(-50%)",
        width: 12, height: 12,
        borderRadius: "50%",
        background: C.white,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        opacity: reveal ? 1 : 0,
        transition: "opacity 0.3s ease 1s",
      }} />
    </div>
  );
}

/* ═══ TRANSACTION ROW ═══ */
function Row({ tx, delay = 0 }) {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVis(true), 400 + delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "14px 0",
      borderBottom: "1px solid rgba(0,0,0,0.04)",
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0) scale(1)" : "translateY(8px) scale(0.98)",
      transition: "all 0.5s cubic-bezier(0.34,1.56,0.64,1)",
    }}>
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: C.sheet,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color: C.base,
        flexShrink: 0,
      }}>
        {tx.id}
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: C.textDark, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.name}</p>
        <p style={{ fontSize: 11, color: C.textMuted, margin: 0, marginTop: 2 }}>{tx.time}</p>
      </div>
      {/* Amount */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: tx.positive ? C.green : C.red, margin: 0, fontVariantNumeric: "tabular-nums" }}>{tx.amount}</p>
        <p style={{ fontSize: 10, color: C.textMuted, margin: 0, marginTop: 1 }}>{tx.status}</p>
      </div>
    </div>
  );
}

/* ═══ MAIN ═══ */
export default function AnalyticsScreen() {
  const [tf, setTf] = useState("week");
  const [totVis, setTotVis] = useState(true);
  const d = DATA[tf];

  const switchTf = (p) => {
    if (p === tf) return;
    setTotVis(false);
    setTimeout(() => { setTf(p); setTotVis(true); }, 150);
  };

  return (
    <div style={{
      width: "100%", maxWidth: 390, margin: "0 auto",
      height: "100vh", height: "100svh",
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: C.base,
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');.scroll-hide::-webkit-scrollbar{display:none}.scroll-hide{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      {/* ═══ DARK TOP ═══ */}
      <div style={{ padding: "52px 24px 0", flexShrink: 0 }}>

        {/* Status bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.white }}>9:41</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <svg width="16" height="12" viewBox="0 0 16 12"><rect x="0" y="4" width="3" height="8" rx="0.5" fill="rgba(255,255,255,0.4)"/><rect x="4" y="2.5" width="3" height="9.5" rx="0.5" fill="rgba(255,255,255,0.4)"/><rect x="8" y="1" width="3" height="11" rx="0.5" fill="rgba(255,255,255,0.6)"/><rect x="12" y="0" width="3" height="12" rx="0.5" fill={C.white}/></svg>
            <svg width="16" height="11" viewBox="0 0 24 16" fill="none" stroke={C.white} strokeWidth="1.5"><path d="M1 5.5a11.5 11.5 0 0122 0"/><path d="M5 9.5a7 7 0 0114 0"/><circle cx="12" cy="14" r="1.5" fill={C.white}/></svg>
            <svg width="22" height="11" viewBox="0 0 28 13"><rect x="0" y="1" width="24" height="11" rx="3" stroke="rgba(255,255,255,0.35)" strokeWidth="1" fill="none"/><rect x="25" y="4" width="2" height="5" rx="1" fill="rgba(255,255,255,0.2)"/><rect x="1.5" y="2.5" width="18" height="8" rx="2" fill={C.green}/></svg>
          </div>
        </div>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.white, margin: 0, letterSpacing: "-0.5px" }}>Statistic</h1>
          <div style={{ display: "flex", gap: 8 }}>
            {["M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z", "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"].map((path, i) => (
              <button key={i} style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(255,255,255,0.08)",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.white} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
              </button>
            ))}
          </div>
        </div>

        {/* Period pills */}
        <div style={{
          display: "flex", gap: 0,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 999, padding: 3,
          marginBottom: 20,
        }}>
          {["day", "week", "month", "year"].map(p => (
            <button key={p} onClick={() => switchTf(p)} style={{
              flex: 1, padding: "8px 0",
              borderRadius: 999, border: "none",
              fontSize: 13, fontWeight: tf === p ? 600 : 500,
              textTransform: "capitalize",
              background: tf === p ? C.accent : "transparent",
              color: tf === p ? C.base : "rgba(255,255,255,0.4)",
              transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}>
              {p}
            </button>
          ))}
        </div>

        {/* Total */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <p style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.4)", margin: 0, letterSpacing: "0.04em" }}>Total Revenue</p>
          <p style={{
            fontSize: 46, fontWeight: 700, color: C.white, margin: 0,
            letterSpacing: "-2px", marginTop: 6,
            fontVariantNumeric: "tabular-nums",
            opacity: totVis ? 1 : 0,
            transform: totVis ? "translateY(0)" : "translateY(6px)",
            transition: "all 0.45s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            {d.total}
          </p>
        </div>

        {/* Chart */}
        <RevenueChart data={d} animKey={tf} />
      </div>

      {/* ═══ WHITE SHEET ═══ */}
      <div className="scroll-hide" style={{
        flex: 1,
        background: C.sheet,
        borderRadius: "32px 32px 0 0",
        marginTop: 12,
        padding: "0 24px 48px",
        overflow: "auto",
        position: "relative",
        zIndex: 2,
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 5, borderRadius: 3, background: C.handle, margin: "14px auto 22px" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.textDark, margin: 0, letterSpacing: "-0.4px" }}>Transaction History</h2>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.accent, cursor: "pointer" }}>View all →</span>
        </div>

        {/* TODAY */}
        <p style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>Today</p>
        {TX.today.map((tx, i) => <Row key={tx.id} tx={tx} delay={i * 55} />)}

        {/* YESTERDAY */}
        <p style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6, marginTop: 20 }}>Yesterday</p>
        {TX.yesterday.map((tx, i) => <Row key={tx.id} tx={tx} delay={(i + 3) * 55} />)}
      </div>
    </div>
  );
}
