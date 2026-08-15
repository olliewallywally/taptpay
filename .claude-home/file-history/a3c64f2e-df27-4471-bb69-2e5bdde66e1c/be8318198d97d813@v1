import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import {
  DESKTOP_NAV_ITEMS,
  DESKTOP_SCOPE_LABELS,
  saveDesktopMode,
  type DesktopPage,
  type DesktopVertical,
} from "./desktop-theme";
import "./desktop.css";

export interface DesktopShellProps {
  children?: ReactNode;
  vertical: DesktopVertical;
  page: DesktopPage;
  scopeLabel?: string;
  showScope?: boolean;
  onScopeClick?: () => void;
}

export function DesktopShell({
  children,
  vertical,
  page,
  scopeLabel = DESKTOP_SCOPE_LABELS[vertical],
  showScope = page !== "settings",
  onScopeClick,
}: DesktopShellProps) {
  const [, setLocation] = useLocation();
  const navItems = DESKTOP_NAV_ITEMS[vertical];
  const navRef = useRef<HTMLElement>(null);
  const [bubble, setBubble] = useState<{ x: number; width: number } | null>(
    null,
  );

  /* Measure the active pill and drive the bubble to it. Layout-effect so the
     bubble is already in place on first paint, and re-measured on resize because
     the nav is inside a scaled canvas whose width follows the viewport. */
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const measure = () => {
      const active = nav.querySelector<HTMLElement>(
        `[data-nav-id="${page}"]`,
      );
      if (!active) return;
      setBubble((current) =>
        current &&
        current.x === active.offsetLeft &&
        current.width === active.offsetWidth
          ? current
          : { x: active.offsetLeft, width: active.offsetWidth },
      );
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [page, vertical, navItems]);

  useEffect(() => {
    saveDesktopMode(vertical);
  }, [vertical]);

  const navigate = (path: string) => {
    saveDesktopMode(vertical);
    setLocation(path);
  };

  return (
    <div
      className="tapt-desktop-canvas"
      data-desktop-page={page}
      data-desktop-vertical={vertical}
    >
      <header className="tapt-desktop-header">
        <span className="tapt-desktop-wordmark" aria-label="taptpay">
          <span>tapt</span>
          <span className="tapt-desktop-wordmark-pay">pay</span>
        </span>

        <nav
          className="tapt-desktop-nav"
          aria-label={`${vertical} app navigation`}
          ref={navRef}
        >
          <span
            className="tapt-desktop-nav-bubble"
            data-ready={bubble ? "true" : "false"}
            style={
              bubble
                ? ({
                    "--bubble-x": `${bubble.x}px`,
                    "--bubble-w": `${bubble.width}px`,
                  } as CSSProperties)
                : undefined
            }
            aria-hidden="true"
          />
          {navItems.map((item) => {
            const active = item.id === page;
            return (
              <button
                key={item.id}
                type="button"
                className="tapt-desktop-nav-item"
                data-nav-id={item.id}
                data-label={item.label}
                aria-current={active ? "page" : undefined}
                aria-label={item.label.toLowerCase()}
                onClick={() => navigate(item.path)}
              >
                <span className="tapt-desktop-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <div className="tapt-desktop-divider" aria-hidden="true" />

      <main className="tapt-desktop-main">
        {showScope ? (
          <button
            type="button"
            className="tapt-desktop-scope"
            aria-label={`${scopeLabel} scope`}
            aria-haspopup="listbox"
            aria-expanded="false"
            onClick={onScopeClick}
          >
            <span>{scopeLabel}</span>
            <svg
              className="tapt-desktop-scope-chevron"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#7FB2FF"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : null}

        <div className="tapt-desktop-page-slot">{children}</div>
      </main>
    </div>
  );
}

export default DesktopShell;
