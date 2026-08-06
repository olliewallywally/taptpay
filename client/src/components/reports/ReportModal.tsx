/* Vertical-agnostic report picker. A bottom-sheet (matching the app's AddTenant/
   action-sheet idiom: navy blurred backdrop, #F4F4F4 sheet sliding up) that lists
   the ReportOptions for whatever vertical mounted it, lets the merchant pick a
   period, and calls onGenerate. It never sees invoice/tenant data — the vertical
   wrapper binds that — so one component serves retail, property and trades. */
import { useState } from "react";
import { createPortal } from "react-dom";

import { timeframeWindow, type Timeframe } from "@/lib/report-utils";
import type { ReportOption, ReportFormat, DateRange } from "@/lib/report-pdf/reports/types";

const M = {
  navy: "#040D6D",
  sky: "#58ABFF",
  sheet: "#F4F4F4",
  gray: "#E9ECF4",
  white: "#FFFFFF",
  ink: "#1a1a1a",
  mute: "rgba(0,0,0,0.45)",
  danger: "#C71A2A",
};

const PRESETS: { tf: Timeframe; label: string }[] = [
  { tf: "day", label: "Today" },
  { tf: "week", label: "This Week" },
  { tf: "month", label: "This Month" },
  { tf: "year", label: "This Year" },
];

export interface ReportModalProps {
  onClose: () => void;
  title?: string;
  options: ReportOption[];
  /** Populates the client selector for reports with needsClient (trades). */
  clients?: { id: string; label: string }[];
  onGenerate: (
    id: string,
    format: ReportFormat,
    args: { range: DateRange; clientId: string | null },
  ) => Promise<void>;
}

