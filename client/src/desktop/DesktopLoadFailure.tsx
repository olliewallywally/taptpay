import type { CSSProperties } from "react";
import { DESKTOP_COLORS, DESKTOP_FONT_FAMILY } from "./desktop-theme";

/* The ink of an open settings panel (DesktopSettingsPage's OPEN_INK). */
const PANEL_INK = "#04103A";

/**
 * R1-T9 — what a desktop screen shows, in its own frame, when data it depends on
 * did not load. The alternative it replaces is the problem: a failed request was
 * read as "no data" and drawn as $0, an empty list or "no sales yet".
 *
 * Built only from the desktop palette — no red, green or amber: the state is
 * carried by wording, not a status colour. `tone` matches the surface it sits
 * on: the navy canvas, the light sheet, or an open settings panel (a quiet row in
 * the panel's own ink, like its info notes). One failure is announced once, so
 * only the first message for it carries `role="alert"` (`announce`).
 */
export function DesktopLoadFailure({
  tone,
  title,
  detail,
  onRetry,
  retrying,
  announce = true,
  testId,
}: {
  tone: "canvas" | "sheet" | "panel";
  title: string;
  detail?: string;
  onRetry: () => void;
  retrying: boolean;
  announce?: boolean;
  testId?: string;
}) {
  const onCanvas = tone === "canvas";
  const onPanel = tone === "panel";
  const box: CSSProperties = onPanel
    ? {
        display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginTop: 12, padding: "10px 14px", borderRadius: 10,
        background: "rgba(4,16,58,0.1)", fontFamily: DESKTOP_FONT_FAMILY,
      }
    : {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: onCanvas ? 10 : 12,
        padding: onCanvas ? "6px 0 0" : "28px 0",
        fontFamily: DESKTOP_FONT_FAMILY,
      };
  const heading: CSSProperties = onCanvas
    ? { margin: 0, fontWeight: 700, fontSize: 34, lineHeight: 1.1, letterSpacing: "-0.01em", color: DESKTOP_COLORS.textSoft }
    : onPanel
      ? { margin: 0, fontWeight: 600, fontSize: 12.5, color: PANEL_INK }
      : { margin: 0, fontWeight: 600, fontSize: 13, color: "#8A90A4" };
  const body: CSSProperties = { margin: 0, fontWeight: 300, fontSize: 17, color: DESKTOP_COLORS.navDim };
  const button: CSSProperties = onPanel
    ? {
        flex: "0 0 auto", height: 36, padding: "0 14px", borderRadius: 9999, border: "none",
        background: "rgba(255,255,255,0.3)", color: PANEL_INK,
        fontWeight: 700, fontSize: 12.5, cursor: retrying ? "default" : "pointer", opacity: retrying ? 0.5 : 1,
      }
    : onCanvas
      ? {
          marginTop: 8, padding: "10px 24px", borderRadius: 9999, border: "none",
          background: DESKTOP_COLORS.active, color: DESKTOP_COLORS.canvas,
          fontWeight: 700, fontSize: 13.5, cursor: retrying ? "default" : "pointer", opacity: retrying ? 0.6 : 1,
        }
      : {
          padding: "11px 22px", borderRadius: 9999, background: "transparent",
          border: "1.5px solid #1D48C8", color: "#1D48C8",
          fontWeight: 700, fontSize: 14, cursor: retrying ? "default" : "pointer", opacity: retrying ? 0.6 : 1,
        };

  return (
    <div role={announce ? "alert" : undefined} data-testid={testId} style={box}>
      <p style={heading}>{title}</p>
      {detail && onCanvas && <p style={body}>{detail}</p>}
      <button type="button" onClick={onRetry} disabled={retrying} style={button}>
        {retrying ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
}
