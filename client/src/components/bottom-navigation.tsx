import { useLocation } from "wouter";
import { useRef, useState, useEffect, useTransition } from "react";

/* ── Colours ── */
const DOCK_BG  = '#02093D'; // darker navy bar
const PILL_BG  = '#02093D'; // indicator pill — same colour, elevation shown by shadow only
const BLUE     = '#58ABFF';
const BLUE_DIM = 'rgba(88,171,255,0.45)';

/* ── Icons ── */
function IcoHome({ c }: { c: string }) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20V9.5z"/><path d="M9 21.5V14h6v7.5"/></svg>;
}
function IcoPerson({ c }: { c: string }) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7.5" r="4"/><path d="M3.5 21c0-4 3.8-7 8.5-7s8.5 3 8.5 7"/></svg>;
}
function IcoTerminal({ c }: { c: string }) {
  return <svg width={22} height={22} viewBox="0 0 32 22" fill="none"><path d="M4 4l6 7-6 7" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 18h13" stroke={c} strokeWidth="2.6" strokeLinecap="round"/></svg>;
}
function IcoAnalytics({ c }: { c: string }) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke={c} strokeWidth="1.7"/><path d="M8 16.5V11" stroke={c} strokeWidth="1.7" strokeLinecap="round"/><path d="M12 16.5V7.5" stroke={c} strokeWidth="1.7" strokeLinecap="round"/><path d="M16 16.5v-3.5" stroke={c} strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
function IcoSettings({ c }: { c: string }) {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.6"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}

/* ── Nav items ── */
const RETAIL_ITEMS = [
  { id: 'home',      path: '/dashboard',    Icon: IcoHome     },
  { id: 'stock',     path: '/stock',        Icon: IcoPerson   },
  { id: 'terminal',  path: '/terminal',     Icon: IcoTerminal },
  { id: 'analytics', path: '/transactions', Icon: IcoAnalytics},
  { id: 'settings',  path: '/settings',     Icon: IcoSettings },
];

const PROPERTY_ITEMS = [
  { id: 'home',      path: '/property',           Icon: IcoHome     },
  { id: 'tenants',   path: '/property/tenants',   Icon: IcoPerson   },
  { id: 'terminal',  path: '/property/terminal',  Icon: IcoTerminal },
  { id: 'analytics', path: '/property/analytics', Icon: IcoAnalytics},
  { id: 'settings',  path: '/settings',           Icon: IcoSettings },
];

const RETAIL_NAV_PATHS = ['/dashboard', '/stock', '/transactions', '/settings', '/terminal'];

function readMode(): 'retail' | 'property' {
  try { return (localStorage.getItem('taptMode') as 'retail' | 'property') || 'retail'; } catch { return 'retail'; }
}
function saveMode(m: string) { try { localStorage.setItem('taptMode', m); } catch {} }

export function BottomNavigation() {
  const [location, setLocation] = useLocation();
  const [, startTransition] = useTransition();

  /* dockRef goes on the 280 px bar — identical to SmartTransitions trackRef.
     The indicator is a child of that bar so its `left` is relative to the bar. */
  const dockRef  = useRef<HTMLDivElement>(null);
  const btnRefs  = useRef<(HTMLButtonElement | null)[]>([]);
  const mounted  = useRef(false);
  const [indLeft,   setIndLeft]   = useState(0);
  const [animating, setAnimating] = useState(false);
  const [mode,      setModeState] = useState<'retail' | 'property'>(readMode);
  const [collapsed, setCollapsed] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Keep stored mode in sync with route */
  useEffect(() => {
    if (location.startsWith('/property')) {
      saveMode('property'); setModeState('property');
    } else if (RETAIL_NAV_PATHS.includes(location) && location !== '/settings') {
      saveMode('retail'); setModeState('retail');
    }
  }, [location]);

  const isPropertyMode = location.startsWith('/property') || mode === 'property';
  const items = isPropertyMode ? PROPERTY_ITEMS : RETAIL_ITEMS;

  const onRetailPage   = RETAIL_NAV_PATHS.includes(location);
  const onPropertyPage = location.startsWith('/property');
  const showNav = onRetailPage || onPropertyPage;

  const activeIdx = items.findIndex(({ path }) => {
    if (path === '/dashboard' || path === '/property') return location === path;
    if (path === '/settings'  || path === '/terminal') return location === path;
    return location === path || location.startsWith(path + '/');
  });

  /* calcLeft measures relative to dockRef (the 280 px bar) — same as SmartTransitions.
     The indicator is a child of that bar so this gives the correct `left` value. */
  const calcLeft = (idx: number) => {
    const btn  = btnRefs.current[Math.max(0, idx)];
    const dock = dockRef.current;
    if (!btn || !dock) return indLeft;
    const b = btn.getBoundingClientRect();
    const d = dock.getBoundingClientRect();
    return b.left - d.left + b.width / 2 - 32.5; // 32.5 = half of 65 px indicator
  };

  /* Exactly mirrors SmartTransitions Dock useEffect */
  useEffect(() => {
    if (!showNav) return;
    const idx = Math.max(0, activeIdx);
    if (!mounted.current) {
      setIndLeft(calcLeft(idx));
      requestAnimationFrame(() => { mounted.current = true; });
      return;
    }
    setAnimating(true);
    setIndLeft(calcLeft(idx));
    const t = setTimeout(() => setAnimating(false), 550);
    return () => clearTimeout(t);
  }, [location]);

  /* Idle collapse — expand on nav use, collapse to pill after 2 s of inactivity */
  const resetIdle = () => {
    setCollapsed(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setCollapsed(true), 2000);
  };
  useEffect(() => {
    if (!showNav) return;
    resetIdle();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [location, showNav]);

  if (!showNav) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      display: 'flex', justifyContent: 'center',
      paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' as any,
      zIndex: 60,
      pointerEvents: 'none',
    }}>
      {/* Outer wrapper — morphs between full dock and a thin collapsed pill */}
      <div
        onTouchStart={resetIdle}
        onMouseMove={resetIdle}
        onClick={collapsed ? resetIdle : undefined}
        style={{
          position: 'relative',
          /* Always 320 wide; height animates 58 → 44 (44px = accessible touch target).
             The visual pill shrinks via the inner dock opacity + a pseudo-pill overlay. */
          width: 320,
          height: collapsed ? 44 : 58,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'auto',
          transition: 'height 0.5s cubic-bezier(0.34,1.56,0.64,1)',
          overflow: 'visible',
        }}
      >
        {/* Collapsed visual pill — a small navy bump centered in the touch area */}
        <div style={{
          position: 'absolute',
          bottom: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          width: collapsed ? 56 : 0,
          height: collapsed ? 4 : 0,
          background: DOCK_BG,
          borderRadius: 999,
          opacity: collapsed ? 1 : 0,
          transition: 'width 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
          pointerEvents: 'none',
        }} />

        {/* 280 px dock bar — ref goes here, indicator is a child (same as SmartTransitions) */}
        <div ref={dockRef} style={{
          position: 'relative',
          width: 280,
          height: 48,
          background: DOCK_BG,
          borderRadius: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 16px',
          overflow: 'visible',
          opacity: collapsed ? 0 : 1,
          transform: collapsed ? 'scale(0.85)' : 'scale(1)',
          transition: 'opacity 0.3s ease, transform 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          pointerEvents: collapsed ? 'none' : 'auto',
        }}>
          {/* Indicator pill — child of dock bar, positioned relative to it */}
          <div style={{
            position: 'absolute',
            left: indLeft,
            top: -5,      // same as SmartTransitions .tp-dock-ind
            width: 65,
            height: 58,
            background: PILL_BG,
            borderRadius: 29,
            boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
            willChange: 'left',
            transition: animating ? 'left 0.45s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
            zIndex: 0,
          }} />

          {/* Nav buttons */}
          {items.map(({ id, path, Icon }, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={id}
                ref={el => { btnRefs.current[i] = el; }}
                onClick={() => startTransition(() => setLocation(path))}
                aria-label={id}
                style={{
                  position: 'relative', zIndex: 1,
                  background: 'none', border: 'none',
                  padding: 8, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: isActive ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.25s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon c={isActive ? BLUE : BLUE_DIM} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
