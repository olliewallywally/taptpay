import { useEffect, useRef, useState } from "react";
import { TRADES_THEME } from "@/lib/trades-theme";

export type TerminalDockMode = "retail" | "property" | "trades";
export type TerminalDockPlacement = "fixed" | "absolute";
type DockIconProps = { c: string };

export type TerminalDockItem = {
  id: string;
  path: string;
  Icon: (props: DockIconProps) => JSX.Element;
};

export type TerminalDockViewProps = {
  mode: TerminalDockMode;
  activeId: string;
  onPick: (item: Pick<TerminalDockItem, "id" | "path">) => void;
  placement?: TerminalDockPlacement;
  collapseAfterMs?: number | null;
};

const DOCK_BG = "#02093D";
const BLUE = "#58ABFF";
const BLUE_DIM = "rgba(88,171,255,0.45)";
const TRADES_DOCK = TRADES_THEME.INK;
const TRADES_ACTIVE = TRADES_THEME.OFFW;
const TRADES_DIM = "rgba(244,244,244,0.5)";

function IcoHome({ c }: DockIconProps) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20V9.5z"/><path d="M9 21.5V14h6v7.5"/></svg>;
}
function IcoPerson({ c }: DockIconProps) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="7.5" r="4"/><path d="M3.5 21c0-4 3.8-7 8.5-7s8.5 3 8.5 7"/></svg>;
}
function IcoBox({ c }: DockIconProps) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>;
}
function IcoTerminal({ c }: DockIconProps) {
  return <svg width={22} height={22} viewBox="0 0 32 22" fill="none" aria-hidden="true"><path d="M4 4l6 7-6 7" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 18h13" stroke={c} strokeWidth="2.6" strokeLinecap="round"/></svg>;
}
function IcoAnalytics({ c }: DockIconProps) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke={c} strokeWidth="1.7"/><path d="M8 16.5V11" stroke={c} strokeWidth="1.7" strokeLinecap="round"/><path d="M12 16.5V7.5" stroke={c} strokeWidth="1.7" strokeLinecap="round"/><path d="M16 16.5v-3.5" stroke={c} strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
function IcoSettings({ c }: DockIconProps) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.6"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}

export const TERMINAL_DOCK_ITEMS: Record<TerminalDockMode, readonly TerminalDockItem[]> = {
  retail: [
    { id: "home", path: "/dashboard", Icon: IcoHome },
    { id: "stock", path: "/stock", Icon: IcoBox },
    { id: "terminal", path: "/terminal", Icon: IcoTerminal },
    { id: "analytics", path: "/transactions", Icon: IcoAnalytics },
    { id: "settings", path: "/settings", Icon: IcoSettings },
  ],
  property: [
    { id: "home", path: "/property", Icon: IcoHome },
    { id: "tenants", path: "/property/tenants", Icon: IcoPerson },
    { id: "terminal", path: "/property/terminal", Icon: IcoTerminal },
    { id: "analytics", path: "/property/analytics", Icon: IcoAnalytics },
    { id: "settings", path: "/settings", Icon: IcoSettings },
  ],
  trades: [
    { id: "home", path: "/trades", Icon: IcoHome },
    { id: "clients", path: "/trades/clients", Icon: IcoPerson },
    { id: "terminal", path: "/trades/terminal", Icon: IcoTerminal },
    { id: "analytics", path: "/trades/analytics", Icon: IcoAnalytics },
    { id: "settings", path: "/settings", Icon: IcoSettings },
  ],
};

const initialNavWidth = () => typeof window === "undefined" ? 320 : Math.min(320, window.innerWidth - 32);

