import { createContext, useContext, type ReactNode } from "react";
import type { DeviceClass } from "@/hooks/use-device-class";
import { DesktopFrame } from "./DesktopFrame";
import { DesktopShell } from "./DesktopShell";
import { ScaledCanvas } from "./ScaledCanvas";
import type { DesktopChromeRoute } from "./desktop-theme";

/**
 * True when a persistent `DesktopChrome` is already mounted above. Page
 * scaffolds read this to decide whether to draw their own frame: in the app the
 * chrome is hoisted above the router, but a page rendered on its own (unit
 * tests, screenshot fixtures) still needs to supply its own.
 */
const DesktopChromeContext = createContext(false);

export function useHasDesktopChrome(): boolean {
  return useContext(DesktopChromeContext);
}

export interface DesktopChromeProps {
  deviceClass: Exclude<DeviceClass, "mobile">;
  route: DesktopChromeRoute;
  children?: ReactNode;
}

/**
 * The persistent tablet/desktop chrome: the 13" frame, the scaled canvas, and
 * the header + nav — mounted ONCE, above the router.
 *
 * This has to sit outside `PageTransition`: that wrapper keys a `motion.div` on
 * the location, so anything inside it is torn down and rebuilt on every hop.
 * With the frame inside, each navigation also remounted `ScaledCanvas`, which
 * starts at `scale: 0` / `visibility: hidden` until its layout effect measures —
 * blanking the whole window for a frame. That was the flash.
 *
 * Only the page slot below changes between routes; the wordmark and nav never
 * re-render, so the top bar cannot move.
 */
export function DesktopChrome({
  deviceClass,
  route,
  children,
}: DesktopChromeProps) {
  return (
    <DesktopChromeContext.Provider value={true}>
      <DesktopFrame deviceClass={deviceClass}>
        <ScaledCanvas>
          <DesktopShell
            vertical={route.vertical}
            page={route.page}
            showScope={route.showScope}
          >
            {children}
          </DesktopShell>
        </ScaledCanvas>
      </DesktopFrame>
    </DesktopChromeContext.Provider>
  );
}

/**
 * Page-slot Suspense fallback. Deliberately empty: a lazy chunk resolving must
 * never paint a spinner over chrome that is already on screen — the incoming
 * page's own cascade is the only motion the user should see.
 */
export function DesktopPageFallback() {
  return <div className="tapt-desktop-page-fallback" aria-hidden="true" />;
}

export default DesktopChrome;
