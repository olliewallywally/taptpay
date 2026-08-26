import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { SlidingIndicator, useSlidingIndicator } from "./sliding-indicator";
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
  /* Measurement lives in the shared primitive; the nav keeps its own semantics
     (aria-current="page") and its accepted 260ms duration. */
  const { containerRef: navRef, rect: bubble } =
    useSlidingIndicator<HTMLElement>(`[data-nav-id="${page}"]`, [
      vertical,
      navItems,
    ]);

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
          <SlidingIndicator
            rect={bubble}
            className="dt-slide tapt-desktop-nav-bubble"
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