export function TerminalDockView({ mode, activeId, onPick, placement = "fixed", collapseAfterMs = 4_000 }: TerminalDockViewProps) {
  const items = TERMINAL_DOCK_ITEMS[mode];
  const activeIdx = items.findIndex((item) => item.id === activeId);
  const navRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mounted = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [indLeft, setIndLeft] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navWidth, setNavWidth] = useState(initialNavWidth);

  useEffect(() => {
    const onResize = () => setNavWidth(Math.min(320, window.innerWidth - 32));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Phase A of docs/PLAN-2026-08-17-terminal-panels-and-dock.md: publish the
     dock's real footprint so every screen reserves the same number instead of
     the six hand-tuned literals in §1.2.

     It goes on `document.documentElement` deliberately. App.tsx renders
     <Router /> and <BottomNavigation /> as siblings, so a terminal-scoped
     write is invisible to the dock and a dock-scoped one is invisible to the
     terminal — the variable would silently resolve to its initial value on
     exactly the screens that need it.

     Only the fixed placement publishes. The landing page's phone demo mounts
     this dock with placement="absolute" inside a scaled mock; its height is not
     the real chrome and must not become the app's reservation (§4.3 clause 9). */
  useEffect(() => {
    if (placement !== "fixed") return;
    const nav = navRef.current;
    if (!nav || typeof document === "undefined") return;
    const root = document.documentElement;

    const publish = () => {
      const { height } = nav.getBoundingClientRect();
      root.style.setProperty("--dock-h", `${Math.round(height * 100) / 100}px`);
    };
    publish();

    /* The wrapper's height is transitioned, so this fires per frame during a
       collapse and the token tracks it rather than jumping at the end. */
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(nav);

    return () => {
      observer?.disconnect();
      /* Cleared, not left stale: a screen rendered with no dock must not go on
         reserving space for one. */
      root.style.removeProperty("--dock-h");
    };
  }, [placement]);

  const calcLeft = (idx: number) => {
    const button = btnRefs.current[Math.max(0, idx)];
    const dock = dockRef.current;
    if (!button || !dock) return indLeft;
    const buttonRect = button.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    return buttonRect.left - dockRect.left + buttonRect.width / 2 - 32.5;
  };

  useEffect(() => {
    const idx = Math.max(0, activeIdx);
    if (!mounted.current) {
      setIndLeft(calcLeft(idx));
      requestAnimationFrame(() => { mounted.current = true; });
      return;
    }
    setAnimating(true);
    setIndLeft(calcLeft(idx));
    const timer = setTimeout(() => setAnimating(false), 550);
    return () => clearTimeout(timer);
  }, [activeId, mode]);

  const resetIdle = () => {
    setCollapsed(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (collapseAfterMs !== null) idleTimer.current = setTimeout(() => setCollapsed(true), collapseAfterMs);
  };

  useEffect(() => {
    resetIdle();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [activeId, mode, collapseAfterMs]);

  const palette = mode === "trades"
    ? { dock: TRADES_DOCK, active: TRADES_ACTIVE, dim: TRADES_DIM }
    : { dock: DOCK_BG, active: BLUE, dim: BLUE_DIM };

  return (
    <nav ref={navRef} aria-label="Merchant navigation" data-demo-id="terminal-dock" data-terminal-dock-mode={mode} style={{ position: placement, bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))", zIndex: 60, pointerEvents: "none" }}>
      <div onTouchStart={resetIdle} onMouseMove={resetIdle} onClick={collapsed ? resetIdle : undefined} style={{ position: "relative", width: navWidth, height: collapsed ? 44 : 58, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto", transition: "height 0.5s cubic-bezier(0.34,1.56,0.64,1)", overflow: "visible" }}>
        <div aria-hidden="true" style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", width: collapsed ? 56 : 0, height: collapsed ? 4 : 0, background: palette.dock, borderRadius: 999, opacity: collapsed ? 1 : 0, transition: "width 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease", pointerEvents: "none" }} />
        <div ref={dockRef} style={{ position: "relative", width: 280, height: 48, background: palette.dock, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 16px", overflow: "visible", opacity: collapsed ? 0 : 1, transform: collapsed ? "scale(0.85)" : "scale(1)", transition: "opacity 0.3s ease, transform 0.45s cubic-bezier(0.34,1.56,0.64,1)", pointerEvents: collapsed ? "none" : "auto" }}>
          <div aria-hidden="true" style={{ position: "absolute", left: indLeft, top: -5, width: 65, height: 58, background: palette.dock, borderRadius: 29, boxShadow: "0 4px 20px rgba(0,0,0,0.45)", pointerEvents: "none", willChange: "left", transition: animating ? "left 0.45s cubic-bezier(0.34,1.56,0.64,1)" : "none", zIndex: 0 }} />
          {items.map(({ id, path, Icon }, index) => {
            const isActive = index === activeIdx;
            return <button key={id} ref={(element) => { btnRefs.current[index] = element; }} type="button" onClick={() => onPick({ id, path })} aria-label={id} aria-current={isActive ? "page" : undefined} data-demo-id={`dock-${id}`} style={{ position: "relative", zIndex: 1, background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transform: isActive ? "scale(1.15)" : "scale(1)", transition: "transform 0.25s ease", WebkitTapHighlightColor: "transparent" }}><Icon c={isActive ? palette.active : palette.dim} /></button>;
          })}
        </div>
      </div>
    </nav>
  );
}
