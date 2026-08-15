import type { ReactNode } from "react";
import type { DeviceClass } from "@/hooks/use-device-class";
import { DesktopFrame } from "./DesktopFrame";
import { DesktopShell } from "./DesktopShell";
import { ScaledCanvas } from "./ScaledCanvas";
import type { DesktopPage, DesktopVertical } from "./desktop-theme";

export type { DesktopPage, DesktopVertical } from "./desktop-theme";

export interface DesktopRoutePageProps {
  deviceClass: Exclude<DeviceClass, "mobile">;
}

export interface DesktopPageScaffoldProps extends DesktopRoutePageProps {
  vertical: DesktopVertical;
  page: DesktopPage;
  children?: ReactNode;
  /**
   * Content pages (home, terminal, …) render their own scope control inside
   * their column layout to match the design, so they hide the shell's
   * built-in scope button. Defaults to the shell's own rule.
   */
  showScope?: boolean;
}

export function DesktopPageScaffold({
  deviceClass,
  vertical,
  page,
  children,
  showScope,
}: DesktopPageScaffoldProps) {
  return (
    <DesktopFrame deviceClass={deviceClass}>
      <ScaledCanvas>
        <DesktopShell vertical={vertical} page={page} showScope={showScope}>
          {children}
        </DesktopShell>
      </ScaledCanvas>
    </DesktopFrame>
  );
}

export default DesktopPageScaffold;