export function ReportModal({ onClose, title = "Reports", options, clients, onGenerate }: ReportModalProps) {
  const [closing, setClosing] = useState(false);
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const [preset, setPreset] = useState<Timeframe | "custom">("month");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = options.find((o) => o.id === selectedId);
  const periodOn = selected?.periodFiltered ?? true;

  const close = () => {
    if (busy) return;
    setClosing(true);
    setTimeout(onClose, 300);
  };

  const resolveRange = (): DateRange => {
    if (preset === "custom") {
      return {
        start: cStart ? new Date(cStart + "T00:00:00") : new Date(0),
        end: cEnd ? new Date(cEnd + "T23:59:59.999") : new Date(),
      };
    }
    return timeframeWindow(preset, new Date());
  };

  const generate = async (format: ReportFormat) => {
    if (!selected || busy) return;
    setBusy(format);
    setErr(null);
    try {
      await onGenerate(selected.id, format, { range: resolveRange(), clientId });
      setClosing(true);
      setTimeout(onClose, 300);
    } catch (e: any) {
      setErr(e?.message || "Couldn't generate that report. Please try again.");
      setBusy(null);
    }
  };

  const pill = (on: boolean, enabled: boolean): React.CSSProperties => ({
    padding: "9px 14px",
    borderRadius: 12,
    border: "none",
    cursor: enabled ? "pointer" : "default",
    fontSize: 12.5,
    fontWeight: 600,
    opacity: enabled ? 1 : 0.4,
    background: on ? M.navy : M.gray,
    color: on ? M.white : M.navy,
  });

  const desktopFrame = document.querySelector<HTMLElement>(".tapt-desktop-frame");
  const portalTarget = desktopFrame ?? document.body;

  return createPortal(
    <div
      data-testid="report-modal-layer"
      style={{ position: desktopFrame ? "absolute" : "fixed", inset: 0, zIndex: 1000 }}
    >
      <style>{`
        @keyframes rmUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes rmDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes rmIn   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rmOut  { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4,13,109,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          animation: closing ? "rmOut 0.28s ease both" : "rmIn 0.28s ease both",
        }}
      />

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: M.sheet,
            borderRadius: "28px 28px 0 0",
            maxHeight: "92vh",
            overflowY: "auto",
            animation: closing ? "rmDown 0.3s cubic-bezier(0.4,0,0.2,1) both" : "rmUp 0.38s cubic-bezier(0.16,1,0.3,1) both",
            fontFamily: "'Outfit', system-ui, sans-serif",
          }}
        >
          {/* Handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 2px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.1)" }} />
          </div>

          <div style={{ padding: "12px 22px 40px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <span style={{ fontWeight: 700, fontSize: 20, color: M.navy, letterSpacing: "-0.3px" }}>{title}</span>
              <button
                onClick={close}
                aria-label="Close"
                style={{ width: 32, height: 32, borderRadius: 999, background: M.gray, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={M.navy} strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
              </button>
            </div>

            {/* Report cards */}
            {options.map((o) => {
              const on = o.id === selectedId;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setSelectedId(o.id); setErr(null); }}
                  style={{
                    textAlign: "left",
                    width: "100%",
                    marginBottom: 10,
                    padding: "14px 16px",
                    borderRadius: 16,
                    background: on ? "rgba(88,171,255,0.12)" : M.white,
                    border: `1.5px solid ${on ? M.navy : "transparent"}`,
                    boxShadow: on ? "none" : "0 1px 2px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: M.navy }}>{o.title}</span>
                    <span style={{ display: "flex", gap: 4 }}>
                      {o.formats.map((f) => (
                        <span
                          key={f}
                          style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: on ? M.navy : M.mute, border: `1px solid ${on ? M.navy : "rgba(0,0,0,0.15)"}`, borderRadius: 6, padding: "2px 5px", textTransform: "uppercase" }}
                        >
                          {f}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12.5, color: M.mute, lineHeight: 1.35 }}>{o.description}</div>
                </button>
              );
            })}

            {/* Period */}
            <div style={{ fontSize: 11, fontWeight: 700, color: M.sky, letterSpacing: "0.1em", textTransform: "uppercase", margin: "18px 0 8px" }}>Period</div>
            {periodOn ? (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PRESETS.map((p) => (
                    <button key={p.tf} type="button" onClick={() => setPreset(p.tf)} style={pill(preset === p.tf, true)}>{p.label}</button>
                  ))}
                  <button type="button" onClick={() => setPreset("custom")} style={pill(preset === "custom", true)}>Custom</button>
                </div>
                {preset === "custom" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: M.white, color: M.ink, fontSize: 13, fontFamily: "inherit" }} />
                    <input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: M.white, color: M.ink, fontSize: 13, fontFamily: "inherit" }} />
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: M.mute, background: M.white, borderRadius: 12, padding: "12px 14px" }}>
                This report is a snapshot of your current data.
              </div>
            )}

            {/* Client selector (trades Client Statement) */}
            {selected?.needsClient && clients && clients.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: M.sky, letterSpacing: "0.1em", textTransform: "uppercase", margin: "18px 0 8px" }}>Client</div>
                <select
                  value={clientId ?? ""}
                  onChange={(e) => setClientId(e.target.value || null)}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: M.white, color: M.ink, fontSize: 13.5, fontFamily: "inherit" }}
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              {selected?.formats.includes("csv") && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => generate("csv")}
                  style={{ flex: 1, padding: "15px 0", borderRadius: 16, border: `1.5px solid ${M.navy}`, background: "transparent", color: M.navy, fontWeight: 700, fontSize: 14.5, cursor: busy ? "default" : "pointer", opacity: busy && busy !== "csv" ? 0.5 : 1 }}
                >
                  {busy === "csv" ? "Preparing…" : "Download CSV"}
                </button>
              )}
              {selected?.formats.includes("pdf") && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => generate("pdf")}
                  style={{ flex: 1, padding: "15px 0", borderRadius: 16, border: "none", background: M.navy, color: M.white, fontWeight: 700, fontSize: 14.5, cursor: busy ? "default" : "pointer", opacity: busy && busy !== "pdf" ? 0.5 : 1 }}
                >
                  {busy === "pdf" ? "Generating…" : "Generate PDF"}
                </button>
              )}
            </div>

            {err && <div style={{ marginTop: 12, color: M.danger, fontSize: 12.5, fontWeight: 500 }}>{err}</div>}
          </div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

/* ── Export trigger button (shared by every vertical's header) ─────────── */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function ExportButton({ onClick, tone = "onLight", color, style }: {
  onClick: () => void;
  tone?: "onLight" | "onDark";
  /** Vertical accent for text/border. Defaults to the navy/sky of property + trades;
     retail passes its teal. */
  color?: string;
  style?: React.CSSProperties;
}) {
  const dark = tone === "onDark";
  const hue = color ?? (dark ? "#58ABFF" : "#040D6D");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Export reports"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 13px",
        borderRadius: 999,
        border: `1.5px solid ${withAlpha(hue, dark ? 0.5 : 0.22)}`,
        background: dark ? "rgba(255,255,255,0.08)" : "#FFFFFF",
        color: hue,
        fontFamily: "'Outfit', system-ui, sans-serif",
        fontWeight: 600,
        fontSize: 12.5,
        cursor: "pointer",
        ...style,
      }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="M8 11l4 4 4-4" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      Export
    </button>
  );
}
